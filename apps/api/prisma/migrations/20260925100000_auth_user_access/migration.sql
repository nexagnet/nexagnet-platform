-- ===========================================================================
-- `#395` — QUYEN RIENG cua tung tai khoan + MAT KHAU TAM + CHUC DANH.
-- ===========================================================================
--
-- Vi sao di tru nay ton tai, noi bang mot cau: truoc #395 moi tai khoan chi co MOT vai phang
-- (`User.role`), nen Giam doc khong cap duoc cho mot nguoi dieu hanh "chi doi xe va don" ma khong
-- phai cap ca bo quyen cua Ke toan. Tu #395 vai la VAI KHOI DIEM; quyen rieng la cac dong
-- `UserPermissionGrant` them (ALLOW) hoac bot (DENY) tren vai do. MIEN so huu ma quyen quyet dinh
-- dong nao hop le (`apps/api/src/transport/permissions/transport-permission-rules.ts`) — DB chi giu
-- hinh dang.
--
-- DI TRU NAY CHI THEM. Khong `DROP`, khong doi cot cu, khong backfill:
--   · moi tai khoan dang co giu NGUYEN quyen hom nay: khong dong quyen rieng nao = dung vai khoi
--     diem, va `mustChangePassword` mac dinh `false`;
--   · `prisma migrate diff` con sinh kem `ALTER TABLE "User" ALTER COLUMN "updatedAt" DROP DEFAULT`
--     (do lech co san tu `20260812162000_auth_sessions`) cung vai lenh tren bang cua mien khac. Tat
--     ca da bi GO bang tay — `auth-user-access-storage.spec.ts` giu cho lan sinh lai sau khong am
--     tham dua chung ve.

-- ---------------------------------------------------------------------------
-- PHAN 1 — HIEU LUC cua mot dong quyen
-- ---------------------------------------------------------------------------

CREATE TYPE "UserPermissionEffect" AS ENUM ('ALLOW', 'DENY');

-- ---------------------------------------------------------------------------
-- PHAN 2 — BA COT MOI tren `User`
-- ---------------------------------------------------------------------------
--
-- `mustChangePassword` NOT NULL DEFAULT false: moi hang cu nhan `false` ngay trong lenh nay, nen
-- khong ai bi ep doi mat khau sau khi nang cap. `temporaryPasswordExpiresAt` va `jobTitle` NULL-duoc
-- va KHONG co default.
ALTER TABLE "User"
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "temporaryPasswordExpiresAt" TIMESTAMP(3),
  ADD COLUMN "jobTitle" TEXT;

-- MAT KHAU TAM LUON CO HAN. Mot tai khoan bi ep doi mat khau ma khong co han cua mat khau tam la
-- mot mat khau tam song mai mai — dung thu #395 cam. Hang cu thoa ngay (`false`).
ALTER TABLE "User"
  ADD CONSTRAINT "User_temporary_password_has_expiry"
  CHECK ("mustChangePassword" = false OR "temporaryPasswordExpiresAt" IS NOT NULL);

-- NULL = chua dat chuc danh — hop le. Chuoi toan khoang trang thi khong: no trong nhu da nhap o moi
-- phep `IS NOT NULL` va hien ra thanh mot dong trang tren danh sach tai khoan.
ALTER TABLE "User"
  ADD CONSTRAINT "User_jobTitle_not_blank"
  CHECK ("jobTitle" IS NULL OR btrim("jobTitle") <> '');

-- ---------------------------------------------------------------------------
-- PHAN 3 — BANG QUYEN RIENG
-- ---------------------------------------------------------------------------

CREATE TABLE "UserPermissionGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "effect" "UserPermissionEffect" NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermissionGrant_pkey" PRIMARY KEY ("id")
);

-- MOT ma quyen chi co MOT dong tren mot tai khoan: ALLOW va DENY cung mot ma la mot cau hoi khong
-- co cau tra loi. Chi muc nay cung phuc vu moi lan doc "quyen rieng cua tai khoan X" (cot dau la
-- `userId`), nen KHONG can them mot chi muc rieng tren `userId`.
CREATE UNIQUE INDEX "UserPermissionGrant_userId_permission_key"
  ON "UserPermissionGrant"("userId", "permission");

-- `CASCADE`, khong `RESTRICT`: reset du lieu demo xoa cung `User` bang `deleteMany`
-- (`transport/demo/demo-seed.ts`). Mot `RESTRICT` o day se lam reset chet giua chung ngay lan dau
-- co mot tai khoan demo mang quyen rieng. Quyen rieng khong co nghia gi khi tai khoan da mat.
ALTER TABLE "UserPermissionGrant"
  ADD CONSTRAINT "UserPermissionGrant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ma quyen rong khong tro toi hanh dong nao; no chi lam bang quyen noi sai ve mot tai khoan.
ALTER TABLE "UserPermissionGrant"
  ADD CONSTRAINT "UserPermissionGrant_permission_not_blank"
  CHECK (btrim("permission") <> '');

-- Nguoi cap phai doc lai duoc tu so kiem toan — cung quy uoc voi `AuditLog.actor`.
ALTER TABLE "UserPermissionGrant"
  ADD CONSTRAINT "UserPermissionGrant_grantedBy_not_blank"
  CHECK (btrim("grantedBy") <> '');
