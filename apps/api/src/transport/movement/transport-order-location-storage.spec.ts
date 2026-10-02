import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NULL_ISLAND_TOLERANCE_DEGREES } from '../geo/geo-point.js';

/**
 * TANG LUU TRU cua toa do diem lay / diem giao (#379).
 *
 * Bo test nay KHONG cham co so du lieu: no doc tep migration nhu VAN BAN, cung ly do voi
 * `transport-movement-storage.spec.ts`. Prisma khong co cu phap cho `CHECK`, nen cac rang buoc
 * cap/khoang/null island song trong SQL tho -- va `prisma migrate dev` SE sinh lenh xoa chung neu
 * ai do chay no roi commit thang. Bai chay tren Postgres that o `transport-movement.int.spec.ts`
 * (MV-IT-379-*) chung minh rang buoc CAN; bai o day chung minh chung van duoc KHAI.
 */

const PRISMA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../prisma');
const MIGRATION_DIR = join(PRISMA_DIR, 'migrations/20260923140000_transport_order_location_points');
const read = (path: string): string => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const migration = read(join(MIGRATION_DIR, 'migration.sql'));
const schema = read(join(PRISMA_DIR, 'schema.prisma'));

/** Bo chu thich `--` roi cat theo `;` -- con lai DUNG cac lenh SQL ma Postgres se chay. */
const statements = migration
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .split(';')
  .map((statement) => statement.replace(/\s+/g, ' ').trim())
  .filter((statement) => statement.length > 0);

const COLUMNS = [
  'originLatitude',
  'originLongitude',
  'destinationLatitude',
  'destinationLongitude',
] as const;

/** Ten rang buoc -> than `CHECK` DUNG nhu hop dong #379 §1 (khoang trang da gom lai). */
const CHECKS: Readonly<Record<string, string>> = {
  TransportOrder_origin_point_paired: '("originLatitude" IS NULL) = ("originLongitude" IS NULL)',
  TransportOrder_destination_point_paired:
    '("destinationLatitude" IS NULL) = ("destinationLongitude" IS NULL)',
  TransportOrder_origin_latitude_range:
    '"originLatitude" IS NULL OR ("originLatitude" >= -90 AND "originLatitude" <= 90)',
  TransportOrder_origin_longitude_range:
    '"originLongitude" IS NULL OR ("originLongitude" >= -180 AND "originLongitude" <= 180)',
  TransportOrder_destination_latitude_range:
    '"destinationLatitude" IS NULL OR ("destinationLatitude" >= -90 AND "destinationLatitude" <= 90)',
  TransportOrder_destination_longitude_range:
    '"destinationLongitude" IS NULL OR ("destinationLongitude" >= -180 AND "destinationLongitude" <= 180)',
  TransportOrder_origin_not_null_island:
    '"originLatitude" IS NULL OR abs("originLatitude") >= 1e-9 OR abs("originLongitude") >= 1e-9',
  TransportOrder_destination_not_null_island:
    '"destinationLatitude" IS NULL OR abs("destinationLatitude") >= 1e-9 OR abs("destinationLongitude") >= 1e-9',
};
const CONSTRAINT_NAMES = Object.keys(CHECKS);

