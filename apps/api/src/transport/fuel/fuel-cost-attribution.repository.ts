import { randomUUID } from 'node:crypto';
import { TRANSPORT_CURRENCY } from '../money.js';
import {
  attributedTotal,
  evaluateFuelCostAllocation,
  fuelCostReversalCorrelationKey,
  type FuelCostAllocationDeniedReason,
  type FuelCostAttribution,
  type FuelCostTargetKind,
} from './fuel-cost-attribution.js';
import type { FuelRepository } from './fuel.repository.js';

/**
 * Kho cua PHAN BO GIA THANH nhien lieu — `#364`. Kho RIENG, khong them ham vao `FuelRepository`.
 *
 * Phan bo la mot lop KHAC voi su that "xe vua do dau" (xem `fuel-cost-attribution.ts`), va no co
 * vong doi rieng: chi ghi them, nhieu dong mot phieu, dao thay cho sua. Dat no vao `FuelRepository`
 * se lam moi hien thuc cua kho phieu (va moi bai kiem gia lap no) phai biet toi mot bang ma chung
 * khong dung.
 *
 * ===========================================================================
 * HAI HAM GHI, va ca hai deu KHOA HANG PHIEU truoc khi doc
 *
 * ```text
 * 1. mo giao dich
 * 2. SELECT ... FROM "TransportFuelEntry" WHERE id = ? FOR UPDATE
 * 3. doc lai phieu + tong dang hieu luc TU TRONG giao dich da khoa
 * 4. `evaluateFuelCostAllocation` — luat thuan, cung mot ham cho hai kho
 * 5. ghi (trigger `transport_fuel_cost_attribution_guard` kiem lai lan cuoi)
 * ```
 *
 * Hai lan cap phat cung luc cho CUNG mot phieu xin cung mot khoa nen XEP HANG: lan sau doc tong
 * SAU khi lan truoc da commit. Khong co duong nao de ca hai cung "thay con du" roi cung ghi.
 *
 * KHONG CO `update`/`delete`. Sua = mot dong dao (`recordReversal`) roi mot cap phat moi.
 */

export interface RecordFuelCostAllocationInput {
  readonly fuelEntryId: string;
  readonly targetKind: FuelCostTargetKind;
  /** Vong chay dich — tang mien DA doi chang -> vong chay va DA kiem xe khop phieu. */
  readonly runId: string;
  readonly legId: string | null;
  /** Duong, SO NGUYEN DONG. */
  readonly amount: number;
  readonly correlationKey: string;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly at: Date;
}

/**
 * BON ket cuc, khong gop.
 *
 * `DENIED` mang ly do va hai con so DOC DUOI KHOA — nguoi dung biet con bao nhieu de phan bo, thay
 * vi mot cau "vuot" tro tron. `CORRELATION_TAKEN` = mot lan ghi song song vua dung khoa nay; tang
 * mien doc lai va phan xu gui lai / dung lai khoa.
 */
export type RecordFuelCostAllocationOutcome =
  | { readonly kind: 'RECORDED'; readonly attribution: FuelCostAttribution }
  | {
      readonly kind: 'DENIED';
      readonly reason: FuelCostAllocationDeniedReason;
      readonly attributedSoFar: number;
      readonly entryAmount: number;
    }
  | { readonly kind: 'ENTRY_NOT_FOUND' }
  | { readonly kind: 'CORRELATION_TAKEN' };

export interface RecordFuelCostReversalInput {
  readonly attributionId: string;
  /** Ly do dao — BAT BUOC o tang HTTP; di vao `note` cua dong dao. */
  readonly note: string;
  readonly recordedBy: string;
  readonly at: Date;
}

export type RecordFuelCostReversalOutcome =
  | { readonly kind: 'RECORDED'; readonly reversal: FuelCostAttribution }
  /** Da co dong dao cho cap phat nay — tra lai CHINH no (gui lai la vo hai). */
  | { readonly kind: 'ALREADY_REVERSED'; readonly reversal: FuelCostAttribution }
  | { readonly kind: 'NOT_FOUND' }
  /** Dong can dao la mot dong DAO — dao cua dao khong ton tai. */
  | { readonly kind: 'NOT_REVERSIBLE' };

export abstract class FuelCostAttributionRepository {
  abstract recordAllocation(
    input: RecordFuelCostAllocationInput,
  ): Promise<RecordFuelCostAllocationOutcome>;
  abstract recordReversal(
    input: RecordFuelCostReversalInput,
  ): Promise<RecordFuelCostReversalOutcome>;
  abstract findById(id: string): Promise<FuelCostAttribution | null>;
  abstract findByCorrelation(correlationKey: string): Promise<FuelCostAttribution | null>;
  /** Moi dong cua mot phieu — cap phat LAN dao — theo `(createdAt, id)` tang dan. */
  abstract listForEntry(fuelEntryId: string): Promise<FuelCostAttribution[]>;
  /** Moi dong co dich nam trong MOT vong chay (dich `RUN` va dich `LEG` cua chang thuoc no). */
  abstract listForRun(runId: string): Promise<FuelCostAttribution[]>;
  /**
   * `#385` — MOI vong chay tung la dich cua it nhat mot dong (cap phat LAN dao), sap theo ma.
   *
   * Bang tai chinh doc duong nay de khong mot dong phan bo nao ROT khoi bien cong ty: ke toan co the
   * chon bat ky vong chay cung xe lam dich, ke ca mot vong chay khong chay don Run-first nao.
   */
  abstract listAttributedRunIds(): Promise<string[]>;
}

