import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogService, type AppendAuditLogCommand } from '../audit/audit-log.service.js';
import { PrismaAuditLogRepository } from '../audit/prisma-audit-log.repository.js';
import { PrismaService } from '../config/prisma.service.js';
import { transportPermissionDomain } from '../transport/permissions/transport-permission-domain.js';
import { PermissionDomainRegistry } from './access/permission-domain.registry.js';
import { AuthService } from './auth.service.js';
import type { UserRole } from './auth.types.js';
import { Argon2PasswordService } from './password.service.js';
import { PrismaUserRepository } from './prisma-user.repository.js';
import { reasonOf } from './__tests__/account-fixtures.js';

/**
 * QUAN TRI TAI KHOAN tren POSTGRES THAT (`#395`).
 *
 * Nhung dieu kho bo nho khong chung minh duoc: khoa `SELECT … FOR UPDATE` giu "luon con mot Giam
 * doc" khi hai giao dich ha vai nhau CUNG LUC; quyen rieng thay tron trong mot giao dich; `CHECK`
 * mat khau tam co han; `ON DELETE CASCADE` cua quyen rieng; va dat lai mat khau KHONG con lang le mo
 * khoa (loi cua ban Prisma truoc #395).
 *
 * DAY LA TEP DUY NHAT ghi `User` trong bo IT chay song song. Moi fixture mang tien to
 * `it395acct.` va duoc XOA CUNG o `afterAll` (ca dong kiem toan cua chung). Phep dem Giam doc dang
 * hoat dong la TOAN CUC theo ban chat cua quy tac — nen bai dua ra dieu kien truoc (`=== 2`) va DO
 * TO neu CSDL co Giam doc khac, thay vi xanh gia.
 */

