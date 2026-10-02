import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { PrismaCheckpointRepository } from '../checkpoint/prisma-checkpoint.repository.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import { TransportDomainError } from '../transport.errors.js';
import { WaitingAllowanceDriverIdentityFacts } from './allowance-facts.port.js';
import {
  WAITING_ALLOWANCE_APPROVED_PER_SESSION,
  WAITING_ALLOWANCE_DECISION_KEY,
} from './allowance.repository.js';
import { WaitingAllowanceService } from './allowance.service.js';
import { PrismaWaitingAllowanceRepository } from './prisma-allowance.repository.js';
import { PrismaWaitingSessionRepository } from './prisma-waiting.repository.js';

/**
 * PHU CAP CHO tren POSTGRES THAT — `#279` O6/O13.
 *
 * Ban trong bo nho khong chung minh duoc cai ma tranche nay thuc su dua vao: unique MOT PHAN
 * `WHERE status = 'APPROVED'`, nam `CHECK`, va trigger chi-cho-mot-canh. Bo test nay chung minh
 * nhung thu do — tren mot bang la CAN CU CUA MOT KHOAN TIEN.
 *
 * Chay bang `RUN_PRISMA_IT=1`; khong co bien do thi ca khoi khong chay.
 */

const RUN_PREFIX = 'IT-WA';
const PLATE_PREFIX = 'IT-WA-XE';
const PHONE_PREFIX = '0966WA';
const ACTOR = 'it-allowance';
const AUTH = 'it-wa-lai-xe';
const OFFICE = 'it-wa-van-phong';
const BOSS = 'it-wa-sep';
const POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;

/**
 * KHOA TU VAN dung chung cho MOI tep IT cham vao trigger cua mien phien cho.
 *
 * Con so nay khong co y nghia nghiep vu — no chi can GIONG NHAU o moi tep. Doi no o mot tep ma
 * quen tep kia se lam khoa mat tac dung mot cach im lang.
 */
const WAITING_TRIGGER_LOCK = 279_005;

class PrismaIdentity extends WaitingAllowanceDriverIdentityFacts {
  constructor(private readonly fleet: PrismaFleetRepository) {
    super();
  }
  async findDriverIdByAuthUserId(authUserId: string): Promise<string | null> {
    const driver = await this.fleet.findDriverByAuthUserId(authUserId);
    return driver?.id ?? null;
  }
}

const reasonOf = async (run: Promise<unknown>): Promise<string> => {
  try {
    await run;
    return 'NO_ERROR_THROWN';
  } catch (error) {
    return error instanceof TransportDomainError ? error.reason : `UNEXPECTED:${String(error)}`;
  }
};