/**
 * Ban TRONG BO NHO — cho `PERSISTENCE=memory` va bo test cua service.
 *
 * KHONG chung minh gi ve Postgres (khoa hang, trigger, unique) — `transport-fuel-run-first.int.spec.ts`
 * lam viec do. No chung minh LUAT: cung ham `evaluateFuelCostAllocation`, cung bon ket cuc. Hang doi
 * khoa theo phieu (`withEntryLock`) giu cho hai lan goi song song XEP HANG giong Postgres — thieu no,
 * bai "hai cap phat dong thoi" se xanh ngau nhien tren kho nay trong khi Postgres moi la noi quyet.
 */
export class InMemoryFuelCostAttributionRepository extends FuelCostAttributionRepository {
  private readonly rows = new Map<string, FuelCostAttribution>();
  private readonly locks = new Map<string, Promise<void>>();

  constructor(private readonly entries: FuelRepository) {
    super();
  }

  async recordAllocation(
    input: RecordFuelCostAllocationInput,
  ): Promise<RecordFuelCostAllocationOutcome> {
    return this.withEntryLock(input.fuelEntryId, async () => {
      if (this.findByCorrelationSync(input.correlationKey)) return { kind: 'CORRELATION_TAKEN' };

      const entry = await this.entries.findEntry(input.fuelEntryId);
      if (!entry) return { kind: 'ENTRY_NOT_FOUND' };

      const attributedSoFar = attributedTotal(this.forEntry(entry.id));
      const decision = evaluateFuelCostAllocation({ entry, attributedSoFar, amount: input.amount });
      if (!decision.allowed) {
        return {
          kind: 'DENIED',
          reason: decision.reason,
          attributedSoFar,
          entryAmount: entry.amount,
        };
      }

      const attribution: FuelCostAttribution = {
        id: randomUUID(),
        fuelEntryId: entry.id,
        kind: 'ALLOCATION',
        targetKind: input.targetKind,
        runId: input.runId,
        legId: input.legId,
        signedAmount: input.amount,
        currencyCode: TRANSPORT_CURRENCY,
        reversalOfId: null,
        correlationKey: input.correlationKey,
        note: input.note,
        recordedBy: input.recordedBy,
        createdAt: input.at.toISOString(),
      };
      this.rows.set(attribution.id, attribution);
      return { kind: 'RECORDED', attribution: { ...attribution } };
    });
  }

  async recordReversal(input: RecordFuelCostReversalInput): Promise<RecordFuelCostReversalOutcome> {
    const target = this.rows.get(input.attributionId);
    if (!target) return { kind: 'NOT_FOUND' };
    if (target.kind !== 'ALLOCATION') return { kind: 'NOT_REVERSIBLE' };

    return this.withEntryLock(target.fuelEntryId, async () => {
      const existing = [...this.rows.values()].find((row) => row.reversalOfId === target.id);
      if (existing) return { kind: 'ALREADY_REVERSED', reversal: { ...existing } };

      const reversal: FuelCostAttribution = {
        id: randomUUID(),
        fuelEntryId: target.fuelEntryId,
        kind: 'REVERSAL',
        targetKind: target.targetKind,
        runId: target.runId,
        legId: target.legId,
        signedAmount: -target.signedAmount,
        currencyCode: target.currencyCode,
        reversalOfId: target.id,
        correlationKey: fuelCostReversalCorrelationKey(target.id),
        note: input.note,
        recordedBy: input.recordedBy,
        createdAt: input.at.toISOString(),
      };
      this.rows.set(reversal.id, reversal);
      return { kind: 'RECORDED', reversal: { ...reversal } };
    });
  }

  async findById(id: string): Promise<FuelCostAttribution | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async findByCorrelation(correlationKey: string): Promise<FuelCostAttribution | null> {
    const row = this.findByCorrelationSync(correlationKey);
    return row ? { ...row } : null;
  }

  async listForEntry(fuelEntryId: string): Promise<FuelCostAttribution[]> {
    return this.forEntry(fuelEntryId).map((row) => ({ ...row }));
  }

  async listForRun(runId: string): Promise<FuelCostAttribution[]> {
    return sortedRows([...this.rows.values()].filter((row) => row.runId === runId)).map((row) => ({
      ...row,
    }));
  }

  async listAttributedRunIds(): Promise<string[]> {
    return [...new Set([...this.rows.values()].map((row) => row.runId))].sort();
  }

  private forEntry(fuelEntryId: string): FuelCostAttribution[] {
    return sortedRows([...this.rows.values()].filter((row) => row.fuelEntryId === fuelEntryId));
  }

  private findByCorrelationSync(correlationKey: string): FuelCostAttribution | undefined {
    return [...this.rows.values()].find((row) => row.correlationKey === correlationKey);
  }

  /** Hang doi theo phieu — ban sao trong bo nho cua `SELECT ... FOR UPDATE` tren hang phieu. */
  private async withEntryLock<T>(fuelEntryId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(fuelEntryId) ?? Promise.resolve();
    let release = (): void => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.then(() => current);
    this.locks.set(fuelEntryId, chained);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (this.locks.get(fuelEntryId) === chained) this.locks.delete(fuelEntryId);
    }
  }
}

/** Cung thu tu voi kho Prisma: thoi diem, roi cap phat truoc dao, roi `id`. */
const KIND_ORDER = { ALLOCATION: 0, REVERSAL: 1 } as const;

const sortedRows = (rows: FuelCostAttribution[]): FuelCostAttribution[] =>
  rows.sort((left, right) => {
    if (left.createdAt !== right.createdAt) return left.createdAt.localeCompare(right.createdAt);
    if (left.kind !== right.kind) return KIND_ORDER[left.kind] - KIND_ORDER[right.kind];
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
