import { randomUUID } from 'node:crypto';
import type { PartyStatus } from '../transport.types.js';
import type {
  Counterparty,
  CounterpartyLink,
  CounterpartySubjectKind,
} from './counterparty.types.js';

export interface CreateCounterpartyInput {
  readonly name: string;
  readonly taxCode?: string | null;
  readonly note?: string | null;
  readonly status?: PartyStatus;
}

export interface UpdateCounterpartyInput {
  readonly name?: string;
  readonly taxCode?: string | null;
  readonly note?: string | null;
  readonly status?: PartyStatus;
}

export interface LinkSubjectInput {
  readonly counterpartyId: string;
  readonly kind: CounterpartySubjectKind;
  readonly subjectId: string;
  readonly linkedBy: string;
}

/**
 * Kho cua xuong song danh tinh (R1-A).
 *
 * TACH KHOI `FleetRepository` theo dung quy uoc thu muc ma T1 §16 dung de cuong che
 * `NO_CROSS_CONTEXT_REPOSITORY_WRITE`: service cua danh tinh khong ghi duoc vao bang khach hang hay
 * bang doi tac, vi no khong duoc tiem kho do de ghi. Cai no can o ben kia — "hang nay co that
 * khong" — di qua `CounterpartySubjectPort`, va do la mot cau hoi DOC.
 */
export abstract class CounterpartyRepository {
  abstract create(input: CreateCounterpartyInput): Promise<Counterparty>;
  abstract update(id: string, patch: UpdateCounterpartyInput): Promise<Counterparty | null>;
  abstract find(id: string): Promise<Counterparty | null>;
  /**
   * Nhieu phap nhan trong MOT lan doc. Ma khong ton tai thi vang mat trong ket qua (khong `null`),
   * thu tu khong bao dam — nguoi goi tra theo `id`. Ton tai de mot danh sach dia diem khong thanh
   * N lan hoi noi tiep (`CounterpartySiteService.activeViews`).
   */
  abstract findMany(ids: readonly string[]): Promise<Counterparty[]>;
  abstract findByTaxCode(taxCode: string): Promise<Counterparty | null>;
  abstract list(): Promise<Counterparty[]>;

  /** Lien ket dang giu mot hang chuyen mon, neu co. Khoa la `(kind, subjectId)`. */
  abstract findLinkBySubject(
    kind: CounterpartySubjectKind,
    subjectId: string,
  ): Promise<CounterpartyLink | null>;
  abstract listLinks(counterpartyId: string): Promise<CounterpartyLink[]>;
  /**
   * Lien ket cua NHIEU phap nhan trong MOT lan doc (`#395`: Tao don can biet dia diem nao la cua
   * khach hang ma khong hoi tung phap nhan). Cung thu tu voi `listLinks`.
   */
  abstract listLinksOf(counterpartyIds: readonly string[]): Promise<CounterpartyLink[]>;
  abstract link(input: LinkSubjectInput): Promise<CounterpartyLink>;
  /** Tra ve `true` neu that su co mot hang bi go. Idempotent. */
  abstract unlink(kind: CounterpartySubjectKind, subjectId: string): Promise<boolean>;
}

const sortLinks = (links: CounterpartyLink[]): CounterpartyLink[] =>
  [...links].sort((a, b) => a.kind.localeCompare(b.kind) || a.subjectId.localeCompare(b.subjectId));

/**
 * Ban trong bo nho — duong chay cua `PERSISTENCE=memory` (demo/CI khong can CSDL).
 *
 * No PHAI cuong che cung mot bat bien voi ban Prisma, va o day bat bien do la khoa
 * `(kind, subjectId)`: `Map` duoc khoa bang chinh cap do, nen khong co cach nao ghi hai lien ket
 * cho cung mot hang chuyen mon ke ca khi service quen kiem.
 */
export class InMemoryCounterpartyRepository extends CounterpartyRepository {
  private readonly parties = new Map<string, Counterparty>();
  private readonly links = new Map<string, CounterpartyLink>();

  private static key(kind: CounterpartySubjectKind, subjectId: string): string {
    return `${kind}::${subjectId}`;
  }

  async create(input: CreateCounterpartyInput): Promise<Counterparty> {
    const now = new Date().toISOString();
    const row: Counterparty = {
      id: randomUUID(),
      name: input.name,
      taxCode: input.taxCode ?? null,
      note: input.note ?? null,
      status: input.status ?? 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    this.parties.set(row.id, row);
    return row;
  }

  async update(id: string, patch: UpdateCounterpartyInput): Promise<Counterparty | null> {
    const current = this.parties.get(id);
    if (!current) return null;
    const next: Counterparty = {
      ...current,
      name: patch.name ?? current.name,
      taxCode: patch.taxCode === undefined ? current.taxCode : patch.taxCode,
      note: patch.note === undefined ? current.note : patch.note,
      status: patch.status ?? current.status,
      updatedAt: new Date().toISOString(),
    };
    this.parties.set(id, next);
    return next;
  }

  async find(id: string): Promise<Counterparty | null> {
    return this.parties.get(id) ?? null;
  }

  async findMany(ids: readonly string[]): Promise<Counterparty[]> {
    return [...new Set(ids)].flatMap((id) => {
      const row = this.parties.get(id);
      return row ? [row] : [];
    });
  }

  async findByTaxCode(taxCode: string): Promise<Counterparty | null> {
    return [...this.parties.values()].find((row) => row.taxCode === taxCode) ?? null;
  }

  async list(): Promise<Counterparty[]> {
    return [...this.parties.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async findLinkBySubject(
    kind: CounterpartySubjectKind,
    subjectId: string,
  ): Promise<CounterpartyLink | null> {
    return this.links.get(InMemoryCounterpartyRepository.key(kind, subjectId)) ?? null;
  }

  async listLinks(counterpartyId: string): Promise<CounterpartyLink[]> {
    return sortLinks(
      [...this.links.values()].filter((link) => link.counterpartyId === counterpartyId),
    );
  }

  async listLinksOf(counterpartyIds: readonly string[]): Promise<CounterpartyLink[]> {
    const wanted = new Set(counterpartyIds);
    return sortLinks([...this.links.values()].filter((link) => wanted.has(link.counterpartyId)));
  }

  async link(input: LinkSubjectInput): Promise<CounterpartyLink> {
    const row: CounterpartyLink = { ...input, createdAt: new Date().toISOString() };
    this.links.set(InMemoryCounterpartyRepository.key(input.kind, input.subjectId), row);
    return row;
  }

  async unlink(kind: CounterpartySubjectKind, subjectId: string): Promise<boolean> {
    return this.links.delete(InMemoryCounterpartyRepository.key(kind, subjectId));
  }
}
