import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * TANG LUU TRU cua dia diem van hanh (`#395`) — hai bat bien cua BAI XE song o DB.
 *
 * Hai chi muc UNIQUE MOT PHAN khong khai duoc trong `schema.prisma`, nen chung chi ton tai trong SQL
 * tho. Mot lan "don dep" migration xoa mat chung thi ung dung van chay — chi khong con gi chan hai
 * bai xe cung bat, va khau lap ke hoach se lang le bao `DEPOT_AMBIGUOUS` roi thoi sinh chang rong.
 * Ten chi muc con la HOP DONG voi tang ghi: P2002 tren ten nao thi doi ra ly do nao.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION_DIR = resolve(
  HERE,
  '../../../prisma/migrations/20260925100100_transport_place_admin',
);
const MIGRATION = readFileSync(join(MIGRATION_DIR, 'migration.sql'), 'utf8');
const ROLLBACK = readFileSync(join(MIGRATION_DIR, 'README-rollback.sql'), 'utf8');
const SCHEMA = readFileSync(resolve(HERE, '../../../prisma/schema.prisma'), 'utf8');

/** Chi cac dong lenh — bo chu thich, de mot tu trong cau giai thich khong lam bai xanh/do gia. */
const STATEMENTS = MIGRATION.split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

/** Than cac lenh `CREATE ... INDEX`, gom ve mot dong de so sanh khong phu thuoc xuong dong. */
const indexStatement = (name: string): string => {
  const start = STATEMENTS.indexOf(`CREATE UNIQUE INDEX "${name}"`);
  if (start < 0) throw new Error(`Khong thay chi muc ${name}`);
  const end = STATEMENTS.indexOf(';', start);
  return STATEMENTS.slice(start, end).replace(/\s+/g, ' ');
};

describe('tang luu tru cua dia diem van hanh (#395)', () => {
  /** Hai bai dang bat cung luc = khau lap ke hoach khong biet xe xuat phat tu dau. */
  it('toi da MOT bai xe dang bat — chi muc tren hang so, chi cho DEPOT dang ACTIVE', () => {
    expect(indexStatement('TransportGeofence_one_active_depot')).toBe(
      `CREATE UNIQUE INDEX "TransportGeofence_one_active_depot" ON "TransportGeofence" ((1)) WHERE "subjectKind" = 'DEPOT' AND "status" = 'ACTIVE'`,
    );
  });

  /** Ma bai xe khong trung KE CA voi bai da tat — neu khong, lich su hai bai tron vao nhau. */
  it('ma bai xe duy nhat trong moi trang thai', () => {
    const statement = indexStatement('TransportGeofence_depot_code_key');
    expect(statement).toBe(
      `CREATE UNIQUE INDEX "TransportGeofence_depot_code_key" ON "TransportGeofence" ("subjectId") WHERE "subjectKind" = 'DEPOT'`,
    );
    expect(statement).not.toContain('"status"');
  });

  it('dia chi NULL-duoc, nhung khong duoc la chuoi trang', () => {
    expect(STATEMENTS).toContain('ALTER TABLE "TransportGeofence" ADD COLUMN "address" TEXT;');
    expect(STATEMENTS).toContain('"TransportGeofence_address_not_blank"');
    expect(STATEMENTS).toContain(`CHECK ("address" IS NULL OR btrim("address") <> '')`);
  });

  /**
   * Du lieu cu da vi pham thi di tru phai hong bang mot cau NOI RO cach sua, TRUOC khi
   * `CREATE UNIQUE INDEX` hong bang mot thong bao kho doc va chan ca lan khoi dong.
   */
  it('kiem du lieu cu truoc khi tao chi muc, va chi dan cach sua', () => {
    const guard = STATEMENTS.indexOf('DO $$');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(STATEMENTS.indexOf('CREATE UNIQUE INDEX'));
    expect(STATEMENTS).toContain('RAISE EXCEPTION');
  });

  /**
   * "Sua du lieu roi chay lai" la CHUA DU: lan hong de lai mot dong di tru HONG va `migrate deploy`
   * tu choi moi lan sau voi P3009 (do tren DB nhap). MOI cau bao loi phai noi buoc `resolve`.
   */
  it('moi cau bao loi cua buoc kiem noi ca buoc `migrate resolve --rolled-back`', () => {
    const raises = STATEMENTS.split('RAISE EXCEPTION').slice(1);
    expect(raises).toHaveLength(2);
    for (const raise of raises) {
      expect(raise).toContain(
        'prisma migrate resolve --rolled-back 20260925100100_transport_place_admin',
      );
      expect(raise).toContain('P3009');
    }
    expect(ROLLBACK).toContain(
      'prisma migrate resolve --rolled-back 20260925100100_transport_place_admin',
    );
  });

  /** CHI THEM: khong doi cot cu, khong xoa, khong doi ten, khong tao bang, chi cham MOT bang. */
  it('khong sua mot cot hay bang nao dang ton tai', () => {
    expect(STATEMENTS).not.toMatch(/ALTER COLUMN/i);
    expect(STATEMENTS).not.toMatch(/\bDROP\b/i);
    expect(STATEMENTS).not.toMatch(/\bRENAME\b/i);
    expect(STATEMENTS).not.toMatch(/CREATE TABLE/i);
    expect(STATEMENTS).not.toContain('ALTER TYPE');
    const altered = [...STATEMENTS.matchAll(/ALTER TABLE "([A-Za-z]+)"/g)].map((match) => match[1]);
    expect(new Set(altered)).toEqual(new Set(['TransportGeofence']));
  });

  it('schema.prisma khai cot dia chi', () => {
    expect(SCHEMA).toMatch(/model TransportGeofence \{[^}]*\n\s+address\s+String\?\r?\n/);
  });

  it('ban lui noi ro cai mat khi go hai chi muc', () => {
    expect(ROLLBACK).toContain('DROP INDEX IF EXISTS "TransportGeofence_one_active_depot"');
    expect(ROLLBACK).toContain('DROP INDEX IF EXISTS "TransportGeofence_depot_code_key"');
    expect(ROLLBACK).toContain('DEPOT_AMBIGUOUS');
    expect(ROLLBACK).toContain("'20260925100100_transport_place_admin'");
  });
});
