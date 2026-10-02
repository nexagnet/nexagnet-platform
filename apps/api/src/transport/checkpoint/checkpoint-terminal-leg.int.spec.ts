import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaAuditLogRepository } from '../../audit/prisma-audit-log.repository.js';
import { PrismaService } from '../../config/prisma.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { isTerminalRunStatus } from '../movement/movement-lifecycle.js';
import { MovementService } from '../movement/movement.service.js';
import type { RunLegStatus } from '../movement/movement.types.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import {
  MovementRunWriteGuard,
  RunWriteGuard,
  type RunWriteScope,
  type RunWriteTransaction,
} from '../movement/run-write-guard.port.js';
import { PlanningService } from '../planning/planning.service.js';
import type { TransportPlanningPolicy } from '../planning/planning.types.js';
import { PrismaRunPlanRepository } from '../planning/prisma-planning.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import { CheckpointLegFieldTruthSource } from './checkpoint-leg-field-truth.source.js';
import {
  TransportCheckpointCoreFactsAdapter,
  TransportCheckpointLocationFacts,
} from './checkpoint-facts.port.js';
import type { CheckpointRepository, CreateCheckpointInput } from './checkpoint.repository.js';
import { CheckpointService } from './checkpoint.service.js';
import type { RunCheckpoint, RunCheckpointType } from './checkpoint.types.js';
import { PrismaCheckpointRepository } from './prisma-checkpoint.repository.js';

/**
 * CHANG DA KET THUC KHONG NHAN MOC MOI — `#354`, tren POSTGRES THAT.
 *
 * ============================================================================================
 * BAT BIEN
 * ============================================================================================
 *
 *   `RunLeg.status` = `COMPLETED`/`CANCELLED`  ->  KHONG mot moc MOI nao duoc neo vao chang do.
 *
 * Ngoai le duy nhat la GUI LAI: cung `runId + type + clientEventId` da thanh cong TRUOC khi chang
 * ket thuc thi van nhan lai dung moc cu.
 *
 * `#332` do tren DB live: sau Run `COMPLETED` mang moc `DELIVERY_*` ghi ngay 20/09 len chang RONG #1
 * da `COMPLETED` tu 19/09. `#350` chan hang-tren-chang-rong; nhung truoc `#354` khong cong nao doc
 * TRANG THAI chang, va lan doi trang thai chang cung khong di qua khoa ma lan ghi moc gianh.
 *
 * ============================================================================================
 * VI SAO PHAI LA POSTGRES, VA VI SAO PHAI EP THU TU
 * ============================================================================================
 *
 * Mot phep kiem som (`findLeg()` roi `if`) dong duoc hinh dang TUAN TU. No khong dong duoc CUA SO:
 * lan ghi moc doc thay chang `IN_TRANSIT`, roi van phong hoan tat chang, roi lan ghi moc moi lay
 * khoa va ghi. Cua so do chi ton tai giua HAI giao dich that — ban trong bo nho don luong khong
 * bao gio chay vao no.
 *
 * Hai dua duoc EP thu tu bang tay (K-IT-06/07, K-IT-09/10), vi mot bai "chay song song roi xem"
 * co the xanh ma chua tung cham toi cua so:
 *
 *   · lan ghi moc DUNG o cua khoa (da qua phep kiem som), lan ket thuc chang chay xong -> moc phai
 *     bi tu choi `CHECKPOINT_LEG_TERMINAL` (cong DUOI khoa doc lai chang);
 *   · lan ghi moc GIU khoa, lan ket thuc chang phai XEP HANG sau no — do bang `pg_locks`, khong
 *     bang mot nhip ngu: mot lenh ket thuc chang khong gianh cung khoa se khong bao gio xuat hien
 *     trong hang doi cua giao dich dang giu khoa.
 *
 * Hai bai dua THAT (K-IT-08, K-IT-11) chay nhieu vong khong xep thu tu, va dung `xmin` lam nhan
 * chung thu tu commit: tren mot hang da khoa, giao dich nao LAY khoa truoc thi nhan `xid` truoc
 * (cau `FOR UPDATE` la lenh dau tien can `xid` cua ca hai duong ghi), nen moc da commit phai CU hon
 * ban ghi ket thuc chang. Moc moi hon ban ghi ket thuc = dung ket cuc bi cam.
 *
 * Chay bang `RUN_PRISMA_IT=1`; khong co bien do thi ca khoi khong chay.
 */

