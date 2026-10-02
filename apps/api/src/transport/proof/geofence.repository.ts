import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service.js';
import type { UniqueIndexRef } from '../../config/storage-conflict.js';
import type { CounterpartyRepository } from '../counterparty/counterparty.repository.js';
import type { CounterpartySiteRepository } from '../counterparty/site.repository.js';
import type { FleetRepository } from '../fleet/fleet.repository.js';
import type { CircleGeofence } from '../geo/geofence.js';
import type { PartyStatus } from '../transport.types.js';

/**
 * `COUNTERPARTY_SITE` la gia tri cua `#267` H1: hang rao cua mot DIA DIEM VAN HANH
 * (`TransportCounterpartySite`) — kho/nha may cua mot phap nhan.
 *
 * `CUSTOMER` khong dung duoc cho viec do: `subjectId` cua no tro toi `TransportCustomer`, con A la
 * mot phap nhan co the chua bao gio thue B mot chuyen nao. `AD_HOC` cung khong: hang rao cua mot
 * kho co that thuoc ve mot cho co that.
 */
export type GeofenceSubjectKind =
  'CUSTOMER' | 'FUEL_SUPPLIER' | 'DEPOT' | 'AD_HOC' | 'COUNTERPARTY_SITE';

export interface Geofence {
  readonly id: string;
  readonly label: string;
  readonly subjectKind: GeofenceSubjectKind;
  readonly subjectId: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMetres: number;
  readonly note: string | null;
  readonly recordedBy: string;
}

/**
 * HANG RAO DAY DU — kem trang thai, dia chi hien thi va moc thoi gian (`#395`).
 *
 * Tach khoi `Geofence` co y: phan quyet chung cu va giai theo nhan chi can hinh hoc + nhan; man
 * "Dia diem van hanh" can them trang thai va dia chi. `GeofenceRecord` thoa `Geofence`, nen moi
 * nguoi doc cu nhan mot ban ghi day du ma khong phai doi dong nao.
 */
