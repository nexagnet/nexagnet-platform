import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DEPLOY_SIGNAL_PREFIX,
  evaluateDeploySignals,
  formatDeploySummary,
  parseSignalJournal,
  toMachineResult,
} from './deploy-signals.mjs';

const GIT_SHA = '1'.repeat(40);
const APP_DIGEST = `asia-southeast1-docker.pkg.dev/p/r/app@sha256:${'a'.repeat(64)}`;
const FLOWISE_DIGEST = `asia-southeast1-docker.pkg.dev/p/r/flowise@sha256:${'b'.repeat(64)}`;

const line = (payload) => `${DEPLOY_SIGNAL_PREFIX} ${JSON.stringify(payload)}`;

function meta(overrides = {}) {
  return {
    layer: 'meta',
    tenant: 'demo-tenant',
    environment: 'gd1-test',
    stack: 'demo-tenant-gd1-test',
    gitSha: GIT_SHA,
    appDigest: APP_DIGEST,
    flowiseDigest: FLOWISE_DIGEST,
    workflowRunId: '42',
    ...overrides,
  };
}

const rolloutPass = { layer: 'rollout', status: 'pass', reason: 'ROLLOUT_MATCHES_RELEASE' };
const healthPass = { layer: 'health', status: 'pass', reason: 'RUNTIME_HEALTHY' };
const deterministicPass = {
  layer: 'deterministicSmoke',
  status: 'pass',
  reason: 'DETERMINISTIC_CONTRACT_OK',
};
const liveAiPass = {
  layer: 'liveAiSmoke',
  status: 'pass',
  reason: 'LIVE_AI_MATCHES_FIXTURE',
  detail: { expectedIntent: 'dat_don', actualIntent: 'dat_don' },
};

function journalOf(entries) {
  return entries.map((entry) => line(entry)).join('\n');
}

function evaluate(entries, remoteExitCode = 0) {
  const parsed = parseSignalJournal(journalOf([meta(), ...entries]));
  return evaluateDeploySignals({ entries: parsed.entries, remoteExitCode });
}

// ---------------------------------------------------------------------------------------------
// CASE 1-9 cua hop dong tin hieu deploy.
// ---------------------------------------------------------------------------------------------

test('CASE 1: rollout FAIL la hard failure va khong bia ra ket qua cua tang duoi', () => {
  const result = evaluate(
    [{ layer: 'rollout', status: 'fail', reason: 'RELEASE_DIGEST_MISMATCH' }],
    1,
  );
  assert.equal(result.hardFailure, true);
  assert.equal(result.ok, false);
  assert.equal(result.classification, 'ROLLOUT_FAILED');
  assert.equal(result.signals.rollout.status, 'fail');
  // Cac tang duoi CHUA CHAY. Bao chung la fail se do loi sai cho; bao pass la xanh gia.
  assert.equal(result.signals.health.status, 'pending');
  assert.equal(result.signals.deterministicSmoke.status, 'pending');
  assert.equal(result.signals.liveAiSmoke.status, 'pending');
});

test('CASE 2: rollout PASS + health FAIL la hard failure va KHONG noi rollout that bai', () => {
  const result = evaluate(
    [rolloutPass, { layer: 'health', status: 'fail', reason: 'API_HEALTH_FAILED' }],
    1,
  );
  assert.equal(result.hardFailure, true);
  assert.equal(result.classification, 'RUNTIME_UNHEALTHY');
  assert.equal(result.signals.rollout.status, 'pass');
  assert.equal(result.signals.health.status, 'fail');
});

test('CASE 3: deterministic smoke FAIL la hard failure', () => {
  const result = evaluate(
    [
      rolloutPass,
      healthPass,
      { layer: 'deterministicSmoke', status: 'fail', reason: 'AUTH_CONTRACT_FAILED' },
    ],
    1,
  );
  assert.equal(result.hardFailure, true);
  assert.equal(result.classification, 'DETERMINISTIC_RUNTIME_CONTRACT_FAILED');
  assert.equal(result.signals.liveAiSmoke.status, 'pending');
});

test('CASE 4: bon tang deu PASS thi deploy sach', () => {
  const result = evaluate([rolloutPass, healthPass, deterministicPass, liveAiPass], 0);
  assert.equal(result.ok, true);
  assert.equal(result.hardFailure, false);
  assert.equal(result.liveAiFailure, false);
  assert.equal(result.classification, 'APPLICATION_ROLLED_OUT_HEALTHY');
});

