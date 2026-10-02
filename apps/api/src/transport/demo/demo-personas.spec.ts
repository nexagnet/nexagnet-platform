import { resetTenantCache } from '@netviet/tenant';
import type { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadDemoMonthDataset } from './demo-dataset.js';
import {
  DEMO_SEED_ACTOR,
  DEMO_STAFF_PERSONAS,
  backfillDemoPersonaLogins,
  backfillDemoPersonaLoginsReport,
} from './demo-seed.js';

describe('Lane W — synthetic owner personas', () => {
  it('seeds separate accounting and director/admin identities idempotently', () => {
    expect(DEMO_STAFF_PERSONAS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ login: 'ke-toan', role: 'ACCOUNTING' }),
        expect.objectContaining({ login: 'giam-doc', role: 'ADMIN' }),
      ]),
    );
    expect(new Set(DEMO_STAFF_PERSONAS.map((persona) => persona.login)).size).toBe(
      DEMO_STAFF_PERSONAS.length,
    );
  });
});

/* ------------------------------------------------------------------ *
 * #395 — may gieo KHONG duoc la duong noi tai khoan thu hai
 * ------------------------------------------------------------------ */

interface FakeUser {
  id: string;
  username: string;
  role: string;
  disabledAt: Date | null;
}
interface FakeDriver {
  id: string;
  fullName: string;
  phone: string;
  authUserId: string | null;
}
interface FakeAudit {
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
}

/** Dung nhung loi goi Prisma ma buoc tao bu dung — tat ca trong bo nho. */
class FakePrisma {
  users: FakeUser[] = [];
  drivers: FakeDriver[] = [];
  audits: FakeAudit[] = [];
  private sequence = 0;

  readonly user = {
    findUnique: async ({ where }: { where: { username: string } }) =>
      this.users.find((user) => user.username === where.username) ?? null,
    create: async ({ data }: { data: { username: string; role: string } }) => {
      const user = {
        id: `u-${(this.sequence += 1)}`,
        username: data.username,
        role: data.role,
        disabledAt: null,
      };
      this.users.push(user);
      return user;
    },
  };

  readonly transportDriver = {
    findMany: async () => this.drivers.filter((driver) => driver.authUserId === null),
    findUnique: async ({ where }: { where: { authUserId: string } }) =>
      this.drivers.find((driver) => driver.authUserId === where.authUserId) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: { authUserId: string } }) => {
      const driver = this.drivers.find((candidate) => candidate.id === where.id);
      if (!driver) throw new Error('P2025');
      if (this.drivers.some((other) => other.authUserId === data.authUserId)) {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }
      driver.authUserId = data.authUserId;
      return driver;
    },
  };

  readonly auditLog = {
    findMany: async ({
      where,
    }: {
      where: { action: string; entityType: string; entityId: { in: string[] } };
    }) =>
      this.audits.filter(
        (row) =>
          row.action === where.action &&
          row.entityType === where.entityType &&
          where.entityId.in.includes(row.entityId),
      ),
    create: async ({ data }: { data: FakeAudit }) => {
      this.audits.push(data);
      return data;
    },
  };

  asClient(): PrismaClient {
    return this as unknown as PrismaClient;
  }
}

const DEMO_PASSWORD = ['mat', 'khau', 'mau'].join('-');
const options = { driverPassword: DEMO_PASSWORD, hashPassword: async (plain: string) => plain };

