-- ===========================================================================
-- `#395` — DIA DIEM VAN HANH: dia chi hien thi + hai bat bien cua BAI XE song o DB.
-- ===========================================================================
--
-- Vi sao di tru nay ton tai, noi bang mot cau: tu #395 Giam doc tu khai va doi bai xe tren man
-- hinh "Dia diem van hanh", va bai xe dang bat la diem dau cua moi chang rong + diem dong vong chay.
-- Hai bai cung bat thi khau lap ke hoach khong biet xe xuat phat tu dau (`DEPOT_AMBIGUOUS`) va LANG
-- LE thoi sinh chang rong — nen "toi da MOT bai dang bat" phai la mot su that cua DB, khong chi la
-- mot phep kiem trong ma co the bi mot duong ghi khac (seed, script van hanh, psql) di vong qua.
--
-- DI TRU NAY CHI THEM. Khong `DROP`, khong doi cot cu, khong backfill. `prisma migrate diff` con
-- sinh kem vai lenh tren bang cua mien khac (do lech co san) — da GO bang tay;
-- `transport-place-admin-storage.spec.ts` giu cho chung khong am tham quay lai.

-- ---------------------------------------------------------------------------
-- PHAN 1 — DIA CHI HIEN THI
-- ---------------------------------------------------------------------------
--
-- NULL = chua nhap — hop le, va la gia tri cua MOI hang rao cu. Khong phep so khop nao dung cot nay:
-- vi tri la toa do + ban kinh, dia chi chi de nguoi doc.
ALTER TABLE "TransportGeofence" ADD COLUMN "address" TEXT;

-- Chuoi toan khoang trang trong nhu da nhap o moi phep `IS NOT NULL`. Cung khuon voi
-- `TransportCounterpartySite_address_not_blank`.
ALTER TABLE "TransportGeofence"
  ADD CONSTRAINT "TransportGeofence_address_not_blank"
  CHECK ("address" IS NULL OR btrim("address") <> '');

-- ---------------------------------------------------------------------------
-- PHAN 2 — HAI BAT BIEN CUA BAI XE
-- ---------------------------------------------------------------------------
--
-- KIEM TRUOC, noi ro cach sua. Neu du lieu hien co da vi pham, `CREATE UNIQUE INDEX` ben duoi se
-- hong voi mot thong bao kho doc ("Key ((1))=(1) is duplicated") va chan ca lan khoi dong. Khoi nay
-- hong TRUOC, bang mot cau noi dung viec phai lam. Tren preview (do 25/09/2026) co dung MOT hang rao
-- DEPOT (`DEPOT-HN`, dang bat), nen khoi nay khong chan gi.
--
-- Cau noi ca buoc `prisma migrate resolve --rolled-back`: Postgres lui TRON di tru (khong cot, khong
-- chi muc nao duoc tao), nhung Prisma van giu mot dong HONG trong `_prisma_migrations` va tu choi
-- moi lan deploy sau (P3009) cho toi khi dong do duoc danh dau la da lui — do tren DB nhap.
DO $$
DECLARE
  active_depots integer;
  duplicated_codes integer;
BEGIN
  SELECT count(*) INTO active_depots
  FROM "TransportGeofence"
  WHERE "subjectKind" = 'DEPOT' AND "status" = 'ACTIVE';

  IF active_depots > 1 THEN
    RAISE EXCEPTION
      'Co % hang rao DEPOT dang ACTIVE. Tu #395 chi duoc MOT bai xe dang bat. Chon bai dung, dat cac bai con lai thanh INACTIVE (UPDATE "TransportGeofence" SET "status" = ''INACTIVE'' WHERE "id" IN (...)), roi deploy lai. Lan deploy vua hong da de lai mot dong di tru HONG trong _prisma_migrations: TRUOC khi deploy lai, chay prisma migrate resolve --rolled-back 20260925100100_transport_place_admin (neu khong, migrate deploy tu choi voi P3009).',
      active_depots;
  END IF;

  SELECT count(*) INTO duplicated_codes
  FROM (
    SELECT "subjectId"
    FROM "TransportGeofence"
    WHERE "subjectKind" = 'DEPOT'
    GROUP BY "subjectId"
    HAVING count(*) > 1
  ) AS duplicated;

  IF duplicated_codes > 0 THEN
    RAISE EXCEPTION
      'Co % ma bai xe (subjectId cua hang rao DEPOT) bi dung cho nhieu hang rao. Moi ma bai xe chi thuoc MOT hang rao: doi "subjectId" cua cac hang thua sang mot ma moi (vd them hau to -2), roi deploy lai. Lan deploy vua hong da de lai mot dong di tru HONG trong _prisma_migrations: TRUOC khi deploy lai, chay prisma migrate resolve --rolled-back 20260925100100_transport_place_admin (neu khong, migrate deploy tu choi voi P3009).',
      duplicated_codes;
  END IF;
END
$$;

-- TOI DA MOT BAI XE DANG BAT. Chi muc tren hang so `(1)` voi dieu kien: moi hang DEPOT dang bat
-- deu mang CUNG mot khoa, nen hang thu hai bi tu choi (P2002 -> `DEPOT_ALREADY_ACTIVE`). Bai du
-- phong (`INACTIVE`) khong nam trong chi muc, nen co bao nhieu cung duoc. Doi bai chinh la MOT giao
-- dich: tat bai cu roi bat bai moi — khong bao gio co luc hai bai cung bat.
CREATE UNIQUE INDEX "TransportGeofence_one_active_depot"
  ON "TransportGeofence" ((1))
  WHERE "subjectKind" = 'DEPOT' AND "status" = 'ACTIVE';

-- MA BAI XE KHONG TRUNG, ke ca voi bai da tat. `subjectId` cua hang rao DEPOT la MA ON DINH cua bai
-- (vd `DEPOT-HN`); dung lai ma cua mot bai da tat cho mot bai moi se lam lich su cua hai bai tron
-- vao nhau (P2002 -> `DEPOT_CODE_TAKEN`).
CREATE UNIQUE INDEX "TransportGeofence_depot_code_key"
  ON "TransportGeofence" ("subjectId")
  WHERE "subjectKind" = 'DEPOT';