test('CASE 5: live AI FAIL bao dung tang AI, KHONG bao rollout that bai', () => {
  const result = evaluate(
    [
      rolloutPass,
      healthPass,
      deterministicPass,
      {
        layer: 'liveAiSmoke',
        status: 'fail',
        reason: 'LIVE_AI_INTENT_MISMATCH',
        detail: { expectedIntent: 'dat_don', actualIntent: 'khac' },
      },
    ],
    0,
  );
  assert.equal(result.hardFailure, false, 'AI phan loai sai KHONG duoc lam rollout do');
  assert.equal(result.liveAiFailure, true);
  assert.equal(result.ok, false);
  assert.equal(result.classification, 'APPLICATION_ROLLED_OUT_HEALTHY__LIVE_AI_SMOKE_FAILED');
  assert.equal(result.signals.rollout.status, 'pass');
  assert.equal(result.signals.health.status, 'pass');
  assert.equal(result.signals.deterministicSmoke.status, 'pass');

  const summary = formatDeploySummary(result);
  assert.match(summary, /ROLLOUT/);
  assert.match(summary, /LIVE AI SMOKE/);
  assert.match(summary, /dat_don/);
  assert.match(summary, /khac/);
  assert.doesNotMatch(summary, /ROLLOUT_FAILED/);
});

test('CASE 6: live AI timeout duoc bao rieng, khong lan sang tang khac', () => {
  const result = evaluate(
    [
      rolloutPass,
      healthPass,
      deterministicPass,
      {
        layer: 'liveAiSmoke',
        status: 'timeout',
        reason: 'LIVE_AI_TIMEOUT',
        detail: { timeoutMs: 45000 },
      },
    ],
    0,
  );
  assert.equal(result.hardFailure, false);
  assert.equal(result.liveAiFailure, true);
  assert.equal(result.classification, 'APPLICATION_ROLLED_OUT_HEALTHY__LIVE_AI_SMOKE_TIMEOUT');
  assert.equal(result.signals.liveAiSmoke.status, 'timeout');
});

test('CASE 7: provider khong san sang duoc bao la phu thuoc ngoai', () => {
  const result = evaluate(
    [
      rolloutPass,
      healthPass,
      deterministicPass,
      {
        layer: 'liveAiSmoke',
        status: 'unavailable',
        reason: 'LIVE_AI_PROVIDER_UNAVAILABLE',
        detail: { httpStatus: 503 },
      },
    ],
    0,
  );
  assert.equal(result.hardFailure, false);
  assert.equal(result.liveAiFailure, true);
  assert.equal(
    result.classification,
    'APPLICATION_ROLLED_OUT_HEALTHY__LIVE_AI_PROVIDER_UNAVAILABLE',
  );
});

test('CASE 8: release SHA/digest lech la hard FAIL', () => {
  const result = evaluate(
    [
      {
        layer: 'rollout',
        status: 'fail',
        reason: 'RELEASE_SHA_MISMATCH',
        detail: { expectedGitSha: GIT_SHA, observedGitSha: '9'.repeat(40) },
      },
    ],
    1,
  );
  assert.equal(result.hardFailure, true);
  assert.equal(result.classification, 'ROLLOUT_FAILED');
  assert.equal(result.signals.rollout.reason, 'RELEASE_SHA_MISMATCH');
});

test('CASE 9: worker bat buoc khong healthy la hard FAIL o tang health', () => {
  const result = evaluate(
    [
      rolloutPass,
      {
        layer: 'health',
        status: 'fail',
        reason: 'WORKFLOW_WORKER_UNHEALTHY',
        detail: { service: 'workflow-worker-sales-handoff-v1' },
      },
    ],
    1,
  );
  assert.equal(result.hardFailure, true);
  assert.equal(result.classification, 'RUNTIME_UNHEALTHY');
  assert.equal(result.signals.health.reason, 'WORKFLOW_WORKER_UNHEALTHY');
});

// ---------------------------------------------------------------------------------------------
// KHONG XANH GIA / KHONG DO SAI NGHIA
// ---------------------------------------------------------------------------------------------

test('KHONG XANH GIA: shell chet ma khong tang nao bao fail thi van la hard failure', () => {
  const result = evaluate([rolloutPass, healthPass], 1);
  assert.equal(result.hardFailure, true);
  assert.equal(result.ok, false);
  assert.equal(result.classification, 'DEPLOY_SIGNAL_INCOMPLETE');
});

