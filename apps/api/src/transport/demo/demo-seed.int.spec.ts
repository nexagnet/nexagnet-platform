import { loadTenantConfig, resetTenantCache } from '@netviet/tenant';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaAuditLogRepository } from '../../audit/prisma-audit-log.repository.js';
import { PrismaUserRepository } from '../../auth/prisma-user.repository.js';
import { PrismaService } from '../../config/prisma.service.js';
import { PrismaCounterpartyRepository } from '../counterparty/prisma-counterparty.repository.js';
import { PrismaCounterpartySiteRepository } from '../counterparty/prisma-counterparty-site.repository.js';
import { CounterpartySiteService } from '../counterparty/site.service.js';
import { DriverAccountLinkService } from '../fleet/driver-account-link.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import { KnownPlacesFactsAdapter } from '../places/known-places.port.js';
import { PrismaGeofenceRepository } from '../proof/geofence.repository.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { calculatePayslip } from '../workforce/payroll-calculator.js';
import { WorkforceCoreFactsAdapter } from '../workforce/workforce.ports.js';
import { loadDemoMonthDataset } from './demo-dataset.js';
import { DEMO_RESET_ENV, DEMO_RESET_TOKEN } from './demo-guard.js';
import { buildDemoPlan } from './demo-plan.js';
import {
  DEMO_COUNTERPARTY_NOTE,
  DEMO_DEPOT_MARKER,
  DEMO_SITE_MARKERS,
  SYNTHETIC_POINT_NOTE,
  backfillDemoPlaceMarkers,
} from './demo-places.js';
import {
  backfillDemoPersonaLogins,
  backfillDemoPersonaLoginsReport,
  resetTransportDemoData,
  seedTransportDemoMonth,
} from './demo-seed.js';

/**
 * THANG VAN HANH MAU tren Postgres THAT.
 *
 * ---------------------------------------------------------------------------
 * VI SAO BAI NAY CO CONG RIENG (`RUN_TRANSPORT_DEMO_IT`) THAY VI DI CHUNG `RUN_PRISMA_IT`.
 *
 * No PHA HUY: `resetTransportDemoData()` xoa sach moi bang van tai. Cac bai IT van tai khac dung
 * fixture co tien to (`IT-TRANSPORT-*`) va don dep phan cua chinh chung, va job `integration` chay
 * cac tep SONG SONG — nen mot bai xoa sach chay cung luc se cuop mat fixture cua ba tep ben canh
 * va gay ra mot chuoi loi khong lien quan gi den nguyen nhan.
 *
 * Nen no chay o mot BUOC RIENG, sau cung, tuan tu. Cong rieng khong phai de no de xanh hon — no
 * VAN chay trong CI; cong rieng la de no duoc chay MOT MINH.
 *
 * ---------------------------------------------------------------------------
 * BAI NAY DOI CHIEU CON SO DAU BANG, khong chi dem hang.
 *
 * `#196` §5 doi hoi "khang dinh tu dong doi chieu cac con so dau bang". Dem so hang chi chung minh
 * lenh `INSERT` da chay; doi chieu chung minh cac con so NHAT QUAN VOI NHAU — va do moi la thu mot
 * ke toan nhin vao.
 */

const RUN = process.env.RUN_TRANSPORT_DEMO_IT === '1';
const ANCHOR = '2026-09-05';
const HASH_MARKER = 'bam-gia-cho-bai-test:';