export interface GeofenceRecord extends Geofence {
  readonly status: PartyStatus;
  /** Dia chi hien thi. NULL = chua nhap. KHONG phep so khop nao dung truong nay. */
  readonly address: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RegisterGeofenceInput {
  readonly label: string;
  readonly subjectKind: GeofenceSubjectKind;
  readonly subjectId: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMetres: number;
  readonly note: string | null;
  readonly recordedBy: string;
  /** `#395` — vang mat = NULL. */
  readonly address?: string | null;
  /** `#395` — vang mat = `ACTIVE` (bai xe du phong duoc tao `INACTIVE`). */
  readonly status?: PartyStatus;
}

/** Nhung truong SUA duoc cua mot hang rao. Loai va chu the khong doi duoc — do la danh tinh. */
export interface GeofencePatch {
  readonly label?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly radiusMetres?: number;
  readonly note?: string | null;
  readonly address?: string | null;
}

export interface GeofenceListFilter {
  readonly subjectKinds?: readonly GeofenceSubjectKind[];
  readonly subjectIds?: readonly string[];
  readonly status?: PartyStatus;
}

/**
 * HAI chi muc UNIQUE MOT PHAN cua bai xe (`20260925100100_transport_place_admin`). Prisma bao
 * `P2002` voi `meta.target` la `(1)` cho chi muc tren hang so, va `subjectId` cho ma bai.
 */
export const DEPOT_ONE_ACTIVE_INDEX: UniqueIndexRef = {
  indexName: 'TransportGeofence_one_active_depot',
  model: 'TransportGeofence',
  column: '(1)',
};

export const DEPOT_CODE_INDEX: UniqueIndexRef = {
  indexName: 'TransportGeofence_depot_code_key',
  model: 'TransportGeofence',
  column: 'subjectId',
};

/* ------------------------------------------------------------------ *
 * "CON HIEU LUC THAT" — MOT vi tu cho moi nguoi doc
 * ------------------------------------------------------------------ */

/**
 * Su that ve CHU THE ma cac hang rao tro toi, doc theo lo.
 *
 * `activeSiteIds` — dia diem `ACTIVE` VA phap nhan cua no `ACTIVE`; `activeCustomerIds` — khach hang
 * `ACTIVE`. Mot id vang mat nghia la chu the khong con hoat dong (hoac khong ton tai).
 */
export interface GeofenceOwnerFacts {
  readonly activeSiteIds: ReadonlySet<string>;
  readonly activeCustomerIds: ReadonlySet<string>;
}

/**
 * HANG RAO CON HIEU LUC THAT (`#395`) — MOT vi tu, dung chung cho dia diem da biet (Tao don), so
 * tra cuu dia diem cua dieu xe, va luat trung ten cua man "Dia diem van hanh":
 *
 *   · hang rao `ACTIVE`;
 *   · `COUNTERPARTY_SITE` — dia diem VA phap nhan cua no con hoat dong;
 *   · `CUSTOMER` — khach hang con hoat dong;
 *   · loai khac (bai xe, cay xang, hang rao tam) — chi trang thai cua chinh hang rao.
 *
 * Nho vi tu doc luc DOC nay, tat mot phap nhan / dia diem / khach qua duong cu KHONG can lan sang
 * hang rao (ke toan khong doi duoc hang rao — xem `ACCOUNTING_DENIED`), ma noi dat hang rao van
 * lap tuc bien mat khoi Tao don va dieu xe.
 *
 * PHAN QUYET CHUNG CU KHONG dung vi tu nay — no van cham theo trang thai THO cua hang rao
 * (`listActive()`), dung nhu truoc #395.
 */
export function isEffectivelyActive(
  fence: Pick<GeofenceRecord, 'status' | 'subjectKind' | 'subjectId'>,
  owners: GeofenceOwnerFacts,
): boolean {
  if (fence.status !== 'ACTIVE') return false;
  if (fence.subjectKind === 'COUNTERPARTY_SITE') {
    return fence.subjectId !== null && owners.activeSiteIds.has(fence.subjectId);
  }
  if (fence.subjectKind === 'CUSTOMER') {
    return fence.subjectId !== null && owners.activeCustomerIds.has(fence.subjectId);
  }
  return true;
}

const subjectIdsOf = (
  fences: readonly Pick<Geofence, 'subjectKind' | 'subjectId'>[],
  kind: GeofenceSubjectKind,
): string[] => [
  ...new Set(
    fences.flatMap((fence) =>
      fence.subjectKind === kind && fence.subjectId !== null ? [fence.subjectId] : [],
    ),
  ),
];

/** Cach doc su that chu the — ban trong bo nho hoi qua cac kho cua `transport-core`. */
export interface GeofenceOwnerLookup {
  activeOwners(input: {
    readonly siteIds: readonly string[];
    readonly customerIds: readonly string[];
  }): Promise<GeofenceOwnerFacts>;
}

/** Hoi qua ba kho da export cua `transport-core` — dung cho ban trong bo nho. */
export class RepositoryGeofenceOwnerLookup implements GeofenceOwnerLookup {
  constructor(
    private readonly sites: Pick<CounterpartySiteRepository, 'findManyActive'>,
    private readonly counterparties: Pick<CounterpartyRepository, 'findMany'>,
    private readonly customers: Pick<FleetRepository, 'findCustomer'>,
  ) {}

