// KHOA CAU HINH cua `.github/workflows/claude-builder.yml` — chi nhung bat bien ma CHINH repo nay
// quyet dinh (#361: "tests for repository-owned invariants only"). Khong kiem hanh vi cua GitHub hay
// Anthropic; kiem rang ta KHONG noi long cai ma ranh gioi an ninh dua vao.
//
// Doc bang van ban, khong dung thu vien YAML — cung ly do voi `deploy/netviet/*.contract.test.mjs`:
// khong phu thuoc goi ngoai, de cai chan khong im lang bien mat sau mot lan doi dependency. Doi lai,
// bo tach khoi ben duoi chi hieu thut le 2 dau cach cua CHINH tep nay; tep doi dang thi test do, dung
// lam bo tach thong minh hon.
//
// Duong dan doi duoc bang bien moi truong de chay dot bien tren BAN SAO (khong dong vao working tree —
// pre-push kiem working tree, khong kiem commit).
//
// Hang rao cua phien Claude duoc kiem theo NGHIA, khong theo chuoi: moi duong dan cua mat phang dieu
// khien (ke ca tep MOI va tep o cap long) phai bi mot luat `Edit(...)` PHU, vung lam viec binh thuong
// thi KHONG bi phu, va cong cu MCP xoa tep — thu luat `Edit(...)` khong rang buoc — phai bi cam. Hai
// bai cuoi tep la DOI CHUNG AM chay moi lan: go tung guard khoi chinh sach that (theo nghia) va doi bo
// kiem bao dung loi — de "test co can that" khong chi la mot lan kiem dot bien luc viet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoFile = (rel) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const REPO_ROOT = repoFile('');
const WORKFLOW =
  process.env.AUTOPILOT_V3_WORKFLOW ?? repoFile('.github/workflows/claude-builder.yml');
const TEMPLATES = process.env.AUTOPILOT_V3_TEMPLATES ?? repoFile('.github/ISSUE_TEMPLATE');
const RUNBOOK = repoFile('docs/phat-trien/van-hanh/autopilot-v3-cloud-builder.md');

/** Ban ghim da audit (22/09/2026). Nang ban = sua o day + tai lieu van hanh, co y va qua review. */
const AUDITED_PINS = {
  'anthropics/claude-code-action': ['cfc3eb22bfed5c26ef66e3223c982af27e4524de', 'v1.0.231'],
  'actions/create-github-app-token': ['bcd2ba49218906704ab6c1aa796996da409d3eb1', 'v3.2.0'],
  'actions/checkout': ['3d3c42e5aac5ba805825da76410c181273ba90b1', 'v7.0.1'],
};

/**
 * Cong cu MCP co GHI ma ban action ghim cap cho phien o che do tag + `use_commit_signing: true`.
 * Nguon (doc 23/09/2026, dung SHA duoi): `src/modes/tag/index.ts` (danh sach `tagModeTools`),
 * `src/mcp/install-mcp-server.ts`, `src/mcp/github-file-ops-server.ts`. Nang ban action = doc lai ba
 * tep do va sua kiem ke nay; test do neu SHA ghim trong workflow khac SHA da kiem ke.
 */
const PINNED_ACTION_WRITE_TOOLS = {
  sha: 'cfc3eb22bfed5c26ef66e3223c982af27e4524de',
  // Tao tree XOA cho moi duong dan "nam trong repo" — luat `Edit(...)` khong rang buoc => phai CAM.
  mustDeny: ['mcp__github_file_ops__delete_files'],
  // Commit BYTE CUC BO cua chinh duong dan truyen vao => rao `Edit(...)` chan gian tiep. Phai GIU:
  // day la duong commit duy nhat cua agent (khong co Bash).
  pathBound: ['mcp__github_file_ops__commit_files'],
};

/**
 * Mat phang dieu khien — agent khong duoc TAO hay SUA (va, vi `delete_files` bi cam, khong XOA duoc).
 * Co y gom tep CHUA TON TAI va tep o CAP LONG: rao phai phu duong dan, khong chi tep dang co.
 */
