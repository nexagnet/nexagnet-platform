import assert from 'node:assert/strict';
import { test } from 'node:test';

import { StageAborted } from './deploy-preview.mjs';
import {
  ANONYMOUS_PULL_VALUE,
  SHA,
  OTHER_SHA,
  DIGEST,
  IMAGE,
  TOKEN,
  PASSWORD,
  WEB_DNS,
  world,
  proof,
} from './preview-world.mjs';

// ---------------------------------------------------------------------------------------------
// DUONG VUI, TU CHOI SOM, NORTHFLANK HONG, EXACT-SHA, IMAGE KEO DUOC AN DANH
// ---------------------------------------------------------------------------------------------

test('duong vui: deploy qua ba tang cung, bang chung rang buoc DUNG SHA + muc tieu + Northflank', async () => {
  const w = world();
  const result = await w.run();

  assert.equal(result.aborted, null);
  assert.equal(result.passed, true);
  const { machine } = result;
  assert.equal(machine.schema, 'deploy-signals/v1');
  assert.deepEqual(
    [machine.rollout, machine.health, machine.deterministicSmoke],
    ['pass', 'pass', 'pass'],
  );
  assert.equal(machine.hardFailure, false);
  assert.equal(machine.release.gitSha, SHA);
  assert.equal(machine.release.tenant, 'transport-preview');
  assert.equal(machine.release.environment, 'gd1-test');
  assert.equal(machine.release.provider, 'northflank');
  assert.equal(machine.release.appDigest, IMAGE);
  // Tang khong ap dung la CAU TRA LOI THAT, khong phai `pending`.
  assert.deepEqual(
    [machine.liveAiSmoke, machine.observability, machine.channelListener],
    ['skipped', 'skipped', 'skipped'],
  );
  // Va chinh runtime proof cua Phase 3 chap nhan no.
  assert.deepEqual(proof(machine), { ok: true, reason: 'OK' });
});

test('deploy: web PATCH truoc, roi api; moi PATCH mang DUNG image digest; api mang manifest dung SHA', async () => {
  const w = world();
  await w.run();

  assert.deepEqual(
    w.log.patches.map((patch) => patch.serviceId),
    ['web', 'api'],
  );
  for (const { body } of w.log.patches) assert.equal(body.deployment.external.imagePath, IMAGE);

  const apiPatch = w.log.patches[1].body;
  assert.equal(apiPatch.runtimeEnvironment.CORS_ORIGIN, `https://${WEB_DNS}`);
  const manifest = JSON.parse(
    Buffer.from(apiPatch.runtimeFiles['/runtime/release.json'].data, 'base64').toString('utf8'),
  );
  assert.equal(manifest.gitSha, SHA);
  assert.equal(manifest.appDigest, IMAGE);
  assert.equal(manifest.workflowRunId, '999');

  // Khong mot PATCH nao xay ra truoc khi project + mat khau van hanh duoc xac minh.
  assert.ok(w.log.order.indexOf('getProject') < w.log.order.indexOf('patch:web'));
  assert.ok(w.log.order.indexOf('getSecretDetails') < w.log.order.indexOf('patch:web'));
});

test('smoke HAI PHA quanh mot lan restart (nhu VM): pre -> restart api+web -> post-restart voi baseline', async () => {
  const w = world();
  const result = await w.run();
  assert.equal(result.passed, true);
  assert.deepEqual(
    w.log.smokeCalls.map((call) => call.phase),
    ['pre', 'post-restart'],
  );
  // Baseline cua pha truoc di thang vao pha sau (so sanh ben vung/SHA chi xay ra khi co baseline).
  assert.equal(w.log.smokeCalls[0].baseline, undefined);
  assert.equal(w.log.smokeCalls[1].baseline, `{"releaseSha":"${SHA}"}`);
  assert.deepEqual(w.log.restarts, ['api', 'web']);
  const order = w.log.order;
  assert.ok(order.indexOf('smoke:pre') < order.indexOf('restart:api'));
  assert.ok(order.indexOf('restart:web') < order.indexOf('smoke:post-restart'));
});

