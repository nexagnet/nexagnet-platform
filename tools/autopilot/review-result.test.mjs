import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REVIEW_SCHEMA,
  buildReviewComment,
  latestTrustedReview,
  parseReviewResult,
  readReviewComment,
  verifyReviewRun,
} from './review-result.mjs';
import {
  HEAD,
  OTHER_HEAD,
  REVIEW_RUN_ID,
  reviewComment,
  reviewResult,
  reviewerRun,
} from './phase2-fixtures.mjs';

const parse = (value, expectedHeadSha = HEAD) => parseReviewResult(value, { expectedHeadSha });
const json = (value) => JSON.stringify(value);

test('structured output hop le: PASS va REQUEST_CHANGES', () => {
  for (const verdict of ['PASS', 'REQUEST_CHANGES']) {
    const parsed = parse(json(reviewResult(verdict)));
    assert.equal(parsed.ok, true, verdict);
    assert.equal(parsed.result.verdict, verdict);
  }
});

test('reject output rong, hong, khong phai object', () => {
  assert.equal(parse('').reason, 'EMPTY_OUTPUT');
  assert.equal(parse('   ').reason, 'EMPTY_OUTPUT');
  assert.equal(parse(undefined).reason, 'EMPTY_OUTPUT');
  assert.equal(parse('{not json').reason, 'MALFORMED_JSON');
  assert.equal(parse('[]').reason, 'NOT_AN_OBJECT');
  assert.equal(parse('"PASS"').reason, 'NOT_AN_OBJECT');
});

test('exact-head binding: head_sha phai khop HEAD hien tai', () => {
  assert.equal(parse(json(reviewResult('PASS', OTHER_HEAD))).reason, 'HEAD_SHA_MISMATCH');
  assert.equal(parse(json({ ...reviewResult(), head_sha: 'abc' })).reason, 'SCHEMA_HEAD_SHA');
  assert.equal(
    parse(json({ ...reviewResult(), head_sha: HEAD.toUpperCase() })).reason,
    'SCHEMA_HEAD_SHA',
  );
});

test('schema: thieu truong, truong la, sai kieu, ngoai tu vung deu bi tu choi', () => {
  const base = reviewResult('PASS');
  const { summary, ...missing } = base;
  assert.equal(summary.length > 0, true);
  assert.equal(parse(json(missing)).reason, 'SCHEMA_KEYS');
  assert.equal(parse(json({ ...base, extra: 1 })).reason, 'SCHEMA_KEYS');
  assert.equal(parse(json({ ...base, verdict: 'MAYBE' })).reason, 'SCHEMA_VERDICT');
  assert.equal(parse(json({ ...base, summary: '  ' })).reason, 'SCHEMA_SUMMARY');
  assert.equal(parse(json({ ...base, findings: 'none' })).reason, 'SCHEMA_FINDINGS');
  const finding = { severity: 'nit', path: 'a.ts', line: 1, message: 'x' };
  assert.equal(
    parse(json({ ...base, findings: [{ ...finding, extra: 1 }] })).reason,
    'SCHEMA_FINDING_KEYS',
  );
  assert.equal(
    parse(json({ ...base, findings: [{ ...finding, severity: 'huge' }] })).reason,
    'SCHEMA_FINDING_SEVERITY',
  );
  assert.equal(
    parse(json({ ...base, findings: [{ ...finding, line: 1.5 }] })).reason,
    'SCHEMA_FINDING_LINE',
  );
  assert.equal(
    parse(json({ ...base, findings: [{ ...finding, message: '' }] })).reason,
    'SCHEMA_FINDING_MESSAGE',
  );
  const many = Array.from({ length: 21 }, () => finding);
  assert.equal(parse(json({ ...base, findings: many })).reason, 'SCHEMA_FINDINGS');
});

test('verdict phai nhat quan voi muc nghiem trong cua finding', () => {
  const blocker = { severity: 'blocker', path: 'a.ts', line: 3, message: 'hong' };
  assert.equal(
    parse(json({ ...reviewResult('PASS'), findings: [blocker] })).reason,
    'PASS_WITH_BLOCKING_FINDING',
  );
  assert.equal(
    parse(json({ ...reviewResult('REQUEST_CHANGES'), findings: [] })).reason,
    'REQUEST_CHANGES_WITHOUT_BLOCKING_FINDING',
  );
  const minorOnly = {
    ...reviewResult('REQUEST_CHANGES'),
    findings: [{ ...blocker, severity: 'minor' }],
  };
  assert.equal(parse(json(minorOnly)).reason, 'REQUEST_CHANGES_WITHOUT_BLOCKING_FINDING');
});

