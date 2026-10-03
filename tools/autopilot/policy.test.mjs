import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MARKER_KINDS,
  MAX_REPAIR_ROUNDS,
  REQUIRED_CHECKS,
  encodeMarker,
} from './autopilot-core.mjs';
import {
  authorizeRepair,
  decideAutonomy,
  decideRepair,
  evaluateRequiredChecks,
  protectedPathsInPullFiles,
} from './policy.mjs';
import { HEAD, OTHER_HEAD, botUser, greenChecks } from './phase2-fixtures.mjs';

test('REQUIRED_CHECKS la dung 7 check cua ruleset main-protection, dung thu tu', () => {
  assert.deepEqual(
    [...REQUIRED_CHECKS],
    ['verify', 'integration', 'workflow-integration', 'tenant-packs', 'e2e', 'audit', 'images'],
  );
});

test('CI: 7/7 success cua dung HEAD -> ok', () => {
  assert.deepEqual(evaluateRequiredChecks(greenChecks(), HEAD), {
    ok: true,
    passed: 7,
    missing: [],
    pending: [],
    failing: [],
  });
});

test('CI: thieu, dang chay, that bai, skipped deu KHONG phai 7/7', () => {
  const runs = greenChecks();
  const without = runs.filter((r) => r.name !== 'e2e');
  assert.deepEqual(evaluateRequiredChecks(without, HEAD).missing, ['e2e']);

  const pending = runs.map((r) =>
    r.name === 'audit' ? { ...r, status: 'in_progress', conclusion: null } : r,
  );
  assert.deepEqual(evaluateRequiredChecks(pending, HEAD).pending, ['audit']);

  const failing = runs.map((r) => (r.name === 'verify' ? { ...r, conclusion: 'failure' } : r));
  assert.deepEqual(evaluateRequiredChecks(failing, HEAD).failing, ['verify=failure']);

  const skipped = runs.map((r) => (r.name === 'images' ? { ...r, conclusion: 'skipped' } : r));
  const result = evaluateRequiredChecks(skipped, HEAD);
  assert.equal(result.ok, false);
  assert.equal(result.passed, 6);
});

test('CI: check cua HEAD khac, cua App khac, hoac thieu 1/7 khong duoc tinh', () => {
  assert.equal(evaluateRequiredChecks(greenChecks(OTHER_HEAD), HEAD).ok, false);
  const forged = greenChecks().map((r) =>
    r.name === 'verify' ? { ...r, app: { slug: 'evil-app' } } : r,
  );
  assert.deepEqual(evaluateRequiredChecks(forged, HEAD).missing, ['verify']);
  assert.equal(evaluateRequiredChecks(greenChecks().slice(0, 6), HEAD).ok, false);
});

test('CI: rerun — check-run MOI NHAT (id lon nhat) moi quyet dinh', () => {
  const runs = greenChecks();
  const failedThenFixed = [...runs, { ...runs[0], id: 999, conclusion: 'failure' }];
  assert.equal(evaluateRequiredChecks(failedThenFixed, HEAD).ok, false);
  const brokenThenGreen = runs
    .map((r) => (r.name === 'verify' ? { ...r, id: 1, conclusion: 'failure' } : r))
    .concat({ ...runs[0], id: 2 });
  assert.equal(evaluateRequiredChecks(brokenThenGreen, HEAD).ok, true);
});

test('protected paths: ca ten moi lan ten cu cua rename', () => {
  const files = [
    { filename: 'apps/api/src/a.ts' },
    { filename: 'docs/x.md', previous_filename: '.github/workflows/ci.yml' },
    { filename: 'tools/autopilot/policy.mjs' },
    { filename: 'packages/CLAUDE.md' },
  ];
  assert.deepEqual(protectedPathsInPullFiles(files).sort(), [
    '.github/workflows/ci.yml',
    'packages/CLAUDE.md',
    'tools/autopilot/policy.mjs',
  ]);
  assert.deepEqual(protectedPathsInPullFiles([{ filename: 'apps/a.ts' }]), []);
});

const repairMarker = (id, head, attempt, user = botUser) => ({
  id,
  user,
  body: encodeMarker(MARKER_KINDS.repair, { head, attempt }),
});

test('retry ceiling = 2 vong Repair tren mot PR', () => {
  assert.equal(MAX_REPAIR_ROUNDS, 2);
  assert.deepEqual(decideRepair({ risk: 'R1', comments: [], headSha: HEAD }), {
    action: 'DISPATCH',
    reason: 'OK',
    attemptsUsed: 0,
    attempt: 1,
  });
  const one = [repairMarker(1, OTHER_HEAD, 1)];
  assert.equal(decideRepair({ risk: 'R0', comments: one, headSha: HEAD }).attempt, 2);
  const two = [...one, repairMarker(2, 'c'.repeat(40), 2)];
  assert.deepEqual(decideRepair({ risk: 'R1', comments: two, headSha: HEAD }), {
    action: 'NEEDS_HUMAN',
    reason: 'REPAIR_CEILING',
    attemptsUsed: 2,
  });
});

