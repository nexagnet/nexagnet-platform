import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { DEPLOYMENT_PROFILES } from './deployment-profiles.mjs';
import {
  DeploymentResolutionError,
  RESOLVE_EXIT_CODES,
  resolveDeploymentTarget,
  toStepOutputs,
} from './resolve-deployment-target.mjs';

/**
 * `core.autocrlf=true` tren ban lam viec Windows ket thuc dong bang CRLF, trong khi CI
 * (ubuntu-24.04) va kho git deu la LF. Chuan hoa khi DOC de mot bai do khong con nghia la "may
 * khac" — cung phep chuan hoa ma `deployment-profile-render.contract.test.mjs` va
 * `release-identity.contract.test.mjs` dung.
 *
 * `.gitattributes` chi ghim `*.sh` va `Dockerfile` ve `eol=lf`, nen `.yml`/`.json`/`.mjs` deu ve
 * CRLF tren checkout Windows. Cac mau o duoi viet thang ky tu `\n`, nen thieu buoc nay thi bai do
 * XANH tren CI va DO tren may lap trinh vien — kieu do te hon mot bai do han, vi no day nguoi ta
 * ve phia bo qua cong.
 */
const CRLF = new RegExp(`${String.fromCharCode(13)}${String.fromCharCode(10)}`, 'g');
const read = (path) => readFileSync(path, 'utf8').replace(CRLF, String.fromCharCode(10));

const registry = JSON.parse(read('.github/deployment-targets.json'));
const deployTenant = read('.github/workflows/deploy-tenant.yml');
const reusableDeploy = read('.github/workflows/reusable-deploy-tenant.yml');
const resolverCli = read('deploy/netviet/run-resolve-deployment-target.mjs');
const resolverModule = read('deploy/netviet/resolve-deployment-target.mjs');
const deployCi = read('deploy/netviet/deploy-ci.sh');

function deploymentFor(tenant, environment) {
  return registry.deployments.find(
    (entry) => entry.tenant === tenant && entry.environment === environment,
  );
}

test('registry maps Ultty GD1-test to the current shared VM target only', () => {
  const deployment = deploymentFor('ultty', 'gd1-test');

  assert.ok(deployment, 'ultty/gd1-test must be explicitly registered');
  assert.equal(deployment.target, 'current-shared-vm');
  assert.equal(deployment.githubEnvironment, 'gd1-test');
  assert.equal(deployment.profile, 'ultty-gd1-test');
  assert.equal(deployment.runtimeEnvironment, 'gd1-test');
  assert.equal(registry.targets['current-shared-vm'].vmName, 'netviet');
  assert.equal(registry.targets['current-shared-vm'].gcpProjectId, 'netviet-host-968934832433');
  assert.equal(registry.targets['current-shared-vm'].zone, 'asia-southeast1-b');
});

test('registry preserves existing dev/production deployability but rejects Amico GD1-test', () => {
  for (const tenant of ['ultty', 'amico']) {
    assert.ok(deploymentFor(tenant, 'dev'), `${tenant}/dev must remain deployable`);
    assert.ok(deploymentFor(tenant, 'production'), `${tenant}/production must remain deployable`);
  }

  assert.equal(deploymentFor('amico', 'gd1-test'), undefined);
});

test('production keeps the GitHub environment approval boundary', () => {
  for (const tenant of ['ultty', 'amico']) {
    assert.equal(deploymentFor(tenant, 'production').githubEnvironment, 'production');
  }
});

test('manual deploy workflow exposes gd1-test while reusable workflow validates the registry', () => {
  assert.match(deployTenant, /-\s+gd1-test/);
  // The registry read moved out of the workflow heredoc into a module that tests can call. The
  // wiring is asserted at both ends so neither half can be removed on its own.
  assert.match(reusableDeploy, /node deploy\/netviet\/run-resolve-deployment-target\.mjs/);
  assert.match(resolverCli, /\.github\/deployment-targets\.json/);
  assert.match(resolverModule, /Unsupported deployment target/);
});

