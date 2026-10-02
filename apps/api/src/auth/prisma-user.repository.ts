import { Injectable } from '@nestjs/common';
import { Prisma, type User, type UserPermissionGrant } from '@prisma/client';
import { PrismaService } from '../config/prisma.service.js';
import type { UserRole } from './auth.types.js';
import {
  DuplicateUserError,
  UserRepository,
  isActiveAdmin,
  sortGrants,
  type AuthUserRecord,
  type CreateUserRecord,
  type GuardedUserChange,
  type ListUsersFilter,
  type SetAccessRecord,
  type UpdateProfileRecord,
  type UserChangeTrail,
  type UserCreateTrail,
  type UserWrite,
} from './user.repository.js';

/** MOT truy van cho moi lan doc: tai khoan + quyen rieng (`include`), theo thu tu ma. */
const WITH_GRANTS = {
  permissionGrants: {
    select: { permission: true, effect: true },
    orderBy: { permission: 'asc' },
  },
} satisfies Prisma.UserInclude;

type UserRow = User & { permissionGrants: Pick<UserPermissionGrant, 'permission' | 'effect'>[] };
type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaUserRepository extends UserRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findByUsername(username: string): Promise<AuthUserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { username }, include: WITH_GRANTS });
    return row ? toRecord(row) : null;
  }

  async findById(id: string): Promise<AuthUserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { id }, include: WITH_GRANTS });
    return row ? toRecord(row) : null;
  }

  async list(filter: ListUsersFilter = {}): Promise<AuthUserRecord[]> {
    const rows = await this.prisma.user.findMany({
      where: listWhere(filter),
      include: WITH_GRANTS,
      orderBy: [{ disabledAt: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
    });
    return rows.map(toRecord);
  }

  countActiveAdmins(): Promise<number> {
    return this.prisma.user.count({ where: { role: 'ADMIN', disabledAt: null } });
  }

  async create(input: CreateUserRecord, trail?: UserCreateTrail): Promise<AuthUserRecord> {
    const grants = input.grants ?? [];
    const temporaryUntil = input.temporaryPasswordExpiresAt ?? null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.user.create({
          data: {
            username: input.username,
            name: input.name,
            email: input.email,
            phone: input.phone,
            passwordHash: input.passwordHash,
            role: input.role,
            jobTitle: input.jobTitle ?? null,
            passwordChangedAt: new Date(),
            mustChangePassword: temporaryUntil !== null,
            temporaryPasswordExpiresAt: temporaryUntil,
            ...(grants.length > 0
              ? {
                  permissionGrants: {
                    create: grantRows(grants, requireGrantedBy(input.grantedBy)),
                  },
                }
              : {}),
          },
          include: WITH_GRANTS,
        });
        const created = toRecord(row);
        // Dau vet trong CUNG giao dich — hong thi tai khoan khong duoc tao.
        await trail?.(created, tx);
        return created;
      });
    } catch (error) {
      throw mapDuplicate(error);
    }
  }

  async updateProfile(
    id: string,
    patch: UpdateProfileRecord,
    trail?: UserChangeTrail,
  ): Promise<UserWrite> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await lockUser(tx, id);
        if (!before) return { status: 'NOT_FOUND' } as const;
        const after = await tx.user.update({
          where: { id },
          data: {
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.email !== undefined ? { email: patch.email } : {}),
            ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
            ...(patch.jobTitle !== undefined ? { jobTitle: patch.jobTitle } : {}),
          },
          include: WITH_GRANTS,
        });
        const change = { status: 'UPDATED', before, after: toRecord(after) } as const;
        await trail?.(change, tx);
        return change;
      });
    } catch (error) {
      throw mapDuplicate(error);
    }
  }

  /**
   * Vai + TOAN BO quyen rieng trong MOT giao dich: khong ai doc duoc mot tai khoan vai moi ma quyen
   * rieng cu (hay nguoc lai). Ha vai Giam doc di qua khoa Giam doc (`lockActiveAdmins`).
   */
  setAccess(
    id: string,
    access: SetAccessRecord,
    trail?: UserChangeTrail,
  ): Promise<GuardedUserChange> {
    return this.prisma.$transaction(async (tx) => {
      const admins = await lockActiveAdmins(tx);
      const before = await lockUser(tx, id);
      if (!before) return { status: 'NOT_FOUND' } as const;
      if (access.role !== 'ADMIN' && leavesNoActiveAdmin(before, admins)) {
        return { status: 'LAST_ACTIVE_ADMIN' } as const;
      }
      await tx.userPermissionGrant.deleteMany({ where: { userId: id } });
      if (access.grants.length > 0) {
        await tx.userPermissionGrant.createMany({
          data: grantRows(access.grants, access.grantedBy).map((row) => ({ ...row, userId: id })),
        });
      }
      const after = await tx.user.update({
        where: { id },
        data: { role: access.role },
        include: WITH_GRANTS,
      });
      const change = { status: 'UPDATED', before, after: toRecord(after) } as const;
      await trail?.(change, tx);
      return change;
    });
  }

  disable(id: string, trail?: UserChangeTrail): Promise<GuardedUserChange> {
    return this.prisma.$transaction(async (tx) => {
      const admins = await lockActiveAdmins(tx);
      const before = await lockUser(tx, id);
      if (!before) return { status: 'NOT_FOUND' } as const;
      // Da khoa roi: khong doi gi (khong ha phien lan nua, khong doi moc khoa).
      if (before.disabledAt !== null) return { status: 'UPDATED', before, after: before } as const;
      if (leavesNoActiveAdmin(before, admins)) return { status: 'LAST_ACTIVE_ADMIN' } as const;
      const after = await tx.user.update({
        where: { id },
        data: { disabledAt: new Date(), credentialVersion: { increment: 1 } },
        include: WITH_GRANTS,
      });
      const change = { status: 'UPDATED', before, after: toRecord(after) } as const;
      await trail?.(change, tx);
      return change;
    });
  }

  enable(id: string, trail?: UserChangeTrail): Promise<UserWrite> {
    return this.prisma.$transaction(async (tx) => {
      const before = await lockUser(tx, id);
      if (!before) return { status: 'NOT_FOUND' } as const;
      if (before.disabledAt === null) return { status: 'UPDATED', before, after: before } as const;
      const after = await tx.user.update({
        where: { id },
        data: { disabledAt: null },
        include: WITH_GRANTS,
      });
      const change = { status: 'UPDATED', before, after: toRecord(after) } as const;
      await trail?.(change, tx);
      return change;
    });
  }

  updatePassword(
    id: string,
    passwordHash: string,
    temporaryUntil: Date | null,
    trail?: UserChangeTrail,
  ): Promise<UserWrite> {
    return this.prisma.$transaction(async (tx) => {
      const before = await lockUser(tx, id);
      if (!before) return { status: 'NOT_FOUND' } as const;
      // `#395`: KHONG con `disabledAt: null` o day — dat lai mat khau khong mo khoa tai khoan.
      const after = await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          credentialVersion: { increment: 1 },
          mustChangePassword: temporaryUntil !== null,
          temporaryPasswordExpiresAt: temporaryUntil,
        },
        include: WITH_GRANTS,
      });
      const change = { status: 'UPDATED', before, after: toRecord(after) } as const;
      await trail?.(change, tx);
      return change;
    });
  }

  async markLogin(id: string, at: Date): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { lastLoginAt: at } });
  }
}

