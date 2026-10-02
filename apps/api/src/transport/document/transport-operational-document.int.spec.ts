import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import { DOCUMENT_CLIENT_EVENT, DOCUMENT_FILE_ONCE } from './document.repository.js';
import { PrismaOperationalDocumentRepository } from './prisma-document.repository.js';
import { PrismaPhysicalReceiptHandoverRepository } from './prisma-handover.repository.js';

/**
 * CHUNG TU VAN HANH + BAN GIAO tren POSTGRES THAT — `#279` O1/O2/O7.
 *
 * Ban trong bo nho khong chung minh duoc cai ma tranche nay dua vao: unique MOT PHAN tren ma tep,
 * bon `CHECK`, va HAI trigger voi hai muc chat khac nhau. Bo test nay chung minh nhung thu do.
 *
 * Chay bang `RUN_PRISMA_IT=1`.
 */

const RUN_PREFIX = 'IT-DC';
const PLATE_PREFIX = 'IT-DC-XE';
const PHONE_PREFIX = '0966DC';
const ORDER_PREFIX = 'IT-DC-ORD';
const ACTOR = 'it-document';
const POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const NOW = new Date('2026-09-09T03:00:00.000Z');

/**
 * KHOA TU VAN quanh khoi TAT/BAT trigger — cung ly le voi hai tep IT cua mien phien cho.
 *
 * Trigger la mot doi tuong CHUNG cua ca co so du lieu, va CI chay cac tep IT SONG SONG. Mot tep bat
 * lai trigger dung luc tep kia dang xoa se lam lan xoa do chet vi chinh cai trigger vua duoc bat —
 * mot flake lam nguoi ta chay lai thay vi doc.
 *
 * Hai bang cua tep nay khong dung chung trigger voi tep nao khac HOM NAY, nhung khoa van duoc dat:
 * tep IT thu hai cham vao chung se den ma khong ai nho ra rang phai dat khoa.
 */
const DOCUMENT_TRIGGER_LOCK = 279_006;

