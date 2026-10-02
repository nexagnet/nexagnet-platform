import { createHash } from 'node:crypto';
import { loadTenantConfig } from '@netviet/tenant';
import type { PrismaClient } from '@prisma/client';
import type { BusinessDate } from '../business-date.js';
import { toBusinessDate } from '../business-date.js';
import {
  type MatchableFuelEntry,
  type MatchableStatementLine,
  runFuelMatching,
} from '../fuel/fuel-matching.js';
import {
  DEFAULT_FUEL_AMOUNT_TOLERANCE_VND,
  DEFAULT_FUEL_BUSINESS_DATE_TOLERANCE_DAYS,
} from '../fuel/fuel-policy.js';
import { formatConsumption, formatLiters } from '../fuel/fuel-quantity.js';
import { toStoredAmount } from '../money.js';
import { calculateCommission } from '../settlement/commission-rules.js';
import { settlementDocumentFingerprint } from '../settlement/settlement-documents.js';
import { customerReconciliationFingerprint } from '../customer-ar/customer-ar-documents.js';
import { calculatePayslip, payrollPolicyVersion } from '../workforce/payroll-calculator.js';
import { loadDemoMonthDataset } from './demo-dataset.js';
import { assertDemoResetAllowed, assertTransportDemoTenant } from './demo-guard.js';
import { DEMO_STAFF_PERSONAS, demoDriverLogins } from './demo-logins.js';
import { type DemoPlan, buildDemoPlan } from './demo-plan.js';

/**
 * GHI ke hoach xuong Postgres — buoc cuoi cua duong gieo du lieu mau (T8/#90).
 *
 * ---------------------------------------------------------------------------
 * KHONG MOT CAU SQL THO NAO. Moi dong di qua Prisma, tuc di qua chinh schema ma ung dung dung.
 * Do la rang buoc cua #196: mot duong gieo bang SQL tho la mot duong ghi SONG SONG voi san pham —
 * no khong chiu rang buoc `CHECK` nao, khong bi migration nao lam hong, va vi the co the gieo ra
 * mot trang thai ma san pham KHONG BAO GIO tao ra duoc. Mot ban demo nhu vay chung minh dieu
 * nguoc lai voi cai no dinh chung minh.
 *
 * ---------------------------------------------------------------------------
 * CON SO KHONG DUOC NGHI RA O DAY.
 *
 * So khop bang ke di qua `runFuelMatching()`, hoa hong qua `calculateCommission()`, phieu luong
 * qua `calculatePayslip()` — dung nhung ham ma duong chay that goi. Mot ban demo tu tinh lay se
 * bay dung vao luc te nhat: khi khach bam "chay lai doi soat" tren man hinh va con so DOI.
 */

/**
 * NGUOI GHI cua moi dong du lieu mau.
 *
 * Mot ten RIENG chu khong muon `operator`: nhat ky kiem toan cua ban demo phai phan biet duoc
 * "may gieo luc dung stack" voi "nguoi that bam nut trong buoi trinh dien". Gop hai thu lam mot la
 * lam hong dung cai ma buoi trinh dien muon cho xem.
 *
 * Thoa `usernameSchema` (`^[a-z0-9][a-z0-9._-]*$`, 3..64) vi `AuditLog.actor` la mot cot chuoi
 * DUNG CHUNG cho ca nen tang — xem `transport-actor.ts`.
 */
export const DEMO_SEED_ACTOR = 'demo-seed';

/** Mat khau nhan vat mau den tu MOI TRUONG, khong bao gio tu kho ma nguon. */
export const DEMO_DRIVER_PASSWORD_ENV = 'TRANSPORT_DEMO_DRIVER_PASSWORD';

/** Nhan vat van phong — hang so nam o `demo-logins.ts` (tep nhe, mien phan quyen doc duoc). */
export { DEMO_STAFF_PERSONAS } from './demo-logins.js';

export interface DemoSeedOptions {
  /** Ngay nghiep vu lam moc. Mac dinh: hom nay theo mui gio cua goi khach. */
  readonly anchor?: BusinessDate;
  /**
   * Ham bam mat khau. Tiem vao thay vi `import argon2` truc tiep: mot bai test khong can tra gia
   * 100ms moi lan tao mot lai xe gia.
   */
  readonly hashPassword?: (plain: string) => Promise<string>;
  readonly driverPassword?: string | undefined;
  readonly now?: Date;
}

export interface DemoSeedResult {
  readonly skipped: boolean;
  readonly anchor: BusinessDate;
  readonly counts: Readonly<Record<string, number>>;
  /** Loi noi ro tai sao lai xe khong dang nhap duoc — `null` khi da tao du tai khoan. */
  readonly driverLoginNote: string | null;
}

/**
 * Bang van tai theo THU TU XOA AN TOAN — con truoc, cha sau.
 *
 * `TransportPayslipComponent` CO Y VANG MAT khoi danh sach nay, va do khong phai mot thieu sot.
 * `INV-20` duoc cuong che bang hai trigger doc lap: `TransportPayslip_posted_immutable` khong cho
 * mot phieu da chot lui trang thai, con `TransportPayslip_component_frozen` khong cho dong nao
 * cua mot phieu da chot bi ghi HAY XOA. Hai cai do khoa nhau: khong the mo phieu ra de xoa dong,
 * cung khong the xoa dong khi phieu con dong.
 *
 * Loi thoat nam trong chinh trigger: no bo qua khi phieu cha KHONG CON TON TAI. Nen xoa
 * `TransportPayslip` va de rang buoc `onDelete: Cascade` keo cac dong di theo la duong duy nhat
 * KHONG phai go trigger hay vong qua no bang mot cau SQL tho. Them lai dong nay vao danh sach se
 * lam lenh reset chet ngay o phieu luong dau tien.
 */
const TRANSPORT_TABLES_CHILD_FIRST = [
  /**
   * `TX-07b` — PHAI DUNG TRUOC `transportPayslip`.
   *
   * `TransportDriverCashoutAllocation` tro toi CA phieu luong LAN but toan quy, ca hai bang khoa
   * ngoai `Restrict`. Xoa phieu luong truoc se do ngay o
   * `TransportDriverCashoutAllocation_payslipId_fkey`.
   *
   * Ban than bang phan bo KHONG nam trong danh sach nay: mot trigger cam `DELETE` len no, nen no
   * duoc xoa o mot buoc rieng ngay truoc vong lap — xem `wipeFrozenCashoutAllocations()`.
   */
  'transportDriverCashout',
  'transportPayslip',
  'transportPayrollRun',
  'transportPayrollPeriod',
  'transportCommissionCalculation',
  'transportCommissionRuleVersion',
  'transportCommissionRule',
  'transportSettlementAllocation',
  'transportSettlementDocument',
  'transportSettlementPeriod',
  'transportCustomerTerms',
  'transportFuelSettlementHandoff',
  'transportFuelDiscrepancy',
  'transportFuelMatch',
  'transportFuelReconciliation',
  'transportFuelStatementLine',
  'transportFuelSupplierStatement',
  'transportFuelReceiptEvidence',
  'transportFuelEntry',
  'transportFuelSupplier',
  'transportMaintenanceWorkOrder',
  'transportMaintenancePlan',
  'transportComplianceDocument',
  'transportDriverFundPeriodSnapshot',
  'transportDriverFundPeriod',
  'transportTripExpense',
  'transportDriverFundEntry',
  'transportDriverFundAccount',
  'transportTripAssignment',
  /**
   * `#275` Lane K — PHAI DUNG TRUOC `transportTrip`.
   *
   * `TransportTripOrderLink.tripId` la khoa ngoai `Restrict` tro ve chuyen. Duong reset nay xoa
   * CA BANG `transportTrip` (khong `where`), nen mot lien ket con song se chan no lai — va thong
   * diep loi se noi ve mot rang buoc, khong noi ve du lieu mau.
   *
   * GHI NHAN mot truong hop ANH EM VAN CON NGU: `TransportTripRunLegLink` co dung hinh dang do va
   * cung khong nam trong danh sach nay. No chua tung lam do duong reset vi chang/vong chay v2 cung
   * khong bi xoa o day, nen mot lien ket cu chi ton tai khi ai do da chieu mot chuyen MAU — lane
   * nay khong mo rong pham vi de sua mot thu chua hong, chi ghi lai de lan sau khong phai do lai.
   */
  'transportTrip',
  'transportVehicleAssignment',
  'transportCustomer',
  'transportPartnerRole',
  'transportPartner',
  'transportDriver',
  'transportVehicle',
] as const;

const digestOf = (value: string): string =>
  createHash('sha256').update(value).digest('hex').slice(0, 64);

/**
 * TIEN cho mot cot BAT BUOC.
 *
 * `toStoredAmount()` nhan `number | null` va vi the tra `bigint | null` — dung cho cac cot cho
 * phep rong (`creditLimit`, `costAmount`, `unitAmount`), nhung mot cot BAT BUOC nhan no se khong
 * bien dich. Boc lai o day thay vi rai `as bigint` khap noi: mot phep ep kieu se im lang bien
 * `null` thanh mot gia tri hop le voi TypeScript va thanh mot loi rang buoc luc chay.
 */
