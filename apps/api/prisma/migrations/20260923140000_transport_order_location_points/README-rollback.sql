-- DUONG LUI cua `20260923140000_transport_order_location_points` (`#379`).
--
-- Chay TAY khi can quay ve hinh dang truoc `#379`. KHONG phai mot migration Prisma — de o day de
-- nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- ===========================================================================
-- DOC TRUOC KHI CHAY
--
-- 1. Bo bon cot la MAT DU LIEU: moi toa do diem lay / diem giao ma nguoi dung da chon tu luc
--    `#379` len se bien mat, va KHONG co nguon nao dung lai duoc chung — nhan chu (`originLabel`,
--    `destinationLabel`) chi de hien thi, geocode lai nhan la BIA toa do. Dem truoc:
--
--      SELECT count(*) FROM "TransportOrder"
--      WHERE "originLatitude" IS NOT NULL OR "destinationLatitude" IS NOT NULL;
--
--    Khac 0 thi xuat bon cot ra (kem `id`, `code`) truoc khi chay khoi duoi.
--
-- 2. Chi lui khi lui CA ban ung dung. Ban ung dung tu `#379` doc bon cot nay o moi lan doc don;
--    client Prisma moi tren mot bang da mat cot se nem o `GET /transport/orders`.
--
-- 3. Tuy chon, IT rui ro hon: chi go cac CHECK ma giu cot (vd khi mot rang buoc chan nham mot
--    duong ghi hop le). Khi do chay rieng cac dong `DROP CONSTRAINT`, bo qua `DROP COLUMN` va KHONG
--    xoa dong `_prisma_migrations`. Nguong khoang va null island phai GIONG
--    `apps/api/src/transport/geo/geo-point.ts` (`parseGeoPoint`, `NULL_ISLAND_TOLERANCE_DEGREES`)
--    ca ve SO lan ve PHEP SO SANH: tang mien tu choi khi `|lat| < 1e-9 AND |lng| < 1e-9`, nen mot
--    CHECK tao lai phai la `abs(lat) >= 1e-9 OR abs(lng) >= 1e-9` (dau `>=`, khong phai `>`). Sua
--    mot ben ma quen ben kia la tao hai nguong lech nhau.
-- ===========================================================================

BEGIN;

ALTER TABLE "TransportOrder" DROP CONSTRAINT IF EXISTS "TransportOrder_destination_not_null_island";
ALTER TABLE "TransportOrder" DROP CONSTRAINT IF EXISTS "TransportOrder_origin_not_null_island";
ALTER TABLE "TransportOrder" DROP CONSTRAINT IF EXISTS "TransportOrder_destination_longitude_range";
ALTER TABLE "TransportOrder" DROP CONSTRAINT IF EXISTS "TransportOrder_destination_latitude_range";
ALTER TABLE "TransportOrder" DROP CONSTRAINT IF EXISTS "TransportOrder_origin_longitude_range";
ALTER TABLE "TransportOrder" DROP CONSTRAINT IF EXISTS "TransportOrder_origin_latitude_range";
ALTER TABLE "TransportOrder" DROP CONSTRAINT IF EXISTS "TransportOrder_destination_point_paired";
ALTER TABLE "TransportOrder" DROP CONSTRAINT IF EXISTS "TransportOrder_origin_point_paired";

ALTER TABLE "TransportOrder"
  DROP COLUMN IF EXISTS "destinationLongitude",
  DROP COLUMN IF EXISTS "destinationLatitude",
  DROP COLUMN IF EXISTS "originLongitude",
  DROP COLUMN IF EXISTS "originLatitude";

DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20260923140000_transport_order_location_points';

COMMIT;
