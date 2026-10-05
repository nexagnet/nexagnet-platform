import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

import {
  describeRuntimeContract,
  resolveDeploymentProfile,
} from '../netviet/deployment-profiles.mjs';
import {
  IMAGE_REF_PATTERN,
  PREVIEW_ERRORS,
  PREVIEW_TARGET,
  PreviewDeployError,
  RELEASE_MANIFEST_PATH,
  SERVICE_ROLES,
  assertPreviewRequest,
  buildReleaseManifest,
  buildRuntimeEnvironment,
  buildServicePatch,
} from './preview-contract.mjs';

const SHA = 'a'.repeat(40);
const IMAGE = `ghcr.io/nexagnet/nexagnet-platform/preview@sha256:${'b'.repeat(64)}`;
// Dung luc chay: khong co chuoi literal nao trong repo giong mot credential.
const TOKEN = `nf-${randomBytes(18).toString('hex')}`;

const request = (overrides = {}) => ({
  provider: 'northflank',
  tenant: 'transport-preview',
  environment: 'gd1-test',
  profile: 'transport-preview-gd1-test',
  stackSlug: 'transport-preview-gd1-test',
  gitSha: SHA,
  imageRef: IMAGE,
  projectId: 'nexagnet-dev',
  apiServiceId: 'api',
  webServiceId: 'web',
  githubRef: 'refs/heads/main',
  ciConclusion: 'success',
  token: TOKEN,
  ...overrides,
});

/** Ma loi cua mot yeu cau, hoac `OK`. Khang dinh luon la loi CO KIEU, khong phai Error bat ky. */
function outcome(r) {
  try {
    assertPreviewRequest(r);
  } catch (error) {
    assert.ok(error instanceof PreviewDeployError, `phai la PreviewDeployError: ${error}`);
    return error;
  }
  return { code: 'OK' };
}

test('yeu cau day du va dung muc tieu thi duoc chap nhan', () => {
  assert.equal(outcome(request()).code, 'OK');
});

test('CHI transport-preview/gd1-test duoc nhan: moi muc tieu khac bi tu choi, ke ca production va khach that', () => {
  const rows = [
    {
      tenant: 'ultty',
      environment: 'gd1-test',
      profile: 'ultty-gd1-test',
      stackSlug: 'ultty-gd1-test',
    },
    { tenant: 'ultty', environment: 'production' },
    { tenant: 'amico', environment: 'dev' },
    { tenant: 'wata', environment: 'production' },
    { environment: 'production' },
    { environment: 'prod' },
    { environment: 'dev' },
    { environment: 'GD1-TEST' },
    { tenant: 'Transport-Preview' },
    { tenant: undefined },
    { profile: 'standard' },
    { stackSlug: 'transport-preview' },
  ];
  for (const row of rows) {
    const result = outcome(request(row));
    assert.equal(result.code, PREVIEW_ERRORS.targetNotAllowed, JSON.stringify(row));
  }
});

test('provider khac northflank (gcp-vm, thieu, la) bi tu choi TRUOC moi kiem tra khac', () => {
  for (const provider of ['gcp-vm', 'gcp', 'railway', '', undefined, null, 'Northflank']) {
    assert.equal(
      outcome(request({ provider })).code,
      PREVIEW_ERRORS.providerMismatch,
      String(provider),
    );
  }
  // Thu tu: provider sai + SHA sai van bao provider, khong bao SHA.
  assert.equal(
    outcome(request({ provider: 'gcp-vm', gitSha: 'abc' })).code,
    PREVIEW_ERRORS.providerMismatch,
  );
});

test('git_sha: chi full SHA 40 ky tu chu thuong — ngan, hoa, rong, thieu, dai, ten nhanh deu fail closed', () => {
  for (const gitSha of [
    SHA.slice(0, 12),
    SHA.toUpperCase(),
    '',
    undefined,
    null,
    `${SHA}0`,
    'main',
    123,
  ]) {
    assert.equal(outcome(request({ gitSha })).code, PREVIEW_ERRORS.gitShaInvalid, String(gitSha));
  }
});