  async activeOwners(input: {
    readonly siteIds: readonly string[];
    readonly customerIds: readonly string[];
  }): Promise<GeofenceOwnerFacts> {
    const sites = input.siteIds.length === 0 ? [] : await this.sites.findManyActive(input.siteIds);
    const partyIds = [...new Set(sites.map((site) => site.counterpartyId))];
    const activeParties = new Set(
      (partyIds.length === 0 ? [] : await this.counterparties.findMany(partyIds))
        .filter((party) => party.status === 'ACTIVE')
        .map((party) => party.id),
    );
    const customers = await Promise.all(
      input.customerIds.map((id) => this.customers.findCustomer(id)),
    );
    return {
      activeSiteIds: new Set(
        sites.filter((site) => activeParties.has(site.counterpartyId)).map((site) => site.id),
      ),
      activeCustomerIds: new Set(
        customers.flatMap((customer) =>
          customer !== null && customer.status === 'ACTIVE' ? [customer.id] : [],
        ),
      ),
    };
  }
}

/** Khong co cach hoi chu the (spec cu dung kho tran): coi moi chu the la con hoat dong. */
const EVERY_OWNER_ACTIVE: GeofenceOwnerLookup = {
  async activeOwners(input) {
    return {
      activeSiteIds: new Set(input.siteIds),
      activeCustomerIds: new Set(input.customerIds),
    };
  },
};

/**
 * KHO HANG RAO DIA LY.
 *
 * `assessGeofences()` la mot ham THUAN — no nhan mot danh sach hang rao va tra ve phan quyet. Kho
 * nay la thu duy nhat tra loi cau "danh sach do o dau ra", va truoc khi no ton tai thi moi lan goi
 * deu nhan mot mang RONG. Hau qua khong phai la mot loi bao ra: moi chung cu deu bao
 * `NO_GEOFENCE_CONFIGURED`, tuc he thong tra loi "chua ai khai hang rao nao" cho ca nhung khach da
 * khai — mot cau tra loi sai ma trong nhu mot cau tra loi that.
 *
 * `toCircle()` la ranh gioi giua hai the gioi: kho biet `status`, `label`, `recordedBy`; hinh hoc
 * chi duoc thay ba so. Giu nguyen ranh gioi do thi `assessGeofences` khong bao gio phu thuoc vao
 * mot cot trong bang.
 *
 * `#395` them duong SUA / TAT / BAT va doc toan bo (moi trang thai) cho man "Dia diem van hanh".
 * Khong co duong XOA: nghi mot dia diem la `INACTIVE`, lich su chung cu phai con doc lai duoc.
 */
export abstract class GeofenceRepository {
  /** Chi hang rao con hieu luc. Mot hang rao da nghi khong duoc lang le keo phan quyet ve INSIDE. */
  abstract listActive(): Promise<readonly Geofence[]>;
  /**
   * Hang rao CON HIEU LUC THAT — xem `isEffectivelyActive()`. Ban ghi DAY DU (kem dia chi): Tao don
   * hien dia chi cua dia diem da biet ma khong doc lai tung hang rao.
   */
  abstract listEffectivelyActive(): Promise<readonly GeofenceRecord[]>;
  abstract register(input: RegisterGeofenceInput): Promise<GeofenceRecord>;
  abstract find(id: string): Promise<GeofenceRecord | null>;
  /** Moi trang thai, loc tuy chon. Sap theo `createdAt` roi `id` — tat dinh. */
  abstract listAll(filter?: GeofenceListFilter): Promise<readonly GeofenceRecord[]>;
  abstract update(id: string, patch: GeofencePatch): Promise<GeofenceRecord | null>;
  abstract setStatus(ids: readonly string[], status: PartyStatus): Promise<void>;
}

export function toCircle(fence: Geofence): CircleGeofence {
  return {
    id: fence.id,
    centre: { latitude: fence.latitude, longitude: fence.longitude },
    radiusMetres: fence.radiusMetres,
  };
}

const matchesFilter = (fence: GeofenceRecord, filter: GeofenceListFilter): boolean =>
  (filter.subjectKinds === undefined || filter.subjectKinds.includes(fence.subjectKind)) &&
  (filter.subjectIds === undefined ||
    (fence.subjectId !== null && filter.subjectIds.includes(fence.subjectId))) &&
  (filter.status === undefined || fence.status === filter.status);

/** Loi DUNG hinh dang ma Prisma nem cho mot chi muc unique — de tang tren dich cung mot cach. */
function uniqueViolation(index: UniqueIndexRef): Error {
  return Object.assign(new Error(`Unique constraint failed on the fields: (\`${index.column}\`)`), {
    code: 'P2002',
    meta: { modelName: index.model, target: [index.column] },
  });
}

/**
 * Ban trong bo nho — duong chay THAT cua `PERSISTENCE=memory`. No cuong che CUNG hai chi muc bai xe
 * voi DB (va nem cung hinh dang `P2002`): neu chi Postgres giu chung thi mot bai se xanh o che do nay
 * va do o che do kia.
 */
export class InMemoryGeofenceRepository extends GeofenceRepository {
  private readonly fences = new Map<string, GeofenceRecord>();

