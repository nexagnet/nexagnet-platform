import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service.js';
import { TRANSPORT_CURRENCY, fromStoredAmount, toStoredAmount } from '../money.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  attributedTotal,
  evaluateFuelCostAllocation,
  fuelCostReversalCorrelationKey,
  type FuelCostAttribution,
} from './fuel-cost-attribution.js';
import {
  FuelCostAttributionRepository,
  type RecordFuelCostAllocationInput,
  type RecordFuelCostAllocationOutcome,
  type RecordFuelCostReversalInput,
  type RecordFuelCostReversalOutcome,
} from './fuel-cost-attribution.repository.js';
import type { FuelVerificationStatus } from './fuel-lifecycle.js';
import {
  FUEL_COST_ATTRIBUTION_CORRELATION,
  FUEL_COST_ATTRIBUTION_REVERSED_ONCE,
  isFuelCostAttributionTriggerViolation,
} from './fuel-storage-conflict.js';

/*
 * Cung ly le voi `model()` cua `prisma-fuel.repository.ts`: ranh gioi kieu THAT nam o `toAttribution`
 * ben duoi, khong o delegate sinh ra — mot ban client sinh truoc migration `#364` khong duoc lam tep
 * nay ngung bien dich.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const model = (client: unknown, name: string): any =>
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (client as Record<string, any>)[name];

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const toAttribution = (row: any): FuelCostAttribution => ({
  id: row.id,
  fuelEntryId: row.fuelEntryId,
  kind: row.kind,
  targetKind: row.targetKind,
  runId: row.runId,
  legId: row.legId ?? null,
  signedAmount: fromStoredAmount(row.signedAmount) ?? 0,
  currencyCode: row.currencyCode,
  reversalOfId: row.reversalOfId ?? null,
  correlationKey: row.correlationKey,
  note: row.note ?? null,
  recordedBy: row.recordedBy,
  createdAt: row.createdAt.toISOString(),
});

/**
 * THU TU DOC: thoi diem, roi CAP PHAT truoc DAO (thu tu khai bao cua enum), roi `id`. Mot cap phat va
 * dong dao cua no ghi trong cung mot mili giay la chuyen binh thuong; xep bang `id` ngau nhien se cho
 * dong dao dung TRUOC dong no dao — mot lich su doc nguoc.
 */
const ORDER = [{ createdAt: 'asc' }, { kind: 'asc' }, { id: 'asc' }] as const;

/**
 * LUOI CUOI -> MA CO KIEU. Tang mien da kiem moi dieu duoi khoa, nen o duong ghi that trigger
 * `transport_fuel_cost_attribution_guard` khong bao gio no; khi no no (mot lan ghi khong di qua
 * tang mien), nguoi goi van nhan dung ma, khong phai mot `500`.
 */
const translateTriggerError = (error: unknown): unknown => {
  if (isFuelCostAttributionTriggerViolation(error, 'exceedsEntry')) {
    return TransportDomainError.denied(
      'FUEL_COST_ATTRIBUTION_EXCEEDS_ENTRY',
      'Tong phan bo se vuot so tien cua phieu',
    );
  }
  if (isFuelCostAttributionTriggerViolation(error, 'legacyTrip')) {
    return TransportDomainError.denied(
      'FUEL_COST_ATTRIBUTION_LEGACY_TRIP_PROJECTED',
      'Phieu gan chuyen cu — gia thanh cua no da vao chuyen',
    );
  }
  if (isFuelCostAttributionTriggerViolation(error, 'notVerified')) {
    return TransportDomainError.denied(
      'FUEL_COST_ATTRIBUTION_ENTRY_NOT_VERIFIED',
      'Phieu chua duoc duyet nen chua phan bo duoc',
    );
  }
  if (
    isFuelCostAttributionTriggerViolation(error, 'targetVehicle') ||
    isFuelCostAttributionTriggerViolation(error, 'legRun')
  ) {
    return TransportDomainError.denied(
      'FUEL_COST_ATTRIBUTION_TARGET_VEHICLE_MISMATCH',
      'Dich phan bo khong thuoc xe tren phieu',
    );
  }
  return error;
};

