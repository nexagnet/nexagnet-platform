import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { InMemoryMovementRepository } from '../movement/movement.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { TransportDomainError } from '../transport.errors.js';
import { InMemoryRunPlanRepository } from './planning.repository.js';
import { PlanningService } from './planning.service.js';
import type { RunGrouping, TransportPlanningPolicy } from './planning.types.js';

/**
 * LAP KE HOACH VONG CHAY — bai kiem DOI KHANG o tang dich vu (`#276` L9).
 *
 * Bo nay phu nhung bai can toi mot vong ghi that nhung KHONG can Postgres:
 *
 *     bai 1   gui lai cung khoa -> MOT vong chay, MOT chang co hang
 *     bai 2   gan cung mot don len hai chiec xe -> that bai TAT DINH
 *     bai 3   vong chay da dong khong nhan them chang moi mot cach lang le
 *     bai 4   chang da hoan thanh khong sua duoc
 *     bai 5   chang tuong lai replan duoc, co dau vet
 *     bai 6   che do ONE khong bao gio gom hai don
 *     bai 7   che do MULTI gom duoc don A + B
 *     bai 8   giao A roi lay B o cho khac -> DUNG MOT chang rong
 *     bai 12  con chang tuong lai thi khong dong
 *     bai 13  ve bai + het viec -> he thong dong
 *     bai 14  dong vong chay KHONG dong vao trang thai thuong mai cua don
 *     bai 15  don moi sau khi dong -> vong chay MOI
 *     bai 16  doi chinh sach KHONG viet lai lich su
 *
 * Bai 2 o day chung minh duong TUAN TU. Ban dong thoi that (hai giao dich cung luc) can unique
 * cua Postgres va nam o `transport-planning.int.spec.ts` — mot ban trong bo nho khong phu nhan
 * duoc mot rang buoc cua kho.
 */

const ACTOR = 'ke-toan';
const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const DEPOT_LABEL = 'Bãi xe Hà Nội';

/**
 * DONG HO TIEM cua dich vu bat dau tu GIO THAT, khong tu mot moc co dinh.
 *
 * Ly do khong hien nhien, nen ghi ro: `completedAt` cua mot chang do CHINH repository dat bang
 * `new Date()` — no khong di qua dong ho tiem. Neu bai test dat dong ho cua dich vu vao mot moc
 * co dinh nam xa gio that thi phep tru "xe nghi bao lau roi" se ra hang ngan gio, va bai nguong
 * nghi se dong ngay o lan goi dau — xanh vi mot ly do sai.
 *
 * Cho dong ho tiem chay tu gio that roi DAY NO VE PHIA TRUOC trong bai la cach duy nhat giu ca
 * hai nguon thoi gian noi cung mot chuyen.
 */
const planningPolicy = (
  grouping: RunGrouping,
  over: Partial<TransportPlanningPolicy> = {},
): TransportPlanningPolicy => ({
  grouping,
  depots: [{ code: 'DEPOT-HN', label: DEPOT_LABEL }],
  closure: { idleHours: null },
  sweep: { intervalSeconds: 60, batchSize: 50 },
  ...over,
});

const reasonOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof TransportDomainError) return error.reason;
    throw error;
  }
  throw new Error('khong nem loi nao ca');
};