describe.runIf(process.env.RUN_PRISMA_IT === '1')('chung tu van hanh tren Postgres that', () => {
  const prisma = new PrismaService();
  const fleet = new PrismaFleetRepository(prisma);
  const movementRepo = new PrismaMovementRepository(prisma);
  const documents = new PrismaOperationalDocumentRepository(prisma);
  const handovers = new PrismaPhysicalReceiptHandoverRepository(prisma);
  const movement = new MovementService(
    movementRepo,
    fleet,
    new AuditLogService(new InMemoryAuditLogRepository()),
    POLICY,
  );

  let runId = '';
  let legId = '';
  let orderId = '';
  let driverId = '';
  let suffix = 0;

  async function cleanup(): Promise<void> {
    const runs = await prisma.transportVehicleRun.findMany({
      where: { code: { startsWith: RUN_PREFIX } },
      select: { id: true },
    });
    const orders = await prisma.transportOrder.findMany({
      where: { code: { startsWith: ORDER_PREFIX } },
      select: { id: true },
    });
    const runIds = runs.map((row) => row.id);
    const orderIds = orders.map((row) => row.id);
    if (runIds.length === 0 && orderIds.length === 0) return;

    const guarded = [
      ['TransportPhysicalReceiptHandover', 'transport_physical_receipt_handover_append_only'],
      ['TransportOperationalDocument', 'transport_operational_document_immutable'],
    ] as const;
    // Khoa tu van MUC GIAO DICH, moi lenh trong CUNG mot giao dich (cung ly do voi
    // `waiting-delivery-accepted.int.spec.ts`): khoa muc phien qua pool Prisma co the nha tren
    // mot ket noi khac ("you don't own a lock"), ro lai va chan buoc don cua moi tep dung chung so.
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${DOCUMENT_TRIGGER_LOCK})`);
        for (const [table, trigger] of guarded) {
          await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER "${trigger}"`);
        }
        await tx.transportPhysicalReceiptHandover.deleteMany({
          where: { orderId: { in: orderIds } },
        });
        await tx.transportOperationalDocument.deleteMany({ where: { runId: { in: runIds } } });
        for (const [table, trigger] of guarded) {
          await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER "${trigger}"`);
        }
      },
      { maxWait: 10_000, timeout: 45_000 },
    );
    await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });
    await prisma.transportOrder.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.transportVehicleAssignment.deleteMany({
      where: { vehicle: { registrationPlate: { startsWith: PLATE_PREFIX } } },
    });
    await prisma.transportVehicle.deleteMany({
      where: { registrationPlate: { startsWith: PLATE_PREFIX } },
    });
    await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
  }

  const paperDocument = (over: Record<string, unknown> = {}) => ({
    type: 'DELIVERY_RECEIPT' as const,
    runId,
    legId,
    orderId,
    checkpointId: null,
    counterpartySiteId: null,
    driverId,
    recordedBy: ACTOR,
    basis: 'EXTERNAL_PHYSICAL' as const,
    fileId: null,
    externalNote: 'Bien nhan giay co chu ky',
    label: null,
    captureMode: 'UNKNOWN' as const,
    clientEventId: `${RUN_PREFIX}-d-${(suffix += 1)}`,
    receivedAt: NOW,
    businessDate: '2026-09-09',
    ...over,
  });

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    const driver = await fleet.createDriver({
      fullName: 'IT Document Lai xe',
      phone: `${PHONE_PREFIX}01`,
      licenceClass: 'FC',
      licenceExpiry: '2030-01-01',
      authUserId: 'it-dc-lai-xe',
    });
    driverId = driver.id;
    const vehicle = await fleet.createVehicle({
      registrationPlate: `${PLATE_PREFIX}-1`,
      vehicleClass: 'Dau keo',
    });
    const order = await movement.createOrder(
      {
        code: `${ORDER_PREFIX}-1`,
        originLabel: 'Ha Noi',
        destinationLabel: 'Hai Phong',
        businessDate: '2026-09-09',
      },
      ACTOR,
    );
    orderId = order.id;
    const run = await movement.createRun(
      { code: `${RUN_PREFIX}-1`, vehicleId: vehicle.id, businessDate: '2026-09-09' },
      ACTOR,
    );
    runId = run.id;
    await movement.assignRun(run.id, { driverId }, ACTOR);
    const leg = await movement.addLeg(
      run.id,
      {
        sequence: 1,
        kind: 'LOADED',
        orderId: order.id,
        originLabel: 'Ha Noi',
        destinationLabel: 'Hai Phong',
      },
      ACTOR,
    );
    legId = leg.id;
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  }, 60_000);

  it('DC-IT-01 — mot lan bam gui lai khong ghi hai to', async () => {
    const input = paperDocument();
    const first = await documents.create(input);
    let conflict: unknown;
    try {
      await documents.create(input);
    } catch (error) {
      conflict = error;
    }
    expect(isUniqueViolationOn(conflict, DOCUMENT_CLIENT_EVENT)).toBe(true);
    expect(await documents.find(first.id)).not.toBeNull();
  });

  /**
   * `#279` O2 — mot ma tep phuc vu NHIEU NHAT mot chung tu dang hieu luc.
   *
   * Va sau khi to thu nhat bi bia mo, ma tep do dung lai duoc: unique la MOT PHAN, nen ban ghi dinh
   * chinh khong bi chan.
   */
  it('DC-IT-02 — mot ma tep phuc vu nhieu nhat MOT chung tu dang hieu luc', async () => {
    const shared = `${RUN_PREFIX}-file-1`;
    const first = await documents.create(
      paperDocument({ basis: 'DIGITAL_FILE', fileId: shared, externalNote: null }),
    );

    let conflict: unknown;
    try {
      await documents.create(
        paperDocument({
          type: 'WEIGH_TICKET',
          basis: 'DIGITAL_FILE',
          fileId: shared,
          externalNote: null,
        }),
      );
    } catch (error) {
      conflict = error;
    }
    expect(isUniqueViolationOn(conflict, DOCUMENT_FILE_ONCE)).toBe(true);

    await documents.withdraw({
      documentId: first.id,
      withdrawnAt: NOW,
      withdrawnBy: ACTOR,
      reason: 'chup nham',
    });
    const replacement = await documents.create(
      paperDocument({ basis: 'DIGITAL_FILE', fileId: shared, externalNote: null }),
    );
    expect(replacement.fileId).toBe(shared);
  });

  /** Mot hang khai ban so ma khong co ma tep la mot chung tu ban so KHONG CO ban so nao. */
  it('DC-IT-03 — Postgres tu choi mot can cu khong khop voi ma tep', async () => {
    await expect(
      prisma.transportOperationalDocument.create({
        data: {
          type: 'GATE_PASS',
          runId,
          basis: 'DIGITAL_FILE',
          fileId: null,
          recordedBy: ACTOR,
          clientEventId: `${RUN_PREFIX}-bad-1`,
          businessDate: '2026-09-09',
        },
      }),
    ).rejects.toThrow(/basis_shape/);

    await expect(
      prisma.transportOperationalDocument.create({
        data: {
          type: 'GATE_PASS',
          runId,
          basis: 'EXTERNAL_PHYSICAL',
          externalNote: '   ',
          recordedBy: ACTOR,
          clientEventId: `${RUN_PREFIX}-bad-2`,
          businessDate: '2026-09-09',
        },
      }),
    ).rejects.toThrow(/basis_shape/);
  });

  /**
   * `#279` O13 bai 8 tai TANG LUU TRU.
   *
   * `orderId` nam trong danh sach khoa cua trigger: mot to bien nhan cua don A khong doi duoc sang
   * don B, ke ca bang mot dong `psql`.
   */
  it('DC-IT-04 — khong ai doi duoc MA DON cua mot chung tu da ghi', async () => {
    const document = await documents.create(paperDocument());
    const other = await movement.createOrder(
      {
        code: `${ORDER_PREFIX}-2`,
        originLabel: 'Ha Noi',
        destinationLabel: 'Ninh Binh',
        businessDate: '2026-09-09',
      },
      ACTOR,
    );

    await expect(
      prisma.transportOperationalDocument.update({
        where: { id: document.id },
        data: { orderId: other.id },
      }),
    ).rejects.toThrow(/immutable/);

    await expect(
      prisma.transportOperationalDocument.delete({ where: { id: document.id } }),
    ).rejects.toThrow(/immutable/);

    const unchanged = await documents.find(document.id);
    expect(unchanged?.orderId).toBe(orderId);
  });

  it('DC-IT-05 — bia mo giu lai hang, va khong bia mo lai duoc', async () => {
    const document = await documents.create(paperDocument());
    const withdrawn = await documents.withdraw({
      documentId: document.id,
      withdrawnAt: NOW,
      withdrawnBy: ACTOR,
      reason: 'chup nham',
    });
    expect(withdrawn.status).toBe('WITHDRAWN');
    expect(withdrawn.withdrawnBy).toBe(ACTOR);

    await expect(
      documents.withdraw({
        documentId: document.id,
        withdrawnAt: NOW,
        withdrawnBy: ACTOR,
        reason: 'lan hai',
      }),
    ).rejects.toThrow(/da duoc bia mo/);
  });

  /** CHAT HON bang chung tu: mot buoc ban giao khong co vong doi — no chi don gian la da xay ra. */
  it('DC-IT-06 — chuoi ban giao khong sua duoc va khong xoa duoc', async () => {
    const step = await handovers.create({
      orderId,
      sequence: 1,
      state: 'WITH_DRIVER',
      legId: null,
      documentId: null,
      externalNote: 'Lai xe cam to bien nhan',
      driverId,
      recordedBy: ACTOR,
      recordedAt: NOW,
      clientEventId: `${RUN_PREFIX}-h-1`,
      note: null,
      businessDate: '2026-09-09',
    });

    await expect(
      prisma.transportPhysicalReceiptHandover.update({
        where: { id: step.id },
        data: { state: 'RETURNED_TO_OFFICE' },
      }),
    ).rejects.toThrow(/append_only/);

    await expect(
      prisma.transportPhysicalReceiptHandover.delete({ where: { id: step.id } }),
    ).rejects.toThrow(/append_only/);
  });

  it('DC-IT-07 — mot buoc ban giao phai co can cu, va chi ghi duoc mot lan', async () => {
    await expect(
      prisma.transportPhysicalReceiptHandover.create({
        data: {
          orderId,
          sequence: 9,
          state: 'SUBMITTED_FOR_CONFIRMATION',
          recordedBy: ACTOR,
          clientEventId: `${RUN_PREFIX}-h-bad`,
          businessDate: '2026-09-09',
        },
      }),
    ).rejects.toThrow(/_basis/);

    const rows = await handovers.listForOrder(orderId);
    expect(rows.length).toBeGreaterThan(0);
    await expect(
      handovers.create({
        orderId,
        sequence: 2,
        state: rows[0]!.state,
        legId: null,
        documentId: null,
        externalNote: 'ghi lai lan hai',
        driverId,
        recordedBy: ACTOR,
        recordedAt: NOW,
        clientEventId: `${RUN_PREFIX}-h-dup`,
        note: null,
        businessDate: '2026-09-09',
      }),
    ).rejects.toThrow();
  });

  /**
   * `#279` O13 bai 9 tai TANG LUU TRU — ghi mot chuoi ban giao KHONG dung vao don.
   *
   * Do bang cach doc lai chinh hang don: trang thai cua no khong doi, va khong mot ho so nghiem thu
   * nao duoc sinh ra.
   */
  it('DC-IT-08 — ghi ban giao khong doi trang thai don va khong sinh ho so nghiem thu', async () => {
    const before = await prisma.transportOrder.findUnique({ where: { id: orderId } });
    const acceptancesBefore = await prisma.transportCommercialAcceptance.count({
      where: { orderId },
    });

    await handovers.create({
      orderId,
      sequence: 3,
      state: 'RETURNED_TO_OFFICE',
      legId: null,
      documentId: null,
      externalNote: 'Van phong da nhan',
      driverId: null,
      recordedBy: 'it-van-phong',
      recordedAt: NOW,
      clientEventId: `${RUN_PREFIX}-h-2`,
      note: null,
      businessDate: '2026-09-09',
    });

    const after = await prisma.transportOrder.findUnique({ where: { id: orderId } });
    expect(after?.status).toBe(before?.status);
    expect(await prisma.transportCommercialAcceptance.count({ where: { orderId } })).toBe(
      acceptancesBefore,
    );
  });
});
