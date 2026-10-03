// AUTOPILOT V4 / Phase 3 — RUNTIME PROOF: logic tat dinh (TARGET, preflight, ket qua deploy) bang GitHub gia.
// Khong mang, khong secret. Bat bien workflow o runtime-proof-workflows.contract.test.mjs.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GENERATED_LABEL,
  MARKER_KINDS,
  encodeMarker,
  parseMarker,
  TRUSTED_BOT_LOGIN,
} from './autopilot-core.mjs';
import { runRuntimePreflight } from './runtime-preflight.mjs';
import { runRuntimeReport } from './runtime-report.mjs';
import {
  RUNTIME_TARGETS,
  decideRuntimeResult,
  evaluateDeploySignals,
  parseRuntimeProofTarget,
} from './runtime-proof-core.mjs';

const REPO = 'nexagnet/nexagnet-platform';
const MERGE = 'c'.repeat(40);
const NEWER_MAIN = 'd'.repeat(40);
const PR_HEAD = 'a'.repeat(40);
const TARGET = 'transport-preview/gd1-test';
const RUN_ID = 8800001;
const botUser = { login: TRUSTED_BOT_LOGIN, type: 'Bot' };

const issueBody = (target = TARGET) =>
  `OBJECTIVE\nCap nhat docs.\n\nRUNTIME PROOF\nTARGET: ${target}\n\nSTOP CONDITIONS\nkhong co`;

const makeRun = (overrides = {}) => ({
  id: RUN_ID,
  name: 'ci',
  path: '.github/workflows/ci.yml',
  event: 'push',
  head_branch: 'main',
  status: 'completed',
  conclusion: 'success',
  head_sha: MERGE,
  repository: { full_name: REPO },
  head_repository: { full_name: REPO },
  ...overrides,
});

const makeMergedPr = (overrides = {}) => ({
  number: 77,
  state: 'closed',
  merged: true,
  merge_commit_sha: MERGE,
  body: 'Closes #50\n\nOpened by workflow autopilot-builder',
  labels: [{ name: GENERATED_LABEL }],
  head: { ref: 'autopilot/issue-50-1', sha: PR_HEAD, repo: { full_name: REPO } },
  base: { ref: 'main', repo: { full_name: REPO } },
  ...overrides,
});

const makeIssue = (risk = 'R0', overrides = {}) => ({
  number: 50,
  state: 'closed',
  body: issueBody(),
  labels: risk ? (Array.isArray(risk) ? risk : [risk]).map((r) => ({ name: `risk:${r}` })) : [],
  ...overrides,
});

const mergedMarker = ({
  id = 901,
  head = PR_HEAD,
  risk = 'R0',
  merge = MERGE,
  user = botUser,
} = {}) => ({
  id,
  user,
  body: `${encodeMarker(MARKER_KINDS.merged, { head, risk, merge })}\n**Autopilot V4: AUTO_MERGED**`,
});

function fakeGitHub({
  run = makeRun(),
  associated = [{ number: 77 }],
  pulls = { 77: makeMergedPr() },
  issues = { 50: makeIssue() },
  comments = { 77: [mergedMarker()] },
} = {}) {
  const state = { reads: [], comments: structuredClone(comments), posts: [] };
  const read = {
    get: async (path) => {
      state.reads.push(path);
      let match;
      if ((match = new RegExp(`^/repos/${REPO}/actions/runs/(\\d+)$`).exec(path))) return run;
      if ((match = new RegExp(`^/repos/${REPO}/pulls/(\\d+)$`).exec(path))) return pulls[match[1]];
      if ((match = new RegExp(`^/repos/${REPO}/issues/(\\d+)$`).exec(path)))
        return issues[match[1]];
      throw new Error(`GET khong mong doi: ${path}`);
    },
    paginate: async (path) => {
      state.reads.push(path);
      let match;
      if (/\/commits\/[0-9a-f]{40}\/pulls$/.test(path)) return associated;
      if ((match = /\/issues\/(\d+)\/comments$/.exec(path))) return state.comments[match[1]] ?? [];
      throw new Error(`PAGINATE khong mong doi: ${path}`);
    },
  };
  let nextId = 5000;
  const write = {
    post: async (path, body) => {
      const match = /\/issues\/(\d+)\/comments$/.exec(path);
      assert.ok(match, `chi duoc POST comment, nhan ${path}`);
      const comment = { id: nextId++, user: botUser, body: body.body };
      (state.comments[match[1]] ??= []).push(comment);
      state.posts.push({ path, body: body.body });
      return comment;
    },
  };
  return { read, write, state };
}

