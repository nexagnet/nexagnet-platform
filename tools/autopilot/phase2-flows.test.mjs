// Luong Phase 2 chay tren GitHub gia: Reviewer -> (Repair | Autonomy). Khong mang, khong secret.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MARKER_KINDS, encodeMarker } from './autopilot-core.mjs';
import { GitHubError, createClient } from './github-api.mjs';
import { runMergeEvaluate } from './merge-evaluate.mjs';
import { evaluateRepair } from './repair-preflight.mjs';
import { ReviewOutputError, reportReview } from './review-report.mjs';
import { evaluateCiRun, runReviewerPreflight } from './reviewer-preflight.mjs';
import {
  HEAD,
  OTHER_HEAD,
  REPO,
  REVIEW_RUN_ID,
  botUser,
  fakeGitHub,
  greenChecks,
  makeIssue,
  makePr,
  reviewComment,
  reviewResult,
  reviewerRun,
} from './phase2-fixtures.mjs';

const RUN_URL = 'https://github.com/x/actions/runs/1';
const report = (gh, overrides = {}) =>
  reportReview({
    read: gh.read,
    write: gh.write,
    repository: REPO,
    prNumber: 77,
    headSha: HEAD,
    risk: 'R1',
    rawOutput: JSON.stringify(reviewResult('PASS')),
    runId: String(REVIEW_RUN_ID),
    runUrl: RUN_URL,
    ...overrides,
  });
const dispatches = (gh) => gh.calls('/dispatches').map((c) => c.body);
const repairMarker = (id, head, attempt) => ({
  id,
  user: botUser,
  body: encodeMarker(MARKER_KINDS.repair, { head, attempt }),
});

// ---- Reviewer: trigger tin cay -------------------------------------------------------------

const ciRun = (overrides = {}) => ({
  name: 'ci',
  path: '.github/workflows/ci.yml',
  event: 'pull_request',
  status: 'completed',
  conclusion: 'success',
  head_sha: HEAD,
  repository: { full_name: REPO },
  head_repository: { full_name: REPO },
  pull_requests: [{ number: 77 }],
  ...overrides,
});

test('trigger tin cay: chi CI `ci` cua PR cung repo, xong va thanh cong, tro toi dung 1 PR', () => {
  assert.deepEqual(evaluateCiRun({ run: ciRun(), repository: REPO }), {
    decision: 'OK',
    reason: 'OK',
    prNumber: 77,
    headSha: HEAD,
  });
  const reason = (overrides) => evaluateCiRun({ run: ciRun(overrides), repository: REPO }).reason;
  assert.equal(evaluateCiRun({ run: null, repository: REPO }).reason, 'CI_RUN_NOT_FOUND');
  assert.equal(reason({ name: 'other' }), 'CI_RUN_WRONG_WORKFLOW');
  assert.equal(reason({ event: 'push' }), 'CI_RUN_NOT_PULL_REQUEST');
  assert.equal(reason({ conclusion: 'failure' }), 'CI_NOT_SUCCESS');
  assert.equal(reason({ status: 'in_progress', conclusion: null }), 'CI_NOT_SUCCESS');
  assert.equal(reason({ head_repository: { full_name: 'evil/fork' } }), 'CI_RUN_REPO_MISMATCH');
  assert.equal(reason({ head_sha: 'abc' }), 'CI_HEAD_SHA_INVALID');
  assert.equal(reason({ pull_requests: [] }), 'CI_RUN_NO_PR');
  assert.equal(reason({ pull_requests: [{ number: 1 }, { number: 2 }] }), 'CI_RUN_MANY_PRS');
});

// ---- Reviewer: cong tat dinh TRUOC khi Claude / secret ---------------------------------------

const CI_RUN_ID = 9001;
const reviewerPreflight = (gh) =>
  runReviewerPreflight({ read: gh.read, repository: REPO, runId: CI_RUN_ID });
const preflightSetup = (overrides = {}) =>
  fakeGitHub({ runs: { [CI_RUN_ID]: ciRun() }, ...overrides });

test('Reviewer preflight: PR sach, diff day du -> RUN (mang HEAD + hop dong cho job Claude)', async () => {
  const result = await reviewerPreflight(preflightSetup());
  assert.equal(result.decision, 'RUN');
  assert.equal(result.head_sha, HEAD);
  assert.equal(result.pr, 77);
  assert.equal(result.risk, 'R1');
  assert.match(result.contract, /Task Contract/);
});