const PREFIX = 'it395acct.';
/** Mat khau fixture SINH MOI moi lan chay — khong mot chuoi mat khau nao nam trong ma nguon. */
const FIXTURE_PW = `it-${randomBytes(12).toString('hex')}`;
const NEW_PW = `it-new-${randomBytes(12).toString('hex')}`;

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'quan tri tai khoan tren Postgres THAT (#395)',
  // Moi bai bam Argon2id nhieu lan va dua khoa `FOR UPDATE`: mac dinh 5 s cua vitest se lam bai do
  // chap chon khi buoc integration chay song song tren may CI dang tai (cung muc voi hai tep #395).
  { timeout: 60_000 },
  () => {
    const prisma = new PrismaService();
    const users = new PrismaUserRepository(prisma);
    const passwords = new Argon2PasswordService();
    const audit = new AuditLogService(new PrismaAuditLogRepository(prisma));
    const registry = new PermissionDomainRegistry();
    registry.register(transportPermissionDomain());
    const service = new AuthService(users, passwords, audit, registry);
    const director = { id: `${PREFIX}actor`, username: `${PREFIX}giam.doc` };

    async function cleanup(): Promise<void> {
      const fixtures = await prisma.user.findMany({
        where: { username: { startsWith: PREFIX } },
        select: { id: true },
      });
      const ids = fixtures.map((row) => row.id);
      await prisma.auditLog.deleteMany({
        where: {
          OR: [{ entityType: 'User', entityId: { in: ids } }, { actor: { startsWith: PREFIX } }],
        },
      });
      // Quyen rieng di theo (`ON DELETE CASCADE`).
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }

    async function fixture(name: string, role: UserRole, patch: { phone?: string } = {}) {
      return users.create({
        username: `${PREFIX}${name}`,
        name: `IT ${name}`,
        email: null,
        phone: patch.phone ?? null,
        passwordHash: await passwords.hash(FIXTURE_PW),
        role,
      });
    }

    beforeAll(async () => {
      await cleanup();
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it('tao tai khoan → dang nhap bang mat khau tam → bat buoc doi → doi xong la tai khoan thuong', async () => {
      const created = await service.createUser(director, {
        username: `${PREFIX}dieu.hanh`,
        name: 'IT Điều hành',
        role: 'MANAGER',
        grants: [
          { permission: 'transport.vehicle.read', effect: 'ALLOW' },
          { permission: 'transport.vehicle.manage', effect: 'ALLOW' },
        ],
      });
      expect(created.mustChangePassword).toBe(true);

      const loggedIn = await service.authenticate({
        username: created.username,
        password: created.credential.temporaryPassword,
      });
      expect(loggedIn).toMatchObject({
        mustChangePassword: true,
        permissionGrants: [
          { permission: 'transport.vehicle.manage', effect: 'ALLOW' },
          { permission: 'transport.vehicle.read', effect: 'ALLOW' },
        ],
      });
      expect(service.currentAccess(loggedIn).permissions).toEqual([
        'transport.vehicle.read',
        'transport.vehicle.manage',
      ]);

      const changed = await service.changePassword(loggedIn, {
        currentPassword: created.credential.temporaryPassword,
        newPassword: NEW_PW,
      });
      expect(changed).toMatchObject({
        mustChangePassword: false,
        temporaryPasswordExpiresAt: null,
      });
      const row = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
      expect(row).toMatchObject({ mustChangePassword: false, temporaryPasswordExpiresAt: null });
      await expect(
        service.authenticate({ username: created.username, password: NEW_PW }),
      ).resolves.toMatchObject({ mustChangePassword: false });

      const history = await service.history(created.id);
      expect(history.map((entry) => entry.action)).toEqual(
        expect.arrayContaining(['auth.user.create', 'auth.login', 'auth.credentials.change']),
      );
      const createdRow = history.find((entry) => entry.action === 'auth.user.create');
      expect(createdRow?.after).toMatchObject({
        role: 'MANAGER',
        onboarding: { passwordChangeRequired: true },
      });
    });

    it('mat khau tam qua han → TEMPORARY_PASSWORD_EXPIRED o dang nhap, phien cu chet', async () => {
      const created = await service.createUser(director, {
        username: `${PREFIX}het.han`,
        name: 'IT Hết hạn',
        role: 'ACCOUNTING',
      });
      await prisma.user.update({
        where: { id: created.id },
        data: { temporaryPasswordExpiresAt: new Date(Date.now() - 60_000) },
      });
      expect(
        await reasonOf(
          service.authenticate({
            username: created.username,
            password: created.credential.temporaryPassword,
          }),
        ),
      ).toBe('TEMPORARY_PASSWORD_EXPIRED');
      expect(
        await service.validateSession({
          userId: created.id,
          credentialVersion: created.credentialVersion,
        }),
      ).toBeNull();
      // CHECK cua DB: bat doi mat khau ma khong co han thi khong ghi duoc.
      await expect(
        prisma.user.update({
          where: { id: created.id },
          data: { temporaryPasswordExpiresAt: null },
        }),
      ).rejects.toThrow(/User_temporary_password_has_expiry/);
    });

    it('quyen rieng thay tron trong mot giao dich, ghi nguoi cap; xoa tai khoan thi quyen di theo', async () => {
      const manager = await fixture('quyen.rieng', 'MANAGER');
      await service.setAccess(director, manager.id, {
        role: 'MANAGER',
        grants: [
          { permission: 'transport.order.read', effect: 'ALLOW' },
          { permission: 'transport.run.read', effect: 'ALLOW' },
        ],
      });
      await service.setAccess(director, manager.id, {
        role: 'MANAGER',
        grants: [{ permission: 'transport.vehicle.read', effect: 'ALLOW' }],
      });
      const grants = await prisma.userPermissionGrant.findMany({ where: { userId: manager.id } });
      expect(grants.map((row) => [row.permission, row.effect, row.grantedBy])).toEqual([
        ['transport.vehicle.read', 'ALLOW', director.username],
      ]);
      expect((await users.findById(manager.id))?.permissionGrants).toEqual([
        { permission: 'transport.vehicle.read', effect: 'ALLOW' },
      ]);

      // Doi vai qua duong cu xoa moi quyen rieng.
      await service.assignRole(director, manager.id, { role: 'ACCOUNTING' });
      expect(await prisma.userPermissionGrant.count({ where: { userId: manager.id } })).toBe(0);

      await service.setAccess(director, manager.id, {
        role: 'ACCOUNTING',
        grants: [{ permission: 'transport.vehicle.read', effect: 'DENY' }],
      });
      expect(await prisma.userPermissionGrant.count({ where: { userId: manager.id } })).toBe(1);
      await prisma.user.delete({ where: { id: manager.id } });
      expect(await prisma.userPermissionGrant.count({ where: { userId: manager.id } })).toBe(0);
    });

    it('dat lai mat khau KHONG mo khoa; mo khoa roi dat lai moi khoi phuc duoc', async () => {
      const accountant = await fixture('bi.khoa', 'ACCOUNTING');
      await service.disableUser(director, accountant.id, { confirmed: true, reason: 'IT' });
      const reset = await service.resetPassword(director, accountant.id, {});
      const row = await prisma.user.findUniqueOrThrow({ where: { id: accountant.id } });
      expect(row.disabledAt).not.toBeNull();
      expect(row.mustChangePassword).toBe(true);
      await expect(
        service.authenticate({
          username: accountant.username,
          password: reset.credential.temporaryPassword,
        }),
      ).rejects.toThrow('Tên đăng nhập hoặc mật khẩu không đúng');

      await service.enableUser(director, accountant.id, { confirmed: true });
      await expect(
        service.authenticate({
          username: accountant.username,
          password: reset.credential.temporaryPassword,
        }),
      ).resolves.toMatchObject({ mustChangePassword: true });
    });

    it('danh sach loc tren Postgres; trung so dien thoai → ACCOUNT_IDENTITY_TAKEN', async () => {
      const one = await fixture('loc.mot', 'SALE', { phone: '0399395001' });
      const two = await fixture('loc.hai', 'SALE');
      await service.resetPassword(director, two.id, {});

      const pending = await service.listUsers({ q: `${PREFIX}loc`, status: 'pending' });
      expect(pending.map((user) => user.id)).toEqual([two.id]);
      const active = await service.listUsers({ q: `${PREFIX}LOC`, status: 'active', role: 'SALE' });
      expect(active.map((user) => user.id)).toEqual([one.id]);

      expect(await reasonOf(service.updateProfile(director, two.id, { phone: '0399395001' }))).toBe(
        'ACCOUNT_IDENTITY_TAKEN',
      );
    });

    /**
     * DAU VET CUNG GIAO DICH (`#395`): truoc day quyen duoc ghi (mot giao dich) roi dau vet moi
     * `append` (giao dich khac). So kiem toan hong o giua = quyen nhay cam DA CO hieu luc ma khong
     * dong nao noi ai cap; va lan thu lai thay "da co" nen dong `escalate` mat vinh vien.
     */
    it('dau vet hong thi quyen KHONG doi; thu lai van ghi du dong doi quyen VA dong leo thang', async () => {
      const target = await fixture('dau.vet', 'MANAGER');
      let failNext = true;
      class FlakyAudit extends AuditLogService {
        override entryFor(command: AppendAuditLogCommand) {
          if (failNext && command.action === 'auth.user.access.escalate') {
            failNext = false;
            throw new Error('so kiem toan tam hong');
          }
          return super.entryFor(command);
        }
      }
      const flaky = new AuthService(
        users,
        passwords,
        new FlakyAudit(new PrismaAuditLogRepository(prisma)),
        registry,
      );
      const access = {
        role: 'MANAGER' as const,
        grants: [{ permission: 'transport.trip.cancel', effect: 'ALLOW' as const }],
        confirmEscalation: true,
      };
      const actionsOf = async (): Promise<string[]> =>
        (
          await prisma.auditLog.findMany({
            where: { entityType: 'User', entityId: target.id },
            select: { action: true },
          })
        )
          .map((row) => row.action)
          .sort();

      await expect(flaky.setAccess(director, target.id, access)).rejects.toThrow(
        'so kiem toan tam hong',
      );
      expect((await users.findById(target.id))?.permissionGrants).toEqual([]);
      expect(await actionsOf()).toEqual([]);

      await flaky.setAccess(director, target.id, access);
      expect((await users.findById(target.id))?.permissionGrants).toEqual(access.grants);
      expect(await actionsOf()).toEqual(['auth.user.access.change', 'auth.user.access.escalate']);
    });

    it('hai Giam doc ha vai / khoa NHAU cung luc → luon con dung mot Giam doc dang hoat dong', async () => {
      const first = await fixture('gd.mot', 'ADMIN');
      const second = await fixture('gd.hai', 'ADMIN');
      const activeAdmins = (): Promise<number> =>
        prisma.user.count({ where: { role: 'ADMIN', disabledAt: null } });
      const restore = async (): Promise<void> => {
        await prisma.user.updateMany({
          where: { id: { in: [first.id, second.id] } },
          data: { role: 'ADMIN', disabledAt: null },
        });
      };

      // DIEU KIEN TRUOC — DO TO thay vi xanh gia: quy tac nay dem Giam doc tren CA CSDL.
      const precondition = await activeAdmins();
      if (precondition !== 2) {
        throw new Error(
          `CSDL co ${precondition} Giam doc dang hoat dong (can dung 2 — hai fixture cua bai nay). ` +
            'Bai "Giam doc cuoi cung" can mot CSDL khong co tai khoan ADMIN nao khac.',
        );
      }

      const firstActor = { id: first.id, username: first.username };
      const secondActor = { id: second.id, username: second.username };
      const races: readonly (() => Promise<unknown>[])[] = [
        () => [
          service.setAccess(firstActor, second.id, { role: 'MANAGER', grants: [] }),
          service.setAccess(secondActor, first.id, { role: 'MANAGER', grants: [] }),
        ],
        () => [
          service.disableUser(firstActor, second.id, { confirmed: true }),
          service.disableUser(secondActor, first.id, { confirmed: true }),
        ],
        () => [
          service.setAccess(firstActor, second.id, { role: 'ACCOUNTING', grants: [] }),
          service.disableUser(secondActor, first.id, { confirmed: true }),
        ],
      ];
      for (const race of races) {
        for (let round = 0; round < 3; round += 1) {
          await restore();
          const results = await Promise.allSettled(race());
          const reasons = await Promise.all(
            results.map((result) =>
              result.status === 'fulfilled' ? 'OK' : reasonOf(Promise.reject(result.reason)),
            ),
          );
          expect(reasons.sort()).toEqual(['LAST_ACTIVE_ADMIN', 'OK']);
          expect(await activeAdmins()).toBe(1);
        }
      }
      await restore();
    });
  },
);
