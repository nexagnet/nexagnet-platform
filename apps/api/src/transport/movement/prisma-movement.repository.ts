import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service.js';
import type { GeoPoint } from '../geo/geo-point.js';
import { fromStoredAmount, toStoredAmount } from '../money.js';
import { isUniqueViolationOn, type UniqueIndexRef } from '../storage-conflict.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  MovementRepository,
  RunClosedForNewWorkError,
  type AssignRunInput,
  type CancelOrderInput,
  type CancelRunInput,
  type CreateLegInput,
  type CreateOrderInput,
  type CreateRunInput,
  type LegStatusWrite,
  type LegStatusWriteResult,
  type ProjectTripInput,
  type ProjectTripOrderInput,
  type RunAssignmentChange,
  type RunCloseAttempt,
  type RunClosureCandidateQuery,
  type RunWriteScope,
  type SerializedRunCloseInput,
  type SerializedRunCloseResult,
  type TripOrderProjection,
  type TripProjection,
  type UpdateOrderInput,
} from './movement.repository.js';
import type {
  Order,
  OrderStatus,
  RunAssignment,
  RunLeg,
  RunLegStatus,
  TripOrderLink,
  TripRunLegLink,
  VehicleRun,
  VehicleRunStatus,
} from './movement.types.js';

/**
 * MOT ban phan cong DANG hieu luc cho moi vong chay. Ten index song trong SQL tho, nen no phai
 * duoc khai o day mot lan -- khong noi thang chuoi vao cho bat loi.
 */
export const ACTIVE_RUN_ASSIGNMENT: UniqueIndexRef = {
  indexName: 'TransportRunAssignment_activeRun_key',
  model: 'TransportRunAssignment',
  column: 'runId',
};

/**
 * Prisma khong loi ra kieu cho delegate truoc khi `prisma generate` chay, nen tang nay dung mot
 * loi ra khong kieu -- giong het `prisma-counterparty.repository.ts`. Ranh gioi kieu THAT la cac
 * ham `to*()` ben duoi.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const model = (prisma: PrismaService | TxClient, name: string): any =>
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (prisma as unknown as Record<string, any>)[name];

/**
 * Loi ra cua mot GIAO DICH Prisma. Cung ly le voi `model()`: kieu that cua no khong ton tai truoc
 * khi `prisma generate` chay, va ranh gioi kieu THAT van la cac ham `to*()` ben duoi.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type TxClient = any;

interface OrderRow {
  id: string;
  code: string;
  status: OrderStatus;
  businessDate: string;
  customerId: string | null;
  originLabel: string;
  destinationLabel: string;
  originLatitude: number | null;
  originLongitude: number | null;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  cargoDescription: string | null;
  freightAmount: bigint | null;
  currencyCode: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

interface RunRow {
  id: string;
  code: string;
  vehicleId: string;
  status: VehicleRunStatus;
  businessDate: string;
  startedAt: Date | null;
  completedAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

interface LegRow {
  id: string;
  runId: string;
  sequence: number;
  kind: RunLeg['kind'];
  status: RunLegStatus;
  orderId: string | null;
  originLabel: string;
  destinationLabel: string;
  businessDate: string;
  distanceKm: number | null;
  plannedDistanceKm: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AssignmentRow {
  id: string;
  runId: string;
  driverId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  assignedBy: string;
  createdAt: Date;
}

interface LinkRow {
  tripId: string;
  legId: string;
  projectedBy: string;
  createdAt: Date;
}

interface OrderLinkRow {
  tripId: string;
  orderId: string;
  projectedBy: string;
  createdAt: Date;
}

const iso = (value: Date): string => value.toISOString();
const isoOrNull = (value: Date | null): string | null => (value === null ? null : iso(value));

/**
 * Hai cot -> mot diem. Thieu MOT trong hai cot la `null` ca diem: CHECK `*_point_paired` da cam nua
 * cap, nhung neu no lot (mot lan sua tay khi rang buoc dang go) thi nua cap van KHONG phai mot diem.
 * Khong `parseGeoPoint` o day: tang doc tra DUNG cai DB giu, de dieu xe tu gan co du lieu hong.
 */
const toPoint = (latitude: number | null, longitude: number | null): GeoPoint | null =>
  latitude === null || longitude === null ? null : { latitude, longitude };

const toOrder = (row: OrderRow): Order => ({
  id: row.id,
  code: row.code,
  status: row.status,
  businessDate: row.businessDate,
  customerId: row.customerId,
  originLabel: row.originLabel,
  destinationLabel: row.destinationLabel,
  originPoint: toPoint(row.originLatitude, row.originLongitude),
  destinationPoint: toPoint(row.destinationLatitude, row.destinationLongitude),
  cargoDescription: row.cargoDescription,
  freightAmount: fromStoredAmount(row.freightAmount),
  currencyCode: row.currencyCode,
  note: row.note,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
  cancelledAt: isoOrNull(row.cancelledAt),
  cancellationReason: row.cancellationReason,
});