const CONTROL_PLANE = [
  // Tep chi dan: system prompt dan toi AGENTS.md; Claude Code tu nap CLAUDE.md o goc, ban long (khi
  // lam viec trong thu muc do) va CLAUDE.local.md. Sua duoc = dau doc moi lan chay sau khi PR merge.
  'AGENTS.md',
  'CLAUDE.md',
  'CLAUDE.local.md',
  'apps/api/AGENTS.md',
  'apps/api/CLAUDE.md',
  'packages/tenant/CLAUDE.local.md',
  // Cau hinh runtime cua Claude Code: settings (deny + HOOK chay ngay trong buoc agent), rules, skills.
  '.claude/settings.json',
  '.claude/settings.local.json',
  '.claude/hooks/session-check.mjs',
  '.claude/rules/ecc/common/security.md',
  'apps/web/.claude/skills/probe/SKILL.md',
  // MCP cua du an — action luon bat `enableAllProjectMcpServers`.
  '.mcp.json',
  // Cong va khoa bat bien cua chinh V3.
  'tools/autopilot-v3/gate.mjs',
  'tools/autopilot-v3/claude-builder.contract.test.mjs',
  'tools/autopilot-v3/new-file.mjs',
  // Checkout: `.git/config` mang token App trong URL remote (upstream `replaceCheckoutCredentials`).
  '.git/config',
  '.git/hooks/pre-commit',
  // CI, ha tang, du lieu khach.
  '.github/workflows/claude-builder.yml',
  '.github/workflows/new-workflow.yml',
  '.github/ISSUE_TEMPLATE/agent-task.yml',
  'deploy/netviet/render-secrets.sh',
  'tenants/ultty/tenant.json',
  'tenants/new-tenant/data/knowledge.json',
];

/** Vung lam viec binh thuong — rao KHONG duoc nuot. Gom ca tep pilot R0 (tai lieu van hanh §6.1). */
const EDITABLE = [
  'apps/api/src/main.ts',
  'apps/web/app/page.tsx',
  'packages/shared/src/index.ts',
  'docs/README.md',
  'docs/phat-trien/van-hanh/autopilot-v3-pilot-log.md',
  'tools/git-hooks/pre-push.mjs',
  'README.md',
  'package.json',
];

/**
 * Dai dien cho danh sach BAT BUOC rao cua review doc lap PR #366 (AGENTS.md, CLAUDE.md, .github/**,
 * .claude/**, .mcp.json, tools/autopilot-v3/**, deploy/**, tenants/**) cong phan ban sua them. Doi chung
 * am go rao cua TUNG muc va doi bo kiem goi dung ten no — bo mot muc khoi `CONTROL_PLANE` cung do.
 */
const REQUIRED_PROTECTED = [
  'AGENTS.md',
  'CLAUDE.md',
  '.github/workflows/claude-builder.yml',
  '.claude/settings.json',
  '.mcp.json',
  'tools/autopilot-v3/gate.mjs',
  'deploy/netviet/render-secrets.sh',
  'tenants/ultty/tenant.json',
  'CLAUDE.local.md',
  'apps/api/AGENTS.md',
  'apps/web/.claude/skills/probe/SKILL.md',
  '.git/config',
];

/** Tep chi dan ma mot coding agent tu nap/doc — bat ke dang o cap nao. */
const INSTRUCTION_FILE = /(^|\/)(AGENTS|CLAUDE|CLAUDE\.local)\.md$/u;

const ALLOWED_SECRETS = ['CLAUDE_CODE_OAUTH_TOKEN', 'NEXAGENT_AUTOPILOT_PRIVATE_KEY'];

// --- doc + tach khoi -------------------------------------------------------------------------

