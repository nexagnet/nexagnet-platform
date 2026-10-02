import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { PlanningService } from '../planning/planning.service.js';
import type { TransportPlanningPolicy } from '../planning/planning.types.js';
import { PrismaRunPlanRepository } from '../planning/prisma-planning.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { DispatchCoreFactsAdapter } from './dispatch-facts.port.js';
import {
  PlanningDispatchAssignmentPlanner,
  dispatchIdempotencyKey,
  type DispatchCommitResult,
} from './dispatch-planner.port.js';
import { orderPickupPlace } from './place-resolution.js';

/**
 * CONG GHI cua Lane M tren POSTGRES THAT — `#277 M14` muc 8/9/10 va `M15` muc 10.
 *
 * ===========================================================================
 * BO NAY KIEM MOT DUONG NOI, KHONG KIEM LAI LANE L
 *
 * Luat gom don, chang rong va vong doi vong chay thuoc `#276` va da co bo bai rieng
 * (`transport-planning.int.spec.ts`). Cai CHUA ai kiem la doan noi giua hai lane: mot cu bam cua
 * boss -> mot khoa chong lap suy TAT DINH -> mot ke hoach cua Lane L -> mot `DispatchCommitResult`.
 *
 * Va no phai chay tren Postgres that vi tinh chong lap khong den tu mot cau `if` trong TypeScript:
 * no den tu chinh khoa `idempotencyKey` va cac rang buoc cua Lane L. Chay bang `RUN_PRISMA_IT=1`.
 */

const PREFIX = 'IT-DSP';
const ACTOR = 'it-dispatch';
const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const BUSINESS_DATE = '2026-09-08';

const planningPolicy: TransportPlanningPolicy = {
  grouping: 'ONE_ORDER_PER_RUN',
  depots: [{ code: 'IT-DSP-DEPOT', label: 'IT-DSP Bai xe' }],
  closure: { idleHours: null },
  sweep: { intervalSeconds: 60, batchSize: 50 },
};

