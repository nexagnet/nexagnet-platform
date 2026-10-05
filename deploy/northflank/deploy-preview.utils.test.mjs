import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  createJournal,
  defaultMask,
  runSmokeProcess,
  sameImage,
  toEpochSeconds,
} from './deploy-preview.mjs';
import { SHA, DIGEST, IMAGE, TOKEN, PASSWORD, world, proof } from './preview-world.mjs';

// ---------------------------------------------------------------------------------------------
// TIEN ICH + PREFLIGHT
// ---------------------------------------------------------------------------------------------

test('sameImage: bo qua ten mien/hoa thuong/khoang trang; digest khac hoac rong thi KHONG khop', () => {
  const path = `nexagnet/nexagnet-platform/preview@sha256:${DIGEST}`;
  assert.equal(sameImage(IMAGE, path), true);
  assert.equal(sameImage(IMAGE, IMAGE), true);
  assert.equal(sameImage(IMAGE, `https://${IMAGE}`), true);
  assert.equal(sameImage(IMAGE, ` ${IMAGE.toUpperCase()} `), true);
  assert.equal(
    sameImage(IMAGE, `nexagnet/nexagnet-platform/preview@sha256:${'d'.repeat(64)}`),
    false,
  );
  assert.equal(sameImage(IMAGE, 'nexagnet/nexagnet-platform/preview:latest'), false);
  assert.equal(sameImage(IMAGE, undefined), false);
  assert.equal(sameImage('', ''), false, 'rong != rong');
});

test('toEpochSeconds: giay, mili-giay, ISO; rac -> NaN (khong bao gio "moi")', () => {
  assert.equal(toEpochSeconds(1_611_241_087), 1_611_241_087);
  assert.equal(toEpochSeconds(1_611_241_087_000), 1_611_241_087);
  assert.equal(
    toEpochSeconds('2026-10-05T00:00:00.000Z'),
    Math.floor(Date.parse('2026-10-05T00:00:00Z') / 1000),
  );
  for (const bad of [undefined, null, 'khong phai ngay', {}, Number.NaN]) {
    assert.ok(Number.isNaN(toEpochSeconds(bad)), String(bad));
  }
});