const lines = readFileSync(WORKFLOW, 'utf8').replaceAll('\r', '').split('\n');
/** Bo dong chu thich tron dong. Chu thich cuoi dong (`uses: x@sha # v1`) duoc giu. */
const code = lines.filter((l) => !/^\s*#/u.test(l));
const text = code.join('\n');
const indentOf = (l) => l.length - l.trimStart().length;

/** Cac dong con cua dong `start` — dung o dong dau tien co thut le <= dong `start`. */
function childrenOf(arr, start) {
  const out = [];
  for (let i = start + 1; i < arr.length; i += 1) {
    const l = arr[i];
    if (l.trim() !== '' && indentOf(l) <= indentOf(arr[start])) break;
    out.push(l);
  }
  return out;
}

function topLevel(key) {
  const i = code.findIndex((l) => new RegExp(`^${key}:`, 'u').test(l));
  assert.ok(i >= 0, `thieu khoa goc \`${key}:\``);
  return { head: code[i], body: childrenOf(code, i) };
}

function job(name) {
  const i = code.findIndex((l) => new RegExp(`^ {2}${name}:\\s*$`, 'u').test(l));
  assert.ok(i >= 0, `thieu job \`${name}\``);
  return childrenOf(code, i);
}

function stepsOf(jobLines) {
  const steps = [];
  for (const l of jobLines) {
    if (/^ {6}- /u.test(l)) steps.push([l]);
    else if (steps.length > 0) steps.at(-1).push(l);
  }
  return steps;
}

/** Noi dung mot khoi `key: |` hoac `key: >-` trong mot tap dong. */
function blockScalar(arr, key) {
  const i = arr.findIndex((l) => new RegExp(`^\\s*${key}: [|>]-?\\s*$`, 'u').test(l));
  assert.ok(i >= 0, `thieu khoi \`${key}:\``);
  return childrenOf(arr, i)
    .map((l) => l.trim())
    .join('\n');
}

const valueOf = (arr, key) => {
  const hit = arr.map((l) => new RegExp(`^\\s*${key}:\\s*(.*)$`, 'u').exec(l)).find(Boolean);
  return hit ? hit[1].trim() : undefined;
};

// --- doc chinh sach deny cua phien Claude ------------------------------------------------------

/**
 * Nghia cua mot luat DENY `Edit(...)` theo tai lieu permissions cua Claude Code (muc "Read and Edit",
 * doc 23/09/2026): cu phap gitignore, neo o thu muc hien tai (= workspace cua runner). Chi nhan cac
 * dang ma tai lieu viet ro nghia; dang khac tra `null` va test DO — khong doan nghia mot luat:
 *
 *   `ten`, `**∕ten`          ten tran khop o MOI cap ("`Read(.env)` and `Read(**∕.env)` are
 *                            equivalent"), ke ca khi `ten` la thu muc cha
 *   `dir/**`, `**∕dir/**`    MOT doan thu muc: voi luat deny, khop thu muc `dir` o MOI cap
 *   `a/b/**`, `a/b.md`       nhieu doan: chi tai vi tri neo <goc>/a/b...
 *
 * (`∕` la de khong dong chu thich khoi; trong luat that la `/`.) Khong nhan: tien to `/` (luat trong
 * settings nguon user — noi action ghi — neo o ~/.claude/, KHONG phai workspace), `//`, `~/`, `!`,
 * va glob o giua (`*`, `?`, `[`, `{`).
 */
function parseEditRule(rule) {
  const m = /^Edit\((?:\.\/)?(.+)\)$/u.exec(rule);
  if (!m) return null;
  const segs = m[1].split('/');
  const plain = (s) => /^[^*?[\]\\!{}~]+$/u.test(s) && s !== '.' && s !== '..';
  const anyDepthName = (name) => (path) => path.split('/').includes(name);
  const anyDepthDir = (dir) => (path) => path.split('/').slice(0, -1).includes(dir);
  const [first, second] = segs;
  if (segs.length === 1 && plain(first)) return anyDepthName(first);
  if (segs.length === 2 && first === '**' && plain(second)) return anyDepthName(second);
  if (segs.length === 2 && plain(first) && second === '**') return anyDepthDir(first);
  if (segs.length === 3 && first === '**' && plain(second) && segs[2] === '**') {
    return anyDepthDir(second);
  }
  const anchored = segs.slice(0, -1).join('/');
  if (segs.length >= 3 && segs.at(-1) === '**' && segs.slice(0, -1).every(plain)) {
    return (path) => path.startsWith(`${anchored}/`);
  }
  if (segs.length >= 2 && segs.every(plain)) {
    const full = segs.join('/');
    return (path) => path === full || path.startsWith(`${full}/`);
  }
  return null;
}

/**
 * Dac ta mat phang dieu khien cho moi tep DANG CO, viet DOC LAP voi workflow. Co y NEO O GOC cho
 * `.github/`, `deploy/`, `tenants/` du luat deny mot doan khop o moi cap: mot thu muc long trung ten
 * (vd `apps/x/deploy/`) se lam bai quet cay DO — ma ung dung bi chan nham phai la mot quyet dinh co y,
 * khong im lang.
 */
function isControlPlane(path) {
  return (
    INSTRUCTION_FILE.test(path) ||
    path === '.mcp.json' ||
    path.split('/').slice(0, -1).includes('.claude') ||
    ['.github/', 'tools/autopilot-v3/', 'deploy/', 'tenants/'].some((root) => path.startsWith(root))
  );
}

/** Parse trong tung test (khong o muc module): dot bien lam hong JSON phai do o MOT BAI CO TEN. */
function sessionPermissions() {
  return JSON.parse(blockScalar(claudeStep, 'settings')).permissions ?? {};
}

const editRulesOf = (deny) =>
  deny
    .filter((rule) => /^Edit\b/u.test(rule))
    .map((rule) => ({ rule, covers: parseEditRule(rule) }));
const coveredBy = (rules, path) => rules.find(({ covers }) => covers?.(path));
/** Go MOI luat dang phu `path` — "go mot guard" theo NGHIA, khong theo chuoi. */
const withoutCoverageOf = (deny, path) => deny.filter((rule) => !parseEditRule(rule)?.(path));

// --- bo kiem THUAN: tra ve danh sach vi pham ----------------------------------------------------
// Chay tren chinh sach THAT (phai rong) va tren doi chung am o cuoi tep (phai bao DUNG loi) — nen
// doi chung am chay moi lan `pnpm test`, khong chi mot lan khi viet test.

const CLAUDE_ARGS_FLAGS = ['--append-system-prompt', '--max-turns'];

/**
 * `--allowedTools`/`--mcp-config` cap them cong cu ghi (vd `mcp__github__*` dung server GitHub MCP voi
 * token App — ghi thang, khong qua tep cuc bo); `--setting-sources` bo duoc nguon `user`, noi action
 * ghi `settings` (tuc ca danh sach deny); `--permission-mode`/`--dangerously-*` doi che do.
 */
function argsViolations(args) {
  const flags = [
    ...args.replace(/"[^"]*"|'[^']*'/gu, '""').matchAll(/(?:^|\s)(-{1,2}[A-Za-z][\w-]*)/gu),
  ]
    .map((m) => m[1])
    .sort();
  const ok = JSON.stringify(flags) === JSON.stringify(CLAUDE_ARGS_FLAGS);
  return ok && /--max-turns \d+/u.test(args)
    ? []
    : [`claude_args mang ${JSON.stringify(flags)}, chi duoc ${JSON.stringify(CLAUDE_ARGS_FLAGS)}`];
}

function mcpViolations(deny, pinnedSha) {
  const out = [];
  if (pinnedSha !== PINNED_ACTION_WRITE_TOOLS.sha) {
    out.push(`action @${pinnedSha} chua duoc kiem ke cong cu MCP ghi (PINNED_ACTION_WRITE_TOOLS)`);
  }
  for (const tool of PINNED_ACTION_WRITE_TOOLS.mustDeny) {
    if (!deny.includes(tool))
      out.push(`deny thieu ${tool} — no xoa duoc BAT KY tep nao trong repo`);
  }
  for (const tool of PINNED_ACTION_WRITE_TOOLS.pathBound) {
    const server = tool.split('__').slice(0, 2).join('__');
    for (const blocker of [tool, server, `${server}__*`]) {
      if (deny.includes(blocker)) out.push(`${blocker} chan mat ${tool} — agent khong commit duoc`);
    }
  }
  return out;
}

function shapeViolations(deny) {
  return deny.flatMap((rule) => {
    if (/^Edit\b/u.test(rule) && !parseEditRule(rule)) {
      return [`${rule}: dang khong co nghia ro — viet lai, dung de test doan`];
    }
    // Tai lieu: khi nap tep settings, Claude Code BO QUA luat `mcp__` co ngoac — im lang vo hieu
    // (loc theo tham so MCP phai dung --disallowedTools).
    if (/^mcp__.*\(/u.test(rule))
      return [`${rule}: luat mcp__ co ngoac bi bo qua khi nap settings`];
    return [];
  });
}

function controlPlaneViolations(deny) {
  const rules = editRulesOf(deny);
  return CONTROL_PLANE.filter((path) => !coveredBy(rules, path)).map((p) => `${p}: KHONG bi rao`);
}

function editableViolations(deny) {
  const rules = editRulesOf(deny);
  return EDITABLE.flatMap((path) => {
    const hit = coveredBy(rules, path);
    return hit ? [`${path}: bi ${hit.rule} chan nham`] : [];
  });
}

function treeViolations(deny, entries) {
  if (!entries.some(({ path }) => path === 'AGENTS.md')) {
    return ['khong thay AGENTS.md o goc — bo quet hong'];
  }
  const rules = editRulesOf(deny);
  return entries.flatMap(({ path, symlink }) => {
    // Tien de cua `commit_files`: no doc noi dung theo DICH cua symlink nhung ghi vao duong dan cua
    // LINK — mot symlink trong vung bi rao tro ra vung sua duoc se la duong vuot rao.
    if (symlink) return [`${path}: symlink`];
    const hit = coveredBy(rules, path);
    if (isControlPlane(path) && !hit) return [`${path}: KHONG bi rao`];
    if (!isControlPlane(path) && hit) return [`${path}: bi ${hit.rule} chan nham`];
    return [];
  });
}

/**
 * Muc sinh ra/cuc bo, khong nam trong cay agent nhan tu checkout. `.git` bo ca khi la TEP (worktree);
 * `.claude/worktrees` la cac lane cuc bo (gitignore).
 */
const WALK_SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'coverage']);

