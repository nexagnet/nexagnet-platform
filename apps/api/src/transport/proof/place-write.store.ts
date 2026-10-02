import { Injectable } from '@nestjs/common';
import type { AppendAuditLogCommand, AuditLogService } from '../../audit/audit-log.service.js';
import { traceWrite } from '../../audit/audit-trail.js';
import type { PrismaService } from '../../config/prisma.service.js';
import { isUniqueViolationOn, type UniqueIndexRef } from '../../config/storage-conflict.js';
import type { CounterpartyRepository } from '../counterparty/counterparty.repository.js';
import { PrismaCounterpartySiteRepository } from '../counterparty/prisma-counterparty-site.repository.js';
import { PrismaCounterpartyRepository } from '../counterparty/prisma-counterparty.repository.js';
import type { CounterpartySiteRepository } from '../counterparty/site.repository.js';
import type { FleetRepository } from '../fleet/fleet.repository.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  DEPOT_CODE_INDEX,
  DEPOT_ONE_ACTIVE_INDEX,
  PrismaGeofenceRepository,
  type GeofenceRepository,
} from './geofence.repository.js';

/**
 * DUONG GHI DUY NHAT cua dia diem van hanh (`#395`).
 *
 * Moi lan ghi dia diem — man "Dia diem van hanh" VA route cu `POST /transport/geofences` — chay
 * trong MOT don vi cong viec, xep hang sau MOT khoa, va doc lai su that SAU khi co khoa:
 *
 *   · Prisma: MOT `$transaction`, `READ COMMITTED`, cau lenh DAU TIEN la
 *     `SELECT pg_advisory_xact_lock(<hang so>)`. O `READ COMMITTED` moi cau lenh lay anh chup moi,
 *     nen moi phep doc SAU khoa thay ban ghi ma nguoi truoc vua commit — dieu `SERIALIZABLE`
 *     khong cho (anh chup cua no chup o cau lenh dau, tuc TRUOC khi cho khoa).
 *   · Trong bo nho: mot chuoi promise — lan ghi sau cho lan truoc xong.
 *
 * Khoa bao ve luat TRUNG TEN (mot phep doc-roi-ghi tren nhieu bang). Hai bat bien cua bai xe (toi da
 * mot bai dang bat, ma bai khong trung) con song o DB bang chi muc unique mot phan — mot duong ghi
 * khong di qua day (may gieo du lieu mau, psql) van bi chan; `placeStorageConflict()` dich `P2002`
 * cua chung ra ly do co kieu.
 *
 * `PlaceWriteTx` la CAC KHO QUEN THUOC tren giao dich: ban Prisma dung lai chinh cac kho Prisma, dat
 * tren client giao dich — khong co ban sao thu hai cua mot cau truy van nao.
 */

export interface PlaceWriteTx {
  readonly geofences: GeofenceRepository;
  readonly sites: CounterpartySiteRepository;
  readonly counterparties: CounterpartyRepository;
  readonly customers: Pick<FleetRepository, 'findCustomer'>;
  /**
   * Client GIAO DICH Prisma (`#395`) — chi de dau vet cua lan ghi nam trong cung don vi cong viec
   * (`runTraced`). Ban bo nho khong co: khong co giao dich de nhap vao.
   */
  readonly client?: unknown;
}

export abstract class PlaceWriteStore {
  abstract run<T>(work: (tx: PlaceWriteTx) => Promise<T>): Promise<T>;
}

/**
 * Khoa tu van cua duong ghi dia diem. MOT hang so `bigint` (khong gian khoa mot so, khong trung
 * khong gian hai so `int4` cua cac khoa khac trong ma).
 */
export const PLACE_WRITE_LOCK_KEY = 39_500_030_001n;

/** Nhieu hon mac dinh cua Prisma (2 s / 5 s): lan ghi dau tren DB lanh va hang doi khoa. */
const TRANSACTION_OPTIONS = {
  isolationLevel: 'ReadCommitted',
  maxWait: 10_000,
  timeout: 20_000,
} as const;