test('GD1-test verifies exact-SHA CI and passes fail-closed gate inputs to deploy-ci', () => {
  const preflightIndex = reusableDeploy.indexOf('Verify exact main SHA passed CI');
  // Neo vao `id:` chu khong vao TEN HIEN THI cua buoc. Ten hien thi la van ban cho nguoi doc va
  // no doi that (26/08/2026, khi buoc nay duoc dat ten theo cac tang tin hieu no phu trach);
  // `id` la thu ma cac buoc khac tham chieu, nen doi no la mot thay doi co y thuc.
  const buildIndex = reusableDeploy.indexOf('id: rollout');

  assert.notEqual(preflightIndex, -1, 'workflow must verify exact-SHA CI before GD1-test deploy');
  assert.notEqual(buildIndex, -1, 'workflow must still build and deploy through the existing step');
  assert.ok(preflightIndex < buildIndex, 'CI proof must run before build/push');
  assert.match(reusableDeploy, /GD1_TEST_TARGET_CONFIRMED:/);
  assert.match(reusableDeploy, /GD1_TEST_CI_CONCLUSION:/);
  assert.match(reusableDeploy, /vars\.GD1_TEST_APPROVED_GROUP_HASHES/);
  // The step no longer keys off a registry column. `preflight` was free-form text whose only
  // validation was this `if:`, so a row could switch the whole proof off by naming another value.
  assert.match(reusableDeploy, /if: steps\.target\.outputs\.requires_exact_main_ci == 'true'/);
  assert.equal(reusableDeploy.includes('outputs.preflight'), false);
});

// --- The #180 bypass, as a regression test ----------------------------------------------------

function syntheticRegistry(entry) {
  return {
    schemaVersion: 1,
    targets: {
      'current-shared-vm': {
        vmName: 'netviet',
        gcpProjectId: 'netviet-host-968934832433',
        region: 'asia-southeast1',
        zone: 'asia-southeast1-b',
        primaryTenant: 'ultty',
      },
    },
    deployments: [entry],
  };
}

function refusal(entry, request) {
  try {
    resolveDeploymentTarget(syntheticRegistry(entry), request);
  } catch (error) {
    assert.ok(error instanceof DeploymentResolutionError, 'must refuse with a typed error');
    return error;
  }
  return assert.fail('deployment target must be refused');
}

test('every live registry row resolves, and only gd1-test demands exact-main CI', () => {
  for (const entry of registry.deployments) {
    const plan = resolveDeploymentTarget(registry, {
      tenant: entry.tenant,
      environment: entry.environment,
    });
    assert.equal(plan.stackSlug, entry.stackSlug);
    assert.equal(plan.runtimeEnvironment, entry.runtimeEnvironment);
    assert.equal(plan.requiresExactMainCi, entry.environment === 'gd1-test');
    assert.equal(plan.gate, entry.environment === 'gd1-test' ? 'gd1-test' : 'standard');
    assert.ok(DEPLOYMENT_PROFILES[plan.profileId], 'profile must exist in the closed catalog');
  }
});

test('a gd1-test row naming the standard profile is refused (the #180 bypass)', () => {
  // This exact row resolved with exit 0 on 213af13 and emitted `preflight=standard`, which turned
  // the `Verify exact main SHA passed CI` step off through its `if:`.
  const error = refusal(
    {
      tenant: 'wata',
      environment: 'gd1-test',
      stackSlug: 'wata-gd1-test',
      githubEnvironment: 'gd1-test',
      runtimeEnvironment: 'dev',
      target: 'current-shared-vm',
      profile: 'standard',
    },
    { tenant: 'wata', environment: 'gd1-test' },
  );
  assert.equal(error.exitCode, RESOLVE_EXIT_CODES.profileRejected);
  assert.match(error.message, /gd1-test is gated and profile standard is not/);
});

test('an unknown profile id in the registry is refused before anything is built', () => {
  const error = refusal(
    {
      tenant: 'wata',
      environment: 'dev',
      stackSlug: 'wata',
      githubEnvironment: 'dev',
      runtimeEnvironment: 'dev',
      target: 'current-shared-vm',
      profile: 'transport-preview',
    },
    { tenant: 'wata', environment: 'dev' },
  );
  assert.equal(error.exitCode, RESOLVE_EXIT_CODES.unknownProfile);
  assert.match(error.message, /Unknown deployment profile/);
});