/** Moi tep trong mot cay, duong dan dang `a/b/c`. Khong theo symlink. */
function* walkTree(root, dir = '') {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (WALK_SKIP.has(entry.name) || path === '.claude/worktrees') continue;
    if (entry.isSymbolicLink()) yield { path, symlink: true };
    else if (entry.isDirectory()) yield* walkTree(root, path);
    else yield { path, symlink: false };
  }
}

const gate = job('gate');
const build = job('build');
const buildSteps = stepsOf(build);
const claudeIdx = buildSteps.findIndex((s) =>
  s.some((l) => l.includes('anthropics/claude-code-action@')),
);
const claudeStep = buildSteps[claudeIdx] ?? [];
const appTokenStep =
  buildSteps.find((s) => s.some((l) => l.includes('actions/create-github-app-token@'))) ?? [];
const gateIf = blockScalar(gate, 'if');
const LABEL = /github\.event\.label\.name == '([^']+)'/u.exec(gateIf)?.[1];
const pinnedActionSha = () => /anthropics\/claude-code-action@([0-9a-f]{40})/u.exec(text)?.[1];

// --- bat bien --------------------------------------------------------------------------------

test('kenh kich hoat DUY NHAT la issues.labeled — khong comment, khong PR, khong dispatch', () => {
  const on = topLevel('on');
  const keys = on.body.filter((l) => l.trim() !== '' && indentOf(l) === 2).map((l) => l.trim());
  assert.deepEqual(keys, ['issues:']);
  assert.match(on.body.join('\n'), /types: \[labeled\]/u);
  assert.doesNotMatch(
    text,
    /\b(pull_request_target|pull_request|issue_comment|workflow_run|workflow_dispatch|repository_dispatch|schedule|push)\s*:/u,
  );
});

