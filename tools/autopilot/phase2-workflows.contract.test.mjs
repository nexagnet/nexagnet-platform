// Khoa bat bien cua ba workflow Phase 2 (reviewer / repair / autonomy) bang doc van ban — repo khong co
// parser YAML o goc. Ca ba chay ban tren NHANH MAC DINH (workflow_run / repository_dispatch), nen sai lech
// chi lo ra SAU merge. Bai nay keo no ve truoc merge.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  DISPATCH_EVENTS,
  MAX_REPAIR_ROUNDS,
  REQUIRED_CHECKS,
  REVIEWER_RUN_NAME_PREFIX,
  REVIEWER_WORKFLOW_PATH,
  TRUSTED_BOT_LOGIN,
} from './autopilot-core.mjs';
import { REVIEW_SCHEMA } from './review-result.mjs';

const read = (relative) =>
  readFileSync(new URL(relative, import.meta.url), 'utf8').replaceAll('\r\n', '\n');

// Bo comment de cau chu giai thich khong lam test xanh/do gia.
const stripComments = (text) =>
  text
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .map((line) => (/^\s*-?\s*uses:/.test(line) ? line.replace(/\s+#.*$/, '') : line))
    .join('\n');

const load = (file) => {
  const code = stripComments(read(`../../.github/workflows/${file}`));
  const job = (name) => {
    const match = new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z-]+:\\n|(?![\\s\\S]))`, 'm').exec(
      code,
    );
    assert.ok(match, `${file}: khong thay job ${name}`);
    return match[1];
  };
  return { code, job };
};

const reviewer = load('autopilot-reviewer.yml');
const repair = load('autopilot-repair.yml');
const autonomy = load('autopilot-autonomy.yml');
const builder = load('autopilot-builder.yml');
const all = { reviewer, repair, autonomy };

const jobsOf = (file) =>
  [...file.code.matchAll(/^ {2}([a-z-]+):\n {4}name:/gm)].map((match) => match[1]);

const claudeInputs = (job) => ({
  allowed: /--allowedTools "([^"]+)"/.exec(job)[1].split(','),
  disallowed: /--disallowedTools "([^"]+)"/.exec(job)?.[1].split(',') ?? [],
});

test('trigger tin cay: reviewer = workflow_run cua `ci` khi xong; repair/autonomy = repository_dispatch', () => {
  const on = (file) => /^on:\n([\s\S]*?)^\S/m.exec(file.code)[1].trimEnd();
  assert.equal(on(reviewer), '  workflow_run:\n    workflows: [ci]\n    types: [completed]');
  assert.equal(on(repair), `  repository_dispatch:\n    types: [${DISPATCH_EVENTS.repair}]`);
  assert.equal(
    on(autonomy),
    `  repository_dispatch:\n    types: [${DISPATCH_EVENTS.mergeEvaluate}]`,
  );
  // Chi PR that su xong va thanh cong moi cap runner.
  assert.match(
    reviewer.job('preflight'),
    /if: github\.event\.workflow_run\.event == 'pull_request' && github\.event\.workflow_run\.conclusion == 'success'\n/,
  );
  for (const [name, file] of Object.entries(all)) {
    assert.doesNotMatch(
      file.code,
      /pull_request_target|issue_comment|workflow_dispatch|^ {2}pull_request:|^ {2}issues:|^ {2}push:/m,
      `${name}: khong co kenh kich hoat phu / pull_request_target`,
    );
  }
});

test('exact-head binding: run-name, checkout theo SHA, kiem HEAD, bao cao nhan dung head_sha', () => {
  assert.equal(
    /^run-name: (.+)$/m.exec(reviewer.code)[1],
    `${REVIEWER_RUN_NAME_PREFIX} \${{ github.event.workflow_run.head_sha }}`,
  );
  assert.match(reviewer.job('review'), /ref: \$\{\{ needs\.preflight\.outputs\.head_sha \}\}\n/);
  assert.match(reviewer.job('review'), /\[ "\$\(git rev-parse HEAD\)" = "\$EXPECTED_HEAD" \]/);
  assert.match(reviewer.job('report'), /HEAD_SHA: \$\{\{ needs\.preflight\.outputs\.head_sha \}\}/);
  assert.match(repair.job('repair'), /ref: \$\{\{ needs\.preflight\.outputs\.head_sha \}\}\n/);
  assert.match(repair.job('repair'), /\[ "\$\(git rev-parse HEAD\)" = "\$EXPECTED_HEAD" \]/);
  assert.equal(REVIEWER_WORKFLOW_PATH, '.github/workflows/autopilot-reviewer.yml');
  assert.match(read('./review-report.mjs'), /expectedHeadSha: headSha/);
});

test('reviewer: cong diff/protected-path nam TRUOC secret — preflight chan, chi `RUN` moi toi job Claude', () => {
  const preflight = reviewer.job('preflight');
  const review = reviewer.job('review');
  // Secret Claude chi o job `review`; job `review` chi chay khi preflight tat dinh tra RUN.
  assert.doesNotMatch(preflight, /CLAUDE_CODE_OAUTH_TOKEN|AUTOPILOT_APP_PRIVATE_KEY/);
  assert.match(review, /needs: preflight\n/);
  assert.match(review, /if: needs\.preflight\.outputs\.decision == 'RUN'\n/);
  assert.match(preflight, /pull-requests: read\n/);
  assert.match(preflight, /run: node tools\/autopilot\/reviewer-preflight\.mjs\n/);

  // Trong ma preflight: doc DAY DU diff, dung CHINH ham protected-path chuan, va hai cong do nam
  // TRUOC cong tra `decision: 'RUN'` (cong sau cung).
  const source = read('./reviewer-preflight.mjs');
  assert.match(source, /import \{ protectedPathsInPullFiles \} from '\.\/policy\.mjs'/);
  assert.match(read('./policy.mjs'), /import \{ isProtectedPath \} from '\.\/validate-diff\.mjs'/);
  assert.match(read('./evidence.mjs'), /\/pulls\/\$\{pr\.number\}\/files/);
  const at = (needle) => {
    const index = source.indexOf(needle);
    assert.ok(index >= 0, `reviewer-preflight.mjs thieu: ${needle}`);
    return index;
  };
  const run = at("decision: 'RUN',");
  assert.ok(at("block('DIFF_INCOMPLETE'") < run, 'DIFF_INCOMPLETE phai truoc RUN');
  assert.ok(at("block('PROTECTED_PATH'") < run, 'PROTECTED_PATH phai truoc RUN');
  assert.ok(at('loadPullFiles({') < at('protectedPathsInPullFiles(files)'));
  assert.ok(at('protectedPathsInPullFiles(files)') < run);
  assert.ok(
    at("block('PROTECTED_PATH'") < at('latestTrustedReview(comments'),
    'cong diff phai truoc cong ALREADY_REVIEWED',
  );
});

test('reviewer chi doc: khong Edit/Write, khong token ghi, khong App key, khong chay ma PR', () => {
  const review = reviewer.job('review');
  assert.match(review, /permissions:\n {6}contents: read\n/);
  assert.doesNotMatch(
    review,
    /secrets\.AUTOPILOT_APP_PRIVATE_KEY|create-github-app-token|permission-/,
  );
  assert.doesNotMatch(review, /pnpm|setup-node|install --frozen-lockfile|setup-workspace|cache:/);
  assert.match(review, /persist-credentials: false\n/);
  assert.match(review, /fetch-depth: 0\n/);
  assert.match(
    review,
    /github_token: \$\{\{ github\.token \}\}/,
    'Claude chi giu GITHUB_TOKEN chi doc',
  );
  const { allowed, disallowed } = claudeInputs(review);
  for (const tool of allowed.filter((t) => t.startsWith('Bash')))
    assert.match(tool, /^Bash\(git (diff|log|show|status):\*\)$/, tool);
  for (const tool of ['Edit', 'Write']) {
    assert.ok(!allowed.includes(tool), `reviewer khong duoc ${tool}`);
    assert.ok(disallowed.includes(tool), `reviewer phai deny ${tool}`);
  }
  assert.ok(disallowed.includes('WebFetch') && disallowed.includes('WebSearch'));
});

test('structured output: --json-schema trung khop REVIEW_SCHEMA, doc bang structured_output', () => {
  const review = reviewer.job('review');
  const schema = JSON.parse(/--json-schema '([^']+)'/.exec(review)[1]);
  assert.deepEqual(schema, JSON.parse(JSON.stringify(REVIEW_SCHEMA)));
  assert.match(review, /result: \$\{\{ steps\.claude\.outputs\.structured_output \}\}/);
  assert.match(reviewer.job('report'), /REVIEW_OUTPUT: \$\{\{ needs\.review\.outputs\.result \}\}/);
  // Dau ra cua model chi di qua env, khong noi vao dong lenh.
  assert.doesNotMatch(reviewer.job('report'), /run: .*\$\{\{ needs\.review\.outputs\.result/);
});

test('bot tin cay: dung MOT ten bot, khong allowed_bots "*"; comment do `report` (token App) dang', () => {
  assert.equal(TRUSTED_BOT_LOGIN, 'nexagnet-autopilot-v4[bot]');
  for (const [name, job] of [
    ['reviewer', reviewer.job('review')],
    ['repair', repair.job('repair')],
  ]) {
    assert.match(job, /allowed_bots: nexagnet-autopilot-v4\n/, name);
    assert.doesNotMatch(job, /allowed_bots: '?\*/, name);
  }
  const report = reviewer.job('report');
  assert.match(report, /uses: actions\/create-github-app-token@[0-9a-f]{40}\n/);
  assert.match(report, /APP_TOKEN: \$\{\{ steps\.app-token\.outputs\.token \}\}/);
  assert.match(
    read('./review-report.mjs'),
    /write\.post\(`\/repos\/\$\{repository\}\/issues\/\$\{prNumber\}\/comments`/,
  );
});

test('repair: sua CHINH nhanh cua PR — Claude chi commit cuc bo, khong token ghi, push o job tat dinh', () => {
  const job = repair.job('repair');
  assert.doesNotMatch(
    job,
    /secrets\.AUTOPILOT_APP_PRIVATE_KEY|create-github-app-token|permission-/,
  );
  assert.match(job, /permissions:\n {6}contents: read\n/);
  assert.match(job, /github_token: \$\{\{ github\.token \}\}/);
  const { allowed } = claudeInputs(job);
  for (const tool of ['Edit', 'Write']) assert.ok(allowed.includes(tool));
  assert.ok(allowed.includes('Bash(git commit:*)') && allowed.includes('Bash(git add:*)'));
  assert.ok(
    !allowed.some((tool) => /push|checkout|switch|branch|remote|config/.test(tool)),
    'Claude khong co duong push/doi nhanh',
  );

  const publish = repair.job('publish');
  assert.match(publish, /ref: main\n/);
  assert.doesNotMatch(
    publish,
    /git (checkout|switch) /,
    'khong dua ma cua nhanh PR vao cay lam viec',
  );
  assert.match(publish, /node tools\/autopilot\/repair-publish\.mjs/);
  assert.match(publish, /secrets\.AUTOPILOT_APP_PRIVATE_KEY/);
  // Push CHINH nhanh cua PR, fast-forward; khong mo PR moi, khong force.
  const script = read('./repair-publish.mjs');
  assert.match(script, /`\$\{CANDIDATE_REF\}:refs\/heads\/\$\{branch\}`/);
  assert.doesNotMatch(script, /--force|-f\b|\+refs\/heads\/\$\{branch\}:/);
  assert.doesNotMatch(repair.code, /gh pr create|pulls" -f|\/pulls`? *-X POST|gh pr merge/);
  assert.match(read('./repair-preflight.mjs'), /branch: pr\.head\.ref/);
});

