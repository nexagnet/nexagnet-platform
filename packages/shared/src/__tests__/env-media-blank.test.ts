import { describe, expect, it } from 'vitest';
import { loadEnv } from '../env.js';

/**
 * BIEN RONG PHAI DUOC HIEU LA "KHONG DAT" — o dung nhung truong ma rong khong mang nghia.
 *
 * ==========================================================================================
 * VI SAO BAI NAY TON TAI.
 *
 * `compose.yaml` truyen bien tuy chon dang `${VAR:-}`. Docker Compose KHONG bo qua bien khi gia
 * tri rong — no dat bien do bang CHUOI RONG. Nen `z.string().min(1).optional()` van nhan `''`,
 * van validate, va van do. Ket qua: mot stack KHONG dung S3 khong boot noi vi thieu
 * `MEDIA_ENDPOINT` — mot bien no khong he can.
 *
 * Cai bay nay nam san trong repo tu lau ma chua no, chi vi `BACKUP_BUCKET` con la BAT BUOC nen
 * `MEDIA_BUCKET` chua bao gio rong. #224 bo rang buoc do (may chu cua khach khong co bucket GCS
 * nao), va no NO NGAY trong lan dung stack dau tien tren mot Ubuntu sach.
 *
 * Bai nay do dung hinh dang ma Compose sinh ra, khong phai hinh dang ma nguoi ta mong doi.
 */

/** Bo bien toi thieu de `loadEnv` di qua duoc cac cong khong lien quan toi kho anh. */
const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/zalo',
  SESSION_SECRET: 'x'.repeat(32),
  API_KEY: 'y'.repeat(32),
} as const;

const NO_EXTERNAL_REQUIREMENTS = { parser: false, channel: false } as const;

describe('kho anh: bien rong tu docker compose', () => {
  it('MEDIA_STORE=local van boot duoc khi bon bien cua S3 la chuoi rong', () => {
    // Day CHINH XAC la thu `compose.yaml` gui xuong khi ho so khong dung S3.
    const env = loadEnv(
      {
        ...BASE,
        MEDIA_STORE: 'local',
        MEDIA_LOCAL_DIR: '/srv/media',
        MEDIA_BUCKET: '',
        MEDIA_ENDPOINT: '',
        MEDIA_ACCESS_KEY_ID: '',
        MEDIA_SECRET_ACCESS_KEY: '',
      },
      NO_EXTERNAL_REQUIREMENTS,
    );
    expect(env.MEDIA_STORE).toBe('local');
    expect(env.MEDIA_LOCAL_DIR).toBe('/srv/media');
    expect(env.MEDIA_BUCKET).toBeUndefined();
    expect(env.MEDIA_ENDPOINT).toBeUndefined();
  });

  it('MEDIA_STORE=none van boot duoc khi moi bien kho anh la chuoi rong', () => {
    const env = loadEnv(
      { ...BASE, MEDIA_STORE: 'none', MEDIA_BUCKET: '', MEDIA_ENDPOINT: '' },
      NO_EXTERNAL_REQUIREMENTS,
    );
    expect(env.MEDIA_STORE).toBe('none');
  });

  it('rong KHONG che giau mot cau hinh S3 thieu: van fail-fast', () => {
    // Noi long cho bien rong khong duoc phep bien thanh "S3 chay ma khong co endpoint".
    expect(() =>
      loadEnv(
        { ...BASE, MEDIA_STORE: 's3', MEDIA_BUCKET: 'b', MEDIA_ENDPOINT: '', MEDIA_ACCESS_KEY_ID: '', MEDIA_SECRET_ACCESS_KEY: '' },
        NO_EXTERNAL_REQUIREMENTS,
      ),
    ).toThrow(/MEDIA_ENDPOINT/);
  });

  it('gia tri THAT van duoc nhan binh thuong', () => {
    const env = loadEnv(
      {
        ...BASE,
        MEDIA_STORE: 's3',
        MEDIA_BUCKET: 'nexagnet-media',
        MEDIA_ENDPOINT: 'https://s3.example.invalid',
        MEDIA_ACCESS_KEY_ID: 'AKIA_SYNTHETIC',
        MEDIA_SECRET_ACCESS_KEY: 'secret_synthetic_value',
      },
      NO_EXTERNAL_REQUIREMENTS,
    );
    expect(env.MEDIA_BUCKET).toBe('nexagnet-media');
    expect(env.MEDIA_ENDPOINT).toBe('https://s3.example.invalid');
  });

  it('MEDIA_ALLOWED_HOSTS rong VAN la rong — rong o day nghia la CHAN HET', () => {
    // Truong nay CO Y khong dung `blankIsAbsent`: bien no thanh "khong dat" se roi ve mac dinh
    // `zdn.vn`, tuc NOI LONG mot cong SSRF ma khong ai yeu cau.
    const env = loadEnv({ ...BASE, MEDIA_ALLOWED_HOSTS: '' }, NO_EXTERNAL_REQUIREMENTS);
    expect(env.MEDIA_ALLOWED_HOSTS).toBe('');
  });
});
