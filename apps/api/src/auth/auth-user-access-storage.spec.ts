import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * TANG LUU TRU cua quyen rieng tung tai khoan (`#395`) — nhung thu `schema.prisma` khong noi duoc.
 *
 * Bon `CHECK` song trong SQL tho. `prisma migrate dev` sinh migration bang cach diff schema voi DB,
 * nen mot lan sinh lai se de nghi XOA chung, va he thong van chay binh thuong sau do — chi khong
 * con chan gi: mot mat khau tam song mai mai, mot ma quyen rong. Bo test nay doc CHINH tep migration
 * va do khi mot ten bien mat. Bang chung tren Postgres THAT nam o bai IT cua tai khoan.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION_DIR = resolve(HERE, '../../prisma/migrations/20260925100000_auth_user_access');
const MIGRATION = readFileSync(join(MIGRATION_DIR, 'migration.sql'), 'utf8');
const ROLLBACK = readFileSync(join(MIGRATION_DIR, 'README-rollback.sql'), 'utf8');
const SCHEMA = readFileSync(resolve(HERE, '../../prisma/schema.prisma'), 'utf8');

/** Chi cac dong lenh — bo chu thich, de mot tu trong cau giai thich khong lam bai xanh/do gia. */
const STATEMENTS = MIGRATION.split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('tang luu tru cua quyen rieng tai khoan (#395)', () => {
  it.each([
    'User_temporary_password_has_expiry',
    'User_jobTitle_not_blank',
    'UserPermissionGrant_permission_not_blank',
    'UserPermissionGrant_grantedBy_not_blank',
  ])('migration van khai rang buoc `%s`', (name) => {
    expect(STATEMENTS).toContain(`"${name}"`);
  });

  /** Mat khau tam KHONG co han la mot mat khau tam song mai mai. */
  it('bat doi mat khau thi BAT BUOC co han cua mat khau tam', () => {
    expect(STATEMENTS).toContain(
      'CHECK ("mustChangePassword" = false OR "temporaryPasswordExpiresAt" IS NOT NULL)',
    );
  });

  /** Moi tai khoan dang co giu nguyen cach dang nhap hom nay: khong ai bi ep doi mat khau. */
  it('cot bat doi mat khau NOT NULL va mac dinh false', () => {
    expect(STATEMENTS).toContain('"mustChangePassword" BOOLEAN NOT NULL DEFAULT false');
  });

  it('mot ma quyen chi co MOT dong tren mot tai khoan', () => {
    expect(STATEMENTS).toContain('CREATE UNIQUE INDEX "UserPermissionGrant_userId_permission_key"');
    expect(STATEMENTS).toContain('ON "UserPermissionGrant"("userId", "permission")');
  });

  /**
   * `CASCADE`, khong `RESTRICT`: reset du lieu demo xoa `User` bang `deleteMany`. Mot `RESTRICT` se
   * lam reset chet giua chung ngay lan dau mot tai khoan demo co quyen rieng.
   */
  it('xoa tai khoan thi quyen rieng di theo', () => {
    expect(STATEMENTS).toContain('"UserPermissionGrant_userId_fkey"');
    expect(STATEMENTS).toContain('REFERENCES "User"("id") ON DELETE CASCADE');
    expect(STATEMENTS).not.toContain('ON DELETE RESTRICT');
  });

  /**
   * MIGRATION NAY CHI THEM. Do lech co san (`ALTER TABLE "User" ALTER COLUMN "updatedAt" DROP
   * DEFAULT`, cung vai lenh tren bang cua mien khac) ma `prisma migrate diff` luon sinh kem da bi go
   * bang tay; bai nay giu cho lan sinh lai sau khong am tham dua chung ve.
   */
  it('khong sua cot cu, khong xoa, khong doi ten, va chi cham hai bang cua no', () => {
    expect(STATEMENTS).not.toMatch(/ALTER COLUMN/i);
    expect(STATEMENTS).not.toMatch(/\bDROP\b/i);
    expect(STATEMENTS).not.toMatch(/\bRENAME\b/i);
    expect(STATEMENTS).not.toContain('"updatedAt"');
    const altered = [...STATEMENTS.matchAll(/ALTER TABLE "([A-Za-z]+)"/g)].map((match) => match[1]);
    expect(new Set(altered)).toEqual(new Set(['User', 'UserPermissionGrant']));
  });

  it('tao dung MOT bang va MOT enum', () => {
    expect(
      [...STATEMENTS.matchAll(/CREATE TABLE "([A-Za-z]+)"/g)].map((match) => match[1]),
    ).toEqual(['UserPermissionGrant']);
    expect([...STATEMENTS.matchAll(/CREATE TYPE "([A-Za-z]+)"/g)].map((match) => match[1])).toEqual(
      ['UserPermissionEffect'],
    );
    expect(STATEMENTS).toContain(`CREATE TYPE "UserPermissionEffect" AS ENUM ('ALLOW', 'DENY')`);
  });

  it('schema.prisma khai cung hinh dang voi migration', () => {
    expect(SCHEMA).toContain('enum UserPermissionEffect');
    expect(SCHEMA).toContain('model UserPermissionGrant');
    expect(SCHEMA).toContain('@@unique([userId, permission])');
    expect(SCHEMA).toMatch(
      /user\s+User\s+@relation\(fields: \[userId\], references: \[id\], onDelete: Cascade\)/,
    );
    expect(SCHEMA).toMatch(/mustChangePassword\s+Boolean\s+@default\(false\)/);
  });

  /**
   * Ban lui phai NOI RA cai gia cua no: bo mot dong DENY la TRA LAI quyen cho mot tai khoan. Mot tep
   * lui im lang ve dieu do se lam nguoi truc tin rang lui la an toan.
   */
  it('ban lui canh bao rang bo quyen DENY la mo rong quyen', () => {
    expect(ROLLBACK).toContain('DENY');
    expect(ROLLBACK).toContain('MO RONG');
    expect(ROLLBACK).toContain('DROP TABLE IF EXISTS "UserPermissionGrant"');
    expect(ROLLBACK).toContain("'20260925100000_auth_user_access'");
  });
});