test('a row cannot claim the isolated stack slug while running another environment', () => {
  const error = refusal(
    {
      tenant: 'ultty',
      environment: 'gd1-test',
      stackSlug: 'ultty-gd1-test',
      githubEnvironment: 'gd1-test',
      runtimeEnvironment: 'dev',
      target: 'current-shared-vm',
      profile: 'ultty-gd1-test',
    },
    { tenant: 'ultty', environment: 'gd1-test' },
  );
  assert.equal(error.exitCode, RESOLVE_EXIT_CODES.profileRejected);
  assert.match(error.message, /maps gd1-test to runtime gd1-test, not dev/);
});

test('a stack slug that disagrees with the derivation rule is refused', () => {
  const error = refusal(
    {
      tenant: 'ultty',
      environment: 'gd1-test',
      stackSlug: 'ultty',
      githubEnvironment: 'gd1-test',
      runtimeEnvironment: 'gd1-test',
      target: 'current-shared-vm',
      profile: 'ultty-gd1-test',
    },
    { tenant: 'ultty', environment: 'gd1-test' },
  );
  assert.equal(error.exitCode, RESOLVE_EXIT_CODES.stackSlugMismatch);
});

test('step outputs expose the derived gate and never a registry-authored one', () => {
  const outputs = toStepOutputs(
    resolveDeploymentTarget(registry, { tenant: 'ultty', environment: 'gd1-test' }),
  );
  assert.equal(outputs.requires_exact_main_ci, 'true');
  assert.equal(outputs.deployment_profile, 'ultty-gd1-test');
  assert.equal(outputs.deployment_gate, 'gd1-test');
  assert.equal(Object.prototype.hasOwnProperty.call(outputs, 'preflight'), false);
  assert.equal(
    toStepOutputs(resolveDeploymentTarget(registry, { tenant: 'ultty', environment: 'dev' }))
      .requires_exact_main_ci,
    'false',
  );
});

// --- The rollout layer refuses on its own, not on the workflow's word -------------------------

/**
 * Run `deploy-ci.sh` far enough to reach the gate. Every case here is a REFUSAL, so nothing ever
 * reaches `gcloud`, `docker` or the VM: the script exits before the first of them.
 */
function runDeployCi(env) {
  return spawnSync('bash', ['deploy/netviet/deploy-ci.sh'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GCP_PROJECT_ID: 'netviet-host-968934832433',
      GCP_REGION: 'asia-southeast1',
      GCP_ZONE: 'asia-southeast1-b',
      VM_NAME: 'netviet',
      TENANT: 'ultty',
      GIT_SHA: 'a'.repeat(40),
      ...env,
    },
  });
}

test('rollout refuses a gated environment deployed from a branch, not only from the workflow', () => {
  const result = runDeployCi({ ENVIRONMENT: 'gd1-test', GITHUB_REF: 'refs/heads/feature-x' });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /chi duoc deploy tu refs\/heads\/main/);
});

test('rollout refuses a gated environment whose exact-SHA CI is missing or not successful', () => {
  const missing = runDeployCi({ ENVIRONMENT: 'gd1-test', GITHUB_REF: 'refs/heads/main' });
  assert.equal(missing.status, 64);
  assert.match(missing.stderr, /ket luan 'success'/);

  const failed = runDeployCi({
    ENVIRONMENT: 'gd1-test',
    GITHUB_REF: 'refs/heads/main',
    GD1_TEST_CI_CONCLUSION: 'failure',
  });
  assert.equal(failed.status, 64);
  assert.match(failed.stderr, /ket luan 'success'/);
});

test('rollout refuses a gated environment aliased onto another runtime label', () => {
  // The aliasing shape: the control plane resolved `gd1-test`, but the runtime label says `dev` —
  // which is where deploy-ci.sh derives the REAL compose project, and therefore the volumes.
  const result = runDeployCi({
    ENVIRONMENT: 'dev',
    DEPLOYMENT_ENVIRONMENT_ID: 'gd1-test',
    STACK_SLUG: 'ultty-gd1-test',
    GITHUB_REF: 'refs/heads/main',
    GD1_TEST_CI_CONCLUSION: 'success',
  });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /phai chay duoi dung nhan do/);
});