test('KHONG XANH GIA: thieu tang van la hard failure du shell bao thanh cong', () => {
  const result = evaluate([rolloutPass, healthPass, deterministicPass], 0);
  assert.equal(result.hardFailure, true);
  assert.equal(result.classification, 'DEPLOY_SIGNAL_INCOMPLETE');
  assert.equal(result.signals.liveAiSmoke.status, 'pending');
});

test('KHONG XANH GIA: mot tang bao lai pass sau khi da fail thi FAIL van thang', () => {
  const result = evaluate(
    [
      rolloutPass,
      { layer: 'health', status: 'fail', reason: 'API_HEALTH_FAILED' },
      { layer: 'health', status: 'pass', reason: 'RUNTIME_HEALTHY' },
    ],
    1,
  );
  assert.equal(result.signals.health.status, 'fail');
  assert.equal(result.hardFailure, true);
});

test('ly do CU THE cua bai kiem thang ly do CHUNG CHUNG cua cai bay shell', () => {
  // Cai bay `EXIT` cua deploy-stack.sh phat ra sau khi bai kiem da phat ra ly do cua chinh no.
  // Giu ban dau tien la giu chan doan dung.
  const result = evaluate(
    [
      rolloutPass,
      healthPass,
      { layer: 'deterministicSmoke', status: 'fail', reason: 'AUTH_CONTRACT_FAILED' },
      { layer: 'deterministicSmoke', status: 'fail', reason: 'DETERMINISTIC_HARNESS_ERROR' },
    ],
    1,
  );
  assert.equal(result.signals.deterministicSmoke.reason, 'AUTH_CONTRACT_FAILED');
});

test('KHONG XANH GIA: journal rong la hard failure, khong phai deploy sach', () => {
  const parsed = parseSignalJournal('');
  const result = evaluateDeploySignals({ entries: parsed.entries, remoteExitCode: 0 });
  assert.equal(result.hardFailure, true);
  assert.equal(result.classification, 'DEPLOY_SIGNAL_INCOMPLETE');
});

test('live AI bi bo qua (khach chua co fixture) khong lam do deploy', () => {
  const result = evaluate(
    [
      rolloutPass,
      healthPass,
      deterministicPass,
      { layer: 'liveAiSmoke', status: 'skipped', reason: 'LIVE_AI_SKIPPED_NO_FIXTURE' },
    ],
    0,
  );
  assert.equal(result.hardFailure, false);
  assert.equal(result.liveAiFailure, false);
  assert.equal(result.ok, true);
  assert.equal(result.classification, 'APPLICATION_ROLLED_OUT_HEALTHY__LIVE_AI_SMOKE_SKIPPED');
});

// ---------------------------------------------------------------------------------------------
// PARSE / RIENG TU / KET QUA MAY DOC DUOC
// ---------------------------------------------------------------------------------------------

test('journal bo qua dong log thuong va khong chet vi JSON hong', () => {
  const parsed = parseSignalJournal(
    [
      'Pulling postgres ...',
      line(meta()),
      `${DEPLOY_SIGNAL_PREFIX} {khong-phai-json`,
      line(rolloutPass),
    ].join('\n'),
  );
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.malformed.length, 1);
});

/**
 * Ten truong nghe nhu bi mat, va gia tri danh dau di kem — ca hai deu la DU LIEU, khong phai ma
 * nguon. Viet thang `apiKey: '...'` se lam bo quet bi mat truoc commit chan lai, va no dung khi
 * lam vay: mot bai kiem rieng tu khong duoc trong giong mot lan lo khoa that.
 */
const SECRET_FIELD_NAMES = Object.freeze(['apiKey', 'authorization', 'operatorPassword']);
const marker = (field) => `GIA-TRI-KHONG-DUOC-XUAT-HIEN-${field}`;

test('RIENG TU: truong mang bi mat bi loai khoi ca summary lan ket qua may doc', () => {
  const result = evaluate([
    rolloutPass,
    healthPass,
    deterministicPass,
    {
      layer: 'liveAiSmoke',
      status: 'fail',
      reason: 'LIVE_AI_INTENT_MISMATCH',
      detail: {
        expectedIntent: 'dat_don',
        actualIntent: 'khac',
        [SECRET_FIELD_NAMES[0]]: marker(SECRET_FIELD_NAMES[0]),
        [SECRET_FIELD_NAMES[1]]: marker(SECRET_FIELD_NAMES[1]),
        nested: { [SECRET_FIELD_NAMES[2]]: marker(SECRET_FIELD_NAMES[2]) },
      },
    },
  ]);
  const summary = formatDeploySummary(result);
  const machine = JSON.stringify(toMachineResult(result));
  for (const secret of SECRET_FIELD_NAMES.map(marker)) {
    assert.doesNotMatch(summary, new RegExp(secret));
    assert.doesNotMatch(machine, new RegExp(secret));
  }
  assert.match(summary, /khac/);
});