test('quyen mac dinh rong; gate chi doc; build khong quyen; KHONG id-token o bat ky dau', () => {
  assert.ok(code.includes('permissions: {}'), 'goc phai khai `permissions: {}`');
  assert.ok(build.includes('    permissions: {}'), 'job build phai khai `permissions: {}`');
  const gatePerms = childrenOf(
    gate,
    gate.findIndex((l) => /^ {4}permissions:\s*$/u.test(l)),
  );
  assert.ok(gatePerms.length > 0, 'job gate phai khai quyen tuong minh');
  for (const l of gatePerms) assert.doesNotMatch(l, /write/u, `gate xin quyen ghi: ${l.trim()}`);
  assert.doesNotMatch(text, /id-token/u, 'job chua agent khong duoc dut token OIDC (GCP WIF)');
  assert.doesNotMatch(text, /write-all|read-all/u);
});

test('cong lop 1: nhan dung, nguoi gan la User VA la chu repo theo ID, Issue cua chu repo', () => {
  assert.ok(LABEL, 'if: cua gate phai so ten nhan');
  for (const clause of [
    "github.event.sender.type == 'User'",
    "format('{0}', github.event.sender.id) == github.repository_owner_id",
    "format('{0}', github.event.issue.user.id) == github.repository_owner_id",
    'github.triggering_actor == github.repository_owner',
    "github.event.issue.state == 'open'",
  ]) {
    assert.ok(gateIf.includes(clause), `if: cua gate thieu dieu kien: ${clause}`);
  }
  assert.doesNotMatch(
    gateIf,
    /\|\||!=/u,
    'if: cua gate chi duoc noi bang && (mot || la mot cua hau)',
  );
});

test('cong lop 2 chay trong job RIENG khong secret; build chi chay khi cong noi `true`', () => {
  assert.match(gate.join('\n'), /run: node tools\/autopilot-v3\/gate\.mjs/u);
  assert.doesNotMatch(gate.join('\n'), /secrets\./u, 'job gate khong duoc cham secret');
  assert.equal(valueOf(build, 'needs'), 'gate');
  assert.equal(
    valueOf(
      build.filter((l) => indentOf(l) === 4),
      'if',
    ),
    "needs.gate.outputs.authorized == 'true'",
  );
});

