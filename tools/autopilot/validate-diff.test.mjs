import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { isAgentBranch, isProtectedPath, validateDiff } from './validate-diff.mjs';

const CLI = fileURLToPath(new URL('./validate-diff.mjs', import.meta.url));

const PROTECTED = [
  '.github/workflows/ci.yml',
  '.github/actions/setup-workspace/action.yml',
  'deploy/netviet/render-secrets.sh',
  'infra/main.tf',
  'tools/autopilot/validate-diff.mjs',
  'AGENTS.md',
  'CLAUDE.md',
  'apps/api/CLAUDE.md',
  '.mcp.json',
  '.claude/settings.json',
  '.GitHub/workflows/x.yml',
];

const NORMAL = [
  'apps/api/src/orders/sales-order-decisions.ts',
  'apps/web/app/page.tsx',
  'packages/shared/src/index.ts',
  'docs/README.md',
  'tools/autopilot-orchestrator/src/index.ts',
  'tools/autopilotx/readme.md',
  'deployment.md',
  'apps/api/src/deploy/helper.ts',
];

test('duong dan bao ve bi block', () => {
  for (const path of PROTECTED) {
    assert.equal(isProtectedPath(path), true, path);
    const result = validateDiff({ files: ['apps/api/src/a.ts', path], risk: 'R1' });
    assert.equal(result.decision, 'BLOCK', path);
    assert.equal(result.reason, 'PROTECTED_PATH', path);
    assert.deepEqual(result.blocked, [path]);
  }
});

test('duong dan ma nguon binh thuong pass', () => {
  for (const path of NORMAL) assert.equal(isProtectedPath(path), false, path);
  assert.deepEqual(validateDiff({ files: NORMAL, risk: 'R0' }), {
    decision: 'PASS',
    reason: 'OK',
    blocked: [],
    needsHuman: false,
  });
});

test('R2 khong block, chi danh dau needs-human', () => {
  const result = validateDiff({ files: ['apps/api/src/a.ts'], risk: 'R2' });
  assert.deepEqual([result.decision, result.needsHuman], ['PASS', true]);
});

test('R2 van block khi cham duong dan bao ve', () => {
  const result = validateDiff({ files: ['deploy/netviet/x.sh'], risk: 'R2' });
  assert.equal(result.decision, 'BLOCK');
});

test('khong co thay doi thi khong mo PR', () => {
  assert.equal(validateDiff({ files: [], risk: 'R0' }).reason, 'NO_CHANGES');
});

test('chi chap nhan nhanh autopilot/ hop le', () => {
  assert.equal(isAgentBranch('autopilot/issue-12-20261002-1030'), true);
  for (const branch of [
    'main',
    'autopilot/',
    'claude/issue-1',
    'autopilot/../main',
    'autopilot/a b',
    undefined,
  ]) {
    assert.equal(isAgentBranch(branch), false, String(branch));
  }
});

// CLI tren repo git THAT. Rename KEO tep RA khoi vung cam (= xoa no khoi .github/deploy) chi hien
// duong dan MOI neu git do rename — `--no-renames` bat buoc de duong dan cu cung duoc kiem.
// Go GIT_* ke thua: chay duoi hook git thi GIT_DIR tro vao repo that.
test('CLI doc diff that tu git, bat ca rename ra khoi vung cam', () => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
  );
  const dir = mkdtempSync(join(tmpdir(), 'autopilot-diff-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim();
  const run = (branch) =>
    execFileSync(process.execPath, [CLI, '--base', 'main', '--branch', branch, '--risk', 'R1'], {
      cwd: dir,
      env: { ...env, GITHUB_OUTPUT: '' },
      encoding: 'utf8',
    });
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 't');
    // Hook git toan cuc cua may dev (quet bi mat...) khong lien quan toi fixture nay.
    git('config', 'core.hooksPath', join(dir, '.no-hooks'));
    mkdirSync(join(dir, 'apps'));
    writeFileSync(join(dir, 'apps', 'a.ts'), 'export const a = 1;\n');
    mkdirSync(join(dir, 'deploy'));
    writeFileSync(join(dir, 'deploy', 'run.sh'), 'echo deploy\n');
    git('add', '.');
    git('commit', '-q', '-m', 'base');

    git('checkout', '-q', '-b', 'ok');
    writeFileSync(join(dir, 'apps', 'a.ts'), 'export const a = 2;\n');
    git('commit', '-q', '-am', 'ok');
    git('update-ref', 'refs/remotes/origin/autopilot/ok', 'HEAD');

    git('checkout', '-q', 'main');
    git('checkout', '-q', '-b', 'bad');
    git('mv', 'deploy/run.sh', 'apps/run.sh');
    git('commit', '-q', '-m', 'bad');
    git('update-ref', 'refs/remotes/origin/autopilot/bad', 'HEAD');

    assert.match(run('autopilot/ok'), /VALIDATE_DIFF PASS reason=OK files=1/);
    assert.match(run('autopilot/bad'), /VALIDATE_DIFF BLOCK reason=PROTECTED_PATH files=2/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