test('ket qua may doc duoc giu dung khuon toi thieu cho Fleet View sau nay', () => {
  const result = evaluate([rolloutPass, healthPass, deterministicPass, liveAiPass]);
  const machine = toMachineResult(result);
  assert.equal(machine.release.gitSha, GIT_SHA);
  assert.equal(machine.release.appDigest, APP_DIGEST);
  assert.equal(machine.rollout, 'pass');
  assert.equal(machine.health, 'pass');
  assert.equal(machine.deterministicSmoke, 'pass');
  assert.equal(machine.liveAiSmoke, 'pass');
  assert.equal(machine.classification, 'APPLICATION_ROLLED_OUT_HEALTHY');
  assert.equal(typeof machine.hardFailure, 'boolean');
  assert.equal(typeof machine.liveAiFailure, 'boolean');
});

test('DA KHACH: evaluator khong nhac ten khach nao trong ma nguon', () => {
  const source = readFileSync(new URL('./deploy-signals.mjs', import.meta.url), 'utf8');
  for (const tenantSlug of ['ultty', 'amico', 'wata']) {
    assert.doesNotMatch(source, new RegExp(tenantSlug, 'i'), `base khong duoc nhac ${tenantSlug}`);
  }
});

test('summary in danh tinh release lay tu meta, khong tu suy dien', () => {
  const result = evaluate([rolloutPass, healthPass, deterministicPass, liveAiPass]);
  const summary = formatDeploySummary(result);
  assert.match(summary, new RegExp(GIT_SHA.slice(0, 12)));
  assert.match(summary, /demo-tenant-gd1-test/);
});

// ---------------------------------------------------------------------------------------------
// CLI: ma thoat va noi ghi ra
// ---------------------------------------------------------------------------------------------