const amountOf = (value: number): bigint => {
  const stored = toStoredAmount(value);
  /* c8 ignore next -- `toStoredAmount` chi tra `null` khi dau vao la `null`. */
  if (stored === null) throw new Error('So tien bat buoc khong duoc rong');
  return stored;
};

const iso = (date: BusinessDate, hour: number): Date =>
  new Date(`${date}T${String(hour).padStart(2, '0')}:00:00.000Z`);

/**
 * XOA SACH du lieu van tai cua stack dang tro toi.
 *
 * HAI CONG doc lap gac duong nay (`assertDemoResetAllowed`), va no CHI cham cac bang `Transport*`
 * — khong mot bang nao cua mien ban hang, khong `User`, khong `AuditLog`. Mot lenh reset xoa nhieu
 * hon cai no hua la cach nhanh nhat de khong ai dam chay no nua.
 */
/**
 * XOA CAC DONG PHAN BO CHI TIEN — cho DUY NHAT trong ca ma nguon duoc tat mot trigger bat bien.
 *
 * `transport_driver_cashout_allocation_frozen` chan `UPDATE` va `DELETE` len
 * `TransportDriverCashoutAllocation`, va do la CO Y: doi nguon goc mot khoan tien da tra ma khong
 * de lai dau vet se lam lan doi soat sau doc ra mot su that khac han su that da bao (`INV-20`).
 *
 * Nhung trigger do ton tai de chan MA NGHIEP VU, khong phai de lam du lieu demo khong xoa duoc.
 * Ham nay chi chay sau `assertDemoResetAllowed()` — hai cong doc lap da gac o tren — va no tat
 * trigger TRONG DUNG mot giao dich roi bat lai, nen khong co khoanh khac nao ma mot duong ghi khac
 * di qua duoc cua da mo.
 *
 * `ALTER TABLE … DISABLE TRIGGER` nhan khoa `ACCESS EXCLUSIVE`, tuc no doi moi truy van khac tren
 * bang do ket thuc. Voi mot lenh reset demo thi do la dieu dung: khong ai duoc dang doc so trong
 * luc no bi xoa.
 */
async function wipeFrozenCashoutAllocations(prisma: PrismaClient): Promise<number> {
  /**
   * `$transaction([...])` tra ve ket qua theo DUNG thu tu lenh, nen so hang bi xoa la phan tu THU
   * HAI. Lay phan tu dau se luon ra `0` — so hang cua `ALTER TABLE` — mot con so trong y nhu that.
   */
  const [, deleted] = await prisma.$transaction([
    prisma.$executeRawUnsafe(
      'ALTER TABLE "TransportDriverCashoutAllocation" DISABLE TRIGGER "transport_driver_cashout_allocation_frozen"',
    ),
    prisma.$executeRawUnsafe('DELETE FROM "TransportDriverCashoutAllocation"'),
    prisma.$executeRawUnsafe(
      'ALTER TABLE "TransportDriverCashoutAllocation" ENABLE TRIGGER "transport_driver_cashout_allocation_frozen"',
    ),
  ]);
  return deleted ?? 0;
}

/**
 * XOA LICH SU QUYET DINH DOI SOAT NHIEN LIEU — `#317` G0.
 *
 * `transport_fuel_discrepancy_decision_append_only` tu choi moi `DELETE` len mot chenh lech DA
 * QUYET. Tren `transport-preview` nguoi van hanh quyet chenh lech that trong luc chay thu, nen vong
 * lap xoa ben duoi se chet ngay o hang da quyet dau tien neu khong co buoc nay.
 *
 * Cung khuon voi hai ham tren: chi chay sau `assertDemoResetAllowed()`, tat trigger TRONG DUNG mot
 * giao dich roi bat lai, va giao dich chi chua lenh xoa nay.
 */
async function wipeFuelDecisionHistory(prisma: PrismaClient): Promise<number> {
  const [, deleted] = await prisma.$transaction([
    prisma.$executeRawUnsafe('ALTER TABLE "TransportFuelDiscrepancy" DISABLE TRIGGER USER'),
    prisma.$executeRawUnsafe('DELETE FROM "TransportFuelDiscrepancy"'),
    prisma.$executeRawUnsafe('ALTER TABLE "TransportFuelDiscrepancy" ENABLE TRIGGER USER'),
  ]);
  return deleted ?? 0;
}

/**
 * XOA PHAN BO GIA THANH NHIEN LIEU — `#364`.
 *
 * `transport_fuel_cost_attribution_append_only` tu choi moi `DELETE`, va moi dong tro toi mot phieu
 * bang khoa ngoai `Restrict` — nen neu khong co buoc nay, vong lap xoa ben duoi chet ngay o
 * `transportFuelEntry` khi co mot phieu Run-first da phan bo.
 *
 * Cung khuon voi `wipeFuelDecisionHistory()`: chi chay sau `assertDemoResetAllowed()`, tat trigger TRONG
 * DUNG mot giao dich roi bat lai. Dong DAO xoa TRUOC dong cap phat ma no tro toi (`reversalOfId` la
 * khoa ngoai `Restrict`).
 */
async function wipeFuelCostAttributions(prisma: PrismaClient): Promise<number> {
  const [, reversals, allocations] = await prisma.$transaction([
    prisma.$executeRawUnsafe('ALTER TABLE "TransportFuelCostAttribution" DISABLE TRIGGER USER'),
    prisma.$executeRawUnsafe(
      'DELETE FROM "TransportFuelCostAttribution" WHERE "reversalOfId" IS NOT NULL',
    ),
    prisma.$executeRawUnsafe('DELETE FROM "TransportFuelCostAttribution"'),
    prisma.$executeRawUnsafe('ALTER TABLE "TransportFuelCostAttribution" ENABLE TRIGGER USER'),
  ]);
  return (reversals ?? 0) + (allocations ?? 0);
}

/**
 * Xoa lich su Order/doi soat CHI trong reset demo da qua hai cong bao ve.
 *
 * Cac trigger append-only dung de bao ve giao dich that. Reset demo la thao tac pha huy co chu
 * dich, nen tat trigger trong cung mot transaction co khoa bang, xoa con truoc cha sau, roi bat
 * lai. Khong co duong nghiep vu nao goi ham nay.
 */