const preflight = (overrides = {}, input = {}) => {
  const gh = fakeGitHub(overrides);
  return runRuntimePreflight({
    read: gh.read,
    repository: REPO,
    runId: RUN_ID,
    eventHeadSha: MERGE,
    ...input,
  }).then((result) => ({ result, gh }));
};

// ---------------------------------------------------------------------------------------------
// TARGET
// ---------------------------------------------------------------------------------------------

test('TARGET: chi `none` va transport-preview/gd1-test duoc chap nhan', () => {
  assert.deepEqual(parseRuntimeProofTarget(issueBody('none')), { ok: true, target: 'none' });
  assert.deepEqual(parseRuntimeProofTarget(issueBody(TARGET)), { ok: true, target: TARGET });
  assert.deepEqual(Object.keys(RUNTIME_TARGETS), [TARGET]);
  assert.deepEqual(RUNTIME_TARGETS[TARGET], {
    tenant: 'transport-preview',
    environment: 'gd1-test',
  });
});

test('TARGET: thieu / nhieu / la / hong -> fail closed voi ly do ro rang', () => {
  const reason = (body) => {
    const parsed = parseRuntimeProofTarget(body);
    assert.equal(parsed.ok, false, body);
    return parsed.reason;
  };
  assert.equal(reason(''), 'RUNTIME_PROOF_SECTION_MISSING');
  assert.equal(reason(null), 'RUNTIME_PROOF_SECTION_MISSING');
  assert.equal(reason('OBJECTIVE\nsua docs'), 'RUNTIME_PROOF_SECTION_MISSING');
  assert.equal(reason('RUNTIME PROOF\nkhong co chi thi'), 'TARGET_MISSING');
  assert.equal(reason('RUNTIME PROOF\nTARGET: none\nTARGET: none'), 'TARGET_MULTIPLE');
  assert.equal(reason(`RUNTIME PROOF\nTARGET: none\nTARGET: ${TARGET}`), 'TARGET_MULTIPLE');
  assert.equal(
    reason(`RUNTIME PROOF\nTARGET: none\n\nRUNTIME PROOF\nTARGET: ${TARGET}`),
    'RUNTIME_PROOF_SECTION_MULTIPLE',
  );
  for (const target of [
    'production',
    'transport-preview/production',
    'transport-preview',
    'ultty/gd1-test',
    'amico/production',
    'wata/gd1-test',
    'NONE',
    'Transport-Preview/gd1-test',
    '*',
    `${TARGET}/extra`,
  ])
    assert.equal(reason(issueBody(target)), 'TARGET_UNKNOWN', target);
  for (const line of [
    'TARGET:',
    'TARGET: none please',
    'TARGET:none',
    'target: none',
    '- TARGET: none',
    '`TARGET: none`',
    `TARGET: ${TARGET} # ghi chu`,
  ])
    assert.match(reason(`RUNTIME PROOF\n${line}`), /^TARGET_(MALFORMED|MISSING)$/, line);
});

test('TARGET: chi doc dung section, bo qua code fence / comment HTML / backtick / section khac', () => {
  // Header bi boc backtick KHONG phai header (dung nhu Issue #422 mo ta pilot bang van xuoi).
  assert.equal(
    parseRuntimeProofTarget(
      `Create one issue with:\n\`RUNTIME PROOF\`\n\`TARGET: ${TARGET}\`\nThen prove.`,
    ).reason,
    'RUNTIME_PROOF_SECTION_MISSING',
  );
  // Section nam trong code fence bi bo qua.
  assert.equal(
    parseRuntimeProofTarget(`\`\`\`\nRUNTIME PROOF\nTARGET: ${TARGET}\n\`\`\``).reason,
    'RUNTIME_PROOF_SECTION_MISSING',
  );
  // Chi thi giau trong comment HTML khong co hieu luc.
  assert.equal(
    parseRuntimeProofTarget(`RUNTIME PROOF\n<!-- TARGET: ${TARGET} -->\nkhong co`).reason,
    'TARGET_MISSING',
  );
  // TARGET nam SAU tieu de khac thi khong thuoc section.
  assert.equal(
    parseRuntimeProofTarget(`RUNTIME PROOF\nmo ta\n\nWHY\nTARGET: ${TARGET}`).reason,
    'TARGET_MISSING',
  );
  // TARGET nam TRUOC section cung khong tinh.
  assert.equal(
    parseRuntimeProofTarget(`TARGET: ${TARGET}\n\nRUNTIME PROOF\nmo ta`).reason,
    'TARGET_MISSING',
  );
});

