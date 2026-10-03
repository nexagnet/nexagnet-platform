// Khoa bat bien cua .github/workflows/autopilot-runtime-proof.yml (Phase 3) bang doc van ban — repo khong co
// parser YAML o goc. Workflow chay tren NHANH MAC DINH (workflow_run) va co the deploy, nen sai lech chi lo ra
// SAU merge. Bai nay keo no ve truoc merge.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { TRUSTED_BOT_LOGIN } from './autopilot-core.mjs';
import { RUNTIME_TARGETS, deploySignalsArtifactName } from './runtime-proof-core.mjs';

const read = (relative) =>
  readFileSync(new URL(relative, import.meta.url), 'utf8').replaceAll('\r\n', '\n');

// Bo comment de cau chu giai thich khong lam test xanh/do gia.
const stripComments = (text) =>
  text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .map((line) => (/^\s*-?\s*uses:/.test(line) ? line.replace(/\s+#.*$/, '') : line))
    .join('\n');

const CODE = stripComments(read('../../.github/workflows/autopilot-runtime-proof.yml'));
const job = (name) => {
  const match = new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z-]+:\\n|(?![\\s\\S]))`, 'm').exec(
    CODE,
  );
  assert.ok(match, `khong thay job ${name}`);
  return match[1];
};
const [TARGET] = Object.keys(RUNTIME_TARGETS);

test('trigger tin cay: workflow_run cua `ci` khi xong, khong co kenh phu / pull_request_target', () => {
  const on = /^on:\n([\s\S]*?)^\S/m.exec(CODE)[1].trimEnd();
  assert.equal(on, '  workflow_run:\n    workflows: [ci]\n    types: [completed]');
  assert.doesNotMatch(
    CODE,
    /pull_request_target|issue_comment|workflow_dispatch|repository_dispatch|schedule:|^ {2}pull_request:|^ {2}issues:|^ {2}push:/m,
  );
});

test('chi push len main co CI success moi cap runner; run-name bam head_sha cua CI vua xanh', () => {
  assert.match(
    job('preflight'),
    /if: github\.event\.workflow_run\.event == 'push' && github\.event\.workflow_run\.head_branch == 'main' && github\.event\.workflow_run\.conclusion == 'success'\n/,
  );
  assert.equal(
    /^run-name: (.+)$/m.exec(CODE)[1],
    'autopilot-runtime-proof ${{ github.event.workflow_run.head_sha }}',
  );
  // Khong dung `github.sha` / ref nhanh: main co the da tien. Chi SHA da bind trong preflight duoc di tiep.
  assert.doesNotMatch(CODE, /github\.sha|GITHUB_SHA|ref: main|refs\/heads\/main/);
});

test('preflight: chi doc, khong OIDC, khong secret, khong token App, khong ghi', () => {
  const preflight = job('preflight');
  assert.doesNotMatch(preflight, /id-token|secrets\.|app-token|APP_TOKEN|: write/);
  assert.match(
    preflight,
    /permissions:\n {6}contents: read\n {6}actions: read\n {6}pull-requests: read\n {6}issues: read\n/,
  );
  assert.match(preflight, /persist-credentials: false\n {10}sparse-checkout: tools\/autopilot\n/);
  assert.match(preflight, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(preflight, /run: node tools\/autopilot\/runtime-preflight\.mjs\n/);
  for (const output of ['decision', 'git_sha', 'target', 'pr', 'issue'])
    assert.match(
      preflight,
      new RegExp(`${output}: \\$\\{\\{ steps\\.preflight\\.outputs\\.${output} \\}\\}`),
    );
});

test('quyen: GITHUB_TOKEN mac dinh chi doc; id-token: write DUNG MOT cho, o job deploy (theo khuon hien co)', () => {
  assert.match(CODE, /^permissions:\n {2}contents: read\n/m);
  assert.equal(CODE.match(/id-token/g)?.length, 1);
  const deploy = job('deploy');
  assert.match(
    deploy,
    /permissions:\n {6}actions: read\n {6}contents: read\n {6}id-token: write\n/,
  );
  // Khong job nao khac co quyen ghi bang GITHUB_TOKEN.
  const tokenWrites = CODE.split('\n').filter(
    (line) => /^\s+[a-z-]+: write\s*$/.test(line) && !/permission-/.test(line),
  );
  assert.deepEqual(tokenWrites, ['      id-token: write']);
  assert.doesNotMatch(job('preflight') + job('report'), /id-token/);
});

test('deploy: CHI transport-preview/gd1-test, hang so; git_sha = SHA da bind tu preflight; engine/quan sat off', () => {
  assert.deepEqual(RUNTIME_TARGETS[TARGET], {
    tenant: 'transport-preview',
    environment: 'gd1-test',
  });
  assert.deepEqual(Object.keys(RUNTIME_TARGETS), ['transport-preview/gd1-test']);
  const deploy = job('deploy');
  assert.match(deploy, /needs: preflight\n/);
  assert.match(
    deploy,
    /if: needs\.preflight\.outputs\.decision == 'DEPLOY' && needs\.preflight\.outputs\.target == 'transport-preview\/gd1-test'\n/,
  );
  assert.match(deploy, /uses: \.\/\.github\/workflows\/reusable-deploy-tenant\.yml\n/);
  assert.match(
    deploy,
    /with:\n {6}tenant: transport-preview\n {6}environment: gd1-test\n {6}git_sha: \$\{\{ needs\.preflight\.outputs\.git_sha \}\}\n {6}workflow_engine: 'off'\n {6}observability_stack: 'off'\n {4}secrets: inherit\n/,
  );
  // Tenant/moi truong khong bao gio den tu Issue, payload hay output.
  assert.doesNotMatch(deploy, /(tenant|environment): \$\{\{/);
  assert.equal(CODE.match(/reusable-deploy-tenant\.yml/g).length, 1, 'khong nhan ban logic deploy');
  assert.doesNotMatch(CODE, /gcloud|google-github-actions|deploy-ci\.sh|docker /);
});

test('khong con duong nao toi production / tenant khach', () => {
  assert.doesNotMatch(CODE, /ultty|amico|wata|production|prod\b|pilot-ultty/i);
  const environments = [...CODE.matchAll(/environment: ?(\S+)/g)].map((m) => m[1]);
  assert.deepEqual(environments, ['gd1-test']);
  const tenants = [...CODE.matchAll(/tenant: ?(\S+)/g)].map((m) => m[1]);
  assert.deepEqual(tenants, ['transport-preview']);
});

test('report: chay ca khi deploy hong, chi comment, token App chi issues + pull-requests, khong OIDC', () => {
  const report = job('report');
  assert.match(report, /needs: \[preflight, deploy\]\n/);
  assert.match(report, /if: always\(\) && needs\.preflight\.outputs\.decision == 'DEPLOY'\n/);
  assert.match(report, /DEPLOY_RESULT: \$\{\{ needs\.deploy\.result \}\}/);
  assert.match(report, /MERGE_SHA: \$\{\{ needs\.preflight\.outputs\.git_sha \}\}/);
  assert.match(report, /run: node tools\/autopilot\/runtime-report\.mjs\n/);
  assert.match(
    report,
    /RUN_URL: \$\{\{ github\.server_url \}\}\/\$\{\{ github\.repository \}\}\/actions\/runs\/\$\{\{ github\.run_id \}\}/,
  );

  const granted = [...CODE.matchAll(/permission-([a-z-]+):/g)].map((m) => m[1]).sort();
  assert.deepEqual(granted, ['issues', 'pull-requests']);
  assert.doesNotMatch(
    CODE,
    /permission-(contents|workflows|administration|actions|deployments|checks|statuses|packages|secrets|environments)/,
  );
  assert.equal(CODE.match(/actions\/create-github-app-token@\S+/g)?.length, 1);
  assert.match(CODE, /client-id: \$\{\{ vars\.AUTOPILOT_APP_CLIENT_ID \}\}/);
  assert.doesNotMatch(CODE, /app-id:/);
  assert.deepEqual(
    [...new Set(CODE.match(/secrets\.[A-Z_]+/g))],
    ['secrets.AUTOPILOT_APP_PRIVATE_KEY'],
  );
});

test('report: lay deploy-signals.json cua CHINH run nay, dung ten artifact ma reusable deploy upload', () => {
  const artifact = deploySignalsArtifactName(RUNTIME_TARGETS[TARGET]);
  assert.equal(artifact, 'deploy-signals-transport-preview-gd1-test');
  assert.match(job('report'), new RegExp(`name: ${artifact}\\n`));
  assert.match(job('report'), /actions\/download-artifact@[0-9a-f]{40}\n/);
  assert.match(
    job('report'),
    /SIGNALS_PATH: \$\{\{ runner\.temp \}\}\/signals\/deploy-signals\.json/,
  );
});

test('moi action ben thu ba duoc ghim SHA (workflow nay khong dung tag troi)', () => {
  const uses = [...CODE.matchAll(/^\s*(?:- )?uses: (\S+)$/gm)]
    .map((m) => m[1])
    .filter((u) => !u.startsWith('./'));
  assert.ok(uses.length >= 3);
  for (const action of uses) assert.match(action, /@[0-9a-f]{40}$/, action);
});

test('khong cho Claude / khong chay ma PR: khong checkout ref PR, khong cai dependency, khong bi mat khac', () => {
  assert.doesNotMatch(CODE, /claude-code-action|CLAUDE_CODE_OAUTH_TOKEN|pnpm |npm |npx /);
  assert.doesNotMatch(CODE, /pull_requests\[|head\.ref|head_ref|pull_request\.head/);
  // Moi checkout cua workflow nay la sparse-checkout thu muc cong cu, khong luu credential.
  const checkouts = CODE.match(/actions\/checkout@\S+\n(?: {8,}.*\n)+/g) ?? [];
  assert.equal(checkouts.length, 2);
  for (const block of checkouts) {
    assert.match(block, /persist-credentials: false/);
    assert.match(block, /sparse-checkout: tools\/autopilot/);
    assert.doesNotMatch(block, /\bref:/);
  }
});

test('CLI: preflight chi doc (khong client ghi); report chi comment; khong merge/dispatch/nhan/OIDC', () => {
  const preflight = read('./runtime-preflight.mjs');
  assert.doesNotMatch(preflight, /APP_TOKEN|write\.|\.post\(|\.put\(|graphql|dispatches|\/merge\b/);
  assert.match(preflight, /createClient\(\{ token: GITHUB_TOKEN \}\)/);

  const report = read('./runtime-report.mjs');
  assert.doesNotMatch(report, /\.put\(|graphql|dispatches|\/merge\b|\/labels|rollback\(|promote\(/);
  assert.match(report, /createClient\(\{ token: APP_TOKEN \}\)/);
  assert.equal(report.match(/postMarkedComment\(/g).length, 1);

  // Merge chi qua merge-evaluate.mjs (khoa boi phase2-workflows.contract.test.mjs); deploy khong qua tool nay.
  const sources = readdirSync(new URL('./', import.meta.url)).filter(
    (f) => f.startsWith('runtime-') && f.endsWith('.mjs') && !f.includes('.test.'),
  );
  assert.deepEqual(sources.sort(), [
    'runtime-preflight.mjs',
    'runtime-proof-core.mjs',
    'runtime-report.mjs',
  ]);
  for (const file of sources)
    assert.doesNotMatch(
      read(`./${file}`),
      /child_process|execSync|spawn|id-token|ACTIONS_ID_TOKEN/,
      file,
    );
});

test('chi bot tin cay moi ghi/duoc tin: hang so danh tinh khong doi', () => {
  assert.equal(TRUSTED_BOT_LOGIN, 'nexagnet-autopilot-v4[bot]');
  assert.match(read('./runtime-preflight.mjs'), /trustedMarkers\(comments, MARKER_KINDS\.merged\)/);
});
