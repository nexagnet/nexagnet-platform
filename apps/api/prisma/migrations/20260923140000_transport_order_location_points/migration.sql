-- ===========================================================================
-- `#379` — DIEM LAY va DIEM GIAO cua mot don van chuyen tro thanh TOA DO THAT.
-- ===========================================================================
--
-- Vi sao di tru nay ton tai, noi bang mot cau: truoc #379 mot `TransportOrder` chi mang hai NHAN
-- chu (`originLabel`, `destinationLabel`), nen dieu xe phai DOAN diem lay hang bang cach so nhan
-- voi ten hang rao — mot chu go khac di mot dau cach la mat diem, con hai dia diem trung ten thi
-- chon nham. Tu #379 toa do la su that; nhan chi con de hien thi.
--
-- HINH DANG: hai cot `DOUBLE PRECISION` cho moi diem, CUNG kieu voi `TransportGeofence` va
-- `TransportLocationObservation`. Khong dung `INTEGER x 1e-7` nhu `TransportFuelStation`: cot o day
-- khong phai khoa so khop, va giu `DOUBLE PRECISION` de mot ngay them duoc cot `geography` SINH tu
-- hai cot nay (`docs/kien-truc/transport-geospatial.md` §6) ma khong doi du lieu.
--
-- DI TRU NAY CHI THEM. Khong `DROP`, khong doi cot cu, khong backfill:
--   · moi cot NULL-duoc va KHONG co `DEFAULT` — mot default so (0, 0) chinh la "Null Island" ma
--     rang buoc ben duoi tu choi, con mot default nao khac la bia toa do cho don cu;
--   · don cu, don chieu tu chuyen v1 va don seed mau giu NULL MAI MAI. He thong KHONG geocode nhan
--     cu thanh toa do: mot toa do doan sai con te hon khong co, vi dieu xe se tin no.

-- ---------------------------------------------------------------------------
-- PHAN 1 — BON COT MOI
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportOrder"
  ADD COLUMN "originLatitude" DOUBLE PRECISION,
  ADD COLUMN "originLongitude" DOUBLE PRECISION,
  ADD COLUMN "destinationLatitude" DOUBLE PRECISION,
  ADD COLUMN "destinationLongitude" DOUBLE PRECISION;

-- ---------------------------------------------------------------------------
-- PHAN 2 — BAT BIEN MA PRISMA KHONG KHAI DUOC
-- ---------------------------------------------------------------------------
--
-- Moi hang DA CO co ca bon cot NULL (vua them o tren), nen MOI rang buoc duoi day dung ngay voi
-- toan bo du lieu cu: cap NULL = NULL thoa `_paired`, va moi CHECK khoang/null island deu mo dau
-- bang `IS NULL OR`. Khong can mot buoc va du lieu nao di truoc.
--
-- Tang mien (`parseGeoPoint`, `apps/api/src/transport/geo/geo-point.ts`) da tu choi dung nhung
-- hinh dang nay truoc khi ghi. Rang buoc o day ton tai cho MOI duong ghi KHONG qua tang mien: mot
-- script van hanh, mot lan sua tay trong psql, mot seed viet sai.

-- MOT DIEM LA MOT CAP. Nua cap toa do (co vi do, mat kinh do) khong phai mot diem tren mat dat,
-- va doc ra no thi moi ham hinh hoc phai tu doan phai lam gi. Cung ky thuat voi
-- `TransportFuelStation_coordinates_paired`.
ALTER TABLE "TransportOrder"
  ADD CONSTRAINT "TransportOrder_origin_point_paired"
  CHECK (("originLatitude" IS NULL) = ("originLongitude" IS NULL));

ALTER TABLE "TransportOrder"
  ADD CONSTRAINT "TransportOrder_destination_point_paired"
  CHECK (("destinationLatitude" IS NULL) = ("destinationLongitude" IS NULL));

-- KHOANG WGS84. Cung nguong voi `parseGeoPoint` va `TransportGeofence_latitude_range` — mot nguong
-- thu hai o day ma lech khoi tang mien se de lot hoac chan nham dung o bien.
ALTER TABLE "TransportOrder"
  ADD CONSTRAINT "TransportOrder_origin_latitude_range"
  CHECK ("originLatitude" IS NULL OR ("originLatitude" >= -90 AND "originLatitude" <= 90));

ALTER TABLE "TransportOrder"
  ADD CONSTRAINT "TransportOrder_origin_longitude_range"
  CHECK ("originLongitude" IS NULL OR ("originLongitude" >= -180 AND "originLongitude" <= 180));

ALTER TABLE "TransportOrder"
  ADD CONSTRAINT "TransportOrder_destination_latitude_range"
  CHECK ("destinationLatitude" IS NULL OR ("destinationLatitude" >= -90 AND "destinationLatitude" <= 90));

ALTER TABLE "TransportOrder"
  ADD CONSTRAINT "TransportOrder_destination_longitude_range"
  CHECK ("destinationLongitude" IS NULL OR ("destinationLongitude" >= -180 AND "destinationLongitude" <= 180));

-- NULL ISLAND. (0, 0) la ngoai khoi vinh Guinea; khong don hang nao cua khach lay hang o do. Nhung
-- rat nhieu tang phan mem tra dung cap so do khi CHUA CO dinh vi (struct zero-init, `parseFloat`
-- hong, truong JSON thieu). Nhan no la ghi mot toa do "hop le" cho moi lan chon diem hong.
--
-- Bieu thuc la PHU DINH DUNG CHU cua `parseGeoPoint`: tang mien tu choi khi
-- `|lat| < 1e-9 AND |lng| < 1e-9`, nen DB chap nhan khi `|lat| >= 1e-9 OR |lng| >= 1e-9`. Dau `>=`
-- la co y: mot dau `>` se tu choi dung diem (1e-9, 0) ma tang mien da nhan, va don do chet o DB bang
-- mot loi 500 thay vi mot ma 400 co ten. (`TransportGeofence_not_null_island` cu dung `>` — lech
-- nhau DUNG tai bien 1e-9; bang nay khong lap lai do lech do.)
ALTER TABLE "TransportOrder"
  ADD CONSTRAINT "TransportOrder_origin_not_null_island"
  CHECK ("originLatitude" IS NULL OR abs("originLatitude") >= 1e-9 OR abs("originLongitude") >= 1e-9);

ALTER TABLE "TransportOrder"
  ADD CONSTRAINT "TransportOrder_destination_not_null_island"
  CHECK ("destinationLatitude" IS NULL OR abs("destinationLatitude") >= 1e-9 OR abs("destinationLongitude") >= 1e-9);
