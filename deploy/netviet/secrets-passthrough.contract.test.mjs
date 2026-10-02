import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * HOP DONG: moi bien `render-secrets.sh` ghi vao `secrets.env` phai duoc `compose.yaml` DUNG.
 *
 * VI SAO CAN: `compose.yaml` liet ke bien moi truong TUONG MINH cho tung service. Mot bien co
 * trong `secrets.env` ma khong duoc nhac trong compose thi khong bao gio toi container — va no
 * hong IM LANG: khong loi, khong canh bao, chi la mot tinh nang khong chay.
 *
 * Da xay ra that: `ADVICE_COMPOSER` duoc render tu 21/08 nhung khong co trong block `environment`
 * cua service `api`, nen agent tu van van la `Noop` sau khi deploy thanh cong. Truoc do chinh bien
 * nay bi bo sot o mot tang khac (render-secrets.sh khong he phat no) suot tu 19/08 — cung mot hinh
 * dang loi, hai tang khac nhau.
 */

const here = dirname(fileURLToPath(import.meta.url));
const renderSecrets = readFileSync(join(here, 'render-secrets.sh'), 'utf8');
const baseCompose = readFileSync(join(here, 'compose.yaml'), 'utf8');
// LOP PHU FLOWISE LA MOT PHAN CUA BAN DUNG, KHONG PHAI MOT TEP PHU.
//
// `deploy-stack.sh` chay `-f compose.yaml -f compose.flowise.yaml` khi ho so bat Flowise, nen mot
// bien chi duoc nhac trong lop phu VAN toi duoc container. Doc mot minh tep goc se bao bay bien
// FLOWISE_* la "mo coi" trong khi chung dang chay tot — mot bao dong gia, va cach "sua" no bang
// cach go bien ra khoi render se lam hong Ultty.
const flowiseCompose = readFileSync(join(here, 'compose.flowise.yaml'), 'utf8');
const compose = `${baseCompose}\n${flowiseCompose}`;

/**
 * Bien duoc render nhung KHONG danh cho compose. Moi dong phai kem ly do — danh sach nay la cho
 * duy nhat mot bien duoc phep "render ra roi khong ai dung", nen no phai kho them vao.
 */
const NOT_FOR_COMPOSE = new Map([
  ['GCP_PROJECT_ID', 'script deploy tren VM doc, khong phai container'],
  ['DEMO_DOMAIN', 'render-secrets.sh dung de sinh manh cau hinh Caddy'],
  ['FLOWISE_DOMAIN', 'nhu tren'],
  [
    'FLOWISE_ENABLED',
    'cong tac cua TANG VM (deploy-stack/backup/health-check doc qua stack-compose.sh): no quyet ' +
      'dinh co keo compose.flowise.yaml vao hay khong, nen theo dinh nghia no khong the la mot bien ' +
      'ma compose tieu thu — va khong container nao can biet',
  ],
  ['PILOT_OPERATOR_USERNAME', 'bootstrap-auth-user.mjs doc tu secrets.env'],
  ['PILOT_OPERATOR_NAME', 'nhu tren'],
  ['PILOT_OPERATOR_PASSWORD', 'nhu tren'],
]);

/** Ten bien trong khoi heredoc ghi ra `secrets.env`. */
function renderedKeys(script) {
  const start = script.indexOf('cat >"${RUNTIME_DIR}/secrets.env"');
  assert.notEqual(start, -1, 'khong tim thay khoi ghi secrets.env trong render-secrets.sh');
  const body = script.slice(start);
  const end = body.indexOf('\nEOF');
  assert.notEqual(end, -1, 'khoi heredoc secrets.env khong duoc dong bang EOF');
  return body
    .slice(0, end)
    .split('\n')
    .flatMap((line) => {
      const match = /^([A-Z][A-Z0-9_]*)=/.exec(line.trim());
      return match ? [match[1]] : [];
    });
}

/** Bien duoc compose tham chieu, ke ca dang `${X:-mac dinh}`. */
function composeReferences(yaml) {
  return new Set([...yaml.matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)].map((match) => match[1]));
}

test('moi bien render vao secrets.env deu duoc compose dung', () => {
  const referenced = composeReferences(compose);
  const orphans = renderedKeys(renderSecrets).filter(
    (key) => !referenced.has(key) && !NOT_FOR_COMPOSE.has(key),
  );

  assert.deepEqual(
    orphans,
    [],
    `Bien duoc render nhung compose khong dung -> khong bao gio toi container: ${orphans.join(', ')}. ` +
      'Them vao block `environment` cua service can no, hoac khai trong NOT_FOR_COMPOSE kem ly do.',
  );
});

test('agent tu van nhan du bien de chay tren container', () => {
  // Ba bien nay la dieu kien du de `AdvisorAgent` khong roi ve Noop. Neo rieng vi day dung la bo
  // bi bo sot 21/08, va mot phep kiem chung chung se khong noi duoc TEN cai dang thieu.
  const apiService = compose.slice(compose.indexOf('\n  api:'));
  for (const key of ['ADVICE_COMPOSER', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY']) {
    assert.match(
      apiService,
      new RegExp(`^\\s+${key}:`, 'm'),
      `service api thieu bien ${key} — agent tu van se im lang roi ve Noop sau khi deploy`,
    );
  }
});

/**
 * `#395`: nguoi van hanh luc trien khai (`PILOT_OPERATOR_USERNAME`) phai duoc API biet la TAI KHOAN
 * HE THONG (`PROTECTED_ACCOUNT_USERNAMES`). Neu man hinh quan tri khoa / ha vai / dat lai mat khau
 * duoc tai khoan nay, lan deploy sau chet o buoc bootstrap (`bootstrap-auth-user.mjs` doi no la ADMIN
 * dang hoat dong) va moi smoke dang nhap bang no deu do.
 */
test('service api biet nguoi van hanh luc trien khai la tai khoan he thong', () => {
  const start = baseCompose.indexOf('\n  api:');
  const apiService = baseCompose.slice(start, baseCompose.indexOf('\n  web:', start));
  assert.match(
    apiService,
    /^\s+PROTECTED_ACCOUNT_USERNAMES: \$\{PILOT_OPERATOR_USERNAME:-\}\s*$/m,
    'service api thieu PROTECTED_ACCOUNT_USERNAMES tu PILOT_OPERATOR_USERNAME — man hinh quan tri ' +
      'se khoa duoc nguoi van hanh va lan deploy sau chet o buoc bootstrap',
  );
  assert.match(renderSecrets, /^PILOT_OPERATOR_USERNAME=/m);
});