test('secret chi xuat hien trong job build, va chi hai secret da biet (dung chinh ta NEXAGENT)', () => {
  const used = [...text.matchAll(/secrets\.([A-Za-z0-9_]+)/gu)].map((m) => m[1]);
  assert.ok(used.length > 0);
  for (const name of used) assert.ok(ALLOWED_SECRETS.includes(name), `secret la: ${name}`);
  const inBuild = [...build.join('\n').matchAll(/secrets\.([A-Za-z0-9_]+)/gu)].length;
  assert.equal(inBuild, used.length, 'co secret nam ngoai job build');
  assert.doesNotMatch(text, /NEXAGNET/u, 'sai chinh ta: App/secret ten la NEXAGENT_*');
});

test('moi `uses:` ghim SHA 40 hex, dung ban da audit, tai lieu van hanh ghi cung ban ghim', () => {
  const uses = code
    .filter((l) => /^\s*(- )?uses:/u.test(l))
    .map((l) => l.replace(/^\s*(- )?uses:\s*/u, ''));
  assert.ok(uses.length >= 4);
  const runbook = readFileSync(RUNBOOK, 'utf8');
  for (const u of uses) {
    const m = /^([\w.-]+\/[\w.-]+)@([0-9a-f]{40}) # (v[\w.]+)$/u.exec(u);
    assert.ok(m, `uses khong ghim SHA 40 hex kem chu thich phien ban: ${u}`);
    const pin = AUDITED_PINS[m[1]];
    assert.ok(pin, `action chua duoc audit: ${m[1]}`);
    assert.deepEqual([m[2], m[3]], pin, `${m[1]} lech ban da audit`);
    assert.ok(runbook.includes(pin[0]), `tai lieu van hanh khong ghi SHA ${pin[0]} cua ${m[1]}`);
  }
});

test('token App xin DUNG contents/issues/pull-requests: write — khong workflows, khong gi khac', () => {
  const perms = appTokenStep
    .map((l) => /^\s*permission-([a-z-]+):\s*(\S+)/u.exec(l))
    .filter(Boolean)
    .map((m) => `${m[1]}=${m[2]}`)
    .sort();
  assert.deepEqual(perms, ['contents=write', 'issues=write', 'pull-requests=write']);
  assert.equal(valueOf(appTokenStep, 'client-id'), '${{ vars.NEXAGENT_AUTOPILOT_CLIENT_ID }}');
  assert.equal(
    valueOf(appTokenStep, 'private-key'),
    '${{ secrets.NEXAGENT_AUTOPILOT_PRIVATE_KEY }}',
  );
});

test('action Claude: ghi bang token App, chi doc comment cua chu repo, khong mo cua non-write/bot', () => {
  assert.ok(claudeStep.length > 0, 'thieu buoc anthropics/claude-code-action');
  assert.equal(valueOf(claudeStep, 'github_token'), '${{ steps.app-token.outputs.token }}');
  assert.equal(
    valueOf(claudeStep, 'claude_code_oauth_token'),
    '${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}',
  );
  assert.equal(valueOf(claudeStep, 'include_comments_by_actor'), '${{ github.repository_owner }}');
  assert.equal(valueOf(claudeStep, 'use_commit_signing'), 'true');
  for (const risky of [
    'allowed_non_write_users',
    'allowed_bots',
    'show_full_output',
    'display_report',
    'additional_permissions',
    'anthropic_api_key',
    'path_to_claude_code_executable',
  ]) {
    assert.equal(valueOf(claudeStep, risky), undefined, `khong duoc khai \`${risky}\``);
  }
});

test('claude_args khong noi/ghi de chinh sach phien: chi --max-turns va --append-system-prompt', () => {
  assert.deepEqual(argsViolations(blockScalar(claudeStep, 'claude_args')), []);
});