async function wipeCustomerArDemoHistory(
  prisma: PrismaClient,
): Promise<Readonly<Record<string, number>>> {
  return prisma.$transaction(async (tx) => {
    const triggers = [
      ['TransportCustomerPaymentAllocation', 'transport_customer_payment_allocation_append_only'],
      ['TransportCustomerPayment', 'transport_customer_payment_append_only'],
      ['TransportCustomerReconciliation', 'transport_customer_reconciliation_append_only'],
      ['TransportCustomerReconciliationBatchLine', 'transport_customer_reconciliation_line_guard'],
      ['TransportCustomerReconciliationBatch', 'transport_customer_reconciliation_batch_guard'],
      ['TransportSettlementAllocation', 'transport_customer_legacy_allocation_append_only'],
      ['TransportSettlementDocument', 'transport_customer_receivable_document_guard'],
      ['TransportCommercialAcceptanceDecision', 'transport_commercial_acceptance_append_only'],
    ] as const;
    for (const [table, trigger] of triggers) {
      await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${trigger}"`);
    }

    const customerDocuments = await tx.transportSettlementDocument.findMany({
      where: { flow: 'CUSTOMER_FREIGHT' },
      select: { id: true },
    });
    const documentIds = customerDocuments.map((row) => row.id);
    const results = await Promise.all([
      tx.transportCustomerPaymentAllocation.deleteMany(),
      tx.transportCustomerPayment.deleteMany(),
      tx.transportCustomerReconciliation.deleteMany(),
      tx.transportCustomerReconciliationBatchLine.deleteMany(),
      tx.transportCustomerReconciliationBatch.deleteMany(),
      tx.transportSettlementAllocation.deleteMany({ where: { documentId: { in: documentIds } } }),
    ]);
    const customerSettlementDocuments = await tx.transportSettlementDocument.deleteMany({
      where: { id: { in: documentIds } },
    });
    const acceptanceDecisions = await tx.transportCommercialAcceptanceDecision.deleteMany();
    const acceptances = await tx.transportCommercialAcceptance.deleteMany();
    const tripOrderLinks = await tx.transportTripOrderLink.deleteMany();
    const orders = await tx.transportOrder.deleteMany();

    for (const [table, trigger] of [...triggers].reverse()) {
      await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER "${trigger}"`);
    }
    const keys = [
      'transportCustomerPaymentAllocation',
      'transportCustomerPayment',
      'transportCustomerReconciliation',
      'transportCustomerReconciliationBatchLine',
      'transportCustomerReconciliationBatch',
      'transportSettlementAllocation',
    ] as const;
    const deleted: Record<string, number> = {};
    results.forEach((result, index) => {
      if (result.count > 0) deleted[keys[index]!] = result.count;
    });
    for (const [key, count] of [
      ['transportSettlementDocument', customerSettlementDocuments.count],
      ['transportCommercialAcceptanceDecision', acceptanceDecisions.count],
      ['transportCommercialAcceptance', acceptances.count],
      ['transportTripOrderLink', tripOrderLinks.count],
      ['transportOrder', orders.count],
    ] as const) {
      if (count > 0) deleted[key] = count;
    }
    return deleted;
  });
}

export async function resetTransportDemoData(
  prisma: PrismaClient,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Readonly<Record<string, number>>> {
  assertDemoResetAllowed(env);

  const deleted: Record<string, number> = {};

  const allocations = await wipeFrozenCashoutAllocations(prisma);
  if (allocations > 0) deleted['transportDriverCashoutAllocation'] = allocations;
  Object.assign(deleted, await wipeCustomerArDemoHistory(prisma));
  const fuelDecisions = await wipeFuelDecisionHistory(prisma);
  if (fuelDecisions > 0) deleted['transportFuelDiscrepancy'] = fuelDecisions;
  const fuelCostAttributions = await wipeFuelCostAttributions(prisma);
  if (fuelCostAttributions > 0) deleted['transportFuelCostAttribution'] = fuelCostAttributions;

  for (const table of TRANSPORT_TABLES_CHILD_FIRST) {
    const delegate = prisma[table] as unknown as { deleteMany: () => Promise<{ count: number }> };
    const result = await delegate.deleteMany();
    if (result.count > 0) deleted[table] = result.count;
  }

  /**
   * TAI KHOAN CUA NHAN VAT MAU — xoa THEO TEN DANG NHAP, va CHI ten cua nhan vat mau (`#395`).
   *
   * Truoc `#395` lenh nay xoa MOI tai khoan co ho so lai xe tro toi, voi ly le "chi may gieo moi
   * dat `TransportDriver.authUserId`". Ly le do het dung khi Giam doc noi duoc tai khoan tao tren man
   * hinh quan tri vao ho so lai xe (`PUT /transport/drivers/:driverId/account`): lenh reset ke tiep
   * se XOA CUNG mot tai khoan nguoi that, keo theo quyen rieng (`ON DELETE CASCADE`) va de lai lich
   * su kiem toan tro vao mot nguoi khong con ton tai.
   *
   * Nen tap bi xoa bay gio la mot tap TEN co nguon ro rang: ten dang nhap lai xe cua BO DU LIEU MAU
   * (`loadDemoMonthDataset().drivers[].login` — chinh ten ma lan gieo tao ra) va
   * `DEMO_STAFF_PERSONAS` (hang so cua ma nguon). Mot tai khoan khac dang noi voi mot lai xe mau
   * chi MAT ho so lai xe (bang van tai bi xoa sach o tren), khong mat tai khoan.
   *
   * Xoa theo ten, khong theo soi day `authUserId`: mot nhan vat mau da bi go noi (Giam doc go tren
   * man hinh) van phai bi xoa, neu khong lan gieo lai chet o `User.username @unique` — lenh "xoa va
   * gieo lai" chi chay duoc dung mot lan. Tai khoan van hanh do `bootstrap-auth-user.mjs` tao khong
   * mang ten nao trong tap nay.
   */
  const personaLogins = [
    ...demoDriverLogins(),
    ...DEMO_STAFF_PERSONAS.map((persona) => persona.login),
  ];
  const users = await prisma.user.deleteMany({ where: { username: { in: personaLogins } } });
  if (users.count > 0) deleted['user'] = users.count;

  return deleted;
}

/**
 * Vi sao lan tao bu KHONG noi mot lai xe mau voi tai khoan cua no (`#395`). Moi ma la mot quyet
 * dinh cua NGUOI (Giam doc) hoac mot trang thai ma may gieo khong duoc phep ghi de:
 *
 *   · `DRIVER_UNLINKED_BY_DIRECTOR`  — ho so co dong `transport.driver.account_unlink`: Giam doc da
 *                                      go noi co chu y, lan khoi dong sau khong duoc noi lai;
 *   · `LOGIN_ROLE_NOT_DRIVER`        — tai khoan cung ten khong con vai Lai xe (`SALE`);
 *   · `LOGIN_DISABLED`               — tai khoan cung ten dang bi khoa;
 *   · `LOGIN_LINKED_TO_OTHER_DRIVER` — tai khoan cung ten da noi voi ho so lai xe KHAC (Giam doc
 *                                      chuyen noi) — noi them se chet o `authUserId @unique`.
 */
export const DEMO_LOGIN_SKIP_REASONS = [
  'DRIVER_UNLINKED_BY_DIRECTOR',
  'LOGIN_ROLE_NOT_DRIVER',
  'LOGIN_DISABLED',
  'LOGIN_LINKED_TO_OTHER_DRIVER',
] as const;
export type DemoLoginSkipReason = (typeof DEMO_LOGIN_SKIP_REASONS)[number];

export interface DemoPersonaLoginSkip {
  readonly driverId: string;
  readonly login: string;
  readonly reason: DemoLoginSkipReason;
}

export interface DemoPersonaLoginReport {
  /** So tai khoan da tao + so lai xe da noi. */
  readonly created: number;
  /** Lai xe mau KHONG duoc noi, kem ly do. */
  readonly skipped: readonly DemoPersonaLoginSkip[];
}

/**
 * TAO BU TAI KHOAN DANG NHAP cho cac NHAN VAT MAU chua co tai khoan — lai xe VA nhan vat van phong.
 *
 * ---------------------------------------------------------------------------
 * VI SAO CAN MOT DUONG RIENG, KHONG GOP VAO `seedTransportDemoMonth()`.
 *
 * Lenh gieo TU BO QUA khi DB da co chuyen — dung, va do la thu giu cho mot lan deploy lai khong
 * ghi de len du lieu nguoi ta da sua. Nhung no de ra mot cai bay: gieo mot lan KHONG co
 * `TRANSPORT_DEMO_DRIVER_PASSWORD`, roi dat bien do va deploy lai, thi lan sau cham vao nhanh "bo
 * qua" va tai khoan lai xe KHONG BAO GIO duoc tao — be mat lai xe vinh vien khong ai dang nhap
 * duoc, tru khi xoa sach ca thang du lieu di lam lai.
 *
 * Do la mot ngo cut im lang, cung ho voi cai da gap o vong truoc (o chon cay xang luon rong). Nen
 * duong nay ton tai de "gieo truoc, cau hinh sau" van la mot trinh tu chay duoc.
 *
 * CHI dung vao nhan vat CHUA co tai khoan. Mot lai xe da noi voi mot `User`, hay mot ten dang nhap
 * van phong da ton tai, deu khong bi dung toi — ham nay khong doi mat khau cua ai, cung ly le voi
 * `bootstrap-auth-user.mjs`.
 *
 * Duong nay con phai chay duoc cho mot ban DA GIEO DAY DU lai xe: `DEMO_STAFF_PERSONAS` duoc them
 * SAU khi stack xem truoc da co ca thang du lieu, nen "khong lai xe nao thieu tai khoan" khong
 * duoc phep co nghia la "khong con gi de tao".
 *
 * ---------------------------------------------------------------------------
 * `#395` — MAY GIEO KHONG DUOC LA DUONG NOI TAI KHOAN THU HAI.
 *
 * Buoc nay chay o MOI lan khoi dong stack xem truoc. Truoc `#395` no noi moi lai xe dang trong voi
 * tai khoan cung ten ma khong kiem gi: Giam doc go noi tren man hinh, lan khoi dong sau no noi lai;
 * tai khoan da bi doi sang vai Ke toan hay da bi khoa van duoc noi. Bay gio no chi noi khi luat cua
 * `DriverAccountLinkService` cung cho phep, va noi ro vi sao khi khong noi
 * (`DemoPersonaLoginReport.skipped`). Moi lan noi de lai mot dong `transport.driver.account_link`.
 */
export async function backfillDemoPersonaLoginsReport(
  prisma: PrismaClient,
  options: Pick<DemoSeedOptions, 'driverPassword' | 'hashPassword'> = {},
): Promise<DemoPersonaLoginReport> {
  assertTransportDemoTenant('tao tai khoan dang nhap cho nhan vat mau');

  const password = options.driverPassword ?? process.env[DEMO_DRIVER_PASSWORD_ENV];
  const hashPassword = options.hashPassword;
  if (password === undefined || password === '' || hashPassword === undefined) {
    return { created: 0, skipped: [] };
  }

  let created = 0;

  // NHAN VAT VAN PHONG TRUOC, va khong co dieu kien "co lai xe nao thieu tai khoan khong".
  // Hai nhom doc lap: mot ban gieo tu truoc khi `DEMO_STAFF_PERSONAS` ton tai co du 12 lai xe da
  // co tai khoan, nen mot phep thoat som theo lai xe se lam ke toan KHONG BAO GIO duoc tao — dung
  // hinh dang ngo cut ma ham nay duoc viet ra de dong.
  for (const persona of DEMO_STAFF_PERSONAS) {
    const existing = await prisma.user.findUnique({ where: { username: persona.login } });
    if (existing) continue;
    await prisma.user.create({
      data: {
        username: persona.login,
        name: persona.name,
        passwordHash: await hashPassword(password),
        role: persona.role,
        passwordChangedAt: new Date(),
      },
    });
    created += 1;
  }

  const drivers = await backfillDemoDriverLogins(prisma, password, hashPassword);
  return { created: created + drivers.created, skipped: drivers.skipped };
}

/**
 * Ban chi tra CON SO tai khoan da tao — hop dong cu, giu cho cac bai kiem va cong cu doc so.
 * `seed-transport-demo.mjs` dung `backfillDemoPersonaLoginsReport` de in ca ly do bo qua.
 */
export async function backfillDemoPersonaLogins(
  prisma: PrismaClient,
  options: Pick<DemoSeedOptions, 'driverPassword' | 'hashPassword'> = {},
): Promise<number> {
  return (await backfillDemoPersonaLoginsReport(prisma, options)).created;
}

async function backfillDemoDriverLogins(
  prisma: PrismaClient,
  password: string,
  hashPassword: (plain: string) => Promise<string>,
): Promise<DemoPersonaLoginReport> {
  const pending = await prisma.transportDriver.findMany({
    where: { authUserId: null },
    select: { id: true, fullName: true, phone: true },
  });
  if (pending.length === 0) return { created: 0, skipped: [] };

  /** Khop theo SO DIEN THOAI: ten co dau va co the trung, so dien thoai thi khong. */
  const loginByPhone = new Map(
    loadDemoMonthDataset().drivers.map((driver) => [driver.phone, driver.login]),
  );
  const unlinkedByDirector = await driversUnlinkedByDirector(
    prisma,
    pending.map((driver) => driver.id),
  );

  let created = 0;
  const skipped: DemoPersonaLoginSkip[] = [];
  for (const driver of pending) {
    const login = loginByPhone.get(driver.phone);
    if (login === undefined) continue;

    if (unlinkedByDirector.has(driver.id)) {
      skipped.push({ driverId: driver.id, login, reason: 'DRIVER_UNLINKED_BY_DIRECTOR' });
      continue;
    }
    const existing = await prisma.user.findUnique({ where: { username: login } });
    const refusal = existing ? await refuseExistingLogin(prisma, existing, driver.id) : null;
    if (refusal !== null) {
      skipped.push({ driverId: driver.id, login, reason: refusal });
      continue;
    }

    const user =
      existing ??
      (await prisma.user.create({
        data: {
          username: login,
          name: driver.fullName,
          passwordHash: await hashPassword(password),
          // `GD-22` — cau noi vai: LAI XE anh xa sang `SALE` o tang xac thuc nen tang.
          role: 'SALE',
          passwordChangedAt: new Date(),
        },
      }));
    await prisma.transportDriver.update({
      where: { id: driver.id },
      data: { authUserId: user.id },
    });
    await prisma.auditLog.create({
      data: {
        actor: DEMO_SEED_ACTOR,
        action: 'transport.driver.account_link',
        entityType: 'TransportDriver',
        entityId: driver.id,
        before: { authUserId: null },
        after: { authUserId: user.id },
      },
    });
    created += 1;
  }
  return { created, skipped };
}

/** Ho so lai xe nao da tung bi GO NOI tren man hinh quan tri — MOT truy van cho ca lo. */
async function driversUnlinkedByDirector(
  prisma: PrismaClient,
  driverIds: readonly string[],
): Promise<ReadonlySet<string>> {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: 'transport.driver.account_unlink',
      entityType: 'TransportDriver',
      entityId: { in: [...driverIds] },
    },
    select: { entityId: true },
  });
  return new Set(rows.map((row) => row.entityId).filter((id): id is string => id !== null));
}

