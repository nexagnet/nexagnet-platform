import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluatePreflight } from './preflight.mjs';

const issue = (...labels) => ({ state: 'open', labels: labels.map((name) => ({ name })) });
const ready = (...labels) =>
  evaluatePreflight({ eventLabel: 'autopilot:ready', issue: issue('autopilot:ready', ...labels) });

test('chi nhan autopilot:ready vua gan moi kich hoat', () => {
  for (const eventLabel of [
    'agent:ready',
    'agent:claude',
    'risk:R0',
    'autopilot:generated',
    undefined,
  ]) {
    const result = evaluatePreflight({ eventLabel, issue: issue('autopilot:ready', 'risk:R0') });
    assert.deepEqual(
      [result.decision, result.reason],
      ['BLOCK', 'NOT_ACTIVATION_LABEL'],
      String(eventLabel),
    );
  }
  assert.equal(ready('risk:R0').decision, 'RUN');
});

test('R0 pass', () => {
  assert.deepEqual(ready('risk:R0'), {
    decision: 'RUN',
    reason: 'OK',
    risk: 'R0',
    needsHuman: false,
  });
});

test('R1 pass', () => {
  assert.deepEqual(ready('risk:R1'), {
    decision: 'RUN',
    reason: 'OK',
    risk: 'R1',
    needsHuman: false,
  });
});

test('R2 pass + needs-human', () => {
  assert.deepEqual(ready('risk:R2'), {
    decision: 'RUN',
    reason: 'OK',
    risk: 'R2',
    needsHuman: true,
  });
});

test('R3 block', () => {
  assert.deepEqual(ready('risk:R3'), {
    decision: 'BLOCK',
    reason: 'RISK_R3_BLOCKED',
    risk: 'R3',
    needsHuman: false,
  });
});

test('thieu risk block', () => {
  assert.equal(ready().reason, 'RISK_MISSING');
  // Nhan gan giong khong phai nhan risk hop le.
  assert.equal(ready('risk:R4', 'risk:r1', 'risk:high').reason, 'RISK_MISSING');
});

test('nhieu risk block', () => {
  assert.deepEqual(
    [ready('risk:R0', 'risk:R1').decision, ready('risk:R0', 'risk:R1').reason],
    ['BLOCK', 'RISK_MULTIPLE'],
  );
  // R3 nam trong nhieu risk van la BLOCK, khong duoc chon nhan "de" nhat.
  assert.equal(ready('risk:R1', 'risk:R3').decision, 'BLOCK');
});

test('Issue khong OPEN thi block', () => {
  const result = evaluatePreflight({
    eventLabel: 'autopilot:ready',
    issue: { state: 'closed', labels: [{ name: 'autopilot:ready' }, { name: 'risk:R0' }] },
  });
  assert.equal(result.reason, 'ISSUE_NOT_OPEN');
});

test('nhan autopilot:ready da bi go truoc khi chay thi block', () => {
  const result = evaluatePreflight({ eventLabel: 'autopilot:ready', issue: issue('risk:R0') });
  assert.equal(result.reason, 'ACTIVATION_LABEL_GONE');
});