  constructor(private readonly owners: GeofenceOwnerLookup = EVERY_OWNER_ACTIVE) {
    super();
  }

  async listActive(): Promise<readonly Geofence[]> {
    return this.ordered().filter((fence) => fence.status === 'ACTIVE');
  }

  async listEffectivelyActive(): Promise<readonly GeofenceRecord[]> {
    const active = this.ordered().filter((fence) => fence.status === 'ACTIVE');
    const owners = await this.owners.activeOwners({
      siteIds: subjectIdsOf(active, 'COUNTERPARTY_SITE'),
      customerIds: subjectIdsOf(active, 'CUSTOMER'),
    });
    return active.filter((fence) => isEffectivelyActive(fence, owners));
  }

  async register(input: RegisterGeofenceInput): Promise<GeofenceRecord> {
    const now = new Date().toISOString();
    const fence: GeofenceRecord = {
      id: randomUUID(),
      label: input.label,
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      latitude: input.latitude,
      longitude: input.longitude,
      radiusMetres: input.radiusMetres,
      note: input.note,
      recordedBy: input.recordedBy,
      status: input.status ?? 'ACTIVE',
      address: input.address ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.commit([fence]);
    return fence;
  }

  async find(id: string): Promise<GeofenceRecord | null> {
    return this.fences.get(id) ?? null;
  }

  async listAll(filter: GeofenceListFilter = {}): Promise<readonly GeofenceRecord[]> {
    return this.ordered().filter((fence) => matchesFilter(fence, filter));
  }

  async update(id: string, patch: GeofencePatch): Promise<GeofenceRecord | null> {
    const current = this.fences.get(id);
    if (!current) return null;
    const next: GeofenceRecord = {
      ...current,
      ...(patch.label === undefined ? {} : { label: patch.label }),
      ...(patch.latitude === undefined ? {} : { latitude: patch.latitude }),
      ...(patch.longitude === undefined ? {} : { longitude: patch.longitude }),
      ...(patch.radiusMetres === undefined ? {} : { radiusMetres: patch.radiusMetres }),
      ...(patch.note === undefined ? {} : { note: patch.note }),
      ...(patch.address === undefined ? {} : { address: patch.address }),
      updatedAt: new Date().toISOString(),
    };
    this.commit([next]);
    return next;
  }

  async setStatus(ids: readonly string[], status: PartyStatus): Promise<void> {
    const now = new Date().toISOString();
    const changed = ids.flatMap((id) => {
      const current = this.fences.get(id);
      return current ? [{ ...current, status, updatedAt: now }] : [];
    });
    this.commit(changed);
  }

  /** Ghi MOT lo sau khi kiem hai chi muc tren trang thai SAU lo — nhu mot cau lenh cua Postgres. */
  private commit(changed: readonly GeofenceRecord[]): void {
    const next = new Map(this.fences);
    for (const fence of changed) next.set(fence.id, fence);
    const depots = [...next.values()].filter((fence) => fence.subjectKind === 'DEPOT');
    if (depots.filter((fence) => fence.status === 'ACTIVE').length > 1) {
      throw uniqueViolation(DEPOT_ONE_ACTIVE_INDEX);
    }
    const codes = depots.map((fence) => fence.subjectId);
    if (new Set(codes).size !== codes.length) throw uniqueViolation(DEPOT_CODE_INDEX);
    for (const fence of changed) this.fences.set(fence.id, fence);
  }

  /** Thu tu GHI — cung nghia voi `createdAt` tang dan cua ban Prisma, khong phu thuoc mili giay. */
  private ordered(): GeofenceRecord[] {
    return [...this.fences.values()];
  }
}

const ORDER = [{ createdAt: 'asc' }, { id: 'asc' }] as const;

@Injectable()
export class PrismaGeofenceRepository extends GeofenceRepository {
  /**
   * Nhan `PrismaService` HOAC mot client giao dich (`PrismaPlaceWriteStore` dung kho nay tren
   * giao dich cua no) — kho nay khong mo giao dich rieng nao.
   */
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listActive(): Promise<readonly Geofence[]> {
    const rows = await this.prisma.transportGeofence.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [...ORDER],
    });
    return rows.map(toGeofence);
  }