/**
 * KHOA GIAM DOC — cau lenh DAU TIEN cua moi giao dich co the lam mat Giam doc dang hoat dong.
 *
 * Khoa moi hang ADMIN dang hoat dong THEO THU TU `id`, TRUOC khi khoa tai khoan dich: hai giao dich
 * ha vai nhau luon lay khoa cung mot thu tu nen khong the khoa cheo (deadlock). Giao dich den sau
 * cho o day; khi duoc chay, Postgres (READ COMMITTED) danh gia lai dieu kien tren ban moi nhat cua
 * hang da bi sua — Giam doc vua bi ha vai khong con trong tap, nen phep dem thay dung su that.
 */
async function lockActiveAdmins(tx: Tx): Promise<readonly string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User"
    WHERE "role" = 'ADMIN' AND "disabledAt" IS NULL
    ORDER BY "id"
    FOR UPDATE`;
  return rows.map((row) => row.id);
}

/** Khoa hang tai khoan dich roi doc no (kem quyen rieng) — ban TRUOC cua lan ghi. */
async function lockUser(tx: Tx, id: string): Promise<AuthUserRecord | null> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
  if (locked.length === 0) return null;
  const row = await tx.user.findUnique({ where: { id }, include: WITH_GRANTS });
  return row ? toRecord(row) : null;
}

function leavesNoActiveAdmin(target: AuthUserRecord, lockedAdmins: readonly string[]): boolean {
  if (!isActiveAdmin(target)) return false;
  return lockedAdmins.filter((adminId) => adminId !== target.id).length === 0;
}

function listWhere(filter: ListUsersFilter): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [];
  if (filter.role) and.push({ role: filter.role });
  if (filter.status === 'disabled') and.push({ disabledAt: { not: null } });
  if (filter.status === 'pending') and.push({ disabledAt: null, mustChangePassword: true });
  if (filter.status === 'active') and.push({ disabledAt: null, mustChangePassword: false });
  const q = filter.q?.trim();
  if (q) {
    const contains = { contains: q, mode: 'insensitive' } as const;
    and.push({
      OR: [
        { username: contains },
        { name: contains },
        { email: contains },
        { phone: contains },
        { jobTitle: contains },
      ],
    });
  }
  return and.length > 0 ? { AND: and } : {};
}

function grantRows(
  grants: readonly { readonly permission: string; readonly effect: 'ALLOW' | 'DENY' }[],
  grantedBy: string,
): { permission: string; effect: 'ALLOW' | 'DENY'; grantedBy: string }[] {
  return sortGrants(grants).map((grant) => ({
    permission: grant.permission,
    effect: grant.effect,
    grantedBy,
  }));
}

function requireGrantedBy(grantedBy: string | undefined): string {
  if (!grantedBy) throw new Error('grantedBy bat buoc khi tao tai khoan kem quyen rieng');
  return grantedBy;
}

/** Trung ten dang nhap / email / so dien thoai → `DuplicateUserError`; loi khac nem nguyen. */
function mapDuplicate(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new DuplicateUserError();
  }
  return error;
}

function toRecord(row: UserRow): AuthUserRecord {
  const { permissionGrants, ...user } = row;
  return {
    ...user,
    role: user.role as UserRole,
    permissionGrants: permissionGrants.map((grant) => ({
      permission: grant.permission,
      effect: grant.effect,
    })),
  };
}