test('rollout refuses a stack slug that disagrees with the resolved environment', () => {
  const result = runDeployCi({
    ENVIRONMENT: 'gd1-test',
    DEPLOYMENT_ENVIRONMENT_ID: 'gd1-test',
    STACK_SLUG: 'ultty',
    GITHUB_REF: 'refs/heads/main',
    GD1_TEST_CI_CONCLUSION: 'success',
  });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /khac cai suy ra tu ultty\/gd1-test/);
});

test('rollout leaves ungated environments byte-identical: the gate does not fire', () => {
  // `khong-ton-tai` has no tenant pack, so the run stops at the check immediately AFTER the gate.
  // Reaching that check is the proof the gate let it through; the derived slug is the pre-existing
  // one, including production's `-prod` suffix, which this change deliberately does not touch.
  for (const [environmentId, runtimeLabel, expectedSlug] of [
    ['dev', 'dev', 'khong-ton-tai'],
    ['production', 'prod', 'khong-ton-tai-prod'],
  ]) {
    const result = runDeployCi({
      TENANT: 'khong-ton-tai',
      ENVIRONMENT: runtimeLabel,
      DEPLOYMENT_ENVIRONMENT_ID: environmentId,
      STACK_SLUG: 'khong-ton-tai',
      GITHUB_REF: 'refs/heads/main',
    });
    assert.equal(result.status, 1, `${environmentId} must reach the tenant-pack check`);
    assert.match(result.stderr, new RegExp(`gate=ungated`));
    assert.match(result.stderr, new RegExp(`Stack: ${expectedSlug} `));
    assert.match(result.stderr, /Khong tim thay goi khach/);
  }
});

test('the rollout gate is derived from the environment name, not from a workflow flag', () => {
  // A semantic anchor, not a line number: the gate must come from `isGatedEnvironment`, so no
  // input passed down from the workflow can switch it off.
  assert.match(deployCi, /isGatedEnvironment\(process\.env\.DEPLOYMENT_ENVIRONMENT_ID\)/);
  assert.match(deployCi, /if \[\[ "\$\{environment_gate\}" == 'gated' \]\]/);
  // The workflow must hand down the true environment, not only the runtime label.
  assert.match(reusableDeploy, /DEPLOYMENT_ENVIRONMENT_ID: \$\{\{ inputs\.environment \}\}/);
});

// --- KHACH XEM TRUOC CUA NEN TANG: dong registry SONG dau tien di qua co che ho so -------------

test('transport-preview/gd1-test phan giai duoc, va mang DUNG cong cua Ultty', () => {
  const plan = resolveDeploymentTarget(registry, {
    tenant: 'transport-preview',
    environment: 'gd1-test',
  });

  assert.equal(plan.stackSlug, 'transport-preview-gd1-test');
  assert.equal(plan.profileId, 'transport-preview-gd1-test');
  assert.equal(plan.gate, 'gd1-test');
  assert.equal(plan.runtimeEnvironment, 'gd1-test');
  // CONG KHONG DUOC NHE HON. Day la ca diem: mot khach xem truoc di qua DUNG cong ma Ultty di
  // qua — main-only + CI xanh tren dung SHA — chu khong phai mot duong vong nhe hon.
  assert.equal(plan.requiresExactMainCi, true);
  assert.equal(toStepOutputs(plan).requires_exact_main_ci, 'true');
});

