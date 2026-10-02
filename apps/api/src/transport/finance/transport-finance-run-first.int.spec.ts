import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import {
  AnalyticsCostFactsAdapter,
  AnalyticsFuelAttributionFactsAdapter,
  AnalyticsMovementFactsAdapter,
} from '../analytics/analytics.ports.js';
import { OperatingMetricsReadService } from '../analytics/operating-metrics-read.service.js';
import { CostingReadService } from '../costing/costing-read.service.js';
import { MovementCostingRunContextAdapter } from '../costing/costing-run-context.port.js';
import { CostingService } from '../costing/costing.service.js';
import { PrismaCostingRepository } from '../costing/prisma-costing.repository.js';
import { RunExpenseService } from '../costing/run-expense.service.js';
import { TransportCoreFactsAdapter } from '../costing/transport-core-facts.port.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { FuelCostAttributionReadService } from '../fuel/fuel-cost-attribution-read.service.js';
import { FuelCostAttributionService } from '../fuel/fuel-cost-attribution.service.js';
import { DEFAULT_FUEL_STATEMENT_COLUMNS, type TransportFuelPolicy } from '../fuel/fuel-policy.js';
import { MovementFuelRunContextAdapter } from '../fuel/fuel-run-context.port.js';
import { CostingFuelExpenseAdapter, TransportFuelCoreFactsAdapter } from '../fuel/fuel.ports.js';
import { FuelService, type SubmitFuelEntryCommand } from '../fuel/fuel.service.js';
import { PrismaFuelCostAttributionRepository } from '../fuel/prisma-fuel-cost-attribution.repository.js';
import { PrismaFuelRepository } from '../fuel/prisma-fuel.repository.js';
import { PrismaFuelStationRepository } from '../fuel/prisma-fuel-station.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { PrismaSettlementRepository } from '../settlement/prisma-settlement.repository.js';
import { SettlementReadService } from '../settlement/settlement-read.service.js';
import {
  SettlementCoreFactsAdapter,
  SettlementCostingFactsAdapter,
} from '../settlement/settlement.ports.js';
import { DEFAULT_TRANSPORT_TIME_ZONE } from '../transport-policy.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { FinanceSettlementFactsAdapter } from './finance-facts.port.js';
import { FinanceReadService } from './finance-read.service.js';
import { FinanceRunFirstFactsAdapter } from './finance-run-first.port.js';

/**
 * `#381`/`#385` — DOANH THU / BIEN CONG TY TINH CA VIEC Run-first, tren Postgres THAT.
 *
 * ```text
 * chuyen cu CH  --projectTrip-->  don ORD-CH + vong RUN-CH   (ban CHIEU: tinh qua CHUYEN, mot lan)
 * don Run-first DON --> vong xe VONG --> phieu dau ghi no (phan bo) + phieu tien mat (chua phan bo)
 * don Run-first CHO  (chua dieu xe)                            (chi phi CHUA BIET, khong vao tong)
 * ```
 *
 * Bang tai chinh doc CA database — cac bo int khac dung chung Postgres — nen moi khang dinh o day
 * PHAM VI HOA theo id cua fixture (`int-spec-khong-khang-dinh-tren-so-toan-cuc`). Phep doi chieu
 * voi tong la phep so TONG CAC DONG DA TINH voi `totals`: ca hai den tu cung mot lan doc.
 *
 * TIEN TO RIENG `IT-F385` — khong long voi `IT-F364*`, `IT-F369*`, `IT-F371P`.
 */
