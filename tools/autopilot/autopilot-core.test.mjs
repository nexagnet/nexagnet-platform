import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MARKER_KINDS,
  encodeMarker,
  evaluatePullRequest,
  isTrustedBotComment,
  linkedIssueNumbers,
  parseMarker,
  riskOfIssue,
  trustedMarkers,
} from './autopilot-core.mjs';
import { HEAD, OTHER_HEAD, REPO, botUser, makeIssue, makePr } from './phase2-fixtures.mjs';

const evaluate = (overrides = {}, issue = makeIssue(), expectedHeadSha = HEAD) =>
  evaluatePullRequest({ pr: makePr(overrides), issue, repository: REPO, expectedHeadSha });

test('PR hop le + Issue mot nhan rui ro -> OK kem rui ro va so Issue', () => {
  assert.deepEqual(evaluate(), { decision: 'OK', reason: 'OK', risk: 'R1', issueNumber: 50 });
});

test('PR khong phai cua Autopilot bi BLOCK o tung dieu kien cua hop dong', () => {
  const cases = [
    ['PR_NOT_OPEN', { state: 'closed' }],
    ['PR_NOT_OPEN', { merged: true }],
    ['PR_NOT_GENERATED', { labels: [{ name: 'bug' }] }],
    ['BRANCH_NOT_AUTOPILOT', { head: { ref: 'feature/x', sha: HEAD, repo: { full_name: REPO } } }],
    ['BRANCH_NOT_AUTOPILOT', { head: { ref: 'autopilot/', sha: HEAD, repo: { full_name: REPO } } }],
    [
      'HEAD_REPO_MISMATCH',
      { head: { ref: 'autopilot/x', sha: HEAD, repo: { full_name: 'evil/fork' } } },
    ],
    ['HEAD_REPO_MISMATCH', { head: { ref: 'autopilot/x', sha: HEAD, repo: null } }],
    ['BASE_NOT_DEFAULT_BRANCH', { base: { ref: 'release', repo: { full_name: REPO } } }],
    ['HEAD_SHA_INVALID', { head: { ref: 'autopilot/x', sha: 'abc', repo: { full_name: REPO } } }],
    ['ISSUE_NOT_LINKED', { body: 'khong co lien ket' }],
    ['ISSUE_LINK_AMBIGUOUS', { body: 'Closes #50\nCloses #51' }],
  ];
  for (const [reason, overrides] of cases) {
    const result = evaluate(overrides);
    assert.equal(result.decision, 'BLOCK', reason);
    assert.equal(result.reason, reason);
  }
});

test('HEAD da doi so voi head da review -> HEAD_MOVED (exact-head binding)', () => {
  assert.equal(evaluate({}, makeIssue(), OTHER_HEAD).reason, 'HEAD_MOVED');
});

test('Issue: phai la Issue that, dang mo, dung MOT nhan rui ro; R3 block', () => {
  assert.equal(evaluate({}, null).reason, 'ISSUE_NOT_FETCHED');
  assert.equal(evaluate({}, makeIssue('R1', { number: 99 })).reason, 'ISSUE_MISMATCH');
  assert.equal(evaluate({}, makeIssue('R1', { pull_request: {} })).reason, 'ISSUE_MISMATCH');
  assert.equal(evaluate({}, makeIssue('R1', { state: 'closed' })).reason, 'ISSUE_NOT_OPEN');
  assert.equal(evaluate({}, makeIssue(null)).reason, 'RISK_MISSING');
  const multi = makeIssue('R0', { labels: [{ name: 'risk:R0' }, { name: 'risk:R1' }] });
  assert.equal(evaluate({}, multi).reason, 'RISK_MULTIPLE');
  const r3 = evaluate({}, makeIssue('R3'));
  assert.equal(r3.decision, 'BLOCK');
  assert.equal(r3.reason, 'RISK_R3_BLOCKED');
  for (const risk of ['R0', 'R1', 'R2']) assert.equal(evaluate({}, makeIssue(risk)).risk, risk);
});

test('riskOfIssue chap nhan nhan dang chuoi', () => {
  assert.deepEqual(riskOfIssue({ labels: ['risk:R2'] }), { ok: true, risk: 'R2' });
});

test('linkedIssueNumbers chi nhan dong `Closes #N` rieng, khong nhan nhac giua cau', () => {
  assert.deepEqual(linkedIssueNumbers('Closes #5\nCloses #5'), [5]);
  assert.deepEqual(linkedIssueNumbers('see Closes #5 inline'), []);
  assert.deepEqual(linkedIssueNumbers(undefined), []);
});

test('marker: encode/parse khu hoi va chi doc o DONG DAU', () => {
  const marker = encodeMarker(MARKER_KINDS.repair, { head: HEAD, attempt: 2 });
  assert.deepEqual(parseMarker(`${marker}\nnoi dung`, MARKER_KINDS.repair), {
    head: HEAD,
    attempt: '2',
  });
  assert.equal(
    parseMarker(`van ban\n${marker}`, MARKER_KINDS.repair),
    null,
    'marker o giua van ban vo hieu',
  );
  assert.equal(parseMarker(marker, MARKER_KINDS.review), null, 'sai loai marker');
  assert.throws(() => encodeMarker(MARKER_KINDS.repair, { head: 'a b' }), /marker khong hop le/);
  assert.throws(() => encodeMarker(MARKER_KINDS.repair, { head: '-->x' }), /marker khong hop le/);
});

test('chi comment do dung bot App V4 (login + type Bot) moi duoc tin', () => {
  const marker = encodeMarker(MARKER_KINDS.repair, { head: HEAD, attempt: 1 });
  const make = (user, id) => ({ id, user, body: marker });
  assert.equal(isTrustedBotComment(make(botUser, 1)), true);
  assert.equal(isTrustedBotComment(make({ login: 'octocat', type: 'User' }, 2)), false);
  assert.equal(isTrustedBotComment(make({ login: botUser.login, type: 'User' }, 3)), false);
  assert.equal(isTrustedBotComment(make({ login: 'other-app[bot]', type: 'Bot' }, 4)), false);
  const markers = trustedMarkers(
    [make({ login: 'octocat', type: 'User' }, 1), make(botUser, 3), make(botUser, 2)],
    MARKER_KINDS.repair,
  );
  assert.deepEqual(
    markers.map((m) => m.comment.id),
    [2, 3],
  );
});
