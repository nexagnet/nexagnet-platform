/**
 * AUTOPILOT V4 / PHASE 3 — deploy phai bam vao MOT commit CHINH XAC, khong bam vao `github.sha`.
 *
 * Voi `workflow_dispatch`, `github.sha` la commit cua lan dispatch. Voi `workflow_run` (runtime proof cua
 * Autopilot), `github.sha` la commit MOI NHAT cua nhanh mac dinh — co the da tien qua commit ma CI vua xanh.
 * Neu checkout / cong "exact-main CI" / `GIT_SHA` van doc `github.sha`, lan deploy se chay ma cua commit
 * KHAC voi commit duoc chung minh. Bai nay khoa viec `reusable-deploy-tenant.yml` chi doc `inputs.git_sha`,
 * va `deploy-tenant.yml` (cong tay) van truyen `github.sha` de giu nguyen hanh vi cu.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const workflow = (name) =>
  readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8').replaceAll(
    '\r\n',
    '\n',
  );

// Bo dong chu thich de cau chu giai thich khong lam test xanh/do gia.
const code = (text) =>
  text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

const reusableRaw = workflow('reusable-deploy-tenant.yml');
const reusable = code(reusableRaw);
const manual = code(workflow('deploy-tenant.yml'));

const step = (text, name) => {
  const match = new RegExp(
    `^      - (?:id: \\w+\\n        )?name: ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n([\\s\\S]*?)(?=^      - |(?![\\s\\S]))`,
    'm',
  ).exec(text);
  assert.ok(match, `khong thay buoc: ${name}`);
  return match[1];
};

test('reusable: git_sha la input workflow_call BAT BUOC, kieu string', () => {
  const inputs = /^on:\n {2}workflow_call:\n {4}inputs:\n([\s\S]*?)^ {4}secrets:/m.exec(
    reusable,
  )[1];
  assert.match(inputs, /^ {6}git_sha:\n(?: {8}.*\n)*? {8}required: true\n {8}type: string\n/m);
});

test('reusable: KHONG con doc github.sha / GITHUB_SHA o bat ky dau (chi duoc doc inputs.git_sha)', () => {
  assert.doesNotMatch(reusable, /github\.sha/);
  assert.doesNotMatch(reusable, /GITHUB_SHA/);
  assert.doesNotMatch(reusable, /github\.event\.workflow_run/);
});

test('reusable: checkout dung inputs.git_sha va HEAD phai bang no truoc moi buoc deploy', () => {
  const checkout =
    /- uses: actions\/checkout@v4\n {8}with:\n {10}ref: \$\{\{ inputs\.git_sha \}\}\n/;
  assert.match(reusable, checkout);

  const verify = step(reusable, 'Verify checkout is the requested git_sha');
  assert.match(verify, /REQUESTED_GIT_SHA: \$\{\{ inputs\.git_sha \}\}/);
  // Input di qua bien moi truong: khong noi `${{ inputs.git_sha }}` vao than shell.
  assert.doesNotMatch(
    verify.replace(/REQUESTED_GIT_SHA: \$\{\{ inputs\.git_sha \}\}/, ''),
    /\$\{\{/,
  );
  assert.match(verify, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(verify, /git rev-parse HEAD/);

  const at = (needle) => {
    const index = reusable.indexOf(needle);
    assert.ok(index >= 0, `thieu: ${needle}`);
    return index;
  };
  assert.ok(at('actions/checkout@v4') < at('Verify checkout is the requested git_sha'));
  assert.ok(at('Verify checkout is the requested git_sha') < at('Resolve deployment target'));
  assert.ok(at('Verify checkout is the requested git_sha') < at('google-github-actions/auth@v2'));
  assert.ok(at('Verify checkout is the requested git_sha') < at('id: rollout'));
});

test('reusable: cong exact-main CI hoi dung inputs.git_sha tren nhanh main, van doi refs/heads/main', () => {
  const ci = step(reusable, 'Verify exact main SHA passed CI');
  assert.match(ci, /GIT_SHA: \$\{\{ inputs\.git_sha \}\}/);
  assert.match(ci, /-f head_sha="\$\{GIT_SHA\}" -f branch=main -f status=completed/);
  assert.match(ci, /--arg sha "\$\{GIT_SHA\}"/);
  assert.match(ci, /\[\[ "\$\{GITHUB_REF\}" == 'refs\/heads\/main' \]\]/);
  assert.match(ci, /\[\[ "\$\{conclusion\}" == 'success' \]\]/);
  assert.match(reusable, /if: steps\.target\.outputs\.requires_exact_main_ci == 'true'/);
});

test('reusable: GIT_SHA cua script deploy la inputs.git_sha; ten tenant/environment van tu input', () => {
  const rollout = step(reusable, 'Roll out release (ROLLOUT + HEALTH + DETERMINISTIC SMOKE)');
  assert.match(rollout, /^ {10}GIT_SHA: \$\{\{ inputs\.git_sha \}\}$/m);
  assert.equal(
    reusable.match(/^ {10}GIT_SHA: /gm).length,
    2,
    'dung hai cho khai GIT_SHA (CI gate + rollout)',
  );
  assert.match(rollout, /GITHUB_REF: \$\{\{ github\.ref \}\}/);
  assert.match(rollout, /DEPLOYMENT_ENVIRONMENT_ID: \$\{\{ inputs\.environment \}\}/);
  assert.match(rollout, /TENANT: \$\{\{ inputs\.tenant \}\}/);
});

test('reusable: deploy-signals van duoc upload nhu cu (artifact theo tenant + environment, if: always())', () => {
  const upload = step(reusable, 'Upload deploy signals');
  assert.match(upload, /if: always\(\)/);
  assert.match(
    upload,
    /name: deploy-signals-\$\{\{ inputs\.tenant \}\}-\$\{\{ inputs\.environment \}\}/,
  );
  assert.match(upload, /path: deploy-signals\.json/);
});

test('cong tay deploy-tenant.yml: van chi workflow_dispatch, truyen github.sha de giu hanh vi cu', () => {
  assert.match(manual, /^on:\n {2}workflow_dispatch:\n/m);
  assert.doesNotMatch(manual, /workflow_run|repository_dispatch|pull_request|\bpush:/);
  assert.match(manual, /^ {6}git_sha: \$\{\{ github\.sha \}\}$/m);
  assert.match(manual, /uses: \.\/\.github\/workflows\/reusable-deploy-tenant\.yml/);
});

test('moi noi goi reusable-deploy-tenant.yml deu truyen git_sha tuong minh', () => {
  const dir = new URL('../../.github/workflows/', import.meta.url);
  const callers = readdirSync(dir)
    .filter((file) => file.endsWith('.yml') && file !== 'reusable-deploy-tenant.yml')
    .filter((file) =>
      /uses: \.\/\.github\/workflows\/reusable-deploy-tenant\.yml/.test(workflow(file)),
    )
    .sort();
  assert.deepEqual(callers, ['autopilot-runtime-proof.yml', 'deploy-tenant.yml']);
  for (const file of callers)
    assert.match(code(workflow(file)), /^ {6}git_sha: \$\{\{ .+ \}\}$/m, `${file} thieu git_sha`);
});

// ---------------------------------------------------------------------------------------------
// HANH VI THAT cua buoc "Verify checkout is the requested git_sha", chay bang bash tren repo git tam.
// ---------------------------------------------------------------------------------------------

const verifyScript = () => {
  const block = /run: \|\n((?: {10}.*\n?)+)/.exec(
    step(reusable, 'Verify checkout is the requested git_sha'),
  )[1];
  return block.replace(/^ {10}/gm, '');
};

function withRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'exact-sha-'));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };
  try {
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
    return fn({ dir, first, second });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const runVerify = (dir, requested) =>
  spawnSync('bash', ['-c', verifyScript()], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, REQUESTED_GIT_SHA: requested },
  });

test('Verify checkout: pass khi HEAD == git_sha, fail khi HEAD khac / SHA ngan / chu hoa / rong', () => {
  withRepo(({ dir, first, second }) => {
    assert.equal(runVerify(dir, first).status, 0);
    // `main` da tien toi `second`, nhung checkout dang o `first`: yeu cau `second` phai FAIL.
    const wrong = runVerify(dir, second);
    assert.notEqual(wrong.status, 0);
    assert.match(wrong.stderr, /khac git_sha yeu cau/);
    for (const bad of [first.slice(0, 12), first.toUpperCase(), '', 'main', `${first}0`]) {
      const result = runVerify(dir, bad);
      assert.notEqual(result.status, 0, `phai tu choi: '${bad}'`);
    }
  });
});