/**
 * MOT noi duy nhat dung `data` cua mot lan tao don. Ba duong ghi (`createOrder`, `projectTripOrder`,
 * `projectTrip`) truoc day moi duong tu liet ke cot, va mot cot moi -- nhu toa do #379 -- chi can
 * quen o MOT duong la duong do ghi lech. Diem vang (`undefined`/`null`) ghi ca cap NULL, dung hinh
 * cua CHECK `*_point_paired`; duong chieu tu chuyen v1 di qua day va khong bao gio co toa do.
 */
const orderCreateData = (input: CreateOrderInput) => ({
  code: input.code,
  businessDate: input.businessDate,
  originLabel: input.originLabel,
  destinationLabel: input.destinationLabel,
  originLatitude: input.originPoint?.latitude ?? null,
  originLongitude: input.originPoint?.longitude ?? null,
  destinationLatitude: input.destinationPoint?.latitude ?? null,
  destinationLongitude: input.destinationPoint?.longitude ?? null,
  customerId: input.customerId ?? null,
  cargoDescription: input.cargoDescription ?? null,
  freightAmount: toStoredAmount(input.freightAmount ?? null),
  note: input.note ?? null,
});

const toRun = (row: RunRow): VehicleRun => ({
  id: row.id,
  code: row.code,
  vehicleId: row.vehicleId,
  status: row.status,
  businessDate: row.businessDate,
  startedAt: isoOrNull(row.startedAt),
  completedAt: isoOrNull(row.completedAt),
  note: row.note,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
  cancelledAt: isoOrNull(row.cancelledAt),
  cancellationReason: row.cancellationReason,
});

