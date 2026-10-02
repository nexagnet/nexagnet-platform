import { randomUUID } from 'node:crypto';
import type { TransactionTrail } from '../../audit/audit-trail.js';
import type { UniqueIndexRef } from '../storage-conflict.js';
import type { PartyStatus } from '../transport.types.js';
import type {
  AssetStakeholder,
  AssetStakeholderKind,
  VehicleOwnershipInterest,
} from './asset-ownership.types.js';

export interface CreateStakeholderInput {
  readonly kind: AssetStakeholderKind;
  readonly displayName: string;
  readonly note?: string | null;
  readonly status?: PartyStatus;
}

export interface UpdateStakeholderInput {
  readonly displayName?: string;
  readonly note?: string | null;
  readonly status?: PartyStatus;
}

export interface OpenInterestInput {
  readonly vehicleId: string;
  readonly stakeholderId: string;
  readonly ownershipBasisPoints: number;
  readonly effectiveFrom: Date;
  readonly recordedBy: string;
  readonly recordedNote?: string | null;
}

export interface CloseInterestInput {
  readonly interestId: string;
  readonly effectiveTo: Date;
  readonly closedBy: string;
  readonly closedNote?: string | null;
}

/**
 * `TransportAssetStakeholder.authUserId @unique` (migration `20260909140000`) — hai lan noi CUNG
 * mot tai khoan vao hai ho so cung luc thi lan thu hai chet o day. Dich vu doi no thanh
 * `ASSET_STAKEHOLDER_ACCOUNT_TAKEN`, khong phai mot `500` (`#395`).
 */
export const ASSET_STAKEHOLDER_ACCOUNT_UNIQUE: UniqueIndexRef = {
  indexName: 'TransportAssetStakeholder_authUserId_key',
  model: 'TransportAssetStakeholder',
  column: 'authUserId',
};

/**
 * Kho cua mien so huu tai san (`TX-08`).
 *
 * TACH KHOI `FleetRepository` theo dung quy uoc thu muc ma T1 §4.1 luat 4
 * (`NO_CROSS_CONTEXT_REPOSITORY_WRITE`) dung de cuong che: dich vu so huu khong ghi duoc vao bang
 * lai xe hay bang khach hang, vi no khong duoc tiem kho do de ghi. Cai no can o ben xe — hai cot
 * `operationalControl` / `ownershipRegisterComplete` va vai truong doc — di qua
 * `VehicleOwnershipPort`, mot cong HEP cua chinh mien nay.
 *
 * KHONG CO `deleteInterest`, va do la co y: #242 E2 doi "preserve ownership history; no destructive
 * overwrite". Duong duy nhat de mot quyen loi thoi hieu luc la `closeInterest` — no DAT `effectiveTo`
 * va giu nguyen hang. Neu mot ngay co nguoi them `delete` vao cong nay, bo test lich su se do.
 */
export abstract class AssetOwnershipRepository {
  abstract createStakeholder(input: CreateStakeholderInput): Promise<AssetStakeholder>;
  abstract updateStakeholder(
    id: string,
    patch: UpdateStakeholderInput,
  ): Promise<AssetStakeholder | null>;
  abstract findStakeholder(id: string): Promise<AssetStakeholder | null>;
  abstract listStakeholders(): Promise<AssetStakeholder[]>;

  /**
   * CAU NOI XAC THUC: mot phien dang nhap -> mot ho so ben huu quan.
   *
   * Tra ve ca `status`, va nguoi goi PHAI kiem no. Mot ho so da ngung van co hang trong bang; coi
   * su ton tai cua hang la du de cap quyen se lam mot tai khoan bi thu hoi van doc duoc du lieu.
   */
  abstract findStakeholderByAuthUser(authUserId: string): Promise<AssetStakeholder | null>;
  /**
   * `authUserId = null` la GO cau noi. Tra ve `null` neu khong co ho so do. `trail` (`#395`): dau
   * vet cua lan noi / go — kho Prisma goi no TRONG cung giao dich; kho bo nho khong goi.
   */
  abstract setStakeholderAccount(
    id: string,
    authUserId: string | null,
    trail?: TransactionTrail<AssetStakeholder>,
  ): Promise<AssetStakeholder | null>;
  /** Ho so DANG giu tai khoan nay, neu co — de phan biet "noi trung" voi "chua noi". */
  abstract findStakeholderIdHoldingAccount(authUserId: string): Promise<string | null>;
  /**
   * Tai khoan DANG noi voi ho so nay (`null` = chua noi / khong co ho so) — CHI cho dong kiem toan
   * cua lan noi / go (`#395`): noi tai khoan la cap quyen cho mot con nguoi, nen so kiem toan phai
   * noi ai MAT va ai DUOC. Khung nhin `AssetStakeholder` van chi mang `hasAccount`.
   */
  abstract linkedAccountOf(stakeholderId: string): Promise<string | null>;