@Injectable()
export class PrismaFuelCostAttributionRepository extends FuelCostAttributionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async recordAllocation(
    input: RecordFuelCostAllocationInput,
  ): Promise<RecordFuelCostAllocationOutcome> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const locked = await this.lockEntry(tx, input.fuelEntryId);
          if (!locked) return { kind: 'ENTRY_NOT_FOUND' } as const;

          const attributedSoFar = attributedTotal(
            (
              await model(tx, 'transportFuelCostAttribution').findMany({
                where: { fuelEntryId: input.fuelEntryId },
                select: { signedAmount: true },
              })
            ).map((row: { signedAmount: bigint }) => ({
              signedAmount: fromStoredAmount(row.signedAmount) ?? 0,
            })),
          );
          const decision = evaluateFuelCostAllocation({
            entry: locked,
            attributedSoFar,
            amount: input.amount,
          });
          if (!decision.allowed) {
            return {
              kind: 'DENIED',
              reason: decision.reason,
              attributedSoFar,
              entryAmount: locked.amount,
            } as const;
          }

          const row = await model(tx, 'transportFuelCostAttribution').create({
            data: {
              fuelEntryId: input.fuelEntryId,
              kind: 'ALLOCATION',
              targetKind: input.targetKind,
              runId: input.runId,
              legId: input.legId,
              signedAmount: toStoredAmount(input.amount),
              currencyCode: TRANSPORT_CURRENCY,
              reversalOfId: null,
              correlationKey: input.correlationKey,
              note: input.note,
              recordedBy: input.recordedBy,
              createdAt: input.at,
            },
          });
          return { kind: 'RECORDED', attribution: toAttribution(row) } as const;
        },
        { isolationLevel: 'ReadCommitted', maxWait: 10_000, timeout: 20_000 },
      );
    } catch (error) {
      if (isUniqueViolationOn(error, FUEL_COST_ATTRIBUTION_CORRELATION)) {
        return { kind: 'CORRELATION_TAKEN' };
      }
      throw translateTriggerError(error);
    }
  }

  async recordReversal(input: RecordFuelCostReversalInput): Promise<RecordFuelCostReversalOutcome> {
    const target = await this.findById(input.attributionId);
    if (!target) return { kind: 'NOT_FOUND' };
    if (target.kind !== 'ALLOCATION') return { kind: 'NOT_REVERSIBLE' };

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // Cung khoa voi lan cap phat: mot lan dao va mot lan cap phat song song tren CUNG phieu
          // xep hang, nen tong doc o lan sau luon la tong THAT.
          await this.lockEntry(tx, target.fuelEntryId);

          const existing = await model(tx, 'transportFuelCostAttribution').findUnique({
            where: { reversalOfId: target.id },
          });
          if (existing) {
            return { kind: 'ALREADY_REVERSED', reversal: toAttribution(existing) } as const;
          }

          const row = await model(tx, 'transportFuelCostAttribution').create({
            data: {
              fuelEntryId: target.fuelEntryId,
              kind: 'REVERSAL',
              targetKind: target.targetKind,
              runId: target.runId,
              legId: target.legId,
              signedAmount: toStoredAmount(-target.signedAmount),
              currencyCode: target.currencyCode,
              reversalOfId: target.id,
              correlationKey: fuelCostReversalCorrelationKey(target.id),
              note: input.note,
              recordedBy: input.recordedBy,
              createdAt: input.at,
            },
          });
          return { kind: 'RECORDED', reversal: toAttribution(row) } as const;
        },
        { isolationLevel: 'ReadCommitted', maxWait: 10_000, timeout: 20_000 },
      );
    } catch (error) {
      // Hai lan dao song song: ben thua dam UNIQUE `reversalOfId` (hoac khoa tat dinh cua no).
      if (
        isUniqueViolationOn(error, FUEL_COST_ATTRIBUTION_REVERSED_ONCE) ||
        isUniqueViolationOn(error, FUEL_COST_ATTRIBUTION_CORRELATION)
      ) {
        const existing = await model(this.prisma, 'transportFuelCostAttribution').findUnique({
          where: { reversalOfId: target.id },
        });
        if (existing) return { kind: 'ALREADY_REVERSED', reversal: toAttribution(existing) };
      }
      throw translateTriggerError(error);
    }
  }

  async findById(id: string): Promise<FuelCostAttribution | null> {
    const row = await model(this.prisma, 'transportFuelCostAttribution').findUnique({
      where: { id },
    });
    return row ? toAttribution(row) : null;
  }

  async findByCorrelation(correlationKey: string): Promise<FuelCostAttribution | null> {
    const row = await model(this.prisma, 'transportFuelCostAttribution').findUnique({
      where: { correlationKey },
    });
    return row ? toAttribution(row) : null;
  }

  async listForEntry(fuelEntryId: string): Promise<FuelCostAttribution[]> {
    const rows = await model(this.prisma, 'transportFuelCostAttribution').findMany({
      where: { fuelEntryId },
      orderBy: ORDER,
    });
    return rows.map(toAttribution);
  }

  async listForRun(runId: string): Promise<FuelCostAttribution[]> {
    const rows = await model(this.prisma, 'transportFuelCostAttribution').findMany({
      where: { runId },
      orderBy: ORDER,
    });
    return rows.map(toAttribution);
  }

  async listAttributedRunIds(): Promise<string[]> {
    const rows: { runId: string }[] = await model(
      this.prisma,
      'transportFuelCostAttribution',
    ).findMany({ select: { runId: true }, distinct: ['runId'], orderBy: { runId: 'asc' } });
    return rows.map((row) => row.runId);
  }

  /**
   * KHOA hang phieu roi doc lai ba cot phan bo can — TU TRONG giao dich. `null` = phieu khong con.
   *
   * `SELECT ... FOR UPDATE` qua `$queryRaw` chu khong `$executeRaw` + `findUnique`: mot cau lenh,
   * mot anh chup, doc DUNG hang vua khoa.
   */
  private async lockEntry(
    tx: unknown,
    fuelEntryId: string,
  ): Promise<{
    tripId: string | null;
    verificationStatus: FuelVerificationStatus;
    amount: number;
  } | null> {
    const rows = (await (tx as PrismaService).$queryRaw`
      SELECT "tripId", "verificationStatus"::text AS "verificationStatus", "amount"
      FROM "TransportFuelEntry"
      WHERE "id" = ${fuelEntryId}
      FOR UPDATE`) as {
      tripId: string | null;
      verificationStatus: FuelVerificationStatus;
      amount: bigint;
    }[];
    const row = rows[0];
    if (!row) return null;
    return {
      tripId: row.tripId,
      verificationStatus: row.verificationStatus,
      amount: fromStoredAmount(row.amount) ?? 0,
    };
  }
}
