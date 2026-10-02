import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaAuditLogRepository } from '../../audit/prisma-audit-log.repository.js';
import { PrismaService } from '../../config/prisma.service.js';
import { toBusinessDate } from '../business-date.js';
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
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { MovementRunWriteGuard } from '../movement/run-write-guard.port.js';
import { TransportDomainError } from '../transport.errors.js';
import { PrismaWaitingSessionRepository } from '../waiting/prisma-waiting.repository.js';
import { WaitingRunClosureBlockerSource } from '../waiting/waiting-run-closure-blocker.source.js';
import { PlanningService } from './planning.service.js';
import type { TransportPlanningPolicy } from './planning.types.js';
import { PrismaRunPlanRepository } from './prisma-planning.repository.js';
import { RunClosureService } from './run-closure.service.js';

/**
 * UAT BUG-02 (#332) tren POSTGRES THAT — cung duong ung dung ma runtime dung.
 *
 * ============================================================================================
 * VI SAO CO TEP NAY SAU BAN TRONG BO NHO
 * ============================================================================================
 *
 * Ban trong bo nho da chung minh ham phan xu giu vong chay `ACTIVE` khi con chang `LOADED`. Cau
 * hoi con lai la TANG LUU TRU: cau `WHERE` cua ung vien luot quet, lan doc chang duoi `FOR UPDATE`,
 * va nguon chan that cua `transport-checkpoint` — ba thu chi ton tai tren Postgres.
 *
 * Moi vong chay o day di dung duong runtime: `PlanningService.commit()` sinh chang va (tu #338)
 * gan nguoi cam xe, `MovementService.transitionLeg()` doi trang thai chang VOI nguon hien truong
 * that (`CheckpointLegFieldTruthSource`, tu #350 — dung thu `RunsController` truyen vao), va
 * `RunClosureService.attempt()` phan xu voi nguon chan GOP (hang tren thung + phien cho) — dung
 * cach `app-composition.ts` noi chung luc chay.
 *
 * ============================================================================================
 * U-IT-04 LA BAN GHI LAI RUNTIME — VA TU #350 NO GOM HAI LOAI DONG
 * ============================================================================================
 *
 * Log quyet dinh cua `api-321` tren transport-preview cho vong chay `cmu8d6wo3001jog01lyk7n3ws`:
 * bon moc lay hang ghi tren CHANG 1 RONG (19/09 12:29:29–12:29:33Z); ba chang `COMPLETED` qua API
 * dieu hanh (12:29:37–12:29:39Z) trong khi chang CO HANG khong co mot moc nao; luot quet giu vong
 * chay bang `CARGO_STILL_CARRIED` gan 28 gio; man lai xe ghi hai moc giao, CUNG tren chang 1 (20/09
 * 16:35:38Z, 16:37:11Z); luot quet dong luc 16:37:19Z (`IDLE_SWEEP` → `DEPOT_RETURN`).
 *
 * #350 co y dong HAI loai lan ghi trong chuoi do:
 *
 *   · moc hang hoa neo vao chang RONG → `CHECKPOINT_CARGO_ON_EMPTY_LEG` (duong lai xe lan dieu hanh);
 *   · chang CO HANG `COMPLETED` khi hien truong chua giao → `LEG_FIELD_DELIVERY_NOT_RECORDED`.
 *
 * Nen bai tach bach hai thu, tai DUNG thoi diem cua tung lan ghi:
 *
 *   · HOP LE BAY GIO — lan ghi ay di qua duong cong khai truoc va phai bi TU CHOI dung ma, khong
 *     de lai dong nao;
 *   · DU LIEU LICH SU — roi dong ma runtime truoc #350 DA LUU moi duoc gieo THANG vao bang
 *     (`seedLegacy*`), dung cot lop ghi luc do dat. Khong dong lich su nao di qua dich vu.
 *
 * Moi thu khac — chang RONG doi trang thai, them chang ve bai, moi lan phan xu, luot quet — van la
 * duong runtime that, hop le ca luc do lan bay gio. Bai tra loi: tren CHINH du lieu lich su do, dong
 * co dong vong chay hom nay cho ra dung chuoi ma chan runtime da ghi, va chi dong khi MOI chang da
 * `COMPLETED` — khong vuot qua mot chang `LOADED` con mo. Trang thai UAT nhin thay (vong chay
 * `COMPLETED`, cot "Hien truong" cua chang 2/3 la "—") sinh ra tu chinh du lieu do.
 *
 * Bai khoa them mot he qua van hanh: vong chay CU con `ACTIVE` ma chang RONG dang "cho hang" bi
 * `CARGO_STILL_CARRIED` giu mai — khong duong cong khai nao ghi duoc moc giao len chang do nua, va
 * dong ho khong giai phong no (ma chan dung truoc moi nhanh dong).
 *
 * Chay bang `RUN_PRISMA_IT=1`; khong co bien do thi ca khoi khong chay.
 */