test('phien Claude: chan doc ngoai workspace, cam Bash/Web; luat duong dan chi Edit/Read; khong defaultMode/allow', () => {
  const permissions = sessionPermissions();
  assert.equal(permissions.blockReadsOutsideWorkingDirectories, true);
  const deny = permissions.deny ?? [];
  // `Read(.git/**)`: `.git/config` mang token App trong URL remote (upstream replaceCheckoutCredentials).
  for (const rule of ['Bash', 'WebFetch', 'WebSearch', 'Read(.git/**)']) {
    assert.ok(deny.includes(rule), `settings.permissions.deny thieu ${rule}`);
  }
  // Tai lieu permissions cua Claude Code: luat duong dan chi xet `Edit(path)`/`Read(path)`; mot luat
  // `Write(path)`/`MultiEdit(path)`/`NotebookEdit(path)`/`Glob(path)` duoc nhan nhung KHONG BAO GIO
  // duoc xet. Co mat no la mot cam giac an toan gia — va la dau hieu ai do tuong no dang chan.
  for (const rule of deny) {
    assert.doesNotMatch(
      rule,
      /^(Write|MultiEdit|NotebookEdit|Glob)\(/u,
      `luat ${rule} khong bao gio duoc xet — dung Edit(...) hoac Read(...)`,
    );
  }
  assert.equal(permissions.defaultMode, undefined, 'khong dat defaultMode cho phien agent');
  assert.equal(permissions.allow, undefined, 'khong noi quyen bang allow');
});

test('MCP xoa tep bi CAM (luat Edit khong rang buoc no); commit_files van dung duoc; kiem ke theo ban ghim', () => {
  assert.equal(valueOf(claudeStep, 'use_commit_signing'), 'true', 'commit qua API, khong co Bash');
  assert.deepEqual(mcpViolations(sessionPermissions().deny ?? [], pinnedActionSha()), []);
});

test('mat phang dieu khien: MOI duong dan bat buoc — ca tep moi, tep o cap long — bi mot luat Edit(...) phu', () => {
  assert.deepEqual(controlPlaneViolations(sessionPermissions().deny ?? []), []);
});

test('moi luat co dang ma Claude Code THUC SU xet: Edit(...) dang tai lieu viet ro, mcp__ khong ngoac', () => {
  assert.deepEqual(shapeViolations(sessionPermissions().deny ?? []), []);
});

test('vung lam viec binh thuong (ma nguon, tai lieu) van sua duoc — rao khong nuot ca repo', () => {
  assert.deepEqual(editableViolations(sessionPermissions().deny ?? []), []);
});

test('tren MOI tep dang co: bi rao <=> thuoc mat phang dieu khien (ke ca AGENTS.md, CLAUDE.md); khong symlink', () => {
  const violations = treeViolations(sessionPermissions().deny ?? [], [...walkTree(REPO_ROOT)]);
  assert.deepEqual(violations.slice(0, 10), [], `${violations.length} vi pham`);
});

test('khong buoc nao SAU agent chay ma tu workspace (workspace luc do la cay agent vua sua)', () => {
  assert.ok(claudeIdx >= 0);
  const after = buildSteps.slice(claudeIdx + 1);
  assert.ok(after.length > 0, 'phai co buoc mo PR sau agent');
  for (const step of after) {
    const body = step.join('\n');
    assert.doesNotMatch(body, /^\s*(- )?uses:/mu, 'sau agent khong goi action nao');
    assert.doesNotMatch(
      body,
      /(^|[\s;&|(])(node|npm|npx|pnpm|yarn|bun|python3?|make|bash|sh|source)\s/mu,
      'sau agent khong chay trinh thong dich/goi lenh tu workspace',
    );
    assert.doesNotMatch(body, /(^|[\s"'])\.{1,2}\//mu, 'sau agent khong chay duong dan tuong doi');
  }
});

test('nhan kich hoat khai nhat quan: if: cua gate = ACTIVATION_LABEL = label_trigger', () => {
  const declared = code
    .map((l) => /^\s*(ACTIVATION_LABEL|label_trigger):\s*(\S+)\s*$/u.exec(l))
    .filter(Boolean)
    .map((m) => m[2]);
  assert.ok(declared.length >= 3, 'thieu mot trong ba cho khai nhan');
  for (const value of declared) assert.equal(value, LABEL);
  assert.notEqual(
    LABEL,
    'agent:ready',
    'agent:ready thuoc pilot V2 va dang duoc dung cho Issue Transport',
  );
});

test('khong bieu mau Issue nao TU GAN nhan kich hoat (nguoi la tao Issue -> sender la nguoi la)', () => {
  for (const name of readdirSync(TEMPLATES).filter((n) => /\.ya?ml$/u.test(n))) {
    const tpl = readFileSync(join(TEMPLATES, name), 'utf8').replaceAll('\r', '').split('\n');
    const i = tpl.findIndex((l) => /^labels:/u.test(l));
    if (i < 0) continue;
    const listed = [tpl[i], ...childrenOf(tpl, i)].join(' ');
    assert.ok(!listed.includes(LABEL), `${name} tu gan ${LABEL}`);
  }
});

test('runner GitHub-hosted dung mot lan, co timeout; concurrency theo Issue va khong huy lan dang chay', () => {
  const runsOn = code.filter((l) => /^\s*runs-on:/u.test(l)).map((l) => l.split(':')[1].trim());
  assert.deepEqual(runsOn, ['ubuntu-24.04', 'ubuntu-24.04']);
  for (const jobLines of [gate, build]) {
    const minutes = Number(
      valueOf(
        jobLines.filter((l) => indentOf(l) === 4),
        'timeout-minutes',
      ),
    );
    assert.ok(minutes > 0 && minutes <= 30, `timeout-minutes khong hop le: ${minutes}`);
  }
  assert.ok(
    build.join('\n').includes('group: claude-builder-issue-${{ github.event.issue.number }}'),
  );
  assert.equal(valueOf(build, 'cancel-in-progress'), 'false');
});

// --- doi chung am CHAY MOI LAN ------------------------------------------------------------------

function expectFlagged(violations, needle, why) {
  assert.ok(
    violations.some((v) => v.includes(needle)),
    `${why}: bo kiem khong bao "${needle}" — nhan ${JSON.stringify(violations)}`,
  );
}

function without(deny, rule) {
  assert.ok(deny.includes(rule), `chinh sach that thieu ${rule}`);
  return deny.filter((r) => r !== rule);
}

test('doi chung am: go TUNG guard khoi chinh sach THAT (theo nghia) -> bo kiem bao DUNG loi', () => {
  const deny = sessionPermissions().deny ?? [];
  const sha = pinnedActionSha();

  const [del] = PINNED_ACTION_WRITE_TOOLS.mustDeny;
  expectFlagged(mcpViolations(without(deny, del), sha), `deny thieu ${del}`, 'go deny xoa tep');
  expectFlagged(
    shapeViolations(deny.map((r) => (r === del ? `${del}(paths:*)` : r))),
    'bi bo qua',
    'deny xoa tep viet co ngoac',
  );
  expectFlagged(
    mcpViolations([...deny, 'mcp__github_file_ops'], sha),
    'chan mat mcp__github_file_ops__commit_files',
    'deny ca server file_ops',
  );
  expectFlagged(mcpViolations(deny, 'f'.repeat(40)), 'chua duoc kiem ke', 'doi ban action');

  for (const path of REQUIRED_PROTECTED) {
    const stripped = withoutCoverageOf(deny, path);
    assert.ok(stripped.length < deny.length, `chinh sach that khong co luat nao phu ${path}`);
    expectFlagged(controlPlaneViolations(stripped), `${path}: KHONG bi rao`, `go rao ${path}`);
  }

  expectFlagged(
    editableViolations([...deny, 'Edit(src)']),
    'apps/api/src/main.ts: bi ',
    'luat ten tran qua rong',
  );
  expectFlagged(
    shapeViolations([...deny, 'Edit(/tools/autopilot-v3/**)']),
    'khong co nghia ro',
    'tien to / (neo o ~/.claude)',
  );
  const args = blockScalar(claudeStep, 'claude_args');
  expectFlagged(
    argsViolations(`${args}\n--setting-sources project`),
    '--setting-sources',
    'co bo nguon user',
  );
});

test('doi chung am cho bai quet cay: tep chi dan TON TAI ma khong rao, ma ung dung bi rao nham, symlink, cay rong', (t) => {
  const deny = sessionPermissions().deny ?? [];
  const root = mkdtempSync(join(tmpdir(), 'autopilot-v3-tree-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (rel) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), 'x');
  };
  put('AGENTS.md');
  put('nested/CLAUDE.md');
  put('apps/api/src/deploy/x.ts');
  put('docs/y.md');
  // Windows: junction (khong can quyen quan tri); POSIX bo qua kieu va tao symlink thuong.
  symlinkSync(join(root, 'docs'), join(root, 'link'), 'junction');
  const entries = [...walkTree(root)];

  const found = treeViolations(deny, entries);
  expectFlagged(found, 'apps/api/src/deploy/x.ts: bi ', 'deny mot doan chan ma ung dung');
  expectFlagged(found, 'link: symlink', 'symlink');
  assert.equal(found.length, 2, `vi pham la: ${JSON.stringify(found)}`);

  expectFlagged(
    treeViolations(withoutCoverageOf(deny, 'nested/CLAUDE.md'), entries),
    'nested/CLAUDE.md: KHONG bi rao',
    'CLAUDE.md ton tai ma khong rao',
  );
  assert.deepEqual(treeViolations(deny, []), ['khong thay AGENTS.md o goc — bo quet hong']);
});