const CODE_PREFIX = 'IT-K354';
const PLATE_PREFIX = 'IT-K354-XE';
const PHONE_PREFIX = '0988K354';
const ACTOR = 'it-k354';

/** Cung con so voi moi tep IT cham trigger cua moc/phien cho — xem `transport-waiting.int.spec.ts`. */
const WAITING_TRIGGER_LOCK = 279_005;
const PROTECTED_TABLES = [
  ['TransportDeliveryWaitingSession', 'transport_waiting_session_immutable'],
  ['TransportRunCheckpoint', 'transport_run_checkpoint_append_only'],
] as const;

const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const DEPOT_LABEL = 'IT-K354 Bãi xe';
const PICKUP_LABEL = 'IT-K354 Kho lấy hàng';
const FAR_LABEL = 'IT-K354 Điểm giao xa';
const OVERRIDE_REASON = 'IT-K354 lái xe báo mất sóng, văn phòng chốt chặng';
const CANCEL_REASON = 'IT-K354 bỏ chặng chưa chạy';
const LEG_TERMINAL_MESSAGE = 'Chặng đã kết thúc — không ghi thêm mốc vào chặng này.';

/** So vong cua moi bai dua THAT. Moi vong la mot vong chay moi — chang chi ket thuc duoc mot lan. */
const STRESS_ROUNDS = 6;
/** Tran cho mot nguoi ghi xuat hien trong hang doi cua khoa — du rong cho may CI dang tai. */
const LOCK_QUEUE_TIMEOUT_MS = 15_000;
const TEST_TIMEOUT_MS = 60_000;
const STRESS_TIMEOUT_MS = 180_000;

const POLICY: TransportPlanningPolicy = {
  grouping: 'ONE_ORDER_PER_RUN',
  depots: [{ code: 'IT-K354-DEPOT', label: DEPOT_LABEL }],
  closure: { idleHours: null },
  sweep: { intervalSeconds: 60, batchSize: 50 },
};

type Outcome<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

const reasonOfError = (error: unknown): string =>
  error instanceof TransportDomainError ? error.reason : `UNEXPECTED:${String(error)}`;

/** Ket cuc cua mot lenh, KHONG nem — de hai lenh song song cung duoc doc sau khi ca hai xong. */
const settle = <T>(work: Promise<T>): Promise<Outcome<T>> =>
  work.then(
    (value) => ({ ok: true, value }) as const,
    (error: unknown) => ({ ok: false, reason: reasonOfError(error) }) as const,
  );