test('nhat ky: moi dong la `##DEPLOY-SIGNAL## <json>`, vao ca bo nho lan tep, bat dau tu tep rong', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nf-journal-'));
  try {
    const logPath = join(dir, 'signals.log');
    const out = [];
    const journal = createJournal({ logPath, write: (text) => out.push(text) });
    journal.emit({ layer: 'meta', gitSha: SHA });
    journal.raw('##DEPLOY-SIGNAL## {"layer":"rollout","status":"pass"}');
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
    for (const line of lines) assert.match(line, /^##DEPLOY-SIGNAL## \{.*\}$/);
    assert.equal(journal.text().trim().split('\n').length, 2);
    assert.equal(out.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('tien trinh smoke KHONG ke thua env cua job: token Northflank khong bao gio toi no', async () => {
  const root = mkdtempSync(join(tmpdir(), 'nf-smoke-'));
  const previous = {
    NORTHFLANK_API_TOKEN: process.env.NORTHFLANK_API_TOKEN,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    AUTOPILOT_APP_PRIVATE_KEY: process.env.AUTOPILOT_APP_PRIVATE_KEY,
  };
  try {
    mkdirSync(join(root, 'deploy/netviet'), { recursive: true });
    // Smoke gia: in lai TOAN BO env no nhin thay.
    writeFileSync(
      join(root, 'deploy/netviet/deterministic-smoke.mjs'),
      'process.stdout.write("ENV=" + JSON.stringify(process.env));\n',
    );
    process.env.NORTHFLANK_API_TOKEN = TOKEN;
    process.env.GITHUB_TOKEN = 'ghs_should_not_leak_0123456789';
    process.env.AUTOPILOT_APP_PRIVATE_KEY = 'pem-should-not-leak';

    const { exitCode, stdout } = await runSmokeProcess({
      baseUrl: 'https://web.example.test',
      password: PASSWORD,
      gitSha: SHA,
      repositoryRoot: root,
    });
    assert.equal(exitCode, 0);
    const seen = JSON.parse(stdout.replace(/^ENV=/, ''));
    assert.equal(seen.PILOT_BASE_URL, 'https://web.example.test');
    assert.equal(seen.PILOT_AUTH_MODE, 'session');
    assert.equal(seen.PILOT_OPERATOR_PASSWORD, PASSWORD);
    assert.equal(seen.EXPECTED_RELEASE_SHA, SHA);
    assert.equal(seen.DETERMINISTIC_PHASE, 'pre');
    assert.ok(seen.TENANT_DIR.endsWith('/tenants/transport-preview'));
    for (const leaked of ['NORTHFLANK_API_TOKEN', 'GITHUB_TOKEN', 'AUTOPILOT_APP_PRIVATE_KEY']) {
      assert.equal(leaked in seen, false, `${leaked} lot vao tien trinh smoke`);
    }
    assert.equal(JSON.stringify(seen).includes(TOKEN), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test('tien trinh smoke nhan DETERMINISTIC_PHASE + DETERMINISTIC_BASELINE khi co (pha post-restart), va khong thi khong dat baseline', async () => {
  const root = mkdtempSync(join(tmpdir(), 'nf-smoke-phase-'));
  try {
    mkdirSync(join(root, 'deploy/netviet'), { recursive: true });
    writeFileSync(
      join(root, 'deploy/netviet/deterministic-smoke.mjs'),
      'process.stdout.write("ENV=" + JSON.stringify(process.env));\n',
    );
    const run = async (extra) => {
      const { stdout } = await runSmokeProcess({
        baseUrl: 'https://web.example.test',
        password: PASSWORD,
        gitSha: SHA,
        repositoryRoot: root,
        ...extra,
      });
      return JSON.parse(stdout.replace(/^ENV=/, ''));
    };
    const pre = await run({});
    assert.equal(pre.DETERMINISTIC_PHASE, 'pre');
    assert.equal('DETERMINISTIC_BASELINE' in pre, false);

    const baseline = JSON.stringify({ knowledgeProducts: 3, releaseSha: SHA });
    const post = await run({ phase: 'post-restart', baseline });
    assert.equal(post.DETERMINISTIC_PHASE, 'post-restart');
    assert.equal(post.DETERMINISTIC_BASELINE, baseline);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('mask mac dinh chi in lenh ::add-mask:: khi dang chay trong GitHub Actions (khong lo mat khau o may dev)', () => {
  const written = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => {
    written.push(String(chunk));
    return true;
  };
  try {
    defaultMask({})('khong-duoc-in-ra-o-may-dev');
    defaultMask({ GITHUB_ACTIONS: 'false' })('khong-duoc-in-ra-o-may-dev');
    defaultMask({ GITHUB_ACTIONS: 'true' })('dong-mot\ndong-hai');
  } finally {
    process.stdout.write = original;
  }
  assert.deepEqual(written, ['::add-mask::dong-mot\n', '::add-mask::dong-hai\n']);
});

// ---------------------------------------------------------------------------------------------
// PREFLIGHT: chay TRUOC khi build image (build ~10 phut), khong cham vao service nao
// ---------------------------------------------------------------------------------------------

test('preflight thanh cong: khong can image, khong PATCH, KHONG phat tin hieu pass nao', async () => {
  const w = world();
  const result = await w.preflight({ IMAGE_REF: undefined });
  assert.equal(result.aborted, null);
  assert.equal(result.ready, true);
  assert.equal(w.log.patches.length, 0);
  assert.deepEqual(w.log.masked, [PASSWORD], 'mat khau van hanh duoc che ngay tu preflight');
  // Chi co dong meta. Mot preflight xanh khong chung minh gi ve ban phat hanh, nen khong tang nao
  // duoc ghi pass — neu khong runtime proof co the doc nham no thanh bang chung.
  const layers = result.journalText
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line.replace('##DEPLOY-SIGNAL## ', '')).layer);
  assert.deepEqual(layers, ['meta']);
  assert.equal(result.machine.rollout, 'pending');
  assert.equal(proof(result.machine).ok, false);
});

test('preflight: token / muc tieu / provider / SHA / ref / CI sai -> rollout fail co ma kieu, khong tao client', async () => {
  const cases = [
    [{ NORTHFLANK_API_TOKEN: '' }, 'NORTHFLANK_CREDENTIALS_MISSING'],
    [{ TENANT: 'ultty' }, 'TARGET_NOT_ALLOWED'],
    [{ ENVIRONMENT: 'production' }, 'TARGET_NOT_ALLOWED'],
    [{ PROVIDER: 'gcp-vm' }, 'PROVIDER_NOT_NORTHFLANK'],
    [{ GIT_SHA: 'abc' }, 'GIT_SHA_INVALID'],
    [{ GITHUB_REF: 'refs/heads/x' }, 'REF_NOT_MAIN'],
    [{ GD1_TEST_CI_CONCLUSION: 'failure' }, 'CI_NOT_SUCCESS'],
  ];
  for (const [override, code] of cases) {
    const w = world();
    const result = await w.preflight({ IMAGE_REF: undefined, ...override });
    assert.equal(result.aborted?.reason, code, JSON.stringify(override));
    assert.equal(result.machine.reasons.rollout, code);
    assert.equal(result.passed, false);
    assert.equal(w.log.clientsCreated, 0);
  }
});

test('preflight: token het han / sai project / thieu mat khau van hanh -> ma rieng, truoc khi ton thoi gian build', async () => {
  for (const [options, code] of [
    [{ projectStatus: 401 }, 'NORTHFLANK_AUTH_FAILED'],
    [{ projectStatus: 404 }, 'NORTHFLANK_PROJECT_NOT_FOUND'],
    [{ secretVariables: {} }, 'OPERATOR_SECRET_MISSING'],
    [{ secretStatus: 404 }, 'OPERATOR_SECRET_MISSING'],
  ]) {
    const w = world(options);
    const result = await w.preflight({ IMAGE_REF: undefined });
    assert.equal(result.machine.reasons.rollout, code, JSON.stringify(options));
    assert.equal(w.log.patches.length, 0);
  }
});

test('preflight KHONG noi long yeu cau image cua deploy that: deploy that van tu choi image khong bam digest', async () => {
  const result = await world().run({ IMAGE_REF: undefined });
  assert.equal(result.machine.reasons.rollout, 'IMAGE_REF_INVALID');
});