const toLeg = (row: LegRow): RunLeg => ({
  id: row.id,
  runId: row.runId,
  sequence: row.sequence,
  kind: row.kind,
  status: row.status,
  orderId: row.orderId,
  originLabel: row.originLabel,
  destinationLabel: row.destinationLabel,
  businessDate: row.businessDate,
  distanceKm: row.distanceKm,
  plannedDistanceKm: row.plannedDistanceKm,
  startedAt: isoOrNull(row.startedAt),
  completedAt: isoOrNull(row.completedAt),
  note: row.note,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const toAssignment = (row: AssignmentRow): RunAssignment => ({
  id: row.id,
  runId: row.runId,
  driverId: row.driverId,
  effectiveFrom: iso(row.effectiveFrom),
  effectiveTo: isoOrNull(row.effectiveTo),
  assignedBy: row.assignedBy,
  createdAt: iso(row.createdAt),
});

const toLink = (row: LinkRow): TripRunLegLink => ({
  tripId: row.tripId,
  legId: row.legId,
  projectedBy: row.projectedBy,
  createdAt: iso(row.createdAt),
});

const toOrderLink = (row: OrderLinkRow): TripOrderLink => ({
  tripId: row.tripId,
  orderId: row.orderId,
  projectedBy: row.projectedBy,
  createdAt: iso(row.createdAt),
});

const prune = <T extends object>(patch: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;

/**
 * `businessDate` giam dan roi `code` tang dan. Thu tu la MOT PHAN hop dong doc, khong phai so
 * thich: hai lan goi lien tiep phai cho ra cung mot day, neu khong thi phan trang va anh chup man
 * hinh lam bang chung deu vo nghia.
 */
const LIST_ORDER = [{ businessDate: 'desc' }, { code: 'asc' }] as const;

@Injectable()
export class PrismaMovementRepository extends MovementRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    return toOrder(
      await model(this.prisma, 'transportOrder').create({ data: orderCreateData(input) }),
    );
  }

  async updateOrder(id: string, patch: UpdateOrderInput): Promise<Order | null> {
    const row = await model(this.prisma, 'transportOrder').update({
      where: { id },
      data: prune({
        originLabel: patch.originLabel,
        destinationLabel: patch.destinationLabel,
        customerId: patch.customerId,
        cargoDescription: patch.cargoDescription,
        freightAmount:
          patch.freightAmount === undefined ? undefined : toStoredAmount(patch.freightAmount),
        note: patch.note,
      }),
    });
    return row ? toOrder(row) : null;
  }

  async findOrder(id: string): Promise<Order | null> {
    const row = await model(this.prisma, 'transportOrder').findUnique({ where: { id } });
    return row ? toOrder(row) : null;
  }

  async findOrderByCode(code: string): Promise<Order | null> {
    const row = await model(this.prisma, 'transportOrder').findUnique({ where: { code } });
    return row ? toOrder(row) : null;
  }

  async listOrders(): Promise<Order[]> {
    const rows: OrderRow[] = await model(this.prisma, 'transportOrder').findMany({
      orderBy: LIST_ORDER,
    });
    return rows.map(toOrder);
  }

  async setOrderStatus(id: string, status: OrderStatus, at: Date): Promise<Order | null> {
    const row = await model(this.prisma, 'transportOrder').update({
      where: { id },
      data: { status, updatedAt: at },
    });
    return row ? toOrder(row) : null;
  }

  async cancelOrder(id: string, input: CancelOrderInput): Promise<Order | null> {
    const row = await model(this.prisma, 'transportOrder').update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: input.cancelledAt,
        cancellationReason: input.cancellationReason,
        updatedAt: input.cancelledAt,
      },
    });
    return row ? toOrder(row) : null;
  }

  async createRun(input: CreateRunInput): Promise<VehicleRun> {
    return toRun(
      await model(this.prisma, 'transportVehicleRun').create({
        data: {
          code: input.code,
          vehicleId: input.vehicleId,
          businessDate: input.businessDate,
          note: input.note ?? null,
        },
      }),
    );
  }

  async findRun(id: string): Promise<VehicleRun | null> {
    const row = await model(this.prisma, 'transportVehicleRun').findUnique({ where: { id } });
    return row ? toRun(row) : null;
  }

  async findRunByCode(code: string): Promise<VehicleRun | null> {
    const row = await model(this.prisma, 'transportVehicleRun').findUnique({ where: { code } });
    return row ? toRun(row) : null;
  }

  async listRuns(): Promise<VehicleRun[]> {
    const rows: RunRow[] = await model(this.prisma, 'transportVehicleRun').findMany({
      orderBy: LIST_ORDER,
    });
    return rows.map(toRun);
  }

  async findLatestRunForVehicle(vehicleId: string): Promise<VehicleRun | null> {
    const row: RunRow | null = await model(this.prisma, 'transportVehicleRun').findFirst({
      where: { vehicleId },
      // `createdAt` chu khong `businessDate`: hai vong chay cung ngay se hoa, con thu tu tao la
      // thu tu that. `id` la day thu hai de hai hang cung mili giay van xep tat dinh.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return row ? toRun(row) : null;
  }

  async setRunStatus(id: string, status: VehicleRunStatus, at: Date): Promise<VehicleRun | null> {
    const row = await model(this.prisma, 'transportVehicleRun').update({
      where: { id },
      data: {
        status,
        updatedAt: at,
        ...(status === 'ACTIVE' ? { startedAt: at } : {}),
        ...(status === 'COMPLETED' ? { completedAt: at } : {}),
      },
    });
    return row ? toRun(row) : null;
  }

  /**
   * DONG vong chay — `updateMany` CO DIEU KIEN, khong phai `update` theo khoa chinh.
   *
   * `updateMany` tra ve SO HANG da doi. Dieu kien `status: 'ACTIVE'` di xuong tan cau `UPDATE`,
   * nen Postgres chu khong phai tang ung dung quyet dinh ai thang: hai giao dich song song thi
   * hang bi khoa, mot ban doi duoc trang thai va ban kia thay `count = 0`.
   *
   * Khi `count = 0` thi van phai DOC LAI hang de tra ve su that hien tai — nguoi thua cuoc can
   * biet vong chay dang o dau, va "da dong boi nguoi khac" khac han "khong tim thay".
   */
  async completeRunIfActive(id: string, at: Date): Promise<RunCloseAttempt | null> {
    const updated = await model(this.prisma, 'transportVehicleRun').updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: 'COMPLETED', completedAt: at, updatedAt: at },
    });
    if (updated.count === 1) {
      const row: RunRow | null = await model(this.prisma, 'transportVehicleRun').findUnique({
        where: { id },
      });
      return row ? { run: toRun(row), transitioned: true } : null;
    }

    const current: RunRow | null = await model(this.prisma, 'transportVehicleRun').findUnique({
      where: { id },
    });
    return current ? { run: toRun(current), transitioned: false } : null;
  }

  /**
   * DONG DO HE THONG TREN MOT DUONG DA SERIALIZE — `#293` R2.
   *
   * ==========================================================================================
   * THU TU BON BUOC, VA CA BON NAM TRONG MOT GIAO DICH
   * ==========================================================================================
   *
   *   1. `SELECT ... FOR UPDATE` tren DUNG hang vong chay — moi duong ghi khac cham vao vong chay
   *      nay (`createLeg`) deu gianh cung khoa do, nen tu day den `COMMIT` khong ai them viec moi;
   *   2. doc lai vong chay + chang TREN giao dich nay;
   *   3. hoi nguoi phan xu (`decide`) — no tu hoi them nhung nguon ngoai ma no can;
   *   4. chuyen trang thai VA dat dau vet, cung mot `COMMIT`.
   *
   * Buoc 4 la cho khoang trong thu hai duoc dong. Truoc day dau vet di qua mot lan goi kho rieng
   * SAU khi buoc chuyen da commit; mot cu chet o giua de lai mot vong chay `COMPLETED` khong co
   * dong bang chung nao. Bay gio hai thu do song hoac chet cung nhau.
   *
   * ==========================================================================================
   * `decide()` CHAY TRONG KHI KHOA DANG DUOC GIU
   * ==========================================================================================
   *
   * Do la co y — `#293` doi phan xu doc su that TREN duong da khoa, khong truoc no. Cai gia la mot
   * khoa hang bi giu qua mot vai lan doc; nen `decide()` phai NGAN va CHI DOC. `timeout` duoc noi
   * ro thay vi de mac dinh 5s cua Prisma, de mot nguon ngoai cham lam luot quet bo qua vong chay
   * do (rerun o luot sau) chu khong lam hong ca giao dich giua chung.
   *
   * Ke hoach (`OrderRunPlan`) KHONG duoc doc o day va do khong phai mot bo sot: mot ke hoach moi
   * bao gio cung sinh chang truoc, va `createLeg` da gianh chinh khoa nay. Nen mot ke hoach moi
   * khong the xuat hien ma khong keo theo mot chang moi ma buoc 2 se nhin thay.
   */
  async closeRunAsSystemSerialized(
    input: SerializedRunCloseInput,
  ): Promise<SerializedRunCloseResult | null> {
    return this.prisma.$transaction(
      async (tx: unknown) => {
        const locked: unknown = await (tx as TxClient).$queryRaw`
          SELECT "id" FROM "TransportVehicleRun" WHERE "id" = ${input.runId} FOR UPDATE`;
        if (!Array.isArray(locked) || locked.length === 0) return null;

        const row: RunRow | null = await model(tx as TxClient, 'transportVehicleRun').findUnique({
          where: { id: input.runId },
        });
        if (!row) return null;
        const before = toRun(row);
        const legRows: LegRow[] = await model(tx as TxClient, 'transportRunLeg').findMany({
          where: { runId: input.runId },
          orderBy: [{ sequence: 'asc' }],
        });

        const verdict = await input.decide({ run: before, legs: legRows.map(toLeg) });
        if (!verdict.close) return { run: before, transitioned: false, verdict };
        if (before.status !== 'ACTIVE') return { run: before, transitioned: false, verdict };

        const updated = await model(tx as TxClient, 'transportVehicleRun').updateMany({
          where: { id: input.runId, status: 'ACTIVE' },
          data: { status: 'COMPLETED', completedAt: input.at, updatedAt: input.at },
        });
        if (updated.count !== 1) {
          // Khong the xay ra khi khoa dang duoc giu — giu lai nhanh nay lam luoi cuoi, va no tra ve
          // dung hinh dang ma nguoi goi da biet xu ly (`transitioned: false`).
          const current: RunRow | null = await model(
            tx as PrismaService,
            'transportVehicleRun',
          ).findUnique({ where: { id: input.runId } });
          return current ? { run: toRun(current), transitioned: false, verdict } : null;
        }

        const afterRow: RunRow | null = await model(
          tx as PrismaService,
          'transportVehicleRun',
        ).findUnique({ where: { id: input.runId } });
        if (!afterRow) return null;
        const after = toRun(afterRow);

        const entry = input.trace(before, after, verdict.trigger);
        await model(tx as TxClient, 'auditLog').create({
          data: {
            actor: entry.actor,
            action: entry.action,
            entityType: entry.entityType,
            entityId: entry.entityId,
            before: entry.before === null ? Prisma.DbNull : entry.before,
            after: entry.after === null ? Prisma.DbNull : entry.after,
            requestId: entry.requestId,
            createdAt: new Date(entry.createdAt),
          },
        });

        return { run: after, transitioned: true, verdict };
      },
      { isolationLevel: 'ReadCommitted', maxWait: 10_000, timeout: 20_000 },
    );
  }

  /**
   * CUNG mot cau khoa voi `closeRunAsSystemSerialized()` va `createLeg()` — `#293` R2.
   *
   * Ba duong ghi, mot cau `SELECT ... FOR UPDATE` tren CUNG mot hang `TransportVehicleRun`. Do la
   * ca diem cua ranh gioi nay: nguoi ghi o ngoai `transport-core` xep hang sau dung cai cong ma lan
   * dong phai di qua.
   *
   * `ReadCommitted` la du, va no la MUC DUNG chu khong phai mot nhuong bo:
   *
   *   · lan doc lai hang vong chay xay ra SAU khi khoa da trong tay, nen no thay ban commit moi
   *     nhat — khong phai anh chup luc mo giao dich;
   *   · cai duoc bao ve la mot HANG cu the, va `FOR UPDATE` bao ve hang do o moi muc co lap;
   *   · `Serializable` o day chi doi them chi phi va them loi `40001` phai thu lai, cho mot bat
   *     bien ma khoa hang da du suc giu.
   *
   * Nem tu trong `write` thi Prisma cuon lai giao dich va nem tiep ra ngoai — nguoi goi giu nguyen
   * cach bat loi cua minh, va lan ghi khong de lai gi.
   */
  async underRunLock<T>(runId: string, write: (scope: RunWriteScope) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx: unknown) => {
        const locked: unknown = await (tx as TxClient).$queryRaw`
          SELECT "id" FROM "TransportVehicleRun" WHERE "id" = ${runId} FOR UPDATE`;
        if (!Array.isArray(locked) || locked.length === 0) {
          throw TransportDomainError.notFound('RUN_NOT_FOUND', 'Khong tim thay vong chay.');
        }

        const row: RunRow | null = await model(tx as TxClient, 'transportVehicleRun').findUnique({
          where: { id: runId },
        });
        if (!row) throw TransportDomainError.notFound('RUN_NOT_FOUND', 'Khong tim thay vong chay.');
        // Chang doc SAU khoa (`#354`): moi lan doi trang thai chang gianh chinh khoa nay.
        const legRows: LegRow[] = await model(tx as TxClient, 'transportRunLeg').findMany({
          where: { runId },
          orderBy: [{ sequence: 'asc' }],
        });

        return write({ run: toRun(row), legs: legRows.map(toLeg), tx });
      },
      { isolationLevel: 'ReadCommitted', maxWait: 10_000, timeout: 20_000 },
    );
  }

  async listRunClosureCandidates(query: RunClosureCandidateQuery): Promise<VehicleRun[]> {
    /*
     * PHEP LOC "CO THE DONG DUOC" — xem chu thich dai o ban trong bo nho (`movement.repository.ts`).
     *
     * Khach khong khai nguong nghi: mot chiec xe xong viec o xa bai nam nguyen `holding` mai mai,
     * nen no khong duoc chiem mot cho trong trang. Cai con lai co the dong duoc la vong chay VE
     * BAI, va dieu kien do la mot chang da hoan thanh ket thuc tai bai dang hoat dong.
     *
     * So sanh chuoi THANG, khong `sameSite()`: mot phep chuan hoa hoa/thuong/khoang trang khong
     * dien dat duoc trong SQL, va mot ban Prisma "gan dung" con te hon mot ban dung it hon — hai
     * ban hien thuc cua cung mot kho phai cung MOT luat. Lech nhan chi lam BO SOT mot ung vien
     * (duong su kien van dong no ngay), khong bao gio lam dong bua mot vong chay.
     */
    const possibleOnly = query.idleHours === null;
    if (possibleOnly && query.depotLabel === null) return [];

    const rows: RunRow[] = await model(this.prisma, 'transportVehicleRun').findMany({
      where: {
        status: 'ACTIVE',
        // KHONG dung `some` + `none` roi tu tinh `completedAt` trong bo nho: dieu kien "lan hoan
        // thanh muon nhat da cu hon nguong" phai nam trong cau truy van, neu khong moi luot quet
        // keo ve toan bo vong chay dang chay cua doi xe.
        legs: {
          some: { status: 'COMPLETED', completedAt: { not: null, lte: query.completedBefore } },
          every: {
            OR: [
              { status: 'COMPLETED', completedAt: { not: null, lte: query.completedBefore } },
              { status: 'CANCELLED' },
            ],
          },
        },
        ...(possibleOnly
          ? {
              AND: [
                {
                  legs: {
                    some: {
                      status: 'COMPLETED',
                      destinationLabel: { equals: query.depotLabel as string },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: query.limit,
    });
    return rows.map(toRun);
  }

  async cancelRun(id: string, input: CancelRunInput): Promise<VehicleRun | null> {
    const row = await model(this.prisma, 'transportVehicleRun').update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: input.cancelledAt,
        cancellationReason: input.cancellationReason,
        updatedAt: input.cancelledAt,
      },
    });
    return row ? toRun(row) : null;
  }

  /**
   * THEM MOT CHANG — gianh CUNG khoa hang voi `closeRunAsSystemSerialized()`.
   *
   * Phep kiem "vong chay con mo khong" o `MovementService.addLeg` doc TRUOC khi co khoa nao, nen no
   * khong nhin thay mot lan dong dang chay. Khoa o day thi nhin thay, va no bien mot cua so thanh
   * mot thu tu:
   *
   *   · chang duoc ghi TRUOC   -> lan dong doc lai (duoi cung khoa) thay mot chang con mo, va no
   *                               tu choi dong;
   *   · lan dong ghi TRUOC     -> lenh nay doc thay `COMPLETED` va nem `RunClosedForNewWorkError`.
   *
   * Khong con truong hop thu ba. Do la ca dieu `#293` R2 doi: *"a concurrent planner must not be
   * able to create/activate future work after the decision snapshot but before terminalization."*
   */
  async createLeg(input: CreateLegInput): Promise<RunLeg> {
    return this.prisma.$transaction(
      async (tx: unknown) => {
        await (tx as TxClient).$queryRaw`
          SELECT "id" FROM "TransportVehicleRun" WHERE "id" = ${input.runId} FOR UPDATE`;
        const run: { status: VehicleRunStatus } | null = await model(
          tx as TxClient,
          'transportVehicleRun',
        ).findUnique({ where: { id: input.runId }, select: { status: true } });
        // Vong chay khong ton tai: de nguyen cho khoa ngoai cua DB tu choi — mot ma `RUN_NOT_FOUND`
        // bia ra o day se de mot duong khac (`legSequenceConflict`) mat kha nang dich loi cua no.
        if (run && (run.status === 'COMPLETED' || run.status === 'CANCELLED')) {
          throw new RunClosedForNewWorkError(input.runId, run.status);
        }

        return toLeg(
          await model(tx as TxClient, 'transportRunLeg').create({
            data: {
              runId: input.runId,
              sequence: input.sequence,
              kind: input.kind,
              // Bat bien lap lai o day KHONG phai vi thua: `CHECK` cua DB la luoi cuoi cung, con
              // dong nay la thu giu cho thong bao loi noi ve NGHIEP VU thay vi ve rang buoc SQL.
              orderId: input.kind === 'EMPTY' ? null : input.orderId,
              originLabel: input.originLabel,
              destinationLabel: input.destinationLabel,
              businessDate: input.businessDate,
              distanceKm: input.distanceKm ?? null,
              plannedDistanceKm: input.plannedDistanceKm ?? null,
              note: input.note ?? null,
            },
          }),
        );
      },
      { isolationLevel: 'ReadCommitted', maxWait: 10_000, timeout: 20_000 },
    );
  }

  async findLeg(id: string): Promise<RunLeg | null> {
    const row = await model(this.prisma, 'transportRunLeg').findUnique({ where: { id } });
    return row ? toLeg(row) : null;
  }

  async listLegs(runId: string): Promise<RunLeg[]> {
    const rows: LegRow[] = await model(this.prisma, 'transportRunLeg').findMany({
      where: { runId },
      orderBy: [{ sequence: 'asc' }],
    });
    return rows.map(toLeg);
  }

  async listLegsByOrder(orderId: string): Promise<RunLeg[]> {
    const rows: LegRow[] = await model(this.prisma, 'transportRunLeg').findMany({
      where: { orderId },
      orderBy: [{ businessDate: 'asc' }, { sequence: 'asc' }],
    });
    return rows.map(toLeg);
  }

  /**
   * CUNG cau khoa voi `underRunLock()`/`closeRunAsSystemSerialized()`/`createLeg()` — `#354`.
   *
   * Thu tu khoa van la MOT: hang vong chay truoc, hang chang sau (qua chinh cau `UPDATE`). Lan ghi
   * moc cung khoa hang vong chay TRUOC khi cham chang (khoa ngoai `legId` chi lay `KEY SHARE`, khong
   * dung do `NO KEY UPDATE` cua cau `UPDATE` o day) — nen khong co vong doi nao giua hai duong.
   *
   * `runId` doc TRUOC khoa la an toan: khong duong ghi nao doi chang sang vong chay khac, va trigger
   * `transport_run_leg_completed_is_immutable` khoa cot do sau khi chang xong. No chi de biet phai
   * khoa HANG nao; moi su that duoc phan xu lai deu doc SAU khoa.
   *
   * `ReadCommitted` la du vi cung ly do da ghi o `underRunLock()`: cau `UPDATE ... WHERE status =
   * from` chay sau khi khoa da trong tay, nen no danh gia tren ban commit moi nhat.
   */
  async setLegStatus(input: LegStatusWrite): Promise<LegStatusWriteResult | null> {
    return this.prisma.$transaction(
      async (tx: unknown) => {
        const owner: { runId: string } | null = await model(
          tx as TxClient,
          'transportRunLeg',
        ).findUnique({ where: { id: input.legId }, select: { runId: true } });
        if (!owner) return null;
        await (tx as TxClient).$queryRaw`
          SELECT "id" FROM "TransportVehicleRun" WHERE "id" = ${owner.runId} FOR UPDATE`;

        const updated: { count: number } = await model(
          tx as TxClient,
          'transportRunLeg',
        ).updateMany({
          where: { id: input.legId, status: input.from },
          data: {
            status: input.to,
            updatedAt: input.at,
            ...(input.to === 'IN_TRANSIT' ? { startedAt: input.at } : {}),
            ...(input.to === 'COMPLETED' ? { completedAt: input.at } : {}),
          },
        });
        const row: LegRow | null = await model(tx as TxClient, 'transportRunLeg').findUnique({
          where: { id: input.legId },
        });
        return row ? { leg: toLeg(row), applied: updated.count === 1 } : null;
      },
      { isolationLevel: 'ReadCommitted', maxWait: 10_000, timeout: 20_000 },
    );
  }

  /**
   * Dong ban cu roi mo ban moi TRONG MOT giao dich -- dung mau cua `PrismaTripRepository.assign()`.
   * Giao dich dung voi MOT nguoi ghi; unique mot phan `TransportRunAssignment_activeRun_key` la
   * thu duy nhat dung voi HAI nguoi ghi cung luc.
   */
  async assignRun(runId: string, input: AssignRunInput): Promise<RunAssignmentChange> {
    try {
      return await this.prisma.$transaction(async (tx: unknown) => {
        const delegate = model(tx as TxClient, 'transportRunAssignment');
        const active: AssignmentRow | null = await delegate.findFirst({
          where: { runId, effectiveTo: null },
        });
        if (active) {
          await delegate.updateMany({
            where: { runId, effectiveTo: null },
            data: { effectiveTo: input.effectiveFrom },
          });
        }
        const current: AssignmentRow = await delegate.create({
          data: {
            runId,
            driverId: input.driverId,
            effectiveFrom: input.effectiveFrom,
            assignedBy: input.assignedBy,
          },
        });
        return {
          previous: active ? toAssignment({ ...active, effectiveTo: input.effectiveFrom }) : null,
          current: toAssignment(current),
        };
      });
    } catch (error) {
      if (isUniqueViolationOn(error, ACTIVE_RUN_ASSIGNMENT)) {
        throw TransportDomainError.conflict(
          'RUN_ACTIVE_ASSIGNMENT_CONFLICT',
          'Mot nguoi khac vua doi lai xe cua vong chay nay. Tai lai roi thu lai.',
        );
      }
      throw error;
    }
  }

  async listRunAssignments(runId: string): Promise<RunAssignment[]> {
    const rows: AssignmentRow[] = await model(this.prisma, 'transportRunAssignment').findMany({
      where: { runId },
      orderBy: [{ effectiveFrom: 'asc' }],
    });
    return rows.map(toAssignment);
  }

  async activeRunAssignment(runId: string): Promise<RunAssignment | null> {
    const row = await model(this.prisma, 'transportRunAssignment').findFirst({
      where: { runId, effectiveTo: null },
    });
    return row ? toAssignment(row) : null;
  }

  async listOpenRunsForDriver(driverId: string): Promise<VehicleRun[]> {
    // `@@index([driverId])` tren `TransportRunAssignment` phuc vu dung truy van nay. Loc trang thai
    // vong chay o DB chu khong trong bo nho: mot lai xe lau nam co hang tram ban phan cong da dong.
    const rows: RunRow[] = await model(this.prisma, 'transportVehicleRun').findMany({
      where: {
        status: { in: ['PLANNED', 'ACTIVE'] },
        assignments: { some: { driverId, effectiveTo: null } },
      },
      orderBy: { code: 'asc' },
    });
    return rows.map(toRun);
  }

  async findOrderLink(tripId: string): Promise<TripOrderLink | null> {
    const row = await model(this.prisma, 'transportTripOrderLink').findUnique({
      where: { tripId },
    });
    return row ? toOrderLink(row) : null;
  }

  async findOrderLinksByOrders(orderIds: readonly string[]): Promise<TripOrderLink[]> {
    if (orderIds.length === 0) return [];
    const rows = await model(this.prisma, 'transportTripOrderLink').findMany({
      where: { orderId: { in: [...orderIds] } },
    });
    return rows.map(toOrderLink);
  }

  async listLegsByOrders(orderIds: readonly string[]): Promise<RunLeg[]> {
    if (orderIds.length === 0) return [];
    const rows: LegRow[] = await model(this.prisma, 'transportRunLeg').findMany({
      where: { orderId: { in: [...orderIds] } },
      orderBy: [{ orderId: 'asc' }, { sequence: 'asc' }],
    });
    return rows.map(toLeg);
  }

  /**
   * CHIEU THUONG MAI -- don + lien ket trong MOT giao dich.
   *
   * Doc truoc bang `tripId` roi moi ghi: mot lan goi lai phai tra ve chinh ban cu chu khong tao don
   * thu hai. Khe hep giua doc va ghi duoc dong bang khoa chinh `tripId` cua bang lien ket -- hai
   * yeu cau den cung luc thi mot cai vao unique violation, khong phai ca hai cung ghi.
   */
  async projectTripOrder(input: ProjectTripOrderInput): Promise<TripOrderProjection> {
    const existing = await model(this.prisma, 'transportTripOrderLink').findUnique({
      where: { tripId: input.tripId },
      include: { order: true },
    });
    if (existing) {
      return { link: toOrderLink(existing), order: toOrder(existing.order) };
    }

    return this.prisma.$transaction(async (tx: unknown) => {
      const client = tx as PrismaService;
      const orderRow: OrderRow = await model(client, 'transportOrder').create({
        data: orderCreateData(input.order),
      });
      const linkRow: OrderLinkRow = await model(client, 'transportTripOrderLink').create({
        data: { tripId: input.tripId, orderId: orderRow.id, projectedBy: input.projectedBy },
      });
      return { link: toOrderLink(linkRow), order: toOrder(orderRow) };
    });
  }

  async findTripLink(tripId: string): Promise<TripRunLegLink | null> {
    const row = await model(this.prisma, 'transportTripRunLegLink').findUnique({
      where: { tripId },
    });
    return row ? toLink(row) : null;
  }

  async findTripLinksByLegs(legIds: readonly string[]): Promise<TripRunLegLink[]> {
    if (legIds.length === 0) return [];
    const rows = await model(this.prisma, 'transportTripRunLegLink').findMany({
      where: { legId: { in: [...legIds] } },
    });
    return rows.map(toLink);
  }

  async findTripLinksByTrips(tripIds: readonly string[]): Promise<TripRunLegLink[]> {
    if (tripIds.length === 0) return [];
    const rows = await model(this.prisma, 'transportTripRunLegLink').findMany({
      where: { tripId: { in: [...tripIds] } },
    });
    return rows.map(toLink);
  }

  async findProjection(tripId: string): Promise<TripProjection | null> {
    const row = await model(this.prisma, 'transportTripRunLegLink').findUnique({
      where: { tripId },
      include: { leg: { include: { run: true, order: true } } },
    });
    if (!row) return null;
    return {
      link: toLink(row),
      run: toRun(row.leg.run),
      leg: toLeg(row.leg),
      order: row.leg.order ? toOrder(row.leg.order) : null,
    };
  }

  /**
   * Bon hang trong MOT giao dich. Neu chang ghi duoc ma lien ket khong, phep chieu se sinh mot
   * vong chay mo coi o lan chay sau -- va con so km cua doi xe bi dem hai lan.
   */
  async projectTrip(input: ProjectTripInput): Promise<TripProjection> {
    return this.prisma.$transaction(async (tx: unknown) => {
      const client = tx as PrismaService;

      const orderRow: OrderRow | null = input.order
        ? await model(client, 'transportOrder').create({ data: orderCreateData(input.order) })
        : null;

      const runRow: RunRow = await model(client, 'transportVehicleRun').create({
        data: {
          code: input.run.code,
          vehicleId: input.run.vehicleId,
          businessDate: input.run.businessDate,
          note: input.run.note ?? null,
        },
      });

      const legRow: LegRow = await model(client, 'transportRunLeg').create({
        data: {
          runId: runRow.id,
          sequence: input.leg.sequence,
          kind: input.leg.kind,
          orderId: input.leg.kind === 'EMPTY' ? null : (orderRow?.id ?? null),
          originLabel: input.leg.originLabel,
          destinationLabel: input.leg.destinationLabel,
          businessDate: input.leg.businessDate,
          distanceKm: input.leg.distanceKm ?? null,
          note: input.leg.note ?? null,
        },
      });

      const linkRow: LinkRow = await model(client, 'transportTripRunLegLink').create({
        data: { tripId: input.tripId, legId: legRow.id, projectedBy: input.projectedBy },
      });

      /*
       * Lien ket THUONG MAI ghi trong CUNG giao dich khi phep chieu vua tao mot don. Neu de no
       * ngoai, mot chuyen noi bo se co hai duong tra loi "don cua chuyen nay la don nao" -- qua
       * chang, va qua lien ket -- va hai duong do lech nhau ngay lan dau ai do sua mot ben.
       */
      if (orderRow) {
        await model(client, 'transportTripOrderLink').create({
          data: { tripId: input.tripId, orderId: orderRow.id, projectedBy: input.projectedBy },
        });
      }

      return {
        link: toLink(linkRow),
        run: toRun(runRow),
        leg: toLeg(legRow),
        order: orderRow ? toOrder(orderRow) : null,
      };
    });
  }
}