const PREFIX = 'IT-F385';
const PHONE_PREFIX = '0999F385';
const ACTOR = 'it-f385-ke-toan';

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'Bang tai chinh + hieu qua tinh ca don Run-first, khong dem trung — #385',
  () => {
    const prisma = new PrismaService();
    const movementRepo = new PrismaMovementRepository(prisma);
    const costingRepo = new PrismaCostingRepository(prisma);
    const fuelRepo = new PrismaFuelRepository(prisma);
    const attributionRepo = new PrismaFuelCostAttributionRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const trips = new PrismaTripRepository(prisma);

    const corePolicy = { timeZone: DEFAULT_TRANSPORT_TIME_ZONE };
    const FUEL_POLICY: TransportFuelPolicy = {
      matching: { amountVnd: 1_000, businessDateDays: 1 },
      statement: { columns: DEFAULT_FUEL_STATEMENT_COLUMNS, dateFormat: 'iso' },
      consumption: { normsByVehicleClass: {}, tolerancePercent: 10 },
    };
    const audit = new AuditLogService(new InMemoryAuditLogRepository());
    const core = new TransportCoreFactsAdapter(trips, fleet);
    const movement = new MovementService(movementRepo, fleet, audit, corePolicy, trips);
    const costing = new CostingService(costingRepo, core, audit, corePolicy, {
      expenseCategories: [],
      advanceApprovalRequired: false,
    });
    const runExpenses = new RunExpenseService(
      costingRepo,
      core,
      new MovementCostingRunContextAdapter(movementRepo),
      audit,
      corePolicy,
    );
    const fuelRuns = new MovementFuelRunContextAdapter(movementRepo);
    const fuelCore = new TransportFuelCoreFactsAdapter(trips, fleet);
    const fuel = new FuelService(
      fuelRepo,
      new PrismaFuelStationRepository(prisma),
      fuelCore,
      fuelRuns,
      new CostingFuelExpenseAdapter(costing, runExpenses),
      audit,
      corePolicy,
      FUEL_POLICY,
    );
    const attributionRead = new FuelCostAttributionReadService(
      fuelRepo,
      attributionRepo,
      fuelRuns,
      fuelCore,
    );
    const attribution = new FuelCostAttributionService(
      fuelRepo,
      attributionRepo,
      fuelRuns,
      attributionRead,
      audit,
    );
    const costingRead = new CostingReadService(costingRepo, core);

    /** Hinh dang ma `app-composition.ts` dung — ba cua so, cung mot ham gop. */
    const finance = new FinanceReadService(
      new FinanceSettlementFactsAdapter(
        new SettlementReadService(
          new PrismaSettlementRepository(prisma),
          new SettlementCoreFactsAdapter(trips),
          new SettlementCostingFactsAdapter(costingRead),
        ),
        trips,
      ),
      new FinanceRunFirstFactsAdapter(
        movementRepo,
        new OperatingMetricsReadService(
          new AnalyticsMovementFactsAdapter(movementRepo),
          new AnalyticsCostFactsAdapter(costingRepo),
          new AnalyticsFuelAttributionFactsAdapter(attributionRepo),
        ),
        fuelRepo,
        attributionRepo,
      ),
      corePolicy,
    );

    const state = {
      supplierId: '',
      driverId: '',
      vehicleId: '',
      customerId: '',
      tripId: '',
      projectedOrderId: '',
      projectedRunId: '',
      orderId: '',
      waitingOrderId: '',
      runId: '',
      runCode: '',
      cashEntryId: '',
    };

    async function cleanup(): Promise<void> {
      const suppliers = await prisma.transportFuelSupplier.findMany({
        where: { code: { startsWith: `${PREFIX}-CX` } },
        select: { id: true },
      });
      const supplierIds = suppliers.map((row) => row.id);
      const entries = await prisma.transportFuelEntry.findMany({
        where: { supplierId: { in: supplierIds } },
        select: { id: true },
      });
      const entryIds = entries.map((row) => row.id);
      // Bang phan bo la CHI GHI THEM — tat trigger TRONG mot giao dich (khuon cua `#364`).
      if (entryIds.length > 0) {
        await prisma.$transaction([
          prisma.$executeRawUnsafe(
            'ALTER TABLE "TransportFuelCostAttribution" DISABLE TRIGGER "transport_fuel_cost_attribution_append_only"',
          ),
          prisma.transportFuelCostAttribution.deleteMany({
            where: { fuelEntryId: { in: entryIds } },
          }),
          prisma.$executeRawUnsafe(
            'ALTER TABLE "TransportFuelCostAttribution" ENABLE TRIGGER "transport_fuel_cost_attribution_append_only"',
          ),
        ]);
      }
      // Phieu tien mat Run-first tro toi but toan quy — go phieu TRUOC but toan.
      await prisma.transportFuelEntry.deleteMany({ where: { supplierId: { in: supplierIds } } });
      await prisma.transportFuelSupplier.deleteMany({ where: { id: { in: supplierIds } } });

      const runs = await prisma.transportVehicleRun.findMany({
        where: { vehicle: { registrationPlate: { startsWith: `${PREFIX}-XE` } } },
        select: { id: true },
      });
      const runIds = runs.map((row) => row.id);
      const tripRows = await prisma.transportTrip.findMany({
        where: { code: { startsWith: `${PREFIX}-CH` } },
        select: { id: true },
      });
      const tripIds = tripRows.map((row) => row.id);
      const legs = await prisma.transportRunLeg.findMany({
        where: { runId: { in: runIds } },
        select: { id: true },
      });
      const accounts = await prisma.transportDriverFundAccount.findMany({
        where: { driver: { phone: { startsWith: PHONE_PREFIX } } },
        select: { id: true },
      });
      const accountIds = accounts.map((row) => row.id);
      for (const kind of ['REVERSAL', 'EXPENSE'] as const) {
        await prisma.transportTripExpense.deleteMany({ where: { tripId: { in: tripIds }, kind } });
      }
      await prisma.transportDriverFundEntry.deleteMany({
        where: { accountId: { in: accountIds }, kind: 'REVERSAL' },
      });
      await prisma.transportDriverFundEntry.deleteMany({
        where: { accountId: { in: accountIds } },
      });
      await prisma.transportDriverFundAccount.deleteMany({ where: { id: { in: accountIds } } });

      await prisma.transportTripRunLegLink.deleteMany({
        where: { legId: { in: legs.map((leg) => leg.id) } },
      });
      await prisma.transportTripRunLegLink.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.transportTripOrderLink.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });
      // `contains`: don chieu mang ma `ORD-<ma chuyen>` — tien to cua bai nam o GIUA.
      await prisma.transportOrder.deleteMany({ where: { code: { contains: PREFIX } } });
      await prisma.transportTripAssignment.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.transportTrip.deleteMany({ where: { id: { in: tripIds } } });
      await prisma.transportVehicle.deleteMany({
        where: { registrationPlate: { startsWith: `${PREFIX}-XE` } },
      });
      await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
      await prisma.transportCustomer.deleteMany({ where: { name: { startsWith: `${PREFIX} ` } } });
    }

    const command = (patch: Partial<SubmitFuelEntryCommand> = {}): SubmitFuelEntryCommand => ({
      runId: state.runId,
      driverId: state.driverId,
      supplierId: state.supplierId,
      liters: '60',
      amount: 1_320_000,
      odometerKm: 500_000,
      occurredAt: '2027-05-06T04:30:00.000Z',
      businessDate: '2027-05-06',
      paymentMethod: 'SUPPLIER_ACCOUNT',
      invoiceNo: null,
      note: null,
      correlationKey: `${PREFIX}-${randomUUID()}`,
      ...patch,
    });

    /** `SUM` THO cua bang phan bo cho mot vong chay — ve con lai cua phep doi soat. */
    const attributionSum = async (runId: string): Promise<number> => {
      const rows = await prisma.transportFuelCostAttribution.findMany({
        where: { runId },
        select: { signedAmount: true },
      });
      return rows.reduce((total, row) => total + Number(row.signedAmount), 0);
    };

    beforeAll(async () => {
      await cleanup();

      state.supplierId = (
        await fuelRepo.createSupplier({
          name: 'Cay xang IT #385',
          code: `${PREFIX}-CX`,
          phone: null,
          address: null,
          taxCode: null,
          at: new Date('2027-05-01T00:00:00.000Z'),
        })
      ).id;
      state.vehicleId = (
        await fleet.createVehicle({
          registrationPlate: `${PREFIX}-XE-A`,
          vehicleClass: 'Dau keo',
          allowedPayloadKg: 5_000,
        })
      ).id;
      state.driverId = (
        await fleet.createDriver({
          fullName: 'IT F385 Lai xe',
          phone: `${PHONE_PREFIX}A`,
          licenceClass: 'FC',
          licenceExpiry: '2030-01-01',
          authUserId: null,
        })
      ).id;
      state.customerId = (await fleet.createCustomer({ name: `${PREFIX} Khach` })).id;

      /* Chuyen cu THAT, roi CHIEU sang don + vong xe — ban chieu KHONG duoc dem lan hai. */
      const trip = await trips.create({
        code: `${PREFIX}-CH`,
        kind: 'OWN_DIRECT',
        businessDate: '2027-05-05',
        originLabel: 'Ha Noi',
        destinationLabel: 'Hai Phong',
        customerId: state.customerId,
        freightAmount: 9_000_000,
        distanceKm: 120,
      });
      state.tripId = trip.id;
      await trips.assign(trip.id, {
        vehicleId: state.vehicleId,
        driverId: state.driverId,
        assignedBy: ACTOR,
        at: new Date('2027-05-05T00:00:00.000Z'),
      });
      const projection = await movement.projectTrip(trip.id, ACTOR);
      state.projectedRunId = projection.run.id;
      state.projectedOrderId = projection.order?.id ?? '';
      await movement.assignRun(projection.run.id, { driverId: state.driverId }, ACTOR);

      /* Don Run-first CHAY bang vong xe cua chinh no. */
      state.orderId = (
        await movement.createOrder(
          {
            code: `${PREFIX}-DON`,
            businessDate: '2027-05-06',
            originLabel: 'Kho A',
            destinationLabel: 'Kho B',
            customerId: state.customerId,
            freightAmount: 6_000_000,
          },
          ACTOR,
        )
      ).id;
      const run = await movement.createRun(
        { code: `${PREFIX}-VONG`, vehicleId: state.vehicleId, businessDate: '2027-05-06' },
        ACTOR,
      );
      state.runId = run.id;
      state.runCode = run.code;
      await movement.addLeg(
        run.id,
        {
          sequence: 1,
          kind: 'LOADED',
          orderId: state.orderId,
          originLabel: 'Kho A',
          destinationLabel: 'Kho B',
          distanceKm: 40,
        },
        ACTOR,
      );
      await movement.assignRun(run.id, { driverId: state.driverId }, ACTOR);

      /* Don Run-first CHUA dieu xe. */
      state.waitingOrderId = (
        await movement.createOrder(
          {
            code: `${PREFIX}-CHO`,
            businessDate: '2027-05-07',
            originLabel: 'Kho C',
            destinationLabel: 'Kho D',
            customerId: state.customerId,
            freightAmount: 2_000_000,
          },
          ACTOR,
        )
      ).id;
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it('F385-IT-01 — don Run-first co dong rieng; don CHIEU tu chuyen cu thi khong', async () => {
      const view = await finance.margin();
      const keys = new Set(view.rows.map((row) => row.key));

      expect(state.projectedOrderId).not.toBe('');
      expect(keys.has(`TRIP:${state.tripId}`)).toBe(true);
      expect(keys.has(`ORDER:${state.projectedOrderId}`)).toBe(false);
      expect(view.rows.find((row) => row.key === `ORDER:${state.orderId}`)).toMatchObject({
        source: 'RUN_FIRST_ORDER',
        code: `${PREFIX}-DON`,
        runCodes: [state.runCode],
        revenueAmount: 6_000_000,
        counted: true,
      });
      expect(view.rows.find((row) => row.key === `ORDER:${state.waitingOrderId}`)).toMatchObject({
        counted: false,
        exclusion: 'NO_RUN_YET',
        costs: null,
        marginAmount: null,
      });
    });

    it('F385-IT-02 — phieu ghi no da phan bo vao chi phi don DUNG mot lan, khop bang goc', async () => {
      const billed = await fuel.submitFuelEntry(command(), 'lx');
      await fuel.verifyFuelEntry(billed.id, ACTOR);
      await attribution.attribute(
        billed.id,
        {
          target: { kind: 'RUN', runId: state.runId },
          amount: 1_320_000,
          correlationKey: `${PREFIX}-pb-ghi-no`,
        },
        ACTOR,
      );

      const view = await finance.margin();
      const row = view.rows.find((candidate) => candidate.key === `ORDER:${state.orderId}`)!;
      expect(row.costs?.fuelAttribution).toBe(await attributionSum(state.runId));
      expect(row.deductionAmount).toBe(1_320_000);
      expect(row.marginAmount).toBe(4_680_000);
      expect(row.pendingFuelCost).toEqual({ amount: 0, entryCount: 0 });
    });

    /**
     * `#380` + `#381` noi nhau o day: phieu Run-first `DRIVER_CASH` da duyet tru quy NGAY (mot but
     * toan `RUN_EXPENSE`), nhung CHUA vao gia thanh cho toi khi ke toan phan bo. Bang hieu qua noi ra
     * phan con treo thay vi coi no la 0 hay cong so quy vao bien.
     */
    it('F385-IT-03 — tien mat lai xe chua phan bo: quy tru mot lan, bien noi ra phan treo', async () => {
      const cash = await fuel.submitFuelEntry(
        command({ paymentMethod: 'DRIVER_CASH', amount: 500_000, odometerKm: 500_400 }),
        'lx',
      );
      const verified = await fuel.verifyFuelEntry(cash.id, ACTOR);
      state.cashEntryId = verified.id;

      const fund = await costingRead.driverFundStatement(state.driverId);
      expect(fund.entries.filter((entry) => entry.kind === 'RUN_EXPENSE')).toHaveLength(1);
      expect(fund.balance).toBe(-500_000);

      const view = await finance.margin();
      const row = view.rows.find((candidate) => candidate.key === `ORDER:${state.orderId}`)!;
      expect(row.deductionAmount).toBe(1_320_000);
      expect(row.pendingFuelCost).toEqual({ amount: 500_000, entryCount: 1 });
      expect(view.totals.basis.pendingFuelCost.entryCount).toBeGreaterThanOrEqual(1);
    });

    it('F385-IT-04 — phan bo tren vong CHIEU cua chuyen cu vao dong CHUYEN, dung mot lan', async () => {
      const onProjected = await fuel.submitFuelEntry(
        command({ runId: state.projectedRunId, amount: 400_000, odometerKm: 500_800 }),
        'lx',
      );
      await fuel.verifyFuelEntry(onProjected.id, ACTOR);
      await attribution.attribute(
        onProjected.id,
        {
          target: { kind: 'RUN', runId: state.projectedRunId },
          amount: 400_000,
          correlationKey: `${PREFIX}-pb-vong-chieu`,
        },
        ACTOR,
      );

      const view = await finance.margin();
      const trip = view.rows.find((row) => row.key === `TRIP:${state.tripId}`)!;
      expect(trip.costs?.fuelAttribution).toBe(await attributionSum(state.projectedRunId));
      expect(trip.deductionAmount).toBe((trip.costs?.tripExpense ?? 0) + 400_000);
      // Don Run-first KHONG nhan them dong nao cua vong chieu.
      const order = view.rows.find((row) => row.key === `ORDER:${state.orderId}`)!;
      expect(order.deductionAmount).toBe(1_320_000);
    });

    /**
     * Tong KHONG so voi mot lan doc THU HAI: cac bo int khac ghi vao cung Postgres, nen hai lan doc
     * toan cuc co the lech ma khong co loi nao. Doi chieu trong CUNG mot lan doc la bat bien that;
     * "summary va margin dung chung mot ham gop" khoa o `finance-read.service.spec.ts`.
     */
    it('F385-IT-05 — trong MOT lan doc: tong cua may chu = tong cac dong DA TINH', async () => {
      const view = await finance.margin();
      const counted = view.rows.filter((row) => row.counted);

      expect(view.totals.revenueAmount).toBe(
        counted.reduce((total, row) => total + (row.revenueAmount ?? 0), 0),
      );
      expect(view.totals.deductionAmount).toBe(
        counted.reduce((total, row) => total + (row.deductionAmount ?? 0), 0),
      );
      expect(view.totals.basis.runFirstOrders.counted).toBe(
        counted.filter((row) => row.source === 'RUN_FIRST_ORDER').length,
      );
    });
  },
);
