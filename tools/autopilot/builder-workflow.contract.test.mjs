// Khoa bat bien cua .github/workflows/autopilot-builder.yml bang doc van ban (repo khong co parser
// YAML o goc). Workflow chi nghe `issues`, ma event `issues` luon chay ban cua `main` — nen sai lech
// chi lo ra SAU merge. Bai nay keo no ve truoc merge.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const WORKFLOW = readFileSync(
  new URL('../../.github/workflows/autopilot-builder.yml', import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n');

// Bo comment de cau chu giai thich khong lam test xanh/do gia.
const CODE = WORKFLOW.split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  // Chu thich cuoi dong chi cat o dong `uses:` ghim SHA (`# v7.0.1`); cat cho khac se an `#$ISSUE`.
  .map((line) => (/^\s*-?\s*uses:/.test(line) ? line.replace(/\s+#.*$/, '') : line))
  .join('\n');

const job = (name) => {
  const match = new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z-]+:\\n|(?![\\s\\S]))`, 'm').exec(
    CODE,
  );
  assert.ok(match, `khong thay job ${name}`);
  return match[1];
};

test('kich hoat DUY NHAT bang issues.labeled, va chi nhan autopilot:ready moi chay', () => {
  const on = /^on:\n([\s\S]*?)^\S/m.exec(CODE)[1];
  assert.equal(on.trimEnd(), '  issues:\n    types: [labeled]');
  assert.match(job('preflight'), /if: github\.event\.label\.name == 'autopilot:ready'\n/);
  assert.doesNotMatch(CODE, /agent:ready|agent:claude/, 'khong duoc dung chung kenh voi V2/V3');
  assert.match(job('build'), /if: needs\.preflight\.outputs\.decision == 'RUN'\n/);
});

test('GITHUB_TOKEN chi doc; quyen ghi chi o token App; khong OIDC', () => {
  assert.match(CODE, /^permissions:\n {2}contents: read\n/m);
  const tokenWrites = CODE.split('\n').filter(
    (line) => /^\s+[a-z-]+: write\s*$/.test(line) && !/permission-/.test(line),
  );
  assert.deepEqual(tokenWrites, []);
  assert.doesNotMatch(CODE, /id-token/);
  assert.doesNotMatch(CODE, /permission-workflows|permission-administration/);
});

test('token App duc bang client-id, khong dung App ID cu', () => {
  const uses = CODE.match(/actions\/create-github-app-token@\S+/g) ?? [];
  assert.equal(uses.length, 2);
  assert.equal(CODE.match(/client-id: \$\{\{ vars\.AUTOPILOT_APP_CLIENT_ID \}\}/g)?.length, 2);
  assert.doesNotMatch(CODE, /app-id:/);
});

test('chi dung dung ba bi mat cua V4, khong secret production', () => {
  const secrets = new Set(CODE.match(/secrets\.[A-Z_]+/g));
  assert.deepEqual([...secrets].sort(), [
    'secrets.AUTOPILOT_APP_PRIVATE_KEY',
    'secrets.CLAUDE_CODE_OAUTH_TOKEN',
  ]);
});

test('Claude Code Action: che do tag theo nhan, nhanh autopilot/ tu main, khong full output', () => {
  const build = job('build');
  assert.match(build, /uses: anthropics\/claude-code-action@[0-9a-f]{40}\n/);
  assert.match(build, /claude_code_oauth_token: \$\{\{ secrets\.CLAUDE_CODE_OAUTH_TOKEN \}\}/);
  assert.match(build, /github_token: \$\{\{ steps\.app-token\.outputs\.token \}\}/);
  assert.match(build, /label_trigger: autopilot:ready\n/);
  assert.match(build, /base_branch: main\n/);
  assert.match(build, /branch_prefix: autopilot\/\n/);
  assert.match(build, /show_full_output: 'false'\n/);
  // Co input `prompt` thi action chuyen sang che do agent va KHONG tao nhanh.
  assert.doesNotMatch(build, /^ {10}prompt:/m);
  assert.doesNotMatch(
    build,
    /setup-workspace|cache:/,
    'job chay agent khong duoc ghi cache dung chung',
  );
});

// Env scrub chay Bash trong sandbox, can CA bubblewrap LAN socat: thieu bubblewrap thi action chet
// truoc khi model chay (run 37091975076), thieu socat thi moi lenh Bash bi tu choi (run 37096635786).
test('bubblewrap + socat duoc cai TRUOC buoc Claude, va env scrub van bat', () => {
  const build = job('build');
  const install = /sudo apt-get install -y ([a-z ]+)\n/.exec(build);
  const claude = build.indexOf('uses: anthropics/claude-code-action@');
  assert.ok(install, 'thieu buoc cai phu thuoc sandbox');
  assert.deepEqual(install[1].split(' ').sort(), ['bubblewrap', 'socat']);
  assert.ok(install.index < claude, 'phu thuoc sandbox phai duoc cai truoc buoc Claude');
  assert.match(build, /CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1'\n/);
});

test('Claude duoc Edit + Write va Bash toi thieu; cam sua mat phang dieu khien', () => {
  const allowed = /--allowedTools "([^"]+)"/.exec(job('build'))[1].split(',');
  // Thieu Edit/Write thi Builder khong sua duoc tep nao (run 37096635786).
  for (const tool of ['Edit', 'Write']) assert.ok(allowed.includes(tool), `thieu ${tool}`);
  for (const tool of allowed.filter((name) => !['Edit', 'Write'].includes(name)))
    assert.match(tool, /^Bash\((pnpm|node|git (status|diff|log|show)):\*\)$/, tool);

  const settings = /settings: \|\n([\s\S]*?)\n {10}claude_args:/.exec(job('build'))[1];
  const { deny } = JSON.parse(settings).permissions;
  for (const path of [
    '.github/**',
    'deploy/**',
    'infra/**',
    'tools/autopilot/**',
    '**/AGENTS.md',
    '**/CLAUDE.md',
    '**/.claude/**',
    '.mcp.json',
  ]) {
    // Luat `Edit(<duong dan>)` ap cho MOI cong cu sua tep, gom ca Write � day la luat duy nhat
    // Claude Code xet khi kiem quyen ghi tep.
    assert.ok(deny.includes(`Edit(${path})`), `thieu deny Edit(${path})`);
  }
  // `Write(<duong dan>)` duoc nhan nhung KHONG BAO GIO duoc xet: co no la an toan gia. Va khong
  // duoc deny tron `Edit`/`Write` (se khoa luon viec sua ma nguon).
  assert.deepEqual(
    deny.filter((rule) => /^(Write|MultiEdit|NotebookEdit)\(/.test(rule)),
    [],
    'luat duong dan phai viet bang Edit(...)',
  );
  for (const tool of ['Edit', 'Write']) assert.ok(!deny.includes(tool), `khong deny tron ${tool}`);
  const prompt = /--append-system-prompt "([^"]+)"/.exec(job('build'))[1];
  for (const phrase of [
    'Never merge',
    'never deploy',
    'never open a pull request',
    'do not guess',
    'focused tests',
  ]) {
    assert.ok(prompt.includes(phrase), `prompt thieu: ${phrase}`);
  }
});

test('publish: validate tu ban main tren runner sach, roi mo DUNG MOT PR draft', () => {
  const publish = job('publish');
  assert.match(publish, /ref: main\n/);
  assert.match(
    publish,
    /node tools\/autopilot\/validate-diff\.mjs --base origin\/main --branch "\$AGENT_BRANCH" --risk "\$RISK"/,
  );
  assert.doesNotMatch(
    publish,
    /git (checkout|switch) /,
    'khong duoc dua ma cua nhanh agent vao cay lam viec',
  );
  assert.match(publish, /if: steps\.validate\.outputs\.decision == 'PASS'/);
  assert.match(publish, /state=open&head=/, 'phai kiem PR da ton tai truoc khi mo');
  assert.match(publish, /-f title="\[autopilot\] \$ISSUE_TITLE"/);
  assert.match(publish, /"Closes #\$ISSUE_NUMBER"/);
  assert.match(publish, /-F draft=true/);
  assert.match(publish, /labels\[\]=autopilot:generated/);
  assert.match(
    publish,
    /if \[ "\$NEEDS_HUMAN" = "true" \]; then labels\+=\(-f "labels\[\]=needs-human"\)/,
  );
});

test('khong merge, khong deploy, khong kenh kich hoat phu', () => {
  // Lenh, khong phai cau chu: than PR co ghi "No auto-merge".
  assert.doesNotMatch(
    CODE,
    /\/merge\b|gh pr merge|gh pr ready|--auto\b|enablePullRequestAutoMerge|auto_merge/i,
  );
  assert.doesNotMatch(
    CODE,
    /deploy-tenant|gh workflow run|workflow_dispatch|repository_dispatch|pull_request_target/,
  );
});
