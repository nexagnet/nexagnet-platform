-- ===========================================================================
-- VI BANG — NEN MONG HO SO (Issue #427). Capability `vi-bang-management`.
-- ===========================================================================
--
-- DI TRU NAY CHI THEM: bon bang moi, ba enum moi. Khong DROP, khong doi cot cu, khong backfill.
-- Khong phone/CCCD nao duoc dat UNIQUE (chi chi muc): ep duy nhat se gay hop nhat nham khach.
-- Thanh toan / cap so / tai lieu cuoi KHONG nam o day — cac issue sau so huu chung.

-- CreateEnum
CREATE TYPE "ViBangCustomerKind" AS ENUM ('PERSON', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "ViBangCaseStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'WAITING_PAYMENT', 'WAITING_NUMBER', 'NUMBERED', 'STAMPED', 'ISSUED', 'RETURNED');

-- CreateEnum
CREATE TYPE "ViBangParticipantKind" AS ENUM ('REQUESTER', 'PARTICIPANT');

-- CreateTable
CREATE TABLE "ViBangCustomer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "ViBangCustomerKind" NOT NULL,
    "displayName" TEXT NOT NULL,
    "source" TEXT,
    "category" TEXT,
    "phone" TEXT,
    "nationalId" TEXT,
    "email" TEXT,
    "address" TEXT,
    "taxCode" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViBangCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViBangServiceContract" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "contractRef" TEXT NOT NULL,
    "title" TEXT,
    "signedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViBangServiceContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViBangCase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "contractId" TEXT,
    "status" "ViBangCaseStatus" NOT NULL DEFAULT 'DRAFT',
    "executorUserId" TEXT,
    "secretaryUserId" TEXT,
    "branch" TEXT,
    "occurredAt" TIMESTAMP(3),
    "location" TEXT,
    "content" TEXT,
    "registrationNumber" TEXT,
    "registeredAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViBangCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViBangCaseParticipant" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" "ViBangParticipantKind" NOT NULL,
    "customerId" TEXT,
    "displayName" TEXT NOT NULL,
    "roleLabel" TEXT,

    CONSTRAINT "ViBangCaseParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ViBangCustomer_tenantId_displayName_idx" ON "ViBangCustomer"("tenantId", "displayName");

-- CreateIndex
CREATE INDEX "ViBangCustomer_tenantId_phone_idx" ON "ViBangCustomer"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "ViBangCustomer_tenantId_nationalId_idx" ON "ViBangCustomer"("tenantId", "nationalId");

-- CreateIndex
CREATE INDEX "ViBangServiceContract_tenantId_customerId_idx" ON "ViBangServiceContract"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "ViBangServiceContract_tenantId_contractRef_idx" ON "ViBangServiceContract"("tenantId", "contractRef");

-- CreateIndex
CREATE INDEX "ViBangCase_tenantId_status_idx" ON "ViBangCase"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ViBangCase_tenantId_customerId_idx" ON "ViBangCase"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "ViBangCase_tenantId_contractId_idx" ON "ViBangCase"("tenantId", "contractId");

-- CreateIndex
CREATE INDEX "ViBangCase_tenantId_createdAt_idx" ON "ViBangCase"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ViBangCaseParticipant_caseId_idx" ON "ViBangCaseParticipant"("caseId");

-- CreateIndex
CREATE INDEX "ViBangCaseParticipant_customerId_idx" ON "ViBangCaseParticipant"("customerId");

-- AddForeignKey
ALTER TABLE "ViBangServiceContract" ADD CONSTRAINT "ViBangServiceContract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "ViBangCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViBangCase" ADD CONSTRAINT "ViBangCase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "ViBangCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViBangCase" ADD CONSTRAINT "ViBangCase_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ViBangServiceContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViBangCase" ADD CONSTRAINT "ViBangCase_executorUserId_fkey" FOREIGN KEY ("executorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViBangCase" ADD CONSTRAINT "ViBangCase_secretaryUserId_fkey" FOREIGN KEY ("secretaryUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViBangCaseParticipant" ADD CONSTRAINT "ViBangCaseParticipant_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ViBangCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViBangCaseParticipant" ADD CONSTRAINT "ViBangCaseParticipant_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "ViBangCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Chuoi toan khoang trang trong nhu da nhap: cung khuon voi `TransportCounterpartySite_address_not_blank`.
ALTER TABLE "ViBangCustomer"
  ADD CONSTRAINT "ViBangCustomer_displayName_not_blank" CHECK (btrim("displayName") <> '');
ALTER TABLE "ViBangServiceContract"
  ADD CONSTRAINT "ViBangServiceContract_contractRef_not_blank" CHECK (btrim("contractRef") <> '');