test('TARGET: chap nhan heading markdown / in dam / CRLF', () => {
  for (const header of [
    '## RUNTIME PROOF',
    '**RUNTIME PROOF**',
    'RUNTIME PROOF:',
    '# RUNTIME PROOF',
  ])
    assert.deepEqual(parseRuntimeProofTarget(`${header}\nTARGET: ${TARGET}\n`), {
      ok: true,
      target: TARGET,
    });
  assert.deepEqual(
    parseRuntimeProofTarget(`OBJECTIVE\r\nx\r\n\r\nRUNTIME PROOF\r\nTARGET: none\r\n`),
    {
      ok: true,
      target: 'none',
    },
  );
});

// ---------------------------------------------------------------------------------------------
// PREFLIGHT
// ---------------------------------------------------------------------------------------------

test('preflight: R0 va R1 co marker hop le + TARGET transport-preview/gd1-test -> DEPLOY dung SHA merge', async () => {
  for (const risk of ['R0', 'R1']) {
    const { result } = await preflight({
      issues: { 50: makeIssue(risk) },
      comments: { 77: [mergedMarker({ risk })] },
    });
    assert.deepEqual(result, {
      decision: 'DEPLOY',
      reason: 'OK',
      gitSha: MERGE,
      pr: 77,
      issue: 50,
      risk,
      target: TARGET,
    });
  }
});

test('preflight: SHA lay tu CI run da bind, KHONG bao gio hoi `main` hien tai (main da tien)', async () => {
  const { result, gh } = await preflight({ associated: [{ number: 77 }] }, { eventHeadSha: MERGE });
  assert.equal(result.gitSha, MERGE);
  assert.notEqual(result.gitSha, NEWER_MAIN);
  for (const path of gh.state.reads)
    assert.doesNotMatch(path, /\/(branches|git\/ref|git\/refs|commits)\/(heads\/)?main\b/, path);
  assert.ok(gh.state.reads.some((path) => path.includes(`/commits/${MERGE}/pulls`)));
});

test('preflight: TARGET none -> SKIP sach, khong DEPLOY', async () => {
  const { result } = await preflight({
    issues: { 50: makeIssue('R0', { body: issueBody('none') }) },
  });
  assert.equal(result.decision, 'SKIP');
  assert.equal(result.reason, 'TARGET_NONE');
});

test('preflight: thieu / nhieu / la TARGET -> BLOCK (fail closed)', async () => {
  const cases = {
    RUNTIME_PROOF_SECTION_MISSING: 'OBJECTIVE\nchi sua docs',
    TARGET_MISSING: 'RUNTIME PROOF\nmo ta',
    TARGET_MULTIPLE: `RUNTIME PROOF\nTARGET: none\nTARGET: ${TARGET}`,
    TARGET_UNKNOWN: issueBody('ultty/production'),
  };
  for (const [reason, body] of Object.entries(cases)) {
    const { result } = await preflight({ issues: { 50: makeIssue('R0', { body }) } });
    assert.equal(result.decision, 'BLOCK', reason);
    assert.equal(result.reason, reason);
    assert.equal(result.target, undefined);
  }
});