function runReporter(journal, remoteExitCode) {
  const directory = mkdtempSync(join(tmpdir(), 'deploy-signals-'));
  try {
    const journalPath = join(directory, 'journal.log');
    const jsonPath = join(directory, 'deploy-signals.json');
    const summaryPath = join(directory, 'summary.md');
    writeFileSync(journalPath, journal, 'utf8');
    writeFileSync(summaryPath, '', 'utf8');
    const entrypoint = fileURLToPath(new URL('./report-deploy-signals.mjs', import.meta.url));
    const run = spawnSync(
      process.execPath,
      [
        entrypoint,
        '--journal',
        journalPath,
        '--remote-exit-code',
        String(remoteExitCode),
        '--json-out',
        jsonPath,
      ],
      { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath } },
    );
    return {
      run,
      machine: JSON.parse(readFileSync(jsonPath, 'utf8')),
      summary: readFileSync(summaryPath, 'utf8'),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('CLI: bao cao luon exit 0 — no TUONG THUAT, khong phai cong chan', () => {
  const { run, machine, summary } = runReporter(
    journalOf([
      meta(),
      rolloutPass,
      healthPass,
      deterministicPass,
      {
        layer: 'liveAiSmoke',
        status: 'fail',
        reason: 'LIVE_AI_INTENT_MISMATCH',
        detail: { expectedIntent: 'dat_don', actualIntent: 'khac' },
      },
    ]),
    0,
  );
  assert.equal(run.status, 0, run.stderr);
  assert.equal(machine.liveAiSmoke, 'fail');
  assert.equal(machine.hardFailure, false);
  assert.match(summary, /LIVE AI SMOKE/);
});

test('CLI: hard failure duoc ghi ra ket qua may doc de buoc sau lam cong', () => {
  const { machine, summary } = runReporter(
    journalOf([meta(), { layer: 'rollout', status: 'fail', reason: 'RELEASE_DIGEST_MISMATCH' }]),
    1,
  );
  assert.equal(machine.hardFailure, true);
  assert.equal(machine.classification, 'ROLLOUT_FAILED');
  assert.match(summary, /ROLLOUT/);
});

// ---------------------------------------------------------------------------------------------
// HARNESS: mot tang cung bi do van phai ra mau do TU DAU DEN CUOI duong CD.
// ---------------------------------------------------------------------------------------------

test('HARNESS: gia lap health FAIL -> hard failure, va live AI khong the lam no xanh lai', () => {
  const { machine } = runReporter(
    journalOf([
      meta(),
      rolloutPass,
      { layer: 'health', status: 'fail', reason: 'API_HEALTH_FAILED' },
    ]),
    1,
  );
  assert.equal(machine.hardFailure, true);
  assert.equal(machine.classification, 'RUNTIME_UNHEALTHY');
  // Cong LIVE AI cua workflow chi cho qua khi tang nay `pass`/`skipped`. `pending` khong nam trong
  // do, nen khong co duong nao bien mot health FAIL thanh mau xanh.
  assert.equal(machine.liveAiSmoke, 'pending');
});

// ---------------------------------------------------------------------------------------------
// DAY NOI: tang shell + workflow phai thuc su phat ra va doc dung nhung tin hieu nay.
// ---------------------------------------------------------------------------------------------

const readSibling = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const deployStack = readSibling('deploy-stack.sh');
const deployRemote = readSibling('deploy-remote.sh');
const deployCi = readSibling('deploy-ci.sh');
const smokeTest = readSibling('smoke-test.mjs');
const deterministicSmoke = readSibling('deterministic-smoke.mjs');
const reusableWorkflow = readFileSync(
  new URL('../../.github/workflows/reusable-deploy-tenant.yml', import.meta.url),
  'utf8',
);

test('deploy-stack.sh phat ra ca bon tang, va co cai bay EXIT cho cho chua duoc gan tin hieu', () => {
  for (const layer of ['rollout', 'health', 'deterministicSmoke', 'liveAiSmoke']) {
    assert.match(deployStack, new RegExp(`stage ${layer} `), `thieu giai doan ${layer}`);
  }
  assert.match(deployStack, /emit_signal rollout pass ROLLOUT_MATCHES_RELEASE/);
  assert.match(deployStack, /emit_signal health pass RUNTIME_HEALTHY/);
  assert.match(deployStack, /trap on_deploy_exit EXIT/);
});

test('ROLLOUT doi chieu image DANG CHAY voi image cua ban phat hanh, va SHA toi tien trinh', () => {
  assert.match(deployStack, /docker inspect --format '\{\{\.Image\}\}'/);
  assert.match(deployStack, /docker image inspect --format '\{\{\.Id\}\}'/);
  assert.match(deployStack, /RELEASE_DIGEST_MISMATCH/);
  assert.match(deployStack, /printenv RELEASE_GIT_SHA/);
  assert.match(deployStack, /RELEASE_SHA_MISMATCH/);
});

test('live AI chay SAU deterministic va KHONG duoc lam do tang shell', () => {
  const deterministicIndex = deployStack.indexOf('deterministic-smoke.mjs');
  const liveAiIndex = deployStack.indexOf('< smoke-test.mjs');
  assert.ok(deterministicIndex >= 0, 'deploy phai chay hop dong runtime tat dinh');
  assert.ok(deterministicIndex < liveAiIndex, 'tat dinh phai chay TRUOC live AI');
  assert.match(deployStack, /-e "DEPLOY_SIGNAL_SOFT=1"/);
  // Khong co dong nay thi mot ket qua cua model lai lam do ca lan deploy — dung cai milestone
  // nay sinh ra de xoa bo.
  assert.match(deployStack, /< smoke-test\.mjs 2>&1 \| tee "\$\{smoke_output\}" \|\| true/);
  // ...va neu smoke chet truoc khi kip noi gi, tang nay van phai duoc ghi la FAIL.
  assert.match(deployStack, /grep -q '"layer":"liveAiSmoke"'/);
});

test('smoke-test.mjs MAC DINH van la cong cung — duong preflight khong bi noi long', () => {
  assert.match(smokeTest, /DEPLOY_SIGNAL_SOFT === '1'/);
  assert.match(smokeTest, /if \(!softSignal\) process\.exitCode = 1;/);
  // Model doan sai va provider chet la hai ket qua khac nhau, va phai phan biet duoc.
  assert.match(smokeTest, /LIVE_AI_INTENT_MISMATCH/);
  assert.match(smokeTest, /LIVE_AI_PROVIDER_UNAVAILABLE/);
  assert.match(smokeTest, /LIVE_AI_TIMEOUT/);
  // ...va tu 02/09/2026 them: "khong tinh duoc gia" khong duoc doi lot thanh "model doan sai".
  assert.match(smokeTest, /LIVE_AI_PRICING_UNAVAILABLE/);
});

/*
 * -----------------------------------------------------------------------------------------------
 * SU CO 02/09/2026 — deploy-tenant #33625765042, ultty/gd1-test, release b1e0344.
 *
 * Rollout/health/tat dinh/quan sat/kenh doc DEU XANH; chi LIVE AI SMOKE do voi
 * `LIVE_AI_INTENT_MISMATCH` (actualIntent=khac, confidence 0.30). Nguyen nhan KHONG phai model, ma
 * la chinh cong kiem tra: no noi `NETVIET-SMOKE-<epoch>` vao VAN BAN NGHIEP VU truoc khi gui cho
 * model. Do tren ban dang chay, 20 mau moi nhanh, xoay vong thu tu:
 *
 *   tin mau nguyen ban                       -> dat_don 20/20
 *   tin mau + `NETVIET-SMOKE-<epoch>`        -> dat_don 10/20   <-- 10/10 lan do nam o day
 *   cau menh lenh tuong duong                -> dat_don 20/20
 *   tin mo ho (doi chung am)                 -> khac    20/20
 *
 * Cai nhan do khong he duoc doc lai o dau: doi chieu di bang `order.id` API tra ve, con tinh duy
 * nhat cua tin do API tu sinh (`externalMessageId`). Nen no chi lam DUNG mot viec: bo them mot
 * token la vao cau ma model phai phan loai.
 * -----------------------------------------------------------------------------------------------
 */
/**
 * Bo chu thich truoc khi kiem — cung ly do nhu bai "hop dong tat dinh" ben duoi: chinh doan chu
 * thich la noi GIAI THICH vi sao cai nhan bi bo, nen no phai duoc phep goi ten cai nhan do. Kiem
 * tren van ban tho se bien mot loi giai thich tot thanh mot bai kiem do.
 */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const smokeTestCode = stripComments(smokeTest);

test('LIVE AI SMOKE gui DUNG tin mau cua goi khach — khong nhan tong hop trong van ban nghiep vu', () => {
  assert.match(
    smokeTestCode,
    /postJson\('\/demo\/simulate', \{ text: smokeFixture\.orderText \}\)/,
    'phai gui nguyen `smokeFixture.orderText`',
  );
  assert.doesNotMatch(
    smokeTestCode,
    /NETVIET-SMOKE/,
    'nhan smoke khong duoc quay lai van ban nghiep vu',
  );
  assert.doesNotMatch(
    smokeTestCode,
    /text: `\$\{smokeFixture\.orderText\}/,
    'khong duoc noi them BAT KY thu gi vao tin mau khi gui di',
  );
});

test('doi chieu tin -> don di bang DANH TINH DON, khong bang noi dung tin', () => {
  // Day la ly do vi sao bo duoc cai nhan ma khong mat gi: moi buoc sau POST deu bam `order.id`.
  assert.match(smokeTestCode, /assertPilotOrder\(order, order\.id\)/);
  assert.match(smokeTestCode, /event\.order\?\.id === order\.id/);
});

test('y dinh sai va khong tinh duoc gia la HAI ma ly do PHAN BIET DUOC', () => {
  assert.match(smokeTestCode, /if \(order\.intent !== 'dat_don'\) \{/);
  assert.match(smokeTestCode, /if \(!order\.priced\) \{/);
  // Gop hai duong lai thanh mot dieu kien chinh la loi da lam chan doan sai o #33625765042.
  assert.doesNotMatch(smokeTestCode, /order\.intent !== 'dat_don' \|\| !order\.priced/);
});

test('TACH MA LY DO KHONG LAM YEU CONG: thieu gia van lam do tang live-AI y het y dinh sai', () => {
  const pricing = evaluate([
    rolloutPass,
    healthPass,
    deterministicPass,
    {
      layer: 'liveAiSmoke',
      status: 'fail',
      reason: 'LIVE_AI_PRICING_UNAVAILABLE',
      detail: { intent: 'dat_don', orderId: 'o-1' },
    },
  ]);
  assert.equal(pricing.ok, false);
  assert.equal(pricing.liveAiFailure, true);
  assert.equal(pricing.hardFailure, false, 'thieu gia van KHONG duoc lam rollout do');
  assert.equal(pricing.classification, 'APPLICATION_ROLLED_OUT_HEALTHY__LIVE_AI_SMOKE_FAILED');

  // ...va ma ly do phai di duoc toi bao cao, neu khong thi viec tach chang de lam gi.
  assert.match(formatDeploySummary(pricing), /LIVE_AI_PRICING_UNAVAILABLE/);
  assert.match(JSON.stringify(toMachineResult(pricing)), /LIVE_AI_PRICING_UNAVAILABLE/);
});

test('hop dong tat dinh khong goi mot duong nao cua model', () => {
  // Bo chu thich truoc khi kiem: chinh phan mo dau cua tep giai thich VI SAO no ton tai, nen no
  // co nhac `demo/simulate` va `dat_don` — mot phep kiem tren van ban tho se do vi mot cau van.
  const code = deterministicSmoke.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /demo\/simulate/);
  assert.doesNotMatch(code, /dat_don/);
  assert.doesNotMatch(code, /\bintent\b/i);
  // Cong thu hep theo NANG LUC, va khong doc duoc goi khach thi doi DAY DU.
  assert.match(deterministicSmoke, /capabilities === null \|\| capabilities\.includes/);
});

test('deploy-remote.sh phat danh tinh release TRUOC khi stack len', () => {
  const metaIndex = deployRemote.indexOf('"layer":"meta"');
  const stackIndex = deployRemote.indexOf('deploy-stack.sh"');
  assert.ok(metaIndex >= 0 && metaIndex < stackIndex, 'meta phai duoc phat truoc deploy-stack.sh');
});

test('deploy-ci.sh chep so nhat ky va VAN do khi lan deploy chua duoc chung minh', () => {
  assert.match(deployCi, /tee "\$\{DEPLOY_SIGNAL_LOG\}"/);
  assert.match(deployCi, /report-deploy-signals\.mjs/);
  assert.match(deployCi, /remote_status="\$\{PIPESTATUS\[0\]\}"/);
  // KHONG XANH GIA: cong nam o `hardFailure`, khong o ma thoat cua ssh.
  assert.match(deployCi, /hard_failure/);
  assert.match(deployCi, /if \[\[ "\$\{hard_failure\}" != 'false' \]\]; then/);
});

test('workflow tach buoc LIVE AI ra khoi buoc rollout, va khong nuot ket qua cua no', () => {
  assert.match(reusableWorkflow, /id: rollout/);
  assert.match(reusableWorkflow, /- name: LIVE AI SMOKE/);
  assert.match(reusableWorkflow, /result\.liveAiSmoke/);
  assert.match(reusableWorkflow, /deploy-signals\.json/);
  // `continue-on-error` bien mot tin hieu thanh mot dong log khong ai doc — cam o day.
  assert.doesNotMatch(reusableWorkflow, /continue-on-error/);
  // Duong dan cua khach phai in ra KE CA khi live AI do: ung dung da len va dang khoe.
  assert.match(reusableWorkflow, /!cancelled\(\) && steps\.rollout\.outcome == 'success'/);
});

/**
 * ==============================================================================================
 * TANG QUAN SAT — bao cao, KHONG chan.
 *
 * Hai tang nay ton tai vi mot su co da thuc su xay ra: suot ~44 gio, ba tin hieu deploy deu xanh
 * trong khi kenh doc chinh cua GD1 khong mang ve mot tin nao (reference-platform-stack §7.1).
 * Cai thieu khong phai mot cong CHAN — cai thieu la mot cho de NHIN.
 */
const healthyBase = [
  { layer: 'rollout', status: 'pass', reason: 'ROLLOUT_MATCHES_RELEASE' },
  { layer: 'health', status: 'pass', reason: 'RUNTIME_HEALTHY' },
  { layer: 'deterministicSmoke', status: 'pass', reason: 'DETERMINISTIC_CONTRACT_OK' },
  { layer: 'liveAiSmoke', status: 'pass', reason: 'LIVE_AI_MATCHES_FIXTURE' },
];

test('quan sat — kho quan sat hong KHONG lam do lan deploy', () => {
  const result = evaluateDeploySignals({
    entries: [
      ...healthyBase,
      { layer: 'observability', status: 'fail', reason: 'OBSERVABILITY_NO_SPANS_FOR_RELEASE' },
      { layer: 'channelListener', status: 'pass', reason: 'LISTENER_CONNECTED' },
    ],
  });

  assert.strictEqual(result.hardFailure, false);
  assert.strictEqual(result.classification, 'APPLICATION_ROLLED_OUT_HEALTHY');
  assert.deepStrictEqual(result.softFailures, ['observability']);
});

test('quan sat — kenh doc DA DUT hien ra, khong bi cau tong ket noi de len', () => {
  const result = evaluateDeploySignals({
    entries: [
      ...healthyBase,
      { layer: 'observability', status: 'pass', reason: 'OBSERVABILITY_STORE_ANSWERS' },
      { layer: 'channelListener', status: 'fail', reason: 'LISTENER_DISCONNECTED' },
    ],
  });

  assert.deepStrictEqual(result.softFailures, ['channelListener']);
  const summary = formatDeploySummary(result);
  assert.ok(summary.includes('CHANNEL LISTENER'), 'bang phai co hang cua kenh doc');
  assert.ok(summary.includes('LISTENER_DISCONNECTED'), 'ma ly do phai doc duoc tren bao cao');
  assert.ok(!summary.includes('Bon tin hieu deu dat'), 'khong duoc tuyen bo moi thu deu dat');
});

test('quan sat — `connected_but_idle` LA MOT KET QUA DAT, im lang khong phai that bai', () => {
  const result = evaluateDeploySignals({
    entries: [
      ...healthyBase,
      { layer: 'observability', status: 'pass', reason: 'OBSERVABILITY_STORE_ANSWERS' },
      { layer: 'channelListener', status: 'pass', reason: 'LISTENER_CONNECTED_BUT_IDLE' },
    ],
  });

  assert.deepStrictEqual(result.softFailures, []);
});

test('quan sat — cum quan sat TAT thi `skipped`, va do khong phai that bai', () => {
  const result = evaluateDeploySignals({
    entries: [
      ...healthyBase,
      { layer: 'observability', status: 'skipped', reason: 'OBSERVABILITY_DISABLED' },
      { layer: 'channelListener', status: 'skipped', reason: 'LISTENER_DISABLED' },
    ],
  });

  assert.deepStrictEqual(result.softFailures, []);
  assert.strictEqual(result.ok, true);
});

test('quan sat — KHONG BAO GI cung la that bai mem, khong duoc im lang bo qua', () => {
  const result = evaluateDeploySignals({ entries: healthyBase });

  // Ba tang cung + live AI van xanh, nen lan deploy VAN duoc chung minh...
  assert.strictEqual(result.hardFailure, false);
  assert.strictEqual(result.ok, true);
  // ...nhung hai tang quan sat khong bao gi phai hien ra.
  assert.deepStrictEqual(result.softFailures, ['observability', 'channelListener']);
});

test('quan sat — ket qua cho MAY doc mang theo danh sach that bai mem', () => {
  const machine = toMachineResult(
    evaluateDeploySignals({
      entries: [
        ...healthyBase,
        { layer: 'observability', status: 'fail', reason: 'OBSERVABILITY_QUERY_FAILED' },
        { layer: 'channelListener', status: 'pass', reason: 'LISTENER_CONNECTED' },
      ],
    }),
  );

  assert.strictEqual(machine.observability, 'fail');
  assert.strictEqual(machine.channelListener, 'pass');
  assert.strictEqual(machine.reasons.observability, 'OBSERVABILITY_QUERY_FAILED');
  assert.deepStrictEqual(machine.softFailures, ['observability']);
});

// --- `release.provider`: truong TUY CHON va CONG THEM (duong Northflank phat no, duong VM thi khong) ---

const allPass = [
  rolloutPass,
  healthPass,
  deterministicPass,
  { layer: 'liveAiSmoke', status: 'skipped', reason: 'PROFILE_HAS_NO_PARSER' },
  { layer: 'observability', status: 'skipped', reason: 'OFF' },
  { layer: 'channelListener', status: 'skipped', reason: 'OFF' },
];

test('release.provider: duoc giu khi meta mang no, va null khi duong VM cu khong phat no', () => {
  const withProvider = parseSignalJournal(
    [line(meta({ provider: 'northflank' })), ...allPass.map(line)].join('\n'),
  );
  const northflank = toMachineResult(evaluateDeploySignals({ entries: withProvider.entries }));
  assert.equal(northflank.release.provider, 'northflank');
  assert.equal(northflank.ok, true);

  const legacy = parseSignalJournal([line(meta()), ...allPass.map(line)].join('\n'));
  const machine = toMachineResult(evaluateDeploySignals({ entries: legacy.entries }));
  // Khoa `provider` ton tai nhung la `null`: hinh dang cu khong doi them gi ngoai mot truong rong.
  assert.equal(machine.release.provider, null);
  assert.equal(machine.release.gitSha, GIT_SHA);
  assert.equal(machine.ok, true);
});

test('release.provider: chuoi rong / khong phai chuoi bi coi la null; khong anh huong ket luan deploy', () => {
  for (const provider of ['', '   ', 5, null, {}]) {
    const parsed = parseSignalJournal([line(meta({ provider })), ...allPass.map(line)].join('\n'));
    const machine = toMachineResult(evaluateDeploySignals({ entries: parsed.entries }));
    assert.equal(machine.release.provider, null, JSON.stringify(provider));
    assert.equal(machine.ok, true);
  }
});
