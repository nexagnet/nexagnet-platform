import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaAuditLogRepository } from '../../audit/prisma-audit-log.repository.js';
import { PrismaService } from '../../config/prisma.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { CheckpointRunClosureBlockerSource } from '../checkpoint/checkpoint-run-closure-blocker.source.js';
import {
  TransportCheckpointCoreFactsAdapter,
  TransportCheckpointLocationFacts,
} from '../checkpoint/checkpoint-facts.port.js';
import { CheckpointService } from '../checkpoint/checkpoint.service.js';
import { PrismaCheckpointRepository } from '../checkpoint/prisma-checkpoint.repository.js';
import { TransportCheckpointRunClosureBlockerSource } from '../checkpoint/transport-checkpoint-blocker.source.js';
import { MovementRunWriteGuard } from '../movement/run-write-guard.port.js';
import { TransportDomainError } from '../transport.errors.js';
import { PrismaWaitingSessionRepository } from '../waiting/prisma-waiting.repository.js';
import { WaitingRunClosureBlockerSource } from '../waiting/waiting-run-closure-blocker.source.js';
import { WaitingSessionService } from '../waiting/waiting.service.js';
import { RunClosureBlockerSource } from './run-closure-blocker.source.js';
import { MovementService } from '../movement/movement.service.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { PlanningService } from './planning.service.js';
import type { TransportPlanningPolicy } from './planning.types.js';
import { PrismaRunPlanRepository } from './prisma-planning.repository.js';
import { RunClosureService } from './run-closure.service.js';

/**
 * DONG VONG CHAY tren POSTGRES THAT — `#293` Lane R.
 *
 * ============================================================================================
 * VI SAO BAN TRONG BO NHO KHONG DU
 * ============================================================================================
 *
 * Hai thu ma lane nay dua vao chi ton tai duoi Postgres:
 *
 *   · `UPDATE ... WHERE status = 'ACTIVE'` la thu DUY NHAT chan duoc hai worker dong cung mot vong
 *     chay. Ban trong bo nho don luong, nen no khong bao gio chay vao kich ban do — va do chinh la
 *     ly do mot bai kiem xanh o do khong noi duoc gi ve production;
 *   · `completedAt` nam lai trong bang, nen mot TIEN TRINH MOI doc lai duoc su that cu. "Khoi phuc
 *     sau khi chet" chi co nghia khi co mot cai gi do song sot qua cai chet;
 *   · cau truy van UNG VIEN cua luot quet la SQL that, khong phai mot vong `filter` trong bo nho.
 *
 * ============================================================================================
 * KHONG BAI NAO O DAY GOI `sweep()`
 * ============================================================================================
 *
 * Va do la mot quyet dinh, khong phai mot thieu sot. `sweep()` quet MOI vong chay duoc phan xu
 * trong CSDL — dung nhu thiet ke, vi mot tien trinh phuc vu mot khach. Nhung CI chay cac tep
 * `*.int.spec.ts` SONG SONG tren CUNG mot Postgres, nen mot luot quet o day se dong ca nhung vong
 * chay ma tep khac dang dung, va lam do nhung bai kiem khong lien quan gi den lane nay.
 *
 * Nen o day:
 *   · duong GHI duoc kiem qua `attempt()` — cung mot lop phan xu, cung mot cau `UPDATE`;
 *   · cau truy van UNG VIEN duoc kiem TRUC TIEP, va no CHI DOC: khong dong gi, khong dung ai.
 *
 * Phan "luot quet chon dung trang nao, co tran ra sao" thuoc `run-closure.service.spec.ts` — o do
 * moi thu chay trong bo nho va khong co ai khac dung chung.
 *
 * Chay bang `RUN_PRISMA_IT=1`; khong co bien do thi ca khoi khong chay.
 */

const CODE_PREFIX = 'IT-R293';
const PLATE_PREFIX = 'IT-R293-XE';
const PHONE_PREFIX = '0966R293';
const ACTOR = 'it-lane-r';
const AUTH = 'it-r293-lai-xe';

/**
 * KHOA TU VAN dung chung voi MOI tep IT cham vao trigger cua mien moc/phien cho.
 *
 * Con so nay khong co y nghia nghiep vu — no chi can GIONG NHAU o moi tep (xem
 * `transport-waiting.int.spec.ts`). Doi no o mot tep ma quen tep kia se lam khoa mat tac dung mot
 * cach im lang.
 */
const WAITING_TRIGGER_LOCK = 279_005;

const PROTECTED_TABLES = [
  ['TransportDeliveryWaitingSession', 'transport_waiting_session_immutable'],
  ['TransportRunCheckpoint', 'transport_run_checkpoint_append_only'],
] as const;
const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const DEPOT_LABEL = 'IT-R293 Bãi xe';
const FAR_LABEL = 'IT-R293 Cảng xa';
const HOUR_MS = 3_600_000;