test('preflight: chi R0/R1; R2 SKIP, R3 BLOCK, thieu / nhieu nhan rui ro BLOCK', async () => {
  const run = async (risk, markerRisk = risk) =>
    (
      await preflight({
        issues: { 50: makeIssue(risk) },
        comments: { 77: [mergedMarker({ risk: markerRisk })] },
      })
    ).result;
  const r2 = await run('R2');
  assert.deepEqual([r2.decision, r2.reason], ['SKIP', 'RISK_NOT_AUTO_DEPLOY']);
  const r3 = await run('R3');
  assert.deepEqual([r3.decision, r3.reason], ['BLOCK', 'RISK_R3_BLOCKED']);
  const missing = await run(null);
  assert.deepEqual([missing.decision, missing.reason], ['BLOCK', 'RISK_MISSING']);
  const multiple = await run(['R0', 'R1'], 'R0');
  assert.deepEqual([multiple.decision, multiple.reason], ['BLOCK', 'RISK_MULTIPLE']);
});

test('preflight: CI kich hoat phai la push main success cua chinh repo, trung SHA event', async () => {
  const cases = [
    [{ event: 'pull_request' }, 'SKIP', 'CI_RUN_NOT_PUSH'],
    [{ head_branch: 'feature' }, 'SKIP', 'CI_RUN_NOT_MAIN'],
    [{ conclusion: 'failure' }, 'SKIP', 'CI_NOT_SUCCESS'],
    [{ conclusion: 'cancelled' }, 'SKIP', 'CI_NOT_SUCCESS'],
    [{ status: 'in_progress', conclusion: null }, 'SKIP', 'CI_NOT_SUCCESS'],
    [
      { name: 'deploy-tenant', path: '.github/workflows/deploy-tenant.yml' },
      'BLOCK',
      'CI_RUN_WRONG_WORKFLOW',
    ],
    [{ head_repository: { full_name: 'attacker/fork' } }, 'BLOCK', 'CI_RUN_REPO_MISMATCH'],
    [{ head_sha: NEWER_MAIN }, 'BLOCK', 'CI_HEAD_SHA_MISMATCH'],
    [{ head_sha: 'abc123' }, 'BLOCK', 'CI_HEAD_SHA_MISMATCH'],
  ];
  for (const [override, decision, reason] of cases) {
    const { result } = await preflight({ run: makeRun(override) });
    assert.deepEqual(
      [result.decision, result.reason],
      [decision, reason],
      JSON.stringify(override),
    );
  }
  const missing = await preflight({ run: null });
  assert.deepEqual([missing.result.decision, missing.result.reason], ['BLOCK', 'CI_RUN_NOT_FOUND']);
});

test('preflight: commit khong den tu PR autopilot da merge -> SKIP, khong BLOCK, khong deploy', async () => {
  const noPr = await preflight({ associated: [] });
  assert.deepEqual([noPr.result.decision, noPr.result.reason], ['SKIP', 'NO_MERGED_PR_FOR_COMMIT']);

  const human = await preflight({ pulls: { 77: makeMergedPr({ labels: [] }) } });
  assert.deepEqual([human.result.decision, human.result.reason], ['SKIP', 'NOT_AUTOPILOT_MERGE']);

  // PR chi "lien quan" (commit nam trong nhanh) nhung KHONG merge ra commit nay.
  const notMergeCommit = await preflight({
    pulls: { 77: makeMergedPr({ merge_commit_sha: PR_HEAD }) },
  });
  assert.equal(notMergeCommit.result.reason, 'NO_MERGED_PR_FOR_COMMIT');

  const notMerged = await preflight({
    pulls: { 77: makeMergedPr({ merged: false, state: 'open' }) },
  });
  assert.equal(notMerged.result.reason, 'NO_MERGED_PR_FOR_COMMIT');

  const otherBase = await preflight({
    pulls: { 77: makeMergedPr({ base: { ref: 'release', repo: { full_name: REPO } } }) },
  });
  assert.equal(otherBase.result.reason, 'NO_MERGED_PR_FOR_COMMIT');
});

