import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PLACE_WRITE_REASONS, TRANSPORT_PLACE_ADMIN_DECISIONS } from './place-admin-decisions.js';
import { PLACE_ADMIN_ERROR_REASONS } from './place-errors.js';

/**
 * MOI TU CHOI CO KIEU CUA DUONG GHI DIA DIEM LA MOT QUYET DINH `place.write` (`#395`).
 *
 * `PlaceAdminService.reportDenied` chi ghi nhung ma NAM TRONG bo tu vung — mot ma moi nem ra tu
 * dich vu, tu luat chu cua dia diem hay tu chi muc DB ma quen them vao bo se lang le mat khoi bang
 * loc trace (dung loi da xay ra o S3: `COUNTERPARTY_SITE_NAME_TAKEN`, `PLACE_OWNER_*`). Bai nay DOC
 * ma nguon cua duong ghi va khoa: ma nao nem ra thi hoac la ly do `place.write`, hoac la ma "chinh dia
 * diem nay khong ton tai" (`PLACE_ADMIN_ERROR_REASONS`).
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** Moi tep nem loi tren duong ghi dia diem (dich vu, luat chu, dich va cham chi muc DB). */
const WRITE_PATH_SOURCES = [
  'admin/place-admin.service.ts',
  'admin/place-owner.ts',
  '../proof/place-write.store.ts',
];

const THROW_SHAPES = [
  /TransportDomainError\.\w+\(\s*'([A-Z][A-Z0-9_]+)'/g,
  /new PlaceAdminError\(\s*'[A-Z]+',\s*'([A-Z][A-Z0-9_]+)'/g,
  /this\.denied\(\s*'([A-Z][A-Z0-9_]+)'/g,
];

const thrownCodes = (file: string): readonly string[] => {
  const source = readFileSync(resolve(HERE, file), 'utf8');
  return THROW_SHAPES.flatMap((shape) =>
    [...source.matchAll(shape)].flatMap((match) => (match[1] === undefined ? [] : [match[1]])),
  );
};

describe('tu vung place.write phu MOI tu choi cua duong ghi dia diem (#395)', () => {
  const thrown = [...new Set(WRITE_PATH_SOURCES.flatMap(thrownCodes))].sort();
  const decisions: ReadonlySet<string> = new Set(PLACE_WRITE_REASONS);

  it('bai doc ma nguon khong xanh gia: tim thay du cac ma da biet', () => {
    expect(thrown.length).toBeGreaterThanOrEqual(15);
    expect(thrown).toEqual(
      expect.arrayContaining([
        'COUNTERPARTY_SITE_NAME_TAKEN',
        'PLACE_OWNER_INACTIVE',
        'PLACE_OWNER_REQUIRED',
        'PLACE_SITE_ALREADY_FENCED',
        'DEPOT_ALREADY_ACTIVE',
        'PLACE_NAME_TAKEN',
      ]),
    );
  });

  it('ma nem ra = ly do place.write, tru DUNG ma "dia diem khong ton tai"', () => {
    expect(thrown.filter((code) => !decisions.has(code))).toEqual([...PLACE_ADMIN_ERROR_REASONS]);
  });

  it('mot ma thuoc DUNG mot danh sach; moi ly do co nhan tieng Viet', () => {
    expect(PLACE_ADMIN_ERROR_REASONS.filter((code) => decisions.has(code))).toEqual([]);
    for (const reason of PLACE_WRITE_REASONS) {
      expect(TRANSPORT_PLACE_ADMIN_DECISIONS.labels[reason].length, reason).toBeGreaterThan(10);
    }
  });
});
