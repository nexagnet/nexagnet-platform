// Repair publish: luat (ham thuan) + CLI that tren repo git that (remote cuc bo) va may chu GitHub gia.

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MAX_REPAIR_COMMITS, evaluateRepairCandidate } from './repair-publish.mjs';

const HEAD = 'a'.repeat(40);
const clean = {
  headSha: HEAD,
  branchTip: HEAD,
  descendant: true,
  commitCount: 1,
  mergeCount: 0,
  netFiles: ['apps/api/src/x.ts'],
  commitFiles: ['apps/api/src/x.ts'],
  prFiles: ['apps/api/src/x.ts', 'apps/api/src/y.ts'],
  risk: 'R1',
};
const verdict = (overrides) => evaluateRepairCandidate({ ...clean, ...overrides });

test('Repair publish: bundle sach tren dung HEAD -> PUSH', () => {
  assert.deepEqual(verdict({}), { decision: 'PUSH', reason: 'OK', escalate: false, blocked: [] });
  assert.equal(verdict({ risk: 'R2' }).decision, 'PUSH');
});

test('Repair publish: HEAD da doi -> bo, KHONG escalate (HEAD moi co chu trinh rieng)', () => {
  assert.deepEqual(verdict({ branchTip: 'b'.repeat(40) }), {
    decision: 'BLOCK',
    reason: 'HEAD_MOVED',
    escalate: false,
    blocked: [],
  });
  assert.equal(verdict({ branchTip: null }).reason, 'HEAD_MOVED');
});

test('Repair publish: khong hau due / khong thay doi / merge commit / qua nhieu commit -> NEEDS_HUMAN', () => {
  assert.equal(verdict({ descendant: false }).reason, 'NOT_DESCENDANT');
  assert.equal(verdict({ commitCount: 0 }).reason, 'NO_CHANGES');
  assert.equal(verdict({ netFiles: [] }).reason, 'NO_CHANGES');
  assert.equal(verdict({ mergeCount: 1 }).reason, 'MERGE_COMMITS');
  assert.equal(verdict({ commitCount: MAX_REPAIR_COMMITS + 1 }).reason, 'TOO_MANY_COMMITS');
  for (const reason of ['NOT_DESCENDANT', 'NO_CHANGES', 'MERGE_COMMITS']) {
    assert.equal(
      verdict(
        reason === 'NO_CHANGES'
          ? { commitCount: 0 }
          : reason === 'MERGE_COMMITS'
            ? { mergeCount: 1 }
            : { descendant: false },
      ).escalate,
      true,
    );
  }
});

test('Repair publish: protected-path deny — rong ca khi Repair sua roi hoan lai trong lich su', () => {
  const touched = verdict({
    netFiles: ['.github/workflows/ci.yml'],
    commitFiles: ['.github/workflows/ci.yml'],
  });
  assert.deepEqual(
    [touched.decision, touched.reason, touched.escalate],
    ['BLOCK', 'PROTECTED_PATH', true],
  );
  assert.deepEqual(touched.blocked, ['.github/workflows/ci.yml']);

  const reverted = verdict({
    netFiles: ['apps/api/src/x.ts'],
    commitFiles: ['apps/api/src/x.ts', 'tools/autopilot/policy.mjs', 'apps/api/src/x.ts'],
  });
  assert.equal(reverted.reason, 'PROTECTED_PATH');
  assert.deepEqual(reverted.blocked, ['tools/autopilot/policy.mjs']);

  for (const path of [
    'deploy/a.sh',
    'infra/main.tf',
    '.claude/x.json',
    '.mcp.json',
    'AGENTS.md',
    'pkg/CLAUDE.md',
  ]) {
    assert.equal(verdict({ netFiles: [path], commitFiles: [path] }).reason, 'PROTECTED_PATH', path);
  }
  // Toan bo diff cua PR cung phai sach (cung luat validate-diff cua Builder).
  assert.equal(verdict({ prFiles: ['apps/a.ts', 'deploy/x'] }).reason, 'PROTECTED_PATH');
});

// ---- CLI that ----------------------------------------------------------------------------------

const SCRIPT = fileURLToPath(new URL('./repair-publish.mjs', import.meta.url));
const gitEnv = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};
const run = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...gitEnv } }).trim();

let root;
let api;
const apiCalls = [];

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'autopilot-repair-'));
  api = createServer((request, response) => {
    apiCalls.push(`${request.method} ${request.url}`);
    response.setHeader('content-type', 'application/json');
    response.end(request.method === 'GET' ? '[]' : '{}');
  });
  await new Promise((done) => api.listen(0, '127.0.0.1', done));
});
after(() => {
  api.close();
  rmSync(root, { recursive: true, force: true });
});

/** Dung remote + nhanh PR + workspace cua Repair (tao bundle) + workspace publish SACH. */
function scenario(name, writeCandidate) {
  const dir = join(root, name);
  mkdirSync(dir);
  const remote = join(dir, 'remote.git');
  run(dir, 'init', '--bare', '-b', 'main', remote);
  const seed = join(dir, 'seed');
  run(dir, 'clone', remote, seed);
  writeFileSync(join(seed, 'a.txt'), 'goc\n');
  run(seed, 'add', '-A');
  run(seed, 'commit', '-m', 'main');
  run(seed, 'branch', '-M', 'main');
  run(seed, 'push', 'origin', 'main');
  run(seed, 'checkout', '-b', 'autopilot/t');
  mkdirSync(join(seed, 'src'));
  writeFileSync(join(seed, 'src', 'x.ts'), 'v1\n');
  run(seed, 'add', '-A');
  run(seed, 'commit', '-m', 'builder');
  run(seed, 'push', 'origin', 'autopilot/t');
  const headSha = run(seed, 'rev-parse', 'HEAD');

  const repair = join(dir, 'repair');
  run(dir, 'clone', remote, repair);
  run(repair, 'checkout', '--detach', headSha);
  writeCandidate(repair);
  run(repair, 'branch', '-f', 'autopilot-repair', 'HEAD');
  const bundle = join(dir, 'repair.bundle');
  run(repair, 'bundle', 'create', bundle, 'autopilot-repair', `^${headSha}`);

  const publish = join(dir, 'publish');
  run(dir, 'clone', remote, publish);
  return { dir, remote, publish, headSha, bundle };
}