test('smoke chay QUA URL cong khai cua web (qua edge), voi EXPECTED SHA va mat khau doc tu Northflank', async () => {
  const w = world();
  await w.run();
  assert.equal(w.log.smokeCalls.length, 2);
  for (const call of w.log.smokeCalls) {
    assert.equal(call.baseUrl, `https://${WEB_DNS}`);
    assert.equal(call.gitSha, SHA);
    assert.equal(call.password, PASSWORD);
  }
  // Health di QUA EDGE toi api: chung minh dinh tuyen web -> api.
  assert.ok(w.log.fetched.includes(`https://${WEB_DNS}/health`));
  assert.ok(w.log.fetched.includes(`https://${WEB_DNS}/__edge_health`));
  assert.ok(
    w.log.fetched
      .filter((url) => !url.startsWith('https://ghcr.io/'))
      .every((url) => url.startsWith(`https://${WEB_DNS}/`)),
    'khong goi api truc tiep',
  );
});

test('mat khau van hanh duoc che (mask) truoc khi dung, va KHONG bao gio vao nhat ky hay bao cao', async () => {
  const w = world();
  const result = await w.run();
  assert.deepEqual(w.log.masked, [PASSWORD]);
  for (const text of [result.journalText, JSON.stringify(result.machine), result.summary]) {
    assert.equal(text.includes(PASSWORD), false);
    assert.equal(text.includes(TOKEN), false);
    assert.equal(text.includes('x'.repeat(40)), false, 'SESSION_SECRET cung khong duoc lot ra');
  }
});