  abstract openInterest(input: OpenInterestInput): Promise<VehicleOwnershipInterest>;
  /** Tra ve `null` neu khong co quyen loi do; ban DA DONG tra ve nguyen trang, khong ghi de. */
  abstract closeInterest(input: CloseInterestInput): Promise<VehicleOwnershipInterest | null>;
  abstract findInterest(id: string): Promise<VehicleOwnershipInterest | null>;
  /** MOI quyen loi cua mot xe — dang hieu luc VA da dong. Lich su la mot phan cua cau tra loi. */
  abstract listInterestsForVehicle(vehicleId: string): Promise<VehicleOwnershipInterest[]>;
  abstract listInterestsForStakeholder(stakeholderId: string): Promise<VehicleOwnershipInterest[]>;
  abstract findActiveInterest(
    vehicleId: string,
    stakeholderId: string,
  ): Promise<VehicleOwnershipInterest | null>;
}

const iso = (at: Date): string => at.toISOString();

/**
 * Sap cac quyen loi DANG hieu luc: ty le giam dan, roi ten tang dan.
 *
 * Sap o kho chu khong o man hinh de hai lan doc luon cho ra cung mot chuoi — bai test khang dinh
 * duoc noi dung thay vi phai sap lai truoc moi phep so sanh.
 */
export const sortActiveInterests = (
  rows: readonly VehicleOwnershipInterest[],
): VehicleOwnershipInterest[] =>
  [...rows].sort(
    (a, b) =>
      b.ownershipBasisPoints - a.ownershipBasisPoints ||
      a.stakeholderName.localeCompare(b.stakeholderName) ||
      a.id.localeCompare(b.id),
  );

/** Sap lich su: moc dong moi nhat truoc, roi moc mo, roi dinh danh — tat dinh o moi lan doc. */
export const sortClosedInterests = (
  rows: readonly VehicleOwnershipInterest[],
): VehicleOwnershipInterest[] =>
  [...rows].sort(
    (a, b) =>
      (b.effectiveTo ?? '').localeCompare(a.effectiveTo ?? '') ||
      b.effectiveFrom.localeCompare(a.effectiveFrom) ||
      a.id.localeCompare(b.id),
  );

/** Va cham unique gia lap, de duong trong-bo-nho hong GIONG duong Postgres. */
class InMemoryUniqueViolation extends Error {
  readonly code = 'P2002';
  readonly meta: { modelName: string; target: string[] };

  constructor(index: UniqueIndexRef) {
    super(`Unique constraint failed on the fields: (\`${index.column}\`)`);
    this.name = 'InMemoryUniqueViolation';
    this.meta = { modelName: index.model, target: [index.column] };
  }
}

/**
 * Ban trong bo nho — duong chay cua `PERSISTENCE=memory` (demo/CI khong can CSDL).
 *
 * No PHAI cuong che cung mot bat bien voi ban Prisma. O day bat bien do la "MOT ban dang hieu luc
 * cho moi cap `(xe, ben huu quan)`", va `openInterest` kiem no trong chinh kho — khong phai chi o
 * dich vu. Mot bat bien chi song o tang tren se bien mat trong lan goi thu hai ma ai do quen kiem.
 */
export class InMemoryAssetOwnershipRepository extends AssetOwnershipRepository {
  private readonly stakeholders = new Map<string, AssetStakeholder>();
  private readonly accounts = new Map<string, string>();
  private readonly interests = new Map<string, VehicleOwnershipInterest>();

  async createStakeholder(input: CreateStakeholderInput): Promise<AssetStakeholder> {
    const now = new Date().toISOString();
    const row: AssetStakeholder = {
      id: randomUUID(),
      kind: input.kind,
      displayName: input.displayName,
      status: input.status ?? 'ACTIVE',
      note: input.note ?? null,
      hasAccount: false,
      createdAt: now,
      updatedAt: now,
    };
    this.stakeholders.set(row.id, row);
    return row;
  }

  async updateStakeholder(
    id: string,
    patch: UpdateStakeholderInput,
  ): Promise<AssetStakeholder | null> {
    const current = this.stakeholders.get(id);
    if (!current) return null;
    const next: AssetStakeholder = {
      ...current,
      displayName: patch.displayName ?? current.displayName,
      note: patch.note === undefined ? current.note : patch.note,
      status: patch.status ?? current.status,
      updatedAt: new Date().toISOString(),
    };
    this.stakeholders.set(id, next);
    this.renameInterestsOf(next);
    return next;
  }

  async findStakeholder(id: string): Promise<AssetStakeholder | null> {
    return this.stakeholders.get(id) ?? null;
  }

  async listStakeholders(): Promise<AssetStakeholder[]> {
    return [...this.stakeholders.values()].sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
  }

