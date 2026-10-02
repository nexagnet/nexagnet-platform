import { randomUUID } from 'node:crypto';
import type { TransactionTrail } from '../audit/audit-trail.js';
import type { PermissionGrant } from './access/permission-domain.js';
import type { UserRole } from './auth.types.js';

export interface AuthUserRecord {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  passwordHash: string;
  role: UserRole;
  disabledAt: Date | null;
  credentialVersion: number;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
  /*
   * `#395` — TUY CHON o tang kieu: cac kho va fixture dung truoc #395 khong dien chung, va thieu
   * phai nghia la "nhu hom nay" (khong quyen rieng, khong bi ep doi mat khau). Kho doc chung tu
   * DB se dien day du.
   */
  permissionGrants?: readonly PermissionGrant[];
  mustChangePassword?: boolean;
  temporaryPasswordExpiresAt?: Date | null;
  jobTitle?: string | null;
}

export interface CreateUserRecord {
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  passwordHash: string;
  role: UserRole;
  /* `#395` — tuy chon: moi noi tao tai khoan cu (spec, boot spec) van dung nguyen hinh dang cu. */
  jobTitle?: string | null;
  /** Co gia tri = mat khau tam, phai doi truoc lan dau lam viec; han cua mat khau tam. */
  temporaryPasswordExpiresAt?: Date | null;
  grants?: readonly PermissionGrant[];
  /** Username nguoi cap — bat buoc khi co `grants`. */
  grantedBy?: string;
}

/** Bo loc danh sach — moi truong tuy chon, ket hop bang AND. */
export interface ListUsersFilter {
  /** Chuoi con, khong phan biet hoa thuong: ten dang nhap, ten, email, so dien thoai, chuc danh. */
  readonly q?: string | null;
  /** `active` = dang lam viec · `pending` = cho doi mat khau tam · `disabled` = da khoa. */
  readonly status?: 'active' | 'disabled' | 'pending' | null;
  readonly role?: UserRole | null;
}

/** Chi cac truong duoc KHAI moi doi; `username` BAT BIEN. */
export interface UpdateProfileRecord {
  readonly name?: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly jobTitle?: string | null;
}

export interface SetAccessRecord {
  readonly role: UserRole;
  /** TOAN BO bo quyen rieng sau thay doi — thay the tron, trong CUNG giao dich voi vai. */
  readonly grants: readonly PermissionGrant[];
  readonly grantedBy: string;
}

/** Mot thay doi da ghi — ca TRUOC va SAU, doc trong cung don vi cong viec. */
export interface UserChange {
  readonly status: 'UPDATED';
  readonly before: AuthUserRecord;
  readonly after: AuthUserRecord;
}

/**
 * Ket qua mot lan ghi co the lam MAT Giam doc dang hoat dong cuoi cung (khoa, ha vai).
 *
 * `LAST_ACTIVE_ADMIN` duoc quyet dinh TRONG kho, duoi khoa: dem roi ghi o hai cau lenh rieng se de
 * hai Giam doc cung luc ha vai nhau va he thong con 0 Giam doc.
 */
export type GuardedUserChange =
  UserChange | { readonly status: 'NOT_FOUND' } | { readonly status: 'LAST_ACTIVE_ADMIN' };

export type UserWrite = UserChange | { readonly status: 'NOT_FOUND' };

/**
 * Dau vet cua lan ghi — kho Prisma goi no BEN TRONG giao dich, voi ban truoc/sau doc duoi khoa
 * (`audit/audit-trail.ts`). Kho bo nho khong co giao dich: KHONG goi no. Lan ghi khong doi gi o kho
 * (khoa lap lai) cung khong goi no.
 */
export type UserChangeTrail = TransactionTrail<UserChange>;
/** Nhu `UserChangeTrail`, cho lan TAO: chi co ban sau. */
export type UserCreateTrail = TransactionTrail<AuthUserRecord>;