test('schema trong code la schema chat: khong cho khoa la, du 4 truong bat buoc', () => {
  assert.equal(REVIEW_SCHEMA.additionalProperties, false);
  assert.deepEqual(REVIEW_SCHEMA.required, ['verdict', 'head_sha', 'summary', 'findings']);
  assert.equal(REVIEW_SCHEMA.properties.findings.items.additionalProperties, false);
});

test('comment Reviewer: marker dong dau mang version/head/verdict/run, doc lai duoc', () => {
  const comment = reviewComment({ verdict: 'REQUEST_CHANGES' });
  const [first] = comment.body.split('\n');
  assert.match(
    first,
    new RegExp(
      `^<!-- autopilot-review:v1 head=${HEAD} verdict=REQUEST_CHANGES risk=R1 run=${REVIEW_RUN_ID} data=[A-Za-z0-9_-]+ -->$`,
    ),
  );
  const read = readReviewComment(comment);
  assert.equal(read.head, HEAD);
  assert.equal(read.verdict, 'REQUEST_CHANGES');
  assert.equal(read.runId, String(REVIEW_RUN_ID));
  assert.equal(read.result.findings[0].path, 'src/x.ts');
});

test('comment: chan @mention trong text do model viet, giu nguyen du lieu may-doc', () => {
  const result = { ...reviewResult('PASS'), summary: 'cc @octocat xem giup' };
  const body = buildReviewComment({ result, risk: 'R1', runId: 1, runUrl: 'u' });
  assert.doesNotMatch(body.split('\n').slice(1).join('\n'), /@octocat/);
  assert.equal(
    readReviewComment({ id: 1, created_at: 'x', body }).result.summary,
    'cc @octocat xem giup',
  );
});

test('marker bi sua (verdict doi, du lieu hong, khac head) -> khong doc duoc', () => {
  const good = reviewComment({ verdict: 'REQUEST_CHANGES' });
  assert.equal(
    readReviewComment({
      ...good,
      body: good.body.replace('verdict=REQUEST_CHANGES', 'verdict=PASS'),
    }),
    null,
  );
  assert.equal(
    readReviewComment({ ...good, body: good.body.replace(/data=\S+/, 'data=%%%') }),
    null,
  );
  assert.equal(
    readReviewComment({ ...good, body: good.body.replace(`head=${HEAD}`, `head=${OTHER_HEAD}`) }),
    null,
  );
  assert.equal(readReviewComment({ ...good, body: `them dong\n${good.body}` }), null);
});

test('latestTrustedReview: bo comment cua nguoi/bot la, lay moi nhat cua dung HEAD', () => {
  const stranger = reviewComment({ id: 901, user: { login: 'octocat', type: 'User' } });
  const otherBot = reviewComment({ id: 902, user: { login: 'evil[bot]', type: 'Bot' } });
  const oldHead = reviewComment({ id: 903, head: OTHER_HEAD });
  assert.equal(latestTrustedReview([stranger, otherBot, oldHead], HEAD), null);

  const first = reviewComment({ id: 910, verdict: 'REQUEST_CHANGES' });
  const second = reviewComment({ id: 920, verdict: 'PASS' });
  assert.equal(latestTrustedReview([second, first], HEAD).verdict, 'PASS', 'moi nhat theo id');
  assert.equal(latestTrustedReview([first, stranger], HEAD).verdict, 'REQUEST_CHANGES');
});

test('verifyReviewRun: comment phai tro toi run autopilot-reviewer that cua dung HEAD', () => {
  const review = readReviewComment(reviewComment());
  assert.deepEqual(verifyReviewRun({ run: reviewerRun(), review }), { ok: true, reason: 'OK' });
  const reasonOf = (run) => verifyReviewRun({ run, review }).reason;
  assert.equal(reasonOf(null), 'REVIEW_RUN_NOT_FOUND');
  assert.equal(
    reasonOf(reviewerRun({ path: '.github/workflows/ci.yml' })),
    'REVIEW_RUN_WRONG_WORKFLOW',
  );
  assert.equal(reasonOf(reviewerRun({ event: 'pull_request' })), 'REVIEW_RUN_WRONG_EVENT');
  assert.equal(
    reasonOf(reviewerRun({ display_title: `autopilot-reviewer ${OTHER_HEAD}` })),
    'REVIEW_RUN_WRONG_HEAD',
  );
  assert.equal(
    reasonOf(reviewerRun({ status: 'completed', conclusion: 'failure' })),
    'REVIEW_RUN_NOT_SUCCESS',
  );
  assert.equal(reasonOf(reviewerRun({ status: 'completed', conclusion: 'success' })), 'OK');
  assert.equal(reasonOf(reviewerRun({ id: 1 })), 'REVIEW_RUN_ID_MISMATCH');
  assert.equal(
    reasonOf(reviewerRun({ run_started_at: '2027-01-01T00:00:00Z' })),
    'REVIEW_COMMENT_BEFORE_RUN',
  );
});
