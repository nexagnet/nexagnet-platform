import assert from 'node:assert/strict';
import { test } from 'node:test';

import { finalizeSignals } from './deploy-preview.mjs';
import { TOKEN, smokeSignal, world, proof } from './preview-world.mjs';

// ---------------------------------------------------------------------------------------------
// HEALTH + SMOKE (hai pha quanh restart) + danh gia cuoi
// ---------------------------------------------------------------------------------------------

test('health: edge chet / API khong khoe (ke ca 200 nhung status != ok) / trang web hong -> ma rieng, khong smoke', async () => {
  for (const [options, code] of [
    [{ edge: 503 }, 'WEB_EDGE_UNREACHABLE'],
    [{ fetchThrows: true }, 'WEB_EDGE_UNREACHABLE'],
    [{ apiHealth: 502 }, 'API_HEALTH_FAILED'],
    [{ apiHealthBody: '{"status":"degraded"}' }, 'API_HEALTH_FAILED'],
    [{ apiHealthBody: 'not json' }, 'API_HEALTH_FAILED'],
    [{ page: 500 }, 'WEB_PAGE_FAILED'],
    [{ pageType: 'application/json' }, 'WEB_PAGE_FAILED'],
  ]) {
    const w = world(options);
    const result = await w.run();
    assert.equal(result.machine.rollout, 'pass', JSON.stringify(options));
    assert.equal(result.machine.health, 'fail', JSON.stringify(options));
    assert.equal(result.machine.reasons.health, code, JSON.stringify(options));
    assert.equal(result.passed, false);
    assert.equal(w.log.smokeCalls.length, 0);
    assert.equal(proof(result.machine).ok, false);
  }
});

test('smoke that bai: ly do CU THE cua smoke duoc giu nguyen trong bao cao', async () => {
  const stdout = `${smokeSignal('fail', 'RELEASE_IDENTITY_MISMATCH', { message: 'tien trinh doc SHA khac' })}\n`;
  const result = await world({ smoke: { exitCode: 1, stdout } }).run();
  assert.equal(result.machine.deterministicSmoke, 'fail');
  assert.equal(result.machine.reasons.deterministicSmoke, 'RELEASE_IDENTITY_MISMATCH');
  assert.equal(result.passed, false);
  assert.equal(result.machine.hardFailure, true);
  assert.equal(proof(result.machine).ok, false);
});

test('smoke chet khong ke ly do / thoat 0 ma khong bao pass / bao fail nhung thoat 0 -> deu that bai', async () => {
  const cases = [
    [{ exitCode: 1, stdout: '' }, 'DETERMINISTIC_HARNESS_ERROR'],
    [{ exitCode: 137, stdout: 'rac khong phai tin hieu\n' }, 'DETERMINISTIC_HARNESS_ERROR'],
    [{ exitCode: 0, stdout: 'DETERMINISTIC_BASELINE={}\n' }, 'DETERMINISTIC_NO_SIGNAL'],
    [
      { exitCode: 0, stdout: `${smokeSignal('fail', 'READINESS_CONTRACT_FAILED')}\n` },
      'READINESS_CONTRACT_FAILED',
    ],
    [
      {
        exitCode: 0,
        stdout: `${smokeSignal('pass', 'OK')}\n${smokeSignal('fail', 'PERSISTENCE_CONTRACT_FAILED')}\n`,
      },
      'PERSISTENCE_CONTRACT_FAILED',
    ],
  ];
  for (const [smoke, code] of cases) {
    const result = await world({ smoke }).run();
    assert.equal(result.machine.deterministicSmoke, 'fail', code);
    assert.equal(result.machine.reasons.deterministicSmoke, code);
    assert.equal(result.passed, false, code);
  }
});

// ---------------------------------------------------------------------------------------------
// KHOI DONG LAI: nua con lai cua cong smoke (ben vung)
// ---------------------------------------------------------------------------------------------

test('restart bi tu choi (403/500) -> deterministicSmoke fail RESTART_FAILED voi serviceId, khong chay pha sau', async () => {
  for (const status of [403, 500]) {
    const w = world({ restartStatus: status });
    const result = await w.run();
    assert.equal(result.machine.deterministicSmoke, 'fail', String(status));
    assert.equal(result.machine.reasons.deterministicSmoke, 'RESTART_FAILED');
    assert.equal(result.machine.details.deterministicSmoke.serviceId, 'api');
    assert.equal(result.machine.details.deterministicSmoke.httpStatus, status);
    assert.equal(w.log.smokeCalls.length, 1, 'chi pha pre da chay');
    assert.equal(result.passed, false);
    assert.equal(proof(result.machine).ok, false);
  }
});