export class DuplicateUserError extends Error {
  constructor() {
    super('Duplicate user identity');
    this.name = 'DuplicateUserError';
  }
}

export abstract class UserRepository {
  /* Moi lan DOC deu tra kem `permissionGrants` (Prisma: `include`, MOT truy van). */
  abstract findByUsername(username: string): Promise<AuthUserRecord | null>;
  abstract findById(id: string): Promise<AuthUserRecord | null>;
  abstract list(filter?: ListUsersFilter): Promise<AuthUserRecord[]>;
  /** So Giam doc DANG HOAT DONG — chi de xem truoc (`dryRun`); lan ghi that tu dem duoi khoa. */
  abstract countActiveAdmins(): Promise<number>;
  abstract create(input: CreateUserRecord, trail?: UserCreateTrail): Promise<AuthUserRecord>;
  /** Nem `DuplicateUserError` khi email / so dien thoai trung tai khoan khac. */
  abstract updateProfile(
    id: string,
    patch: UpdateProfileRecord,
    trail?: UserChangeTrail,
  ): Promise<UserWrite>;
  abstract setAccess(
    id: string,
    access: SetAccessRecord,
    trail?: UserChangeTrail,
  ): Promise<GuardedUserChange>;
  abstract disable(id: string, trail?: UserChangeTrail): Promise<GuardedUserChange>;
  abstract enable(id: string, trail?: UserChangeTrail): Promise<UserWrite>;
  /**
   * Doi mat khau. `temporaryUntil` co gia tri = mat khau TAM (dat lai / cap moi): bat
   * `mustChangePassword` va dat han; `null` = mat khau that (nguoi dung tu doi): xoa ca hai.
   *
   * KHONG dong vao `disabledAt`: dat lai mat khau KHONG mo khoa tai khoan (`#395` — truoc day ban
   * Prisma lang le mo khoa, ban bo nho thi khong). Mo khoa la mot thao tac rieng (`enable`).
   */
  abstract updatePassword(
    id: string,
    passwordHash: string,
    temporaryUntil: Date | null,
    trail?: UserChangeTrail,
  ): Promise<UserWrite>;
  abstract markLogin(id: string, at: Date): Promise<void>;
}

/** Lan ghi da doi mot tai khoan (ban truoc + sau) — `null` khi khong tim thay / bi chan. */
export function updatedChange(result: UserWrite | GuardedUserChange): UserChange | null {
  return result.status === 'UPDATED' ? result : null;
}

/* ------------------------------------------------------------------ *
 * Quy tac dung chung cho hai kho — MOT cho, de hai kho khong noi khac nhau
 * ------------------------------------------------------------------ */

export function isActiveAdmin(record: Pick<AuthUserRecord, 'role' | 'disabledAt'>): boolean {
  return record.role === 'ADMIN' && record.disabledAt === null;
}

/** Tai khoan dang cho doi mat khau tam (va chua bi khoa). */
export function isPendingPasswordChange(
  record: Pick<AuthUserRecord, 'disabledAt' | 'mustChangePassword'>,
): boolean {
  return record.disabledAt === null && record.mustChangePassword === true;
}

export function matchesListFilter(record: AuthUserRecord, filter: ListUsersFilter): boolean {
  if (filter.role && record.role !== filter.role) return false;
  if (filter.status === 'disabled' && record.disabledAt === null) return false;
  if (filter.status === 'pending' && !isPendingPasswordChange(record)) return false;
  if (
    filter.status === 'active' &&
    (record.disabledAt !== null || isPendingPasswordChange(record))
  ) {
    return false;
  }
  const q = filter.q?.trim().toLocaleLowerCase('vi');
  if (!q) return true;
  return [record.username, record.name, record.email, record.phone, record.jobTitle]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.toLocaleLowerCase('vi').includes(q));
}