const PROTECTED_DIFFS = [
  ['.mcp.json'],
  ['.claude/settings.json'],
  ['.claude/settings.local.json'],
  ['.github/workflows/ci.yml'],
  ['tools/autopilot/policy.mjs'],
  ['AGENTS.md'],
  ['CLAUDE.md'],
  ['docs/CLAUDE.md'],
  ['deploy/netviet/render-secrets.sh'],
  // Rename tu vung cam ra ngoai: ten cu van phai bi chan.
  ['docs/ok.md', '.mcp.json'],
];

test('Reviewer preflight: PR cham duong dan bao ve -> BLOCK PROTECTED_PATH, Claude/secret KHONG bao gio duoc cap', async () => {
  for (const [path, previous] of PROTECTED_DIFFS) {
    const gh = preflightSetup({
      files: [
        { filename: 'apps/api/src/x.ts' },
        { filename: path, ...(previous ? { previous_filename: previous } : {}) },
      ],
    });
    const result = await reviewerPreflight(gh);
    assert.equal(result.decision, 'BLOCK', path);
    assert.equal(result.reason, 'PROTECTED_PATH', path);
    // Khong co dau ra nao cho job `review` (`if: decision == 'RUN'`): khong head_sha, khong hop dong.
    assert.equal(result.head_sha, undefined, path);
    assert.equal(result.contract, undefined, path);
    assert.deepEqual(gh.state.calls, [], path);
  }
});

test('Reviewer preflight: diff bi cat (changed_files > tep lay duoc) -> BLOCK DIFF_INCOMPLETE', async () => {
  const gh = preflightSetup({ pr: makePr({ changed_files: 3000 }) });
  const result = await reviewerPreflight(gh);
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reason, 'DIFF_INCOMPLETE');
  assert.equal(result.contract, undefined);
});

test('Reviewer preflight: cong diff dung TRUOC cong "da review roi" — HEAD cham vung cam khong the lot vao SKIP', async () => {
  const gh = preflightSetup({
    pr: makePr({ changed_files: 1 }),
    files: [{ filename: '.mcp.json' }],
    comments: [reviewComment({ verdict: 'PASS' })],
  });
  assert.equal((await reviewerPreflight(gh)).reason, 'PROTECTED_PATH');
});

test('Reviewer preflight: doc MOI trang cua /pulls/{pr}/files — tep cam o trang 2 van bi bat', async () => {
  const many = Array.from({ length: 130 }, (_, i) => ({ filename: `apps/api/src/f${i}.ts` }));
  many.push({ filename: '.claude/settings.json' });
  const gh = preflightSetup({ pr: makePr({ changed_files: many.length }), files: [] });
  const pages = [];
  const fetchImpl = async (url) => {
    const { pathname, searchParams } = new URL(url);
    const json = (body) => ({ ok: true, status: 200, json: async () => body });
    if (pathname.endsWith('/pulls/77/files')) {
      const page = Number(searchParams.get('page'));
      pages.push(page);
      return json(many.slice((page - 1) * 100, page * 100));
    }
    if (/\/issues\/77\/comments$/.test(pathname)) return json(gh.state.comments);
    return json(await gh.read.get(pathname));
  };
  const result = await runReviewerPreflight({
    read: createClient({ token: 't', fetchImpl }),
    repository: REPO,
    runId: CI_RUN_ID,
  });
  assert.deepEqual(pages, [1, 2]);
  assert.equal(result.decision, 'BLOCK');
  assert.equal(result.reason, 'PROTECTED_PATH');
});

test('Reviewer preflight: cac cong sau van BLOCK nhu cu (nhan/nhanh/rui ro/CI) va khong doc diff khi chua can', async () => {
  const noLabel = preflightSetup({ pr: makePr({ labels: [] }) });
  assert.equal((await reviewerPreflight(noLabel)).reason, 'PR_NOT_GENERATED');
  const r3 = preflightSetup({ issue: makeIssue('R3') });
  assert.equal((await reviewerPreflight(r3)).reason, 'RISK_R3_BLOCKED');
  const failed = fakeGitHub({ runs: { [CI_RUN_ID]: ciRun({ conclusion: 'failure' }) } });
  assert.equal((await reviewerPreflight(failed)).reason, 'CI_NOT_SUCCESS');
});

// ---- Reviewer: bao cao ---------------------------------------------------------------------