test('image: bat buoc ghcr.io + DIGEST; tag, host khac, hoa, chen ky tu la deu bi tu choi', () => {
  const digest = 'b'.repeat(64);
  for (const imageRef of [
    undefined,
    '',
    `ghcr.io/nexagnet/nexagnet-platform/preview:sha-${SHA}`,
    'ghcr.io/nexagnet/nexagnet-platform/preview',
    `docker.io/library/node@sha256:${digest}`,
    `registry.example.com/x/y@sha256:${digest}`,
    `https://ghcr.io/nexagnet/x@sha256:${digest}`,
    `ghcr.io/NexAgnet/x@sha256:${digest}`,
    `ghcr.io/nexagnet/x@sha256:${digest.slice(0, 63)}`,
    `ghcr.io/nexagnet/x@sha256:${digest}0`,
    `ghcr.io/nexagnet/x@sha256:${'g'.repeat(64)}`,
    `ghcr.io/nexagnet/x@sha256:${digest}; rm -rf /`,
    `ghcr.io/nexagnet/x @sha256:${digest}`,
    `ghcr.io/nexagnet/x@sha256:${digest}\nFOO=1`,
    `ghcr.io/@sha256:${digest}`,
  ]) {
    assert.equal(
      outcome(request({ imageRef })).code,
      PREVIEW_ERRORS.imageRefInvalid,
      String(imageRef),
    );
  }
  assert.match(IMAGE, IMAGE_REF_PATTERN);
});

test('id project/service phai la slug Northflank: khong cho chen duong dan hay ky tu la', () => {
  for (const key of ['projectId', 'apiServiceId', 'webServiceId']) {
    for (const value of ['', undefined, '../x', 'a/b', 'A', 'a b', '-a', 'a_b', 'a?b=1']) {
      assert.equal(
        outcome(request({ [key]: value })).code,
        PREVIEW_ERRORS.idInvalid,
        `${key}=${value}`,
      );
    }
  }
});

test('chi deploy tu refs/heads/main va chi khi CI cua DUNG SHA nay ket luan success', () => {
  for (const githubRef of ['refs/heads/feature', 'refs/pull/1/merge', 'main', '', undefined]) {
    assert.equal(
      outcome(request({ githubRef })).code,
      PREVIEW_ERRORS.refNotMain,
      String(githubRef),
    );
  }
  for (const ciConclusion of ['failure', 'cancelled', 'skipped', '', undefined, 'SUCCESS']) {
    assert.equal(
      outcome(request({ ciConclusion })).code,
      PREVIEW_ERRORS.ciNotSuccess,
      String(ciConclusion),
    );
  }
});

test('thieu / rong / chi khoang trang token Northflank -> fail closed, va thong bao KHONG chua token', () => {
  for (const token of [undefined, null, '', '   ', '\n', 42]) {
    const result = outcome(request({ token }));
    assert.equal(result.code, PREVIEW_ERRORS.credentialsMissing, String(token));
  }
  // Mot token CO MAT nhung yeu cau hong o cho khac: token khong duoc vao thong bao loi.
  for (const bad of [
    { gitSha: 'bad' },
    { imageRef: 'bad' },
    { tenant: 'ultty' },
    { provider: 'x' },
  ]) {
    const result = outcome(request(bad));
    assert.notEqual(result.code, 'OK');
    assert.equal(result.message.includes(TOKEN), false);
  }
});

// ---------------------------------------------------------------------------------------------
// BIEN MOI TRUONG, MANIFEST, PATCH
// ---------------------------------------------------------------------------------------------

test('env api suy tu HO SO, khong chep tay: doi ho so thi env doi theo', () => {
  const contract = describeRuntimeContract(resolveDeploymentProfile(PREVIEW_TARGET.profile));
  const env = buildRuntimeEnvironment('api', { webOrigin: 'https://web.example.test' });
  assert.equal(env.PARSER_MODE, contract.PROFILE_PARSER_MODE);
  assert.equal(env.CHANNEL_MODE, contract.PROFILE_CHANNEL_MODE);
  assert.equal(env.ADVICE_COMPOSER, contract.PROFILE_ADVICE_COMPOSER);
  assert.equal(env.AUTO_SEND, contract.PROFILE_AUTO_SEND);
  assert.equal(env.DATA_CLASSIFICATION, contract.PROFILE_DATA_CLASSIFICATION);
  // Khong Zalo that, khong LLM that, khong tu gui, du lieu la du lieu thu.
  assert.deepEqual(
    [env.CHANNEL_MODE, env.AUTO_SEND, env.DATA_CLASSIFICATION, env.AUTH_MODE, env.PERSISTENCE],
    ['mock', 'off', 'test', 'session', 'prisma'],
  );
  assert.equal(env.WORKFLOW_ENGINE, 'off');
  assert.equal(env.OTEL_TRACING, 'off');
  assert.equal(env.NODE_ENV, 'production');
  assert.equal(env.RELEASE_MANIFEST_PATH, RELEASE_MANIFEST_PATH);
});

