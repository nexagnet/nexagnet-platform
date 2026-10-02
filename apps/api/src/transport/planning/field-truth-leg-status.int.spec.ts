import { ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaAuditLogRepository } from '../../audit/prisma-audit-log.repository.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import { PrismaService } from '../../config/prisma.service.js';
import { CheckpointLegFieldTruthSource } from '../checkpoint/checkpoint-leg-field-truth.source.js';
import { CheckpointRunClosureBlockerSource } from '../checkpoint/checkpoint-run-closure-blocker.source.js';
import {
  TransportCheckpointCoreFactsAdapter,
  TransportCheckpointLocationFacts,
} from '../checkpoint/checkpoint-facts.port.js';
import { CheckpointService } from '../checkpoint/checkpoint.service.js';
import type { RunCheckpointType } from '../checkpoint/checkpoint.types.js';
import { PrismaCheckpointRepository } from '../checkpoint/prisma-checkpoint.repository.js';
import { TransportCheckpointRunClosureBlockerSource } from '../checkpoint/transport-checkpoint-blocker.source.js';
import { PrismaOperationalDocumentRepository } from '../document/prisma-document.repository.js';
import { PrismaPhysicalReceiptHandoverRepository } from '../document/prisma-handover.repository.js';
import { TransportFieldCoreFactsAdapter } from '../field/field-facts.port.js';
import { DriverFieldReadService } from '../field/field-read.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { MovementRunWriteGuard } from '../movement/run-write-guard.port.js';
import { RunsController } from '../movement/runs.controller.js';
import { TransportDomainError } from '../transport.errors.js';
import { PrismaWaitingSessionRepository } from '../waiting/prisma-waiting.repository.js';
import { WaitingRunClosureBlockerSource } from '../waiting/waiting-run-closure-blocker.source.js';
import { PlanningService } from './planning.service.js';
import type { TransportPlanningPolicy } from './planning.types.js';
import { PrismaRunPlanRepository } from './prisma-planning.repository.js';
import { RunClosureService } from './run-closure.service.js';

/**
 * SU THAT HIEN TRUONG vs TRANG THAI CHANG (`#332`) tren POSTGRES THAT.
 *
 * Ban trong bo nho (`field-truth-leg-status.spec.ts`) chung minh hai cong tren dung chuoi harness
 * 19/09/2026. Tep nay hoi cau con lai: tren kho THAT — `PrismaCheckpointRepository.listForLeg`
 * lam nguon hien truong, trigger append-only cua moc, `AuditLog` that — hai cong co con dung, va
 * ngu nghia dong vong chay co nguyen ven khong.
 *
 * Moi lan ghi di dung lop ma duong HTTP goi: `DriverFieldReadService.workFor` (man lai xe),
 * `CheckpointService.recordAsDriver` (`/transport/me/checkpoints`), `RunsController.transitionLeg`
 * (`/transport/runs/:runId/legs/:legId/transition`) voi nguon hien truong THAT noi o giua.
 *
 * Chay bang `RUN_PRISMA_IT=1`; khong co bien do thi ca khoi khong chay.
 */

const CODE_PREFIX = 'IT-F332';
const PLATE_PREFIX = 'IT-F332-XE';
const PHONE_PREFIX = '0977F332';
const ACTOR = 'it-f332';

/** Cung con so voi moi tep IT cham trigger cua moc/phien cho — xem `transport-waiting.int.spec.ts`. */
const WAITING_TRIGGER_LOCK = 279_005;
const PROTECTED_TABLES = [
  ['TransportDeliveryWaitingSession', 'transport_waiting_session_immutable'],
  ['TransportRunCheckpoint', 'transport_run_checkpoint_append_only'],
] as const;

const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const DEPOT_LABEL = 'IT-F332 Bãi xe';
const PICKUP_LABEL = 'IT-F332 Kho lấy hàng';
const FAR_LABEL = 'IT-F332 Điểm giao xa';
const OVERRIDE_REASON = 'IT-F332 lái xe mất sóng, đã gọi xác nhận với người nhận';

const POLICY: TransportPlanningPolicy = {
  grouping: 'ONE_ORDER_PER_RUN',
  depots: [{ code: 'IT-F332-DEPOT', label: DEPOT_LABEL }],
  closure: { idleHours: null },
  sweep: { intervalSeconds: 60, batchSize: 50 },
};