test('preflight: PR autopilot nhung nhanh la / fork / hai PR cung merge -> BLOCK', async () => {
  const wrongBranch = await preflight({
    pulls: {
      77: makeMergedPr({ head: { ref: 'feature/x', sha: PR_HEAD, repo: { full_name: REPO } } }),
    },
  });
  assert.deepEqual(
    [wrongBranch.result.decision, wrongBranch.result.reason],
    ['BLOCK', 'BRANCH_NOT_AUTOPILOT'],
  );

  const fork = await preflight({
    pulls: {
      77: makeMergedPr({
        head: { ref: 'autopilot/x', sha: PR_HEAD, repo: { full_name: 'attacker/fork' } },
      }),
    },
  });
  assert.equal(fork.result.reason, 'HEAD_REPO_MISMATCH');

  const two = await preflight({
    associated: [{ number: 77 }, { number: 78 }],
    pulls: { 77: makeMergedPr(), 78: makeMergedPr({ number: 78, labels: [] }) },
  });
  assert.deepEqual([two.result.decision, two.result.reason], ['BLOCK', 'MERGED_PR_AMBIGUOUS']);
});

test('preflight: dung MOT `Closes #N`', async () => {
  const none = await preflight({ pulls: { 77: makeMergedPr({ body: 'khong lien ket' }) } });
  assert.deepEqual([none.result.decision, none.result.reason], ['BLOCK', 'ISSUE_NOT_LINKED']);
  const many = await preflight({ pulls: { 77: makeMergedPr({ body: 'Closes #50\nCloses #51' }) } });
  assert.deepEqual([many.result.decision, many.result.reason], ['BLOCK', 'ISSUE_LINK_AMBIGUOUS']);
  const prAsIssue = await preflight({ issues: { 50: makeIssue('R0', { pull_request: {} }) } });
  assert.equal(prAsIssue.result.reason, 'ISSUE_MISMATCH');
});

test('preflight: marker `autopilot-merged` cua bot tin cay phai khop merge SHA, head PR va rui ro', async () => {
  const cases = {
    MERGE_MARKER_MISSING: [],
    MERGE_MARKER_HEAD_MISMATCH: [mergedMarker({ head: 'b'.repeat(40) })],
    MERGE_MARKER_RISK_MISMATCH: [mergedMarker({ risk: 'R1' })],
    MERGE_MARKER_AMBIGUOUS: [mergedMarker({ id: 901 }), mergedMarker({ id: 902 })],
  };
  for (const [reason, comments] of Object.entries(cases)) {
    const { result } = await preflight({ comments: { 77: comments } });
    assert.deepEqual([result.decision, result.reason], ['BLOCK', reason]);
  }
  // Marker cho MOT MERGE SHA KHAC khong dung duoc cho commit nay.
  const otherMerge = await preflight({ comments: { 77: [mergedMarker({ merge: NEWER_MAIN })] } });
  assert.equal(otherMerge.result.reason, 'MERGE_MARKER_MISSING');
  // Nguoi dung / bot khac dang marker y het -> khong tin.
  for (const user of [
    { login: 'someone', type: 'User' },
    { login: TRUSTED_BOT_LOGIN, type: 'User' },
    { login: 'other-app[bot]', type: 'Bot' },
  ]) {
    const forged = await preflight({ comments: { 77: [mergedMarker({ user })] } });
    assert.equal(forged.result.reason, 'MERGE_MARKER_MISSING', user.login);
  }
  // Marker khong o dong dau (dan giua van ban) khong co gia tri.
  const buried = await preflight({
    comments: {
      77: [
        {
          id: 910,
          user: botUser,
          body: `xin chao\n${encodeMarker(MARKER_KINDS.merged, { head: PR_HEAD, risk: 'R0', merge: MERGE })}`,
        },
      ],
    },
  });
  assert.equal(buried.result.reason, 'MERGE_MARKER_MISSING');
});

test('preflight: moi nhanh khong-DEPLOY khong xuat git_sha/target cho job deploy', async () => {
  const { result } = await preflight({
    issues: { 50: makeIssue('R0', { body: issueBody('none') }) },
  });
  assert.notEqual(result.decision, 'DEPLOY');
});

// ---------------------------------------------------------------------------------------------
// KET QUA SAU DEPLOY
// ---------------------------------------------------------------------------------------------

const goodSignals = (overrides = {}) => ({
  schema: 'deploy-signals/v1',
  release: { tenant: 'transport-preview', environment: 'gd1-test', gitSha: MERGE },
  rollout: 'pass',
  health: 'pass',
  deterministicSmoke: 'pass',
  liveAiSmoke: 'skipped',
  hardFailure: false,
  ...overrides,
});