test('Reviewer PASS: comment bot co marker, roi dispatch merge-evaluate dung PR/HEAD', async () => {
  const gh = fakeGitHub();
  const result = await report(gh);
  assert.equal(result.status, 'DISPATCHED_MERGE_EVALUATE');
  const [comment] = gh.state.comments;
  assert.match(
    comment.body,
    new RegExp(
      `^<!-- autopilot-review:v1 head=${HEAD} verdict=PASS risk=R1 run=${REVIEW_RUN_ID} data=`,
    ),
  );
  assert.deepEqual(dispatches(gh), [
    { event_type: 'autopilot-merge-evaluate', client_payload: { pr: 77, head_sha: HEAD } },
  ]);
});

test('Reviewer: output rong/hong/sai HEAD bi tu choi, KHONG comment, KHONG dispatch', async () => {
  for (const rawOutput of [
    '',
    '{bad',
    JSON.stringify(reviewResult('PASS', OTHER_HEAD)),
    undefined,
  ]) {
    const gh = fakeGitHub();
    await assert.rejects(report(gh, { rawOutput }), ReviewOutputError);
    assert.deepEqual(gh.state.calls, []);
  }
});

test('Reviewer: HEAD da doi / PR het hop le / rui ro doi giua luc review va luc bao cao -> bo, khong ghi', async () => {
  const moved = fakeGitHub({
    pr: makePr({
      head: { ref: 'autopilot/issue-50-1', sha: OTHER_HEAD, repo: { full_name: REPO } },
    }),
  });
  assert.deepEqual(await report(moved), { status: 'DISCARDED', reason: 'HEAD_MOVED' });
  const closed = fakeGitHub({ pr: makePr({ state: 'closed' }) });
  assert.equal((await report(closed)).reason, 'PR_NOT_OPEN');
  const risky = fakeGitHub({ issue: makeIssue('R2') });
  assert.equal((await report(risky)).reason, 'RISK_CHANGED');
  for (const gh of [moved, closed, risky]) assert.deepEqual(gh.state.calls, []);
});

test('Reviewer: chay lai cung HEAD khong dang comment thu hai, van dispatch (resume sau loi)', async () => {
  const gh = fakeGitHub({ comments: [reviewComment({ verdict: 'PASS' })] });
  await report(gh);
  assert.equal(gh.calls('/comments').length, 0);
  assert.equal(dispatches(gh).length, 1);
});

test('Reviewer REQUEST_CHANGES: marker repair TRUOC, roi dispatch repair luot 1', async () => {
  const gh = fakeGitHub();
  const result = await report(gh, { rawOutput: JSON.stringify(reviewResult('REQUEST_CHANGES')) });
  assert.equal(result.status, 'DISPATCHED_REPAIR');
  const posts = gh.state.calls.map((c) => c.path.split('/').pop());
  assert.deepEqual(posts, ['comments', 'comments', 'dispatches']);
  assert.match(
    gh.state.comments[1].body,
    new RegExp(`^<!-- autopilot-repair:v1 head=${HEAD} attempt=1 -->`),
  );
  assert.deepEqual(dispatches(gh), [
    { event_type: 'autopilot-repair', client_payload: { pr: 77, head_sha: HEAD, attempt: 1 } },
  ]);
});

test('retry ceiling: luot 3 khong dispatch, comment NEEDS_HUMAN + nhan needs-human, dung', async () => {
  const gh = fakeGitHub({
    comments: [repairMarker(1, 'c'.repeat(40), 1), repairMarker(2, 'd'.repeat(40), 2)],
  });
  const result = await report(gh, { rawOutput: JSON.stringify(reviewResult('REQUEST_CHANGES')) });
  assert.deepEqual([result.status, result.reason], ['NEEDS_HUMAN', 'REPAIR_CEILING']);
  assert.deepEqual(dispatches(gh), []);
  assert.match(
    gh.state.comments.at(-1).body,
    /^<!-- autopilot-needs-human:v1 head=\w+ reason=REPAIR_CEILING -->\n\*\*Autopilot V4: NEEDS_HUMAN\*\*/,
  );
  assert.ok(gh.state.pr.labels.some((l) => l.name === 'needs-human'));
});

test('Reviewer R2 REQUEST_CHANGES van vao vong Repair (R0/R1/R2 deu duoc)', async () => {
  const gh = fakeGitHub({ issue: makeIssue('R2') });
  const result = await report(gh, {
    risk: 'R2',
    rawOutput: JSON.stringify(reviewResult('REQUEST_CHANGES')),
  });
  assert.equal(result.status, 'DISPATCHED_REPAIR');
});

