-- DUONG LUI cua `20260925100100_transport_place_admin` (`#395`).
--
-- Chay TAY khi can quay ve hinh dang truoc `#395`. KHONG phai mot migration Prisma — de o day de
-- nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- ===========================================================================
-- DOC TRUOC KHI CHAY
--
-- 1. Bo cot `address` la MAT DU LIEU: moi dia chi Giam doc da nhap cho dia diem van hanh bien mat.
--    Dem va xuat truoc:
--
--      SELECT "id", "label", "subjectKind", "address" FROM "TransportGeofence"
--      WHERE "address" IS NOT NULL;
--
-- 2. Bo hai chi muc UNIQUE MOT PHAN la bo cong DB cua "toi da MOT bai xe dang bat" va "ma bai xe
--    khong trung". Sau khi lui, chi con phep kiem trong ma giu hai dieu do — mot duong ghi di vong
--    (seed, psql) co the bat hai bai cung luc, va khau lap ke hoach se lang le bao `DEPOT_AMBIGUOUS`.
--
-- 3. Tuy chon, IT rui ro hon: chi go hai chi muc (vd khi mot rang buoc chan nham mot thao tac hop
--    le) ma giu cot `address`. Khi do chay rieng hai dong `DROP INDEX` va KHONG xoa dong
--    `_prisma_migrations`.
--
-- 4. Chi lui toan bo khi lui CA ban ung dung: ban tu `#395` doc cot `address` o moi lan liet ke
--    hang rao.
--
-- 5. Di tru HONG o buoc kiem truoc (hai bai xe dang bat, hoac ma bai xe trung) KHONG can tep nay:
--    Postgres da lui tron. Sua du lieu nhu cau bao loi noi, roi danh dau lan hong la da lui TRUOC
--    khi deploy lai — neu khong, `prisma migrate deploy` tu choi voi P3009:
--
--      prisma migrate resolve --rolled-back 20260925100100_transport_place_admin
-- ===========================================================================

BEGIN;

DROP INDEX IF EXISTS "TransportGeofence_depot_code_key";
DROP INDEX IF EXISTS "TransportGeofence_one_active_depot";

ALTER TABLE "TransportGeofence" DROP CONSTRAINT IF EXISTS "TransportGeofence_address_not_blank";
ALTER TABLE "TransportGeofence" DROP COLUMN IF EXISTS "address";

DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20260925100100_transport_place_admin';

COMMIT;
