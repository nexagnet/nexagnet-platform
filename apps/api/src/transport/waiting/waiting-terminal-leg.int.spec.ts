import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { CheckpointLegFieldTruthSource } from '../checkpoint/checkpoint-leg-field-truth.source.js';
import {
  TransportCheckpointCoreFactsAdapter,
  TransportCheckpointLocationFacts,
} from '../checkpoint/checkpoint-facts.port.js';
import { CheckpointService } from '../checkpoint/checkpoint.service.js';
import type { RunCheckpointType } from '../checkpoint/checkpoint.types.js';
import { PrismaCheckpointRepository } from '../checkpoint/prisma-checkpoint.repository.js';
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
import { PrismaWaitingSessionRepository } from './prisma-waiting.repository.js';
import { WaitingRunClosureBlockerSource } from './waiting-run-closure-blocker.source.js';
import type { CreateWaitingSessionInput, WaitingSessionRepository } from './waiting.repository.js';
import { WaitingSessionService } from './waiting.service.js';
import type { DeliveryWaitingSession } from './waiting.types.js';

/**
 * CHANG DA KET THUC KHONG MO PHIEN CHO MOI — `#358`, tren POSTGRES THAT.
 *
 * ============================================================================================
 * BAT BIEN
 * ============================================================================================
 *
 *   `RunLeg.status` = `PLANNED`/`IN_TRANSIT`   ->  lenh mo phien cho theo dung luat cu;
 *   `RunLeg.status` = `COMPLETED`/`CANCELLED`  ->  KHONG mot phien cho MOI nao duoc mo.
 *
 * Ngoai le duy nhat la GUI LAI: cung `legId + clientEventId` da thanh cong TRUOC khi chang ket thuc
 * thi van nhan lai dung phien cu.
 *
 * Hinh dang `#355` con de ho: chang CO HANG da `DELIVERY_ARRIVAL`, chua `DELIVERY_ACCEPTED`, van
 * phong hoan tat chang bang ghi de `#350`, vong chay van `ACTIVE`. Hien truong van chao `Bat dau
 * cho`, lenh mo di qua (vong chay chua dong), va phien do giu vong chay o `OPEN_WAITING_SESSION` —
 * tren mot chang da xong tu truoc.
 *
 * ============================================================================================
 * VI SAO PHAI LA POSTGRES, VA VI SAO PHAI EP THU TU
 * ============================================================================================
 *
 * Cung ly le voi `checkpoint-terminal-leg.int.spec.ts` (`#354`): mot phep kiem som dong duoc hinh
 * dang TUAN TU, khong dong duoc CUA SO — lenh mo doc thay chang `IN_TRANSIT`, van phong ket thuc
 * chang, roi lenh mo moi lay khoa va chen. Cua so do chi ton tai giua HAI giao dich that.
 *
 * Lenh mo phien DA ghi duoi khoa hang `TransportVehicleRun` (`#293` R2), va lan doi trang thai chang
 * DA gianh chinh khoa do tu `#354` (`setLegStatus`). Tep nay khong them khoa thu hai; no do rang
 * lenh mo doc lai CHANG tren `RunWriteScope.legs` duoi cung khoa, o ca hai cuoc dua:
 *
 *   · dua A — lenh mo vs HOAN TAT chang (chang CO HANG `IN_TRANSIT`, ghi de `#350`);
 *   · dua B — lenh mo vs HUY chang (chang CO HANG con `PLANNED` nhung da co lan den noi).
 *
 * Moi cuoc dua duoc EP ca hai thu tu (cong truoc khoa; giu khoa + `pg_locks`), roi chay THAT nhieu
 * vong voi `xmin` lam nhan chung thu tu commit: tren mot hang da khoa, giao dich nao LAY khoa truoc
 * thi nhan `xid` truoc (cau `FOR UPDATE` la lenh dau tien can `xid` cua ca hai duong ghi), nen mot
 * phien da commit phai CU hon ban ghi ket thuc chang. Phien moi hon = dung ket cuc bi cam.
 *
 * Chay bang `RUN_PRISMA_IT=1`; khong co bien do thi ca khoi khong chay.
 */

