import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  RUNTIME_TARGETS,
  deploySignalsArtifactName,
} from '../../tools/autopilot/runtime-proof-core.mjs';

/**
 * Khoa bat bien cua `.github/workflows/reusable-deploy-northflank.yml` — duong deploy cua ban xem
 * truoc Autopilot Phase 3 (repo khong co parser YAML o goc, nen doc van ban). Workflow nay chay tren
 * NHANH MAC DINH va co the day image len GHCR + doi Northflank, nen sai lech chi lo ra SAU merge.
 */

const CRLF = new RegExp(`${String.fromCharCode(13)}${String.fromCharCode(10)}`, 'g');
const workflow = (name) =>
  readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8').replace(
    CRLF,
    '\n',
  );

// Bo dong chu thich de cau chu giai thich khong lam test xanh/do gia.
const code = (text) =>
  text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .map((line) => (/^\s*-?\s*uses:/.test(line) ? line.replace(/\s+#.*$/, '') : line))
    .join('\n');

const northflank = code(workflow('reusable-deploy-northflank.yml'));
const legacy = code(workflow('reusable-deploy-tenant.yml'));
const manual = code(workflow('deploy-tenant.yml'));
const runtimeProof = code(workflow('autopilot-runtime-proof.yml'));
const registry = JSON.parse(
  readFileSync(new URL('../../.github/deployment-targets.json', import.meta.url), 'utf8'),
);

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const step = (text, name) => {
  const match = new RegExp(
    `^      - (?:id: \\w+\\n        )?name: ${escapeRegExp(name)}\\n([\\s\\S]*?)(?=^      - |(?![\\s\\S]))`,
    'm',
  ).exec(text);
  assert.ok(match, `khong thay buoc: ${name}`);
  return match[1];
};
const stepNames = (text) =>
  [...text.matchAll(/^ {6}- (?:id: \w+\n {8})?name: (.+)$/gm)].map((m) => m[1]);
const bashBlock = (stepBody) => {
  const match = /run: \|\n((?: {10}.*\n?)+)/.exec(stepBody);
  assert.ok(match, 'buoc khong co khoi run');
  return match[1].replace(/^ {10}/gm, '');
};
const bash = (script, env) =>
  spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });

const STEP = {
  verify: 'Verify checkout is the requested git_sha',
  pack: 'Validate tenant pack exists',
  resolve: 'Resolve deployment target',
  provider: 'Require Northflank provider',
  ci: 'Verify exact main SHA passed CI',
  preflight: 'Preflight Northflank (token, project, operator secret)',
  image: 'Build and push preview image (exact SHA)',
  rollout: 'Deploy to Northflank (ROLLOUT + HEALTH + DETERMINISTIC SMOKE)',
  upload: 'Upload deploy signals',
};

// ---------------------------------------------------------------------------------------------
// KHONG GCP
// ---------------------------------------------------------------------------------------------

test('duong Northflank khong con GCP: khong auth, WIF, gcloud, OS Login, IAP, id-token', () => {
  assert.doesNotMatch(
    northflank,
    /google-github-actions|setup-gcloud|gcloud|workload.?identity|GCP_|os.?login|--tunnel-through-iap|id-token|compute\s+(ssh|scp)/i,
  );
  assert.doesNotMatch(northflank, /deploy-ci\.sh|deploy-remote\.sh|netviet-public-ip/);
});

test('quyen: doc Actions/contents va ghi goi GHCR — KHONG id-token', () => {
  assert.match(
    northflank,
    /^permissions:\n {2}actions: read\n {2}contents: read\n {2}packages: write\n/m,
  );
  const writes = northflank.split('\n').filter((line) => /^\s+[a-z-]+: write\s*$/.test(line));
  assert.deepEqual(writes, ['  packages: write']);
});

test('trigger: CHI workflow_call — khong push/PR/dispatch/schedule', () => {
  const on = /^on:\n([\s\S]*?)^\S/m.exec(northflank)[1];
  assert.match(on, /^ {2}workflow_call:\n/);
  // Chi xet khoa trigger o cap `on:` (jq trong workflow co chuoi `.workflow_runs[]`, khong phai trigger).
  const triggers = [...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
  assert.deepEqual(triggers, ['workflow_call']);
  const inputs = /^ {4}inputs:\n([\s\S]*?)^ {4}secrets:/m.exec(northflank)[1];
  for (const name of ['tenant', 'environment', 'git_sha']) {
    assert.match(
      inputs,
      new RegExp(`^ {6}${name}:\\n(?: {8}.*\\n)*? {8}required: true\\n {8}type: string\\n`, 'm'),
    );
  }
});

// ---------------------------------------------------------------------------------------------
// EXACT-SHA
// ---------------------------------------------------------------------------------------------

test('exact-SHA: chi doc inputs.git_sha — khong github.sha / GITHUB_SHA / workflow_run', () => {
  assert.doesNotMatch(northflank, /github\.sha|GITHUB_SHA|github\.event\.workflow_run/);
  const checkout =
    /- uses: actions\/checkout@[0-9a-f]{40}\n {8}with:\n {10}ref: \$\{\{ inputs\.git_sha \}\}\n {10}persist-credentials: false\n/;
  assert.match(northflank, checkout);
});

test('exact-SHA: HEAD phai bang git_sha truoc moi buoc khac; input di qua bien moi truong', () => {
  const verify = step(northflank, STEP.verify);
  assert.match(verify, /REQUESTED_GIT_SHA: \$\{\{ inputs\.git_sha \}\}/);
  assert.doesNotMatch(
    verify.replace(/REQUESTED_GIT_SHA: \$\{\{ inputs\.git_sha \}\}/, ''),
    /\$\{\{/,
  );
  assert.match(verify, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(verify, /git rev-parse HEAD/);
});

test('thu tu cac buoc: checkout < verify < resolve < provider < CI < preflight < image < rollout < upload', () => {
  const names = stepNames(northflank);
  const order = [
    STEP.verify,
    STEP.pack,
    STEP.resolve,
    STEP.provider,
    STEP.ci,
    STEP.preflight,
    STEP.image,
    STEP.rollout,
    STEP.upload,
  ];
  const indexes = order.map((name) => names.indexOf(name));
  assert.ok(
    indexes.every((index) => index >= 0),
    `thieu buoc: ${JSON.stringify(indexes)}`,
  );
  assert.deepEqual(
    indexes,
    [...indexes].sort((a, b) => a - b),
    'sai thu tu',
  );
  assert.ok(northflank.indexOf('actions/checkout@') < northflank.indexOf(STEP.verify));
});

test('exact-SHA: Verify checkout CHAY THAT — pass khi HEAD == git_sha, fail khi khac / ngan / hoa / rong', () => {
  const script = bashBlock(step(northflank, STEP.verify));
  const dir = mkdtempSync(join(tmpdir(), 'nf-exact-'));
  try {
    const git = (...args) => {
      const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    };
    git('init', '-q');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'test');
    git('config', 'commit.gpgsign', 'false');
    writeFileSync(join(dir, 'a.txt'), 'one');
    git('add', '.');
    git('commit', '-q', '-m', 'one');
    const first = git('rev-parse', 'HEAD');
    writeFileSync(join(dir, 'a.txt'), 'two');
    git('commit', '-q', '-am', 'two');
    const second = git('rev-parse', 'HEAD');
    git('checkout', '-q', '--detach', first);

    const run = (sha) =>
      spawnSync('bash', ['-c', script], {
        cwd: dir,
        encoding: 'utf8',
        env: { PATH: process.env.PATH, REQUESTED_GIT_SHA: sha },
      });
    assert.equal(run(first).status, 0);
    assert.notEqual(run(second).status, 0, 'main da tien: yeu cau commit moi hon HEAD phai FAIL');
    for (const bad of [first.slice(0, 12), first.toUpperCase(), '', 'main', `${first}0`]) {
      assert.notEqual(run(bad).status, 0, `phai tu choi: '${bad}'`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cong exact-main CI VO DIEU KIEN (khong `if:`), hoi dung inputs.git_sha tren main, doi refs/heads/main', () => {
  const raw = workflow('reusable-deploy-northflank.yml');
  const ci = step(northflank, STEP.ci);
  assert.match(ci, /GIT_SHA: \$\{\{ inputs\.git_sha \}\}/);
  assert.match(ci, /-f head_sha="\$\{GIT_SHA\}" -f branch=main -f status=completed/);
  assert.match(ci, /\[\[ "\$\{GITHUB_REF\}" == 'refs\/heads\/main' \]\]/);
  assert.match(ci, /\[\[ "\$\{conclusion\}" == 'success' \]\]/);
  assert.match(ci, /echo 'conclusion=success' >>"\$\{GITHUB_OUTPUT\}"/);
  // Khong buoc nao cua workflow nay duoc phep tat cong bang `if:` theo registry/moi truong.
  assert.doesNotMatch(northflank, /requires_exact_main_ci/);
  assert.doesNotMatch(ci, /^\s*if:/m);
  assert.ok(raw.length > 0);
});

test('buoc Require Northflank provider CHAY THAT: chi northflank di qua', () => {
  const script = bashBlock(step(northflank, STEP.provider));
  assert.equal(bash(script, { PROVIDER: 'northflank' }).status, 0);
  for (const provider of ['gcp-vm', '', 'railway', 'Northflank']) {
    const result = bash(script, { PROVIDER: provider });
    assert.notEqual(result.status, 0, provider);
    assert.match(result.stderr, /chi deploy provider 'northflank'/);
  }
});

// ---------------------------------------------------------------------------------------------
// TOKEN / BI MAT
// ---------------------------------------------------------------------------------------------

test('NORTHFLANK_API_TOKEN chi vao `env:` cua DUNG hai buoc (preflight, rollout) — khong job-level, khong run:', () => {
  const occurrences = northflank.match(/secrets\.NORTHFLANK_API_TOKEN/g) ?? [];
  assert.equal(occurrences.length, 2);
  for (const name of [STEP.preflight, STEP.rollout]) {
    assert.match(
      step(northflank, name),
      /^ {10}NORTHFLANK_API_TOKEN: \$\{\{ secrets\.NORTHFLANK_API_TOKEN \}\}$/m,
    );
  }
  // Job-level env chi mang TENANT: token khong den buoc build/docker/upload.
  const jobEnv = /^ {4}env:\n((?: {6}.*\n)+)/m.exec(northflank)[1];
  assert.equal(jobEnv.trim(), 'TENANT: ${{ inputs.tenant }}');
  for (const name of [STEP.image, STEP.ci, STEP.verify, STEP.resolve, STEP.provider, STEP.upload]) {
    assert.doesNotMatch(step(northflank, name), /NORTHFLANK_API_TOKEN/, name);
  }
  // Khong noi `${{ secrets.* }}` vao than shell.
  const runBlocks = [...northflank.matchAll(/run: \|\n((?: {10}.*\n?)+)/g)]
    .map((m) => m[1])
    .join('\n');
  assert.doesNotMatch(runBlocks, /\$\{\{/);
  assert.doesNotMatch(northflank, /set -x|--debug|ACTIONS_STEP_DEBUG/);
});

test('ngoai token Northflank, workflow KHONG doc secret nao khac; github.token chi o CI gate va dang nhap GHCR', () => {
  const secretsUsed = [...new Set(northflank.match(/secrets\.[A-Z_]+/g))];
  assert.deepEqual(secretsUsed, ['secrets.NORTHFLANK_API_TOKEN']);
  const tokenUses = (northflank.match(/github\.token/g) ?? []).length;
  assert.equal(tokenUses, 2);
  assert.match(step(northflank, STEP.ci), /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(step(northflank, STEP.image), /REGISTRY_TOKEN: \$\{\{ github\.token \}\}/);
});

test('moi action ben thu ba duoc ghim SHA 40 ky tu', () => {
  const uses = [...northflank.matchAll(/^\s*(?:- )?uses: (\S+)$/gm)].map((m) => m[1]);
  assert.ok(uses.length >= 2);
  for (const action of uses) assert.match(action, /@[0-9a-f]{40}$/, action);
});

// ---------------------------------------------------------------------------------------------
// IMAGE + ROLLOUT
// ---------------------------------------------------------------------------------------------

test('image: build tu checkout, nhan revision dung SHA, lop mong tren image chung, push GHCR, DIGEST sau push', () => {
  const image = step(northflank, STEP.image);
  assert.match(image, /GIT_SHA: \$\{\{ inputs\.git_sha \}\}/);
  assert.match(image, /--file deploy\/netviet\/Dockerfile/);
  assert.match(image, /--label "org\.opencontainers\.image\.revision=\$\{GIT_SHA\}"/);
  assert.match(image, /--file deploy\/northflank\/Dockerfile/);
  assert.match(image, /--build-arg "BASE_IMAGE=\$\{base\}"/);
  assert.match(image, /--build-arg "GIT_SHA=\$\{GIT_SHA\}"/);
  // Dang nhap GHCR bang stdin, va luon dang xuat.
  assert.match(
    image,
    /printf '%s' "\$\{REGISTRY_TOKEN\}" \| docker login ghcr\.io --username "\$\{REGISTRY_USER\}" --password-stdin/,
  );
  assert.match(image, /trap 'docker logout ghcr\.io/);
  assert.doesNotMatch(image, /docker login[^\n]*(-p |--password )/);
  // Digest doc SAU push, va phai la digest cua DUNG repo.
  assert.ok(image.indexOf('docker push') < image.indexOf('RepoDigests'));
  assert.match(image, /image="ghcr\.io\/\$\{REPOSITORY,,\}\/preview"/);
  assert.match(image, /echo "image_ref=\$\{digest_ref\}" >>"\$\{GITHUB_OUTPUT\}"/);
});

test('rollout: image la OUTPUT cua buoc build (digest), SHA/tenant/environment tu input, ten buoc id=rollout', () => {
  const rollout = step(northflank, STEP.rollout);
  assert.match(rollout, /IMAGE_REF: \$\{\{ steps\.image\.outputs\.image_ref \}\}/);
  assert.match(rollout, /GIT_SHA: \$\{\{ inputs\.git_sha \}\}/);
  assert.match(rollout, /TENANT: \$\{\{ inputs\.tenant \}\}/);
  assert.match(rollout, /ENVIRONMENT: \$\{\{ inputs\.environment \}\}/);
  assert.match(rollout, /PROVIDER: \$\{\{ steps\.target\.outputs\.provider \}\}/);
  assert.match(rollout, /GD1_TEST_CI_CONCLUSION: \$\{\{ steps\.ci\.outputs\.conclusion \}\}/);
  assert.match(rollout, /run: node deploy\/northflank\/run-deploy-preview\.mjs\n/);
  // ID project/service den tu resolver, khong tu input hay hang so trong workflow.
  for (const key of ['project_id', 'api_service_id', 'web_service_id']) {
    assert.match(rollout, new RegExp(`steps\\.target\\.outputs\\.northflank_${key}`));
  }
  assert.doesNotMatch(rollout, /--preflight/);
});

test('preflight CHAY TRUOC build va khong mang IMAGE_REF', () => {
  const preflight = step(northflank, STEP.preflight);
  assert.match(preflight, /run: node deploy\/northflank\/run-deploy-preview\.mjs --preflight\n/);
  assert.doesNotMatch(preflight, /IMAGE_REF/);
  const names = stepNames(northflank);
  assert.ok(names.indexOf(STEP.preflight) < names.indexOf(STEP.image));
});

test('deploy-signals duoc upload `if: always()`, dung ten artifact ma runtime proof tai ve', () => {
  const upload = step(northflank, STEP.upload);
  assert.match(upload, /if: always\(\)/);
  assert.match(
    upload,
    /name: deploy-signals-\$\{\{ inputs\.tenant \}\}-\$\{\{ inputs\.environment \}\}/,
  );
  assert.match(upload, /path: deploy-signals\.json/);
  assert.equal(
    deploySignalsArtifactName(RUNTIME_TARGETS['transport-preview/gd1-test']),
    'deploy-signals-transport-preview-gd1-test',
  );
});

// ---------------------------------------------------------------------------------------------
// NOI DAY: registry, runtime proof, cong tay, duong VM
// ---------------------------------------------------------------------------------------------

test('registry: CHI transport-preview/gd1-test mang provider northflank; moi hang con lai van o VM', () => {
  const northflankRows = registry.deployments.filter(
    (entry) => registry.targets[entry.target]?.provider === 'northflank',
  );
  assert.deepEqual(
    northflankRows.map((entry) => `${entry.tenant}/${entry.environment}`),
    ['transport-preview/gd1-test'],
  );
  for (const entry of registry.deployments.filter((row) => !northflankRows.includes(row))) {
    assert.equal(entry.target, 'current-shared-vm', `${entry.tenant}/${entry.environment}`);
  }
  assert.equal(registry.targets['current-shared-vm'].provider, 'gcp-vm');
  assert.deepEqual(registry.targets['northflank-sandbox'], {
    provider: 'northflank',
    projectId: 'nexagnet-dev',
    apiServiceId: 'api',
    webServiceId: 'web',
  });
  // Muc tieu runtime proof va hang registry la CUNG MOT cap.
  const [target] = Object.keys(RUNTIME_TARGETS);
  assert.equal(target, 'transport-preview/gd1-test');
  assert.equal(RUNTIME_TARGETS[target].provider, 'northflank');
});

test('Autopilot runtime proof goi workflow Northflank, khong con goi duong VM', () => {
  assert.match(runtimeProof, /uses: \.\/\.github\/workflows\/reusable-deploy-northflank\.yml\n/);
  assert.doesNotMatch(runtimeProof, /reusable-deploy-tenant\.yml/);
  assert.doesNotMatch(runtimeProof, /id-token/);
  // Cung nhom concurrency voi deploy tay cua tenant nay: hai lan deploy khong chay song song.
  assert.match(runtimeProof, /group: deploy-tenant-transport-preview\n/);
  assert.match(manual, /group: deploy-tenant-\$\{\{ inputs\.tenant \}\}\n/);
});

test('deploy tay: transport-preview/gd1-test di Northflank, moi muc khac van di duong VM nhu cu', () => {
  const when = "inputs.tenant == 'transport-preview' && inputs.environment == 'gd1-test'";
  assert.match(manual, new RegExp(`^ {4}if: \\$\\{\\{ !\\(${escapeRegExp(when)}\\) \\}\\}$`, 'm'));
  assert.match(manual, new RegExp(`^ {4}if: \\$\\{\\{ ${escapeRegExp(when)} \\}\\}$`, 'm'));
  assert.match(
    manual,
    /deploy-northflank:\n(?: {4}.*\n)*? {4}permissions:\n {6}actions: read\n {6}contents: read\n {6}packages: write\n {4}uses: \.\/\.github\/workflows\/reusable-deploy-northflank\.yml\n/,
  );
  // Duong VM giu nguyen: van truyen workflow_engine / observability_stack va github.sha.
  assert.match(manual, /uses: \.\/\.github\/workflows\/reusable-deploy-tenant\.yml\n/);
  assert.match(manual, /workflow_engine: \$\{\{ inputs\.workflow_engine \}\}/);
  assert.match(manual, /observability_stack: \$\{\{ inputs\.observability_stack \}\}/);
  // Job Northflank khong tu cap id-token (workflow-level co id-token cho duong VM, nhung job ghi de).
  const northflankJob = /deploy-northflank:\n([\s\S]*)$/.exec(manual)[1];
  assert.doesNotMatch(northflankJob, /id-token/);
  assert.match(northflankJob, /git_sha: \$\{\{ github\.sha \}\}/);
});

test('duong VM/GCP tu choi hang khong phai gcp-vm TRUOC buoc GCP auth — va van con GCP auth cho cac muc khac', () => {
  const names = stepNames(legacy);
  const guard = 'Refuse non-GCP deploy provider';
  assert.ok(names.indexOf(guard) > names.indexOf(STEP.resolve));
  assert.ok(legacy.indexOf(`name: ${guard}`) < legacy.indexOf('google-github-actions/auth@v2'));
  // KHONG doi ngu nghia cho muc khac: GCP auth + id-token van nguyen ven.
  assert.match(legacy, /google-github-actions\/auth@v2/);
  assert.match(legacy, /id-token: write/);

  const script = bashBlock(step(legacy, guard));
  assert.equal(bash(script, { PROVIDER: 'gcp-vm' }).status, 0);
  for (const provider of ['northflank', '', 'railway']) {
    const result = bash(script, { PROVIDER: provider });
    assert.notEqual(result.status, 0, provider);
    assert.match(result.stderr, /reusable-deploy-northflank\.yml/);
  }
});

test('khong workflow nao khac goi reusable-deploy-northflank.yml ngoai hai noi duoc phep', () => {
  const dir = new URL('../../.github/workflows/', import.meta.url);
  const callers = readdirSync(dir)
    .filter((file) => file.endsWith('.yml') && file !== 'reusable-deploy-northflank.yml')
    .filter((file) =>
      /uses: \.\/\.github\/workflows\/reusable-deploy-northflank\.yml/.test(workflow(file)),
    )
    .sort();
  assert.deepEqual(callers, ['autopilot-runtime-proof.yml', 'deploy-tenant.yml']);
});