describe.runIf(RUN)('Gieo thang van hanh mau (Postgres THAT)', () => {
  const prisma = new PrismaService();
  const resetEnv = { [DEMO_RESET_ENV]: DEMO_RESET_TOKEN };

  const seed = () =>
    seedTransportDemoMonth(prisma, {
      anchor: ANCHOR,
      driverPassword: 'mat-khau-chi-dung-trong-bai-test',
      hashPassword: async (plain) => `${HASH_MARKER}${plain}`,
    });

  beforeAll(async () => {
    process.env.TENANT = 'transport-preview';
    delete process.env.TENANT_DIR;
    resetTenantCache();

    await resetTransportDemoData(prisma, resetEnv);
    await seed();
  }, 300_000);

  afterAll(async () => {
    await resetTransportDemoData(prisma, resetEnv);
    await prisma.$disconnect();
    delete process.env.TENANT;
    resetTenantCache();
  }, 300_000);

  it('gieo du khoi luong ma #90 doi hoi', async () => {
    const [vehicles, drivers, customers, suppliers, partners, trips] = await Promise.all([
      prisma.transportVehicle.count(),
      prisma.transportDriver.count(),
      prisma.transportCustomer.count(),
      prisma.transportFuelSupplier.count(),
      prisma.transportPartner.count(),
      prisma.transportTrip.count(),
    ]);

    expect(vehicles).toBe(10);
    expect(drivers).toBeGreaterThanOrEqual(10);
    expect(customers).toBeGreaterThanOrEqual(4);
    expect(suppliers).toBe(3);
    expect(partners).toBeGreaterThanOrEqual(2);
    expect(trips).toBeGreaterThanOrEqual(30);
    expect(trips).toBeLessThanOrEqual(60);
  });

  /**
   * DOANH THU GHI NHAN = TONG GIA CUOC CUA CAC CHUYEN DA GHI NHAN.
   *
   * Hai con so nay den tu hai bang khac nhau (`TransportTrip.freightAmount` va
   * `TransportSettlementDocument.signedAmount`) va duoc ghi o hai buoc khac nhau. Chung lech nhau
   * la dau hieu mot chuyen bi bo sot hoac mot chung tu bi ghi hai lan — dung cai ma bang dieu
   * khien cua ban demo se hien sai.
   */
  it('cong no phai thu khop tong gia cuoc cua cac chuyen sinh ra no', async () => {
    const documents = await prisma.transportSettlementDocument.findMany({
      where: { direction: 'RECEIVABLE', flow: 'CUSTOMER_FREIGHT' },
      select: { signedAmount: true, tripId: true },
    });
    const tripIds = documents.map((document) => document.tripId as string);
    const trips = await prisma.transportTrip.findMany({
      where: { id: { in: tripIds } },
      select: { freightAmount: true },
    });

    const receivable = documents.reduce((total, row) => total + row.signedAmount, 0n);
    const freight = trips.reduce((total, row) => total + (row.freightAmount ?? 0n), 0n);

    expect(receivable).toBe(freight);
    expect(receivable).toBeGreaterThan(0n);
    /** Mot chung tu MOT chuyen: khong chuyen nao duoc ghi nhan doanh thu hai lan. */
    expect(new Set(tripIds).size).toBe(documents.length);
  });

  it('so du quy cua tung lai xe bang tong so du co dau cua chinh so quy do', async () => {
    const drivers = await prisma.transportDriver.findMany({ select: { id: true, fullName: true } });
    for (const driver of drivers) {
      const [aggregate, payslip] = await Promise.all([
        prisma.transportDriverFundEntry.aggregate({
          where: { account: { driverId: driver.id } },
          _sum: { signedAmount: true },
        }),
        prisma.transportPayslip.findFirst({
          where: { driverId: driver.id },
          select: { driverFundBalanceSnapshot: true },
        }),
      ]);
      const balance = aggregate._sum.signedAmount ?? 0n;
      expect(payslip?.driverFundBalanceSnapshot ?? 0n, driver.fullName).toBe(balance);
    }
  });

  /**
   * MOI DONG BANG KE PHAI CO MOT KET CUC — khop, hoac mot chenh lech co ten.
   *
   * Mot dong nam lai o `UNMATCHED` sau khi da chay doi soat la mot dong KHONG AI NHIN THAY: no
   * khong len bao cao khop, cung khong len hang cho xu ly. Do la kieu that thoat lang le nhat ma
   * mot ky doi soat co the co.
   */
  it('khong dong bang ke nao bi bo lai o trang thai chua doi soat', async () => {
    const lines = await prisma.transportFuelStatementLine.count();
    const pending = await prisma.transportFuelStatementLine.count({
      where: { reconciliationStatus: 'UNMATCHED' },
    });
    expect(lines).toBeGreaterThan(0);
    expect(pending).toBe(0);
  });

  it('sinh du ca ba loai chenh lech ma ke toan phai xu ly', async () => {
    const rows = await prisma.transportFuelDiscrepancy.groupBy({
      by: ['kind'],
      _count: { _all: true },
    });
    const kinds = new Set(rows.map((row) => row.kind));
    expect(kinds).toContain('OUT_OF_TOLERANCE');
    expect(kinds).toContain('AMBIGUOUS_CANDIDATES');
    expect(kinds).toContain('STATEMENT_LINE_ONLY');
  });

  /**
   * PHIEU LUONG DA GIEO PHAI BANG PHIEU MA SAN PHAM TU TINH RA.
   *
   * Day la khang dinh dat gia nhat cua tep nay. No khong doc lai con so da gieo — no chay LAI phep
   * tong hop THAT (`WorkforceCoreFactsAdapter.workByDriver`, dung ham ma `runPayroll` goi) tren
   * chinh du lieu vua gieo, roi dua qua `calculatePayslip`. Neu bo gieo va san pham bat dong y —
   * vd bo gieo dem ca chuyen `IN_TRANSIT`, hay bo qua mot ban phan cong — bai nay do.
   *
   * Khong co no, "so lieu mau" chi la mot bo so trong NHU that.
   */
  it('phieu luong da gieo khop voi phep tong hop cua chinh san pham', async () => {
    const facts = new WorkforceCoreFactsAdapter(
      new PrismaFleetRepository(prisma),
      new PrismaTripRepository(prisma),
    );
    const period = await prisma.transportPayrollPeriod.findFirstOrThrow();
    const work = await facts.workByDriver(period.startDate, period.endDate);
    const workByDriver = new Map(work.map((row) => [row.driverId, row]));

    const policy = loadTenantConfig().policies.transportPayroll;
    const snapshot = {
      baseSalaryVnd: policy?.baseSalaryVnd ?? 0,
      perTripVnd: policy?.perTripVnd ?? 0,
      perKmVnd: policy?.perKmVnd ?? 0,
      fuelSavingBonusVndPerLiter: policy?.fuelSavingBonusVndPerLiter ?? 0,
    };

    const payslips = await prisma.transportPayslip.findMany({
      include: { components: true, driver: { select: { fullName: true } } },
    });
    expect(payslips.length).toBeGreaterThanOrEqual(10);

    for (const payslip of payslips) {
      const row = workByDriver.get(payslip.driverId) ?? { tripCount: 0, distanceKm: 0 };
      const manual = payslip.components
        .filter(
          (component) =>
            component.source === 'MANUAL_BONUS' || component.source === 'MANUAL_DEDUCTION',
        )
        .map((component) => ({
          kind: component.kind,
          label: component.label,
          amount: Number(component.amount),
          recordedBy: component.recordedBy ?? 'demo-seed',
          note: component.note,
        }));

      const expected = calculatePayslip(snapshot, {
        driverId: payslip.driverId,
        tripCount: row.tripCount,
        distanceKm: row.distanceKm,
        fuelLitersSaved: null,
        waitingAllowance: null,
        driverFundBalance: Number(payslip.driverFundBalanceSnapshot ?? 0n),
        manualComponents: manual,
      });

      const who = payslip.driver.fullName;
      expect(payslip.tripCount, who).toBe(expected.tripCount);
      expect(payslip.distanceKm, who).toBe(expected.distanceKm);
      expect(Number(payslip.grossEarnings), who).toBe(expected.grossEarnings);
      expect(Number(payslip.totalDeductions), who).toBe(expected.totalDeductions);
      expect(Number(payslip.netAmount), who).toBe(expected.netAmount);
    }
  });

  /**
   * `GD-12` — KHONG mot khoan tru nao duoc sinh TU DONG.
   *
   * Bo gieo la mot duong ghi khong di qua `WorkforceService`, nen no la cho ma mot ban gieo co the
   * lang le tao ra mot khoan tru ma chinh san pham tu choi tao. Khoa lai o day.
   */
  it('moi khoan tru tren phieu luong deu la khoan NHAP TAY', async () => {
    const deductions = await prisma.transportPayslipComponent.findMany({
      where: { kind: 'DEDUCTION' },
      select: { source: true, recordedBy: true },
    });
    for (const deduction of deductions) {
      expect(deduction.source).toBe('MANUAL_DEDUCTION');
      expect(deduction.recordedBy).not.toBeNull();
    }
  });

  it('moi lai xe deu co tai khoan dang nhap duoc noi vao ho so', async () => {
    const dataset = loadDemoMonthDataset();
    const drivers = await prisma.transportDriver.findMany({ select: { authUserId: true } });
    expect(drivers.every((driver) => driver.authUserId !== null)).toBe(true);

    const users = await prisma.user.findMany({
      where: { username: { in: dataset.drivers.map((driver) => driver.login) } },
      select: { role: true },
    });
    expect(users.length).toBe(dataset.drivers.length);
    /** `GD-22` — cau noi vai: LAI XE anh xa sang `SALE` o tang xac thuc nen tang. */
    for (const user of users) expect(user.role).toBe('SALE');
  });

  /**
   * "GIEO TRUOC, CAU HINH MAT KHAU SAU" PHAI LA MOT TRINH TU CHAY DUOC.
   *
   * Lenh gieo tu bo qua khi DB da co chuyen. Neu tai khoan lai xe CHI duoc tao trong lan gieo dau,
   * thi mot stack len truoc khi co `TRANSPORT_DEMO_DRIVER_PASSWORD` se khoa be mat lai xe lai VINH
   * VIEN — tru khi xoa sach ca thang du lieu di lam lai. Bai nay dung mot ngo cut im lang.
   */
  it('tao bu duoc tai khoan cho lai xe khi mat khau den sau lan gieo', async () => {
    const dataset = loadDemoMonthDataset();
    const target = await prisma.transportDriver.findFirstOrThrow({
      where: { phone: dataset.drivers[0]?.phone },
    });

    // Dung lai trang thai "da gieo nhung chua co tai khoan".
    await prisma.transportDriver.update({ where: { id: target.id }, data: { authUserId: null } });
    await prisma.user.delete({ where: { id: target.authUserId as string } });
    expect(await prisma.transportDriver.count({ where: { authUserId: null } })).toBe(1);

    const created = await backfillDemoPersonaLogins(prisma, {
      driverPassword: 'mat-khau-chi-dung-trong-bai-test',
      hashPassword: async (plain) => `${HASH_MARKER}${plain}`,
    });

    expect(created).toBe(1);
    expect(await prisma.transportDriver.count({ where: { authUserId: null } })).toBe(0);

    /** Chay lai khong tao them gi — lai xe da co tai khoan thi khong bi dung toi. */
    expect(
      await backfillDemoPersonaLogins(prisma, {
        driverPassword: 'mat-khau-chi-dung-trong-bai-test',
        hashPassword: async (plain) => `${HASH_MARKER}${plain}`,
      }),
    ).toBe(0);
  });

  /** Khong co mat khau thi khong tao gi, va KHONG nem — buoc deploy phai di tiep duoc. */
  it('thieu mat khau thi khong tao tai khoan nao va cung khong nem', async () => {
    expect(await backfillDemoPersonaLogins(prisma, {})).toBe(0);
  });

  /**
   * KE TOAN MAU la mot vai THAT, khong phai `ADMIN` bi cat bot.
   *
   * `ACCOUNTING` bi tu choi dung ba hanh dong (`transport-actions.ts`). Ba duong tu choi do chi DO
   * duoc tren ban dang chay neu co mot tai khoan `ACCOUNTING` that de dang nhap.
   */
  it('gieo tao tai khoan ke toan mau voi vai ACCOUNTING', async () => {
    const accountant = await prisma.user.findUnique({ where: { username: 'ke-toan' } });
    expect(accountant?.role).toBe('ACCOUNTING');
  });

  /**
   * NGO CUT THU HAI, khac ngo cut cua lai xe: `DEMO_STAFF_PERSONAS` duoc them SAU khi stack xem
   * truoc da mang ca thang du lieu, nen tren ban do MOI lai xe deu da co tai khoan. Mot phep thoat
   * som theo lai xe se lam ke toan khong bao gio duoc tao ra — va khong loi nao chi ra dieu do.
   */
  it('tao bu duoc ke toan NGAY CA KHI khong lai xe nao con thieu tai khoan', async () => {
    await prisma.user.delete({ where: { username: 'ke-toan' } });
    expect(await prisma.transportDriver.count({ where: { authUserId: null } })).toBe(0);

    const created = await backfillDemoPersonaLogins(prisma, {
      driverPassword: 'mat-khau-chi-dung-trong-bai-test',
      hashPassword: async (plain) => `${HASH_MARKER}${plain}`,
    });

    expect(created).toBe(1);
    expect((await prisma.user.findUnique({ where: { username: 'ke-toan' } }))?.role).toBe(
      'ACCOUNTING',
    );

    /** Chay lai khong tao them gi — tai khoan da co thi khong bi dung toi. */
    expect(
      await backfillDemoPersonaLogins(prisma, {
        driverPassword: 'mat-khau-chi-dung-trong-bai-test',
        hashPassword: async (plain) => `${HASH_MARKER}${plain}`,
      }),
    ).toBe(0);
  });

  it('gieo lan hai KHONG ghi de len du lieu da co', async () => {
    const before = await prisma.transportTrip.count();
    const again = await seed();
    expect(again.skipped).toBe(true);
    expect(await prisma.transportTrip.count()).toBe(before);
  });

  /* ------------------------------------------------------------------ *
   * #395 — noi tai khoan qua man hinh quan tri vs may gieo / lenh reset
   * ------------------------------------------------------------------ */

  const linkService = (fleet = new PrismaFleetRepository(prisma)) =>
    new DriverAccountLinkService(
      fleet,
      new PrismaUserRepository(prisma),
      new AuditLogService(new PrismaAuditLogRepository(prisma)),
    );
  const demoDriver = (index: number) =>
    prisma.transportDriver.findFirstOrThrow({
      where: { phone: loadDemoMonthDataset().drivers[index]?.phone },
    });
  const TEST_DRIVER_PW = 'mat-khau-chi-dung-trong-bai-test';
  const backfill = () =>
    backfillDemoPersonaLoginsReport(prisma, {
      driverPassword: TEST_DRIVER_PW,
      hashPassword: async (plain) => `${HASH_MARKER}${plain}`,
    });

  /**
   * Buoc tao bu chay o MOI lan khoi dong stack xem truoc. Truoc #395 no noi lai moi ho so dang
   * trong: Giam doc go noi tren man hinh, lan khoi dong sau no am tham noi lai; Giam doc chuyen noi
   * `lx.a` sang ho so khac, lan khoi dong sau no chet o `authUserId @unique`.
   */
  it('#395: go noi / chuyen noi qua dich vu — lan tao bu sau KHONG noi lai, KHONG nem', async () => {
    const service = linkService();
    const a = await demoDriver(0);
    const b = await demoDriver(1);
    const loginA = a.authUserId as string;

    await service.setDriverAccount(b.id, null, 'giam-doc');
    await service.setDriverAccount(a.id, null, 'giam-doc');
    await service.setDriverAccount(b.id, loginA, 'giam-doc');

    const report = await backfill();

    expect(report.skipped.map((skip) => [skip.driverId, skip.reason])).toEqual(
      expect.arrayContaining([[a.id, 'DRIVER_UNLINKED_BY_DIRECTOR']]),
    );
    expect(
      (await prisma.transportDriver.findUniqueOrThrow({ where: { id: a.id } })).authUserId,
    ).toBeNull();
    expect(
      (await prisma.transportDriver.findUniqueOrThrow({ where: { id: b.id } })).authUserId,
    ).toBe(loginA);
    const trail = await prisma.auditLog.findMany({
      where: { actor: 'giam-doc', entityType: 'TransportDriver', entityId: { in: [a.id, b.id] } },
      select: { action: true },
    });
    expect(trail.map((row) => row.action).sort()).toEqual([
      'transport.driver.account_link',
      'transport.driver.account_unlink',
      'transport.driver.account_unlink',
    ]);
  });

  /** Hinh dang loi THAT cua Prisma tren Postgres — khong phai mot doi tuong gia trong bo nho. */
  it('#395: hai lan noi dua nhau — unique cua Postgres doi thanh `DRIVER_ACCOUNT_TAKEN`', async () => {
    class StaleFleet extends PrismaFleetRepository {
      // Doc CU: lan noi kia chua commit luc lan nay kiem.
      override async findDriverByAuthUserId(): Promise<null> {
        return null;
      }
    }
    const a = await demoDriver(0);
    const b = await demoDriver(1);
    expect(a.authUserId).toBeNull();

    const error = await linkService(new StaleFleet(prisma))
      .setDriverAccount(a.id, b.authUserId as string, 'giam-doc')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TransportDomainError);
    expect(error).toMatchObject({ kind: 'CONFLICT', reason: 'DRIVER_ACCOUNT_TAKEN' });
  });

  /**
   * Lenh reset xoa tai khoan THEO TEN cua nhan vat mau — khong con xoa "moi tai khoan co ho so lai
   * xe tro toi". Mot tai khoan Giam doc tao va noi vao mot lai xe mau phai song sot.
   */
  it('#395: tai khoan Lai xe do Giam doc tao, noi vao lai xe mau, SONG SOT sau reset', async () => {
    const username = 'it-s2-lai-xe-that';
    const unusableHash = `${HASH_MARKER}khong-dung`;
    await prisma.user.deleteMany({ where: { username } });
    const real = await prisma.user.create({
      data: { username, name: 'Lai xe that (IT #395)', passwordHash: unusableHash, role: 'SALE' },
    });
    try {
      const a = await demoDriver(0);
      await linkService().setDriverAccount(a.id, real.id, 'giam-doc');

      const deleted = await resetTransportDemoData(prisma, resetEnv);

      expect(await prisma.transportDriver.count()).toBe(0);
      expect(await prisma.user.findUnique({ where: { id: real.id } })).not.toBeNull();
      // Nhan vat mau VAN bi xoa het (ke ca `lx.a` da bi chuyen noi o bai tren): gieo lai chay duoc.
      const logins = loadDemoMonthDataset().drivers.map((driver) => driver.login);
      expect(await prisma.user.count({ where: { username: { in: logins } } })).toBe(0);
      expect(deleted['user']).toBeGreaterThan(0);

      const reseeded = await seed();
      expect(reseeded.skipped).toBe(false);
    } finally {
      await prisma.user.deleteMany({ where: { id: real.id } });
    }
  }, 300_000);

  /**
   * XOA ROI GIEO LAI PHAI TRA VE DUNG TRANG THAI DO — do la dinh nghia cua "lenh reset an toan".
   *
   * So sanh bang mot DAU VAN NGHIEP VU (ma chuyen + ngay + tien + so du quy + luong) chu khong
   * bang id: cuid va dau thoi gian doi moi lan gieo theo thiet ke, va so sanh chung se lam bai nay
   * do vi mot ly do khong ai quan tam.
   */
  it('xoa roi gieo lai voi cung moc ngay cho ra dung trang thai cu', async () => {
    const fingerprint = async (): Promise<string> => {
      const [trips, funds, payslips, documents] = await Promise.all([
        prisma.transportTrip.findMany({
          select: { code: true, businessDate: true, status: true, freightAmount: true },
          orderBy: { code: 'asc' },
        }),
        prisma.transportDriverFundEntry.groupBy({
          by: ['correlationKey'],
          _sum: { signedAmount: true },
          orderBy: { correlationKey: 'asc' },
        }),
        prisma.transportPayslip.findMany({
          select: { netAmount: true, tripCount: true, distanceKm: true },
          orderBy: [{ netAmount: 'asc' }, { tripCount: 'asc' }],
        }),
        prisma.transportSettlementDocument.findMany({
          select: { flow: true, direction: true, signedAmount: true, businessDate: true },
          orderBy: [{ businessDate: 'asc' }, { signedAmount: 'asc' }],
        }),
      ]);
      return JSON.stringify({ trips, funds, payslips, documents }, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      );
    };

    const before = await fingerprint();

    const deleted = await resetTransportDemoData(prisma, resetEnv);
    expect(deleted['transportTrip']).toBeGreaterThan(0);
    expect(await prisma.transportTrip.count()).toBe(0);
    expect(await prisma.transportVehicle.count()).toBe(0);

    const reseeded = await seed();
    expect(reseeded.skipped).toBe(false);
    expect(await fingerprint()).toBe(before);
  }, 300_000);

  /**
   * MOC NGAY DOI THI DU LIEU DOI THEO — bang chung rang bo du lieu KHONG bi dong cung vao lich.
   *
   * Do la nua con lai cua "tat dinh": lap lai duoc voi cung moc, nhung khong het han sang thang
   * sau. Kiem tren KE HOACH chu khong gieo lai lan nua — mot lan gieo them chi de doc lai ngay
   * thang la mot phut CI khong mua duoc gi.
   */
  it('bo du lieu khong bi dong cung vao lich', () => {
    const dataset = loadDemoMonthDataset();
    const fuel = loadTenantConfig().policies.transportFuel;
    const context = {
      consumptionNorms: fuel?.consumption?.normsByVehicleClass ?? {},
      consumptionTolerancePercent: fuel?.consumption?.tolerancePercent ?? 0,
    };
    const here = buildDemoPlan(dataset, { anchor: ANCHOR, ...context });
    const later = buildDemoPlan(dataset, { anchor: '2027-03-18', ...context });

    expect(later.trips.map((trip) => trip.code)).toEqual(here.trips.map((trip) => trip.code));
    expect(later.trips[0]?.businessDate).not.toBe(here.trips[0]?.businessDate);
  });

  /**
   * DIEM DIA DIEM MAU (#379) tren Postgres THAT — hai lan khoi dong CHONG NHAU (Railway chay buoc
   * nay o moi lan api len): Serializable + thu lai mot lan phai ra DUNG mot ban cua moi diem, khong
   * loi nem ra, khong mot dong lien ket khach nao.
   *
   * Hang rao/phap nhan/dia diem khong nam trong danh sach reset, nen bai tu don hang cua CHINH may
   * gieo (`recordedBy = demo-seed` / ghi chu cua may gieo) truoc — de lan chay song song that su
   * phai tao, chu khong chi cung doc thay "da gieo".
   */
  it('diem dia diem mau: hai lan chay song song ra dung mot ban, lan sau khong tao gi', async () => {
    const siteNames = DEMO_SITE_MARKERS.map((marker) => marker.siteName);
    const labels = [DEMO_DEPOT_MARKER.label, ...siteNames];
    await prisma.transportGeofence.deleteMany({
      where: { recordedBy: 'demo-seed', label: { in: labels } },
    });
    await prisma.transportCounterpartySite.deleteMany({
      where: {
        recordedBy: 'demo-seed',
        name: { in: siteNames },
        intakes: { none: {} },
        operationalDocuments: { none: {} },
      },
    });
    await prisma.transportCounterparty.deleteMany({
      where: { note: DEMO_COUNTERPARTY_NOTE, sites: { none: {} }, acceptances: { none: {} } },
    });
    const linksBefore = await prisma.transportCounterpartyLink.count();

    const [first, second] = await Promise.all([
      backfillDemoPlaceMarkers(prisma),
      backfillDemoPlaceMarkers(prisma),
    ]);

    expect(first.created.geofence + second.created.geofence).toBe(labels.length);
    for (const result of [first, second]) {
      const seeded = result.skipped.filter((entry) => entry.reason === 'MARKER_ALREADY_SEEDED');
      expect(result.created.geofence + seeded.length).toBe(labels.length);
    }
    for (const label of labels) {
      expect(
        await prisma.transportGeofence.count({ where: { recordedBy: 'demo-seed', label } }),
      ).toBe(1);
    }
    for (const name of siteNames) {
      expect(
        await prisma.transportCounterpartySite.count({ where: { recordedBy: 'demo-seed', name } }),
      ).toBe(1);
    }
    expect(await prisma.transportCounterpartyLink.count()).toBe(linksBefore);

    const third = await backfillDemoPlaceMarkers(prisma);
    expect(third).toEqual({
      created: { counterparty: 0, counterpartySite: 0, geofence: 0 },
      skipped: labels.map((label) => ({ label, reason: 'MARKER_ALREADY_SEEDED' })),
    });
  }, 120_000);

  /** Doc lai DUNG qua cong "dia diem da biet" ma man tao don dung — ten phap nhan doc theo lo. */
  it('diem dia diem mau doc lai qua so hang rao, ghi ro toa do tong hop', async () => {
    await backfillDemoPlaceMarkers(prisma);

    const known = await new KnownPlacesFactsAdapter(
      new PrismaGeofenceRepository(prisma),
      new CounterpartySiteService(
        new PrismaCounterpartySiteRepository(prisma),
        new PrismaCounterpartyRepository(prisma),
      ),
      new PrismaCounterpartyRepository(prisma),
    ).listKnownPlaces();
    const ours = known.filter((place) =>
      ['Bãi xe Hà Nội', 'Nhà máy thép Đình Vũ', 'Kho Nhựa Tân Phú Hưng'].includes(place.name),
    );
    expect(
      ours.map((place) => [place.kind, place.name, place.detail, place.point, place.radiusMetres]),
    ).toEqual([
      ['DEPOT', 'Bãi xe Hà Nội', null, { latitude: 20.9652, longitude: 105.8468 }, 250],
      [
        'COUNTERPARTY_SITE',
        'Kho Nhựa Tân Phú Hưng',
        'Công ty TNHH Nhựa Tân Phú Hưng',
        { latitude: 21.617, longitude: 105.817 },
        250,
      ],
      [
        'COUNTERPARTY_SITE',
        'Nhà máy thép Đình Vũ',
        'Công ty CP Thép Đông Á',
        { latitude: 20.8264, longitude: 106.7752 },
        300,
      ],
    ]);

    const fences = await prisma.transportGeofence.findMany({
      where: { id: { in: ours.map((place) => place.id) } },
    });
    for (const fence of fences) {
      expect(fence.note).toBe(SYNTHETIC_POINT_NOTE);
      expect(fence.recordedBy).toBe('demo-seed');
    }
  }, 120_000);
});