/** Tai khoan dang hoat dong truoc, roi theo ten. */
export function compareForList(left: AuthUserRecord, right: AuthUserRecord): number {
  const leftDisabled = left.disabledAt === null ? 0 : 1;
  const rightDisabled = right.disabledAt === null ? 0 : 1;
  if (leftDisabled !== rightDisabled) return leftDisabled - rightDisabled;
  return left.name.localeCompare(right.name, 'vi');
}

/** Quyen rieng theo thu tu ma — de hai kho va so kiem toan tra cung mot thu tu. */
export function sortGrants(grants: readonly PermissionGrant[]): PermissionGrant[] {
  return [...grants]
    .map((grant) => ({ permission: grant.permission, effect: grant.effect }))
    .sort((left, right) => left.permission.localeCompare(right.permission));
}

/* ------------------------------------------------------------------ *
 * KHO BO NHO — cung hanh vi voi Prisma (bai `user.repository.spec.ts`)
 * ------------------------------------------------------------------ */

export class InMemoryUserRepository extends UserRepository {
  private records: readonly AuthUserRecord[];
  /**
   * KHOA cua kho bo nho: moi lan GHI xep hang tren mot chuoi promise. Hai lan ha vai hai Giam doc
   * goi cung luc van chay LAN LUOT — dung nhu `SELECT … FOR UPDATE` cua ban Prisma.
   */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(seed: readonly AuthUserRecord[] = []) {
    super();
    this.records = seed.map(withDefaults);
  }

  async findByUsername(username: string): Promise<AuthUserRecord | null> {
    const record = this.records.find((candidate) => candidate.username === username);
    return record ? cloneRecord(record) : null;
  }

  async findById(id: string): Promise<AuthUserRecord | null> {
    const record = this.records.find((candidate) => candidate.id === id);
    return record ? cloneRecord(record) : null;
  }

  async list(filter: ListUsersFilter = {}): Promise<AuthUserRecord[]> {
    return this.records
      .filter((record) => matchesListFilter(record, filter))
      .sort(compareForList)
      .map(cloneRecord);
  }

  async countActiveAdmins(): Promise<number> {
    return this.records.filter(isActiveAdmin).length;
  }

  create(input: CreateUserRecord): Promise<AuthUserRecord> {
    return this.exclusive(async () => {
      if (
        this.records.some(
          (record) =>
            record.username === input.username ||
            (input.email !== null && record.email === input.email) ||
            (input.phone !== null && record.phone === input.phone),
        )
      ) {
        throw new DuplicateUserError();
      }
      const now = new Date();
      const temporaryUntil = input.temporaryPasswordExpiresAt ?? null;
      const record: AuthUserRecord = {
        id: randomUUID(),
        username: input.username,
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash: input.passwordHash,
        role: input.role,
        disabledAt: null,
        credentialVersion: 1,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null,
        passwordChangedAt: now,
        permissionGrants: sortGrants(input.grants ?? []),
        mustChangePassword: temporaryUntil !== null,
        temporaryPasswordExpiresAt: temporaryUntil ? new Date(temporaryUntil) : null,
        jobTitle: input.jobTitle ?? null,
      };
      this.records = [...this.records, record];
      return cloneRecord(record);
    });
  }

  updateProfile(id: string, patch: UpdateProfileRecord): Promise<UserWrite> {
    return this.exclusive(async () => {
      const clash = this.records.some(
        (record) =>
          record.id !== id &&
          ((patch.email != null && record.email === patch.email) ||
            (patch.phone != null && record.phone === patch.phone)),
      );
      if (clash && this.records.some((record) => record.id === id)) throw new DuplicateUserError();
      return this.change(id, (record) => ({
        ...record,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.email !== undefined ? { email: patch.email } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        ...(patch.jobTitle !== undefined ? { jobTitle: patch.jobTitle } : {}),
      }));
    });
  }