test('hop dong bi mat cua ban xem truoc la DUNG nam ten, va roi khoi Ultty hoan toan', () => {
  const plan = resolveDeploymentTarget(registry, {
    tenant: 'transport-preview',
    environment: 'gd1-test',
  });
  const names = plan.secretContract.secretNames;

  // BON ten nen tang + MOT ten cua he thong con `transportDemo`. Liet ke DU thay vi dem: mot con
  // so mot minh no khong noi duoc ten nao vua vao, ma vua vao CAI GI moi la dieu can khoa.
  //
  // Ten thu nam la mat khau nhan vat mau. No o day vi ho so nay phuc vu mot GOI MAU, va vi T8 da
  // chung minh cai gia cua viec khong co no: mot thang du lieu that voi khong mot lai xe nao dang
  // nhap duoc. Khong stack khach nao bi tinh phi cai ten nay — phep giao voi Ultty o duoi la cho
  // dieu do duoc DO, khong phai duoc khang dinh.
  assert.deepEqual(
    [...names].sort(),
    [
      'zalo-transport-preview-gd1-test-api-key',
      'zalo-transport-preview-gd1-test-operator-password',
      'zalo-transport-preview-gd1-test-postgres-admin-password',
      'zalo-transport-preview-gd1-test-transport-demo-driver-password',
      'zalo-transport-preview-gd1-test-zalo-db-password',
    ],
    'hop dong bi mat cua ban xem truoc doi',
  );
  for (const name of names) {
    assert.ok(
      name.startsWith('zalo-transport-preview-gd1-test-'),
      `ten ${name} khong thuoc stack xem truoc`,
    );
  }
  // KHONG mot ten Flowise/DeepSeek nao: ho so khong bat he thong con nao can chung, nen khong ai
  // phai tao ra chung.
  assert.equal(
    names.some((name) => /flowise|deepseek/.test(name)),
    false,
  );
  // Va giao voi Ultty la RONG — cach ly o tang bi mat.
  const ultty = resolveDeploymentTarget(registry, { tenant: 'ultty', environment: 'gd1-test' });
  const overlap = names.filter((name) => ultty.secretContract.secretNames.includes(name));
  assert.deepEqual(overlap, []);
});

test('workflow cho phep chon khach xem truoc, va danh sach van DONG', () => {
  const options = deployTenant.slice(
    deployTenant.indexOf('        options:'),
    deployTenant.indexOf("        default: 'ultty'"),
  );
  assert.match(options, /^ {10}- transport-preview$/m);
  assert.match(options, /^ {10}- ultty$/m);
  // `choice` chu khong phai `string`: mot slug tu do o day se cho phep go bat ky ten nao roi de
  // registry tu choi sau — mot cong nua khong ton gi de giu.
  assert.match(
    deployTenant,
    /tenant:\n {8}description:[^\n]*\n {8}required: true\n {8}type: choice/,
  );
});

test('nhom Zalo duoc duyet KHONG di theo mot ho so khong chay kenh nao', () => {
  // `GD1_TEST_APPROVED_GROUP_HASHES` la bien cua MOI TRUONG gd1-test, nen no den voi MOI lan
  // deploy vao moi truong do — ke ca cua mot tenant khac. Voi ho so khong kenh, do la mot ro ri
  // pham vi: dinh danh nhom da bam cua khach nay di vao bang chung preflight cua stack khac.
  assert.match(
    deployCi,
    /if \[\[ "\$\{PROFILE_CHANNEL\}" == 'none' \]\]; then\n {4}approved_group_hashes=''/,
  );
  assert.match(deployCi, /GD1_TEST_APPROVED_GROUP_HASHES="\$\{approved_group_hashes\}"/);
});

// --- NHA CUNG CAP DEPLOY: Northflank la mot provider, gcp-vm la MAC DINH ----------------------------

const northflankTarget = {
  provider: 'northflank',
  projectId: 'nexagnet-dev',
  apiServiceId: 'api',
  webServiceId: 'web',
};
const previewRow = {
  tenant: 'transport-preview',
  environment: 'gd1-test',
  stackSlug: 'transport-preview-gd1-test',
  githubEnvironment: 'gd1-test',
  runtimeEnvironment: 'gd1-test',
  target: 'northflank-sandbox',
  profile: 'transport-preview-gd1-test',
};
const northflankRegistry = (target = northflankTarget) => ({
  schemaVersion: 1,
  targets: { 'northflank-sandbox': target },
  deployments: [previewRow],
});
const resolvePreview = (target) =>
  resolveDeploymentTarget(northflankRegistry(target), {
    tenant: 'transport-preview',
    environment: 'gd1-test',
  });

function refusalOf(fn) {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof DeploymentResolutionError, 'phai la loi co kieu');
    return error;
  }
  return assert.fail('phai bi tu choi');
}