function publish({ publish: cwd, remote, headSha, bundle, dir }, overrides = {}) {
  const output = join(dir, 'github-output.txt');
  writeFileSync(output, '');
  return new Promise((done) => {
    const child = spawn(process.execPath, [SCRIPT], {
      cwd,
      env: {
        ...process.env,
        ...gitEnv,
        GITHUB_REPOSITORY: 'nexagnet/nexagnet-platform',
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_RUN_ID: '1',
        GITHUB_OUTPUT: output,
        GITHUB_API_URL: `http://127.0.0.1:${api.address().port}`,
        GITHUB_TOKEN: 'read',
        APP_TOKEN: '',
        PUSH_URL: remote,
        PR_NUMBER: '77',
        BRANCH: 'autopilot/t',
        HEAD_SHA: headSha,
        RISK: 'R1',
        BUNDLE_PATH: bundle,
        HAS_BUNDLE: 'true',
        REPAIR_RESULT: 'success',
        BASE_REF: 'origin/main',
        ...overrides,
      },
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => done({ code, stderr, output: readFileSync(output, 'utf8') }));
  });
}

const commitFile = (path, content) => (repo) => {
  mkdirSync(join(repo, path, '..'), { recursive: true });
  writeFileSync(join(repo, path), content);
  run(repo, 'add', '-A');
  run(repo, 'commit', '-m', 'repair');
};

test('CLI: Repair hop le -> push fast-forward len CHINH nhanh cua PR (khong tao nhanh/PR moi)', async () => {
  const s = scenario('ok', commitFile('src/x.ts', 'v2\n'));
  const result = await publish(s);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.output, /decision=PUSHED/);
  const tip = run(s.remote, 'rev-parse', 'refs/heads/autopilot/t');
  assert.notEqual(tip, s.headSha);
  assert.equal(
    run(s.remote, 'rev-parse', `${tip}^`),
    s.headSha,
    'commit moi nam NGAY tren head da review',
  );
  assert.equal(
    run(s.remote, 'for-each-ref', '--format=%(refname)').split('\n').sort().join(','),
    'refs/heads/autopilot/t,refs/heads/main',
  );
  assert.match(result.output, new RegExp(`new_head=${tip}`));
});

test('CLI: Repair cham .github -> KHONG push, escalate NEEDS_HUMAN qua API', async () => {
  const s = scenario('protected', commitFile('.github/workflows/evil.yml', 'on: push\n'));
  apiCalls.length = 0;
  const result = await publish(s, { APP_TOKEN: 'app' });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.output, /decision=BLOCK\nreason=PROTECTED_PATH/);
  assert.equal(
    run(s.remote, 'rev-parse', 'refs/heads/autopilot/t'),
    s.headSha,
    'nhanh PR khong bi dong toi',
  );
  assert.ok(
    apiCalls.some((c) => c.startsWith('POST') && c.endsWith('/issues/77/comments')),
    apiCalls.join('|'),
  );
  assert.ok(apiCalls.some((c) => c.startsWith('POST') && c.endsWith('/issues/77/labels')));
});

test('CLI: HEAD cua nhanh PR da doi sau review -> khong push, khong escalate', async () => {
  const s = scenario('moved', commitFile('src/x.ts', 'v2\n'));
  const other = join(s.dir, 'other');
  run(s.dir, 'clone', s.remote, other);
  run(other, 'checkout', 'autopilot/t');
  commitFile('src/z.ts', 'nguoi khac day\n')(other);
  run(other, 'push', 'origin', 'autopilot/t');
  const moved = run(s.remote, 'rev-parse', 'refs/heads/autopilot/t');
  apiCalls.length = 0;
  const result = await publish(s);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.output, /reason=HEAD_MOVED/);
  assert.equal(run(s.remote, 'rev-parse', 'refs/heads/autopilot/t'), moved);
  assert.deepEqual(apiCalls, []);
});

test('CLI: job Repair that bai / khong co commit -> NEEDS_HUMAN, khong push', async () => {
  const s = scenario('failed', commitFile('src/x.ts', 'v2\n'));
  for (const [overrides, reason] of [
    [{ REPAIR_RESULT: 'failure' }, 'REPAIR_JOB_FAILED'],
    [{ HAS_BUNDLE: 'false' }, 'NO_CHANGES'],
  ]) {
    apiCalls.length = 0;
    const result = await publish(s, { APP_TOKEN: 'app', ...overrides });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.output, new RegExp(`reason=${reason}`));
    assert.ok(apiCalls.some((c) => c.endsWith('/issues/77/comments') && c.startsWith('POST')));
    assert.equal(run(s.remote, 'rev-parse', 'refs/heads/autopilot/t'), s.headSha);
  }
});