@Injectable()
export class PrismaPlaceWriteStore extends PlaceWriteStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  run<T>(work: (tx: PlaceWriteTx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${PLACE_WRITE_LOCK_KEY})`;
      // Client giao dich co CUNG cac delegate cua `PrismaService`; cac kho duoi day khong mo
      // giao dich rieng nao tren cac phuong thuc duong nay goi.
      const client = transaction as unknown as PrismaService;
      return work({
        geofences: new PrismaGeofenceRepository(client),
        sites: new PrismaCounterpartySiteRepository(client),
        counterparties: new PrismaCounterpartyRepository(client),
        customers: new PrismaFleetRepository(client),
        client: transaction,
      });
    }, TRANSACTION_OPTIONS);
  }
}

/**
 * Ban trong bo nho: CUNG cac kho, xep hang bang chuoi promise. Khong co rollback — dich vu kiem MOI
 * luat truoc lan ghi dau tien, nen mot lan tu choi khong de lai ban ghi dang do.
 */
export class InMemoryPlaceWriteStore extends PlaceWriteStore {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly repositories: PlaceWriteTx) {
    super();
  }

  run<T>(work: (tx: PlaceWriteTx) => Promise<T>): Promise<T> {
    const result = this.tail.then(() => work(this.repositories));
    this.tail = result.catch(() => undefined);
    return result;
  }
}

/**
 * GHI DIA DIEM + DAU VET cua lan ghi do (`#395`, `audit/audit-trail.ts`). Kho Prisma: dau vet nam
 * TRONG giao dich — so kiem toan hong thi lan ghi lui theo, khong con mot bai xe bi tat ma khong ai
 * biet ai tat. Kho bo nho: dau vet ghi ngay sau commit.
 */
export function runTraced<T>(
  store: PlaceWriteStore,
  audit: AuditLogService | undefined,
  work: (tx: PlaceWriteTx) => Promise<T>,
  trace: (result: T) => readonly AppendAuditLogCommand[],
): Promise<T> {
  if (!audit) return store.run(work);
  return traceWrite(
    audit,
    (trail) =>
      store.run(async (tx) => {
        const value = await work(tx);
        if (tx.client !== undefined) await trail(value, tx.client);
        return value;
      }),
    (value) => value,
    trace,
  );
}

const COUNTERPARTY_TAX_CODE_INDEX: UniqueIndexRef = {
  indexName: 'TransportCounterparty_taxCode_key',
  model: 'TransportCounterparty',
  column: 'taxCode',
};

const COUNTERPARTY_SITE_NAME_INDEX: UniqueIndexRef = {
  indexName: 'TransportCounterpartySite_counterparty_name_key',
  model: 'TransportCounterpartySite',
  column: 'name',
};

/**
 * DICH `P2002` cua mot lan ghi dia diem ra ly do co kieu — `null` khi khong phai va cham nao ta
 * biet (nguoi goi nem tiep nguyen ven).
 *
 * Duong nay chi xay ra khi mot nguoi ghi KHONG di qua khoa (may gieo, script) chen vao giua; duong
 * di qua khoa da tu choi truoc bang cung ma do.
 */
export function placeStorageConflict(error: unknown): TransportDomainError | null {
  if (isUniqueViolationOn(error, DEPOT_ONE_ACTIVE_INDEX)) {
    return TransportDomainError.conflict(
      'DEPOT_ALREADY_ACTIVE',
      'Đã có một bãi xe đang dùng. Muốn dùng bãi này, hãy chọn "Đổi thành bãi chính".',
    );
  }
  if (isUniqueViolationOn(error, DEPOT_CODE_INDEX)) {
    return TransportDomainError.conflict(
      'DEPOT_CODE_TAKEN',
      'Mã bãi xe này đã được dùng cho một bãi khác. Tải lại rồi thử lại.',
    );
  }
  if (isUniqueViolationOn(error, COUNTERPARTY_TAX_CODE_INDEX)) {
    return TransportDomainError.conflict(
      'COUNTERPARTY_TAX_CODE_TAKEN',
      'Mã số thuế này đã thuộc một đơn vị khác.',
    );
  }
  if (isUniqueViolationOn(error, COUNTERPARTY_SITE_NAME_INDEX)) {
    return TransportDomainError.conflict(
      'COUNTERPARTY_SITE_NAME_TAKEN',
      'Đơn vị này đã có một địa điểm cùng tên.',
    );
  }
  return null;
}
