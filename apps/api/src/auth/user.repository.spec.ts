import { describe, expect, it } from 'vitest';
import { grant, userRecord } from './__tests__/account-fixtures.js';
import { DuplicateUserError, InMemoryUserRepository } from './user.repository.js';

/**
 * KHO BO NHO phai noi DUNG nhu kho Prisma (`#395`) — cung hop dong, cung ket qua. Ban Prisma duoc
 * do tren Postgres that o `account-admin.int.spec.ts`; bai nay giu ban bo nho khong lech.
 */

const ADMIN = userRecord('a-1', 'giam.doc', 'ADMIN');
const ADMIN_2 = userRecord('a-2', 'giam.doc.2', 'ADMIN');
const MANAGER = userRecord('m-1', 'dieu.hanh', 'MANAGER');

describe('InMemoryUserRepository (#395)', () => {
  it('fixture cu (thieu truong #395) doc ra gia tri "nhu hom nay"', async () => {
    const repository = new InMemoryUserRepository([MANAGER]);
    expect(await repository.findById(MANAGER.id)).toMatchObject({
      permissionGrants: [],
      mustChangePassword: false,
      temporaryPasswordExpiresAt: null,
      jobTitle: null,
    });
  });

  it('tao kem quyen rieng + mat khau tam; moi lan doc tra kem quyen rieng', async () => {
    const repository = new InMemoryUserRepository();
    const expiresAt = new Date('2026-09-28T00:00:00.000Z');
    const created = await repository.create({
      username: 'moi',
      name: 'Mới',
      email: null,
      phone: null,
      passwordHash: 'h',
      role: 'MANAGER',
      jobTitle: 'Điều hành',
      temporaryPasswordExpiresAt: expiresAt,
      grants: [grant('x.b'), grant('x.a', 'DENY')],
      grantedBy: 'giam.doc',
    });
    expect(created).toMatchObject({
      mustChangePassword: true,
      temporaryPasswordExpiresAt: expiresAt,
      jobTitle: 'Điều hành',
      permissionGrants: [grant('x.a', 'DENY'), grant('x.b')],
    });
    expect((await repository.findByUsername('moi'))?.permissionGrants).toHaveLength(2);
    expect((await repository.list())[0]?.permissionGrants).toHaveLength(2);
    await expect(
      repository.create({
        username: 'moi',
        name: 'x',
        email: null,
        phone: null,
        passwordHash: 'h',
        role: 'SALE',
      }),
    ).rejects.toThrow(DuplicateUserError);
  });

  it('doi vai + bo quyen la MOT lan ghi, tra ca truoc va sau', async () => {
    const repository = new InMemoryUserRepository([
      ADMIN,
      { ...MANAGER, permissionGrants: [grant('x.a')] },
    ]);
    const result = await repository.setAccess(MANAGER.id, {
      role: 'ACCOUNTING',
      grants: [grant('x.b', 'DENY')],
      grantedBy: 'giam.doc',
    });
    expect(result).toMatchObject({
      status: 'UPDATED',
      before: { role: 'MANAGER', permissionGrants: [grant('x.a')] },
      after: { role: 'ACCOUNTING', permissionGrants: [grant('x.b', 'DENY')] },
    });
    expect(
      await repository.setAccess('khong-co', { role: 'SALE', grants: [], grantedBy: 'x' }),
    ).toEqual({
      status: 'NOT_FOUND',
    });
  });

  it('dat lai mat khau KHONG mo khoa; mat khau that xoa co bat doi', async () => {
    const repository = new InMemoryUserRepository([
      ADMIN,
      { ...MANAGER, disabledAt: new Date('2026-09-02T00:00:00.000Z') },
    ]);
    const expiresAt = new Date('2026-09-28T00:00:00.000Z');
    const reset = await repository.updatePassword(MANAGER.id, 'h2', expiresAt);
    expect(reset).toMatchObject({
      status: 'UPDATED',
      after: {
        disabledAt: new Date('2026-09-02T00:00:00.000Z'),
        credentialVersion: 2,
        mustChangePassword: true,
        temporaryPasswordExpiresAt: expiresAt,
      },
    });
    const changed = await repository.updatePassword(MANAGER.id, 'h3', null);
    expect(changed).toMatchObject({
      after: { mustChangePassword: false, temporaryPasswordExpiresAt: null, credentialVersion: 3 },
    });
  });

  it('khoa / mo khoa: khoa doi phien, mo khoa khong; lap lai la khong-lam-gi', async () => {
    const repository = new InMemoryUserRepository([ADMIN, MANAGER]);
    const disabled = await repository.disable(MANAGER.id);
    expect(disabled).toMatchObject({ status: 'UPDATED', after: { credentialVersion: 2 } });
    const again = await repository.disable(MANAGER.id);
    expect(again).toMatchObject({ status: 'UPDATED', after: { credentialVersion: 2 } });
    const enabled = await repository.enable(MANAGER.id);
    expect(enabled).toMatchObject({ after: { disabledAt: null, credentialVersion: 2 } });
  });

  it('khong bao gio de 0 Giam doc dang hoat dong — ke ca hai lan ghi cung luc', async () => {
    const lone = new InMemoryUserRepository([ADMIN, MANAGER]);
    expect(await lone.disable(ADMIN.id)).toEqual({ status: 'LAST_ACTIVE_ADMIN' });
    expect(await lone.setAccess(ADMIN.id, { role: 'SALE', grants: [], grantedBy: 'x' })).toEqual({
      status: 'LAST_ACTIVE_ADMIN',
    });
    // Giu vai Giam doc thi khong phai ha vai.
    expect(
      (await lone.setAccess(ADMIN.id, { role: 'ADMIN', grants: [], grantedBy: 'x' })).status,
    ).toBe('UPDATED');

    const pair = new InMemoryUserRepository([ADMIN, ADMIN_2]);
    const results = await Promise.all([
      pair.setAccess(ADMIN.id, { role: 'MANAGER', grants: [], grantedBy: ADMIN_2.username }),
      pair.disable(ADMIN_2.id),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['LAST_ACTIVE_ADMIN', 'UPDATED']);
    expect(await pair.countActiveAdmins()).toBe(1);
  });

  it('mot lan ghi loi khong lam ket hang doi phia sau', async () => {
    const repository = new InMemoryUserRepository([ADMIN, MANAGER]);
    const duplicate = repository.create({
      username: MANAGER.username,
      name: 'x',
      email: null,
      phone: null,
      passwordHash: 'h',
      role: 'SALE',
    });
    const after = repository.enable(MANAGER.id);
    await expect(duplicate).rejects.toThrow(DuplicateUserError);
    await expect(after).resolves.toMatchObject({ status: 'UPDATED' });
  });

  it('sua thong tin: trung so dien thoai → DuplicateUserError; chi truong duoc khai moi doi', async () => {
    const repository = new InMemoryUserRepository([
      { ...ADMIN, phone: '0900000001' },
      { ...MANAGER, email: 'dh@example.test' },
    ]);
    await expect(repository.updateProfile(MANAGER.id, { phone: '0900000001' })).rejects.toThrow(
      DuplicateUserError,
    );
    const updated = await repository.updateProfile(MANAGER.id, { jobTitle: 'Ca đêm' });
    expect(updated).toMatchObject({
      status: 'UPDATED',
      after: { jobTitle: 'Ca đêm', email: 'dh@example.test', name: MANAGER.name },
    });
  });
});