describe.runIf(process.env.RUN_PRISMA_IT === '1')('phu cap cho tren Postgres that', () => {
  const prisma = new PrismaService();
  const fleet = new PrismaFleetRepository(prisma);
  const movementRepo = new PrismaMovementRepository(prisma);
  const checkpoints = new PrismaCheckpointRepository(prisma);
  const sessions = new PrismaWaitingSessionRepository(prisma);
  const allowances = new PrismaWaitingAllowanceRepository(prisma);
  const movement = new MovementService(
    movementRepo,
    fleet,
    new AuditLogService(new InMemoryAuditLogRepository()),
    POLICY,
  );

  const now = new Date('2026-09-09T07:00:00.000Z');
  const service = new WaitingAllowanceService(
    allowances,
    sessions,
    new PrismaIdentity(fleet),
    POLICY,
    undefined,
    () => now,
  );

  let driverId = '';
  let sessionId = '';
  let suffix = 0;

  async function cleanup(): Promise<void> {
    const runs = await prisma.transportVehicleRun.findMany({
      where: { code: { startsWith: RUN_PREFIX } },
      select: { id: true },
    });
    const runIds = runs.map((run) => run.id);
    if (runIds.length === 0) return;

    const guarded = [
      ['TransportDriverWaitingAllowance', 'transport_waiting_allowance_immutable'],
      ['TransportDeliveryWaitingSession', 'transport_waiting_session_immutable'],
      ['TransportRunCheckpoint', 'transport_run_checkpoint_append_only'],
    ] as const;
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
        for (const [table, trigger] of guarded) {
          await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${trigger}"`);
        }
        await tx.transportDriverWaitingAllowance.deleteMany({
          where: { waitingSession: { runId: { in: runIds } } },
        });
        await tx.transportDeliveryWaitingSession.deleteMany({ where: { runId: { in: runIds } } });
        await tx.transportRunCheckpoint.deleteMany({ where: { runId: { in: runIds } } });
        for (const [table, trigger] of guarded) {
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

  /** Mot phien cho DA DONG, moi bai mot chang rieng. */
  async function freshClosedSession(): Promise<string> {
    suffix += 1;
    const vehicle = await fleet.createVehicle({
      registrationPlate: `${PLATE_PREFIX}-${suffix}`,
      vehicleClass: 'Dau keo',
    });
    const run = await movement.createRun(
      { code: `${RUN_PREFIX}-${suffix}`, vehicleId: vehicle.id, businessDate: '2026-09-09' },
      ACTOR,
    );
    await movement.assignRun(run.id, { driverId }, ACTOR);
    const leg = await movement.addLeg(
      run.id,
      { sequence: 1, kind: 'EMPTY', originLabel: 'Ha Noi', destinationLabel: 'Hai Phong' },
      ACTOR,
    );
    const arrival = await checkpoints.create({
      type: 'DELIVERY_ARRIVAL',
      runId: run.id,
      legId: leg.id,
      recordedBy: AUTH,
      driverId,
      observationId: null,
      clientEventId: `${RUN_PREFIX}-arr-${suffix}`,
      capturedAt: null,
      receivedAt: new Date('2026-09-09T02:00:00.000Z'),
      businessDate: '2026-09-09',
      note: null,
    });
    const session = await sessions.create({
      runId: run.id,
      legId: leg.id,
      driverId,
      arrivalCheckpointId: arrival.id,
      reason: 'RECEIVER_NOT_READY',
      startedAt: new Date('2026-09-09T02:00:00.000Z'),
      startedBy: AUTH,
      startClientEventId: `${RUN_PREFIX}-w-${suffix}`,
      note: null,
      businessDate: '2026-09-09',
    });
    await sessions.close({
      sessionId: session.id,
      endedAt: new Date('2026-09-09T06:00:00.000Z'),
      endedBy: AUTH,
      closeReason: 'RECEIVER_ACCEPTED',
      closingCheckpointId: null,
      closeNote: null,
    });
    return session.id;
  }

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    const driver = await fleet.createDriver({
      fullName: 'IT Allowance Lai xe',
      phone: `${PHONE_PREFIX}01`,
      licenceClass: 'FC',
      licenceExpiry: '2030-01-01',
      authUserId: AUTH,
    });
    driverId = driver.id;
    sessionId = await freshClosedSession();
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  }, 60_000);

  const propose = (session: string, amount = 500_000) =>
    service.propose({
      waitingSessionId: session,
      candidateAmount: amount,
      reason: 'Cho nguoi nhan 4 tieng',
      authUserId: OFFICE,
    });

  it('WA-IT-01 — de nghi roi duyet: chi so DA DUYET vao tong, va la so nguoi duyet chot', async () => {
    const allowance = await propose(sessionId);
    expect(allowance.status).toBe('PENDING');

    const approved = await service.decide({
      allowanceId: allowance.id,
      outcome: 'APPROVED',
      approvedAmount: 300_000,
      note: 'Cat theo muc thoa thuan',
      idempotencyKey: `${RUN_PREFIX}-k1`,
      authUserId: BOSS,
    });
    expect(approved.approvedAmount).toBe(300_000);
    expect(approved.candidateAmount).toBe(500_000);

    const totals = await allowances.approvedTotalsBetween('2026-09-01', '2026-09-30');
    expect(totals.find((row) => row.driverId === driverId)).toEqual({
      driverId,
      totalAmount: 300_000,
      count: 1,
    });
  });

  /** `#279` O13 bai 11 — cong THAT o tang luu tru, khong chi o tang mien. */
  it('WA-IT-02 — unique MOT PHAN chan mot khoan DUOC DUYET thu hai tren cung phien', async () => {
    const session = await freshClosedSession();
    const first = await propose(session);
    await service.decide({
      allowanceId: first.id,
      outcome: 'APPROVED',
      approvedAmount: 100_000,
      note: null,
      idempotencyKey: `${RUN_PREFIX}-k2`,
      authUserId: BOSS,
    });

    // Mot hang PENDING thu hai duoc TAO THANG QUA KHO — di vong qua cong cua tang mien de do dung
    // cai rang buoc cua Postgres, khong do lai cai da do o tang tren.
    const second = await allowances.create({
      waitingSessionId: session,
      driverId,
      currencyCode: 'VND',
      candidateAmount: 200_000,
      reason: 'thu duyet lan hai',
      proposedBy: OFFICE,
      proposedAt: now,
      businessDate: '2026-09-09',
    });

    let conflict: unknown;
    try {
      await allowances.decide({
        allowanceId: second.id,
        outcome: 'APPROVED',
        approvedAmount: 200_000,
        decidedBy: BOSS,
        decidedAt: now,
        decisionNote: null,
        decisionIdempotencyKey: `${RUN_PREFIX}-k3`,
      });
    } catch (error) {
      conflict = error;
    }
    expect(isUniqueViolationOn(conflict, WAITING_ALLOWANCE_APPROVED_PER_SESSION)).toBe(true);

    const approvedRows = await prisma.transportDriverWaitingAllowance.findMany({
      where: { waitingSessionId: session, status: 'APPROVED' },
    });
    expect(approvedRows).toHaveLength(1);
  });

  it('WA-IT-03 — khoa chong ghi trung cua lan quyet dinh la unique that', async () => {
    const session = await freshClosedSession();
    const allowance = await propose(session);
    const key = `${RUN_PREFIX}-shared-key`;
    await service.decide({
      allowanceId: allowance.id,
      outcome: 'REJECTED',
      approvedAmount: null,
      note: null,
      idempotencyKey: key,
      authUserId: BOSS,
    });

    const other = await propose(session, 120_000);
    let conflict: unknown;
    try {
      await allowances.decide({
        allowanceId: other.id,
        outcome: 'REJECTED',
        approvedAmount: null,
        decidedBy: BOSS,
        decidedAt: now,
        decisionNote: null,
        decisionIdempotencyKey: key,
      });
    } catch (error) {
      conflict = error;
    }
    expect(isUniqueViolationOn(conflict, WAITING_ALLOWANCE_DECISION_KEY)).toBe(true);
  });

  /** Nguoi duyet CAT BOT duoc, KHONG cong them duoc — cuong che duoi Postgres. */
  it('WA-IT-04 — Postgres tu choi mot so duyet lon hon so de nghi', async () => {
    const session = await freshClosedSession();
    const allowance = await propose(session, 100_000);

    await expect(
      prisma.transportDriverWaitingAllowance.update({
        where: { id: allowance.id },
        data: {
          status: 'APPROVED',
          approvedAmount: 999_999n,
          decidedBy: BOSS,
          decidedAt: now,
          decisionIdempotencyKey: `${RUN_PREFIX}-k4`,
        },
      }),
    ).rejects.toThrow(/amount_range/);
  });

  /**
   * `#279` O6: *"approving user cannot rewrite WaitingSession timestamps"*, va rong hon mot buoc —
   * nguoi duyet cung khong sua duoc CON SO DE NGHI ma ho dang duyet.
   */
  it('WA-IT-05 — khong ai sua duoc so DE NGHI, ke ca bang mot lenh truc tiep', async () => {
    const session = await freshClosedSession();
    const allowance = await propose(session, 100_000);

    await expect(
      prisma.transportDriverWaitingAllowance.update({
        where: { id: allowance.id },
        data: { candidateAmount: 900_000n },
      }),
    ).rejects.toThrow(/immutable/);

    await expect(
      prisma.transportDriverWaitingAllowance.delete({ where: { id: allowance.id } }),
    ).rejects.toThrow(/immutable/);

    const unchanged = await allowances.find(allowance.id);
    expect(unchanged?.candidateAmount).toBe(100_000);
  });

  it('WA-IT-06 — mot hang bi tu choi khong mang duoc mot so tien nao', async () => {
    const session = await freshClosedSession();
    const allowance = await propose(session, 100_000);

    await expect(
      prisma.transportDriverWaitingAllowance.update({
        where: { id: allowance.id },
        data: {
          status: 'REJECTED',
          approvedAmount: 100_000n,
          decidedBy: BOSS,
          decidedAt: now,
          decisionIdempotencyKey: `${RUN_PREFIX}-k5`,
        },
      }),
    ).rejects.toThrow(/decision_shape/);
  });

  /** `#279` O13 bai 13 — khong mot nghia vu nao cua KHACH sinh ra tu mot lan duyet phu cap. */
  it('WA-IT-07 — mot lan duyet khong sinh mot chung tu quyet toan nao', async () => {
    const before = await prisma.transportSettlementDocument.count();
    const session = await freshClosedSession();
    const allowance = await propose(session, 100_000);
    await service.decide({
      allowanceId: allowance.id,
      outcome: 'APPROVED',
      approvedAmount: 100_000,
      note: null,
      idempotencyKey: `${RUN_PREFIX}-k6`,
      authUserId: BOSS,
    });
    expect(await prisma.transportSettlementDocument.count()).toBe(before);
    // Va khong mot but toan quy nao: phu cap cho la mot khoan CONG VAO LUONG, khong phai tien mat
    // giao cho lai xe. Nham hai thu do se lam moi bao cao "da tam ung bao nhieu trong ky" dem ca
    // tien phu cap.
    expect(
      await prisma.transportDriverFundEntry.count({
        where: { account: { driverId } },
      }),
    ).toBe(0);
  });

  /* ================================================================== *
   * WA-IT-09..12 — KHOA CHONG GHI TRUNG PHAI DUNG NGHIA, tren Postgres that
   *
   * WA-IT-03 da chung minh khoa la mot unique THAT. Nhung mot unique chi chan lan GHI thu hai; no
   * khong noi gi ve cau tra loi ma nguoi goi nhan duoc. Bon bai duoi day do dung cho do: cung mot
   * khoa, bon lenh khac nhau, va chi MOT trong so do duoc phep tra ve hang cu.
   *
   * Do tren Postgres chu khong chi tren kho trong bo nho vi day la duong that: hang duoc doc lai
   * tu dia, `status` va `approvedAmount` di qua phep chuyen kieu cua Prisma (`BigInt` -> `number`),
   * va mot phep so sanh dung `!==` tren hai kieu khac nhau se lech dung o duong nay.
   * ================================================================== */

  it('WA-IT-09 — gui lai DUNG lenh cu tra ve chinh hang do, khong ghi lan hai', async () => {
    const session = await freshClosedSession();
    const allowance = await propose(session, 200_000);
    const command = {
      allowanceId: allowance.id,
      outcome: 'APPROVED' as const,
      approvedAmount: 150_000,
      note: 'Cat theo muc thoa thuan',
      idempotencyKey: `${RUN_PREFIX}-k8`,
      authUserId: BOSS,
    };

    const first = await service.decide(command);
    const again = await service.decide(command);

    expect(again.id).toBe(first.id);
    expect(again.decidedAt).toEqual(first.decidedAt);
    expect(again.approvedAmount).toBe(150_000);
    expect(
      await prisma.transportDriverWaitingAllowance.count({
        where: { waitingSessionId: session, status: 'APPROVED' },
      }),
    ).toBe(1);
  });

  it('WA-IT-10 — cung khoa tro vao mot DE NGHI KHAC bi tu choi, va de nghi kia van dang cho', async () => {
    const sessionA = await freshClosedSession();
    const key = `${RUN_PREFIX}-k9`;
    const decided = await propose(sessionA, 200_000);
    await service.decide({
      allowanceId: decided.id,
      outcome: 'APPROVED',
      approvedAmount: 200_000,
      note: null,
      idempotencyKey: key,
      authUserId: BOSS,
    });

    const sessionB = await freshClosedSession();
    const other = await propose(sessionB, 300_000);

    expect(
      await reasonOf(
        service.decide({
          allowanceId: other.id,
          outcome: 'APPROVED',
          approvedAmount: 300_000,
          note: null,
          idempotencyKey: key,
          authUserId: BOSS,
        }),
      ),
    ).toBe('WAITING_ALLOWANCE_DECISION_KEY_REUSED');

    // De nghi thu hai KHONG bi mot lan gui lai gia lam cho thanh da quyet.
    const stillPending = await prisma.transportDriverWaitingAllowance.findUniqueOrThrow({
      where: { id: other.id },
    });
    expect(stillPending.status).toBe('PENDING');
    expect(stillPending.decisionIdempotencyKey).toBeNull();
  });

  it('WA-IT-11 — cung khoa nhung DOI KET QUA bi tu choi, hang cu khong doi', async () => {
    const session = await freshClosedSession();
    const key = `${RUN_PREFIX}-k10`;
    const allowance = await propose(session, 200_000);
    await service.decide({
      allowanceId: allowance.id,
      outcome: 'APPROVED',
      approvedAmount: 120_000,
      note: null,
      idempotencyKey: key,
      authUserId: BOSS,
    });

    expect(
      await reasonOf(
        service.decide({
          allowanceId: allowance.id,
          outcome: 'REJECTED',
          approvedAmount: null,
          note: null,
          idempotencyKey: key,
          authUserId: BOSS,
        }),
      ),
    ).toBe('WAITING_ALLOWANCE_DECISION_OUTCOME_MISMATCH');

    const row = await prisma.transportDriverWaitingAllowance.findUniqueOrThrow({
      where: { id: allowance.id },
    });
    expect(row.status).toBe('APPROVED');
    expect(row.approvedAmount).toBe(120_000n);
  });

  it('WA-IT-12 — cung khoa, cung ket qua, nhung DOI SO TIEN bi tu choi va tong khong doi', async () => {
    const session = await freshClosedSession();
    const key = `${RUN_PREFIX}-k11`;
    const allowance = await propose(session, 400_000);
    await service.decide({
      allowanceId: allowance.id,
      outcome: 'APPROVED',
      approvedAmount: 100_000,
      note: null,
      idempotencyKey: key,
      authUserId: BOSS,
    });

    expect(
      await reasonOf(
        service.decide({
          allowanceId: allowance.id,
          outcome: 'APPROVED',
          approvedAmount: 400_000,
          note: null,
          idempotencyKey: key,
          authUserId: BOSS,
        }),
      ),
    ).toBe('WAITING_ALLOWANCE_DECISION_AMOUNT_MISMATCH');

    const row = await prisma.transportDriverWaitingAllowance.findUniqueOrThrow({
      where: { id: allowance.id },
    });
    expect(row.approvedAmount).toBe(100_000n);
  });

  it('WA-IT-08 — lai xe khong tu duyet duoc khoan cua chinh minh', async () => {
    const session = await freshClosedSession();
    const allowance = await propose(session, 100_000);
    expect(
      await reasonOf(
        service.decide({
          allowanceId: allowance.id,
          outcome: 'APPROVED',
          approvedAmount: 100_000,
          note: null,
          idempotencyKey: `${RUN_PREFIX}-k7`,
          authUserId: AUTH,
        }),
      ),
    ).toBe('WAITING_ALLOWANCE_SELF_DEALING');
  });
});
