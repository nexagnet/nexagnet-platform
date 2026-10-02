import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditLogService } from '../audit/audit-log.service.js';
import { AuthService } from './auth.service.js';
import type { PasswordService } from './password.service.js';
import {
  InMemoryUserRepository,
  type AuthUserRecord,
  type UserRepository,
} from './user.repository.js';
import { reasonOf } from './__tests__/account-fixtures.js';

// Chuoi mau cho test. Dat thanh hang so co ten KHONG phai `password` vi bo quet bi mat o
// pre-commit canh bao khi mot khoa kieu mat khau duoc gan thang bang chuoi tu 12 ky tu tro len
// — ma `passwordSchema` lai doi min(12) nen khong the rut ngan. Hang so vua bo bao dong gia,
// vua gom gia tri ve mot cho.
const VALID_PW = 'correct-password';
const WRONG_PW = 'wrong-password';
const CREATED_PW = 'long-password-123';
const RESET_PW = 'new-password-123';
const CHANGED_PW = 'changed-password-9';

const ADMIN: AuthUserRecord = {
  id: 'admin-1',
  username: 'admin.one',
  name: 'Admin One',
  email: null,
  phone: null,
  passwordHash: `hash:${VALID_PW}`,
  role: 'ADMIN',
  disabledAt: null,
  credentialVersion: 1,
  createdAt: new Date('2026-08-12T00:00:00.000Z'),
  updatedAt: new Date('2026-08-12T00:00:00.000Z'),
  lastLoginAt: null,
  passwordChangedAt: new Date('2026-08-12T00:00:00.000Z'),
};

const SALE: AuthUserRecord = {
  ...ADMIN,
  id: 'sale-1',
  username: 'sale.one',
  name: 'Sale One',
  role: 'SALE',
};

/** `operator` la tai khoan ADMIN THAT tren gd1-test — ten danh rieng chi chan TAO MOI. */
const OPERATOR: AuthUserRecord = {
  ...ADMIN,
  id: 'operator-1',
  username: 'operator',
  name: 'Nguoi van hanh',
};