test('deploy signals: chi pass khi dung SHA merge + tenant + ba tang cung deu pass', () => {
  const check = (signals) => evaluateDeploySignals({ signals, mergeSha: MERGE, target: TARGET });
  assert.deepEqual(check(goodSignals()), { ok: true, reason: 'OK' });
  assert.equal(check(null).reason, 'SIGNALS_MISSING');
  assert.equal(check(goodSignals({ schema: 'khac' })).reason, 'SIGNALS_SCHEMA_UNKNOWN');
  assert.equal(
    check(goodSignals({ release: { tenant: 'transport-preview', gitSha: NEWER_MAIN } })).reason,
    'SIGNALS_SHA_MISMATCH',
  );
  assert.equal(check(goodSignals({ release: null })).reason, 'SIGNALS_SHA_MISMATCH');
  // Positive: pin ca tenant + environment cua TARGET.
  assert.deepEqual(RUNTIME_TARGETS[TARGET], {
    tenant: 'transport-preview',
    environment: 'gd1-test',
  });
  assert.deepEqual(
    check(
      goodSignals({
        release: { tenant: 'transport-preview', environment: 'gd1-test', gitSha: MERGE },
      }),
    ),
    { ok: true, reason: 'OK' },
  );
  // Negative: dung SHA, sai tenant HOAC sai environment HOAC thieu environment -> SIGNALS_TARGET_MISMATCH.
  for (const release of [
    { tenant: 'ultty', environment: 'gd1-test', gitSha: MERGE },
    { tenant: 'transport-preview', environment: 'production', gitSha: MERGE },
    { tenant: 'transport-preview', environment: 'dev', gitSha: MERGE },
    { tenant: 'transport-preview', environment: 'prod', gitSha: MERGE },
    { tenant: 'transport-preview', environment: 'GD1-TEST', gitSha: MERGE },
    { tenant: 'transport-preview', environment: null, gitSha: MERGE },
    { tenant: 'transport-preview', gitSha: MERGE },
    { tenant: 'ultty', environment: 'production', gitSha: MERGE },
  ])
    assert.equal(
      check(goodSignals({ release })).reason,
      'SIGNALS_TARGET_MISMATCH',
      JSON.stringify(release),
    );
  for (const layer of ['rollout', 'health', 'deterministicSmoke'])
    assert.equal(check(goodSignals({ [layer]: 'pending' })).reason, 'SIGNALS_NOT_PASSING', layer);
  assert.equal(check(goodSignals({ hardFailure: true })).reason, 'SIGNALS_NOT_PASSING');
  // Live AI / quan sat la tin hieu mem, nhu chinh sach deploy hien co.
  assert.equal(check(goodSignals({ liveAiSmoke: 'fail' })).ok, true);
  assert.equal(
    evaluateDeploySignals({ signals: goodSignals(), mergeSha: MERGE, target: 'production' }).ok,
    false,
  );
});

test('ket qua: success chi khi workflow deploy duoc goi success VA tin hieu khop', () => {
  const ok = { ok: true, reason: 'OK' };
  assert.deepEqual(decideRuntimeResult({ deployResult: 'success', signalCheck: ok }), {
    result: 'success',
    reason: 'OK',
  });
  for (const deployResult of ['failure', 'cancelled', 'skipped', '', undefined])
    assert.equal(
      decideRuntimeResult({ deployResult, signalCheck: ok }).result,
      'failure',
      String(deployResult),
    );
  assert.deepEqual(
    decideRuntimeResult({
      deployResult: 'success',
      signalCheck: { ok: false, reason: 'SIGNALS_MISSING' },
    }),
    { result: 'failure', reason: 'SIGNALS_MISSING' },
  );
});

// ---------------------------------------------------------------------------------------------
// REPORT
// ---------------------------------------------------------------------------------------------

const reportInput = (overrides = {}) => ({
  pr: '77',
  issue: '50',
  mergeSha: MERGE,
  target: TARGET,
  deployResult: 'success',
  runId: String(RUN_ID),
  runUrl: `https://github.com/${REPO}/actions/runs/${RUN_ID}`,
  ...overrides,
});

const report = (input, signals = goodSignals(), github = {}) => {
  const gh = fakeGitHub(github);
  return runRuntimeReport({
    read: gh.read,
    write: gh.write,
    repository: REPO,
    input,
    signals,
  }).then((result) => ({ result, gh }));
};