describe('#379 — tang luu tru cua toa do diem lay / diem giao', () => {
  it.each(CONSTRAINT_NAMES)(
    'migration khai `%s` tren TransportOrder voi DUNG than CHECK',
    (name) => {
      expect(statements).toContain(
        `ALTER TABLE "TransportOrder" ADD CONSTRAINT "${name}" CHECK (${CHECKS[name]})`,
      );
    },
  );

  it('bon cot `DOUBLE PRECISION`, NULL-duoc, KHONG default', () => {
    const addColumns = statements.find((statement) => statement.includes('ADD COLUMN'));
    expect(addColumns).toBe(
      `ALTER TABLE "TransportOrder" ${COLUMNS.map(
        (column) => `ADD COLUMN "${column}" DOUBLE PRECISION`,
      ).join(', ')}`,
    );
    // Mot default so (0, 0) la Null Island; mot default khac la bia toa do cho don cu. Kiem tren
    // lenh SQL (da bo chu thich), vi chu thich cua migration CO nhac toi chu `DEFAULT`.
    const code = statements.join(';\n');
    expect(code).not.toMatch(/\bDEFAULT\b/i);
    expect(code).not.toMatch(/\bNOT NULL\b/i);
  });

  it('CHI THEM: moi lenh la ADD COLUMN / ADD CONSTRAINT tren TransportOrder, khong DROP, khong backfill', () => {
    expect(statements).toHaveLength(1 + CONSTRAINT_NAMES.length);
    for (const statement of statements) {
      expect(statement).toMatch(/^ALTER TABLE "TransportOrder" ADD (COLUMN|CONSTRAINT) /);
    }
    const code = statements.join(';\n');
    expect(code).not.toMatch(/\bDROP\b/i);
    expect(code).not.toMatch(/\bUPDATE\b/i);
    expect(code).not.toMatch(/\bINSERT\b/i);
  });

  it('dung sai null island trung voi `NULL_ISLAND_TOLERANCE_DEGREES` cua tang mien', () => {
    // Hai nguong lech nhau thi tang mien nhan ma DB tu choi (500) hoac nguoc lai (lot).
    expect(String(NULL_ISLAND_TOLERANCE_DEGREES)).toBe('1e-9');
    expect(statements.join(';\n').match(/1e-9/g)).toHaveLength(4);
  });

  /**
   * CA PHEP SO SANH phai la phu dinh dung chu cua `parseGeoPoint` (tu choi khi `< 1e-9` o CA HAI
   * truc): DB nhan khi `>= 1e-9` o MOT truc. Mot dau `>` se tu choi dung diem bien (1e-9, 0) ma
   * tang mien da nhan — don do chet o DB bang loi 500 thay vi ma 400 co ten.
   */
  it('null island dung `>=` (phu dinh cua `< 1e-9` trong parseGeoPoint), khong co `>` nghiem ngat', () => {
    const code = statements.join(';\n');
    expect(code.match(/>= 1e-9/g)).toHaveLength(4);
    expect(code).not.toMatch(/> 1e-9/);
  });

  it('duong lui ton tai, go dung tam rang buoc va bon cot, va canh bao mat du lieu', () => {
    const rollbackPath = join(MIGRATION_DIR, 'README-rollback.sql');
    expect(existsSync(rollbackPath)).toBe(true);
    const rollback = read(rollbackPath);
    for (const name of CONSTRAINT_NAMES) {
      expect(rollback).toContain(`DROP CONSTRAINT IF EXISTS "${name}"`);
    }
    for (const column of COLUMNS) {
      expect(rollback).toContain(`DROP COLUMN IF EXISTS "${column}"`);
    }
    expect(rollback).toContain('20260923140000_transport_order_location_points');
    // Go rang buoc null island/khoang la lech khoi luat cua tang mien -- phai noi ra.
    expect(rollback).toContain('geo-point.ts');
  });

  it('schema.prisma khai bon cot `Float?` tren TransportOrder va liet ke tam rang buoc SQL tho', () => {
    const model = schema.match(/model TransportOrder \{[\s\S]*?\n\}/)?.[0] ?? '';
    for (const column of COLUMNS) {
      expect(model).toMatch(new RegExp(`\\n\\s+${column}\\s+Float\\?\\n`));
    }
    for (const name of CONSTRAINT_NAMES) {
      const short = name.replace(/^TransportOrder/, '');
      // Khoi "RANG BUOC SONG TRONG SQL THO" viet tat ten sau ten day du dau tien cua cung dong.
      expect(schema.includes(name) || schema.includes(`\`${short}\``)).toBe(true);
    }
  });
});