  /** BA truy van cho moi so hang rao: hang rao dang bat, dia diem cua chung, khach cua chung. */
  async listEffectivelyActive(): Promise<readonly GeofenceRecord[]> {
    const active = (
      await this.prisma.transportGeofence.findMany({
        where: { status: 'ACTIVE' },
        orderBy: [...ORDER],
      })
    ).map(toGeofence);
    const siteIds = subjectIdsOf(active, 'COUNTERPARTY_SITE');
    const customerIds = subjectIdsOf(active, 'CUSTOMER');
    const [sites, customers] = await Promise.all([
      siteIds.length === 0
        ? []
        : this.prisma.transportCounterpartySite.findMany({
            where: { id: { in: siteIds }, status: 'ACTIVE', counterparty: { status: 'ACTIVE' } },
            select: { id: true },
          }),
      customerIds.length === 0
        ? []
        : this.prisma.transportCustomer.findMany({
            where: { id: { in: customerIds }, status: 'ACTIVE' },
            select: { id: true },
          }),
    ]);
    const owners: GeofenceOwnerFacts = {
      activeSiteIds: new Set(sites.map((site) => site.id)),
      activeCustomerIds: new Set(customers.map((customer) => customer.id)),
    };
    return active.filter((fence) => isEffectivelyActive(fence, owners));
  }

  async register(input: RegisterGeofenceInput): Promise<GeofenceRecord> {
    const row = await this.prisma.transportGeofence.create({
      data: {
        label: input.label,
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
        latitude: input.latitude,
        longitude: input.longitude,
        radiusMetres: input.radiusMetres,
        note: input.note,
        recordedBy: input.recordedBy,
        address: input.address ?? null,
        status: input.status ?? 'ACTIVE',
      },
    });
    return toGeofence(row);
  }

  async find(id: string): Promise<GeofenceRecord | null> {
    const row = await this.prisma.transportGeofence.findUnique({ where: { id } });
    return row ? toGeofence(row) : null;
  }

  async listAll(filter: GeofenceListFilter = {}): Promise<readonly GeofenceRecord[]> {
    const rows = await this.prisma.transportGeofence.findMany({
      where: {
        ...(filter.subjectKinds === undefined
          ? {}
          : { subjectKind: { in: [...filter.subjectKinds] } }),
        ...(filter.subjectIds === undefined ? {} : { subjectId: { in: [...filter.subjectIds] } }),
        ...(filter.status === undefined ? {} : { status: filter.status }),
      },
      orderBy: [...ORDER],
    });
    return rows.map(toGeofence);
  }

  async update(id: string, patch: GeofencePatch): Promise<GeofenceRecord | null> {
    const current = await this.prisma.transportGeofence.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!current) return null;
    const row = await this.prisma.transportGeofence.update({
      where: { id },
      data: {
        ...(patch.label === undefined ? {} : { label: patch.label }),
        ...(patch.latitude === undefined ? {} : { latitude: patch.latitude }),
        ...(patch.longitude === undefined ? {} : { longitude: patch.longitude }),
        ...(patch.radiusMetres === undefined ? {} : { radiusMetres: patch.radiusMetres }),
        ...(patch.note === undefined ? {} : { note: patch.note }),
        ...(patch.address === undefined ? {} : { address: patch.address }),
      },
    });
    return toGeofence(row);
  }

  async setStatus(ids: readonly string[], status: PartyStatus): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.transportGeofence.updateMany({
      where: { id: { in: [...ids] } },
      data: { status },
    });
  }
}

interface GeofenceRow {
  readonly id: string;
  readonly label: string;
  readonly subjectKind: GeofenceSubjectKind;
  readonly subjectId: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMetres: number;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly status: string;
  readonly address: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toGeofence(row: GeofenceRow): GeofenceRecord {
  return {
    id: row.id,
    label: row.label,
    subjectKind: row.subjectKind,
    subjectId: row.subjectId,
    latitude: row.latitude,
    longitude: row.longitude,
    radiusMetres: row.radiusMetres,
    note: row.note,
    recordedBy: row.recordedBy,
    status: row.status as PartyStatus,
    address: row.address,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