test('Repair: khong dispatch lap cho cung HEAD, R3 block, marker cua nguoi la khong tinh', () => {
  const sameHead = [repairMarker(1, HEAD, 1)];
  assert.equal(decideRepair({ risk: 'R1', comments: sameHead, headSha: HEAD }).action, 'SKIP');
  assert.equal(decideRepair({ risk: 'R3', comments: [], headSha: HEAD }).action, 'BLOCK');
  assert.equal(decideRepair({ risk: null, comments: [], headSha: HEAD }).action, 'BLOCK');
  const forged = [
    repairMarker(1, OTHER_HEAD, 1, { login: 'octocat', type: 'User' }),
    repairMarker(2, 'd'.repeat(40), 2, { login: 'octocat', type: 'User' }),
  ];
  assert.equal(decideRepair({ risk: 'R1', comments: forged, headSha: HEAD }).attempt, 1);
});

test('authorizeRepair: can marker cua bot cho dung HEAD, luot trong tran, khop payload', () => {
  const comments = [repairMarker(1, HEAD, 1)];
  assert.deepEqual(authorizeRepair({ comments, headSha: HEAD, attempt: 1 }), {
    ok: true,
    reason: 'OK',
    attempt: 1,
  });
  assert.equal(
    authorizeRepair({ comments, headSha: OTHER_HEAD, attempt: 1 }).reason,
    'REPAIR_NOT_AUTHORIZED',
  );
  assert.equal(
    authorizeRepair({ comments, headSha: HEAD, attempt: 2 }).reason,
    'REPAIR_ATTEMPT_MISMATCH',
  );
  assert.equal(
    authorizeRepair({ comments: [repairMarker(1, HEAD, 3)], headSha: HEAD }).reason,
    'REPAIR_ATTEMPT_OUT_OF_RANGE',
  );
  const byStranger = [repairMarker(1, HEAD, 1, { login: 'octocat', type: 'User' })];
  assert.equal(
    authorizeRepair({ comments: byStranger, headSha: HEAD }).reason,
    'REPAIR_NOT_AUTHORIZED',
  );
});

const ok = {
  ci: { ok: true },
  review: { verdict: 'PASS' },
  protectedPaths: [],
  humanHold: false,
};

test('autonomy: R0/R1 MERGE, R2 cho nguoi, R3 block', () => {
  assert.deepEqual(decideAutonomy({ ...ok, risk: 'R0' }), { action: 'MERGE', reason: 'OK' });
  assert.deepEqual(decideAutonomy({ ...ok, risk: 'R1' }), { action: 'MERGE', reason: 'OK' });
  assert.deepEqual(decideAutonomy({ ...ok, risk: 'R2' }), {
    action: 'WAIT_HUMAN',
    reason: 'REVIEW_PASS_WAITING_HUMAN',
  });
  assert.deepEqual(decideAutonomy({ ...ok, risk: 'R3' }), {
    action: 'BLOCK',
    reason: 'RISK_R3_BLOCKED',
  });
  assert.equal(decideAutonomy({ ...ok, risk: 'R9' }).reason, 'RISK_INVALID');
  assert.equal(decideAutonomy({ ...ok, risk: null }).action, 'BLOCK');
});

test('autonomy: KHONG merge truoc Reviewer PASS, khi CI chua du 7/7, khi cham duong dan bao ve', () => {
  for (const risk of ['R0', 'R1', 'R2']) {
    assert.equal(decideAutonomy({ ...ok, risk, review: null }).reason, 'REVIEW_NOT_PASS');
    assert.equal(
      decideAutonomy({ ...ok, risk, review: { verdict: 'REQUEST_CHANGES' } }).reason,
      'REVIEW_NOT_PASS',
    );
    assert.equal(decideAutonomy({ ...ok, risk, ci: null }).reason, 'CI_NOT_GREEN');
    assert.equal(decideAutonomy({ ...ok, risk, ci: { ok: false } }).reason, 'CI_NOT_GREEN');
    assert.equal(
      decideAutonomy({ ...ok, risk, protectedPaths: ['.github/x.yml'] }).reason,
      'PROTECTED_PATH',
    );
  }
  assert.equal(decideAutonomy({ ...ok, risk: 'R1', humanHold: true }).reason, 'NEEDS_HUMAN_LABEL');
});