test('sau restart khong co container MOI (hoac container cu van song) -> RESTART_TIMEOUT, khong smoke nham tien trinh cu', async () => {
  for (const options of [{ restartStale: true }, { restartOldLingers: true }]) {
    const w = world(options);
    const result = await w.run();
    assert.equal(
      result.machine.reasons.deterministicSmoke,
      'RESTART_TIMEOUT',
      JSON.stringify(options),
    );
    assert.equal(result.machine.details.deterministicSmoke.serviceId, 'api');
    assert.equal(w.log.smokeCalls.length, 1);
    assert.equal(result.passed, false);
  }
});

test('health hong SAU restart -> POST_RESTART_HEALTH_FAILED, nguyen nhan trong chi tiet', async () => {
  const w = world({ healthFailsAfterRestart: true });
  const result = await w.run();
  assert.equal(result.machine.rollout, 'pass');
  assert.equal(result.machine.health, 'pass', 'health truoc restart van pass');
  assert.equal(result.machine.deterministicSmoke, 'fail');
  assert.equal(result.machine.reasons.deterministicSmoke, 'POST_RESTART_HEALTH_FAILED');
  assert.equal(result.machine.details.deterministicSmoke.cause, 'API_HEALTH_FAILED');
  assert.equal(w.log.smokeCalls.length, 1);
});

test('smoke pha post-restart bao that bai (bat bien doi / mat ben vung) -> that bai nang hon pha pre da pass', async () => {
  const postFail = `${smokeSignal('fail', 'PERSISTENCE_CONTRACT_FAILED', { message: 'nguon su that doi sau restart' })}\n`;
  const w = world({ smokeByPhase: { 'post-restart': { exitCode: 1, stdout: postFail } } });
  const result = await w.run();
  assert.equal(w.log.smokeCalls.length, 2);
  // Hai tin hieu cung tang: pass roi fail — fail PHAI thang (khong de pha pass dau xoa dau vet).
  assert.equal(result.machine.deterministicSmoke, 'fail');
  assert.equal(result.machine.reasons.deterministicSmoke, 'PERSISTENCE_CONTRACT_FAILED');
  assert.equal(result.passed, false);
  assert.equal(proof(result.machine).ok, false);
});

test('pha pre pass nhung KHONG phat baseline -> fail closed (khong am tham bo qua phep doi chieu ben vung)', async () => {
  const w = world({ noBaseline: true });
  const result = await w.run();
  assert.equal(result.machine.reasons.deterministicSmoke, 'DETERMINISTIC_BASELINE_MISSING');
  assert.deepEqual(w.log.restarts, [], 'khong restart khi chua co baseline');
  assert.equal(w.log.smokeCalls.length, 1);
  assert.equal(result.passed, false);
});

test('rollout: container cu van dang chay canh container moi -> chua tinh la xong (ROLLOUT_TIMEOUT)', async () => {
  const w = world({ oldContainerLingers: true });
  const result = await w.run();
  assert.equal(result.machine.reasons.rollout, 'ROLLOUT_TIMEOUT');
  assert.equal(w.log.smokeCalls.length, 0);
});

test('smoke pass nhung ma thoat != 0 -> khong tinh la pass', async () => {
  const stdout = `${smokeSignal('pass', 'DETERMINISTIC_CONTRACT_OK')}\n`;
  const result = await world({ smoke: { exitCode: 2, stdout } }).run();
  assert.equal(result.passed, false);
  assert.equal(result.machine.deterministicSmoke, 'fail');
});

// ---------------------------------------------------------------------------------------------
// DANH GIA CUOI
// ---------------------------------------------------------------------------------------------

test('finalize: ma thoat != 0 hoac nhat ky rong KHONG BAO GIO xanh, du moi tang deu pass', async () => {
  const happy = await world().run();
  assert.equal(finalizeSignals({ journalText: happy.journalText, exitCode: 0 }).passed, true);
  assert.equal(finalizeSignals({ journalText: happy.journalText, exitCode: 1 }).passed, false);
  const empty = finalizeSignals({ journalText: '', exitCode: 0 });
  assert.equal(empty.passed, false);
  assert.equal(empty.machine.hardFailure, true);
  assert.equal(empty.machine.classification, 'DEPLOY_SIGNAL_INCOMPLETE');
});

test('loi bat ngo trong client bi chan o ranh gioi tang, thong bao bi xoa token, va KHONG nuot', async () => {
  const exploding = {
    getProject: async () => {
      throw new Error(`TypeError: cannot read Bearer ${TOKEN} of undefined`);
    },
  };
  const w = world({ client: exploding });
  const result = await w.run();
  assert.equal(result.machine.reasons.rollout, 'DEPLOY_HARNESS_ERROR');
  assert.equal(result.passed, false);
  assert.equal(result.journalText.includes(TOKEN), false);
});

// ---------------------------------------------------------------------------------------------