const CODE_PREFIX = 'IT-W358';
const PLATE_PREFIX = 'IT-W358-XE';
const PHONE_PREFIX = '0977W358';
const ACTOR = 'it-w358';

/** Cung con so voi moi tep IT cham trigger cua moc/phien cho — xem `transport-waiting.int.spec.ts`. */
const WAITING_TRIGGER_LOCK = 279_005;
const PROTECTED_TABLES = [
  ['TransportDeliveryWaitingSession', 'transport_waiting_session_immutable'],
  ['TransportRunCheckpoint', 'transport_run_checkpoint_append_only'],
] as const;

const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const DEPOT_LABEL = 'IT-W358 Bãi xe';
const PICKUP_LABEL = 'IT-W358 Kho lấy hàng';
const FAR_LABEL = 'IT-W358 Điểm giao xa';
const OVERRIDE_REASON = 'IT-W358 lái xe mất sóng ở nơi giao, văn phòng chốt chặng';
const CANCEL_REASON = 'IT-W358 bỏ chặng chưa lăn bánh';
const LEG_TERMINAL_MESSAGE = 'Chặng đã kết thúc — không mở phiên chờ trên chặng này.';

/** So vong cua moi bai dua THAT. Moi vong la mot vong chay moi — chang chi ket thuc duoc mot lan. */
const STRESS_ROUNDS = 6;
/** Tran cho mot nguoi ghi xuat hien trong hang doi cua khoa — du rong cho may CI dang tai. */
const LOCK_QUEUE_TIMEOUT_MS = 15_000;
const TEST_TIMEOUT_MS = 60_000;
const STRESS_TIMEOUT_MS = 180_000;