const policyWith = (over: Partial<TransportPlanningPolicy> = {}): TransportPlanningPolicy => ({
  grouping: over.grouping ?? 'ONE_ORDER_PER_RUN',
  depots: over.depots ?? [{ code: 'IT-R293-DEPOT', label: DEPOT_LABEL }],
  closure: over.closure ?? { idleHours: null },
  sweep: over.sweep ?? { intervalSeconds: 60, batchSize: 50 },
});

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'dong vong chay tren Postgres that (#293 Lane R)',
  () => {
    const prisma = new PrismaService();
    const movementRepo = new PrismaMovementRepository(prisma);
    const planRepo = new PrismaRunPlanRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    /*
     * So dau vet THAT, khong phai ban trong bo nho: bai kiem dong thoi dem "co may lan dong" tren
     * chinh bang ma van hanh doc. Mot ban trong bo nho se dem dung ca khi tang luu tru ghi sai.
     */
    const audit = new AuditLogService(new PrismaAuditLogRepository(prisma));
    const movement = new MovementService(movementRepo, fleet, audit, CORE_POLICY);

    /**
     * MOT TIEN TRINH MOI, dung nghia nhat kiem duoc: moi doi tuong bi bo di va dung lai tu dau —
     * kho, bo lap ke hoach, lop phan xu, dong ho. Khong con tro, khong `Map`, khong bien dem nao
     * song qua ranh gioi nay; thu duy nhat con lai la nhung hang da ghi.
     */
    const freshProcess = (over: Partial<TransportPlanningPolicy> = {}, now?: () => Date) => {
      const policy = policyWith(over);
      const repo = new PrismaMovementRepository(prisma);
      const service = new MovementService(repo, fleet, audit, CORE_POLICY);
      return {
        movement: service,
        policy,
        closures: new RunClosureService(
          /*
           * DONG HO PHAI DI VAO CA HAI LOP. `evaluateRunClosure()` la ham thuan, nhung dong ho cua
           * no den tu `PlanningService` — mot tien trinh duoc dung lai o day ma chi `RunClosureService`
           * biet gio gia se phan xu bang gio THAT, va bai kiem nguong nghi se do vi mot ly do
           * khong lien quan gi den dieu no dinh kiem.
           */
          new PlanningService(
            service,
            new PrismaRunPlanRepository(prisma),
            fleet,
            audit,
            CORE_POLICY,
            policy,
            undefined,
            now,
          ),
          service,
          policy,
          undefined,
          undefined,
          now,
        ),
      };
    };

    async function cleanup(): Promise<void> {
      const vehicles = await prisma.transportVehicle.findMany({
        where: { registrationPlate: { startsWith: PLATE_PREFIX } },
        select: { id: true },
      });
      const vehicleIds = vehicles.map((vehicle) => vehicle.id);

      const runs = await prisma.transportVehicleRun.findMany({
        where: { OR: [{ vehicleId: { in: vehicleIds } }, { code: { contains: CODE_PREFIX } }] },
        select: { id: true },
      });
      const runIds = runs.map((run) => run.id);

      /*
       * MOC va PHIEN CHO deu duoc bao ve boi trigger (`append_only` / `immutable`), va khoa ngoai
       * la `Restrict` — khong co duong `CASCADE` nao. Lan don dep phai TAT trigger mot cach tuong
       * minh roi bat lai ngay.
       *
       * `pg_advisory_lock` tren DUNG con so ma `transport-waiting.int.spec.ts` dung: trigger la mot
       * doi tuong CHUNG cua ca CSDL, va CI chay cac tep `*.int.spec.ts` SONG SONG. Mot tep BAT lai
       * trigger dung luc tep kia dang xoa se lam lan xoa do chet vi chinh cai trigger vua bat. Doi
       * con so o mot tep ma quen tep kia se lam khoa mat tac dung mot cach im lang.
       */
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
      await prisma.transportOrder.deleteMany({ where: { code: { contains: CODE_PREFIX } } });
      // TRUOC khi xoa xe: khoa ngoai cua ban phan cong lai xe tro vao ca xe lan lai xe.
      await prisma.transportVehicleAssignment.deleteMany({
        where: { vehicleId: { in: vehicleIds } },
      });
      await prisma.transportVehicle.deleteMany({ where: { id: { in: vehicleIds } } });
      await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
      sharedDriverId = null;
      await prisma.auditLog.deleteMany({ where: { actor: { startsWith: ACTOR } } });
    }

    beforeAll(cleanup);
    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    let suffix = 0;
    const next = (label: string): string => `${CODE_PREFIX}-${label}-${++suffix}`;

    /**
     * Mot chiec xe DIEU DUOC: `commit()` doi mot lai xe dang phu trach, con hoat dong va CO tai
     * khoan truoc khi mo vong chay. `authUserId` rieng tung xe vi cot do la unique — va khac `AUTH`
     * cua `theDriver()` ben duoi.
     */
    const aVehicle = async () => {
      const vehicle = await fleet.createVehicle({
        registrationPlate: `${PLATE_PREFIX}-${++suffix}`,
        vehicleClass: 'Dau keo',
      });
      const driver = await fleet.createDriver({
        fullName: `${CODE_PREFIX} Lai xe ${suffix}`,
        phone: `${PHONE_PREFIX}${suffix}`,
        licenceClass: 'FC',
        licenceExpiry: '2030-01-01',
        authUserId: `${AUTH}-xe-${suffix}`,
      });
      await fleet.assignDriverToVehicle(vehicle.id, driver.id, new Date());
      return vehicle;
    };

    const anOrder = (origin: string, destination: string) =>
      movement.createOrder(
        {
          code: next('ORD'),
          originLabel: origin,
          destinationLabel: destination,
          businessDate: '2026-09-11',
        },
        ACTOR,
      );

    const runLeg = async (legId: string) => {
      await movement.transitionLeg(legId, 'IN_TRANSIT', ACTOR);
      return movement.transitionLeg(legId, 'COMPLETED', ACTOR);
    };

    /** Mot vong chay da xong viec. `home: true` them mot chang rong ve bai. */
    const finishedRun = async (destination: string, options: { readonly home?: boolean } = {}) => {
      const vehicle = await aVehicle();
      const order = await anOrder('IT-R293 Kho A', destination);
      const { run, legs } = await new PlanningService(
        movement,
        planRepo,
        fleet,
        audit,
        CORE_POLICY,
        policyWith(),
      ).commit(order.id, { vehicleId: vehicle.id, idempotencyKey: next('KEY') }, ACTOR);
      for (const leg of legs) await runLeg(leg.id);

      if (options.home) {
        const home = await movement.addLeg(
          run.id,
          {
            sequence: legs.length + 1,
            kind: 'EMPTY',
            originLabel: destination,
            destinationLabel: DEPOT_LABEL,
          },
          ACTOR,
        );
        await runLeg(home.id);
      }
      return { run, order, vehicle };
    };

    const statusOf = async (runId: string) => (await movement.getRun(runId)).run.status;
    const closeAuditCount = (runId: string) =>
      prisma.auditLog.count({
        where: { action: 'transport.run.close.system', entityId: runId },
      });

    it('R-IT-01 — hai worker DONG THOI: dung mot lan dong, mot dong dau vet', async () => {
      const first = freshProcess();
      const second = freshProcess();
      const { run } = await finishedRun(DEPOT_LABEL);

      /*
       * HAI TIEN TRINH doc lap tren cung mot bang — dung hinh dang cua hai worker trong hai tien
       * trinh khac nhau. Ca hai deu doc thay `ACTIVE`, ca hai deu ket luan "dong duoc", va ca hai
       * deu goi `closeRunAsSystem`. Thu phan xu chung khong phai tang ung dung (no khong the nhin
       * thay ban kia) ma la cau `UPDATE ... WHERE status = 'ACTIVE'`.
       */
      const [a, b] = await Promise.all([
        first.closures.attempt(run.id, 'LEG_CHANGED'),
        second.closures.attempt(run.id, 'LEG_CHANGED'),
      ]);

      expect([a, b].filter((outcome) => outcome.closed)).toHaveLength(1);
      expect(await statusOf(run.id)).toBe('COMPLETED');
      expect(await closeAuditCount(run.id)).toBe(1);

      const persisted = await movement.getRun(run.id);
      expect(persisted.run.completedAt).not.toBeNull();
    });

    it('R-IT-02 — nam worker cung mot luot: van dung mot lan dong', async () => {
      const { run } = await finishedRun(DEPOT_LABEL);

      const outcomes = await Promise.all(
        Array.from({ length: 5 }, () => freshProcess().closures.attempt(run.id, 'IDLE_SWEEP')),
      );

      expect(outcomes.filter((outcome) => outcome.closed)).toHaveLength(1);
      expect(await statusOf(run.id)).toBe('COMPLETED');
      expect(await closeAuditCount(run.id)).toBe(1);
    });

    it('R-IT-03 — TIEN TRINH MOI van doc lai duoc su that va dong duoc', async () => {
      const { run } = await finishedRun(FAR_LABEL);
      expect(await statusOf(run.id)).toBe('ACTIVE');

      /*
       * Khong co "su kien" nao trong bo nho ca. Mot tien trinh dung lai tu dau, voi dong ho cua no
       * dat vao hai gio sau, doc lai dung nhung hang do tu Postgres va di den cung ket luan.
       */
      const restarted = freshProcess(
        { closure: { idleHours: 1 } },
        () => new Date(Date.now() + 2 * HOUR_MS),
      );
      const outcome = await restarted.closures.attempt(run.id, 'IDLE_SWEEP');

      expect(outcome.closed).toBe(true);
      expect(outcome.verdict.trigger).toBe('IDLE_TIMEOUT');
      expect(await statusOf(run.id)).toBe('COMPLETED');
      expect(await closeAuditCount(run.id)).toBe(1);
    });

    it('R-IT-04 — cau truy van UNG VIEN tren SQL that: dung tap, va CHI DOC', async () => {
      /*
       * Bai nay kiem chinh cau `WHERE` ma ban trong bo nho khong the kiem thay: `some` + `every`
       * tren quan he chang. No khong goi `sweep()` — mot luot quet se dong ca nhung vong chay ma
       * tep kiem khac dang dung tren cung mot CSDL, va lam do nhung bai khong lien quan.
       */
      const due = await finishedRun(FAR_LABEL);
      const tooFresh = await finishedRun(FAR_LABEL);

      // Mot vong chay con chang CHUA chay: khong bao gio la ung vien.
      const vehicle = await aVehicle();
      const order = await anOrder('IT-R293 Kho A', FAR_LABEL);
      const pending = await movement.createRun(
        { code: next('RUN'), vehicleId: vehicle.id, businessDate: '2026-09-11', note: null },
        ACTOR,
      );
      await movement.addLeg(
        pending.id,
        {
          sequence: 1,
          kind: 'LOADED',
          orderId: order.id,
          originLabel: 'IT-R293 Kho A',
          destinationLabel: FAR_LABEL,
          businessDate: '2026-09-11',
          distanceKm: null,
          plannedDistanceKm: null,
          note: null,
        },
        ACTOR,
      );

      // Moc nam SAU khi hai vong chay kia xong: ca hai deu da "cu hon moc".
      const after = await movement.listRunClosureCandidates({
        completedBefore: new Date(Date.now() + 60_000),
        idleHours: 12,
        depotLabel: DEPOT_LABEL,
        limit: 200,
      });
      const dueIds = after.map((candidate) => candidate.id);

      // Vong chay con chang CHUA chay khong bao gio la ung vien.
      expect(dueIds).not.toContain(pending.id);
      // Hai vong chay da xong thi co.
      expect(dueIds).toEqual(expect.arrayContaining([due.run.id, tooFresh.run.id]));

      // VA BAI NAY CHI DOC: khong mot vong chay nao bi doi trang thai. (`pending` chua lan banh —
      // no o `PLANNED`, va do cung la mot ly do nua de no khong the la ung vien.)
      expect(await statusOf(due.run.id)).toBe('ACTIVE');
      expect(await statusOf(tooFresh.run.id)).toBe('ACTIVE');
      expect(await statusOf(pending.id)).toBe('PLANNED');

      // Chieu nguoc lai: mot moc nam TRUOC khi chung xong thi loai chung ra — day la dieu kien
      // "lan hoan thanh muon nhat da cu hon moc", va no phai that su loc duoc.
      const before = await movement.listRunClosureCandidates({
        completedBefore: new Date(Date.now() - 60 * 60_000),
        idleHours: 12,
        depotLabel: DEPOT_LABEL,
        limit: 200,
      });
      expect(before.map((candidate) => candidate.id)).not.toContain(due.run.id);
    });

    it('R-IT-04b — khach chua khai nguong nghi: ung vien chi la vong chay CO THE dong duoc', async () => {
      const home = await finishedRun(FAR_LABEL, { home: true });
      const away = await finishedRun(FAR_LABEL);

      const candidates = await movement.listRunClosureCandidates({
        completedBefore: new Date(Date.now() + 60_000),
        idleHours: null,
        depotLabel: DEPOT_LABEL,
        limit: 200,
      });
      const ids = candidates.map((candidate) => candidate.id);

      // Ve bai: co the dong duoc bang su kien, nen phai co mat.
      expect(ids).toContain(home.run.id);
      // Xa bai + khong co nguong: KHONG BAO GIO dong duoc bang thoi gian, nen khong duoc chiem
      // mot cho trong trang — do la loi da sua sau khi mot vong soat doc lap do duoc no.
      expect(ids).not.toContain(away.run.id);
    });

    it('R-IT-05 — dong vong chay KHONG dung toi nghia vu thuong mai cua don', async () => {
      const { run, order } = await finishedRun(DEPOT_LABEL);
      const before = await prisma.transportOrder.findUniqueOrThrow({ where: { id: order.id } });

      await freshProcess().closures.attempt(run.id, 'LEG_CHANGED');

      const after = await prisma.transportOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(after).toEqual(before);
      expect(after.status).toBe('OPEN');
    });

    it('R-IT-06 — vong chay da dong khong nhan them chang: lich su la bat bien', async () => {
      const { run } = await finishedRun(DEPOT_LABEL);
      await freshProcess().closures.attempt(run.id, 'LEG_CHANGED');

      await expect(
        movement.addLeg(
          run.id,
          { sequence: 9, kind: 'EMPTY', originLabel: 'A', destinationLabel: 'B' },
          ACTOR,
        ),
      ).rejects.toMatchObject({ reason: 'LEG_RUN_TERMINAL' });

      const persisted = await movement.getRun(run.id);
      expect(persisted.legs).toHaveLength(2);
    });

    /* ================================================================ *
     * R-IT-07..09 — TOCTOU: NGUOI LAP KE HOACH DUA VOI DUONG DONG
     *
     * R-IT-06 do mot THU TU da biet: dong xong roi moi them chang. Cai chua ai do la khi hai viec
     * do chay CHONG LEN NHAU — dung cua so ma `#293` R2 goi ten. Bat bien phai giu duoc la mot
     * cau don:
     *
     *     KHONG BAO GIO co mot vong chay o diem cuoi mang mot viec moi vua duoc ghi.
     *
     * Nen moi bai duoi day khong khang dinh AI THANG. Chung khang dinh rang hai ket cuc — va chi
     * hai — la hop le, va ket cuc thu ba (dong + co viec moi) khong bao gio xay ra. Mot bai kiem
     * doi mot nguoi thang cu the se do vi lich CPU, va nguoi ta se chay lai thay vi doc.
     * ================================================================ */

    it('R-IT-07 — dua giua DONG va THEM CHANG: khong bao gio ra mot vong chay dong mang chang moi', async () => {
      for (let round = 0; round < 6; round += 1) {
        const { run } = await finishedRun(DEPOT_LABEL);

        const [closing, adding] = await Promise.allSettled([
          freshProcess().closures.attempt(run.id, 'IDLE_SWEEP'),
          movement.addLeg(
            run.id,
            {
              sequence: 90 + round,
              kind: 'EMPTY',
              originLabel: DEPOT_LABEL,
              destinationLabel: 'IT-R293 Diem moi',
            },
            ACTOR,
          ),
        ]);

        const persisted = await movement.getRun(run.id);
        const openLegs = persisted.legs.filter(
          (leg) => leg.status !== 'COMPLETED' && leg.status !== 'CANCELLED',
        );

        if (persisted.run.status === 'COMPLETED') {
          // Duong dong thang: chang moi PHAI bi tu choi, va bi tu choi bang dung ma nghiep vu ma
          // duong tuan tu tra ve — nguoi dung khong duoc nhan hai cau tra loi khac nhau cho cung
          // mot su that chi vi ho cham hon mot phan nghin giay.
          expect(adding.status).toBe('rejected');
          if (adding.status === 'rejected') {
            expect(adding.reason).toMatchObject({ reason: 'LEG_RUN_TERMINAL' });
          }
          expect(openLegs).toHaveLength(0);
          expect(await closeAuditCount(run.id)).toBe(1);
        } else {
          // Nguoi lap ke hoach thang: chang moi con do, vong chay VAN chay, va khong mot dong dau
          // vet dong nao duoc ghi.
          expect(adding.status).toBe('fulfilled');
          expect(persisted.run.status).toBe('ACTIVE');
          expect(openLegs).toHaveLength(1);
          expect(await closeAuditCount(run.id)).toBe(0);
          if (closing.status === 'fulfilled') expect(closing.value.closed).toBe(false);
        }
      }
    });

    it('R-IT-08 — dua giua DONG va CHOT KE HOACH: vong chay dong khong mang ke hoach moi', async () => {
      for (let round = 0; round < 4; round += 1) {
        const { run, vehicle } = await finishedRun(DEPOT_LABEL);
        const extra = await anOrder('IT-R293 Kho A', 'IT-R293 Diem gop');

        /*
         * `MULTI_ORDER_RUN` la che do gom nhom: mot don moi duoc gan vao vong chay DANG chay cua
         * chinh chiec xe do thay vi mo mot vong chay khac. Do la duong duy nhat trong he nay ma
         * mot lan CHOT KE HOACH ghi viec moi vao mot vong chay da ton tai — tuc dung doi tuong ma
         * `#293` R2 goi la *"a concurrent planner"*.
         */
        const planner = new PlanningService(
          movement,
          planRepo,
          fleet,
          audit,
          CORE_POLICY,
          policyWith({ grouping: 'MULTI_ORDER_RUN' }),
        );

        const [, committing] = await Promise.allSettled([
          freshProcess().closures.attempt(run.id, 'IDLE_SWEEP'),
          planner.commit(extra.id, { vehicleId: vehicle.id, idempotencyKey: next('KEY') }, ACTOR),
        ]);

        const persisted = await movement.getRun(run.id);
        const plansOnRun = await prisma.transportOrderRunPlan.findMany({
          where: { runId: run.id },
          select: { id: true, loadedLegId: true },
        });
        const openLegs = persisted.legs.filter(
          (leg) => leg.status !== 'COMPLETED' && leg.status !== 'CANCELLED',
        );

        if (persisted.run.status === 'COMPLETED') {
          // Mot ke hoach chi ton tai khi chang co hang cua no ton tai, va chang do di qua chinh
          // khoa ma lan dong dang giu. Nen mot vong chay da dong khong the mang mot ke hoach ma
          // chang cua no con mo.
          expect(openLegs).toHaveLength(0);
          for (const plan of plansOnRun) {
            const leg = persisted.legs.find((entry) => entry.id === plan.loadedLegId);
            expect(leg?.status === 'COMPLETED' || leg?.status === 'CANCELLED').toBe(true);
          }
        } else {
          expect(persisted.run.status).toBe('ACTIVE');
          expect(committing.status).toBe('fulfilled');
          expect(openLegs.length).toBeGreaterThan(0);
          expect(await closeAuditCount(run.id)).toBe(0);
        }
      }
    });

    /**
     * R-IT-09 — BUOC CHUYEN VA DAU VET SONG CHET CUNG NHAU.
     *
     * Truoc `#293` R2, dau vet duoc ghi bang mot lan goi kho RIENG sau khi buoc chuyen da commit.
     * Mot cu chet o giua hai lan ghi do de lai mot vong chay `COMPLETED` ma khong mot dong bang
     * chung nao noi ai dong no va vi sao — va dau vet CHINH LA bang chung nghiem thu cua lane nay.
     *
     * Khong the tat dien mot tien trinh trong mot bai kiem, nen bai nay lam dieu tuong duong va
     * kiem duoc: bat lan ghi dau vet HONG. Neu hai thu nam trong mot giao dich thi buoc chuyen
     * phai cuon lai cung no; neu chung nam o hai giao dich thi vong chay se o lai `COMPLETED`
     * khong dau vet — dung khoang trong dang duoc dong.
     */
    it('R-IT-09 — dau vet ghi hong thi buoc chuyen cuon lai, khong de lai vong chay dong mu', async () => {
      const { run } = await finishedRun(DEPOT_LABEL);

      const repo = new PrismaMovementRepository(prisma);
      await expect(
        repo.closeRunAsSystemSerialized({
          runId: run.id,
          at: new Date(),
          decide: async () => ({ close: true, trigger: 'DEPOT_RETURN' }),
          trace: () => {
            throw new Error('kho dau vet ngat giua chung');
          },
        }),
      ).rejects.toThrow(/kho dau vet ngat giua chung/);

      expect(await statusOf(run.id)).toBe('ACTIVE');
      expect(await closeAuditCount(run.id)).toBe(0);

      // Va duong binh thuong van dong duoc sau do — lan hong khong de lai mot hang khoa nao.
      const outcome = await freshProcess().closures.attempt(run.id, 'IDLE_SWEEP');
      expect(outcome.closed).toBe(true);
      expect(await statusOf(run.id)).toBe('COMPLETED');
      expect(await closeAuditCount(run.id)).toBe(1);
    });

    /* ==================================================================================
     * CUA SO CON LAI SAU `#290` — NGUOI GHI O NGOAI `transport-core`
     * ==================================================================================
     *
     * R-IT-01..09 dong cua so cua CHINH `transport-core`: chang, ke hoach, dau vet. Hai bai duoi
     * day dong cua so con lai, cai ma `run-closure.service.ts` truoc do ghi ro la con ho: mot
     * phien cho hoac mot moc hien truong ghi duoc SAU khi lan dong da chup anh nhung TRUOC khi no
     * commit.
     *
     * CACH EP DUNG CUA SO DO. `attempt()` hoi nguon chan HAI lan — mot lan truoc khi khoa, mot lan
     * BEN TRONG giao dich dang giu khoa. `raceOnRecheck()` gai doi thu vao dung lan thu hai, tuc
     * dung khoanh khac ma truoc lane nay khong ai bao ve.
     *
     * VA NO KHONG `await` DOI THU O DO. Voi ranh gioi serialize dung cho, doi thu dang CHO chinh
     * cai khoa ma lan dong giu; `await` o day se treo ca hai. Nen bai kiem chi cho mot nhip du de
     * doi thu cham toi cau `FOR UPDATE` roi di tiep. Khong co khoa thi lan ghi cua doi thu hoan
     * tat NGAY trong nhip do — va do dung la truong hop hong ma hai bai nay ton tai de bat.
     */
    const RACE_SETTLE_MS = 150;

    const stubLocationFacts = new (class extends TransportCheckpointLocationFacts {
      async findObservation(): Promise<null> {
        return null;
      }
    })();

    /** Bo doi cua `transport-checkpoint`, day du nhu luc chay: cung kho, cung cong, cung khoa. */
    const checkpointStack = () => {
      const guard = new MovementRunWriteGuard(movementRepo);
      const core = new TransportCheckpointCoreFactsAdapter(movementRepo, fleet);
      const checkpointRepo = new PrismaCheckpointRepository(prisma);
      const sessionRepo = new PrismaWaitingSessionRepository(prisma);
      const checkpointService = new CheckpointService(
        checkpointRepo,
        core,
        stubLocationFacts,
        guard,
        CORE_POLICY,
        // Chinh sach vi tri RONG: hai bai nay hoi ve KHOA, khong ve bang chung vi tri.
        { locationRequiredTypes: [] },
      );
      return {
        checkpointRepo,
        checkpointService,
        waitingService: new WaitingSessionService(
          sessionRepo,
          checkpointRepo,
          core,
          guard,
          CORE_POLICY,
        ),
        /**
         * CHI phien cho — dung cho R-IT-10.
         *
         * Neo cua mot phien cho la mot moc `DELIVERY_ARRIVAL` co that, va chinh moc do dua chang
         * sang giai doan `ARRIVED` — tuc `CARGO_STILL_CARRIED`. Dung ban gop o bai do thi vong chay
         * bi chan NGAY TU LAN HOI DAU, lan dong khong bao gio vao toi khoa, va cuoc dua khong bao
         * gio xay ra: bai kiem se XANH ma khong kiem gi ca.
         *
         * Nen bai phien cho hoi dung chieu cua no. Chieu kia da co bai rieng ngay duoi.
         */
        waitingBlockers: new WaitingRunClosureBlockerSource(sessionRepo),
        blockers: new TransportCheckpointRunClosureBlockerSource(
          new CheckpointRunClosureBlockerSource(checkpointService),
          new WaitingRunClosureBlockerSource(sessionRepo),
        ),
      };
    };

    /**
     * Mot `RunClosureService` that, nhung nguon chan bi gai mot doi thu o LAN HOI THU HAI.
     *
     * Lan thu nhat (truoc khoa) di qua nguyen ven: neu no cung kich hoat doi thu thi bai kiem se do
     * o mot cua so khac han, va khong noi duoc gi ve cua so dang xet.
     */
    const raceOnRecheck = (source: RunClosureBlockerSource, racer: () => void) => {
      let asked = 0;
      let fired = false;
      const spy = new (class extends RunClosureBlockerSource {
        async blockersForRun(runId: string) {
          asked += 1;
          const seen = await source.blockersForRun(runId);
          if (asked === 2) {
            fired = true;
            racer();
            await new Promise((resolve) => setTimeout(resolve, RACE_SETTLE_MS));
          }
          return seen;
        }
      })();
      const policy = policyWith();
      const service = new MovementService(movementRepo, fleet, audit, CORE_POLICY);
      return {
        /**
         * DOI THU DA THUC SU CHAY CHUA.
         *
         * Khang dinh nay khong thua. `settleRunClosure()` chi hoi nguon chan LAN THU HAI khi lan
         * thu nhat da ket luan "dong duoc" — mot vong chay bi chan ngay tu dau se khong bao gio vao
         * toi khoa, va doi thu khong bao gio duoc gai. Khi do moi khang dinh ben duoi van dung MOT
         * CACH RONG TUECH, va bai kiem bao xanh cho mot cuoc dua chua tung dien ra.
         *
         * Do khong phai mot gia dinh: dung dieu do da xay ra o ban dau cua R-IT-10, khi moc neo cua
         * phien cho tu no dung len mot ma chan `CARGO_STILL_CARRIED`.
         */
        raced: () => fired,
        closures: new RunClosureService(
          new PlanningService(
            service,
            new PrismaRunPlanRepository(prisma),
            fleet,
            audit,
            CORE_POLICY,
            policy,
          ),
          service,
          policy,
          spy,
        ),
      };
    };

    /**
     * MOT ho so lai xe cho ca hai bai, khong phai mot ho so moi cho moi bai.
     *
     * `authUserId` la DUY NHAT tren bang lai xe — cau noi phien dang nhap sang ho so chi co nghia
     * khi no mot-doi-mot. Tao ho so thu hai voi cung `AUTH` se do vi mot va cham unique khong lien
     * quan gi den dieu hai bai nay dinh kiem.
     */
    let sharedDriverId: string | null = null;
    const theDriver = async () => {
      if (sharedDriverId) return sharedDriverId;
      const driver = await fleet.createDriver({
        fullName: 'IT-R293 Lai xe',
        phone: `${PHONE_PREFIX}01`,
        licenceClass: 'FC',
        licenceExpiry: '2030-01-01',
        authUserId: AUTH,
      });
      sharedDriverId = driver.id;
      return sharedDriverId;
    };

    /**
     * Mot vong chay da xong viec, co lai xe da phan cong va mot chang de bam moc.
     *
     * Chang de bam moc la chang CO HANG. `legs[0]` la chang 1 RONG (bai -> kho), va tu `#332` moc
     * hang hoa (`PICKUP_ARRIVAL`, `LOADING`, `DELIVERY_ARRIVAL`...) khong neo duoc vao chang rong —
     * dung hinh dang ma runtime 19/09/2026 da ghi nham.
     */
    const closableRunWithDriver = async () => {
      const { run } = await finishedRun(DEPOT_LABEL);
      const driverId = await theDriver();
      await movement.assignRun(run.id, { driverId }, ACTOR);
      const legs = (await movement.getRun(run.id)).legs;
      return { run, driverId, legId: legs.find((leg) => leg.kind === 'LOADED')!.id };
    };

    const reasonOfRejection = (error: unknown): string =>
      error instanceof TransportDomainError ? error.reason : `UNEXPECTED:${String(error)}`;

    /**
     * Ket cuc cua lenh doi thu, bat NGAY khi no duoc gai.
     *
     * Tu `#354` (moc) va `#358` (phien cho), lenh tren chang da ket thuc bi tu choi o phep kiem SOM —
     * truoc khi lan dong tra ve — nen mot `.then` gan sau `attempt()` de lai mot rejection chua ai
     * bat, va vitest tinh do la loi cua ca lan chay du moi bai deu xanh.
     */
    interface RacerOutcome {
      readonly ok: boolean;
      readonly reason: string;
    }
    const outcomeOf = (work: Promise<unknown>): Promise<RacerOutcome> =>
      work.then(
        () => ({ ok: true, reason: '' }),
        (error: unknown) => ({ ok: false, reason: reasonOfRejection(error) }),
      );

    it('R-IT-10 — mo phien cho DUNG LUC dong: khong vong chay dong nao mang phien mo', async () => {
      const { run, driverId, legId } = await closableRunWithDriver();
      const stack = checkpointStack();

      // NEO cua phien cho: mot lan `DELIVERY_ARRIVAL` co that, do CHINH lai xe nay ghi.
      const anchor = await stack.checkpointRepo.create({
        type: 'DELIVERY_ARRIVAL',
        runId: run.id,
        legId,
        recordedBy: AUTH,
        driverId,
        observationId: null,
        clientEventId: next('ARR'),
        capturedAt: null,
        receivedAt: new Date(),
        businessDate: '2026-09-11',
        note: null,
      });

      // Bat ket cuc NGAY khi gai — tu `#358` lenh mo bi tu choi o phep kiem SOM, truoc khi lan dong
      // tra ve (cung ly do voi `outcomeOf` o R-IT-11).
      let racer: Promise<RacerOutcome> = Promise.resolve({ ok: false, reason: 'NOT_RACED' });
      const race = raceOnRecheck(stack.waitingBlockers, () => {
        racer = outcomeOf(
          stack.waitingService.start({
            runId: run.id,
            legId,
            arrivalCheckpointId: anchor.id,
            reason: 'RECEIVER_NOT_READY',
            clientEventId: next('WAIT'),
            authUserId: AUTH,
          }),
        );
      });

      const outcome = await race.closures.attempt(run.id, 'IDLE_SWEEP');
      expect(race.raced()).toBe(true);
      const started = await racer;

      const status = await statusOf(run.id);
      const open = await prisma.transportDeliveryWaitingSession.count({
        where: { runId: run.id, status: 'OPEN' },
      });

      /*
       * BAT BIEN, doc duoc thanh mot cau: mot vong chay o diem cuoi KHONG duoc ton tai cung mot
       * phien cho dang mo. Ben nao thang khong quan trong — ca hai ket cuc deu dung, va bai kiem
       * khong duoc ep mot thu tu ma khoa khong he hua.
       */
      expect(status === 'COMPLETED' && open > 0).toBe(false);

      /*
       * `#358`: moi chang cua mot vong chay DONG DUOC deu da o diem cuoi, va chang o diem cuoi khong
       * mo phien cho moi. Nen nhanh "phien thang, lan dong giu lai" cua cuoc dua nay KHONG con ton
       * tai — bat bien o tren gio duoc giu boi HAI cong doc lap. Lenh mo bi tu choi o cong chang (neu
       * no doc vong chay truoc khi lan dong commit) hoac o cong vong chay (neu sau); ca hai deu dung,
       * va ca hai la mot ly do that chu khong mot `500`. Cua so khoa giua lenh mo va lan dong (chang
       * roi vong chay ket thuc trong khe truoc khoa) van duoc do rieng o WL-IT-11 cua
       * `waiting-terminal-leg.int.spec.ts`; nhanh "phien thang" cua CHANG con mo o WL-IT-06.
       */
      expect(status).toBe('COMPLETED');
      expect(outcome.closed).toBe(true);
      expect(open).toBe(0);
      expect(started.ok).toBe(false);
      expect(['WAITING_LEG_TERMINAL', 'WAITING_RUN_TERMINAL']).toContain(started.reason);
    });

    it('R-IT-11 — ghi moc hang-tren-thung DUNG LUC dong: khong vong chay dong nao con hang', async () => {
      const { run, legId } = await closableRunWithDriver();
      const stack = checkpointStack();

      /*
       * `LOADING` doi `PICKUP_ARRIVAL` (xem `REQUIRES` o `checkpoint-lifecycle.ts`), nen moc dau
       * duoc ghi TRUOC cuoc dua. Mot minh no chi cho ra giai doan `AT_PICKUP` — CHUA phai hang tren
       * thung — va khang dinh ngay duoi ghim dieu do lai: cuoc dua bat dau tu mot vong chay KHONG
       * co gi chan.
       *
       * GIEO thang vao kho, cung cach R-IT-10 gieo moc neo cua no: chang CO HANG o day da
       * `COMPLETED` (vong chay phai het viec moi dong duoc), va tu `#354` duong dich vu tu choi moi
       * moc MOI tren chang da ket thuc — chinh lan ghi `PICKUP_ARRIVAL` qua dich vu truoc day la hinh
       * dang `#354` cam.
       */
      await stack.checkpointRepo.create({
        type: 'PICKUP_ARRIVAL',
        runId: run.id,
        legId,
        recordedBy: AUTH,
        driverId: await theDriver(),
        observationId: null,
        clientEventId: next('PA'),
        capturedAt: null,
        receivedAt: new Date(),
        businessDate: '2026-09-11',
        note: null,
      });
      expect(await stack.blockers.blockersForRun(run.id)).toEqual([]);

      let racer: Promise<RacerOutcome> = Promise.resolve({ ok: false, reason: 'NOT_RACED' });
      const race = raceOnRecheck(stack.blockers, () => {
        racer = outcomeOf(
          stack.checkpointService.recordAsDriver({
            type: 'LOADING',
            runId: run.id,
            legId,
            authUserId: AUTH,
            clientEventId: next('LD'),
          }),
        );
      });

      const outcome = await race.closures.attempt(run.id, 'IDLE_SWEEP');
      expect(race.raced()).toBe(true);
      const recorded = await racer;

      const status = await statusOf(run.id);
      const carrying = (await stack.blockers.blockersForRun(run.id)).includes(
        'CARGO_STILL_CARRIED',
      );

      expect(status === 'COMPLETED' && carrying).toBe(false);

      /*
       * `#354`: moi chang cua mot vong chay DONG DUOC deu da o diem cuoi, va chang o diem cuoi khong
       * nhan moc moi. Nen nhanh "moc thang, lan dong giu lai" cua cuoc dua nay KHONG con ton tai —
       * bat bien o tren gio duoc giu boi HAI cong doc lap. Lenh ghi bi tu choi o cong chang (neu no
       * doc vong chay truoc khi lan dong commit) hoac o cong vong chay (neu sau); ca hai deu dung.
       * Cua so khoa giua moc va lan dong van duoc do rieng o R-IT-11b.
       */
      expect(status).toBe('COMPLETED');
      expect(outcome.closed).toBe(true);
      expect(carrying).toBe(false);
      expect(recorded.ok).toBe(false);
      expect(['CHECKPOINT_LEG_TERMINAL', 'CHECKPOINT_RUN_TERMINAL']).toContain(recorded.reason);
    });

    /**
     * R-IT-11b — CUA SO KHOA giua MOC va LAN DONG, sau `#354`.
     *
     * R-IT-11 khong con cham toi khoa: moc hang hoa tren chang da ket thuc bi chan ngay o phep kiem
     * som. Cai con lai la moc MUC VONG CHAY — no khong neo vao chang nao, nen di toi tan cong duoi
     * khoa. Doi thu duoc gai trong luc lan dong GIU khoa, doc thay `ACTIVE` o phep kiem som, roi phai
     * XEP HANG sau lan dong: khi no lay duoc khoa thi vong chay da `COMPLETED`, va cong duoi khoa tu
     * choi. Khong co khoa chung thi moc do se duoc ghi vao mot vong chay da dong.
     */
    it('R-IT-11b — moc MUC VONG CHAY dung luc dong: xep hang sau lan dong va bi chan DUOI khoa', async () => {
      const { run } = await closableRunWithDriver();
      const stack = checkpointStack();
      // `COMPLETED` (muc vong chay) doi `DEPARTED`, `DEPARTED` doi `ASSIGNED` — ghi khi vong chay con chay.
      for (const type of ['ASSIGNED', 'DEPARTED'] as const) {
        await stack.checkpointService.recordAsDriver({
          type,
          runId: run.id,
          authUserId: AUTH,
          clientEventId: next(type),
        });
      }
      expect(await stack.blockers.blockersForRun(run.id)).toEqual([]);

      let racer: Promise<RacerOutcome> = Promise.resolve({ ok: false, reason: 'NOT_RACED' });
      const race = raceOnRecheck(stack.blockers, () => {
        racer = outcomeOf(
          stack.checkpointService.recordAsDriver({
            type: 'COMPLETED',
            runId: run.id,
            authUserId: AUTH,
            clientEventId: next('DONE'),
          }),
        );
      });

      const outcome = await race.closures.attempt(run.id, 'IDLE_SWEEP');
      expect(race.raced()).toBe(true);
      const recorded = await racer;

      expect(outcome.closed).toBe(true);
      expect(await statusOf(run.id)).toBe('COMPLETED');
      expect(recorded).toEqual({ ok: false, reason: 'CHECKPOINT_RUN_TERMINAL' });
      expect(
        await prisma.transportRunCheckpoint.count({ where: { runId: run.id, type: 'COMPLETED' } }),
      ).toBe(0);
    });
  },
);