describe.runIf(process.env.RUN_PRISMA_IT === '1')('cong ghi dieu xe tren Postgres that', () => {
  const prisma = new PrismaService();
  const audit = new AuditLogService(new InMemoryAuditLogRepository());
  const fleet = new PrismaFleetRepository(prisma);
  const movement = new MovementService(
    new PrismaMovementRepository(prisma),
    fleet,
    audit,
    CORE_POLICY,
    new PrismaTripRepository(prisma),
  );
  const planning = new PlanningService(
    movement,
    new PrismaRunPlanRepository(prisma),
    fleet,
    audit,
    CORE_POLICY,
    planningPolicy,
  );
  const planner = new PlanningDispatchAssignmentPlanner(planning);

  /** Don dep theo THU TU AN TOAN VE KHOA NGOAI: ke hoach -> chang -> vong chay -> don -> xe. */
  async function cleanup(): Promise<void> {
    const orders = await prisma.transportOrder.findMany({
      where: { code: { startsWith: PREFIX } },
      select: { id: true },
    });
    const orderIds = orders.map((order) => order.id);
    const legs = await prisma.transportRunLeg.findMany({
      where: { orderId: { in: orderIds } },
      select: { runId: true },
    });
    const runIds = [...new Set(legs.map((leg) => leg.runId))];

    await prisma.transportOrderRunPlan.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });
    await prisma.transportOrder.deleteMany({ where: { id: { in: orderIds } } });
    // TRUOC khi xoa xe va lai xe: khoa ngoai cua ban phan cong tro vao ca hai.
    await prisma.transportVehicleAssignment.deleteMany({
      where: { vehicle: { registrationPlate: { startsWith: PREFIX } } },
    });
    await prisma.transportVehicle.deleteMany({
      where: { registrationPlate: { startsWith: PREFIX } },
    });
    await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: '0977DSP' } } });
  }

  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  /**
   * Mot chiec xe DIEU DUOC — kem nguoi cam no.
   *
   * `PlanningService.commit()` doi mot lai xe dang phu trach, con hoat dong va CO tai khoan truoc
   * khi mo vong chay, nen mot chiec xe tran (hay mot lai xe khong tai khoan) o day se lam ca bo bai
   * do sai thu: chung se do o `PLAN_VEHICLE_DRIVER_*` chu khong phai o dieu ma tung bai dinh do.
   */
  const seedVehicle = async (suffix: string): Promise<string> => {
    const row = await prisma.transportVehicle.create({
      data: {
        registrationPlate: `${PREFIX}-XE-${suffix}`,
        vehicleClass: 'TRUCK_10T',
        allowedPayloadKg: 10_000,
      },
    });
    const driver = await prisma.transportDriver.create({
      data: {
        fullName: `${PREFIX} Lai xe ${suffix}`,
        phone: `0977DSP${suffix}`,
        licenceClass: 'FC',
        licenceExpiry: '2030-01-01',
        // Unique tren Postgres — rieng tung xe, va don cung ho so qua tien to so dien thoai.
        authUserId: `it-dsp-auth-${suffix}`,
      },
    });
    await prisma.transportVehicleAssignment.create({
      data: { vehicleId: row.id, driverId: driver.id, effectiveFrom: new Date() },
    });
    return row.id;
  };

  const seedOrder = async (suffix: string): Promise<{ id: string; code: string }> => {
    const created = await movement.createOrder(
      {
        code: `${PREFIX}-DON-${suffix}`,
        businessDate: BUSINESS_DATE,
        originLabel: 'Kho Hai Phong',
        destinationLabel: 'Bai Ninh Binh',
        customerId: null,
        cargoDescription: null,
        freightAmount: null,
        note: null,
      },
      ACTOR,
    );
    return { id: created.id, code: created.code };
  };

  it('lan bam dau tien sinh mot chang CO TAI mang dung don do', async () => {
    const vehicleId = await seedVehicle('A1');
    const order = await seedOrder('A1');

    const result = await planner.commit({ orderId: order.id, vehicleId, actor: ACTOR });

    expect(result.created).toBe(true);
    expect(result.reason).toBe('COMMIT_PLANNED');

    const detail = await movement.getRun(result.runId);
    expect(detail.run.vehicleId).toBe(vehicleId);

    const loaded = detail.legs.find((leg) => leg.id === result.legId);
    expect(loaded?.kind).toBe('LOADED');
    expect(loaded?.orderId).toBe(order.id);
  });

  /** `M15` muc 10 — bam lai khong duoc sinh ban thu hai. */
  it('bam lai lan thu hai KHONG sinh them vong chay/chang nao', async () => {
    const vehicleId = await seedVehicle('A2');
    const order = await seedOrder('A2');

    const first = await planner.commit({ orderId: order.id, vehicleId, actor: ACTOR });
    const second = await planner.commit({ orderId: order.id, vehicleId, actor: ACTOR });

    expect(second.created).toBe(false);
    expect(second.reason).toBe('COMMIT_ALREADY_PLANNED_ON_SAME_VEHICLE');
    expect(second.runId).toBe(first.runId);
    expect(second.legId).toBe(first.legId);

    expect(await prisma.transportRunLeg.count({ where: { orderId: order.id } })).toBe(1);
  });

  /**
   * `M14` muc 8 — HAI LAN BAM DEN CUNG LUC.
   *
   * ===========================================================================
   * BAI NAY KHANG DINH DUNG HOP DONG CUA LANE L, KHONG CHAT HON.
   *
   * `#276` `PL-IT-02` viet ro: *"It nhat mot ban thanh cong. Ban con lai hoac phat lai, hoac bao
   * dang xu ly — KHONG bao gio tao mot vong chay thu hai."* Ban kia co the nhan
   * `PLAN_COMMIT_IN_FLIGHT` — mot cau tra loi DUNG: ai do dang ghi, hay tai lai roi nhin.
   *
   * Doi CA HAI cung tra ve mot `legId` la doi chat hon hop dong that. Mot bai nhu the do khi Lane
   * L khong lam gi sai ca — va lan do do se day nguoi doc di sua dung cho khong hong.
   *
   * Cai KHONG duoc phep xay ra, va la thu bai nay thuc su canh: HAI chang co tai cho mot don.
   */
  it('hai lan bam DONG THOI khong bao gio sinh chang co tai thu hai', async () => {
    const vehicleId = await seedVehicle('A3');
    const order = await seedOrder('A3');

    const settled = await Promise.allSettled([
      planner.commit({ orderId: order.id, vehicleId, actor: ACTOR }),
      planner.commit({ orderId: order.id, vehicleId, actor: ACTOR }),
    ]);

    const fulfilled = settled.filter((entry) => entry.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    // Moi ban THANH CONG deu phai tro ve cung mot chang — khong ai duoc thay mot ke hoach khac.
    const legIds = new Set(
      fulfilled.map((entry) => (entry as PromiseFulfilledResult<DispatchCommitResult>).value.legId),
    );
    expect(legIds.size).toBe(1);

    // Ban KHONG thanh cong (neu co) phai la mot tu choi CO KIEU, khong phai mot loi ky thuat.
    for (const entry of settled) {
      if (entry.status === 'rejected') expect(entry.reason).toBeInstanceOf(TransportDomainError);
    }

    expect(
      await prisma.transportRunLeg.count({ where: { orderId: order.id, kind: 'LOADED' } }),
    ).toBe(1);
  });

  /**
   * `#276 L3` — mot don khong duoc nam tren hai chang co tai cung luc.
   *
   * Khoa chong lap CO `vehicleId`, nen mot lua chon xe khac la mot lenh KHAC — no khong duoc phat
   * lai ket qua cu. Ben tu choi la Lane L (`PLAN_ORDER_ALREADY_PLANNED`), tuc ben so huu luat gom
   * don; Lane M khong tu viet mot phep kiem thu hai cho cung cau hoi.
   */
  it('gan don da co ke hoach sang MOT XE KHAC bi tu choi CO KIEU', async () => {
    const firstVehicle = await seedVehicle('A4');
    const secondVehicle = await seedVehicle('A5');
    const order = await seedOrder('A4');

    await planner.commit({ orderId: order.id, vehicleId: firstVehicle, actor: ACTOR });

    await expect(
      planner.commit({ orderId: order.id, vehicleId: secondVehicle, actor: ACTOR }),
    ).rejects.toBeInstanceOf(TransportDomainError);

    expect(await prisma.transportRunLeg.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('don da huy khong lap duoc ke hoach dieu xe', async () => {
    const vehicleId = await seedVehicle('A6');
    const order = await seedOrder('A6');
    await movement.cancelOrder(order.id, 'khach doi y', ACTOR);

    await expect(
      planner.commit({ orderId: order.id, vehicleId, actor: ACTOR }),
    ).rejects.toBeInstanceOf(TransportDomainError);
    expect(await prisma.transportRunLeg.count({ where: { orderId: order.id } })).toBe(0);
  });

  /**
   * `#379` — TOA DO DI QUA POSTGRES TOI TAN CUA SO DOC CUA DIEU XE.
   *
   * Bo bai don vi cua dieu xe dung kho gia, nen no KHONG bat duoc mot anh xa Prisma bo quen bon cot
   * moi. Neu `toOrder` quen, moi lan dieu xe that se ra "don chua co toa do" trong khi moi bai don
   * vi van xanh — bai nay la thu bat duoc dieu do. Don tao khong co diem (duong noi bo/don cu) phai
   * doc lai la `null`, va dieu xe tu choi no thay vi suy tu nhan `Kho Hai Phong`.
   */
  it('toa do diem lay/giao di tu createOrder qua Postgres toi cong doc cua dieu xe', async () => {
    const pickup = { latitude: 20.8449, longitude: 106.6881 };
    const delivery = { latitude: 20.2506, longitude: 105.9745 };
    const withPoints = await movement.createOrder(
      {
        code: `${PREFIX}-DON-P1`,
        businessDate: BUSINESS_DATE,
        originLabel: 'Kho Hai Phong',
        destinationLabel: 'Bai Ninh Binh',
        originPoint: pickup,
        destinationPoint: delivery,
        customerId: null,
        cargoDescription: null,
        freightAmount: null,
        note: null,
      },
      ACTOR,
    );
    const legacy = await seedOrder('P0');
    const facts = new DispatchCoreFactsAdapter(new PrismaMovementRepository(prisma), fleet);

    const read = await facts.findOrder(withPoints.id);
    expect(read?.originPoint).toEqual(pickup);
    expect(read?.destinationPoint).toEqual(delivery);
    expect(read && orderPickupPlace(read)).toMatchObject({
      ok: true,
      reason: 'PICKUP_FROM_ORDER_COORDINATES',
      place: { point: pickup, source: 'ORDER_PICKUP_POINT', label: 'Kho Hai Phong' },
    });

    const readLegacy = await facts.findOrder(legacy.id);
    expect(readLegacy?.originPoint).toBeNull();
    expect(readLegacy?.destinationPoint).toBeNull();
    expect(readLegacy && orderPickupPlace(readLegacy)).toEqual({
      ok: false,
      reason: 'PICKUP_ORDER_COORDINATES_MISSING',
    });
  });

  /** Khoa chong lap phai TAT DINH — neu no ngau nhien thi moi bai o tren deu vo nghia. */
  it('khoa chong lap suy tat dinh tu (don, xe)', () => {
    expect(dispatchIdempotencyKey('ord-1', 'xe-1')).toBe(dispatchIdempotencyKey('ord-1', 'xe-1'));
    expect(dispatchIdempotencyKey('ord-1', 'xe-1')).not.toBe(
      dispatchIdempotencyKey('ord-1', 'xe-2'),
    );
  });
});
