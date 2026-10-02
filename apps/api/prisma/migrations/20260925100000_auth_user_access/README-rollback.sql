-- DUONG LUI cua `20260925100000_auth_user_access` (`#395`).
--
-- Chay TAY khi can quay ve hinh dang truoc `#395`. KHONG phai mot migration Prisma — de o day de
-- nguoi truc doc duoc trong luc su co, khong phai de chay tu dong.
--
-- ===========================================================================
-- DOC TRUOC KHI CHAY
--
-- 1. Bo bang `UserPermissionGrant` la MAT QUYEN RIENG: moi tai khoan quay ve DUNG vai khoi diem.
--    Voi mot tai khoan ACCOUNTING bi DENY mot quyen, dieu do nghia la no LAY LAI quyen do — mot lan
--    MO RONG quyen am tham. Dem va xuat truoc:
--
--      SELECT u."username", g."permission", g."effect", g."grantedBy", g."createdAt"
--      FROM "UserPermissionGrant" g JOIN "User" u ON u."id" = g."userId"
--      ORDER BY u."username", g."permission";
--
--    Co dong `DENY` nao thi quyet dinh voi Giam doc TRUOC: hoac doi vai cua tai khoan do, hoac
--    khoa no, roi moi lui.
--
-- 2. Tai khoan dang dung MAT KHAU TAM (`mustChangePassword = true`) se mat co bat doi mat khau va
--    dang nhap binh thuong bang mat khau tam ma KHONG con han. Dem truoc:
--
--      SELECT "username", "temporaryPasswordExpiresAt" FROM "User" WHERE "mustChangePassword";
--
--    Khac 0 thi dat lai mat khau cho tung tai khoan do SAU khi lui (hoac khoa chung).
--
-- 3. Chi lui khi lui CA ban ung dung. Ban ung dung tu `#395` doc ba cot va bang nay o MOI lan kiem
--    phien; client Prisma moi tren mot bang da mat cot se lam moi request 500.
--
-- 4. Enum `UserPermissionEffect` duoc bo SAU bang (bang dang dung no).
-- ===========================================================================

BEGIN;

DROP TABLE IF EXISTS "UserPermissionGrant";
DROP TYPE IF EXISTS "UserPermissionEffect";

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_jobTitle_not_blank";
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_temporary_password_has_expiry";

ALTER TABLE "User"
  DROP COLUMN IF EXISTS "jobTitle",
  DROP COLUMN IF EXISTS "temporaryPasswordExpiresAt",
  DROP COLUMN IF EXISTS "mustChangePassword";

DELETE FROM "_prisma_migrations"
WHERE "migration_name" = '20260925100000_auth_user_access';

COMMIT;
