import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service.js';
import {
  CounterpartyRepository,
  type CreateCounterpartyInput,
  type LinkSubjectInput,
  type UpdateCounterpartyInput,
} from './counterparty.repository.js';
import type {
  Counterparty,
  CounterpartyLink,
  CounterpartySubjectKind,
} from './counterparty.types.js';

/** Kieu tho tu Prisma — chi lay nhung cot ma mien nay doc. */
interface CounterpartyRow {
  id: string;
  name: string;
  taxCode: string | null;
  status: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface LinkRow {
  counterpartyId: string;
  kind: string;
  subjectId: string;
  linkedBy: string;
  createdAt: Date;
}

const iso = (value: Date): string => value.toISOString();

const toCounterparty = (row: CounterpartyRow): Counterparty => ({
  id: row.id,
  name: row.name,
  taxCode: row.taxCode,
  note: row.note,
  status: row.status as Counterparty['status'],
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const toLink = (row: LinkRow): CounterpartyLink => ({
  counterpartyId: row.counterpartyId,
  kind: row.kind as CounterpartySubjectKind,
  subjectId: row.subjectId,
  linkedBy: row.linkedBy,
  createdAt: iso(row.createdAt),
});

function prune<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/*
 * Cung ly le voi `PrismaFleetRepository`: Prisma sinh kieu delegate theo tung ban client, nen goi
 * qua mot ham tra `any` de tang nay khong vo khi ai do chua chay `prisma generate`. Ranh gioi kieu
 * that su nam o hai ham `to*` ben tren.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const model = (prisma: PrismaService, name: string): any =>
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (prisma as unknown as Record<string, any>)[name];

@Injectable()
export class PrismaCounterpartyRepository extends CounterpartyRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: CreateCounterpartyInput): Promise<Counterparty> {
    return toCounterparty(
      await model(this.prisma, 'transportCounterparty').create({
        data: {
          name: input.name,
          taxCode: input.taxCode ?? null,
          note: input.note ?? null,
          status: input.status ?? 'ACTIVE',
        },
      }),
    );
  }

  async update(id: string, patch: UpdateCounterpartyInput): Promise<Counterparty | null> {
    const row = await model(this.prisma, 'transportCounterparty').update({
      where: { id },
      data: prune(patch),
    });
    return row ? toCounterparty(row) : null;
  }

  async find(id: string): Promise<Counterparty | null> {
    const row = await model(this.prisma, 'transportCounterparty').findUnique({ where: { id } });
    return row ? toCounterparty(row) : null;
  }

  async findMany(ids: readonly string[]): Promise<Counterparty[]> {
    if (ids.length === 0) return [];
    const rows: CounterpartyRow[] = await model(this.prisma, 'transportCounterparty').findMany({
      where: { id: { in: [...new Set(ids)] } },
    });
    return rows.map(toCounterparty);
  }

  async findByTaxCode(taxCode: string): Promise<Counterparty | null> {
    const row = await model(this.prisma, 'transportCounterparty').findUnique({
      where: { taxCode },
    });
    return row ? toCounterparty(row) : null;
  }

  async list(): Promise<Counterparty[]> {
    const rows: CounterpartyRow[] = await model(this.prisma, 'transportCounterparty').findMany({
      orderBy: { name: 'asc' },
    });
    return rows.map(toCounterparty);
  }

  async findLinkBySubject(
    kind: CounterpartySubjectKind,
    subjectId: string,
  ): Promise<CounterpartyLink | null> {
    const row = await model(this.prisma, 'transportCounterpartyLink').findUnique({
      where: { kind_subjectId: { kind, subjectId } },
    });
    return row ? toLink(row) : null;
  }

  async listLinks(counterpartyId: string): Promise<CounterpartyLink[]> {
    const rows: LinkRow[] = await model(this.prisma, 'transportCounterpartyLink').findMany({
      where: { counterpartyId },
      orderBy: [{ kind: 'asc' }, { subjectId: 'asc' }],
    });
    return rows.map(toLink);
  }

  async listLinksOf(counterpartyIds: readonly string[]): Promise<CounterpartyLink[]> {
    if (counterpartyIds.length === 0) return [];
    const rows: LinkRow[] = await model(this.prisma, 'transportCounterpartyLink').findMany({
      where: { counterpartyId: { in: [...new Set(counterpartyIds)] } },
      orderBy: [{ kind: 'asc' }, { subjectId: 'asc' }],
    });
    return rows.map(toLink);
  }

  async link(input: LinkSubjectInput): Promise<CounterpartyLink> {
    return toLink(
      await model(this.prisma, 'transportCounterpartyLink').create({
        data: {
          counterpartyId: input.counterpartyId,
          kind: input.kind,
          subjectId: input.subjectId,
          linkedBy: input.linkedBy,
        },
      }),
    );
  }

  async unlink(kind: CounterpartySubjectKind, subjectId: string): Promise<boolean> {
    const result = await model(this.prisma, 'transportCounterpartyLink').deleteMany({
      where: { kind, subjectId },
    });
    return (result?.count ?? 0) > 0;
  }
}
