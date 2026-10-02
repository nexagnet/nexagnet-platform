import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { TransportCheckpointCoreFactsAdapter } from '../checkpoint/checkpoint-facts.port.js';
import { PrismaCheckpointRepository } from '../checkpoint/prisma-checkpoint.repository.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { MovementRunWriteGuard } from '../movement/run-write-guard.port.js';
import { describeStorageError, isUniqueViolationOn } from '../storage-conflict.js';
import { TransportDomainError } from '../transport.errors.js';
import { PrismaWaitingSessionRepository } from './prisma-waiting.repository.js';
import { WAITING_CLIENT_EVENT, WAITING_OPEN_PER_LEG } from './waiting.repository.js';
import { WaitingSessionService } from './waiting.service.js';

/**
 * PHIEN CHO NGUOI NHAN tren POSTGRES THAT — `#279` O5/O13.
 *
 * Ban trong bo nho khong chung minh duoc cai ma tranche nay thuc su dua vao: unique MOT PHAN
 * `WHERE status = 'OPEN'`, bon `CHECK`, va trigger chi-cho-mot-canh. Bo test nay chung minh
 * nhung thu do.
 *
 * VA MOT DIEU NUA, quan trong hon ca: `isUniqueViolationOn` phai NHAN RA duoc va cham thuc te.
 * Prisma khong bao ten index — no doi nguoc ten constraint thanh TEN TRUONG. Khong nhan ra thi mot
 * lan bam thu hai se tra ve `500` thay vi mot ma nguoi dung doc duoc.
 *
 * Chay bang `RUN_PRISMA_IT=1`; khong co bien do thi ca khoi khong chay.
 */

const RUN_PREFIX = 'IT-WT';
const PLATE_PREFIX = 'IT-WT-XE';
const PHONE_PREFIX = '0966WT';
const ACTOR = 'it-waiting';
const AUTH = 'it-wt-lai-xe';
const POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;

/**
 * KHOA TU VAN dung chung cho MOI tep IT cham vao trigger cua mien phien cho.
 *
 * Con so nay khong co y nghia nghiep vu — no chi can GIONG NHAU o moi tep. Doi no o mot tep ma
 * quen tep kia se lam khoa mat tac dung mot cach im lang.
 */
const WAITING_TRIGGER_LOCK = 279_005;

const reasonOf = async (run: Promise<unknown>): Promise<string> => {
  try {
    await run;
    return 'NO_ERROR_THROWN';
  } catch (error) {
    return error instanceof TransportDomainError ? error.reason : `UNEXPECTED:${String(error)}`;
  }
};

