import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { evaluateDeploySignals as evaluateRuntimeProof } from '../../tools/autopilot/runtime-proof-core.mjs';

const CLI = fileURLToPath(new URL('./run-deploy-preview.mjs', import.meta.url));
const SHA = 'a'.repeat(40);
const IMAGE = `ghcr.io/nexagnet/nexagnet-platform/preview@sha256:${'b'.repeat(64)}`;
// Dung luc chay: khong co chuoi literal nao trong repo giong mot credential.
const TOKEN = `nf-${randomBytes(18).toString('hex')}`;

/**
 * Chay CLI THAT trong tien trinh con, voi env tuong minh (khong ke thua env cua job test). Moi ca o
 * day la mot TU CHOI nen khong ca nao cham toi mang: khong co token, hoac yeu cau sai truoc khi tao
 * client.
 */
function run(args, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'nf-cli-'));
  const logPath = join(dir, 'signals.log');
  const jsonPath = join(dir, 'signals.json');
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      PATH: process.env.PATH,
      PROVIDER: 'northflank',
      TENANT: 'transport-preview',
      ENVIRONMENT: 'gd1-test',
      DEPLOYMENT_PROFILE: 'transport-preview-gd1-test',
      STACK_SLUG: 'transport-preview-gd1-test',
      GIT_SHA: SHA,
      IMAGE_REF: IMAGE,
      NORTHFLANK_PROJECT_ID: 'nexagnet-dev',
      NORTHFLANK_API_SERVICE_ID: 'api',
      NORTHFLANK_WEB_SERVICE_ID: 'web',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_RUN_ID: '4242',
      GD1_TEST_CI_CONCLUSION: 'success',
      DEPLOY_SIGNAL_LOG: logPath,
      DEPLOY_SIGNAL_JSON: jsonPath,
      ...overrides,
    },
  });
  const json = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, 'utf8')) : null;
  const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
  rmSync(dir, { recursive: true, force: true });
  return { ...result, json, log };
}

const proof = (machine) =>
  evaluateRuntimeProof({ signals: machine, mergeSha: SHA, target: 'transport-preview/gd1-test' });

test('CLI: thieu token (deploy that) -> thoat 1, bao cao ghi ly do co kieu, runtime proof tu choi', () => {
  const result = run([], { NORTHFLANK_API_TOKEN: '' });
  assert.equal(result.status, 1);
  assert.equal(result.json.schema, 'deploy-signals/v1');
  assert.equal(result.json.rollout, 'fail');
  assert.equal(result.json.reasons.rollout, 'NORTHFLANK_CREDENTIALS_MISSING');
  assert.equal(result.json.hardFailure, true);
  assert.equal(result.json.release.gitSha, SHA);
  assert.equal(result.json.release.provider, 'northflank');
  assert.equal(proof(result.json).ok, false);
});

test('CLI: --preflight thieu token -> thoat 1 va cung ghi bao cao (de report noi duoc ly do ngay)', () => {
  const result = run(['--preflight'], { NORTHFLANK_API_TOKEN: undefined, IMAGE_REF: undefined });
  assert.equal(result.status, 1);
  assert.equal(result.json.reasons.rollout, 'NORTHFLANK_CREDENTIALS_MISSING');
  assert.match(result.stderr, /NORTHFLANK_CREDENTIALS_MISSING/);
});

test('CLI: muc tieu khong duoc phep (khach that, production) -> thoat 1, khong cham mang', () => {
  for (const override of [
    { TENANT: 'ultty' },
    { ENVIRONMENT: 'production' },
    { TENANT: 'amico', ENVIRONMENT: 'production' },
    { PROVIDER: 'gcp-vm' },
    { GITHUB_REF: 'refs/heads/feature' },
    { GD1_TEST_CI_CONCLUSION: '' },
    { GIT_SHA: 'main' },
    { IMAGE_REF: 'ghcr.io/nexagnet/nexagnet-platform/preview:latest' },
  ]) {
    const result = run([], { NORTHFLANK_API_TOKEN: TOKEN, ...override });
    assert.equal(result.status, 1, JSON.stringify(override));
    assert.equal(result.json.rollout, 'fail', JSON.stringify(override));
    assert.equal(result.json.deterministicSmoke, 'pending');
    assert.equal(proof(result.json).ok, false);
  }
});

test('CLI: khong bao gio in token — du token co mat va yeu cau bi tu choi', () => {
  const result = run([], { NORTHFLANK_API_TOKEN: TOKEN, TENANT: 'ultty' });
  for (const text of [result.stdout, result.stderr, result.log, JSON.stringify(result.json)]) {
    assert.equal(text.includes(TOKEN), false);
  }
});

test('CLI: nhat ky bat dau tu tep RONG — dong cua lan chay truoc khong o lai', () => {
  const result = run([], { NORTHFLANK_API_TOKEN: '' });
  const lines = result.log.trim().split('\n');
  assert.equal(lines.length, 2, 'meta + rollout fail, khong hon');
  for (const line of lines) assert.match(line, /^##DEPLOY-SIGNAL## \{/);
});

test('CLI: ma thoat 0 chi co o hai duong: preflight du dieu kien, hoac evaluator xac nhan pass', () => {
  const source = readFileSync(CLI, 'utf8');
  // Moi `process.exit(0)` phai nam ngay sau nhanh preflight thanh cong; duong con lai thoat 1 khi
  // `!final.passed`.
  assert.equal((source.match(/process\.exit\(0\)/g) ?? []).length, 1);
  assert.match(source, /if \(preflightOnly && exitCode === 0\) \{[\s\S]*?process\.exit\(0\);/);
  assert.match(source, /if \(!final\.passed\) \{[\s\S]*?process\.exit\(1\);/);
});