/**
 * Cung luat voi `DriverAccountLinkService` cho mot tai khoan DA CO: vai Lai xe, dang hoat dong,
 * chua noi ho so lai xe khac.
 */
async function refuseExistingLogin(
  prisma: PrismaClient,
  user: { readonly id: string; readonly role: string; readonly disabledAt: Date | null },
  driverId: string,
): Promise<DemoLoginSkipReason | null> {
  if (user.role !== 'SALE') return 'LOGIN_ROLE_NOT_DRIVER';
  if (user.disabledAt !== null) return 'LOGIN_DISABLED';
  const holder = await prisma.transportDriver.findUnique({
    where: { authUserId: user.id },
    select: { id: true },
  });
  return holder && holder.id !== driverId ? 'LOGIN_LINKED_TO_OTHER_DRIVER' : null;
}

/**
 * GIEO thang van hanh mau. Bo qua trong im lang neu DB da co chuyen nao — giong het
 * `seed-tenant-knowledge.mjs`: goi khach la HAT GIONG, khong phai nguon su that luc chay, nen mot
 * lan deploy lai khong duoc ghi de len thu nguoi ta da sua tren man hinh.
 */
export async function seedTransportDemoMonth(
  prisma: PrismaClient,
  options: DemoSeedOptions = {},
): Promise<DemoSeedResult> {
  assertTransportDemoTenant('gieo du lieu van tai mau');

  const config = loadTenantConfig();
  const timeZone = config.policies.transportCore?.timeZone ?? 'Asia/Ho_Chi_Minh';
  const anchor = options.anchor ?? toBusinessDate(options.now ?? new Date(), timeZone);

  const existingTrips = await prisma.transportTrip.count();
  if (existingTrips > 0) {
    return {
      skipped: true,
      anchor,
      counts: { transportTrip: existingTrips },
      driverLoginNote: null,
    };
  }

  const dataset = loadDemoMonthDataset();
  const fuelPolicy = config.policies.transportFuel;
  const plan = buildDemoPlan(dataset, {
    anchor,
    consumptionNorms: fuelPolicy?.consumption?.normsByVehicleClass ?? {},
    consumptionTolerancePercent: fuelPolicy?.consumption?.tolerancePercent ?? 0,
  });

  const driverPassword = options.driverPassword ?? process.env[DEMO_DRIVER_PASSWORD_ENV];
  const hashPassword = options.hashPassword;
  const canCreateLogins =
    driverPassword !== undefined && driverPassword !== '' && hashPassword !== undefined;

  const counts = await writePlan(prisma, plan, {
    config,
    columns: fuelPolicy?.statement?.columns ?? {},
    tolerance: {
      amountVnd: fuelPolicy?.matching?.amountToleranceVnd ?? DEFAULT_FUEL_AMOUNT_TOLERANCE_VND,
      businessDateDays:
        fuelPolicy?.matching?.businessDateToleranceDays ??
        DEFAULT_FUEL_BUSINESS_DATE_TOLERANCE_DAYS,
    },
    driverPassword: canCreateLogins ? (driverPassword as string) : null,
    hashPassword: hashPassword ?? (async (plain: string) => plain),
  });

  return {
    skipped: false,
    anchor,
    counts,
    driverLoginNote: canCreateLogins
      ? null
      : `Khong tao tai khoan dang nhap cho lai xe: thieu ${DEMO_DRIVER_PASSWORD_ENV}. ` +
        'Du lieu van tai van day du; rieng be mat lai xe chua co ai dang nhap duoc.',
  };
}

interface WriteContext {
  readonly config: ReturnType<typeof loadTenantConfig>;
  readonly columns: Readonly<Record<string, string | undefined>>;
  readonly tolerance: { readonly amountVnd: number; readonly businessDateDays: number };
  readonly driverPassword: string | null;
  readonly hashPassword: (plain: string) => Promise<string>;
}