test('moi hang VM cu van phan giai ra gcp-vm, voi DUNG cac truong GCP va cac khoa output nhu truoc', () => {
  const legacyRows = registry.deployments.filter(
    (entry) => registry.targets[entry.target].provider !== 'northflank',
  );
  assert.ok(legacyRows.length >= 7, 'phai con du cac hang khach tren VM');
  for (const entry of legacyRows) {
    const plan = resolveDeploymentTarget(registry, {
      tenant: entry.tenant,
      environment: entry.environment,
    });
    assert.equal(plan.provider, 'gcp-vm', `${entry.tenant}/${entry.environment}`);
    assert.equal(plan.vmName, 'netviet');
    assert.equal(plan.gcpProjectId, 'netviet-host-968934832433');
    assert.equal(plan.gcpRegion, 'asia-southeast1');
    assert.equal(plan.gcpZone, 'asia-southeast1-b');
    assert.equal(plan.primaryTenant, 'ultty');
    assert.deepEqual(Object.keys(toStepOutputs(plan)).sort(), [
      'deployment_gate',
      'deployment_profile',
      'gcp_project_id',
      'gcp_region',
      'gcp_zone',
      'primary_tenant',
      'provider',
      'requires_exact_main_ci',
      'runtime_environment',
      'stack_slug',
      'target_id',
      'vm_name',
    ]);
    assert.equal(toStepOutputs(plan).provider, 'gcp-vm');
  }
});

test('target KHONG khai provider mac dinh la gcp-vm: hang registry co truoc Phase 3 khong doi ngu nghia', () => {
  const { provider: _omitted, ...withoutProvider } = registry.targets['current-shared-vm'];
  const plan = resolveDeploymentTarget(
    {
      schemaVersion: 1,
      targets: { 'current-shared-vm': withoutProvider },
      deployments: [
        registry.deployments.find((e) => e.tenant === 'ultty' && e.environment === 'dev'),
      ],
    },
    { tenant: 'ultty', environment: 'dev' },
  );
  assert.equal(plan.provider, 'gcp-vm');
  assert.equal(plan.vmName, 'netviet');
});

test('transport-preview/gd1-test phan giai ra Northflank: dung cong cu cua Ultty, KHONG mang truong GCP nao', () => {
  const plan = resolveDeploymentTarget(registry, {
    tenant: 'transport-preview',
    environment: 'gd1-test',
  });
  assert.equal(plan.provider, 'northflank');
  assert.equal(plan.targetId, 'northflank-sandbox');
  assert.equal(plan.northflankProjectId, 'nexagnet-dev');
  assert.equal(plan.northflankApiServiceId, 'api');
  assert.equal(plan.northflankWebServiceId, 'web');
  for (const gcpField of ['vmName', 'gcpProjectId', 'gcpRegion', 'gcpZone', 'primaryTenant']) {
    assert.equal(gcpField in plan, false, `${gcpField} khong duoc ton tai tren plan Northflank`);
  }
  // CONG KHONG DOI: chuyen provider khong lam nhe cong exact-main CI cua gd1-test.
  assert.equal(plan.requiresExactMainCi, true);
  assert.equal(plan.gate, 'gd1-test');
  assert.equal(plan.profileId, 'transport-preview-gd1-test');
  assert.equal(plan.stackSlug, 'transport-preview-gd1-test');

  const outputs = toStepOutputs(plan);
  assert.deepEqual(Object.keys(outputs).sort(), [
    'deployment_gate',
    'deployment_profile',
    'northflank_api_service_id',
    'northflank_project_id',
    'northflank_web_service_id',
    'provider',
    'requires_exact_main_ci',
    'runtime_environment',
    'stack_slug',
    'target_id',
  ]);
  for (const key of Object.keys(outputs)) {
    assert.doesNotMatch(key, /^(gcp_|vm_name|primary_tenant)/, `${key} la khoa GCP`);
  }
  assert.equal(outputs.requires_exact_main_ci, 'true');
});

test('target Northflank khong can (va khong duoc doi) truong GCP nao de phan giai', () => {
  const plan = resolvePreview(northflankTarget);
  assert.equal(plan.provider, 'northflank');
  // Khai kem truong GCP o target northflank cung KHONG lam chung xuat hien tren plan.
  const withGcp = resolvePreview({
    ...northflankTarget,
    vmName: 'netviet',
    gcpProjectId: 'x-y-z-1',
  });
  assert.equal('vmName' in withGcp, false);
  assert.equal('gcpProjectId' in withGcp, false);
});