describe.runIf(process.env.RUN_PRISMA_IT === '1')('phien cho tren Postgres that', () => {
  const prisma = new PrismaService();
  const fleet = new PrismaFleetRepository(prisma);
  const movementRepo = new PrismaMovementRepository(prisma);
  const checkpoints = new PrismaCheckpointRepository(prisma);
  const sessions = new PrismaWaitingSessionRepository(prisma);

  const movement = new MovementService(
    movementRepo,
    fleet,
    new AuditLogService(new InMemoryAuditLogRepository()),
    POLICY,
  );
  let now = new Date('2026-09-09T02:00:00.000Z');
  const service = new WaitingSessionService(
    sessions,
    checkpoints,
    new TransportCheckpointCoreFactsAdapter(movementRepo, fleet),
    new MovementRunWriteGuard(movementRepo),
    POLICY,
    undefined,
    () => now,
  );

  let runId = '';
  let legId = '';
  let arrivalId = '';
  let driverId = '';
  let suffix = 0;

  /** Don dep theo THU TU AN TOAN VE KHOA NGOAI: phien cho -> moc -> chang -> phan cong -> vong chay. */
  async function cleanup(): Promise<void> {
    const runs = await prisma.transportVehicleRun.findMany({
      where: { code: { startsWith: RUN_PREFIX } },
      select: { id: true },
    });
    const runIds = runs.map((run) => run.id);
    if (runIds.length === 0) return;

    // Ca hai bang deu duoc bao ve boi trigger, va khoa ngoai la `Restrict` nen khong co duong
    // `CASCADE` nao. Lan don dep phai TAT trigger mot cach tuong minh — mot thao tac chi xay ra o
    // day, trong mot bai IT, va duoc bat lai ngay. Cung khuon `transport-site-intake.int.spec.ts`.
    /**
     * KHOA TU VAN quanh khoi TAT/BAT trigger.
     *
     * Hai tep IT cua mien nay (`transport-waiting.int.spec.ts` va tep nay) deu tat roi bat lai trigger
     * `transport_waiting_session_immutable` — mot doi tuong CHUNG cua ca co so du lieu. CI chay cac
     * tep IT SONG SONG, nen mot tep co the BAT lai trigger dung luc tep kia dang xoa, va lan xoa do
     * chet vi chinh cai trigger vua duoc bat.
     *
     * Do khong phai mot gia dinh: no da do dung kieu ay khi hai tep duoc chay cung mot lenh
     * (09/09/2026), roi XANH khi chay lai — dung hinh dang cua mot flake lam nguoi ta chay lai thay
     * vi doc.
     *
     * `pg_advisory_lock` tren mot khoa co dinh lam hai tep xep hang. Khoa duoc nha o `finally`, nen
     * mot bai do khong khoa lai ca lan chay ke tiep.
     */
    // Khoa tu van MUC GIAO DICH, moi lenh trong CUNG mot giao dich (cung ly do voi
    // `waiting-delivery-accepted.int.spec.ts`): khoa muc phien qua pool Prisma co the nha tren
    // mot ket noi khac ("you don't own a lock"), ro lai va chan buoc don cua moi tep dung chung so.
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${WAITING_TRIGGER_LOCK})`);
        for (const [table, trigger] of [
          ['TransportDeliveryWaitingSession', 'transport_waiting_session_immutable'],
          ['TransportRunCheckpoint', 'transport_run_checkpoint_append_only'],
        ] as const) {
          await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${trigger}"`);
        }
        await tx.transportDeliveryWaitingSession.deleteMany({ where: { runId: { in: runIds } } });
        await tx.transportRunCheckpoint.deleteMany({ where: { runId: { in: runIds } } });
        for (const [table, trigger] of [
          ['TransportDeliveryWaitingSession', 'transport_waiting_session_immutable'],
          ['TransportRunCheckpoint', 'transport_run_checkpoint_append_only'],
        ] as const) {
          await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER "${trigger}"`);
        }
      },
      { maxWait: 10_000, timeout: 45_000 },
    );
    await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });
    await prisma.transportVehicleAssignment.deleteMany({
      where: { vehicle: { registrationPlate: { startsWith: PLATE_PREFIX } } },
    });
    await prisma.transportVehicle.deleteMany({
      where: { registrationPlate: { startsWith: PLATE_PREFIX } },
    });
    await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
  }

  /** Mot chang giao hang MOI, da bam `Da den noi`. Moi bai lay mot chang rieng. */
  async function freshDeliveryLeg(): Promise<void> {
    suffix += 1;
    const vehicle = await fleet.createVehicle({
      registrationPlate: `${PLATE_PREFIX}-${suffix}`,
      vehicleClass: 'Dau keo',
    });
    const run = await movement.createRun(
      { code: `${RUN_PREFIX}-${suffix}`, vehicleId: vehicle.id, businessDate: '2026-09-09' },
      ACTOR,
    );
    runId = run.id;
    await movement.assignRun(run.id, { driverId }, ACTOR);
    const leg = await movement.addLeg(
      run.id,
      { sequence: 1, kind: 'EMPTY', originLabel: 'Ha Noi', destinationLabel: 'Hai Phong' },
      ACTOR,
    );
    legId = leg.id;

    const arrival = await checkpoints.create({
      type: 'DELIVERY_ARRIVAL',
      runId: run.id,
      legId: leg.id,
      recordedBy: AUTH,
      driverId,
      observationId: null,
      clientEventId: `${RUN_PREFIX}-arr-${suffix}`,
      capturedAt: null,
      receivedAt: now,
      businessDate: '2026-09-09',
      note: null,
    });
    arrivalId = arrival.id;
  }

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    const driver = await fleet.createDriver({
      fullName: 'IT Waiting Lai xe',
      phone: `${PHONE_PREFIX}01`,
      licenceClass: 'FC',
      licenceExpiry: '2030-01-01',
      authUserId: AUTH,
    });
    driverId = driver.id;
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  }, 60_000);

  const start = (over: Record<string, unknown> = {}) =>
    service.start({
      runId,
      legId,
      arrivalCheckpointId: arrivalId,
      reason: 'RECEIVER_NOT_READY',
      clientEventId: 'w.1',
      authUserId: AUTH,
      ...over,
    } as Parameters<typeof service.start>[0]);

  it('WT-IT-01 — mot phien mo, doc lai duoc, thoi luong tinh tu gio MAY CHU', async () => {
    await freshDeliveryLeg();
    const session = await start();

    expect(session.status).toBe('OPEN');
    expect(session.startedAt).toEqual(new Date('2026-09-09T02:00:00.000Z'));

    // Mot the hien dich vu MOI — tuc mot lan khoi dong lai. Phien phai con o do.
    now = new Date('2026-09-09T06:00:00.000Z');
    const restarted = new WaitingSessionService(
      new PrismaWaitingSessionRepository(prisma),
      checkpoints,
      new TransportCheckpointCoreFactsAdapter(movementRepo, fleet),
      new MovementRunWriteGuard(movementRepo),
      POLICY,
      undefined,
      () => now,
    );
    const own = await restarted.listOwn(AUTH);
    expect(own.map((row) => row.id)).toContain(session.id);
    expect(restarted.view(own.find((row) => row.id === session.id)!).elapsedSeconds).toBe(4 * 3600);
    now = new Date('2026-09-09T02:00:00.000Z');
  });

  /**
   * `#279` O13 bai 5 tren RANG BUOC THAT.
   *
   * Hai `clientEventId` KHAC NHAU — duong gui lai khong cuu duoc. Chi unique MOT PHAN
   * `WHERE status = 'OPEN'` moi chan duoc, va `isUniqueViolationOn` phai NHAN RA no de tra ve
   * `WAITING_ALREADY_OPEN` thay vi 500.
   */
  it('WT-IT-02 — hai lan bam khac nhau tren mot chang: unique MOT PHAN chan ban thu hai', async () => {
    await freshDeliveryLeg();
    await start({ clientEventId: 'w.a' });

    expect(await reasonOf(start({ clientEventId: 'w.b' }))).toBe('WAITING_ALREADY_OPEN');

    const rows = await prisma.transportDeliveryWaitingSession.findMany({
      where: { legId, status: 'OPEN' },
    });
    expect(rows).toHaveLength(1);
  });

  /** Va cham phai duoc NHAN RA — Prisma doi ten constraint thanh ten truong. */
  it('WT-IT-03 — `isUniqueViolationOn` nhan ra ca hai va cham that cua bang nay', async () => {
    await freshDeliveryLeg();
    const first = await sessions.create({
      runId,
      legId,
      driverId,
      arrivalCheckpointId: arrivalId,
      reason: 'QUEUE_AHEAD',
      startedAt: now,
      startedBy: AUTH,
      startClientEventId: 'w.raw',
      note: null,
      businessDate: '2026-09-09',
    });
    expect(first.id).toBeTruthy();

    let openConflict: unknown;
    try {
      await sessions.create({
        runId,
        legId,
        driverId,
        arrivalCheckpointId: arrivalId,
        reason: 'QUEUE_AHEAD',
        startedAt: now,
        startedBy: AUTH,
        startClientEventId: 'w.raw-2',
        note: null,
        businessDate: '2026-09-09',
      });
    } catch (error) {
      openConflict = error;
    }
    expect(isUniqueViolationOn(openConflict, WAITING_OPEN_PER_LEG)).toBe(true);
    expect(describeStorageError(openConflict)).toBeTruthy();

    await prisma.$executeRawUnsafe(
      'ALTER TABLE "TransportDeliveryWaitingSession" DISABLE TRIGGER "transport_waiting_session_immutable"',
    );
    try {
      await prisma.transportDeliveryWaitingSession.update({
        where: { id: first.id },
        data: { status: 'CLOSED', endedAt: now, endedBy: AUTH, closeReason: 'RECEIVER_ACCEPTED' },
      });
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "TransportDeliveryWaitingSession" ENABLE TRIGGER "transport_waiting_session_immutable"',
      );
    }

    // Chang KHONG con phien mo nao, nen lan nay va cham phai la khoa GUI LAI, khong phai khoa mo.
    let replayConflict: unknown;
    try {
      await sessions.create({
        runId,
        legId,
        driverId,
        arrivalCheckpointId: arrivalId,
        reason: 'QUEUE_AHEAD',
        startedAt: now,
        startedBy: AUTH,
        startClientEventId: 'w.raw',
        note: null,
        businessDate: '2026-09-09',
      });
    } catch (error) {
      replayConflict = error;
    }
    expect(isUniqueViolationOn(replayConflict, WAITING_CLIENT_EVENT)).toBe(true);
  });

  /**
   * `#279` O13 bai 4 tai TANG LUU TRU.
   *
   * `evaluateWaitingClose` da tu choi mot khoang am o tang mien. Bai nay do cai con lai: mot lenh
   * `psql` viet tay cung khong ghi duoc no.
   */
  it('WT-IT-04 — Postgres tu choi mot khoang AM, ke ca khi di vong qua tang mien', async () => {
    await freshDeliveryLeg();
    const session = await start({ clientEventId: 'w.neg' });

    await expect(
      prisma.transportDeliveryWaitingSession.update({
        where: { id: session.id },
        data: {
          status: 'CLOSED',
          endedAt: new Date('2026-09-09T01:00:00.000Z'),
          endedBy: ACTOR,
          closeReason: 'OPERATOR_CLOSED',
          closeNote: 'thu ghi mot khoang am',
        },
      }),
    ).rejects.toThrow(/period_order|immutable/);
  });

  /**
   * `#279` O6: *"approving user cannot rewrite WaitingSession timestamps"*.
   *
   * Tang mien khong co ham nao lam duoc viec do. Bai nay do cai con lai: trigger chan mot lenh
   * `UPDATE` viet tay len phan MO cua phien.
   */
  it('WT-IT-05 — khong ai sua duoc gio mo cua mot phien, ke ca bang mot lenh truc tiep', async () => {
    await freshDeliveryLeg();
    const session = await start({ clientEventId: 'w.imm' });

    await expect(
      prisma.transportDeliveryWaitingSession.update({
        where: { id: session.id },
        data: { startedAt: new Date('2026-09-08T02:00:00.000Z') },
      }),
    ).rejects.toThrow(/immutable/);

    await expect(
      prisma.transportDeliveryWaitingSession.delete({ where: { id: session.id } }),
    ).rejects.toThrow(/immutable/);

    const unchanged = await sessions.find(session.id);
    expect(unchanged?.startedAt).toEqual(new Date('2026-09-09T02:00:00.000Z'));
  });

  it('WT-IT-06 — mot phien da dong khong mo lai duoc', async () => {
    await freshDeliveryLeg();
    const session = await start({ clientEventId: 'w.reopen' });
    now = new Date('2026-09-09T05:00:00.000Z');
    await service.closeByOperator({ sessionId: session.id, note: 'don dep', authUserId: ACTOR });
    now = new Date('2026-09-09T02:00:00.000Z');

    await expect(
      prisma.transportDeliveryWaitingSession.update({
        where: { id: session.id },
        data: { status: 'OPEN', endedAt: null, endedBy: null, closeReason: null },
      }),
    ).rejects.toThrow(/immutable/);
  });

  /**
   * Mot hang `CLOSED` voi `endedAt IS NULL` la mot phien "da dong" ma thoi luong van chay mai — no
   * se hien tren bang dieu hanh nhu mot chiec xe dang cho ba hom nay.
   */
  it('WT-IT-07 — mot phien da dong phai dong DAY DU', async () => {
    await freshDeliveryLeg();
    const session = await start({ clientEventId: 'w.pair' });

    await prisma.$executeRawUnsafe(
      'ALTER TABLE "TransportDeliveryWaitingSession" DISABLE TRIGGER "transport_waiting_session_immutable"',
    );
    try {
      await expect(
        prisma.transportDeliveryWaitingSession.update({
          where: { id: session.id },
          data: { status: 'CLOSED' },
        }),
      ).rejects.toThrow(/close_pairing/);
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "TransportDeliveryWaitingSession" ENABLE TRIGGER "transport_waiting_session_immutable"',
      );
    }
  });

  it('WT-IT-08 — van hanh dong mot phien thi bat buoc noi ly do', async () => {
    await freshDeliveryLeg();
    const session = await start({ clientEventId: 'w.note' });

    await expect(
      prisma.transportDeliveryWaitingSession.update({
        where: { id: session.id },
        data: {
          status: 'CLOSED',
          endedAt: new Date('2026-09-09T05:00:00.000Z'),
          endedBy: ACTOR,
          closeReason: 'OPERATOR_CLOSED',
          closeNote: '   ',
        },
      }),
    ).rejects.toThrow(/operator_close_note/);
  });

  /** Mot chang CO THE co nhieu phien DA DONG — unique day du tren `legId` se chan luon lich su do. */
  it('WT-IT-09 — mot chang ghi duoc phien cho THU HAI sau khi phien thu nhat da dong', async () => {
    await freshDeliveryLeg();
    const first = await start({ clientEventId: 'w.seq-1' });
    now = new Date('2026-09-09T03:00:00.000Z');
    await service.closeByOperator({ sessionId: first.id, note: 'nhap nham', authUserId: ACTOR });

    const second = await start({ clientEventId: 'w.seq-2' });
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe('OPEN');
    expect(await sessions.listForLeg(legId)).toHaveLength(2);
    now = new Date('2026-09-09T02:00:00.000Z');
  });
});