async function writePlan(
  prisma: PrismaClient,
  plan: DemoPlan,
  context: WriteContext,
): Promise<Readonly<Record<string, number>>> {
  const counts: Record<string, number> = {};
  const bump = (key: string, by = 1): void => {
    counts[key] = (counts[key] ?? 0) + by;
  };

  /**
   * MOT GIAO DICH DUY NHAT, va han thoi gian duoc nang len co chu dich.
   *
   * Han mac dinh cua Prisma (5 giay) khong du cho vai tram lenh ghi, va mot lan gieo chet giua
   * chung la ket cuc TE NHAT co the co: lan chay sau thay `transportTrip.count() > 0` roi bo qua,
   * de lai mot thang van hanh cut duoi ma khong dau hieu nao. "Gieo tron ven hoac khong gieo gi"
   * phai la mot lua chon nhi phan.
   */
  return prisma.$transaction(
    async (tx) => {
      const vehicleId = new Map<string, string>();
      for (const vehicle of plan.vehicles) {
        const row = await tx.transportVehicle.create({
          data: {
            registrationPlate: vehicle.registrationPlate,
            vehicleClass: vehicle.vehicleClass,
            allowedPayloadKg: vehicle.allowedPayloadKg,
            currentOdoKm: vehicle.currentOdoKm,
            status: 'IDLE',
          },
        });
        vehicleId.set(vehicle.ref, row.id);
        bump('vehicles');
      }

      // NHAN VAT VAN PHONG: chi la mot hang `User`, khong co thuc the van tai nao tro toi.
      if (context.driverPassword !== null) {
        for (const persona of DEMO_STAFF_PERSONAS) {
          await tx.user.create({
            data: {
              username: persona.login,
              name: persona.name,
              passwordHash: await context.hashPassword(context.driverPassword),
              role: persona.role,
              passwordChangedAt: new Date(),
            },
          });
          bump('staffLogins');
        }
      }

      const driverId = new Map<string, string>();
      const driverUsername = new Map<string, string>();
      for (const driver of plan.drivers) {
        let authUserId: string | null = null;
        if (context.driverPassword !== null) {
          const user = await tx.user.create({
            data: {
              username: driver.login,
              name: driver.fullName,
              passwordHash: await context.hashPassword(context.driverPassword),
              // `GD-22` — cau noi vai: LAI XE anh xa sang `SALE` o tang xac thuc nen tang.
              role: 'SALE',
              passwordChangedAt: new Date(),
            },
          });
          authUserId = user.id;
          bump('driverLogins');
        }

        const row = await tx.transportDriver.create({
          data: {
            fullName: driver.fullName,
            phone: driver.phone,
            licenceClass: driver.licenceClass,
            licenceExpiry: driver.licenceExpiry,
            status: 'ACTIVE',
            authUserId,
          },
        });
        driverId.set(driver.ref, row.id);
        driverUsername.set(driver.ref, driver.login);
        bump('drivers');

        if (driver.vehicleRef !== null) {
          await tx.transportVehicleAssignment.create({
            data: {
              vehicleId: vehicleId.get(driver.vehicleRef) as string,
              driverId: row.id,
              effectiveFrom: iso(plan.anchor, 0),
              effectiveTo: null,
            },
          });
          bump('vehicleAssignments');
        }
      }

      const customerId = new Map<string, string>();
      for (const customer of plan.customers) {
        const row = await tx.transportCustomer.create({
          data: {
            name: customer.name,
            phone: customer.phone,
            address: customer.address,
            taxCode: customer.taxCode,
            status: 'ACTIVE',
            terms: {
              create: {
                paymentTermDays: customer.paymentTermDays,
                creditLimit: toStoredAmount(customer.creditLimit),
                updatedBy: DEMO_SEED_ACTOR,
              },
            },
          },
        });
        customerId.set(customer.ref, row.id);
        bump('customers');
        bump('customerTerms');
      }

      const supplierId = new Map<string, string>();
      for (const supplier of plan.suppliers) {
        const row = await tx.transportFuelSupplier.create({
          data: {
            name: supplier.name,
            code: supplier.code,
            phone: supplier.phone,
            address: supplier.address,
            taxCode: supplier.taxCode,
            status: 'ACTIVE',
          },
        });
        supplierId.set(supplier.ref, row.id);
        bump('fuelSuppliers');
      }

      const partnerId = new Map<string, string>();
      for (const partner of plan.partners) {
        const row = await tx.transportPartner.create({
          data: {
            name: partner.name,
            phone: partner.phone,
            status: 'ACTIVE',
            roles: { create: partner.roles.map((role) => ({ role })) },
          },
        });
        partnerId.set(partner.ref, row.id);
        bump('partners');
        bump('partnerRoles', partner.roles.length);
      }

      /** Luat hoa hong: mot `Rule` + mot `Version` phat hanh — dung hinh dang ma T5 doc. */
      const ruleVersionByPartner = new Map<
        string,
        {
          readonly id: string;
          readonly calcKind: 'PERCENTAGE' | 'FIXED';
          readonly rateBasisPoints: number | null;
          readonly fixedAmount: number | null;
        }
      >();
      for (const rule of plan.commissionRules) {
        const row = await tx.transportCommissionRule.create({
          data: {
            partnerId: partnerId.get(rule.partnerRef) as string,
            status: 'ACTIVE',
            createdBy: DEMO_SEED_ACTOR,
            versions: {
              create: {
                version: 1,
                calcKind: rule.calcKind,
                rateBasisPoints: rule.rateBasisPoints,
                fixedAmount: toStoredAmount(rule.fixedAmount),
                effectiveFrom: rule.effectiveFrom,
                publishedBy: DEMO_SEED_ACTOR,
              },
            },
          },
          include: { versions: true },
        });
        const version = row.versions[0];
        /* c8 ignore next -- vua tao dung mot ban ngay tren. */
        if (version === undefined) throw new Error('Khong tao duoc ban luat hoa hong');
        ruleVersionByPartner.set(rule.partnerRef, {
          id: version.id,
          calcKind: rule.calcKind,
          rateBasisPoints: rule.rateBasisPoints,
          fixedAmount: rule.fixedAmount,
        });
        bump('commissionRules');
      }

      // ---------------------------------------------------------------------
      // CHUYEN + QUY LAI XE + PHIEU DAU
      // ---------------------------------------------------------------------

      const fundAccountId = new Map<string, string>();
      const ensureFund = async (ref: string): Promise<string> => {
        const cached = fundAccountId.get(ref);
        if (cached !== undefined) return cached;
        const row = await tx.transportDriverFundAccount.create({
          data: { driverId: driverId.get(ref) as string },
        });
        fundAccountId.set(ref, row.id);
        bump('fundAccounts');
        return row.id;
      };

      const tripId = new Map<string, string>();
      const statementLineId = new Map<string, string>();

      for (const trip of plan.trips) {
        const row = await tx.transportTrip.create({
          data: {
            code: trip.code,
            kind: trip.kind,
            status: trip.status,
            businessDate: trip.businessDate,
            originLabel: trip.originLabel,
            destinationLabel: trip.destinationLabel,
            cargoDescription: trip.cargoDescription,
            distanceKm: trip.distanceKm,
            freightAmount: toStoredAmount(trip.freightAmount),
            customerId: customerId.get(trip.customerRef) as string,
            carrierPartnerId:
              trip.carrierRef === null ? null : (partnerId.get(trip.carrierRef) as string),
            referrerPartnerId:
              trip.referrerRef === null ? null : (partnerId.get(trip.referrerRef) as string),
          },
        });
        tripId.set(trip.code, row.id);
        bump('trips');

        if (trip.vehicleRef !== null || trip.driverRef !== null) {
          await tx.transportTripAssignment.create({
            data: {
              tripId: row.id,
              vehicleId:
                trip.vehicleRef === null ? null : (vehicleId.get(trip.vehicleRef) as string),
              driverId: trip.driverRef === null ? null : (driverId.get(trip.driverRef) as string),
              effectiveFrom: iso(trip.businessDate, 6),
              effectiveTo: null,
              assignedBy: DEMO_SEED_ACTOR,
            },
          });
          bump('tripAssignments');
        }

        if (trip.driverRef === null) continue;
        const accountId = await ensureFund(trip.driverRef);

        if (trip.advance > 0) {
          await tx.transportDriverFundEntry.create({
            data: {
              accountId,
              kind: 'ADVANCE',
              signedAmount: amountOf(trip.advance),
              businessDate: trip.businessDate,
              tripId: row.id,
              correlationKey: `demo:advance:${trip.code}`,
              note: 'Tạm ứng chuyến',
              recordedBy: DEMO_SEED_ACTOR,
            },
          });
          bump('fundEntries');
        }

        if (trip.returned > 0) {
          await tx.transportDriverFundEntry.create({
            data: {
              accountId,
              kind: 'RETURN',
              signedAmount: amountOf(-trip.returned),
              businessDate: trip.businessDate,
              tripId: row.id,
              correlationKey: `demo:return:${trip.code}`,
              note: 'Hoàn tạm ứng còn thừa',
              recordedBy: DEMO_SEED_ACTOR,
            },
          });
          bump('fundEntries');
        }

        for (const [index, expense] of trip.expenses.entries()) {
          const key = `demo:expense:${trip.code}:${index + 1}`;
          let fundEntryRowId: string | null = null;
          if (expense.fundedBy === 'DRIVER_FUND') {
            const entry = await tx.transportDriverFundEntry.create({
              data: {
                accountId,
                kind: 'TRIP_EXPENSE',
                signedAmount: amountOf(-expense.amount),
                businessDate: trip.businessDate,
                tripId: row.id,
                correlationKey: `${key}:fund`,
                note: expense.categoryCode,
                recordedBy: DEMO_SEED_ACTOR,
              },
            });
            fundEntryRowId = entry.id;
            bump('fundEntries');
          }

          await tx.transportTripExpense.create({
            data: {
              tripId: row.id,
              kind: 'EXPENSE',
              categoryCode: expense.categoryCode,
              signedAmount: amountOf(expense.amount),
              businessDate: trip.businessDate,
              fundedBy: expense.fundedBy,
              driverFundEntryId: fundEntryRowId,
              driverId: driverId.get(trip.driverRef) as string,
              correlationKey: key,
              recordedBy: DEMO_SEED_ACTOR,
            },
          });
          bump('tripExpenses');
        }

        for (const fuel of trip.fuelEntries) {
          /**
           * PHIEU CO LY DO CAN KIEM TRA thi GIU O `DECLARED`.
           *
           * Duyet mot phieu ma chinh he thong vua danh dau la bat thuong se lam man hinh "phieu can
           * kiem tra" cua ban demo trong rong — tuc giau di dung cai viec ma ke toan lam hang ngay.
           */
          const needsReview = fuel.reviewReasons.length > 0;
          const verified = !needsReview && trip.status === 'RECONCILED';
          const paymentMethod = fuel.odometerKm % 2 === 0 ? 'DRIVER_CASH' : 'SUPPLIER_ACCOUNT';

          const entry = await tx.transportFuelEntry.create({
            data: {
              tripId: row.id,
              vehicleId: vehicleId.get(trip.vehicleRef as string) as string,
              driverId: driverId.get(trip.driverRef) as string,
              supplierId: supplierId.get(fuel.supplierRef) as string,
              businessDate: trip.businessDate,
              occurredAt: iso(trip.businessDate, 9),
              liters: formatLiters(fuel.litersUnits),
              amount: amountOf(fuel.amount),
              odometerKm: fuel.odometerKm,
              previousOdometerKm: fuel.previousOdometerKm,
              consumptionL100km:
                fuel.consumptionUnits === null ? null : formatConsumption(fuel.consumptionUnits),
              reviewReasons: [...fuel.reviewReasons],
              paymentMethod,
              verificationStatus: verified ? 'VERIFIED' : 'DECLARED',
              reconciliationStatus: 'UNMATCHED',
              correlationKey: `demo:${fuel.key}`,
              invoiceNo: fuel.invoiceNo,
              declaredBy: driverUsername.get(trip.driverRef) ?? DEMO_SEED_ACTOR,
              verifiedAt: verified ? iso(trip.businessDate, 17) : null,
              verifiedBy: verified ? DEMO_SEED_ACTOR : null,
              evidence: {
                create: {
                  locator: `demo/fuel/${fuel.key}.jpg`,
                  contentType: 'image/jpeg',
                  byteSize: 148_000,
                  capturedAt: iso(trip.businessDate, 9),
                  uploadedBy: driverUsername.get(trip.driverRef) ?? DEMO_SEED_ACTOR,
                },
              },
            },
          });
          bump('fuelEntries');
          bump('fuelEvidence');

          /**
           * PHIEU DA DUYET + LAI XE TRA TIEN MAT => mot khoan chi cua chuyen, tru vao quy lai xe.
           *
           * Do dung la thu `FuelService` lam khi ke toan bam "xac thuc", va bo qua no se lam so du
           * quy cua lai xe cao hon thuc te dung bang so tien dau ho da ung ra.
           */
          if (verified && paymentMethod === 'DRIVER_CASH') {
            const fundEntry = await tx.transportDriverFundEntry.create({
              data: {
                accountId,
                kind: 'TRIP_EXPENSE',
                signedAmount: amountOf(-fuel.amount),
                businessDate: trip.businessDate,
                tripId: row.id,
                correlationKey: `demo:fuel-fund:${fuel.key}`,
                note: 'Tiền dầu',
                recordedBy: DEMO_SEED_ACTOR,
              },
            });
            const expense = await tx.transportTripExpense.create({
              data: {
                tripId: row.id,
                kind: 'EXPENSE',
                categoryCode: 'FUEL',
                signedAmount: amountOf(fuel.amount),
                businessDate: trip.businessDate,
                fundedBy: 'DRIVER_FUND',
                driverFundEntryId: fundEntry.id,
                driverId: driverId.get(trip.driverRef) as string,
                correlationKey: `demo:fuel-expense:${fuel.key}`,
                evidenceLocator: `demo/fuel/${fuel.key}.jpg`,
                recordedBy: DEMO_SEED_ACTOR,
              },
            });
            await tx.transportFuelEntry.update({
              where: { id: entry.id },
              data: { costExpenseId: expense.id },
            });
            bump('fundEntries');
            bump('tripExpenses');
          }
        }
      }

      // ---------------------------------------------------------------------
      // BANG KE + DOI SOAT — con so do `runFuelMatching()` quyet, khong do day.
      // ---------------------------------------------------------------------

      for (const statement of plan.statements) {
        const rows = statement.lines;
        const created = await tx.transportFuelSupplierStatement.create({
          data: {
            supplierId: supplierId.get(statement.supplierRef) as string,
            periodStart: statement.periodStart,
            periodEnd: statement.periodEnd,
            format: 'CSV',
            sourceRef: statement.sourceRef,
            sourceDigest: digestOf(statement.sourceRef),
            rowCount: rows.length,
            acceptedCount: rows.length,
            rejectedCount: 0,
            importedBy: DEMO_SEED_ACTOR,
          },
        });
        bump('statements');

        for (const line of rows) {
          const createdLine = await tx.transportFuelStatementLine.create({
            data: {
              statementId: created.id,
              rowNumber: line.rowNumber,
              status: 'ACCEPTED',
              vehiclePlateRaw: line.vehiclePlateRaw,
              vehicleId: vehicleId.get(line.vehicleRef) as string,
              businessDate: line.businessDate,
              liters: formatLiters(line.litersUnits),
              amount: toStoredAmount(line.amount),
              invoiceNo: line.invoiceNo,
              rawValues: {
                [context.columns.vehiclePlate ?? 'vehiclePlate']: line.vehiclePlateRaw,
                [context.columns.businessDate ?? 'businessDate']: line.businessDate,
                [context.columns.liters ?? 'liters']: formatLiters(line.litersUnits),
                [context.columns.amount ?? 'amount']: String(line.amount),
                [context.columns.invoiceNo ?? 'invoiceNo']: line.invoiceNo,
              },
              reconciliationStatus: 'UNMATCHED',
            },
          });
          statementLineId.set(line.key, createdLine.id);
          bump('statementLines');
        }

        const reconciliation = await tx.transportFuelReconciliation.create({
          data: {
            supplierId: supplierId.get(statement.supplierRef) as string,
            statementId: created.id,
            periodStart: statement.periodStart,
            periodEnd: statement.periodEnd,
            state: 'MATCHING',
            lastMatchedAt: iso(statement.periodEnd, 18),
          },
        });
        bump('reconciliations');

        const matchableLines: MatchableStatementLine[] = rows.map((line) => ({
          id: statementLineId.get(line.key) as string,
          statementId: created.id,
          vehicleId: vehicleId.get(line.vehicleRef) as string,
          businessDate: line.businessDate,
          amount: line.amount,
          invoiceNo: line.invoiceNo,
          reconciliationStatus: 'UNMATCHED',
        }));

        const supplierEntries = await tx.transportFuelEntry.findMany({
          where: {
            supplierId: supplierId.get(statement.supplierRef) as string,
            businessDate: { gte: statement.periodStart, lte: statement.periodEnd },
          },
          select: {
            id: true,
            vehicleId: true,
            businessDate: true,
            amount: true,
            invoiceNo: true,
            sourceStatementId: true,
            paymentMethod: true,
          },
        });
        const matchableEntries: MatchableFuelEntry[] = supplierEntries.map((entry) => ({
          id: entry.id,
          vehicleId: entry.vehicleId,
          businessDate: entry.businessDate,
          amount: Number(entry.amount),
          invoiceNo: entry.invoiceNo,
          sourceStatementId: entry.sourceStatementId,
          // `#371` — cung luat voi san pham: phieu lai xe tra tien mat khong bao gio khop bang ke
          // cong no. Ban gieo KHONG duoc de ra mot cap khop ma `FuelReconciliationService` tu choi
          // (trigger `TransportFuelMatch_payable_entry_only` se lam lenh gieo chet neu quen).
          paymentMethod: entry.paymentMethod,
          reconciliationStatus: 'UNMATCHED',
        }));

        const outcome = runFuelMatching({
          statementId: created.id,
          lines: matchableLines,
          entries: matchableEntries,
          tolerance: context.tolerance,
        });

        for (const match of outcome.matches) {
          await tx.transportFuelMatch.create({
            data: {
              reconciliationId: reconciliation.id,
              statementLineId: match.statementLineId,
              fuelEntryId: match.fuelEntryId,
              amountDeltaVnd: amountOf(match.amountDeltaVnd),
              businessDateDeltaDays: match.businessDateDeltaDays,
              origin: 'AUTO',
              matchedBy: DEMO_SEED_ACTOR,
            },
          });
          await tx.transportFuelEntry.update({
            where: { id: match.fuelEntryId },
            data: { reconciliationStatus: 'MATCHED' },
          });
          await tx.transportFuelStatementLine.update({
            where: { id: match.statementLineId },
            data: { reconciliationStatus: 'MATCHED' },
          });
          bump('fuelMatches');
        }

        for (const discrepancy of outcome.discrepancies) {
          await tx.transportFuelDiscrepancy.create({
            data: {
              reconciliationId: reconciliation.id,
              kind: discrepancy.kind,
              status: 'PENDING',
              statementLineId: discrepancy.statementLineId,
              fuelEntryId: discrepancy.fuelEntryId,
              candidateEntryIds: [...discrepancy.candidateEntryIds],
              candidateLineIds: [...discrepancy.candidateLineIds],
            },
          });
          if (discrepancy.fuelEntryId !== null) {
            await tx.transportFuelEntry.update({
              where: { id: discrepancy.fuelEntryId },
              data: { reconciliationStatus: 'MISMATCHED' },
            });
          }
          if (discrepancy.statementLineId !== null) {
            await tx.transportFuelStatementLine.update({
              where: { id: discrepancy.statementLineId },
              data: { reconciliationStatus: 'MISMATCHED' },
            });
          }
          bump('fuelDiscrepancies');
        }
      }

      // ---------------------------------------------------------------------
      // QUYET TOAN — doanh thu khach, cong no nha xe, hoa hong doi tac.
      // ---------------------------------------------------------------------

      const postDocument = async (input: {
        direction: 'RECEIVABLE' | 'PAYABLE';
        flow: 'CUSTOMER_FREIGHT' | 'CARRIER_SERVICE' | 'PARTNER_COMMISSION';
        counterpartyKind: 'CUSTOMER' | 'PARTNER';
        counterpartyId: string;
        signedAmount: number;
        businessDate: BusinessDate;
        dueDate: BusinessDate | null;
        tripId: string;
        sourceContext: string;
        sourceId: string;
      }): Promise<string> => {
        const identity = {
          direction: input.direction,
          flow: input.flow,
          counterpartyKind: input.counterpartyKind,
          counterpartyId: input.counterpartyId,
          kind: 'ORIGINAL' as const,
          signedAmount: input.signedAmount,
          currencyCode: 'VND' as const,
          businessDate: input.businessDate,
          dueDate: input.dueDate,
          tripId: input.tripId,
          adjustsId: null,
        };
        const created = await tx.transportSettlementDocument.create({
          data: {
            direction: input.direction,
            flow: input.flow,
            counterpartyKind: input.counterpartyKind,
            counterpartyId: input.counterpartyId,
            kind: 'ORIGINAL',
            status: 'POSTED',
            signedAmount: amountOf(input.signedAmount),
            businessDate: input.businessDate,
            dueDate: input.dueDate,
            tripId: input.tripId,
            sourceContext: input.sourceContext,
            sourceId: input.sourceId,
            sourceFingerprint: settlementDocumentFingerprint(identity),
            recordedBy: DEMO_SEED_ACTOR,
          },
        });
        bump('settlementDocuments');
        return created.id;
      };

      for (const trip of plan.trips) {
        if (trip.receivable === null) continue;
        const id = tripId.get(trip.code) as string;
        const customer = customerId.get(trip.customerRef) as string;
        const order = await tx.transportOrder.create({
          data: {
            code: `DEMO-AR-${trip.code}`,
            status: 'FULFILLED',
            businessDate: trip.businessDate,
            customerId: customer,
            originLabel: trip.originLabel,
            destinationLabel: trip.destinationLabel,
            cargoDescription: trip.cargoDescription,
            freightAmount: amountOf(trip.freightAmount),
            currencyCode: 'VND',
            note: 'Đơn mẫu đã hoàn tất, chờ/đã được A đối soát',
          },
        });
        bump('orders');
        await tx.transportTripOrderLink.create({
          data: { tripId: id, orderId: order.id, projectedBy: DEMO_SEED_ACTOR },
        });
        bump('tripOrderLinks');

        const acceptance = await tx.transportCommercialAcceptance.create({
          data: {
            orderId: order.id,
            state: 'APPROVED',
            businessDate: trip.businessDate,
            openedBy: DEMO_SEED_ACTOR,
          },
        });
        const decision = await tx.transportCommercialAcceptanceDecision.create({
          data: {
            acceptanceId: acceptance.id,
            sequence: 1,
            outcome: 'APPROVED',
            reasonCode: 'DEMO_DELIVERY_ACCEPTED',
            basis: 'EXTERNAL_PHYSICAL_CONFIRMATION',
            evidenceRefs: [],
            externalNote: 'Bên A đã xác nhận giao nhận trong dữ liệu mẫu',
            supersedesId: null,
            idempotencyKey: `demo:acceptance:${trip.code}`,
            decidedBy: DEMO_SEED_ACTOR,
            decidedAt: iso(trip.businessDate, 17),
          },
        });
        await tx.transportCommercialAcceptance.update({
          where: { id: acceptance.id },
          data: { latestDecisionId: decision.id },
        });
        bump('commercialAcceptances');
        bump('commercialAcceptanceDecisions');

        const documentIdentity = {
          direction: 'RECEIVABLE' as const,
          flow: 'CUSTOMER_FREIGHT' as const,
          counterpartyKind: 'CUSTOMER' as const,
          counterpartyId: customer,
          kind: 'ORIGINAL' as const,
          signedAmount: trip.freightAmount,
          currencyCode: 'VND' as const,
          businessDate: trip.businessDate,
          dueDate: trip.dueDate,
          tripId: id,
          adjustsId: null,
        };
        const receivable = await tx.transportSettlementDocument.create({
          data: {
            ...documentIdentity,
            status: 'POSTED',
            signedAmount: amountOf(trip.freightAmount),
            sourceContext: 'CUSTOMER_RECONCILIATION',
            sourceId: order.id,
            sourceFingerprint: settlementDocumentFingerprint(documentIdentity),
            invoiceRef: null,
            note: null,
            recordedBy: DEMO_SEED_ACTOR,
          },
        });
        bump('settlementDocuments');
        const reconciliationIdentity = {
          orderId: order.id,
          batchLineId: null,
          proposedAmount: trip.freightAmount,
          confirmedAmount: trip.freightAmount,
          currencyCode: 'VND',
          businessDate: trip.businessDate,
          differenceReason: null,
          confirmationReference: `DEMO-A-${trip.code}`,
          evidenceRefs: [] as readonly string[],
        };
        await tx.transportCustomerReconciliation.create({
          data: {
            orderId: order.id,
            customerId: customer,
            batchLineId: null,
            proposedAmount: amountOf(trip.freightAmount),
            confirmedAmount: amountOf(trip.freightAmount),
            differenceAmount: 0n,
            currencyCode: 'VND',
            businessDate: trip.businessDate,
            dueDate: trip.dueDate,
            differenceReason: null,
            confirmationReference: reconciliationIdentity.confirmationReference,
            evidenceRefs: [],
            sourceContext: 'CUSTOMER_RECONCILIATION',
            sourceId: `demo:customer-reconciliation:${trip.code}`,
            sourceFingerprint: customerReconciliationFingerprint(reconciliationIdentity),
            confirmedBy: DEMO_SEED_ACTOR,
            confirmedAt: iso(trip.businessDate, 18),
            settlementDocumentId: receivable.id,
          },
        });
        bump('customerReconciliations');

        if (trip.receivable === 'PAID') {
          await tx.transportSettlementAllocation.create({
            data: {
              documentId: receivable.id,
              amount: amountOf(trip.freightAmount),
              businessDate: trip.dueDate ?? trip.businessDate,
              method: 'Chuyển khoản',
              sourceContext: 'MANUAL_ADJUSTMENT',
              sourceId: `demo:thu-tien:${trip.code}`,
              recordedBy: DEMO_SEED_ACTOR,
            },
          });
          bump('settlementAllocations');
        }

        if (trip.carrierRef !== null && trip.carrierCost !== null) {
          await postDocument({
            direction: 'PAYABLE',
            flow: 'CARRIER_SERVICE',
            counterpartyKind: 'PARTNER',
            counterpartyId: partnerId.get(trip.carrierRef) as string,
            signedAmount: trip.carrierCost,
            businessDate: trip.businessDate,
            dueDate: trip.dueDate,
            tripId: id,
            sourceContext: 'TRIP_CARRIER_COST',
            sourceId: id,
          });
        }

        const rule =
          trip.referrerRef === null ? undefined : ruleVersionByPartner.get(trip.referrerRef);
        if (trip.referrerRef !== null && rule !== undefined) {
          const amount = calculateCommission(
            {
              calcKind: rule.calcKind,
              rateBasisPoints: rule.rateBasisPoints,
              fixedAmount: rule.fixedAmount,
            },
            trip.freightAmount,
          );
          const documentId = await postDocument({
            direction: 'PAYABLE',
            flow: 'PARTNER_COMMISSION',
            counterpartyKind: 'PARTNER',
            counterpartyId: partnerId.get(trip.referrerRef) as string,
            signedAmount: amount.resultAmount,
            businessDate: trip.businessDate,
            dueDate: trip.dueDate,
            tripId: id,
            sourceContext: 'TRIP_COMMISSION',
            sourceId: id,
          });
          await tx.transportCommissionCalculation.create({
            data: {
              tripId: id,
              ruleVersionId: rule.id,
              ruleScopeSnapshot: 'PARTNER',
              calcKindSnapshot: rule.calcKind,
              rateBasisPointsSnapshot: rule.rateBasisPoints,
              fixedAmountSnapshot: toStoredAmount(rule.fixedAmount),
              basisAmount: amountOf(trip.freightAmount),
              rawAmount: amount.rawAmount,
              resultAmount: amountOf(amount.resultAmount),
              documentId,
              partnerId: partnerId.get(trip.referrerRef) as string,
              businessDate: trip.businessDate,
            },
          });
          bump('commissionCalculations');
        }
      }

      // ---------------------------------------------------------------------
      // TAI SAN + GIAY TO
      // ---------------------------------------------------------------------

      const planId = new Map<string, string>();
      for (const maintenance of plan.maintenancePlans) {
        const row = await tx.transportMaintenancePlan.create({
          data: {
            vehicleId: vehicleId.get(maintenance.vehicleRef) as string,
            name: maintenance.name,
            triggerKind: maintenance.triggerKind,
            intervalKm: maintenance.intervalKm,
            intervalDays: maintenance.intervalDays,
            baselineOdoKm: maintenance.baselineOdoKm,
            baselineDate: maintenance.baselineDate,
            status: 'ACTIVE',
            createdBy: DEMO_SEED_ACTOR,
          },
        });
        planId.set(maintenance.ref, row.id);
        bump('maintenancePlans');
      }

      for (const order of plan.workOrders) {
        await tx.transportMaintenanceWorkOrder.create({
          data: {
            vehicleId: vehicleId.get(order.vehicleRef) as string,
            planId: order.planRef === null ? null : (planId.get(order.planRef) as string),
            /**
             * `TX-06b` — BAN CHAT SUY TU KE HOACH, dung mot luat voi kho that
             * (`prisma-asset-compliance.repository.ts`): co `planId` la bao duong theo lich, khong
             * co la sua chua.
             *
             * Cot `kind` co `DEFAULT 'REPAIR'` de mot migration khong phai doan ban chat cua du
             * lieu cu, nhung mac dinh do KHONG dung cho mot lenh CO ke hoach — va
             * `..._kind_plan_shape` la mot bien dieu kien, nen no tu choi ngay. Duong gieo nay ghi
             * THANG vao bang, khong qua kho, nen luat phai duoc nhac lai o day.
             */
            kind: order.planRef === null ? 'REPAIR' : 'SCHEDULED_SERVICE',
            status: order.status,
            description: order.description,
            openedDate: order.openedDate,
            openedOdoKm: order.openedOdoKm,
            openedBy: DEMO_SEED_ACTOR,
            openedAt: iso(order.openedDate, 8),
            completedDate: order.completedDate,
            completedOdoKm: order.completedOdoKm,
            completedBy: order.completedDate === null ? null : DEMO_SEED_ACTOR,
            completedAt: order.completedDate === null ? null : iso(order.completedDate, 16),
            costAmount: toStoredAmount(order.costAmount),
          },
        });
        bump('workOrders');
      }

      for (const doc of plan.complianceDocuments) {
        const subjectId =
          doc.subjectRef === null
            ? null
            : doc.subjectKind === 'VEHICLE'
              ? (vehicleId.get(doc.subjectRef) as string)
              : (driverId.get(doc.subjectRef) as string);
        await tx.transportComplianceDocument.create({
          data: {
            subjectKind: doc.subjectKind,
            subjectId,
            documentType: doc.documentType as never,
            documentNo: doc.documentNo,
            validFrom: doc.validFrom,
            validTo: doc.validTo,
            status: 'ACTIVE',
            recordedBy: DEMO_SEED_ACTOR,
          },
        });
        bump('complianceDocuments');
      }

      // ---------------------------------------------------------------------
      // LUONG — tong hop THEO DUNG LUAT ma `WorkforceCoreFactsAdapter.workByDriver()` dung:
      // chuyen `DELIVERED`/`RECONCILED` trong ky, noi qua ban phan cong DANG hieu luc.
      // ---------------------------------------------------------------------

      const { payroll } = plan;
      const period = await tx.transportPayrollPeriod.create({
        data: {
          label: payroll.label,
          startDate: payroll.startDate,
          endDate: payroll.endDate,
          status: 'OPEN',
          createdBy: DEMO_SEED_ACTOR,
        },
      });
      bump('payrollPeriods');

      const policy = {
        baseSalaryVnd: context.config.policies.transportPayroll?.baseSalaryVnd ?? 0,
        perTripVnd: context.config.policies.transportPayroll?.perTripVnd ?? 0,
        perKmVnd: context.config.policies.transportPayroll?.perKmVnd ?? 0,
        fuelSavingBonusVndPerLiter:
          context.config.policies.transportPayroll?.fuelSavingBonusVndPerLiter ?? 0,
      };

      const run = await tx.transportPayrollRun.create({
        data: {
          periodId: period.id,
          sequence: 1,
          policySnapshot: policy,
          policyVersion: payrollPolicyVersion(policy),
          /**
           * `FUEL_SAVING_UNAVAILABLE` KHONG phai mot thieu sot cua ban demo.
           *
           * `WorkforceFuelFacts` co y khong duoc dang ky o dau ca (xem
           * `transport-workforce.module.ts`), nen mot lan chay luong THAT tren stack nay cung ghi
           * dung dong nay. Bo no di se lam phieu luong cua ban demo trong "day du" hon phieu ma
           * san pham thuc su tao ra.
           */
          missingInputs: ['FUEL_SAVING_UNAVAILABLE'],
          runBy: DEMO_SEED_ACTOR,
        },
      });
      bump('payrollRuns');

      const work = new Map<string, { tripCount: number; distanceKm: number }>();
      for (const trip of plan.trips) {
        if (trip.driverRef === null) continue;
        if (trip.status !== 'DELIVERED' && trip.status !== 'RECONCILED') continue;
        if (trip.businessDate < payroll.startDate || trip.businessDate > payroll.endDate) continue;
        const current = work.get(trip.driverRef) ?? { tripCount: 0, distanceKm: 0 };
        work.set(trip.driverRef, {
          tripCount: current.tripCount + 1,
          distanceKm: current.distanceKm + trip.distanceKm,
        });
      }

      const manualByDriver = new Map<string, typeof payroll.manualComponents>();
      for (const component of payroll.manualComponents) {
        manualByDriver.set(component.driverRef, [
          ...(manualByDriver.get(component.driverRef) ?? []),
          component,
        ]);
      }

      for (const driver of plan.drivers) {
        const row = work.get(driver.ref) ?? { tripCount: 0, distanceKm: 0 };
        const balance = await tx.transportDriverFundEntry.aggregate({
          where: { account: { driverId: driverId.get(driver.ref) as string } },
          _sum: { signedAmount: true },
        });
        const draft = calculatePayslip(policy, {
          driverId: driverId.get(driver.ref) as string,
          tripCount: row.tripCount,
          distanceKm: row.distanceKm,
          fuelLitersSaved: null,
          waitingAllowance: null,
          driverFundBalance: Number(balance._sum.signedAmount ?? 0n),
          manualComponents: (manualByDriver.get(driver.ref) ?? []).map((component) => ({
            kind: component.kind,
            label: component.label,
            amount: component.amount,
            recordedBy: DEMO_SEED_ACTOR,
            note: component.note,
          })),
        });

        /**
         * PHIEU LUONG DI QUA DUNG VONG DOI CUA NO — `DRAFT` -> `APPROVED`, khong ghi thang.
         *
         * Khong phai de cho dep. `transport_payslip_component_frozen` (migration
         * `20260903090000`) TU CHOI moi lenh ghi dong luong khi phieu cha khong con la ban nhap —
         * do la `INV-20` duoc cuong che o tang luu tru. Mot lan `create` vua dat `status:
         * 'APPROVED'` vua kem cac dong con se bi Postgres chan ngay, va dung nhu the.
         *
         * Nen bo gieo lam dung viec ma `WorkforceService` lam: dung ban nhap cung cac dong giai
         * thich no, roi moi chot. Trang thai cuoi la `APPROVED` chu khong `PAID`: ky luong cua
         * thang mau da duoc duyet xong, con buoc CHI TRA de danh cho buoi trinh dien bam that.
         */
        const payslip = await tx.transportPayslip.create({
          data: {
            runId: run.id,
            driverId: driverId.get(driver.ref) as string,
            kind: 'ORIGINAL',
            status: 'DRAFT',
            grossEarnings: amountOf(draft.grossEarnings),
            totalDeductions: amountOf(draft.totalDeductions),
            netAmount: amountOf(draft.netAmount),
            driverFundBalanceSnapshot: toStoredAmount(draft.driverFundBalanceSnapshot),
            tripCount: draft.tripCount,
            distanceKm: draft.distanceKm,
            components: {
              create: draft.components.map((component) => ({
                kind: component.kind,
                source: component.source,
                label: component.label,
                amount: amountOf(component.amount),
                quantity: component.quantity,
                unitAmount: toStoredAmount(component.unitAmount),
                recordedBy: component.recordedBy,
                note: component.note,
              })),
            },
          },
        });
        await tx.transportPayslip.update({
          where: { id: payslip.id },
          data: {
            status: 'APPROVED',
            approvedAt: iso(payroll.endDate, 10),
            approvedBy: DEMO_SEED_ACTOR,
          },
        });
        bump('payslips');
        bump('payslipComponents', draft.components.length);
      }

      return counts;
    },
    { maxWait: 20_000, timeout: 600_000 },
  );
}