/** Nguyen loi — de khang dinh ca LOAI loi va CAU CHU len man hinh, khong chi ma may loc. */
const errorOf = async (work: Promise<unknown>): Promise<TransportDomainError> => {
  try {
    await work;
  } catch (error) {
    if (error instanceof TransportDomainError) return error;
    throw error;
  }
  throw new Error('khong nem loi nao ca');
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Mot tin hieu doi duoc bang `await` — de biet CHAC mot nguoi ghi da toi dung cho. */
const aSignal = <T>() => {
  let fire!: (value: T) => void;
  const fired = new Promise<T>((resolve) => {
    fire = resolve;
  });
  return { fire, fired };
};

/** `xid` cua giao dich dang mo — dang so ma `pg_locks.transactionid` dung (32 bit). */
const currentXid = async (tx: RunWriteTransaction): Promise<string> => {
  const rows = await (tx as PrismaService).$queryRaw<{ xid: string }[]>`
    SELECT (txid_current() % 4294967296)::text AS "xid"`;
  return rows[0]!.xid;
};

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  '#354 — chang da ket thuc khong nhan moc moi, va khong dua duoc voi lan ket thuc chang',
  () => {
    const prisma = new PrismaService();
    const movementRepo = new PrismaMovementRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const checkpointRepo = new PrismaCheckpointRepository(prisma);
    const audit = new AuditLogService(new PrismaAuditLogRepository(prisma));
    const movement = new MovementService(movementRepo, fleet, audit, CORE_POLICY);
    const planning = new PlanningService(
      movement,
      new PrismaRunPlanRepository(prisma),
      fleet,
      audit,
      CORE_POLICY,
      POLICY,
    );
    /** Nguon hien truong THAT — dung thu `RunsController` chuyen vao `transitionLeg()`. */
    const fieldTruth = new CheckpointLegFieldTruthSource(checkpointRepo);
    const guard = new MovementRunWriteGuard(movementRepo);

    const noLocation = new (class extends TransportCheckpointLocationFacts {
      async findObservation(): Promise<null> {
        return null;
      }
    })();

    /**
     * Bo `transport-checkpoint` DAY DU nhu luc chay. Hai bai ep thu tu thay DUNG MOT thu: cong khoa
     * (dung truoc khoa) hoac kho moc (dung ben trong khoa) — moi thu con lai la hang that.
     */
    const checkpointsWith = (
      over: { readonly repo?: CheckpointRepository; readonly guard?: RunWriteGuard } = {},
    ) =>
      new CheckpointService(
        over.repo ?? checkpointRepo,
        new TransportCheckpointCoreFactsAdapter(movementRepo, fleet),
        noLocation,
        over.guard ?? guard,
        CORE_POLICY,
        // Chinh sach vi tri RONG: tep nay hoi ve CHANG va KHOA, khong hoi ban dinh vi.
        { locationRequiredTypes: [] },
      );
    const checkpoints = checkpointsWith();

    async function cleanup(): Promise<void> {
      const vehicles = await prisma.transportVehicle.findMany({
        where: { registrationPlate: { startsWith: PLATE_PREFIX } },
        select: { id: true },
      });
      const vehicleIds = vehicles.map((vehicle) => vehicle.id);
      const runIds = (
        await prisma.transportVehicleRun.findMany({
          where: { vehicleId: { in: vehicleIds } },
          select: { id: true },
        })
      ).map((run) => run.id);
      const legIds = (
        await prisma.transportRunLeg.findMany({
          where: { runId: { in: runIds } },
          select: { id: true },
        })
      ).map((leg) => leg.id);

      // Khoa tu van MUC GIAO DICH, moi lenh trong CUNG mot giao dich (cung ly do voi
      // `waiting-delivery-accepted.int.spec.ts`): khoa muc phien qua pool Prisma co the nha tren
      // mot ket noi khac ("you don't own a lock"), ro lai va chan buoc don cua moi tep dung chung so.
      await prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${WAITING_TRIGGER_LOCK})`);
          for (const [table, trigger] of PROTECTED_TABLES) {
            await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${trigger}"`);
          }
          await tx.transportDeliveryWaitingSession.deleteMany({
            where: { runId: { in: runIds } },
          });
          await tx.transportRunCheckpoint.deleteMany({ where: { runId: { in: runIds } } });
          for (const [table, trigger] of PROTECTED_TABLES) {
            await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER "${trigger}"`);
          }
        },
        { maxWait: 10_000, timeout: 45_000 },
      );

      await prisma.transportOrderRunPlan.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });
      await prisma.transportOrder.deleteMany({ where: { code: { startsWith: CODE_PREFIX } } });
      await prisma.transportVehicleAssignment.deleteMany({
        where: { vehicleId: { in: vehicleIds } },
      });
      await prisma.transportVehicle.deleteMany({ where: { id: { in: vehicleIds } } });
      await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [{ actor: { startsWith: ACTOR } }, { entityId: { in: [...runIds, ...legIds] } }],
        },
      });
    }

    /* Tran 60 giay cho hai hook — cung ly do voi `field-truth-leg-status.int.spec.ts`. */
    beforeAll(cleanup, TEST_TIMEOUT_MS);
    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    }, TEST_TIMEOUT_MS);

    let suffix = 0;
    const next = (label: string): string => `${CODE_PREFIX}:${label}:${++suffix}`;

    /** Doi trang thai chang qua DUNG duong `RunsController` goi — kem nguon hien truong that. */
    const move = (legId: string, to: RunLegStatus, overrideReason?: string) =>
      movement.transitionLeg(legId, to, ACTOR, { fieldTruth, overrideReason });

    /**
     * Mot vong chay DANG CHAY: chot ke hoach qua duong runtime (`commit()` gan nguoi cam xe), chang
     * RONG #1 (bai -> kho) da chay xong nen vong chay `ACTIVE`, chang CO HANG #2 con `PLANNED`.
     */
    const activeRun = async () => {
      suffix += 1;
      const login = `${CODE_PREFIX}-auth-${suffix}`;
      const vehicle = await fleet.createVehicle({
        registrationPlate: `${PLATE_PREFIX}-${suffix}`,
        vehicleClass: 'Dau keo',
      });
      const driver = await fleet.createDriver({
        fullName: `${CODE_PREFIX} Lai xe ${suffix}`,
        phone: `${PHONE_PREFIX}${suffix}`,
        licenceClass: 'FC',
        licenceExpiry: '2030-01-01',
        authUserId: login,
      });
      await fleet.assignDriverToVehicle(vehicle.id, driver.id, new Date());
      const order = await movement.createOrder(
        {
          code: `${CODE_PREFIX}-ORD-${suffix}`,
          originLabel: PICKUP_LABEL,
          destinationLabel: FAR_LABEL,
          businessDate: '2026-09-22',
        },
        ACTOR,
      );
      const { run, legs } = await planning.commit(
        order.id,
        { vehicleId: vehicle.id, idempotencyKey: `${CODE_PREFIX}-KEY-${suffix}` },
        ACTOR,
      );
      // Chon chang theo LOAI, khong theo chi so — `legs[0]` la chang RONG.
      const empty = legs.find((leg) => leg.kind === 'EMPTY');
      const loaded = legs.find((leg) => leg.kind === 'LOADED');
      if (!empty || !loaded) throw new Error('commit() khong sinh du hai chang EMPTY + LOADED');
      await move(empty.id, 'IN_TRANSIT');
      await move(empty.id, 'COMPLETED');
      return { run, empty, loaded, login };
    };

    const record = (
      login: string,
      runId: string,
      legId: string,
      type: RunCheckpointType,
      clientEventId: string = next(type),
      service: CheckpointService = checkpoints,
    ) => service.recordAsDriver({ type, runId, legId, authUserId: login, clientEventId });

    /** Duong DIEU HANH ghi ho — `CheckpointsController.record`. */
    const recordAsOffice = (runId: string, legId: string | undefined, type: RunCheckpointType) =>
      checkpoints.recordAsOperator({
        type,
        runId,
        ...(legId === undefined ? {} : { legId }),
        authUserId: `${ACTOR}-dieu-hanh`,
        clientEventId: next(`office-${type}`),
      });

    /** Chang CO HANG dang chay, da toi noi giao — con thieu dung mot moc: nguoi nhan da nhan. */
    const arrivedRun = async () => {
      const running = await activeRun();
      await move(running.loaded.id, 'IN_TRANSIT');
      for (const type of ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE', 'DELIVERY_ARRIVAL'] as const) {
        await record(running.login, running.run.id, running.loaded.id, type);
      }
      return running;
    };

    /* ---------------------------- doc THANG bang ---------------------------- */

    const persistedLegStatus = async (legId: string): Promise<RunLegStatus> =>
      (
        await prisma.transportRunLeg.findUniqueOrThrow({
          where: { id: legId },
          select: { status: true },
        })
      ).status as RunLegStatus;

    const typesOnLeg = async (legId: string): Promise<string[]> =>
      (
        await prisma.transportRunCheckpoint.findMany({
          where: { legId },
          orderBy: { receivedAt: 'asc' },
          select: { type: true },
        })
      ).map((row) => row.type);

    /**
     * NHAN CHUNG THU TU COMMIT — tuoi `xmin` cua dong moc va cua ban ghi hien tai cua chang.
     *
     * Tuoi LON hon = giao dich CU hon. Xem khoi chu thich dau tep ve vi sao thu tu `xid` o day
     * trung thu tu lay khoa.
     */
    const commitAgesOf = async (checkpointId: string, legId: string) => {
      const rows = await prisma.$queryRaw<{ checkpointAge: number; legAge: number }[]>`
        SELECT
          (SELECT age("xmin") FROM "TransportRunCheckpoint" WHERE "id" = ${checkpointId})::int
            AS "checkpointAge",
          (SELECT age("xmin") FROM "TransportRunLeg" WHERE "id" = ${legId})::int AS "legAge"`;
      return rows[0]!;
    };

    /**
     * Cho toi khi CO NGUOI xep hang sau giao dich `xid` — tuc dang doi chinh khoa hang vong chay ma
     * giao dich do giu. Doc `pg_locks`, khong doan bang mot nhip ngu.
     */
    const waitForQueueBehind = async (xid: string): Promise<void> => {
      const deadline = Date.now() + LOCK_QUEUE_TIMEOUT_MS;
      for (;;) {
        const rows = await prisma.$queryRaw<{ waiting: number }[]>`
          SELECT count(*)::int AS "waiting" FROM pg_locks
          WHERE "locktype" = 'transactionid' AND "transactionid"::text = ${xid} AND NOT "granted"`;
        if ((rows[0]?.waiting ?? 0) > 0) return;
        if (Date.now() > deadline) {
          throw new Error(
            `Khong co lenh nao xep hang sau khoa cua giao dich ${xid} — lan doi trang thai chang KHONG gianh khoa vong chay`,
          );
        }
        await sleep(25);
      }
    };

    /* ---------------------- hai cach ep thu tu hai nguoi ghi ---------------------- */

    /** Lan ghi moc DUNG o cua khoa: da qua moi phep kiem som, chua lay khoa. */
    class PausedBeforeLock extends RunWriteGuard {
      constructor(
        private readonly arrived: () => void,
        private readonly gate: Promise<void>,
      ) {
        super();
      }

      async underRunLock<T>(
        runId: string,
        write: (scope: RunWriteScope) => Promise<T>,
      ): Promise<T> {
        this.arrived();
        await this.gate;
        return guard.underRunLock(runId, write);
      }
    }

    /** Lan ghi moc DANG GIU khoa, da qua cong duoi khoa, chua chen dong nao. */
    class PausedInsideLock extends PrismaCheckpointRepository {
      constructor(
        private readonly holding: (xid: string) => void,
        private readonly gate: Promise<void>,
      ) {
        super(prisma);
      }

      override async create(
        input: CreateCheckpointInput,
        tx?: RunWriteTransaction,
      ): Promise<RunCheckpoint> {
        this.holding(await currentXid(tx));
        await this.gate;
        return super.create(input, tx);
      }
    }

    /* ======================================================================================
     * TUAN TU — hinh dang ma DB live 20/09 da ghi
     * ====================================================================================== */

    it(
      'K-IT-01 — chang CO HANG da COMPLETED: moc moi bi tu choi o CA HAI duong ghi, khong dong nao duoc ghi',
      async () => {
        const { run, loaded, login } = await arrivedRun();
        await record(login, run.id, loaded.id, 'DELIVERY_ACCEPTED');
        await move(loaded.id, 'COMPLETED');
        expect(await persistedLegStatus(loaded.id)).toBe('COMPLETED');
        const before = await typesOnLeg(loaded.id);

        // `LOADING` lap lai duoc va da co `PICKUP_ARRIVAL`: tren chang con mo, no HOP LE.
        const driver = await errorOf(record(login, run.id, loaded.id, 'LOADING'));
        expect(driver).toMatchObject({
          reason: 'CHECKPOINT_LEG_TERMINAL',
          kind: 'CONFLICT',
          message: LEG_TERMINAL_MESSAGE,
        });
        const office = await errorOf(recordAsOffice(run.id, loaded.id, 'GATE_ENTRY'));
        expect(office).toMatchObject({ reason: 'CHECKPOINT_LEG_TERMINAL', kind: 'CONFLICT' });
        expect(await typesOnLeg(loaded.id)).toEqual(before);

        /*
         * DOI CHUNG AM — lenh ghi cua `main` truoc `#354`, NGUYEN VAN: duoi khoa vong chay, chi kiem
         * trang thai VONG CHAY, roi chen. Tren CHINH trang thai nay Postgres nhan no — khong rang
         * buoc, khong trigger nao cua kho chan mot moc tren chang da ket thuc. Nen cong o
         * `CheckpointService` la lop chan DUY NHAT, va hai khang dinh o tren moi co nghia.
         *
         * Dat SAU khang dinh chinh vi no lam ban chinh fixture nay (va chi fixture nay).
         */
        const legacy = await guard.underRunLock(run.id, async (scope) => {
          expect(isTerminalRunStatus(scope.run.status)).toBe(false);
          return checkpointRepo.create(
            {
              type: 'LOADING',
              runId: run.id,
              legId: loaded.id,
              recordedBy: login,
              driverId: null,
              observationId: null,
              clientEventId: next('legacy'),
              capturedAt: null,
              receivedAt: new Date(),
              businessDate: '2026-09-22',
              note: 'IT-K354 doi chung am',
            },
            scope.tx,
          );
        });
        expect(legacy.legId).toBe(loaded.id);
        expect(await typesOnLeg(loaded.id)).toEqual([...before, 'LOADING']);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'K-IT-02 — chang da CANCELLED: moc moi bi tu choi o ca hai duong ghi',
      async () => {
        const { run, loaded, login } = await activeRun();
        await movement.cancelLeg(loaded.id, CANCEL_REASON, ACTOR);
        expect(await persistedLegStatus(loaded.id)).toBe('CANCELLED');

        const driver = await settle(record(login, run.id, loaded.id, 'PICKUP_ARRIVAL'));
        const office = await settle(recordAsOffice(run.id, loaded.id, 'PICKUP_ARRIVAL'));
        expect(driver).toEqual({ ok: false, reason: 'CHECKPOINT_LEG_TERMINAL' });
        expect(office).toEqual({ ok: false, reason: 'CHECKPOINT_LEG_TERMINAL' });
        expect(await typesOnLeg(loaded.id)).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'K-IT-03 — chang RONG da COMPLETED: moc hang hoa van la CHECKPOINT_CARGO_ON_EMPTY_LEG (#350 giu nguyen)',
      async () => {
        const { run, empty, login } = await activeRun();
        expect(await persistedLegStatus(empty.id)).toBe('COMPLETED');

        // Dung hinh dang DB live 20/09: `DELIVERY_*` len chang RONG #1 da `COMPLETED`.
        const driver = await settle(record(login, run.id, empty.id, 'DELIVERY_ARRIVAL'));
        const office = await settle(recordAsOffice(run.id, empty.id, 'PICKUP_ARRIVAL'));
        expect(driver).toEqual({ ok: false, reason: 'CHECKPOINT_CARGO_ON_EMPTY_LEG' });
        expect(office).toEqual({ ok: false, reason: 'CHECKPOINT_CARGO_ON_EMPTY_LEG' });
        expect(await typesOnLeg(empty.id)).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'K-IT-04 — gui lai DUNG lenh da thanh cong truoc khi chang ket thuc: tra dung moc cu, khong ban thu hai',
      async () => {
        const { run, loaded, login } = await arrivedRun();
        const eventId = next('accepted');
        const first = await record(login, run.id, loaded.id, 'DELIVERY_ACCEPTED', eventId);
        await move(loaded.id, 'COMPLETED');

        const replayed = await record(login, run.id, loaded.id, 'DELIVERY_ACCEPTED', eventId);
        expect(replayed.id).toBe(first.id);
        // Gui lai khong phai cua sau: mot lenh MOI cung loai thi van bi chan.
        const fresh = await settle(record(login, run.id, loaded.id, 'DELIVERY_ACCEPTED'));
        expect(fresh).toEqual({ ok: false, reason: 'CHECKPOINT_LEG_TERMINAL' });
        expect(
          (await typesOnLeg(loaded.id)).filter((type) => type === 'DELIVERY_ACCEPTED'),
        ).toEqual(['DELIVERY_ACCEPTED']);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'K-IT-05 — vong chay o diem cuoi van tra CHECKPOINT_RUN_TERMINAL; moc muc vong chay khong bi bia ra mot chang',
      async () => {
        const { run, empty, loaded, login } = await arrivedRun();
        // Moc MUC VONG CHAY khong kem chang: chang RONG da `COMPLETED` khong lien quan gi toi no.
        const assigned = await recordAsOffice(run.id, undefined, 'ASSIGNED');
        expect(assigned.legId).toBeNull();

        await movement.cancelRun(run.id, 'IT-K354 huy vong chay', ACTOR);
        // Chang CO HANG con `IN_TRANSIT`, chang RONG da `COMPLETED` — vong chay dung truoc ca hai.
        const onOpenLeg = await settle(record(login, run.id, loaded.id, 'DELIVERY_ACCEPTED'));
        const onClosedLeg = await settle(recordAsOffice(run.id, empty.id, 'PICKUP_ARRIVAL'));
        expect(onOpenLeg).toEqual({ ok: false, reason: 'CHECKPOINT_RUN_TERMINAL' });
        expect(onClosedLeg).toEqual({ ok: false, reason: 'CHECKPOINT_RUN_TERMINAL' });
      },
      TEST_TIMEOUT_MS,
    );

    /* ======================================================================================
     * CUOC DUA A — moc vs HOAN TAT chang (chang CO HANG `IN_TRANSIT`, vong chay `ACTIVE`)
     * ====================================================================================== */

    it(
      'K-IT-06 — dua A: van phong hoan tat chang TRONG khe giua phep kiem som va khoa cua moc -> moc bi tu choi',
      async () => {
        const { run, loaded, login } = await arrivedRun();
        const atLock = aSignal<void>();
        const gate = aSignal<void>();
        const racing = checkpointsWith({
          guard: new PausedBeforeLock(() => atLock.fire(), gate.fired),
        });

        const recording = settle(
          record(login, run.id, loaded.id, 'DELIVERY_ACCEPTED', next('accepted'), racing),
        );
        await atLock.fired;
        // Phep kiem som cua moc DA thay chang con mo.
        expect(await persistedLegStatus(loaded.id)).toBe('IN_TRANSIT');

        const completed = await move(loaded.id, 'COMPLETED', OVERRIDE_REASON);
        expect(completed.status).toBe('COMPLETED');
        gate.fire();

        expect(await recording).toEqual({ ok: false, reason: 'CHECKPOINT_LEG_TERMINAL' });
        expect(await typesOnLeg(loaded.id)).not.toContain('DELIVERY_ACCEPTED');
        expect(await persistedLegStatus(loaded.id)).toBe('COMPLETED');
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'K-IT-07 — dua A: moc dang GIU khoa -> lenh hoan tat chang XEP HANG sau no, moc commit truoc',
      async () => {
        const { run, loaded, login } = await arrivedRun();
        const holding = aSignal<string>();
        const gate = aSignal<void>();
        const racing = checkpointsWith({
          repo: new PausedInsideLock((xid) => holding.fire(xid), gate.fired),
        });

        const recording = settle(
          record(login, run.id, loaded.id, 'DELIVERY_ACCEPTED', next('accepted'), racing),
        );
        const xid = await holding.fired;
        const completing = settle(move(loaded.id, 'COMPLETED', OVERRIDE_REASON));

        // Lenh hoan tat chang dang DOI chinh khoa ma moc giu — cung mot ranh gioi serialize.
        await waitForQueueBehind(xid);
        expect(await persistedLegStatus(loaded.id)).toBe('IN_TRANSIT');
        gate.fire();

        const recorded = await recording;
        const completed = await completing;
        if (!recorded.ok || !completed.ok) {
          throw new Error(`ca hai phai thanh cong: ${JSON.stringify({ recorded, completed })}`);
        }
        expect(completed.value.status).toBe('COMPLETED');
        const ages = await commitAgesOf(recorded.value.id, loaded.id);
        expect(ages.checkpointAge).toBeGreaterThan(ages.legAge);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'K-IT-08 — dua A THAT, nhieu vong khong xep thu tu: moi ket cuc deu tuan tu hoa duoc',
      async () => {
        for (let round = 0; round < STRESS_ROUNDS; round += 1) {
          const { run, loaded, login } = await arrivedRun();
          // Doi ben xuat phat truoc qua tung vong de ca hai thu tu deu co co hoi xay ra.
          const checkpointFirst = round % 2 === 0;
          const [recorded, completed] = await Promise.all([
            settle(
              sleep(checkpointFirst ? 0 : round).then(() =>
                record(login, run.id, loaded.id, 'DELIVERY_ACCEPTED'),
              ),
            ),
            settle(
              sleep(checkpointFirst ? round : 0).then(() =>
                move(loaded.id, 'COMPLETED', OVERRIDE_REASON),
              ),
            ),
          ]);

          expect(completed.ok).toBe(true);
          expect(await persistedLegStatus(loaded.id)).toBe('COMPLETED');
          if (recorded.ok) {
            // Moc thang: no PHAI commit truoc ban ghi ket thuc chang. Moi hon = ket cuc bi cam.
            const ages = await commitAgesOf(recorded.value.id, loaded.id);
            expect(ages.checkpointAge).toBeGreaterThan(ages.legAge);
          } else {
            expect(recorded.reason).toBe('CHECKPOINT_LEG_TERMINAL');
            expect(await typesOnLeg(loaded.id)).not.toContain('DELIVERY_ACCEPTED');
          }
        }
      },
      STRESS_TIMEOUT_MS,
    );

    /* ======================================================================================
     * CUOC DUA B — moc vs HUY chang (chang CO HANG `PLANNED`, vong chay `ACTIVE`)
     * ====================================================================================== */

    it(
      'K-IT-09 — dua B: van phong huy chang TRONG khe giua phep kiem som va khoa cua moc -> moc bi tu choi',
      async () => {
        const { run, loaded, login } = await activeRun();
        const atLock = aSignal<void>();
        const gate = aSignal<void>();
        const racing = checkpointsWith({
          guard: new PausedBeforeLock(() => atLock.fire(), gate.fired),
        });

        const recording = settle(
          record(login, run.id, loaded.id, 'PICKUP_ARRIVAL', next('pickup'), racing),
        );
        await atLock.fired;
        expect(await persistedLegStatus(loaded.id)).toBe('PLANNED');

        const cancelled = await movement.cancelLeg(loaded.id, CANCEL_REASON, ACTOR);
        expect(cancelled.status).toBe('CANCELLED');
        gate.fire();

        expect(await recording).toEqual({ ok: false, reason: 'CHECKPOINT_LEG_TERMINAL' });
        expect(await typesOnLeg(loaded.id)).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'K-IT-10 — dua B: moc dang GIU khoa -> lenh huy chang XEP HANG sau no, moc commit truoc',
      async () => {
        const { run, loaded, login } = await activeRun();
        const holding = aSignal<string>();
        const gate = aSignal<void>();
        const racing = checkpointsWith({
          repo: new PausedInsideLock((xid) => holding.fire(xid), gate.fired),
        });

        const recording = settle(
          record(login, run.id, loaded.id, 'PICKUP_ARRIVAL', next('pickup'), racing),
        );
        const xid = await holding.fired;
        const cancelling = settle(movement.cancelLeg(loaded.id, CANCEL_REASON, ACTOR));

        await waitForQueueBehind(xid);
        expect(await persistedLegStatus(loaded.id)).toBe('PLANNED');
        gate.fire();

        const recorded = await recording;
        const cancelled = await cancelling;
        if (!recorded.ok || !cancelled.ok) {
          throw new Error(`ca hai phai thanh cong: ${JSON.stringify({ recorded, cancelled })}`);
        }
        expect(cancelled.value.status).toBe('CANCELLED');
        const ages = await commitAgesOf(recorded.value.id, loaded.id);
        expect(ages.checkpointAge).toBeGreaterThan(ages.legAge);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'K-IT-11 — dua B THAT, nhieu vong khong xep thu tu: moi ket cuc deu tuan tu hoa duoc',
      async () => {
        for (let round = 0; round < STRESS_ROUNDS; round += 1) {
          const { run, loaded, login } = await activeRun();
          const checkpointFirst = round % 2 === 0;
          const [recorded, cancelled] = await Promise.all([
            settle(
              sleep(checkpointFirst ? 0 : round).then(() =>
                record(login, run.id, loaded.id, 'PICKUP_ARRIVAL'),
              ),
            ),
            settle(
              sleep(checkpointFirst ? round : 0).then(() =>
                movement.cancelLeg(loaded.id, CANCEL_REASON, ACTOR),
              ),
            ),
          ]);

          expect(cancelled.ok).toBe(true);
          expect(await persistedLegStatus(loaded.id)).toBe('CANCELLED');
          if (recorded.ok) {
            const ages = await commitAgesOf(recorded.value.id, loaded.id);
            expect(ages.checkpointAge).toBeGreaterThan(ages.legAge);
          } else {
            expect(recorded.reason).toBe('CHECKPOINT_LEG_TERMINAL');
            expect(await typesOnLeg(loaded.id)).toEqual([]);
          }
        }
      },
      STRESS_TIMEOUT_MS,
    );

    /* ======================================================================================
     * DIEM CUOI LA DIEM CUOI — hai lenh doi trang thai cung mot chang
     * ====================================================================================== */

    it(
      'K-IT-12 — "bat dau chay" va "huy" xep hang sau mot khoa: dung mot lenh thang, chang da huy khong song lai',
      async () => {
        for (let round = 0; round < 3; round += 1) {
          const { run, loaded } = await activeRun();
          const holding = aSignal<string>();
          const gate = aSignal<void>();
          // Giu khoa vong chay bang CHINH ranh gioi serialize, de hai lenh cung phai doi.
          const holder = guard.underRunLock(run.id, async (scope) => {
            holding.fire(await currentXid(scope.tx));
            await gate.fired;
          });
          const xid = await holding.fired;

          const starting = settle(move(loaded.id, 'IN_TRANSIT'));
          const cancelling = settle(movement.cancelLeg(loaded.id, CANCEL_REASON, ACTOR));
          await waitForQueueBehind(xid);
          gate.fire();
          await holder;

          const started = await starting;
          const cancelled = await cancelling;
          const status = await persistedLegStatus(loaded.id);
          expect([started, cancelled].filter((outcome) => outcome.ok)).toHaveLength(1);
          if (started.ok) {
            expect(status).toBe('IN_TRANSIT');
            expect(cancelled).toEqual({ ok: false, reason: 'LEG_CANCEL_ALREADY_STARTED' });
          } else {
            expect(status).toBe('CANCELLED');
            expect(started).toEqual({ ok: false, reason: 'LEG_ALREADY_TERMINAL' });
          }
        }
      },
      TEST_TIMEOUT_MS,
    );
  },
);