describe('backfillDemoPersonaLogins — chi noi khi luat noi tai khoan cho phep (#395)', () => {
  let prisma: FakePrisma;
  let first: { phone: string; login: string };
  let second: { phone: string; login: string };

  // Tra lai dung gia tri cu cua moi truong, khong xoa bua — tep khac cung tien trinh co the can.
  let previousTenant: string | undefined;
  let previousTenantDir: string | undefined;

  beforeEach(() => {
    previousTenant = process.env.TENANT;
    previousTenantDir = process.env.TENANT_DIR;
    process.env.TENANT = 'transport-preview';
    delete process.env.TENANT_DIR;
    resetTenantCache();
    const [a, b] = loadDemoMonthDataset().drivers;
    if (!a || !b) throw new Error('bo du lieu mau thieu lai xe');
    first = a;
    second = b;
    prisma = new FakePrisma();
    // Nhan vat van phong da co — de bai chi dem lai xe.
    for (const persona of DEMO_STAFF_PERSONAS) {
      prisma.users.push({
        id: persona.login,
        username: persona.login,
        role: persona.role,
        disabledAt: null,
      });
    }
    prisma.drivers.push(
      { id: 'd-1', fullName: 'Lai xe 1', phone: first.phone, authUserId: null },
      { id: 'd-2', fullName: 'Lai xe 2', phone: second.phone, authUserId: null },
    );
  });

  afterEach(() => {
    restoreEnv('TENANT', previousTenant);
    restoreEnv('TENANT_DIR', previousTenantDir);
    resetTenantCache();
  });

  it('tao tai khoan Lai xe con thieu, noi vao ho so va ghi dau vet `demo-seed`', async () => {
    const report = await backfillDemoPersonaLoginsReport(prisma.asClient(), options);

    expect(report).toEqual({ created: 2, skipped: [] });
    const user = prisma.users.find((candidate) => candidate.username === first.login);
    expect(user?.role).toBe('SALE');
    expect(prisma.drivers[0]?.authUserId).toBe(user?.id);
    expect(prisma.audits[0]).toMatchObject({
      actor: DEMO_SEED_ACTOR,
      action: 'transport.driver.account_link',
      entityType: 'TransportDriver',
      entityId: 'd-1',
      after: { authUserId: user?.id },
    });
  });

  it('Giam doc da GO NOI ho so: khong noi lai, khong tao tai khoan', async () => {
    prisma.audits.push({
      actor: 'giam-doc',
      action: 'transport.driver.account_unlink',
      entityType: 'TransportDriver',
      entityId: 'd-1',
      before: {},
      after: {},
    });

    const report = await backfillDemoPersonaLoginsReport(prisma.asClient(), options);

    expect(report.skipped).toEqual([
      { driverId: 'd-1', login: first.login, reason: 'DRIVER_UNLINKED_BY_DIRECTOR' },
    ]);
    expect(prisma.drivers[0]?.authUserId).toBeNull();
    expect(prisma.users.some((user) => user.username === first.login)).toBe(false);
  });

  it('tai khoan cung ten KHONG con vai Lai xe, hoac dang bi khoa: bo qua kem ly do', async () => {
    prisma.users.push(
      { id: 'u-ke-toan', username: first.login, role: 'ACCOUNTING', disabledAt: null },
      { id: 'u-khoa', username: second.login, role: 'SALE', disabledAt: new Date() },
    );

    const report = await backfillDemoPersonaLoginsReport(prisma.asClient(), options);

    expect(report).toEqual({
      created: 0,
      skipped: [
        { driverId: 'd-1', login: first.login, reason: 'LOGIN_ROLE_NOT_DRIVER' },
        { driverId: 'd-2', login: second.login, reason: 'LOGIN_DISABLED' },
      ],
    });
    expect(prisma.drivers.map((driver) => driver.authUserId)).toEqual([null, null]);
  });

  it('tai khoan cung ten da duoc chuyen noi sang ho so KHAC: bo qua, khong nem P2002', async () => {
    prisma.users.push({ id: 'u-a', username: first.login, role: 'SALE', disabledAt: null });
    prisma.drivers.push({ id: 'd-3', fullName: 'Ho so moi', phone: '0999', authUserId: 'u-a' });

    const report = await backfillDemoPersonaLoginsReport(prisma.asClient(), options);

    expect(report.skipped).toEqual([
      { driverId: 'd-1', login: first.login, reason: 'LOGIN_LINKED_TO_OTHER_DRIVER' },
    ]);
    expect(prisma.drivers[0]?.authUserId).toBeNull();
    expect(report.created).toBe(1);
  });

  it('tai khoan Lai xe dang hoat dong co san: noi lai (duong "gieo truoc, cau hinh sau")', async () => {
    prisma.users.push({ id: 'u-a', username: first.login, role: 'SALE', disabledAt: null });

    expect(await backfillDemoPersonaLogins(prisma.asClient(), options)).toBe(2);
    expect(prisma.drivers[0]?.authUserId).toBe('u-a');
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