describe('PlanningService — vong chay do he thong quan (#276 Lane L)', () => {
  let fleet: InMemoryFleetRepository;
  let movementRepo: InMemoryMovementRepository;
  let plans: InMemoryRunPlanRepository;
  let movement: MovementService;
  let planning: PlanningService;
  let now: Date;

  const build = (policy: TransportPlanningPolicy): PlanningService =>
    new PlanningService(
      movement,
      plans,
      fleet,
      new AuditLogService(new InMemoryAuditLogRepository()),
      CORE_POLICY,
      policy,
      undefined,
      () => now,
    );

  beforeEach(() => {
    now = new Date();
    fleet = new InMemoryFleetRepository();
    movementRepo = new InMemoryMovementRepository();
    plans = new InMemoryRunPlanRepository();
    movement = new MovementService(
      movementRepo,
      fleet,
      new AuditLogService(new InMemoryAuditLogRepository()),
      CORE_POLICY,
    );
    planning = build(planningPolicy('ONE_ORDER_PER_RUN'));
  });

  /**
   * MOT CHIEC XE DIEU DUOC — co nghia la co nguoi cam no, va nguoi do MO duoc man Hien truong.
   *
   * Fixture nay co y KHONG tra ve mot chiec xe tran: ke tu khi `commit()` doi mot lai xe dang phu
   * trach, con hoat dong va co tai khoan, mot chiec xe thieu mot trong ba dieu do la mot chiec xe
   * KHONG giao viec duoc. Cac duong tu choi do nam o `planning-driver-handoff.spec.ts`.
   */
  const aVehicle = async (plate = '29C-11111') => {
    const vehicle = await fleet.createVehicle({
      registrationPlate: plate,
      vehicleClass: 'Đầu kéo',
    });
    const driver = await fleet.createDriver({
      fullName: `Lai xe ${plate}`,
      phone: `090${plate.replace(/\D/g, '').slice(0, 7)}`,
      licenceClass: 'FC',
      licenceExpiry: '2030-01-01',
      authUserId: `auth-${plate}`,
    });
    await fleet.assignDriverToVehicle(vehicle.id, driver.id, now);
    return vehicle;
  };

  const anOrder = (code: string, origin: string, destination: string) =>
    movement.createOrder(
      { code, originLabel: origin, destinationLabel: destination, businessDate: '2026-09-11' },
      ACTOR,
    );

  /** Chay tron mot chang: lan banh roi ket thuc. Hai buoc, dung nhu may trang thai doi. */
  const runLeg = async (legId: string) => {
    await movement.transitionLeg(legId, 'IN_TRANSIT', ACTOR);
    return movement.transitionLeg(legId, 'COMPLETED', ACTOR);
  };

  /* ---------------------------------------------------------------- *
   * XEM TRUOC
   * ---------------------------------------------------------------- */

  it('xem truoc KHONG ghi mot hang nao', async () => {
    const vehicle = await aVehicle();
    const order = await anOrder('ORD-1', 'Kho Hà Nội', 'Hải Phòng');

    const proposal = await planning.preview(order.id, { vehicleId: vehicle.id });

    expect(proposal.outcome).toBe('NEW_RUN');
    expect(proposal.legs).toHaveLength(2);
    expect(await movement.listRuns()).toHaveLength(0);
    expect(await plans.listForOrder(order.id)).toHaveLength(0);
  });

  it('goi xem truoc hai lan cho dung mot ket qua', async () => {
    const vehicle = await aVehicle();
    const order = await anOrder('ORD-1', 'Kho Hà Nội', 'Hải Phòng');
    const first = await planning.preview(order.id, { vehicleId: vehicle.id });
    const second = await planning.preview(order.id, { vehicleId: vehicle.id });
    expect(second).toEqual(first);
  });

  /* ---------------------------------------------------------------- *
   * CHOT KE HOACH
   * ---------------------------------------------------------------- */

  it('bai 1 -- gui lai CUNG khoa chong lap: mot vong chay, mot chang co hang', async () => {
    const vehicle = await aVehicle();
    const order = await anOrder('ORD-1', 'Kho Hà Nội', 'Hải Phòng');

    const first = await planning.commit(
      order.id,
      { vehicleId: vehicle.id, idempotencyKey: 'tap-1' },
      ACTOR,
    );
    const second = await planning.commit(
      order.id,
      { vehicleId: vehicle.id, idempotencyKey: 'tap-1' },
      ACTOR,
    );

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.plan.id).toBe(first.plan.id);
    expect(second.run.id).toBe(first.run.id);
    expect(await movement.listRuns()).toHaveLength(1);
    const legs = await movement.legsOfRun(first.run.id);
    expect(legs.filter((leg) => leg.kind === 'LOADED')).toHaveLength(1);
  });

  it('bai 2 -- cung mot don len hai chiec xe: lan hai bi tu choi CO TEN', async () => {
    const first = await aVehicle('29C-11111');
    const second = await aVehicle('29C-22222');
    const order = await anOrder('ORD-1', 'Kho Hà Nội', 'Hải Phòng');

    await planning.commit(order.id, { vehicleId: first.id, idempotencyKey: 'tap-1' }, ACTOR);

    expect(
      await reasonOf(() =>
        planning.commit(order.id, { vehicleId: second.id, idempotencyKey: 'tap-2' }, ACTOR),
      ),
    ).toBe('PLAN_ORDER_ALREADY_PLANNED');
    expect(await movement.listRuns()).toHaveLength(1);
  });

  it('don da huy / da hoan thanh khong lap ke hoach duoc, va HAI ma khac nhau', async () => {
    const vehicle = await aVehicle();
    const cancelled = await anOrder('ORD-C', 'Kho Hà Nội', 'Hải Phòng');
    await movement.cancelOrder(cancelled.id, 'khach bao huy', ACTOR);
    const fulfilled = await anOrder('ORD-F', 'Kho Hà Nội', 'Hải Phòng');
    await movement.transitionOrder(fulfilled.id, 'FULFILLED', ACTOR);

    expect(
      await reasonOf(() =>
        planning.commit(cancelled.id, { vehicleId: vehicle.id, idempotencyKey: 'k1' }, ACTOR),
      ),
    ).toBe('PLAN_ORDER_CANCELLED');
    expect(
      await reasonOf(() =>
        planning.commit(fulfilled.id, { vehicleId: vehicle.id, idempotencyKey: 'k2' }, ACTOR),
      ),
    ).toBe('PLAN_ORDER_FULFILLED');
  });

  /* ---------------------------------------------------------------- *
   * CHE DO GOM NHOM
   * ---------------------------------------------------------------- */

  it('bai 6 -- che do ONE: hai don tren cung chiec xe -> HAI vong chay rieng', async () => {
    const vehicle = await aVehicle();
    const a = await anOrder('ORD-A', 'Kho Hà Nội', 'Hải Phòng');
    const b = await anOrder('ORD-B', 'Ninh Bình', 'Thanh Hóa');

    const first = await planning.commit(
      a.id,
      { vehicleId: vehicle.id, idempotencyKey: 'a' },
      ACTOR,
    );
    const second = await planning.commit(
      b.id,
      { vehicleId: vehicle.id, idempotencyKey: 'b' },
      ACTOR,
    );

    expect(second.run.id).not.toBe(first.run.id);
    expect(second.plan.outcome).toBe('NEW_RUN');
    expect(await movement.listRuns()).toHaveLength(2);
  });

  it('bai 7 + bai 8 -- che do MULTI: mot vong chay, va DUNG MOT chang rong xen giua', async () => {
    planning = build(planningPolicy('MULTI_ORDER_RUN'));
    const vehicle = await aVehicle();
    const a = await anOrder('ORD-A', 'Kho Hà Nội', 'Hải Phòng');
    const b = await anOrder('ORD-B', 'Ninh Bình', 'Thanh Hóa');

    const first = await planning.commit(
      a.id,
      { vehicleId: vehicle.id, idempotencyKey: 'a' },
      ACTOR,
    );
    const second = await planning.commit(
      b.id,
      { vehicleId: vehicle.id, idempotencyKey: 'b' },
      ACTOR,
    );

    expect(second.run.id).toBe(first.run.id);
    expect(second.plan.outcome).toBe('APPENDED');

    const legs = await movement.legsOfRun(first.run.id);
    expect(
      legs.map((leg) => [leg.sequence, leg.kind, leg.originLabel, leg.destinationLabel]),
    ).toEqual([
      [1, 'EMPTY', DEPOT_LABEL, 'Kho Hà Nội'],
      [2, 'LOADED', 'Kho Hà Nội', 'Hải Phòng'],
      [3, 'EMPTY', 'Hải Phòng', 'Ninh Bình'],
      [4, 'LOADED', 'Ninh Bình', 'Thanh Hóa'],
    ]);
    // Chang rong giua giao A va lay B: DUNG MOT.
    expect(
      legs.filter((leg) => leg.kind === 'EMPTY' && leg.originLabel === 'Hải Phòng'),
    ).toHaveLength(1);
    // Va no khong mang mot nghia vu thuong mai nao.
    for (const leg of legs) if (leg.kind === 'EMPTY') expect(leg.orderId).toBeNull();
  });

  it('MULTI: don thu hai lay hang DUNG cho vua giao -> khong bia chang rong nao', async () => {
    planning = build(planningPolicy('MULTI_ORDER_RUN'));
    const vehicle = await aVehicle();
    const a = await anOrder('ORD-A', 'Kho Hà Nội', 'Hải Phòng');
    const b = await anOrder('ORD-B', 'Hải Phòng', 'Thanh Hóa');

    const first = await planning.commit(
      a.id,
      { vehicleId: vehicle.id, idempotencyKey: 'a' },
      ACTOR,
    );
    await planning.commit(b.id, { vehicleId: vehicle.id, idempotencyKey: 'b' }, ACTOR);

    const legs = await movement.legsOfRun(first.run.id);
    expect(
      legs.filter((leg) => leg.kind === 'EMPTY' && leg.originLabel === 'Hải Phòng'),
    ).toHaveLength(0);
    expect(legs).toHaveLength(3);
  });

  /* ---------------------------------------------------------------- *
   * CHANG: BAT BIEN VA REPLAN
   * ---------------------------------------------------------------- */

  it('bai 4 -- chang DA HOAN THANH khong doi trang thai duoc nua', async () => {
    const vehicle = await aVehicle();
    const order = await anOrder('ORD-A', 'Kho Hà Nội', 'Hải Phòng');
    const { legs } = await planning.commit(
      order.id,
      { vehicleId: vehicle.id, idempotencyKey: 'a' },
      ACTOR,
    );
    const loaded = legs.find((leg) => leg.kind === 'LOADED')!;
    await runLeg(loaded.id);

    expect(await reasonOf(() => movement.transitionLeg(loaded.id, 'IN_TRANSIT', ACTOR))).toBe(
      'LEG_ALREADY_TERMINAL',
    );
    expect(await reasonOf(() => movement.cancelLeg(loaded.id, 'doi y', ACTOR))).toBe(
      'LEG_CANCEL_ALREADY_COMPLETED',
    );
  });

  it('chang DA LAN BANH khong huy duoc — km that khong bi xoa bang mot lan bam', async () => {
    const vehicle = await aVehicle();
    const order = await anOrder('ORD-A', 'Kho Hà Nội', 'Hải Phòng');
    const { legs } = await planning.commit(
      order.id,
      { vehicleId: vehicle.id, idempotencyKey: 'a' },
      ACTOR,
    );
    const empty = legs.find((leg) => leg.kind === 'EMPTY')!;
    await movement.transitionLeg(empty.id, 'IN_TRANSIT', ACTOR);

    expect(await reasonOf(() => movement.cancelLeg(empty.id, 'doi y', ACTOR))).toBe(
      'LEG_CANCEL_ALREADY_STARTED',
    );
  });

  it('chang dau lan banh thi vong chay TU DONG sang ACTIVE — khong ai bam "bat dau"', async () => {
    const vehicle = await aVehicle();
    const order = await anOrder('ORD-A', 'Kho Hà Nội', 'Hải Phòng');
    const { run, legs } = await planning.commit(
      order.id,
      { vehicleId: vehicle.id, idempotencyKey: 'a' },
      ACTOR,
    );
    expect(run.status).toBe('PLANNED');

    await movement.transitionLeg(legs[0]!.id, 'IN_TRANSIT', ACTOR);
    expect((await movement.getRun(run.id)).run.status).toBe('ACTIVE');
  });

  it('bai 5 -- huy ke hoach: chang chua chay bi huy, don duoc lap lai, va co dau vet', async () => {
    const vehicle = await aVehicle();
    const order = await anOrder('ORD-A', 'Kho Hà Nội', 'Hải Phòng');
    const first = await planning.commit(
      order.id,
      { vehicleId: vehicle.id, idempotencyKey: 'a' },
      ACTOR,
    );

    const cancelled = await planning.cancelPlan(first.plan.id, 'dieu xe khac', ACTOR);
    expect(cancelled.cancelledAt).not.toBeNull();
    expect(cancelled.cancellationReason).toBe('dieu xe khac');

    for (const leg of await movement.legsOfRun(first.run.id)) {
      expect(leg.status).toBe('CANCELLED');
    }

    // Don duoc tu do -> lap lai duoc tren mot chiec xe khac.
    const other = await aVehicle('29C-22222');
    const again = await planning.commit(
      order.id,
      { vehicleId: other.id, idempotencyKey: 'b' },
      ACTOR,
    );
    expect(again.run.id).not.toBe(first.run.id);
  });

  it('khong huy duoc ke hoach ma chang co hang DA chay xong', async () => {
    const vehicle = await aVehicle();
    const order = await anOrder('ORD-A', 'Kho Hà Nội', 'Hải Phòng');
    const { plan, legs } = await planning.commit(
      order.id,
      { vehicleId: vehicle.id, idempotencyKey: 'a' },
      ACTOR,
    );
    await runLeg(legs.find((leg) => leg.kind === 'EMPTY')!.id);
    await runLeg(legs.find((leg) => leg.kind === 'LOADED')!.id);

    expect(await reasonOf(() => planning.cancelPlan(plan.id, 'doi y', ACTOR))).toBe(
      'PLAN_CANCEL_LEG_COMPLETED',
    );
  });

  /* ---------------------------------------------------------------- *
   * DONG VONG CHAY
   * ---------------------------------------------------------------- */

  it('bai 12 -- con chang tuong lai thi KHONG dong, va noi ro vi sao', async () => {
    const vehicle = await aVehicle();
    const order = await anOrder('ORD-A', 'Kho Hà Nội', 'Hải Phòng');
    const { run, legs } = await planning.commit(
      order.id,
      { vehicleId: vehicle.id, idempotencyKey: 'a' },
      ACTOR,
    );
    await runLeg(legs.find((leg) => leg.kind === 'EMPTY')!.id);

    const outcome = await planning.settleRunClosure(run.id);
    expect(outcome.closed).toBe(false);
    expect(outcome.verdict.blockers).toEqual(
      expect.arrayContaining(['LEG_STILL_OPEN', 'PLAN_STILL_OPEN']),
    );
  });

  it('bai 13 -- ve bai va het viec: HE THONG dong, khong ai bam', async () => {
    const vehicle = await aVehicle();
    const order = await anOrder('ORD-A', 'Kho Hà Nội', 'Hải Phòng');
    const { run, legs } = await planning.commit(
      order.id,
      { vehicleId: vehicle.id, idempotencyKey: 'a' },
      ACTOR,
    );
    await runLeg(legs.find((leg) => leg.kind === 'EMPTY')!.id);
    await runLeg(legs.find((leg) => leg.kind === 'LOADED')!.id);

    // Xe chay rong ve bai. Chang nay do VAN HANH ghi khi no xay ra that — he thong khong bia no.
    const home = await movement.addLeg(
      run.id,
      { sequence: 3, kind: 'EMPTY', originLabel: 'Hải Phòng', destinationLabel: DEPOT_LABEL },
      ACTOR,
    );
    await runLeg(home.id);

    const outcome = await planning.settleRunClosure(run.id);
    expect(outcome.closed).toBe(true);
    expect(outcome.verdict.trigger).toBe('DEPOT_RETURN');
    expect(outcome.run.status).toBe('COMPLETED');
  });

  it('goi lan hai KHONG dong lai lan nua va KHONG nem', async () => {
    const vehicle = await aVehicle();
    const order = await anOrder('ORD-A', 'Kho Hà Nội', DEPOT_LABEL);
    const { run, legs } = await planning.commit(
      order.id,
      { vehicleId: vehicle.id, idempotencyKey: 'a' },
      ACTOR,
    );
    for (const leg of legs) await runLeg(leg.id);

    expect((await planning.settleRunClosure(run.id)).closed).toBe(true);
    const again = await planning.settleRunClosure(run.id);
    expect(again.closed).toBe(false);
    expect(again.run.status).toBe('COMPLETED');
  });

  it('bai 14 -- dong vong chay KHONG dong vao trang thai thuong mai cua don', async () => {
    const vehicle = await aVehicle();
    const order = await anOrder('ORD-A', 'Kho Hà Nội', DEPOT_LABEL);
    const { run, legs } = await planning.commit(
      order.id,
      { vehicleId: vehicle.id, idempotencyKey: 'a' },
      ACTOR,
    );
    for (const leg of legs) await runLeg(leg.id);
    await planning.settleRunClosure(run.id);

    const after = await movement.getOrder(order.id);
    expect(after.status).toBe('OPEN');
    expect(after.cancelledAt).toBeNull();
  });

  it('bai 3 + bai 15 -- vong chay da dong khong nhan chang moi; don moi mo vong chay MOI', async () => {
    planning = build(planningPolicy('MULTI_ORDER_RUN'));
    const vehicle = await aVehicle();
    const a = await anOrder('ORD-A', 'Kho Hà Nội', DEPOT_LABEL);
    const first = await planning.commit(
      a.id,
      { vehicleId: vehicle.id, idempotencyKey: 'a' },
      ACTOR,
    );
    for (const leg of first.legs) await runLeg(leg.id);
    expect((await planning.settleRunClosure(first.run.id)).closed).toBe(true);

    // Duong THU CONG cu cung phai dong.
    expect(
      await reasonOf(() =>
        movement.addLeg(
          first.run.id,
          { sequence: 9, kind: 'EMPTY', originLabel: 'A', destinationLabel: 'B' },
          ACTOR,
        ),
      ),
    ).toBe('LEG_RUN_TERMINAL');

    const b = await anOrder('ORD-B', 'Ninh Bình', 'Thanh Hóa');
    const second = await planning.commit(
      b.id,
      { vehicleId: vehicle.id, idempotencyKey: 'b' },
      ACTOR,
    );
    expect(second.run.id).not.toBe(first.run.id);
    expect(second.plan.outcome).toBe('NEW_RUN');
  });

  it('bai 16 -- doi che do gom nhom KHONG viet lai lich su da chot', async () => {
    planning = build(planningPolicy('MULTI_ORDER_RUN'));
    const vehicle = await aVehicle();
    const a = await anOrder('ORD-A', 'Kho Hà Nội', 'Hải Phòng');
    const b = await anOrder('ORD-B', 'Hải Phòng', 'Thanh Hóa');
    const first = await planning.commit(
      a.id,
      { vehicleId: vehicle.id, idempotencyKey: 'a' },
      ACTOR,
    );
    const second = await planning.commit(
      b.id,
      { vehicleId: vehicle.id, idempotencyKey: 'b' },
      ACTOR,
    );
    const legsBefore = await movement.legsOfRun(first.run.id);

    // Khach doi chinh sach sang mot-don-mot-vong-chay.
    planning = build(planningPolicy('ONE_ORDER_PER_RUN'));

    // Lich su khong doi mot dong nao.
    expect(await movement.legsOfRun(first.run.id)).toEqual(legsBefore);
    expect((await plans.find(second.plan.id))?.grouping).toBe('MULTI_ORDER_RUN');
    expect((await plans.find(second.plan.id))?.outcome).toBe('APPENDED');

    // Va chinh sach moi chi anh huong lan lap ke hoach TIEP THEO.
    const c = await anOrder('ORD-C', 'Thanh Hóa', 'Vinh');
    const third = await planning.commit(
      c.id,
      { vehicleId: vehicle.id, idempotencyKey: 'c' },
      ACTOR,
    );
    expect(third.run.id).not.toBe(first.run.id);
    expect(third.plan.grouping).toBe('ONE_ORDER_PER_RUN');
  });

  /* ---------------------------------------------------------------- *
   * DIEM KET THUC DU KIEN — nguon cho Lane M
   * ---------------------------------------------------------------- */

  it('xe chua co vong chay nao -> diem ket thuc la BAI XE', async () => {
    const vehicle = await aVehicle();
    const projection = await planning.projectVehicle(vehicle.id);
    expect(projection).toMatchObject({
      runId: null,
      endpointLabel: DEPOT_LABEL,
      endpointSource: 'DEPOT',
      openLegCount: 0,
    });
  });

  it('con chang chua chay xong -> diem ket thuc la noi xe se toi, gio ranh la CHUA BIET', async () => {
    const vehicle = await aVehicle();
    const order = await anOrder('ORD-A', 'Kho Hà Nội', 'Hải Phòng');
    await planning.commit(order.id, { vehicleId: vehicle.id, idempotencyKey: 'a' }, ACTOR);

    const projection = await planning.projectVehicle(vehicle.id);
    expect(projection).toMatchObject({
      endpointLabel: 'Hải Phòng',
      endpointSource: 'PLANNED_LEG_DESTINATION',
      freeFrom: null,
      openLegCount: 2,
    });
  });

  it('het viec ma vong chay con mo -> diem ket thuc la chang da xong sau cung', async () => {
    const vehicle = await aVehicle();
    const order = await anOrder('ORD-A', 'Kho Hà Nội', 'Hải Phòng');
    const { legs } = await planning.commit(
      order.id,
      { vehicleId: vehicle.id, idempotencyKey: 'a' },
      ACTOR,
    );
    for (const leg of legs) await runLeg(leg.id);

    const projection = await planning.projectVehicle(vehicle.id);
    expect(projection).toMatchObject({
      endpointLabel: 'Hải Phòng',
      endpointSource: 'COMPLETED_LEG_DESTINATION',
      openLegCount: 0,
    });
    expect(projection.freeFrom).not.toBeNull();
  });

  it('chinh sach doc duoc qua be mat chan doan', async () => {
    expect(await planning.describePolicy()).toEqual({
      grouping: 'ONE_ORDER_PER_RUN',
      depot: {
        kind: 'RESOLVED',
        depot: { code: 'DEPOT-HN', label: DEPOT_LABEL },
        // Khong co danh ba nao duoc tiem: bai xe doc tu cau hinh — dung nhu truoc #395.
        source: 'TENANT_CONFIG',
      },
      closure: { idleHours: null },
    });
  });

  it('khong khai bai xe: van lap ke hoach duoc, chi la khong sinh chang rong dau tien', async () => {
    planning = build(planningPolicy('ONE_ORDER_PER_RUN', { depots: [] }));
    const vehicle = await aVehicle();
    const order = await anOrder('ORD-A', 'Kho Hà Nội', 'Hải Phòng');
    const { legs } = await planning.commit(
      order.id,
      { vehicleId: vehicle.id, idempotencyKey: 'a' },
      ACTOR,
    );
    expect(legs).toHaveLength(1);
    expect(legs[0]?.kind).toBe('LOADED');
  });

  it('hai bai xe dang hoat dong: KHONG doan bua, va van lap ke hoach duoc', async () => {
    planning = build(
      planningPolicy('ONE_ORDER_PER_RUN', {
        depots: [
          { code: 'DEPOT-HN', label: DEPOT_LABEL },
          { code: 'DEPOT-HCM', label: 'Bãi xe Sài Gòn' },
        ],
      }),
    );
    const vehicle = await aVehicle();
    const order = await anOrder('ORD-A', 'Kho Hà Nội', 'Hải Phòng');
    const { legs } = await planning.commit(
      order.id,
      { vehicleId: vehicle.id, idempotencyKey: 'a' },
      ACTOR,
    );
    expect(legs).toHaveLength(1);
    expect((await planning.describePolicy()).depot.kind).toBe('AMBIGUOUS');
  });

  it('nguong nghi: xa bai va qua gio thi he thong dong', async () => {
    planning = build(planningPolicy('ONE_ORDER_PER_RUN', { closure: { idleHours: 8 } }));
    const vehicle = await aVehicle();
    const order = await anOrder('ORD-A', 'Kho Hà Nội', 'Hải Phòng');
    const { run, legs } = await planning.commit(
      order.id,
      { vehicleId: vehicle.id, idempotencyKey: 'a' },
      ACTOR,
    );
    for (const leg of legs) await runLeg(leg.id);

    expect((await planning.settleRunClosure(run.id)).closed).toBe(false);

    now = new Date(now.getTime() + 9 * 3_600_000);
    const outcome = await planning.settleRunClosure(run.id);
    expect(outcome.closed).toBe(true);
    expect(outcome.verdict.trigger).toBe('IDLE_TIMEOUT');
  });
});