const CODE_PREFIX = 'IT-U332';
const PLATE_PREFIX = 'IT-U332-XE';
const PHONE_PREFIX = '0966U332';
const ACTOR = 'it-uat-332';
const AUTH = 'it-u332-lai-xe';

/** Cung con so voi moi tep IT cham trigger cua moc/phien cho — xem `transport-waiting.int.spec.ts`. */
const WAITING_TRIGGER_LOCK = 279_005;
const PROTECTED_TABLES = [
  ['TransportDeliveryWaitingSession', 'transport_waiting_session_immutable'],
  ['TransportRunCheckpoint', 'transport_run_checkpoint_append_only'],
] as const;

const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const DEPOT_LABEL = 'IT-U332 Bãi xe';
const PICKUP_LABEL = 'IT-U332 Kho lấy hàng';
const FAR_LABEL = 'IT-U332 Điểm giao xa';
const HOUR_MS = 3_600_000;

/**
 * Hai dot moc ma runtime truoc #350 ghi len CHANG 1 RONG cua `cmu8d6wo3001jog01lyk7n3ws` — dung
 * loai, dung thu tu trong log `api-321` (19/09 12:29:29–33Z, roi 20/09 16:35:38Z va 16:37:11Z).
 */
const LEGACY_PICKUP_ON_EMPTY = [
  'PICKUP_ARRIVAL',
  'GATE_ENTRY',
  'LOADING',
  'PICKUP_DEPARTURE',
] as const;
const LEGACY_DELIVERY_ON_EMPTY = ['DELIVERY_ARRIVAL', 'DELIVERY_ACCEPTED'] as const;
/** Ma su kien cua dong LICH SU — khong trung ma nao `next()` sinh cho mot lan ghi qua dich vu. */
const LEGACY_EVENT_PREFIX = `${CODE_PREFIX}-LEGACY`;