test('MEDIA_STORE=none la lech CO Y so voi ho so (gcs): nen tang tep tat, khong mat byte nao', () => {
  const profile = resolveDeploymentProfile(PREVIEW_TARGET.profile);
  assert.equal(
    profile.runtime.mediaStore,
    'gcs',
    'ho so van khai gcs — day la khac biet duoc nhan dien',
  );
  assert.equal(buildRuntimeEnvironment('api', {}).MEDIA_STORE, 'none');
  // Khong bien GCS nao lot vao env Northflank.
  for (const role of ['api', 'web']) {
    for (const key of Object.keys(buildRuntimeEnvironment(role, {}))) {
      assert.doesNotMatch(key, /^MEDIA_(BUCKET|GCS_ENDPOINT)$/);
    }
  }
});

test('env khong co bien RONG (bien rong lam sap boot zod) va khong co bi mat', () => {
  for (const role of ['api', 'web']) {
    const env = buildRuntimeEnvironment(role, { webOrigin: 'https://web.example.test' });
    for (const [key, value] of Object.entries(env)) {
      assert.equal(typeof value, 'string', key);
      assert.notEqual(value.trim(), '', `${role}.${key} rong`);
      assert.doesNotMatch(
        key,
        /(PASSWORD|SECRET|TOKEN|API_KEY|DATABASE_URL|CREDENTIAL|PRIVATE)/i,
        `${role}.${key} nghe nhu bi mat — bi mat nam trong secret group cua project`,
      );
    }
  }
});

test('web co API_UPSTREAM noi bo; api nhan origin cong khai cua web (khi da biet)', () => {
  assert.equal(buildRuntimeEnvironment('web', {}).API_UPSTREAM, `api:${SERVICE_ROLES.api.port}`);
  const withOrigin = buildRuntimeEnvironment('api', { webOrigin: 'https://web.example.test' });
  assert.equal(withOrigin.CORS_ORIGIN, 'https://web.example.test');
  assert.equal(withOrigin.PUBLIC_BASE_URL, 'https://web.example.test');
  const without = buildRuntimeEnvironment('api', {});
  assert.equal('CORS_ORIGIN' in without, false);
  assert.throws(() => buildRuntimeEnvironment('worker', {}), PreviewDeployError);
});

test('manifest ban phat hanh: mang dung SHA/digest/provider, KHONG mang bi mat', () => {
  const manifest = buildReleaseManifest({
    gitSha: SHA,
    imageRef: IMAGE,
    workflowRunId: 12345,
    deployedAt: '2026-10-05T00:00:00.000Z',
  });
  assert.deepEqual(manifest, {
    tenant: 'transport-preview',
    environment: 'gd1-test',
    stack: 'transport-preview-gd1-test',
    target: 'northflank-sandbox',
    provider: 'northflank',
    gitSha: SHA,
    appDigest: IMAGE,
    workflowRunId: '12345',
    deployedAt: '2026-10-05T00:00:00.000Z',
  });
  for (const key of Object.keys(manifest)) assert.doesNotMatch(key, /(password|secret|token|key)/i);
});

const manifest = buildReleaseManifest({
  gitSha: SHA,
  imageRef: IMAGE,
  workflowRunId: 1,
  deployedAt: '2026-10-05T00:00:00.000Z',
});
const patch = (role) =>
  buildServicePatch(role, { imageRef: IMAGE, webOrigin: 'https://web.example.test', manifest });