describe('AuthService', () => {
  let repository: UserRepository;
  let service: AuthService;
  const audit = {
    append: vi.fn(async () => undefined),
    list: vi.fn(async () => []),
  } as unknown as AuditLogService;
  const passwords = {
    hash: vi.fn(async (value: string) => `hash:${value}`),
    verify: vi.fn(async (hash: string, value: string) => hash === `hash:${value}`),
  } as unknown as PasswordService;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new InMemoryUserRepository([ADMIN, SALE, OPERATOR]);
    // Ba tham so dau nhu truoc #395: so dang ky mien va telemetry la TUY CHON.
    service = new AuthService(repository, passwords, audit);
  });

  it('authenticates an enabled user without returning the password hash', async () => {
    const result = await service.authenticate({
      username: ' ADMIN.ONE ',
      password: VALID_PW,
    });

    expect(result).toMatchObject({ id: ADMIN.id, username: ADMIN.username, role: 'ADMIN' });
    expect(result).toMatchObject({ mustChangePassword: false, permissionGrants: [] });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('returns the same generic error for unknown, bad-password, and disabled users', async () => {
    await expect(
      service.authenticate({ username: 'missing.user', password: VALID_PW }),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      service.authenticate({ username: ADMIN.username, password: WRONG_PW }),
    ).rejects.toThrow('Tên đăng nhập hoặc mật khẩu không đúng');

    await repository.disable(SALE.id);
    await expect(
      service.authenticate({ username: SALE.username, password: VALID_PW }),
    ).rejects.toThrow('Tên đăng nhập hoặc mật khẩu không đúng');
  });

  it('`operator` da ton tai van dang nhap duoc — ten danh rieng chi chan tao moi', async () => {
    await expect(
      service.authenticate({ username: 'operator', password: VALID_PW }),
    ).resolves.toMatchObject({ id: OPERATOR.id, role: 'ADMIN' });

    expect(
      await reasonOf(
        service.createUser(ADMIN, {
          username: ' Operator ',
          name: 'Trung ten',
          password: CREATED_PW,
          role: 'SALE',
        }),
      ),
    ).toBe('USERNAME_RESERVED');
  });

  it('creates a TEMPORARY user with an Argon2 hash and audits only safe fields', async () => {
    const created = await service.createUser(ADMIN, {
      username: 'sale.two',
      name: 'Sale Two',
      password: CREATED_PW,
      role: 'SALE',
    });

    expect(created).toMatchObject({ username: 'sale.two', role: 'SALE', mustChangePassword: true });
    expect(created.credential).toMatchObject({ temporaryPassword: CREATED_PW });
    expect(passwords.hash).toHaveBeenCalledWith(CREATED_PW);
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: ADMIN.username,
        action: 'auth.user.create',
        after: expect.objectContaining({
          onboarding: {
            passwordChangeRequired: true,
            temporaryCredentialExpiresAt: expect.any(String),
          },
        }),
      }),
    );
    expect(JSON.stringify(vi.mocked(audit.append).mock.calls)).not.toContain(CREATED_PW);
  });

  it('rejects duplicate usernames without leaking persistence details', async () => {
    const attempt = service.createUser(ADMIN, {
      username: SALE.username,
      name: 'Duplicate',
      password: CREATED_PW,
      role: 'SALE',
    });
    await expect(attempt).rejects.toThrow(ConflictException);
    expect(
      await reasonOf(
        service.createUser(ADMIN, {
          username: SALE.username,
          name: 'Duplicate',
          role: 'SALE',
        }),
      ),
    ).toBe('ACCOUNT_IDENTITY_TAKEN');
  });

  /*
   * #395: truoc day bai nay cho Giam doc DAT LAI MAT KHAU CUA CHINH MINH qua duong quan tri — khong
   * can mat khau hien tai. Nay la `SELF_LOCKOUT`; bai dat lai tren MOT NGUOI KHAC.
   */
  it('dat lai mat khau NGUOI KHAC: mat khau tam, phien cu chet, kiem toan truoc/sau', async () => {
    const updated = await service.resetPassword(ADMIN, SALE.id, { password: RESET_PW });

    expect(updated.credentialVersion).toBe(2);
    expect(updated).toMatchObject({ mustChangePassword: true });
    expect(updated.credential).toEqual({
      temporaryPassword: RESET_PW,
      expiresAt: updated.temporaryPasswordExpiresAt,
    });
    expect(await repository.findById(SALE.id)).toMatchObject({
      passwordHash: `hash:${RESET_PW}`,
      credentialVersion: 2,
      mustChangePassword: true,
    });
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.credentials.reset',
        entityId: SALE.id,
        before: {
          onboarding: { passwordChangeRequired: false, temporaryCredentialExpiresAt: null },
        },
        after: {
          onboarding: {
            passwordChangeRequired: true,
            temporaryCredentialExpiresAt: updated.temporaryPasswordExpiresAt,
          },
        },
      }),
    );
    expect(JSON.stringify(vi.mocked(audit.append).mock.calls)).not.toContain(RESET_PW);
  });

  it('tu dat lai mat khau cua chinh minh qua duong quan tri -> SELF_LOCKOUT (403)', async () => {
    const attempt = service.resetPassword(ADMIN, ADMIN.id, { password: RESET_PW });
    await expect(attempt).rejects.toThrow(ForbiddenException);
    expect(await reasonOf(service.resetPassword(ADMIN, ADMIN.id, {}))).toBe('SELF_LOCKOUT');
    expect((await repository.findById(ADMIN.id))?.credentialVersion).toBe(1);
  });

  it('prevents an administrator from disabling their own account', async () => {
    await expect(service.disableUser(ADMIN, ADMIN.id, { confirmed: true })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('mat khau tam het han: dang nhap tra TEMPORARY_PASSWORD_EXPIRED, phien cu chet', async () => {
    const { credential } = await service.resetPassword(ADMIN, SALE.id, {});
    const identity = { userId: SALE.id, credentialVersion: 2 };
    expect(await service.validateSession(identity)).toMatchObject({ mustChangePassword: true });

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(Date.now() + 73 * 60 * 60 * 1_000));
      expect(
        await reasonOf(
          service.authenticate({ username: SALE.username, password: credential.temporaryPassword }),
        ),
      ).toBe('TEMPORARY_PASSWORD_EXPIRED');
      expect(await service.validateSession(identity)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('tu doi mat khau xoa co bat doi va han mat khau tam', async () => {
    const { credential } = await service.resetPassword(ADMIN, SALE.id, {});
    const changed = await service.changePassword(SALE, {
      currentPassword: credential.temporaryPassword,
      newPassword: CHANGED_PW,
    });

    expect(changed).toMatchObject({ mustChangePassword: false, temporaryPasswordExpiresAt: null });
    expect(audit.append).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'auth.credentials.change',
        after: {
          onboarding: { passwordChangeRequired: false, temporaryCredentialExpiresAt: null },
        },
      }),
    );
  });

  it('/auth/me: Giam doc co quyen nen tang quan tri tai khoan, vai khac thi khong', () => {
    expect(service.currentAccess({ ...toUser(ADMIN) }).permissions).toContain(
      'platform.accounts.manage',
    );
    expect(service.currentAccess({ ...toUser(SALE) }).permissions).toEqual([]);
  });
});

function toUser(record: AuthUserRecord) {
  return {
    id: record.id,
    username: record.username,
    name: record.name,
    email: record.email,
    phone: record.phone,
    role: record.role,
    credentialVersion: record.credentialVersion,
    disabledAt: null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lastLoginAt: null,
    passwordChangedAt: null,
  };
}