const ACCOUNTANT = {
  authUser: { id: `${ACTOR}-ke-toan`, username: ACTOR },
} as AuthenticatedRequest;

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'UAT #332 — hien truong va trang thai chang hoi tu, tren Postgres that',
  () => {
    const prisma = new PrismaService();
    const movementRepo = new PrismaMovementRepository(prisma);
    const planRepo = new PrismaRunPlanRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const checkpointRepo = new PrismaCheckpointRepository(prisma);
    const waitingRepo = new PrismaWaitingSessionRepository(prisma);
    const audit = new AuditLogService(new PrismaAuditLogRepository(prisma));
    const movement = new MovementService(movementRepo, fleet, audit, CORE_POLICY);
    const planning = new PlanningService(movement, planRepo, fleet, audit, CORE_POLICY, POLICY);

    const noLocation = new (class extends TransportCheckpointLocationFacts {
      async findObservation(): Promise<null> {
        return null;
      }
    })();
    /* Chinh sach vi tri RONG: bo nay hoi CHANG NAO nhan moc, khong hoi ban dinh vi. */
    const checkpoints = new CheckpointService(
      checkpointRepo,
      new TransportCheckpointCoreFactsAdapter(movementRepo, fleet),
      noLocation,
      new MovementRunWriteGuard(movementRepo),
      CORE_POLICY,
      { locationRequiredTypes: [] },
    );
    const field = new DriverFieldReadService(
      new TransportFieldCoreFactsAdapter(movementRepo),
      new TransportCheckpointCoreFactsAdapter(movementRepo, fleet),
      checkpointRepo,
      waitingRepo,
      new PrismaOperationalDocumentRepository(prisma),
      new PrismaPhysicalReceiptHandoverRepository(prisma),
    );
    const closures = new RunClosureService(
      planning,
      movement,
      POLICY,
      new TransportCheckpointRunClosureBlockerSource(
        new CheckpointRunClosureBlockerSource(checkpoints),
        new WaitingRunClosureBlockerSource(waitingRepo),
      ),
    );
    const runs = new RunsController(
      movement,
      closures,
      new CheckpointLegFieldTruthSource(checkpointRepo),
    );

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
      // Dau vet dong vong chay do HE THONG ghi (actor khong mang tien to) — xoa theo chinh thuc the.
      await prisma.auditLog.deleteMany({
        where: {
          OR: [{ actor: { startsWith: ACTOR } }, { entityId: { in: [...runIds, ...legIds] } }],
        },
      });
    }

    /*
     * TRAN 60 GIAY cho ca hai hook, cung con so voi `transport-waiting*.int.spec.ts`: `cleanup()` cho
     * khoa tu van `279_005` roi `ALTER TABLE ... DISABLE TRIGGER`, va ca hai phai doi moi giao dich
     * dang cham hai bang do o CAC TEP KHAC dang chay song song trong job `integration`. Tran mac
     * dinh 10 giay da do that o CI (run 35591208025) du moi bai cua tep nay deu xanh.
     */
    beforeAll(cleanup, 60_000);
    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    }, 60_000);

    let suffix = 0;

    /** Chot ke hoach qua DUNG duong runtime; `commit()` gan nguoi cam xe vao vong chay. */
    const uatRun = async () => {
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
          businessDate: '2026-09-19',
        },
        ACTOR,
      );
      const { run, legs } = await planning.commit(
        order.id,
        { vehicleId: vehicle.id, idempotencyKey: `${CODE_PREFIX}-KEY-${suffix}` },
        ACTOR,
      );
      expect(legs.map((leg) => leg.kind)).toEqual(['EMPTY', 'LOADED']);
      return { run, empty: legs[0]!, loaded: legs[1]!, login };
    };

    const record = (login: string, runId: string, legId: string, type: RunCheckpointType) =>
      checkpoints.recordAsDriver({
        type,
        runId,
        legId,
        authUserId: login,
        clientEventId: `${CODE_PREFIX}:${legId}:${type}`,
      });

    const transition = (runId: string, legId: string, body: Record<string, unknown>) =>
      runs.transitionLeg(runId, legId, body, ACCOUNTANT);

    const httpReasonOf = async (run: () => Promise<unknown>): Promise<string> => {
      try {
        await run();
      } catch (error) {
        if (error instanceof ForbiddenException) {
          return String((error.getResponse() as { reason?: unknown }).reason);
        }
        throw error;
      }
      throw new Error('khong nem loi nao ca');
    };

    /** Doc THANG bang — khong qua mot lop dich vu nao co the che mot dong da ghi. */
    const persistedLeg = (legId: string) =>
      prisma.transportRunLeg.findUniqueOrThrow({
        where: { id: legId },
        select: { status: true, completedAt: true, kind: true },
      });
    const persistedCheckpointTypes = async (legId: string): Promise<string[]> =>
      (
        await prisma.transportRunCheckpoint.findMany({
          where: { legId },
          orderBy: { receivedAt: 'asc' },
          select: { type: true },
        })
      ).map((row) => row.type);

    it('F-IT-01 — man lai xe dua chang CO HANG len truoc; moc hang hoa khong neo duoc vao chang RONG', async () => {
      const { run, empty, loaded, login } = await uatRun();

      const legs = (await field.workFor(login)).runs.find((entry) => entry.runId === run.id)?.legs;
      const current = (legs ?? []).find((leg) => leg.nextActions.length > 0);
      expect(current?.legId).toBe(loaded.id);
      expect(legs?.find((leg) => leg.legId === empty.id)?.nextActions).toEqual([]);

      // Dung lan ghi ma runtime 19/09 12:26:39Z da lot qua.
      let reason = 'NO_ERROR_THROWN';
      try {
        await record(login, run.id, empty.id, 'PICKUP_ARRIVAL');
      } catch (error) {
        reason = error instanceof TransportDomainError ? error.reason : String(error);
      }
      expect(reason).toBe('CHECKPOINT_CARGO_ON_EMPTY_LEG');
      expect(await persistedCheckpointTypes(empty.id)).toEqual([]);

      // Nut dau tien cua chang dang lam thi ghi vao DUNG chang co hang.
      await record(login, run.id, loaded.id, 'PICKUP_ARRIVAL');
      expect(await persistedCheckpointTypes(loaded.id)).toEqual(['PICKUP_ARRIVAL']);
    });

    it('F-IT-02 — chang CO HANG chi COMPLETED khi hien truong da giao; dong vong chay giu nguyen ngu nghia', async () => {
      const { run, empty, loaded, login } = await uatRun();

      await transition(run.id, empty.id, { to: 'IN_TRANSIT' });
      const emptyDone = await transition(run.id, empty.id, { to: 'COMPLETED' });
      expect(emptyDone.closure.closed).toBe(false);
      expect(emptyDone.closure.verdict.blockers).toEqual(
        expect.arrayContaining(['LEG_STILL_OPEN', 'PLAN_STILL_OPEN']),
      );

      await transition(run.id, loaded.id, { to: 'IN_TRANSIT' });
      // Hinh dang 19/09 12:26:59Z: chang co hang chua co mot moc nao.
      expect(await httpReasonOf(() => transition(run.id, loaded.id, { to: 'COMPLETED' }))).toBe(
        'LEG_FIELD_DELIVERY_NOT_RECORDED',
      );
      for (const type of ['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE', 'DELIVERY_ARRIVAL'] as const) {
        await record(login, run.id, loaded.id, type);
      }
      // Da toi noi giao nhung nguoi nhan chua nhan: van chua xong.
      expect(await httpReasonOf(() => transition(run.id, loaded.id, { to: 'COMPLETED' }))).toBe(
        'LEG_FIELD_DELIVERY_NOT_RECORDED',
      );
      expect(await persistedLeg(loaded.id)).toMatchObject({
        kind: 'LOADED',
        status: 'IN_TRANSIT',
        completedAt: null,
      });

      await record(login, run.id, loaded.id, 'DELIVERY_ACCEPTED');
      const loadedDone = await transition(run.id, loaded.id, { to: 'COMPLETED' });
      expect(loadedDone.leg.status).toBe('COMPLETED');
      expect((await persistedLeg(loaded.id)).status).toBe('COMPLETED');

      // Chang ve bai: RONG, khong doi bang chung. Vong chay dong dung mot lan, bang duong he thong.
      const home = await movement.addLeg(
        run.id,
        { sequence: 3, kind: 'EMPTY', originLabel: FAR_LABEL, destinationLabel: DEPOT_LABEL },
        ACTOR,
      );
      await transition(run.id, home.id, { to: 'IN_TRANSIT' });
      const closed = await transition(run.id, home.id, { to: 'COMPLETED' });
      expect(closed.closure.closed).toBe(true);
      expect(closed.closure.verdict.trigger).toBe('DEPOT_RETURN');

      const closeAudits = await prisma.auditLog.findMany({
        where: { action: 'transport.run.close.system', entityId: run.id },
      });
      expect(closeAudits).toHaveLength(1);
      expect(
        await prisma.auditLog.count({
          where: { action: 'transport.run.leg.complete.override', entityId: loaded.id },
        }),
      ).toBe(0);
    });

    it('F-IT-03 — ghi de tuong minh: COMPLETED kem MOT dong AuditLog rieng mang ly do + giai doan', async () => {
      const { run, loaded } = await uatRun();
      await transition(run.id, loaded.id, { to: 'IN_TRANSIT' });

      const done = await transition(run.id, loaded.id, {
        to: 'COMPLETED',
        overrideReason: OVERRIDE_REASON,
      });
      expect(done.leg.status).toBe('COMPLETED');

      const overrides = await prisma.auditLog.findMany({
        where: { action: 'transport.run.leg.complete.override', entityId: loaded.id },
      });
      expect(overrides).toHaveLength(1);
      expect(overrides[0]!.actor).toBe(ACTOR);
      expect(overrides[0]!.after).toMatchObject({
        status: 'COMPLETED',
        fieldOverride: { reason: OVERRIDE_REASON, fieldPhase: 'PLANNED' },
      });
      // Hien truong KHONG bi viet lai: lan ghi de chi noi ve trang thai chang.
      expect(await persistedCheckpointTypes(loaded.id)).toEqual([]);
    });
  },
);