const POLICY: TransportPlanningPolicy = {
  grouping: 'ONE_ORDER_PER_RUN',
  depots: [{ code: 'IT-W358-DEPOT', label: DEPOT_LABEL }],
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
  '#358 — chang da ket thuc khong mo phien cho moi, va khong dua duoc voi lan ket thuc chang',
  () => {
    const prisma = new PrismaService();
    const movementRepo = new PrismaMovementRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const checkpointRepo = new PrismaCheckpointRepository(prisma);
    const sessionRepo = new PrismaWaitingSessionRepository(prisma);
    const audit = new AuditLogService(new InMemoryAuditLogRepository());
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
    const core = new TransportCheckpointCoreFactsAdapter(movementRepo, fleet);
    /** Nguon chan dong vong chay THAT cua phien cho — `OPEN_WAITING_SESSION`. */
    const waitingBlockers = new WaitingRunClosureBlockerSource(sessionRepo);

    const noLocation = new (class extends TransportCheckpointLocationFacts {
      async findObservation(): Promise<null> {
        return null;
      }
    })();

    /** Ghi moc hien truong THAT — de neo `DELIVERY_ARRIVAL` la mot moc co that, khong gieo tay. */
    const checkpoints = new CheckpointService(
      checkpointRepo,
      core,
      noLocation,
      guard,
      CORE_POLICY,
      // Chinh sach vi tri RONG: tep nay hoi ve CHANG va KHOA, khong hoi ban dinh vi.
      { locationRequiredTypes: [] },
    );

    /**
     * `WaitingSessionService` DAY DU nhu luc chay. Hai bai ep thu tu thay DUNG MOT thu: cong khoa
     * (dung truoc khoa) hoac kho phien cho (dung ben trong khoa) — moi thu con lai la hang that.
     */
    const waitingWith = (
      over: { readonly sessions?: WaitingSessionRepository; readonly guard?: RunWriteGuard } = {},
    ) =>
      new WaitingSessionService(
        over.sessions ?? sessionRepo,
        checkpointRepo,
        core,
        over.guard ?? guard,
        CORE_POLICY,
      );
    const waiting = waitingWith();

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
      // Dau vet cua lan dong he thong (WL-IT-11) nam CUNG giao dich voi buoc chuyen, tren Postgres.
      await prisma.auditLog.deleteMany({ where: { entityId: { in: runIds } } });
    }

    /* Tran 60 giay cho hai hook — cung ly do voi `checkpoint-terminal-leg.int.spec.ts`. */
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
     * RONG (bai -> kho) da chay xong nen vong chay `ACTIVE`, chang CO HANG con `PLANNED`.
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
      return { run, loaded, login, driverId: driver.id };
    };

    const record = (login: string, runId: string, legId: string, type: RunCheckpointType) =>
      checkpoints.recordAsDriver({
        type,
        runId,
        legId,
        authUserId: login,
        clientEventId: next(type),
      });

    /** Ghi chuoi hien truong den `Da den noi` va tra ve moc neo `DELIVERY_ARRIVAL`. */
    const arriveAtDelivery = async (login: string, runId: string, legId: string) => {
      await record(login, runId, legId, 'PICKUP_ARRIVAL');
      await record(login, runId, legId, 'PICKUP_DEPARTURE');
      return (await record(login, runId, legId, 'DELIVERY_ARRIVAL')).id;
    };

    /** Dua A: chang CO HANG DANG CHAY, da toi noi giao, CHUA co nguoi nhan nhan hang. */
    const arrivedRun = async () => {
      const running = await activeRun();
      await move(running.loaded.id, 'IN_TRANSIT');
      const arrivalId = await arriveAtDelivery(running.login, running.run.id, running.loaded.id);
      return { ...running, arrivalId };
    };

    /**
     * Dua B: chang CO HANG con `PLANNED` nhung hien truong DA ghi toi noi giao — moc khong day trang
     * thai chang (`#332`), va chi chang `PLANNED` moi huy duoc (`evaluateLegCancel`).
     */
    const arrivedPlannedRun = async () => {
      const running = await activeRun();
      const arrivalId = await arriveAtDelivery(running.login, running.run.id, running.loaded.id);
      return { ...running, arrivalId };
    };

    const startWaiting = (
      login: string,
      runId: string,
      legId: string,
      arrivalCheckpointId: string,
      clientEventId: string = next('wait'),
      service: WaitingSessionService = waiting,
    ) =>
      service.start({
        runId,
        legId,
        arrivalCheckpointId,
        reason: 'RECEIVER_NOT_READY',
        clientEventId,
        authUserId: login,
      });

    /* ---------------------------- doc THANG bang ---------------------------- */

    const persistedLegStatus = async (legId: string): Promise<RunLegStatus> =>
      (
        await prisma.transportRunLeg.findUniqueOrThrow({
          where: { id: legId },
          select: { status: true },
        })
      ).status as RunLegStatus;

    const sessionsOnLeg = async (legId: string) =>
      prisma.transportDeliveryWaitingSession.findMany({
        where: { legId },
        orderBy: { startedAt: 'asc' },
        select: { id: true, status: true },
      });

    /**
     * NHAN CHUNG THU TU COMMIT — tuoi `xmin` cua dong phien cho va cua ban ghi hien tai cua chang.
     *
     * Tuoi LON hon = giao dich CU hon. Xem khoi chu thich dau tep ve vi sao thu tu `xid` o day
     * trung thu tu lay khoa.
     */
    const commitAgesOf = async (sessionId: string, legId: string) => {
      const rows = await prisma.$queryRaw<{ sessionAge: number; legAge: number }[]>`
        SELECT
          (SELECT age("xmin") FROM "TransportDeliveryWaitingSession" WHERE "id" = ${sessionId})::int
            AS "sessionAge",
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

    /** Lenh mo phien DUNG o cua khoa: da qua moi phep kiem som, chua lay khoa. */
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

    /** Lenh mo phien DANG GIU khoa, da qua cong duoi khoa, chua chen dong nao. */
    class PausedInsideLock extends PrismaWaitingSessionRepository {
      constructor(
        private readonly holding: (xid: string) => void,
        private readonly gate: Promise<void>,
      ) {
        super(prisma);
      }

      override async create(
        input: CreateWaitingSessionInput,
        tx?: RunWriteTransaction,
      ): Promise<DeliveryWaitingSession> {
        this.holding(await currentXid(tx));
        await this.gate;
        return super.create(input, tx);
      }
    }

    /* ======================================================================================
     * TUAN TU — hinh dang `#355` con de ho
     * ====================================================================================== */

    it(
      'WL-IT-01 — chang CO HANG da COMPLETED (ghi de #350) sau `Da den noi`: lenh mo moi bi tu choi, khong phien nao',
      async () => {
        const { run, loaded, login, driverId, arrivalId } = await arrivedRun();
        await move(loaded.id, 'COMPLETED', OVERRIDE_REASON);
        expect(await persistedLegStatus(loaded.id)).toBe('COMPLETED');

        const error = await errorOf(startWaiting(login, run.id, loaded.id, arrivalId));
        expect(error).toMatchObject({
          reason: 'WAITING_LEG_TERMINAL',
          kind: 'CONFLICT',
          message: LEG_TERMINAL_MESSAGE,
        });
        expect(await sessionsOnLeg(loaded.id)).toEqual([]);
        // Vong chay van `ACTIVE` — dung hinh dang ma truoc `#358` lenh mo di qua.
        const runRow = await prisma.transportVehicleRun.findUniqueOrThrow({
          where: { id: run.id },
          select: { status: true },
        });
        expect(runRow.status).toBe('ACTIVE');

        /*
         * DOI CHUNG AM — lenh ghi cua `main` truoc `#358`, NGUYEN VAN: duoi khoa vong chay, chi kiem
         * trang thai VONG CHAY, roi chen. Tren CHINH trang thai nay Postgres nhan no — khong rang
         * buoc, khong trigger nao cua kho chan mot phien cho tren chang da ket thuc. Nen cong o
         * `WaitingSessionService` la lop chan DUY NHAT, va khang dinh o tren moi co nghia.
         *
         * Dat SAU khang dinh chinh vi no lam ban chinh fixture nay (va chi fixture nay).
         */
        const legacy = await guard.underRunLock(run.id, async (scope) => {
          expect(isTerminalRunStatus(scope.run.status)).toBe(false);
          return sessionRepo.create(
            {
              runId: run.id,
              legId: loaded.id,
              driverId,
              arrivalCheckpointId: arrivalId,
              reason: 'RECEIVER_NOT_READY',
              startedAt: new Date(),
              startedBy: login,
              startClientEventId: next('legacy'),
              note: 'IT-W358 doi chung am',
              businessDate: '2026-09-22',
            },
            scope.tx,
          );
        });
        expect(legacy.legId).toBe(loaded.id);
        expect(await sessionsOnLeg(loaded.id)).toEqual([{ id: legacy.id, status: 'OPEN' }]);
        // ...va dung phien do la cai giu vong chay lai: hau qua ma `#358` chan tu goc.
        expect(await waitingBlockers.blockersForRun(run.id)).toEqual(['OPEN_WAITING_SESSION']);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'WL-IT-02 — chang CO HANG da CANCELLED (con PLANNED, da `Da den noi`): lenh mo moi bi tu choi',
      async () => {
        const { run, loaded, login, arrivalId } = await arrivedPlannedRun();
        await movement.cancelLeg(loaded.id, CANCEL_REASON, ACTOR);
        expect(await persistedLegStatus(loaded.id)).toBe('CANCELLED');

        const opened = await settle(startWaiting(login, run.id, loaded.id, arrivalId));
        expect(opened).toEqual({ ok: false, reason: 'WAITING_LEG_TERMINAL' });
        expect(await sessionsOnLeg(loaded.id)).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'WL-IT-03 — gui lai DUNG lenh da mo truoc khi chang ket thuc: tra dung phien cu; lenh MOI bi chan',
      async () => {
        const { run, loaded, login, arrivalId } = await arrivedRun();
        const eventId = next('wait-once');
        const first = await startWaiting(login, run.id, loaded.id, arrivalId, eventId);
        await move(loaded.id, 'COMPLETED', OVERRIDE_REASON);

        const replayed = await startWaiting(login, run.id, loaded.id, arrivalId, eventId);
        expect(replayed.id).toBe(first.id);
        // Gui lai khong phai cua sau: mot lenh MOI tren chang da xong thi van bi chan.
        const fresh = await settle(startWaiting(login, run.id, loaded.id, arrivalId));
        expect(fresh).toEqual({ ok: false, reason: 'WAITING_LEG_TERMINAL' });
        expect(await sessionsOnLeg(loaded.id)).toEqual([{ id: first.id, status: 'OPEN' }]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'WL-IT-04 — vong chay o diem cuoi van tra WAITING_RUN_TERMINAL cho lenh moi, du chang cung da xong',
      async () => {
        const { run, loaded, login, arrivalId } = await arrivedRun();
        await move(loaded.id, 'COMPLETED', OVERRIDE_REASON);
        await movement.cancelRun(run.id, 'IT-W358 huy vong chay', ACTOR);

        const opened = await settle(startWaiting(login, run.id, loaded.id, arrivalId));
        expect(opened).toEqual({ ok: false, reason: 'WAITING_RUN_TERMINAL' });
        expect(await sessionsOnLeg(loaded.id)).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    /* ======================================================================================
     * CUOC DUA A — lenh mo vs HOAN TAT chang (chang CO HANG `IN_TRANSIT`, ghi de `#350`)
     * ====================================================================================== */

    it(
      'WL-IT-05 — dua A: van phong hoan tat chang TRONG khe giua phep kiem som va khoa cua lenh mo -> lenh mo bi tu choi',
      async () => {
        const { run, loaded, login, arrivalId } = await arrivedRun();
        const atLock = aSignal<void>();
        const gate = aSignal<void>();
        const racing = waitingWith({
          guard: new PausedBeforeLock(() => atLock.fire(), gate.fired),
        });

        const opening = settle(
          startWaiting(login, run.id, loaded.id, arrivalId, next('wait-race'), racing),
        );
        await atLock.fired;
        // Phep kiem som cua lenh mo DA thay chang con mo.
        expect(await persistedLegStatus(loaded.id)).toBe('IN_TRANSIT');

        const completed = await move(loaded.id, 'COMPLETED', OVERRIDE_REASON);
        expect(completed.status).toBe('COMPLETED');
        gate.fire();

        expect(await opening).toEqual({ ok: false, reason: 'WAITING_LEG_TERMINAL' });
        expect(await sessionsOnLeg(loaded.id)).toEqual([]);
        expect(await persistedLegStatus(loaded.id)).toBe('COMPLETED');
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'WL-IT-06 — dua A: lenh mo dang GIU khoa -> lenh hoan tat XEP HANG sau no; phien la lich su hop le, van giu vong chay, van hanh dong duoc',
      async () => {
        const { run, loaded, login, arrivalId } = await arrivedRun();
        const holding = aSignal<string>();
        const gate = aSignal<void>();
        const racing = waitingWith({
          sessions: new PausedInsideLock((xid) => holding.fire(xid), gate.fired),
        });

        const opening = settle(
          startWaiting(login, run.id, loaded.id, arrivalId, next('wait-race'), racing),
        );
        const xid = await holding.fired;
        const completing = settle(move(loaded.id, 'COMPLETED', OVERRIDE_REASON));

        // Lenh hoan tat dang DOI chinh khoa ma lenh mo giu — cung mot ranh gioi serialize.
        await waitForQueueBehind(xid);
        expect(await persistedLegStatus(loaded.id)).toBe('IN_TRANSIT');
        gate.fire();

        const opened = await opening;
        const completed = await completing;
        if (!opened.ok || !completed.ok) {
          throw new Error(`ca hai phai thanh cong: ${JSON.stringify({ opened, completed })}`);
        }
        expect(completed.value.status).toBe('COMPLETED');
        const ages = await commitAgesOf(opened.value.id, loaded.id);
        expect(ages.sessionAge).toBeGreaterThan(ages.legAge);

        /*
         * PHIEN MO TRUOC khi chang ket thuc la LICH SU THAT: no con mo, lan dong vong chay van dung
         * lai (`OPEN_WAITING_SESSION`, that bai dong), va duong don dep cua van hanh van dong duoc
         * no — `#358` khong cham vao ba dieu do.
         */
        expect(await sessionsOnLeg(loaded.id)).toEqual([{ id: opened.value.id, status: 'OPEN' }]);
        expect(await waitingBlockers.blockersForRun(run.id)).toEqual(['OPEN_WAITING_SESSION']);
        const closed = await waiting.closeByOperator({
          sessionId: opened.value.id,
          note: 'IT-W358 chặng đã chốt, lái xe quên bấm',
          authUserId: `${ACTOR}-dieu-hanh`,
        });
        expect(closed).toMatchObject({ status: 'CLOSED', closeReason: 'OPERATOR_CLOSED' });
        expect(await waitingBlockers.blockersForRun(run.id)).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'WL-IT-07 — dua A THAT, nhieu vong khong xep thu tu: moi ket cuc deu tuan tu hoa duoc',
      async () => {
        for (let round = 0; round < STRESS_ROUNDS; round += 1) {
          const { run, loaded, login, arrivalId } = await arrivedRun();
          // Doi ben xuat phat truoc qua tung vong de ca hai thu tu deu co co hoi xay ra.
          const waitingFirst = round % 2 === 0;
          const [opened, completed] = await Promise.all([
            settle(
              sleep(waitingFirst ? 0 : round).then(() =>
                startWaiting(login, run.id, loaded.id, arrivalId),
              ),
            ),
            settle(
              sleep(waitingFirst ? round : 0).then(() =>
                move(loaded.id, 'COMPLETED', OVERRIDE_REASON),
              ),
            ),
          ]);

          expect(completed.ok).toBe(true);
          expect(await persistedLegStatus(loaded.id)).toBe('COMPLETED');
          if (opened.ok) {
            // Phien thang: no PHAI commit truoc ban ghi ket thuc chang. Moi hon = ket cuc bi cam.
            const ages = await commitAgesOf(opened.value.id, loaded.id);
            expect(ages.sessionAge).toBeGreaterThan(ages.legAge);
          } else {
            expect(opened.reason).toBe('WAITING_LEG_TERMINAL');
            expect(await sessionsOnLeg(loaded.id)).toEqual([]);
          }
        }
      },
      STRESS_TIMEOUT_MS,
    );

    /* ======================================================================================
     * CUOC DUA B — lenh mo vs HUY chang (chang CO HANG `PLANNED`, da toi noi giao)
     * ====================================================================================== */

    it(
      'WL-IT-08 — dua B: van phong huy chang TRONG khe giua phep kiem som va khoa cua lenh mo -> lenh mo bi tu choi',
      async () => {
        const { run, loaded, login, arrivalId } = await arrivedPlannedRun();
        const atLock = aSignal<void>();
        const gate = aSignal<void>();
        const racing = waitingWith({
          guard: new PausedBeforeLock(() => atLock.fire(), gate.fired),
        });

        const opening = settle(
          startWaiting(login, run.id, loaded.id, arrivalId, next('wait-race'), racing),
        );
        await atLock.fired;
        expect(await persistedLegStatus(loaded.id)).toBe('PLANNED');

        const cancelled = await movement.cancelLeg(loaded.id, CANCEL_REASON, ACTOR);
        expect(cancelled.status).toBe('CANCELLED');
        gate.fire();

        expect(await opening).toEqual({ ok: false, reason: 'WAITING_LEG_TERMINAL' });
        expect(await sessionsOnLeg(loaded.id)).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'WL-IT-09 — dua B: lenh mo dang GIU khoa -> lenh huy XEP HANG sau no, phien commit truoc',
      async () => {
        const { run, loaded, login, arrivalId } = await arrivedPlannedRun();
        const holding = aSignal<string>();
        const gate = aSignal<void>();
        const racing = waitingWith({
          sessions: new PausedInsideLock((xid) => holding.fire(xid), gate.fired),
        });

        const opening = settle(
          startWaiting(login, run.id, loaded.id, arrivalId, next('wait-race'), racing),
        );
        const xid = await holding.fired;
        const cancelling = settle(movement.cancelLeg(loaded.id, CANCEL_REASON, ACTOR));

        await waitForQueueBehind(xid);
        expect(await persistedLegStatus(loaded.id)).toBe('PLANNED');
        gate.fire();

        const opened = await opening;
        const cancelled = await cancelling;
        if (!opened.ok || !cancelled.ok) {
          throw new Error(`ca hai phai thanh cong: ${JSON.stringify({ opened, cancelled })}`);
        }
        expect(cancelled.value.status).toBe('CANCELLED');
        const ages = await commitAgesOf(opened.value.id, loaded.id);
        expect(ages.sessionAge).toBeGreaterThan(ages.legAge);
        expect(await sessionsOnLeg(loaded.id)).toEqual([{ id: opened.value.id, status: 'OPEN' }]);
      },
      TEST_TIMEOUT_MS,
    );

    it(
      'WL-IT-10 — dua B THAT, nhieu vong khong xep thu tu: moi ket cuc deu tuan tu hoa duoc',
      async () => {
        for (let round = 0; round < STRESS_ROUNDS; round += 1) {
          const { run, loaded, login, arrivalId } = await arrivedPlannedRun();
          const waitingFirst = round % 2 === 0;
          const [opened, cancelled] = await Promise.all([
            settle(
              sleep(waitingFirst ? 0 : round).then(() =>
                startWaiting(login, run.id, loaded.id, arrivalId),
              ),
            ),
            settle(
              sleep(waitingFirst ? round : 0).then(() =>
                movement.cancelLeg(loaded.id, CANCEL_REASON, ACTOR),
              ),
            ),
          ]);

          expect(cancelled.ok).toBe(true);
          expect(await persistedLegStatus(loaded.id)).toBe('CANCELLED');
          if (opened.ok) {
            const ages = await commitAgesOf(opened.value.id, loaded.id);
            expect(ages.sessionAge).toBeGreaterThan(ages.legAge);
          } else {
            expect(opened.reason).toBe('WAITING_LEG_TERMINAL');
            expect(await sessionsOnLeg(loaded.id)).toEqual([]);
          }
        }
      },
      STRESS_TIMEOUT_MS,
    );

    /* ======================================================================================
     * CUA SO KHOA voi LAN DONG VONG CHAY — phan R-IT-10 khong con do duoc
     * ====================================================================================== */

    /**
     * WL-IT-11 — chang ROI vong chay cung ket thuc TRONG khe giua phep kiem som va khoa cua lenh mo.
     *
     * Tu `#358`, R-IT-10 (`run-closure-concurrency.int.spec.ts`) khong con cham toi khoa cua lenh mo:
     * moi chang cua mot vong chay dong duoc deu da o diem cuoi, nen lenh mo bi chan ngay o phep kiem
     * som. Cong DUOI khoa ve VONG CHAY (`#293` R2) van song, va van con mot duong toi no: lenh mo doc
     * thay vong chay `ACTIVE` + chang `IN_TRANSIT`, roi van phong hoan tat chang va he thong dong vong
     * chay (`closeRunAsSystem`, duong luot quet/su kien) truoc khi lenh mo lay khoa. Duoi khoa, vong
     * chay dung TRUOC chang: cau tra loi la `WAITING_RUN_TERMINAL`, khong phai `WAITING_LEG_TERMINAL`.
     */
    it(
      'WL-IT-11 — chang roi vong chay cung ket thuc trong khe truoc khoa: duoi khoa vong chay dung truoc -> WAITING_RUN_TERMINAL',
      async () => {
        const { run, loaded, login, arrivalId } = await arrivedRun();
        const atLock = aSignal<void>();
        const gate = aSignal<void>();
        const racing = waitingWith({
          guard: new PausedBeforeLock(() => atLock.fire(), gate.fired),
        });

        const opening = settle(
          startWaiting(login, run.id, loaded.id, arrivalId, next('wait-race'), racing),
        );
        await atLock.fired;
        expect(await persistedLegStatus(loaded.id)).toBe('IN_TRANSIT');

        await move(loaded.id, 'COMPLETED', OVERRIDE_REASON);
        const closed = await movement.closeRunAsSystem(run.id, 'IT_W358_WINDOW');
        expect(closed).toMatchObject({ transitioned: true, run: { status: 'COMPLETED' } });
        gate.fire();

        expect(await opening).toEqual({ ok: false, reason: 'WAITING_RUN_TERMINAL' });
        expect(await sessionsOnLeg(loaded.id)).toEqual([]);
      },
      TEST_TIMEOUT_MS,
    );
  },
);