test('PATCH: image bam DIGEST, mot request mang ca env + tep runtime + cong + health check', () => {
  for (const role of ['api', 'web']) {
    const body = patch(role);
    assert.equal(body.deployment.external.imagePath, IMAGE);
    assert.equal(body.deployment.instances, 1);
    assert.equal(body.deployment.docker.configType, 'customCommand');
    assert.equal(body.deployment.docker.customCommand, SERVICE_ROLES[role].command);
    assert.ok(body.healthChecks.length >= 2);
    assert.deepEqual(body.healthChecks.map((check) => check.type).sort(), [
      'livenessProbe',
      'readinessProbe',
      'startupProbe',
    ]);
    for (const check of body.healthChecks) {
      for (const field of [
        'protocol',
        'type',
        'path',
        'port',
        'initialDelaySeconds',
        'periodSeconds',
        'timeoutSeconds',
        'failureThreshold',
      ]) {
        assert.notEqual(check[field], undefined, `${role}.${check.type}.${field}`);
      }
      assert.equal(check.port, SERVICE_ROLES[role].port);
      assert.equal(check.path, SERVICE_ROLES[role].healthPath);
    }
  }
});

test('PATCH: health check thoa rang buoc THAT cua API Northflank (da do tren HTTP 400 live)', () => {
  for (const role of ['api', 'web']) {
    const checks = patch(role).healthChecks;
    for (const check of checks) {
      const label = `${role}.${check.type}`;
      assert.ok(check.initialDelaySeconds >= 1, `${label} initialDelaySeconds >= 1`);
      assert.ok(check.periodSeconds >= 10, `${label} periodSeconds >= 10`);
      assert.ok(Number.isInteger(check.timeoutSeconds) && check.timeoutSeconds >= 1, label);
      assert.ok(Number.isInteger(check.failureThreshold) && check.failureThreshold >= 1, label);
      // successThreshold chi hop le o readinessProbe: o loai khac API tra 400.
      assert.equal('successThreshold' in check, check.type === 'readinessProbe', label);
    }
    // Y do khoi dong giu nguyen: cua so startup >= 5 phut truoc khi liveness bat dau.
    const startup = checks.find((check) => check.type === 'startupProbe');
    assert.ok(startup.periodSeconds * startup.failureThreshold >= 300);
  }
});

test('PATCH: CHI web cong khai; api noi bo; ten cong <= 8 ky tu va co protocol (Northflank bat buoc)', () => {
  assert.deepEqual(patch('web').ports, [
    { name: 'http', internalPort: 3000, public: true, protocol: 'HTTP' },
  ]);
  assert.deepEqual(patch('api').ports, [
    { name: 'http', internalPort: 3001, public: false, protocol: 'HTTP' },
  ]);
  assert.ok(patch('api').ports.every((port) => port.name.length <= 8));
});

test('PATCH: release.json chi di theo api, la base64 cua manifest, va khong mang bi mat', () => {
  assert.equal('runtimeFiles' in patch('web'), false);
  const files = patch('api').runtimeFiles;
  assert.deepEqual(Object.keys(files), [RELEASE_MANIFEST_PATH]);
  assert.equal(files[RELEASE_MANIFEST_PATH].encoding, 'utf-8');
  const decoded = JSON.parse(
    Buffer.from(files[RELEASE_MANIFEST_PATH].data, 'base64').toString('utf8'),
  );
  assert.deepEqual(decoded, manifest);
  assert.equal(decoded.gitSha, SHA);
});

test('PATCH khong chua bat ky bi mat nao: moi bi mat nam trong secret group cua project', () => {
  const serialized = JSON.stringify([patch('api'), patch('web')]);
  assert.doesNotMatch(
    serialized,
    /(SESSION_SECRET|API_KEY|DATABASE_URL|PILOT_OPERATOR_PASSWORD|TRANSPORT_DEMO_DRIVER_PASSWORD|NORTHFLANK_API_TOKEN)/,
  );
  assert.equal(serialized.includes(TOKEN), false);
});

test('lenh khoi dong ton tai that trong repo, va moi dich vu mot lenh rieng', () => {
  assert.notEqual(SERVICE_ROLES.api.command, SERVICE_ROLES.web.command);
  for (const role of ['api', 'web']) {
    const script = SERVICE_ROLES[role].command.replace(/^sh \/app\//, '');
    assert.ok(existsSync(new URL(`../../${script}`, import.meta.url)), `${role}: ${script}`);
  }
});

test('khong con dau vet GCP o phan THUC THI cua hop dong (chu thich duoc phep nhac de giai thich)', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./preview-contract.mjs', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
  assert.doesNotMatch(
    source,
    /gcloud|google|GCP_|workload.?identity|os.?login|compute engine|gcs:|storage\.googleapis/i,
  );
});