test('retry ceiling = 2 vong Repair, dem bang marker cua bot, vuot -> NEEDS_HUMAN', () => {
  assert.equal(MAX_REPAIR_ROUNDS, 2);
  assert.match(read('./policy.mjs'), /attemptsUsed >= MAX_REPAIR_ROUNDS/);
  assert.match(read('./policy.mjs'), /action: 'NEEDS_HUMAN', reason: 'REPAIR_CEILING'/);
  assert.doesNotMatch(repair.code, /MAX_REPAIR|attempts? *[<>]=? *\d/);
});

test('protected paths: deny cua Repair ⊇ deny cua Builder, giu sandbox va env scrub y het Builder', () => {
  const deny = (job) => {
    const settings = /settings: \|\n([\s\S]*?)\n {10}claude_args:/.exec(job)[1];
    return JSON.parse(settings).permissions.deny;
  };
  const builderDeny = deny(builder.job('build'));
  const repairDeny = deny(repair.job('repair'));
  for (const rule of builderDeny) assert.ok(repairDeny.includes(rule), `Repair thieu deny ${rule}`);
  assert.deepEqual(
    repairDeny.filter((rule) => /^(Write|MultiEdit|NotebookEdit)\(/.test(rule)),
    [],
    'luat duong dan phai viet bang Edit(...)',
  );
  for (const tool of ['Edit', 'Write']) assert.ok(!repairDeny.includes(tool));

  for (const [name, job] of [
    ['reviewer', reviewer.job('review')],
    ['repair', repair.job('repair')],
  ]) {
    const install = /sudo apt-get install -y ([a-z ]+)\n/.exec(job);
    const sysctl =
      /if \[ -f \/proc\/sys\/kernel\/apparmor_restrict_unprivileged_userns \]; then\n +sudo sysctl -w kernel\.apparmor_restrict_unprivileged_userns=0\n +fi\n/.exec(
        job,
      );
    const claude = job.indexOf('uses: anthropics/claude-code-action@');
    assert.deepEqual(install[1].split(' ').sort(), ['bubblewrap', 'socat'], name);
    assert.ok(
      install.index < sysctl.index && sysctl.index < claude,
      `${name}: thu tu cai -> sysctl -> Claude`,
    );
    assert.match(job, /CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1'\n/, name);
    assert.match(job, /show_full_output: 'false'\n/, name);
    assert.doesNotMatch(job, /show_full_output: '?true/, name);
  }
  assert.doesNotMatch(
    repair.job('repair'),
    /setup-workspace|cache:/,
    'job agent khong ghi cache dung chung',
  );
  const script = read('./repair-publish.mjs');
  assert.match(script, /isProtectedPath/);
  assert.match(script, /validateDiff\(\{ files: input\.prFiles/);
});

test('dung 7 check bat buoc = dung cac job cua ci.yml, nhan merge khong the lech', () => {
  const ci = read('../../.github/workflows/ci.yml');
  const jobs = [...ci.slice(ci.indexOf('\njobs:')).matchAll(/^ {2}([a-z0-9-]+):\n/gm)].map(
    (m) => m[1],
  );
  assert.deepEqual([...REQUIRED_CHECKS], jobs);
  assert.equal(REQUIRED_CHECKS.length, 7);
  assert.match(read('./policy.mjs'), /for \(const name of REQUIRED_CHECKS\)/);
});

test('R0/R1 tu merge, R2 cho nguoi, R3 block — chi o merge-evaluate, sau Reviewer PASS', () => {
  const evaluate = read('./merge-evaluate.mjs');
  const policy = read('./policy.mjs');
  assert.match(policy, /if \(risk === 'R3'\) return \{ action: 'BLOCK'/);
  assert.match(policy, /if \(risk === 'R2'\) return \{ action: 'WAIT_HUMAN'/);
  assert.match(evaluate, /merge_method: 'merge'/);
  assert.match(evaluate, /sha: headSha/, 'merge phai kem sha = HEAD da review');
  // Merge chi qua endpoint merge, va chi ma nay goi no.
  const sources = readdirSync(new URL('./', import.meta.url)).filter(
    (f) => f.endsWith('.mjs') && !f.includes('.test.') && !f.includes('fixtures'),
  );
  const withMerge = sources.filter((f) => /\/pulls\/\$\{[^}]+\}\/merge/.test(read(`./${f}`)));
  assert.deepEqual(withMerge, ['merge-evaluate.mjs']);
  // Dispatch merge-evaluate chi khi verdict PASS.
  const report = read('./review-report.mjs');
  assert.equal(report.match(/DISPATCH_EVENTS\.mergeEvaluate/g).length, 1);
  assert.match(
    report,
    /if \(review\.verdict === 'PASS'\) \{\n\s+await write\.post\(`\/repos\/\$\{repository\}\/dispatches`, \{\n\s+event_type: DISPATCH_EVENTS\.mergeEvaluate/,
  );
  assert.match(
    policy,
    /if \(!review \|\| review\.verdict !== 'PASS'\) return \{ action: 'BLOCK', reason: 'REVIEW_NOT_PASS' \}/,
  );
});

test('khong merge/deploy tu workflow: khong lenh merge, khong auto-merge, khong deploy', () => {
  for (const [name, file] of Object.entries(all)) {
    assert.doesNotMatch(
      file.code,
      // `(?!-)`: duong dan `tools/autopilot/merge-evaluate.mjs` la ten tep, khong phai endpoint merge.
      /\/merge\b(?!-)|gh pr merge|gh pr ready|--auto\b|enablePullRequestAutoMerge|auto_merge/i,
      `${name}: workflow khong tu merge`,
    );
    assert.doesNotMatch(
      file.code,
      /deploy-tenant|gh workflow run|reusable-deploy|environment:/,
      `${name}: khong deploy`,
    );
  }
  assert.doesNotMatch(autonomy.code, /anthropics\/claude-code-action/, 'autonomy khong goi model');
});

test('quyen: GITHUB_TOKEN chi doc, App chi contents/issues/pull-requests, khong OIDC/workflows/admin/deploy', () => {
  for (const [name, file] of Object.entries(all)) {
    assert.match(
      file.code,
      /^permissions:\n {2}contents: read\n/m,
      `${name}: GITHUB_TOKEN mac dinh chi doc`,
    );
    const tokenWrites = file.code
      .split('\n')
      .filter((line) => /^\s+[a-z-]+: write\s*$/.test(line) && !/permission-/.test(line));
    assert.deepEqual(tokenWrites, [], `${name}: GITHUB_TOKEN khong duoc ghi`);
    assert.doesNotMatch(file.code, /id-token/, `${name}: khong OIDC`);
    assert.doesNotMatch(
      file.code,
      /permission-(workflows|administration|actions|deployments|checks|statuses|packages|secrets|environments)/,
      name,
    );
    const granted = new Set([...file.code.matchAll(/permission-([a-z-]+):/g)].map((m) => m[1]));
    for (const permission of granted)
      assert.ok(
        ['contents', 'issues', 'pull-requests'].includes(permission),
        `${name}: ${permission}`,
      );
    const tokenScopes = new Set(
      [...file.code.matchAll(/^\s{6}([a-z-]+): (read|none)\s*$/gm)].map((m) => m[1]),
    );
    for (const scope of tokenScopes)
      assert.ok(
        ['contents', 'actions', 'checks', 'pull-requests', 'issues'].includes(scope),
        `${name}: ${scope}`,
      );
  }
  assert.equal(repair.job('repair').includes('permission-'), false);
  assert.equal(reviewer.job('review').includes('permission-'), false);
});

test('token App duc bang client-id; bi mat dung dung noi: App key chi o job ghi, Claude token chi o job agent', () => {
  for (const [name, file] of Object.entries(all)) {
    assert.doesNotMatch(file.code, /app-id:/, name);
    const uses = file.code.match(/actions\/create-github-app-token@\S+/g) ?? [];
    assert.equal(
      file.code.match(/client-id: \$\{\{ vars\.AUTOPILOT_APP_CLIENT_ID \}\}/g)?.length ?? 0,
      uses.length,
      name,
    );
    const secrets = new Set(file.code.match(/secrets\.[A-Z_]+/g));
    for (const secret of secrets)
      assert.ok(
        ['secrets.AUTOPILOT_APP_PRIVATE_KEY', 'secrets.CLAUDE_CODE_OAUTH_TOKEN'].includes(secret),
        `${name}: ${secret}`,
      );
  }
  const holders = (secret) =>
    Object.entries(all).flatMap(([name, file]) =>
      jobsOf(file)
        .filter((job) => file.job(job).includes(secret))
        .map((job) => `${name}.${job}`),
    );
  assert.deepEqual(holders('secrets.AUTOPILOT_APP_PRIVATE_KEY').sort(), [
    'autonomy.evaluate',
    'repair.publish',
    'reviewer.report',
  ]);
  assert.deepEqual(holders('secrets.CLAUDE_CODE_OAUTH_TOKEN').sort(), [
    'repair.repair',
    'reviewer.review',
  ]);
  assert.doesNotMatch(autonomy.code, /CLAUDE_CODE_OAUTH_TOKEN/);
});

test('moi action ben ngoai duoc ghim SHA 40 ky tu (tru hai action cai moi truong nhu Builder)', () => {
  for (const [name, file] of Object.entries(all)) {
    for (const [, action] of file.code.matchAll(/^\s*-?\s*uses: (\S+)$/gm)) {
      if (action.startsWith('./')) continue;
      if (['pnpm/action-setup@v4', 'actions/setup-node@v4'].includes(action)) continue;
      assert.match(action, /@[0-9a-f]{40}$/, `${name}: ${action}`);
    }
  }
});

test('Builder khong bi dong toi: van khong co job/kenh Phase 2 trong autopilot-builder.yml', () => {
  assert.doesNotMatch(
    builder.code,
    /workflow_run|repository_dispatch|autopilot-reviewer|autopilot-repair|merge-evaluate/,
  );
  assert.match(builder.code, /^on:\n {2}issues:\n {4}types: \[labeled\]/m);
});