test('provider la / hoa thuong sai -> bi tu choi voi ma rieng, truoc khi phan giai bat ky thu gi', () => {
  for (const provider of ['azure', 'aws', 'Northflank', 'NORTHFLANK', 'gcp', 'railway', '', 5]) {
    const error = refusalOf(() => resolvePreview({ ...northflankTarget, provider }));
    assert.equal(error.exitCode, RESOLVE_EXIT_CODES.unknownProvider, String(provider));
    assert.match(error.message, /Unsupported deploy provider/);
  }
});

test('target Northflank thieu truong hoac id khong phai slug -> incompleteTarget', () => {
  for (const field of ['projectId', 'apiServiceId', 'webServiceId']) {
    for (const bad of [undefined, '', '   ', null, 7]) {
      const target = { ...northflankTarget, [field]: bad };
      const error = refusalOf(() => resolvePreview(target));
      assert.equal(error.exitCode, RESOLVE_EXIT_CODES.incompleteTarget, `${field}=${String(bad)}`);
      assert.match(error.message, new RegExp(field));
    }
    for (const bad of ['../x', 'a/b', 'A', 'a b', '-a', 'a_b', 'a?x=1', '9a']) {
      const error = refusalOf(() => resolvePreview({ ...northflankTarget, [field]: bad }));
      assert.equal(error.exitCode, RESOLVE_EXIT_CODES.incompleteTarget, `${field}=${bad}`);
      assert.match(error.message, /invalid Northflank id/);
    }
  }
});

test('hang Northflank van phai di qua cong ho so: gd1-test + dung ho so + dung stack slug', () => {
  // Doi hang sang `standard` / sai slug van bi tu choi nhu truoc — provider KHONG la duong vong qua cong.
  const wrongProfile = refusalOf(() =>
    resolveDeploymentTarget(
      { ...northflankRegistry(), deployments: [{ ...previewRow, profile: 'standard' }] },
      { tenant: 'transport-preview', environment: 'gd1-test' },
    ),
  );
  assert.equal(wrongProfile.exitCode, RESOLVE_EXIT_CODES.profileRejected);
  const wrongSlug = refusalOf(() =>
    resolveDeploymentTarget(
      { ...northflankRegistry(), deployments: [{ ...previewRow, stackSlug: 'transport-preview' }] },
      { tenant: 'transport-preview', environment: 'gd1-test' },
    ),
  );
  assert.equal(wrongSlug.exitCode, RESOLVE_EXIT_CODES.stackSlugMismatch);
});

test('CLI resolver in provider; Northflank KHONG in ten bi mat GCP, VM van in nhu cu', () => {
  const run = (tenant, environment) =>
    spawnSync(process.execPath, ['deploy/netviet/run-resolve-deployment-target.mjs'], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        REQUESTED_TENANT: tenant,
        REQUESTED_ENVIRONMENT: environment,
      },
    });
  const preview = run('transport-preview', 'gd1-test');
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /Provider: northflank/);
  assert.match(preview.stdout, /Northflank project nexagnet-dev/);
  assert.match(preview.stdout, /Services: api=api web=web/);
  assert.doesNotMatch(
    preview.stdout,
    /Required secret names|zalo-transport-preview-gd1-test-|netviet/,
  );

  const vm = run('ultty', 'gd1-test');
  assert.equal(vm.status, 0, vm.stderr);
  assert.match(vm.stdout, /Provider: gcp-vm/);
  assert.match(vm.stdout, /Required secret names \(13\):/);
  assert.match(vm.stdout, /on netviet/);
});

test('CLI resolver ghi output GITHUB_OUTPUT dang key=value cho ca hai provider', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nf-resolve-'));
  try {
    const out = join(dir, 'out.txt');
    const result = spawnSync(
      process.execPath,
      ['deploy/netviet/run-resolve-deployment-target.mjs'],
      {
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          REQUESTED_TENANT: 'transport-preview',
          REQUESTED_ENVIRONMENT: 'gd1-test',
          GITHUB_OUTPUT: out,
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const lines = readFileSync(out, 'utf8').trim().split('\n');
    assert.ok(lines.includes('provider=northflank'));
    assert.ok(lines.includes('northflank_project_id=nexagnet-dev'));
    assert.ok(lines.includes('requires_exact_main_ci=true'));
    assert.equal(
      lines.some((line) => /^(gcp_|vm_name|primary_tenant)/.test(line)),
      false,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