/** Hinh dang chinh sach cua transport-preview: mot don mot vong chay, mot bai, nguong nghi 12 gio. */
const policyWith = (over: Partial<TransportPlanningPolicy> = {}): TransportPlanningPolicy => ({
  grouping: over.grouping ?? 'ONE_ORDER_PER_RUN',
  depots: over.depots ?? [{ code: 'IT-U332-DEPOT', label: DEPOT_LABEL }],
  closure: over.closure ?? { idleHours: 12 },
  sweep: over.sweep ?? { intervalSeconds: 60, batchSize: 50 },
});

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'UAT BUG-02 — chang RONG xong khong duoc dong vong chay, tren Postgres that (#332)',
  () => {
    const prisma = new PrismaService();
    const movementRepo = new PrismaMovementRepository(prisma);
    const planRepo = new PrismaRunPlanRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const audit = new AuditLogService(new PrismaAuditLogRepository(prisma));
    const movement = new MovementService(movementRepo, fleet, audit, CORE_POLICY);

    const noLocationFacts = new (class extends TransportCheckpointLocationFacts {
      async findObservation(): Promise<null> {
        return null;
      }
    })();

    /*
     * Chinh sach vi tri RONG: cac bai nay hoi ve VONG CHAY, khong ve bang chung dinh vi. Moi thu
     * khac — kho, khoa hang, thu tu moc — la ban that.
     */
    const checkpointRepo = new PrismaCheckpointRepository(prisma);
    const checkpointService = new CheckpointService(
      checkpointRepo,
      new TransportCheckpointCoreFactsAdapter(movementRepo, fleet),
      noLocationFacts,
      new MovementRunWriteGuard(movementRepo),
      CORE_POLICY,
      { locationRequiredTypes: [] },
    );
    /**
     * So ghi hien truong ma `app-composition.ts` noi cho `transport-checkpoint` (#350) — cung ban
     * `RunsController` chuyen vao `transitionLeg()`. Thieu no, fixture se hoan tat duoc mot chang
     * CO HANG trai hien truong: dung thu #350 dong o duong cong khai.
     */
    const fieldTruth = new CheckpointLegFieldTruthSource(checkpointRepo);
    const runtimeBlockers = new TransportCheckpointRunClosureBlockerSource(
      new CheckpointRunClosureBlockerSource(checkpointService),
      new WaitingRunClosureBlockerSource(new PrismaWaitingSessionRepository(prisma)),
    );

    const closuresWith = (policy: TransportPlanningPolicy, now?: () => Date) =>
      new RunClosureService(
        new PlanningService(movement, planRepo, fleet, audit, CORE_POLICY, policy, undefined, now),
        movement,
        policy,
        runtimeBlockers,
        undefined,
        now,
      );
    const closures = closuresWith(policyWith());

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
      // TRUOC xe va lai xe: khoa ngoai cua ban phan cong doi xe tro vao ca hai.
      await prisma.transportVehicleAssignment.deleteMany({
        where: {
          OR: [
            { vehicleId: { in: vehicleIds } },
            { driver: { phone: { startsWith: PHONE_PREFIX } } },
          ],
        },
      });
      await prisma.transportVehicle.deleteMany({ where: { id: { in: vehicleIds } } });
      await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
      // Dau vet dong do HE THONG ghi (`actor` khong mang tien to) — xoa theo chinh vong chay.
      await prisma.auditLog.deleteMany({
        where: { OR: [{ actor: { startsWith: ACTOR } }, { entityId: { in: runIds } }] },
      });
    }

    /*
     * TRAN 60 GIAY cho ca hai hook, cung con so va ly do voi `field-truth-leg-status.int.spec.ts`
     * (#350): `cleanup()` cho khoa tu van `279_005` roi `ALTER TABLE ... DISABLE TRIGGER`, va tep do
     * — cung khoa, cung hai bang — chay song song voi tep nay trong job `integration`. Tran mac dinh
     * 10 giay da do that o CI tren chinh tep kia (run 35591208025).
     */
    beforeAll(cleanup, 60_000);
    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    }, 60_000);

    let suffix = 0;
    const next = (label: string): string => `${CODE_PREFIX}-${label}-${++suffix}`;

    /**
     * Mot chiec xe DIEU DUOC theo hop dong cua #338: `commit()` doi xe co DUNG MOT lai xe dang phu
     * trach, lai xe do `ACTIVE` va CO `authUserId`, truoc khi mo vong chay. Moi xe mot lai xe rieng
     * (`authUserId` la unique) — giong mot doi xe that, khong phai mot nguoi cam bon xe cung luc.
     */
    const dispatchableVehicle = async () => {
      const n = ++suffix;
      const authUserId = `${AUTH}-${n}`;
      const vehicle = await fleet.createVehicle({
        registrationPlate: `${PLATE_PREFIX}-${n}`,
        vehicleClass: 'Dau keo',
      });
      const driver = await fleet.createDriver({
        fullName: `IT-U332 Lai xe ${n}`,
        phone: `${PHONE_PREFIX}${n}`,
        licenceClass: 'FC',
        licenceExpiry: '2030-01-01',
        authUserId,
      });
      await fleet.assignDriverToVehicle(vehicle.id, driver.id, new Date());
      return { vehicle, driverId: driver.id, authUserId };
    };

    /** Duong cua lai xe (`/transport/me/checkpoints`) — danh tinh tu PHIEN cua nguoi cam xe. */
    const recordAs =
      (authUserId: string) => (runId: string, legId: string, type: RunCheckpointType) =>
        checkpointService.recordAsDriver({
          type,
          runId,
          legId,
          authUserId,
          clientEventId: next(type),
        });

    /**
     * Chot ke hoach qua DUNG duong runtime. Tu #338, chinh `commit()` gan nguoi cam xe vao vong
     * chay — buoc gan tay rieng (lach BUG-01) khong con, va fixture KHANG DINH dieu do thay vi gia
     * dinh: lai xe ghi moc o U-IT-02/04 la nguoi `commit()` da gan, khong phai nguoi test tu chen.
     */
    const plannedRun = async () => {
      const { vehicle, driverId, authUserId } = await dispatchableVehicle();
      const order = await movement.createOrder(
        {
          code: next('ORD'),
          originLabel: PICKUP_LABEL,
          destinationLabel: FAR_LABEL,
          businessDate: '2026-09-19',
        },
        ACTOR,
      );
      const { run, legs } = await new PlanningService(
        movement,
        planRepo,
        fleet,
        audit,
        CORE_POLICY,
        policyWith(),
      ).commit(order.id, { vehicleId: vehicle.id, idempotencyKey: next('KEY') }, ACTOR);
      expect((await movement.getRun(run.id)).activeAssignment?.driverId).toBe(driverId);
      // Kho khac bai nen chang RONG di TRUOC — moc hang hoa chi neo duoc vao `legs[1]` (#350).
      expect(legs.map((leg) => leg.kind)).toEqual(['EMPTY', 'LOADED']);
      return {
        run,
        empty: legs[0]!,
        loaded: legs[1]!,
        record: recordAs(authUserId),
        driverId,
        authUserId,
      };
    };

    /**
     * Duong cua `RunsController.transitionLeg`: doi trang thai chang VOI so ghi hien truong that,
     * roi HOI LAI lan dong. Tu #350 chang CO HANG chi `COMPLETED` khi hien truong da giao.
     */
    const transitionThenAttempt = async (
      runId: string,
      legId: string,
      to: 'IN_TRANSIT' | 'COMPLETED',
    ) => {
      await movement.transitionLeg(legId, to, ACTOR, { fieldTruth });
      return closures.attempt(runId, 'LEG_CHANGED');
    };
    const runLeg = async (runId: string, legId: string) => {
      await transitionThenAttempt(runId, legId, 'IN_TRANSIT');
      return transitionThenAttempt(runId, legId, 'COMPLETED');
    };

    const returnLeg = (runId: string) =>
      movement.addLeg(
        runId,
        { sequence: 3, kind: 'EMPTY', originLabel: FAR_LABEL, destinationLabel: DEPOT_LABEL },
        ACTOR,
      );

    /** ANH CHUP ngay truoc/sau: dung bon thu issue #332 doi do. */
    const snapshot = async (runId: string) => {
      const detail = await movement.getRun(runId);
      return {
        runStatus: detail.run.status,
        legs: detail.legs.map((leg) => ({
          sequence: leg.sequence,
          kind: leg.kind,
          status: leg.status,
          completed: leg.completedAt !== null,
        })),
        activePlans: (await planRepo.listActiveForRun(runId)).length,
        verdict: await closures.inspect(runId),
      };
    };

    /** Tap ung vien that cua luot quet — cau `WHERE` SQL, CHI DOC. Khang dinh theo id, khong theo so. */
    const isSweepCandidate = async (runId: string): Promise<boolean> => {
      const candidates = await movement.listRunClosureCandidates({
        completedBefore: new Date(Date.now() + HOUR_MS),
        idleHours: 0,
        depotLabel: DEPOT_LABEL,
        limit: 100_000,
      });
      return candidates.some((candidate) => candidate.id === runId);
    };

    const closeAudits = (runId: string) =>
      prisma.auditLog.findMany({
        where: { action: 'transport.run.close.system', entityId: runId },
      });

    /** Duong cua DIEU HANH (`/transport/runs/:runId/checkpoints`) — khong ho so lai xe. */
    const recordAsOperator = (runId: string, legId: string, type: RunCheckpointType) =>
      checkpointService.recordAsOperator({
        type,
        runId,
        legId,
        authUserId: `${ACTOR}-dieu-hanh`,
        clientEventId: next(type),
      });

    /** Ma tu choi cua MOT lan ghi qua duong cong khai; `NO_ERROR_THROWN` neu no lot qua. */
    const reasonOf = async (write: () => Promise<unknown>): Promise<string> => {
      try {
        await write();
      } catch (error) {
        return error instanceof TransportDomainError ? error.reason : `UNEXPECTED ${String(error)}`;
      }
      return 'NO_ERROR_THROWN';
    };

    /** Doc THANG bang moc — khong qua lop dich vu nao co the che mot dong. */
    const persistedCheckpoints = (legId: string) =>
      prisma.transportRunCheckpoint.findMany({
        where: { legId },
        orderBy: { receivedAt: 'asc' },
        select: { type: true, clientEventId: true },
      });

    /**
     * DU LIEU LICH SU — dong moc ma runtime TRUOC #350 da luu, gieo THANG vao bang.
     *
     * Dung cot `CheckpointService.append()` dat cho mot lan ghi qua `/transport/me/checkpoints`:
     * `recordedBy` = tai khoan, `driverId` = ho so lai xe, ngay nghiep vu theo mui gio khach. Khong
     * qua dich vu nao — tu #350 khong duong nao con ghi duoc dong nay, va bai khong mo lai duong do.
     * `observationId` de trong: bai hoi ve dong vong chay, khong ve ban dinh vi (chinh sach vi tri
     * rong o tren). `receivedAt` tang dan de thu tu doc lai la thu tu gieo.
     */
    const seedLegacyCheckpoints = async (
      owner: { runId: string; legId: string; driverId: string; authUserId: string },
      types: readonly RunCheckpointType[],
    ): Promise<void> => {
      const base = Date.now();
      for (const [index, type] of types.entries()) {
        const receivedAt = new Date(base + index);
        await prisma.transportRunCheckpoint.create({
          data: {
            type,
            runId: owner.runId,
            legId: owner.legId,
            recordedBy: owner.authUserId,
            driverId: owner.driverId,
            clientEventId: `${LEGACY_EVENT_PREFIX}-${type}-${++suffix}`,
            receivedAt,
            businessDate: toBusinessDate(receivedAt, CORE_POLICY.timeZone),
          },
        });
      }
    };

    /**
     * DU LIEU LICH SU — chang CO HANG `COMPLETED` voi 0 moc, dung cot `setLegStatus()` da ghi luc
     * 19/09 12:29:38Z. Tu #350 duong `RunsController` tu choi lan hoan tat ay (tru mot lan ghi de co
     * ly do va co dau vet rieng), nen hinh dang nay chi con la dong da luu.
     */
    const seedLegacyLegCompleted = async (legId: string): Promise<void> => {
      const at = new Date();
      await prisma.transportRunLeg.update({
        where: { id: legId },
        data: { status: 'COMPLETED', completedAt: at, updatedAt: at },
      });
    };

    it('U-IT-01 — EMPTY xong, LOADED PLANNED: vong chay VAN ACTIVE, bi chan dung hai ly do', async () => {
      const { run, empty, loaded } = await plannedRun();
      expect([empty.kind, loaded.kind]).toEqual(['EMPTY', 'LOADED']);

      await transitionThenAttempt(run.id, empty.id, 'IN_TRANSIT');
      const before = await snapshot(run.id);
      expect(before.runStatus).toBe('ACTIVE');
      expect(before.legs.map((leg) => leg.status)).toEqual(['IN_TRANSIT', 'PLANNED']);
      expect(before.activePlans).toBe(1);

      const outcome = await transitionThenAttempt(run.id, empty.id, 'COMPLETED');
      const after = await snapshot(run.id);

      expect(outcome.closed).toBe(false);
      expect(outcome.verdict.blockers).toEqual(
        expect.arrayContaining(['LEG_STILL_OPEN', 'PLAN_STILL_OPEN']),
      );
      expect(after.runStatus).toBe('ACTIVE');
      expect(after.legs).toEqual([
        { sequence: 1, kind: 'EMPTY', status: 'COMPLETED', completed: true },
        { sequence: 2, kind: 'LOADED', status: 'PLANNED', completed: false },
      ]);
      expect(after.activePlans).toBe(1);
      // Be mat chan doan va duong thi hanh nhin CUNG mot bang chan.
      expect(after.verdict.blockers).toEqual(outcome.verdict.blockers);

      // Luot quet cung khong lay duoc no: cau `every` cua SQL loai ngay tu CSDL.
      expect(await isSweepCandidate(run.id)).toBe(false);
      const sweepAttempt = await closuresWith(
        policyWith({ closure: { idleHours: 1 } }),
        () => new Date(Date.now() + 48 * HOUR_MS),
      ).attempt(run.id, 'IDLE_SWEEP');
      expect(sweepAttempt.closed).toBe(false);
      expect(sweepAttempt.verdict.blockers).toContain('LEG_STILL_OPEN');
      expect(await closeAudits(run.id)).toHaveLength(0);
    });

    it('U-IT-02 — LOADED dang chay: van khong dong, va lai xe van ghi duoc tren chang do', async () => {
      const { run, empty, loaded, record } = await plannedRun();
      await runLeg(run.id, empty.id);
      const outcome = await transitionThenAttempt(run.id, loaded.id, 'IN_TRANSIT');

      expect(outcome.closed).toBe(false);
      expect(outcome.verdict.blockers).toEqual(
        expect.arrayContaining(['LEG_STILL_OPEN', 'PLAN_STILL_OPEN']),
      );
      expect((await snapshot(run.id)).runStatus).toBe('ACTIVE');

      /*
       * Chang CO HANG con nhin thay va con ghi duoc boi dung lai xe cua no — tron chuoi toi luc
       * nguoi nhan nhan hang. Tu #350 day la DIEU KIEN cua buoc ke tiep: `RunsController` khong
       * hoan tat chang co hang khi hien truong chua `DELIVERED`.
       */
      for (const type of [
        'PICKUP_ARRIVAL',
        'PICKUP_DEPARTURE',
        'DELIVERY_ARRIVAL',
        'DELIVERY_ACCEPTED',
      ] as const) {
        expect((await record(run.id, loaded.id, type)).legId).toBe(loaded.id);
      }
      const done = await transitionThenAttempt(run.id, loaded.id, 'COMPLETED');
      // Xong chang co hang o xa bai: het viec nhung chua ve bai — GIU, khong dong.
      expect(done.closed).toBe(false);
      expect(done.verdict.holding).toBe(true);
      expect((await snapshot(run.id)).runStatus).toBe('ACTIVE');
    });

    it('U-IT-03 — chang VE BAI xong TRUOC chang LOADED: dieu kien ve bai dung, van khong dong', async () => {
      const { run, empty } = await plannedRun();
      await runLeg(run.id, empty.id);
      const home = await returnLeg(run.id);

      /*
       * Hinh dang nguy hiem nhat cho `lastCompleted()`: chang hoan thanh MUON NHAT ket thuc tai bai,
       * nen nhanh `DEPOT_RETURN` se bat ngay neu khong co cong `LEG_STILL_OPEN` dung truoc no.
       */
      const outcome = await runLeg(run.id, home.id);
      const after = await snapshot(run.id);

      expect(after.legs.map((leg) => [leg.kind, leg.status])).toEqual([
        ['EMPTY', 'COMPLETED'],
        ['LOADED', 'PLANNED'],
        ['EMPTY', 'COMPLETED'],
      ]);
      expect(outcome.closed).toBe(false);
      expect(outcome.verdict.trigger).toBeNull();
      expect(outcome.verdict.blockers).toEqual(
        expect.arrayContaining(['LEG_STILL_OPEN', 'PLAN_STILL_OPEN']),
      );
      expect(after.runStatus).toBe('ACTIVE');
      expect(await isSweepCandidate(run.id)).toBe(false);
      expect(await closeAudits(run.id)).toHaveLength(0);
    });

    it('U-IT-04 — REPLAY runtime 19–20/09 tren DU LIEU LICH SU: vong chay dong vi MOI chang da COMPLETED, khong vi chang RONG', async () => {
      const { run, empty, loaded, record, driverId, authUserId } = await plannedRun();
      const legacyOnEmpty = { runId: run.id, legId: empty.id, driverId, authUserId };

      /*
       * 19/09 12:29:29–33Z — runtime ghi chuoi lay hang len CHANG 1 RONG.
       * HOP LE BAY GIO: duong cong khai tu choi TUNG lan ghi ay, va khong de lai dong nao.
       */
      for (const type of LEGACY_PICKUP_ON_EMPTY) {
        expect(await reasonOf(() => record(run.id, empty.id, type))).toBe(
          'CHECKPOINT_CARGO_ON_EMPTY_LEG',
        );
      }
      expect(await persistedCheckpoints(empty.id)).toEqual([]);
      // DU LIEU LICH SU: nen bon dong do chi con vao duoc bang bang duong gieo thang.
      await seedLegacyCheckpoints(legacyOnEmpty, LEGACY_PICKUP_ON_EMPTY);

      /*
       * 19/09 12:29:37–39Z — API dieu hanh chuyen ca ba chang. Moi lan phan xu phai ra DUNG mang
       * ma chan `api-321` da ghi cho vong chay do, theo dung thu tu. Ba ma cung song mot luc.
       */
      expect(
        (await transitionThenAttempt(run.id, empty.id, 'IN_TRANSIT')).verdict.blockers,
      ).toEqual(['LEG_STILL_OPEN', 'PLAN_STILL_OPEN', 'NO_COMPLETED_WORK', 'CARGO_STILL_CARRIED']);
      expect((await transitionThenAttempt(run.id, empty.id, 'COMPLETED')).verdict.blockers).toEqual(
        ['LEG_STILL_OPEN', 'PLAN_STILL_OPEN', 'CARGO_STILL_CARRIED'],
      );
      expect(
        (await transitionThenAttempt(run.id, loaded.id, 'IN_TRANSIT')).verdict.blockers,
      ).toEqual(['LEG_STILL_OPEN', 'PLAN_STILL_OPEN', 'CARGO_STILL_CARRIED']);

      /*
       * 12:29:38.658Z — chang CO HANG sang `COMPLETED` khi chua co mot moc nao.
       * HOP LE BAY GIO: duong `RunsController` tu choi, chang dung yen o `IN_TRANSIT`.
       */
      expect(await reasonOf(() => transitionThenAttempt(run.id, loaded.id, 'COMPLETED'))).toBe(
        'LEG_FIELD_DELIVERY_NOT_RECORDED',
      );
      expect((await snapshot(run.id)).legs[1]).toEqual({
        sequence: 2,
        kind: 'LOADED',
        status: 'IN_TRANSIT',
        completed: false,
      });
      // DU LIEU LICH SU: trang thai ay chi con la dong da luu; roi lan phan xu controller chay ngay sau.
      await seedLegacyLegCompleted(loaded.id);
      expect((await closures.attempt(run.id, 'LEG_CHANGED')).verdict.blockers).toEqual([
        'CARGO_STILL_CARRIED',
      ]);

      // 12:29:39Z — them chang ve bai roi chay no: hop le ca luc do lan bay gio.
      const home = await returnLeg(run.id);
      expect((await transitionThenAttempt(run.id, home.id, 'IN_TRANSIT')).verdict.blockers).toEqual(
        ['LEG_STILL_OPEN', 'CARGO_STILL_CARRIED'],
      );
      const lastLegChange = await transitionThenAttempt(run.id, home.id, 'COMPLETED');

      const held = await snapshot(run.id);
      expect(held.legs.map((leg) => [leg.kind, leg.status])).toEqual([
        ['EMPTY', 'COMPLETED'],
        ['LOADED', 'COMPLETED'],
        ['EMPTY', 'COMPLETED'],
      ]);
      expect(held.runStatus).toBe('ACTIVE');
      // Dung ma chan luot quet runtime ghi moi phut trong gan 28 gio: chi con hang tren thung.
      expect(lastLegChange.verdict.blockers).toEqual(['CARGO_STILL_CARRIED']);
      expect(held.verdict.blockers).toEqual(['CARGO_STILL_CARRIED']);
      expect(await isSweepCandidate(run.id)).toBe(true);

      /*
       * 20/09 16:35:38Z / 16:37:11Z — man lai xe ghi hai moc giao, CUNG tren chang 1 RONG.
       * HOP LE BAY GIO: ca duong lai xe lan duong dieu hanh tu choi...
       */
      for (const type of LEGACY_DELIVERY_ON_EMPTY) {
        expect(await reasonOf(() => record(run.id, empty.id, type))).toBe(
          'CHECKPOINT_CARGO_ON_EMPTY_LEG',
        );
        expect(await reasonOf(() => recordAsOperator(run.id, empty.id, type))).toBe(
          'CHECKPOINT_CARGO_ON_EMPTY_LEG',
        );
      }
      // ...nen vong chay LICH SU nay bi giu mai, ke ca khi dong ho vuot xa nguong nghi.
      const stillHeld = await closuresWith(
        policyWith({ closure: { idleHours: 1 } }),
        () => new Date(Date.now() + 48 * HOUR_MS),
      ).attempt(run.id, 'IDLE_SWEEP');
      expect(stillHeld.closed).toBe(false);
      expect(stillHeld.verdict.blockers).toEqual(['CARGO_STILL_CARRIED']);
      expect((await snapshot(run.id)).runStatus).toBe('ACTIVE');

      // DU LIEU LICH SU: hai dong giao cua 20/09, roi luot quet chay nhu runtime luc 16:37:19Z.
      await seedLegacyCheckpoints(legacyOnEmpty, LEGACY_DELIVERY_ON_EMPTY);
      const swept = await closures.attempt(run.id, 'IDLE_SWEEP');

      expect(swept.closed).toBe(true);
      expect(swept.verdict.trigger).toBe('DEPOT_RETURN');
      const closed = await movement.getRun(run.id);
      expect(closed.run.status).toBe('COMPLETED');

      /*
       * DUNG dieu UAT nhin thay: cot "Hien truong" chi co chang 1; chang 2/3 KHONG co giai doan
       * nao (giao dien in "—") — trong khi trang thai cua chung la `COMPLETED` tu truoc lan dong.
       * Hai truc khac nhau, va lan dong doc truc trang thai chang. Moi dong moc cua chang 1 la dong
       * LICH SU; chang CO HANG khong co dong nao.
       */
      const phases = (await checkpointService.timelineForRun(run.id)).legPhases;
      expect(phases[empty.id]).toBe('DELIVERED');
      expect(phases[loaded.id]).toBeUndefined();
      expect(phases[home.id]).toBeUndefined();
      expect(closed.legs.map((leg) => leg.status)).toEqual(['COMPLETED', 'COMPLETED', 'COMPLETED']);
      const emptyRows = await persistedCheckpoints(empty.id);
      expect(emptyRows.map((row) => row.type)).toEqual([
        ...LEGACY_PICKUP_ON_EMPTY,
        ...LEGACY_DELIVERY_ON_EMPTY,
      ]);
      expect(emptyRows.every((row) => row.clientEventId.startsWith(LEGACY_EVENT_PREFIX))).toBe(
        true,
      );
      expect(await persistedCheckpoints(loaded.id)).toEqual([]);

      const audits = await closeAudits(run.id);
      expect(audits).toHaveLength(1);
      expect(audits[0]!.actor).toBe('system:transport-planning');
      expect((audits[0]!.before as { status: string }).status).toBe('ACTIVE');
      expect((audits[0]!.after as { status: string }).status).toBe('COMPLETED');
    });
  },
);