  async findStakeholderByAuthUser(authUserId: string): Promise<AssetStakeholder | null> {
    const id = this.accounts.get(authUserId);
    return id ? (this.stakeholders.get(id) ?? null) : null;
  }

  async findStakeholderIdHoldingAccount(authUserId: string): Promise<string | null> {
    return this.accounts.get(authUserId) ?? null;
  }

  async linkedAccountOf(stakeholderId: string): Promise<string | null> {
    for (const [user, holder] of this.accounts.entries()) {
      if (holder === stakeholderId) return user;
    }
    return null;
  }

  async setStakeholderAccount(
    id: string,
    authUserId: string | null,
  ): Promise<AssetStakeholder | null> {
    const current = this.stakeholders.get(id);
    if (!current) return null;
    // Cung unique voi Postgres: KHONG lang le cuop tai khoan dang thuoc ho so khac.
    const taken = authUserId === null ? undefined : this.accounts.get(authUserId);
    if (taken !== undefined && taken !== id) {
      throw new InMemoryUniqueViolation(ASSET_STAKEHOLDER_ACCOUNT_UNIQUE);
    }
    for (const [user, holder] of [...this.accounts.entries()]) {
      if (holder === id) this.accounts.delete(user);
    }
    if (authUserId) this.accounts.set(authUserId, id);
    const next: AssetStakeholder = {
      ...current,
      hasAccount: authUserId !== null,
      updatedAt: new Date().toISOString(),
    };
    this.stakeholders.set(id, next);
    return next;
  }

  async openInterest(input: OpenInterestInput): Promise<VehicleOwnershipInterest> {
    const active = await this.findActiveInterest(input.vehicleId, input.stakeholderId);
    if (active) {
      // Cung cau tra loi voi unique MOT PHAN cua Postgres. Kho trong bo nho khong duoc de lot mot
      // trang thai ma ban Prisma se tu choi — neu khong, bo test se xanh o CI va do o that.
      throw new Error('TransportVehicleOwnershipInterest_activePair_key');
    }
    const holder = this.stakeholders.get(input.stakeholderId);
    const row: VehicleOwnershipInterest = {
      id: randomUUID(),
      vehicleId: input.vehicleId,
      stakeholderId: input.stakeholderId,
      stakeholderName: holder?.displayName ?? '',
      stakeholderKind: holder?.kind ?? 'PERSON',
      ownershipBasisPoints: input.ownershipBasisPoints,
      effectiveFrom: iso(input.effectiveFrom),
      effectiveTo: null,
      recordedBy: input.recordedBy,
      recordedNote: input.recordedNote ?? null,
      closedBy: null,
      closedNote: null,
      createdAt: new Date().toISOString(),
    };
    this.interests.set(row.id, row);
    return row;
  }

  async closeInterest(input: CloseInterestInput): Promise<VehicleOwnershipInterest | null> {
    const current = this.interests.get(input.interestId);
    if (!current) return null;
    if (current.effectiveTo !== null) return current;
    const next: VehicleOwnershipInterest = {
      ...current,
      effectiveTo: iso(input.effectiveTo),
      closedBy: input.closedBy,
      closedNote: input.closedNote ?? null,
    };
    this.interests.set(next.id, next);
    return next;
  }

  async findInterest(id: string): Promise<VehicleOwnershipInterest | null> {
    return this.interests.get(id) ?? null;
  }

  async listInterestsForVehicle(vehicleId: string): Promise<VehicleOwnershipInterest[]> {
    return [...this.interests.values()].filter((row) => row.vehicleId === vehicleId);
  }

  async listInterestsForStakeholder(stakeholderId: string): Promise<VehicleOwnershipInterest[]> {
    return [...this.interests.values()].filter((row) => row.stakeholderId === stakeholderId);
  }

  async findActiveInterest(
    vehicleId: string,
    stakeholderId: string,
  ): Promise<VehicleOwnershipInterest | null> {
    return (
      [...this.interests.values()].find(
        (row) =>
          row.vehicleId === vehicleId &&
          row.stakeholderId === stakeholderId &&
          row.effectiveTo === null,
      ) ?? null
    );
  }

  /**
   * Doi ten hien thi tren cac quyen loi da ghi.
   *
   * Ban Prisma `join` sang bang ben huu quan nen no thay ten moi ngay; ban trong bo nho da CHUP ten
   * vao hang luc ghi, nen phai cap nhat lai — neu khong, hai ban se tra ve hai ket qua khac nhau
   * cho cung mot chuoi thao tac, va do dung la loai lech ma `PERSISTENCE=memory` sinh ra de tranh.
   */
  private renameInterestsOf(holder: AssetStakeholder): void {
    for (const [id, row] of this.interests) {
      if (row.stakeholderId !== holder.id) continue;
      this.interests.set(id, {
        ...row,
        stakeholderName: holder.displayName,
        stakeholderKind: holder.kind,
      });
    }
  }
}