test('tang cung CHI bao pass hoac fail — khong bao gio timeout/unavailable (evaluator cu bo qua chung)', async () => {
  const scenarios = [
    {},
    { neverCompletes: true },
    { rolloutFails: true },
    { edge: 503 },
    { apiHealth: 502 },
    { page: 500 },
    { smoke: { exitCode: 1, stdout: '' } },
    { projectStatus: 401 },
    { noWebDns: true },
    { restartStatus: 500 },
    { restartStale: true },
    { healthFailsAfterRestart: true },
    { noBaseline: true },
    { oldContainerLingers: true },
  ];
  for (const options of scenarios) {
    const { machine } = await world(options).run();
    for (const layer of ['rollout', 'health', 'deterministicSmoke']) {
      assert.ok(
        ['pass', 'fail', 'pending'].includes(machine[layer]),
        `${JSON.stringify(options)} -> ${layer}=${machine[layer]}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------------------------
// TU CHOI TRUOC KHI CHAM VAO NORTHFLANK
// ---------------------------------------------------------------------------------------------

test('muc tieu / provider / SHA / image / ref / CI sai -> rollout fail voi MA CO KIEU, khong tao client, khong PATCH', async () => {
  const cases = [
    [{ NORTHFLANK_API_TOKEN: undefined }, 'NORTHFLANK_CREDENTIALS_MISSING'],
    [{ NORTHFLANK_API_TOKEN: '' }, 'NORTHFLANK_CREDENTIALS_MISSING'],
    [{ NORTHFLANK_API_TOKEN: '   ' }, 'NORTHFLANK_CREDENTIALS_MISSING'],
    [{ TENANT: 'ultty' }, 'TARGET_NOT_ALLOWED'],
    [{ TENANT: 'amico', ENVIRONMENT: 'production' }, 'TARGET_NOT_ALLOWED'],
    [{ ENVIRONMENT: 'production' }, 'TARGET_NOT_ALLOWED'],
    [{ ENVIRONMENT: 'dev' }, 'TARGET_NOT_ALLOWED'],
    [{ DEPLOYMENT_PROFILE: 'standard' }, 'TARGET_NOT_ALLOWED'],
    [{ PROVIDER: 'gcp-vm' }, 'PROVIDER_NOT_NORTHFLANK'],
    [{ PROVIDER: undefined }, 'PROVIDER_NOT_NORTHFLANK'],
    [{ GIT_SHA: 'abc123' }, 'GIT_SHA_INVALID'],
    [{ GIT_SHA: undefined }, 'GIT_SHA_INVALID'],
    [{ GIT_SHA: SHA.toUpperCase() }, 'GIT_SHA_INVALID'],
    [{ IMAGE_REF: 'ghcr.io/nexagnet/x:latest' }, 'IMAGE_REF_INVALID'],
    [{ IMAGE_REF: undefined }, 'IMAGE_REF_INVALID'],
    [{ GITHUB_REF: 'refs/heads/feature' }, 'REF_NOT_MAIN'],
    [{ GD1_TEST_CI_CONCLUSION: 'failure' }, 'CI_NOT_SUCCESS'],
    [{ GD1_TEST_CI_CONCLUSION: undefined }, 'CI_NOT_SUCCESS'],
    [{ NORTHFLANK_PROJECT_ID: '../x' }, 'NORTHFLANK_ID_INVALID'],
  ];
  for (const [override, code] of cases) {
    const w = world();
    const result = await w.run(override);
    const label = `${JSON.stringify(override)} -> ${code}`;
    assert.ok(result.aborted instanceof StageAborted, label);
    assert.equal(result.aborted.layer, 'rollout', label);
    assert.equal(result.machine.reasons.rollout, code, label);
    assert.equal(result.passed, false, label);
    assert.equal(w.log.clientsCreated, 0, `${label}: khong duoc tao client`);
    assert.equal(w.log.patches.length, 0, `${label}: khong duoc PATCH`);
    // Va runtime proof tu choi bang chung nay du no "khai" dung SHA.
    assert.equal(proof(result.machine).ok, false, label);
  }
});

test('thieu token: thong bao/nhat ky KHONG chua token, va khong co mang nao bi cham', async () => {
  const w = world();
  const result = await w.run({ NORTHFLANK_API_TOKEN: '' });
  assert.equal(result.machine.reasons.rollout, 'NORTHFLANK_CREDENTIALS_MISSING');
  assert.equal(w.log.fetched.length, 0);
  assert.equal(result.journalText.includes(TOKEN), false);
});

// ---------------------------------------------------------------------------------------------
// NORTHFLANK PHAN HOI HONG
// ---------------------------------------------------------------------------------------------

test('Northflank 401/403/404/5xx o buoc project -> ma rieng, khong PATCH', async () => {
  for (const [status, code] of [
    [401, 'NORTHFLANK_AUTH_FAILED'],
    [403, 'NORTHFLANK_AUTH_FAILED'],
    [404, 'NORTHFLANK_PROJECT_NOT_FOUND'],
    [500, 'NORTHFLANK_API_ERROR'],
  ]) {
    const w = world({ projectStatus: status });
    const result = await w.run();
    assert.equal(result.machine.reasons.rollout, code, String(status));
    assert.equal(w.log.patches.length, 0);
    assert.equal(result.passed, false);
  }
});

test('khong doc duoc mat khau van hanh (thieu / qua ngan / secret group 404 / 403) -> fail, chua PATCH', async () => {
  for (const options of [
    { secretVariables: {} },
    { secretVariables: { PILOT_OPERATOR_PASSWORD: 'short' } },
    { secretVariables: { PILOT_OPERATOR_PASSWORD: 12345678901234 } },
    { secretStatus: 404 },
    { secretStatus: 403 },
  ]) {
    const w = world(options);
    const result = await w.run();
    assert.equal(w.log.patches.length, 0, JSON.stringify(options));
    assert.match(
      result.machine.reasons.rollout,
      /^(OPERATOR_SECRET_MISSING|NORTHFLANK_AUTH_FAILED)$/,
      JSON.stringify(options),
    );
    assert.equal(result.passed, false);
    assert.deepEqual(w.log.masked, [], 'khong co gi de che neu khong doc duoc');
  }
});

test('PATCH bi tu choi (400 / 404) -> fail voi serviceId trong chi tiet; khong di tiep', async () => {
  const bad = world({ patchStatus: { web: 400 } });
  const r1 = await bad.run();
  assert.equal(r1.machine.reasons.rollout, 'NORTHFLANK_API_ERROR');
  assert.equal(r1.machine.details.rollout.serviceId, 'web');
  assert.equal(bad.log.patches.length, 0);

  const missing = world({ patchStatus: { api: 404 } });
  const r2 = await missing.run();
  assert.equal(r2.machine.reasons.rollout, 'NORTHFLANK_SERVICE_NOT_FOUND');
  assert.equal(r2.machine.details.rollout.serviceId, 'api');
});

// ---------------------------------------------------------------------------------------------
// EXACT-SHA: NORTHFLANK PHAI CHAY DUNG IMAGE
// ---------------------------------------------------------------------------------------------

test('Northflank bao COMPLETED nhung chay image KHAC digest -> ROLLOUT_TIMEOUT (SHA/digest lech fail closed)', async () => {
  const wrong = `nexagnet/nexagnet-platform/preview@sha256:${'d'.repeat(64)}`;
  const w = world({ deployedImage: wrong });
  const result = await w.run();
  assert.equal(result.machine.reasons.rollout, 'ROLLOUT_TIMEOUT');
  assert.equal(result.machine.details.rollout.imageMatches, false);
  assert.equal(result.passed, false);
  assert.equal(w.log.smokeCalls.length, 0, 'khong smoke mot ban chua chung minh dung image');
  assert.equal(proof(result.machine).ok, false);
});

test('rollout: FAILED / khong bao gio COMPLETED / chi co container CU -> that bai, khong smoke', async () => {
  for (const [options, code] of [
    [{ rolloutFails: true }, 'ROLLOUT_FAILED'],
    [{ neverCompletes: true }, 'ROLLOUT_TIMEOUT'],
    [{ staleContainers: true }, 'ROLLOUT_TIMEOUT'],
  ]) {
    const w = world(options);
    const result = await w.run();
    assert.equal(result.machine.reasons.rollout, code, JSON.stringify(options));
    assert.equal(result.passed, false);
    assert.equal(w.log.smokeCalls.length, 0);
  }
});

test('web chua co URL cong khai -> WEB_PUBLIC_URL_UNKNOWN, khong PATCH api', async () => {
  const w = world({ noWebDns: true });
  const result = await w.run();
  assert.equal(result.machine.reasons.rollout, 'WEB_PUBLIC_URL_UNKNOWN');
  assert.deepEqual(
    w.log.patches.map((patch) => patch.serviceId),
    ['web'],
  );
});

test('bang chung nhat ky KHAI dung SHA nhung tang cung hong -> runtime proof van tu choi', async () => {
  const result = await world({ neverCompletes: true }).run();
  assert.equal(result.machine.release.gitSha, SHA, 'meta van khai SHA duoc yeu cau');
  assert.deepEqual(proof(result.machine), {
    ok: false,
    reason: 'SIGNALS_NOT_PASSING',
    layers: ['rollout', 'health', 'deterministicSmoke'],
  });
  // Va mot SHA khac voi SHA da chung minh cung bi tu choi o ngay cua no.
  const happy = await world().run();
  assert.equal(proof(happy.machine, OTHER_SHA).reason, 'SIGNALS_SHA_MISMATCH');
});

// ---------------------------------------------------------------------------------------------
// IMAGE PHAI KEO DUOC AN DANH (Northflank khong co registry credentials)
// ---------------------------------------------------------------------------------------------

test('image GHCR keo duoc an danh: kiem tra dung repo + DIGEST, bang token an danh, TRUOC moi PATCH', async () => {
  const w = world();
  await w.run();
  const [token, manifest] = w.log.ghcr;
  assert.equal(token.pathname, '/token');
  assert.equal(
    manifest.pathname,
    `/v2/nexagnet/nexagnet-platform/preview/manifests/sha256:${DIGEST}`,
  );
  assert.equal(manifest.method, 'HEAD');
  assert.equal(manifest.auth, `Bearer ${ANONYMOUS_PULL_VALUE}`);
  assert.ok(
    w.log.fetched.indexOf('https://ghcr.io/token') <
      w.log.fetched.indexOf(`https://${WEB_DNS}/__edge_health`),
  );
});

test('goi GHCR con private (manifest 401/403/404, hoac khong cap token an danh) -> IMAGE_NOT_PUBLIC, KHONG PATCH', async () => {
  for (const options of [
    { ghcr: 401 },
    { ghcr: 403 },
    { ghcr: 404 },
    { ghcrToken: false },
    { ghcrToken: false, ghcrTokenStatus: 403 },
  ]) {
    const w = world(options);
    const result = await w.run();
    assert.equal(result.machine.reasons.rollout, 'IMAGE_NOT_PUBLIC', JSON.stringify(options));
    assert.equal(w.log.patches.length, 0, 'khong dong vao service nao khi image khong keo duoc');
    assert.equal(result.passed, false);
    assert.equal(proof(result.machine).ok, false);
  }
});

test('GHCR khong toi duoc (loi mang) -> IMAGE_REGISTRY_UNREACHABLE, khong PATCH', async () => {
  const w = world({ ghcrThrows: true });
  const result = await w.run();
  assert.equal(result.machine.reasons.rollout, 'IMAGE_REGISTRY_UNREACHABLE');
  assert.equal(w.log.patches.length, 0);
});

// ---------------------------------------------------------------------------------------------