test('report: thanh cong -> RUNTIME_PROOF_PASSED tren PR va Issue, marker mang merge SHA + target + run', async () => {
  const { result, gh } = await report(reportInput());
  assert.equal(result.result, 'success');
  assert.equal(gh.state.posts.length, 2);
  assert.deepEqual(gh.state.posts.map((p) => p.path).sort(), [
    `/repos/${REPO}/issues/50/comments`,
    `/repos/${REPO}/issues/77/comments`,
  ]);
  for (const { body } of gh.state.posts) {
    assert.match(body, /RUNTIME_PROOF_PASSED/);
    assert.match(body, new RegExp(`actions/runs/${RUN_ID}`));
    assert.deepEqual(parseMarker(body, MARKER_KINDS.runtimeProof), {
      merge: MERGE,
      target: TARGET,
      result: 'success',
      reason: 'OK',
      run: String(RUN_ID),
    });
  }
});

test('report: deploy fail / huy / bo qua -> RUNTIME_PROOF_FAILED, khong rollback, khong promote', async () => {
  for (const deployResult of ['failure', 'cancelled', 'skipped']) {
    const { result, gh } = await report(reportInput({ deployResult }));
    assert.equal(result.result, 'failure');
    assert.equal(result.reason, `DEPLOY_${deployResult.toUpperCase()}`);
    assert.equal(gh.state.posts.length, 2);
    for (const { body } of gh.state.posts) {
      assert.match(body, /RUNTIME_PROOF_FAILED/);
      assert.doesNotMatch(body, /RUNTIME_PROOF_PASSED/);
      assert.match(body, /KHONG rollback tu dong/);
      assert.equal(parseMarker(body, MARKER_KINDS.runtimeProof).result, 'failure');
    }
  }
});

test('report: deploy success nhung tin hieu thieu / sai SHA -> failure, khong tuyen bo PASSED', async () => {
  for (const [signals, reason] of [
    [null, 'SIGNALS_MISSING'],
    [
      goodSignals({
        release: { tenant: 'transport-preview', environment: 'production', gitSha: MERGE },
      }),
      'SIGNALS_TARGET_MISMATCH',
    ],
    [
      goodSignals({ release: { tenant: 'transport-preview', gitSha: NEWER_MAIN } }),
      'SIGNALS_SHA_MISMATCH',
    ],
    [goodSignals({ rollout: 'fail', hardFailure: true }), 'SIGNALS_NOT_PASSING'],
  ]) {
    const { result, gh } = await report(reportInput(), signals);
    assert.deepEqual([result.result, result.reason], ['failure', reason]);
    assert.ok(gh.state.posts.every(({ body }) => !/RUNTIME_PROOF_PASSED/.test(body)));
  }
});

test('report: idempotent — chay lai khong dang trung, nhung ket qua khac thi dang', async () => {
  const gh = fakeGitHub();
  const run = (input, signals) =>
    runRuntimeReport({ read: gh.read, write: gh.write, repository: REPO, input, signals });
  await run(reportInput(), goodSignals());
  await run(reportInput(), goodSignals());
  assert.equal(gh.state.posts.length, 2);
  await run(reportInput({ deployResult: 'failure' }), goodSignals());
  assert.equal(gh.state.posts.length, 4);
});

test('report: dau vao hong / PR khong merge ra commit nay -> khong dang gi', async () => {
  for (const override of [
    { pr: 'abc' },
    { issue: '0' },
    { mergeSha: 'abc' },
    { target: 'production' },
    { target: '' },
  ]) {
    const { result, gh } = await report(reportInput(override));
    assert.deepEqual(
      [result.posted, result.reason],
      [false, 'INPUT_INVALID'],
      JSON.stringify(override),
    );
    assert.equal(gh.state.posts.length, 0);
  }
  const { result, gh } = await report(reportInput(), goodSignals(), {
    pulls: { 77: makeMergedPr({ merge_commit_sha: NEWER_MAIN }) },
  });
  assert.deepEqual([result.posted, result.reason], [false, 'PR_MERGE_MISMATCH']);
  assert.equal(gh.state.posts.length, 0);
});
