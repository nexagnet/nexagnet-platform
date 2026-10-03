import { ok, strictEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * KHO ANH PHAI CO NHIEU HON MOT LUA CHON — HOP DONG.
 *
 * ============================================================================================
 * VI SAO BAI NAY TON TAI.
 *
 * `packages/shared/src/env.ts` nhan bon kho tu lau (`none|local|gcs|s3`) va `apps/api/src/media/`
 * co du bon hien thuc. Nhin vao code ung dung thi ket luan la "kho anh khong phu thuoc GCS".
 *
 * Ket luan do da SAI suot mot thoi gian, va no sai o mot tang khac: khoi `environment` cua
 * `compose.yaml` liet ke TUONG MINH tung bien, nen mot bien co trong `secrets.env` ma khong co o
 * do thi KHONG BAO GIO toi container. `MEDIA_ENDPOINT`, `MEDIA_ACCESS_KEY_ID`,
 * `MEDIA_SECRET_ACCESS_KEY` deu thieu — nen dat `MEDIA_STORE=s3` se fail-fast luc boot voi
 * "thieu MEDIA_ENDPOINT" DU DA CAU HINH DUNG. Tuc GCS khong phai lua chon tot nhat; no la lua
 * chon duy nhat voi tay len duoc.
 *
 * Do la dung cai bay da lam `ADVICE_COMPOSER` rong tren stack suot 19/08-21/08/2026, lap lai o
 * mot mien khac. Bai nay do CA HAI DAU cua duong day cung luc, vi mot dau dung khong cuu duoc
 * dau kia.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPOSE = readFileSync(resolve(HERE, 'compose.yaml'), 'utf8');
const RENDER = readFileSync(resolve(HERE, 'render-secrets.sh'), 'utf8');
const ENV_SCHEMA = readFileSync(resolve(HERE, '../../packages/shared/src/env.ts'), 'utf8');

/** Bien ma `loadEnv()` doi cho tung kho. Nguon: cac khoi fail-fast trong env.ts. */
const REQUIRED_BY_STORE = {
  gcs: ['MEDIA_STORE', 'MEDIA_BUCKET'],
  s3: ['MEDIA_STORE', 'MEDIA_BUCKET', 'MEDIA_ENDPOINT', 'MEDIA_ACCESS_KEY_ID', 'MEDIA_SECRET_ACCESS_KEY'],
  local: ['MEDIA_STORE', 'MEDIA_LOCAL_DIR'],
};

/** Khoi `environment:` cua service `api` — noi duy nhat quyet dinh bien nao toi container. */
function apiEnvironmentBlock() {
  const at = COMPOSE.indexOf('\n  api:');
  ok(at > 0, 'khong tim thay service api trong compose.yaml');
  const next = COMPOSE.indexOf('\n  web:', at);
  return COMPOSE.slice(at, next > 0 ? next : COMPOSE.length);
}

describe('kho anh: bon lua chon deu phai voi toi duoc', () => {
  const apiBlock = apiEnvironmentBlock();

  it('env.ts van nhan du bon kho', () => {
    ok(ENV_SCHEMA.includes("z.enum(['none', 'local', 'gcs', 's3'])"), 'schema kho anh da doi');
  });

  for (const [store, vars] of Object.entries(REQUIRED_BY_STORE)) {
    it(`compose truyen du bien cho MEDIA_STORE=${store}`, () => {
      const missing = vars.filter((v) => !apiBlock.includes(`${v}:`));
      strictEqual(
        missing.join(', '), '',
        `service api khong truyen ${missing.join(', ')} — MEDIA_STORE=${store} se fail-fast luc boot du cau hinh dung`,
      );
    });

    it(`render-secrets sinh du bien cho MEDIA_STORE=${store}`, () => {
      const missing = vars.filter((v) => !RENDER.includes(`${v}=`));
      strictEqual(missing.join(', '), '', `render-secrets.sh khong sinh ${missing.join(', ')}`);
    });
  }

  it('GCS khong con la kien truc mac dinh: khong bucket van render duoc', () => {
    // `BACKUP_BUCKET` tung la BAT BUOC duoi `set -u`, nen mot may chu cua khach — noi khong co
    // bucket GCS nao — chet ngay tai buoc render, truoc khi kip hoi "co nen dung GCS khong".
    ok(RENDER.includes('BACKUP_BUCKET="${BACKUP_BUCKET:-}"'),
      'BACKUP_BUCKET phai co mac dinh rong, neu khong host khach khong render noi');
  });

  it('co kho anh tren dia that su chay duoc: volume duoc khai va duoc mount', () => {
    ok(/^ {2}media-data:/m.test(COMPOSE), 'thieu volume media-data');
    ok(apiBlock.includes('media-data:/srv/media'), 'api khong mount media-data');
  });

  it('anh khach KHONG duoc nam trong cay thu muc bi rsync len host', () => {
    // Mot bind mount `./media` se dat anh co PII canh `secrets.env`, va `deploy-remote.sh` dong
    // bo ca cay do. Volume co ten khong nam trong cay day.
    ok(!apiBlock.includes('./media:'), 'anh khach dang bind-mount tu cay thu muc cua stack');
  });
});