  setAccess(id: string, access: SetAccessRecord): Promise<GuardedUserChange> {
    return this.exclusive(async () => {
      const current = this.records.find((record) => record.id === id);
      if (!current) return { status: 'NOT_FOUND' } as const;
      if (access.role !== 'ADMIN' && this.wouldLeaveNoActiveAdmin(current)) {
        return { status: 'LAST_ACTIVE_ADMIN' } as const;
      }
      return this.change(id, (record) => ({
        ...record,
        role: access.role,
        permissionGrants: sortGrants(access.grants),
      }));
    });
  }

  disable(id: string): Promise<GuardedUserChange> {
    return this.exclusive(async () => {
      const current = this.records.find((record) => record.id === id);
      if (!current) return { status: 'NOT_FOUND' } as const;
      // Da khoa roi: khong doi gi (khong ha phien lan nua, khong doi moc khoa).
      if (current.disabledAt !== null) {
        return { status: 'UPDATED', before: cloneRecord(current), after: cloneRecord(current) };
      }
      if (this.wouldLeaveNoActiveAdmin(current)) return { status: 'LAST_ACTIVE_ADMIN' } as const;
      return this.change(id, (record) => ({
        ...record,
        disabledAt: new Date(),
        credentialVersion: record.credentialVersion + 1,
      }));
    });
  }

  enable(id: string): Promise<UserWrite> {
    return this.exclusive(async () => {
      const current = this.records.find((record) => record.id === id);
      if (!current) return { status: 'NOT_FOUND' } as const;
      if (current.disabledAt === null) {
        return { status: 'UPDATED', before: cloneRecord(current), after: cloneRecord(current) };
      }
      return this.change(id, (record) => ({ ...record, disabledAt: null }));
    });
  }

  updatePassword(
    id: string,
    passwordHash: string,
    temporaryUntil: Date | null,
  ): Promise<UserWrite> {
    return this.exclusive(async () =>
      this.change(id, (record) => ({
        ...record,
        passwordHash,
        passwordChangedAt: new Date(),
        credentialVersion: record.credentialVersion + 1,
        mustChangePassword: temporaryUntil !== null,
        temporaryPasswordExpiresAt: temporaryUntil ? new Date(temporaryUntil) : null,
      })),
    );
  }

  markLogin(id: string, at: Date): Promise<void> {
    return this.exclusive(async () => {
      this.change(id, (record) => ({ ...record, lastLoginAt: new Date(at) }));
    });
  }

  private wouldLeaveNoActiveAdmin(target: AuthUserRecord): boolean {
    if (!isActiveAdmin(target)) return false;
    return !this.records.some((record) => record.id !== target.id && isActiveAdmin(record));
  }

  /** Doc-sua-ghi MOT ban ghi, tra ca truoc va sau. Chi goi ben trong `exclusive`. */
  private change(id: string, transform: (record: AuthUserRecord) => AuthUserRecord): UserWrite {
    const current = this.records.find((record) => record.id === id);
    if (!current) return { status: 'NOT_FOUND' };
    const updated = { ...transform(cloneRecord(current)), updatedAt: new Date() };
    this.records = this.records.map((record) => (record.id === id ? updated : record));
    return { status: 'UPDATED', before: cloneRecord(current), after: cloneRecord(updated) };
  }

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    // Mot lan ghi loi khong duoc lam ket ca hang doi phia sau.
    this.queue = run.catch(() => undefined);
    return run;
  }
}

/** Ban ghi seed tu fixture cu co the thieu truong `#395` — dien gia tri "nhu hom nay". */
function withDefaults(record: AuthUserRecord): AuthUserRecord {
  return cloneRecord({
    ...record,
    permissionGrants: sortGrants(record.permissionGrants ?? []),
    mustChangePassword: record.mustChangePassword ?? false,
    temporaryPasswordExpiresAt: record.temporaryPasswordExpiresAt ?? null,
    jobTitle: record.jobTitle ?? null,
  });
}

function cloneRecord(record: AuthUserRecord): AuthUserRecord {
  return structuredClone(record);
}