// ---- Repair preflight ----------------------------------------------------------------------

const repairSetup = (overrides = {}) =>
  fakeGitHub({
    comments: [reviewComment({ verdict: 'REQUEST_CHANGES' }), repairMarker(901, HEAD, 1)],
    ...overrides,
  });
const payload = { pr: 77, head_sha: HEAD, attempt: 1 };
const preflight = (gh, p = payload) =>
  evaluateRepair({ read: gh.read, repository: REPO, payload: p });

test('Repair preflight: PR + review + marker hop le -> RUN tren dung nhanh cua PR, task chua phat hien', async () => {
  const result = await preflight(repairSetup());
  assert.equal(result.decision, 'RUN');
  assert.equal(result.branch, 'autopilot/issue-50-1');
  assert.equal(result.risk, 'R1');
  assert.equal(result.attempt, 1);
  assert.match(result.task, /repair round 1 of 2 for PR #77/);
  assert.match(result.task, /\[major\] src\/x\.ts:12 — thieu kiem tra null/);
  assert.match(result.task, /Task Contract: them truong X/);
});

test('Repair preflight: moi dieu kien sai -> BLOCK, Claude khong chay', async () => {
  const reason = async (gh, p) => (await preflight(gh, p)).reason;
  assert.equal(await reason(repairSetup(), { pr: 'x', head_sha: HEAD }), 'PAYLOAD_INVALID');
  assert.equal(await reason(repairSetup(), { pr: 77, head_sha: 'abc' }), 'PAYLOAD_INVALID');
  assert.equal(await reason(repairSetup(), { ...payload, head_sha: OTHER_HEAD }), 'HEAD_MOVED');
  assert.equal(await reason(repairSetup({ pr: makePr({ labels: [] }) })), 'PR_NOT_GENERATED');
  assert.equal(
    await reason(
      repairSetup({ pr: makePr({ head: { ref: 'main2', sha: HEAD, repo: { full_name: REPO } } }) }),
    ),
    'BRANCH_NOT_AUTOPILOT',
  );
  assert.equal(
    await reason(
      repairSetup({
        pr: makePr({ head: { ref: 'autopilot/x', sha: HEAD, repo: { full_name: 'evil/fork' } } }),
      }),
    ),
    'HEAD_REPO_MISMATCH',
  );
  assert.equal(await reason(repairSetup({ issue: makeIssue('R3') })), 'RISK_R3_BLOCKED');
  assert.equal(await reason(repairSetup({ issue: makeIssue(null) })), 'RISK_MISSING');
  assert.equal(
    await reason(repairSetup({ comments: [repairMarker(901, HEAD, 1)] })),
    'REVIEW_MISSING',
  );
  assert.equal(
    await reason(repairSetup({ comments: [reviewComment({ verdict: 'PASS' })] })),
    'REVIEW_NOT_REQUEST_CHANGES',
  );
  assert.equal(
    await reason(repairSetup({ comments: [reviewComment({ verdict: 'REQUEST_CHANGES' })] })),
    'REPAIR_NOT_AUTHORIZED',
  );
  assert.equal(await reason(repairSetup(), { ...payload, attempt: 2 }), 'REPAIR_ATTEMPT_MISMATCH');
  assert.equal(await reason(repairSetup({ runs: {} })), 'REVIEW_RUN_NOT_FOUND');
  assert.equal(
    await reason(
      repairSetup({
        runs: { [REVIEW_RUN_ID]: reviewerRun({ display_title: 'autopilot-reviewer deadbeef' }) },
      }),
    ),
    'REVIEW_RUN_WRONG_HEAD',
  );
  assert.equal(
    await reason(
      repairSetup({
        comments: [
          reviewComment({ verdict: 'REQUEST_CHANGES', user: { login: 'octocat', type: 'User' } }),
          repairMarker(901, HEAD, 1),
        ],
      }),
    ),
    'REVIEW_MISSING',
  );
});

test('Repair preflight: review cu cua HEAD cu khong the dung de sua HEAD moi', async () => {
  const gh = repairSetup({
    pr: makePr({
      head: { ref: 'autopilot/issue-50-1', sha: OTHER_HEAD, repo: { full_name: REPO } },
    }),
  });
  assert.equal(
    (await preflight(gh, { pr: 77, head_sha: OTHER_HEAD, attempt: 1 })).reason,
    'REVIEW_MISSING',
  );
});

// ---- Autonomy ------------------------------------------------------------------------------

const mergeSetup = (overrides = {}) =>
  fakeGitHub({ comments: [reviewComment({ verdict: 'PASS' })], ...overrides });
const evaluateMerge = (gh, p = { pr: 77, head_sha: HEAD }) =>
  runMergeEvaluate({
    read: gh.read,
    write: gh.write,
    repository: REPO,
    payload: p,
    runUrl: RUN_URL,
  });
const writes = (gh) => gh.state.calls.map((c) => `${c.method} ${c.path ?? 'graphql'}`);

test('R1 + Reviewer PASS + CI 7/7: dua PR ra khoi draft roi merge kem sha = HEAD, khong bypass', async () => {
  const gh = mergeSetup();
  const result = await evaluateMerge(gh);
  assert.equal(result.merged, true);
  assert.deepEqual(writes(gh), [
    'GRAPHQL graphql',
    `PUT /repos/${REPO}/pulls/77/merge`,
    `POST /repos/${REPO}/issues/77/comments`,
  ]);
  const merge = gh.calls('/merge')[0];
  assert.deepEqual(merge.body, { sha: HEAD, merge_method: 'merge' });
  assert.equal(gh.state.calls[0].variables.id, 'PR_node_77');
  assert.match(
    gh.state.comments.at(-1).body,
    /^<!-- autopilot-merged:v1 head=\w+ risk=R1 merge=\w+ -->/,
  );
});

test('R0 PR da la ready (khong draft): merge ngay, khong goi markReady', async () => {
  const gh = mergeSetup({
    pr: makePr({ draft: false }),
    issue: makeIssue('R0'),
    comments: [reviewComment({ risk: 'R0' })],
  });
  await evaluateMerge(gh);
  assert.deepEqual(writes(gh).slice(0, 1), [`PUT /repos/${REPO}/pulls/77/merge`]);
});

test('R2: KHONG auto-merge — gan needs-human + comment REVIEW_PASS_WAITING_HUMAN, khong goi merge', async () => {
  const gh = mergeSetup({ issue: makeIssue('R2'), comments: [reviewComment({ risk: 'R2' })] });
  const result = await evaluateMerge(gh);
  assert.deepEqual([result.action, result.reason], ['WAIT_HUMAN', 'REVIEW_PASS_WAITING_HUMAN']);
  assert.equal(gh.calls('/merge').length, 0);
  assert.equal(
    gh.state.calls.some((c) => c.method === 'GRAPHQL'),
    false,
  );
  assert.ok(gh.state.pr.labels.some((l) => l.name === 'needs-human'));
  assert.match(gh.state.comments.at(-1).body, /REVIEW_PASS_WAITING_HUMAN/);
  // Chay lai khong dang comment trung.
  const before = gh.state.comments.length;
  await evaluateMerge(gh);
  assert.equal(gh.state.comments.length, before);
});

test('R3: BLOCK tuyet doi, khong ghi gi', async () => {
  const gh = mergeSetup({ issue: makeIssue('R3'), comments: [reviewComment({ risk: 'R3' })] });
  const result = await evaluateMerge(gh);
  assert.deepEqual([result.action, result.reason], ['BLOCK', 'RISK_R3_BLOCKED']);
  assert.deepEqual(gh.state.calls, []);
});

test('khong merge truoc Reviewer PASS: thieu / REQUEST_CHANGES / cua nguoi la / sai HEAD / run gia', async () => {
  const blockedWith = async (overrides) => {
    const gh = mergeSetup(overrides);
    const result = await evaluateMerge(gh);
    assert.equal(result.action, 'BLOCK');
    assert.deepEqual(gh.state.calls, [], 'BLOCK khong duoc ghi gi');
    return result.reason;
  };
  assert.equal(await blockedWith({ comments: [] }), 'REVIEW_MISSING');
  assert.equal(
    await blockedWith({ comments: [reviewComment({ verdict: 'REQUEST_CHANGES' })] }),
    'REVIEW_NOT_PASS',
  );
  assert.equal(
    await blockedWith({ comments: [reviewComment({ user: { login: 'octocat', type: 'User' } })] }),
    'REVIEW_MISSING',
  );
  assert.equal(
    await blockedWith({ comments: [reviewComment({ head: OTHER_HEAD })] }),
    'REVIEW_MISSING',
  );
  // "Moi nhat" thang: PASS roi REQUEST_CHANGES cho cung HEAD -> khong merge.
  assert.equal(
    await blockedWith({
      comments: [
        reviewComment({ verdict: 'PASS', id: 900 }),
        reviewComment({ verdict: 'REQUEST_CHANGES', id: 910 }),
      ],
    }),
    'REVIEW_NOT_PASS',
  );
  assert.equal(await blockedWith({ runs: {} }), 'REVIEW_RUN_NOT_FOUND');
  assert.equal(
    await blockedWith({ runs: { [REVIEW_RUN_ID]: reviewerRun({ event: 'issue_comment' }) } }),
    'REVIEW_RUN_WRONG_EVENT',
  );
  assert.equal(
    await blockedWith({ comments: [reviewComment({ risk: 'R0' })] }),
    'REVIEW_RISK_MISMATCH',
  );
});

test('exact-head: HEAD doi sau review (payload cu) -> BLOCK HEAD_MOVED, khong merge', async () => {
  const gh = mergeSetup({
    pr: makePr({
      head: { ref: 'autopilot/issue-50-1', sha: OTHER_HEAD, repo: { full_name: REPO } },
    }),
  });
  assert.equal((await evaluateMerge(gh)).reason, 'HEAD_MOVED');
  assert.deepEqual(gh.state.calls, []);
});

test('exact 7 checks: thieu/that bai/chua xong/o HEAD khac -> BLOCK CI_NOT_GREEN', async () => {
  const bad = [
    greenChecks().slice(0, 6),
    greenChecks().map((c, i) => (i === 3 ? { ...c, conclusion: 'failure' } : c)),
    greenChecks().map((c, i) => (i === 0 ? { ...c, status: 'queued', conclusion: null } : c)),
    greenChecks(OTHER_HEAD),
  ];
  for (const checkRuns of bad) {
    const gh = mergeSetup({ checkRuns });
    assert.equal((await evaluateMerge(gh)).reason, 'CI_NOT_GREEN');
    assert.deepEqual(gh.state.calls, []);
  }
});

test('protected-path diff, diff thieu trang, nhan needs-human do nguoi gan -> BLOCK', async () => {
  const touchesWorkflow = mergeSetup({
    files: [{ filename: 'apps/a.ts' }, { filename: '.github/workflows/ci.yml' }],
  });
  assert.equal((await evaluateMerge(touchesWorkflow)).reason, 'PROTECTED_PATH');
  const incomplete = mergeSetup({ pr: makePr({ changed_files: 500 }) });
  assert.equal((await evaluateMerge(incomplete)).reason, 'DIFF_INCOMPLETE');
  const hold = mergeSetup({
    pr: makePr({ labels: [{ name: 'autopilot:generated' }, { name: 'needs-human' }] }),
  });
  assert.equal((await evaluateMerge(hold)).reason, 'NEEDS_HUMAN_LABEL');
  for (const gh of [touchesWorkflow, incomplete, hold]) assert.deepEqual(gh.state.calls, []);
});

test('payload khong tin duoc: so PR/HEAD hong -> BLOCK PAYLOAD_INVALID', async () => {
  const gh = mergeSetup();
  for (const p of [
    null,
    {},
    { pr: 77 },
    { pr: 'abc', head_sha: HEAD },
    { pr: 77, head_sha: 'short' },
  ]) {
    assert.equal((await evaluateMerge(gh, p)).reason, 'PAYLOAD_INVALID');
  }
});

test('merge bi ruleset/HEAD-doi tu choi (405/409): khong ep, NEEDS_HUMAN roi bao loi', async () => {
  const gh = mergeSetup({
    mergeError: new GitHubError('PUT', '/merge', 405, 'Base branch was modified'),
  });
  await assert.rejects(evaluateMerge(gh), /HTTP 405/);
  assert.match(gh.state.comments.at(-1).body, /reason=MERGE_REJECTED_405/);
  assert.ok(gh.state.pr.labels.some((l) => l.name === 'needs-human'));
});

test('toan chuoi: Reviewer comment do chinh `report` dang duoc Autonomy chap nhan (khong tu gia)', async () => {
  const gh = fakeGitHub();
  await report(gh);
  const result = await evaluateMerge(gh);
  assert.equal(result.action, 'MERGE');
  assert.equal(result.merged, true);
});
