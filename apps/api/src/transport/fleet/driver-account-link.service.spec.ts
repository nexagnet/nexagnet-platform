import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import type { UserRole } from '../../auth/auth.types.js';
import { InMemoryUserRepository, type AuthUserRecord } from '../../auth/user.repository.js';
import type { TelemetryService } from '../../observability/telemetry.service.js';
import { TransportDomainError } from '../transport.errors.js';
import type { Driver } from '../transport.types.js';
import { DriverAccountLinkService } from './driver-account-link.service.js';
import { InMemoryFleetRepository, type UpdateDriverInput } from './fleet.repository.js';

const NOW = new Date('2026-09-25T02:00:00.000Z');
const ACTOR = 'giam-doc';

function account(id: string, role: UserRole, disabled = false): AuthUserRecord {
  return {
    id,
    username: id,
    name: id,
    email: null,
    phone: null,
    passwordHash: 'x',
    role,
    disabledAt: disabled ? NOW : null,
    credentialVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    lastLoginAt: null,
    passwordChangedAt: NOW,
  };
}

interface Decision {
  readonly point: string;
  readonly outcome: string;
  readonly reason: string;
}

function recordingTelemetry(decisions: Decision[]): TelemetryService {
  return {
    step: async <T>(_name: string, run: () => Promise<T>) => run(),
    decision: (input: Decision) => {
      decisions.push({ point: input.point, outcome: input.outcome, reason: input.reason });
    },
  } as unknown as TelemetryService;
}

describe('DriverAccountLinkService (#395 §1.8)', () => {
  let fleet: InMemoryFleetRepository;
  let auditRepository: InMemoryAuditLogRepository;
  let decisions: Decision[];
  let service: DriverAccountLinkService;
  let driver: Driver;

  const users = new InMemoryUserRepository([
    account('lx-an', 'SALE'),
    account('lx-binh', 'SALE'),
    account('lx-khoa', 'SALE', true),
    account('ke-toan', 'ACCOUNTING'),
  ]);

  let sequence = 0;
  const newDriver = (fullName: string, status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') =>
    fleet.createDriver({
      fullName,
      phone: `0900${String((sequence += 1)).padStart(6, '0')}`,
      licenceClass: 'C',
      licenceExpiry: '2029-01-01',
      status,
    });

  const reasonOf = async (run: Promise<unknown>): Promise<string> => {
    const error = await run.then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(TransportDomainError);
    return (error as TransportDomainError).reason;
  };

  beforeEach(async () => {
    fleet = new InMemoryFleetRepository();
    auditRepository = new InMemoryAuditLogRepository();
    decisions = [];
    service = new DriverAccountLinkService(
      fleet,
      users,
      new AuditLogService(auditRepository),
      recordingTelemetry(decisions),
    );
    driver = await newDriver('Nguyen Van An');
  });

  it('noi tai khoan Lai xe dang hoat dong: ghi ho so + dau vet truoc/sau + quyet dinh', async () => {
    const linked = await service.setDriverAccount(driver.id, 'lx-an', ACTOR);

    expect(linked.authUserId).toBe('lx-an');
    expect((await fleet.findDriverByAuthUserId('lx-an'))?.id).toBe(driver.id);
    const [entry] = await auditRepository.list({});
    expect(entry).toMatchObject({
      actor: ACTOR,
      action: 'transport.driver.account_link',
      entityType: 'TransportDriver',
      entityId: driver.id,
    });
    expect((entry?.before as { authUserId: unknown }).authUserId).toBeNull();
    expect((entry?.after as { authUserId: unknown }).authUserId).toBe('lx-an');
    expect(decisions).toEqual([
      { point: 'driver.account_link', outcome: 'allowed', reason: 'ACCOUNT_LINKED' },
    ]);
  });

  it('go noi: ghi `account_unlink`, ke ca khi ho so da ngung hoat dong', async () => {
    await service.setDriverAccount(driver.id, 'lx-an', ACTOR);
    await fleet.updateDriver(driver.id, { status: 'INACTIVE' });

    const unlinked = await service.setDriverAccount(driver.id, null, ACTOR);

    expect(unlinked.authUserId).toBeNull();
    // Kho dau vet xep theo gio ghi — hai dong cung mot mili-giay khong co thu tu on dinh.
    const actions = (await auditRepository.list({})).map((entry) => entry.action).sort();
    expect(actions).toEqual(['transport.driver.account_link', 'transport.driver.account_unlink']);
  });

  it('goi trung trang thai: khong ghi, khong dau vet', async () => {
    await service.setDriverAccount(driver.id, 'lx-an', ACTOR);
    await service.setDriverAccount(driver.id, 'lx-an', ACTOR);
    const other = await newDriver('Tran Thi Mai');
    await service.setDriverAccount(other.id, null, ACTOR);

    expect(await auditRepository.list({})).toHaveLength(1);
    expect(decisions.map((decision) => decision.reason)).toEqual([
      'ACCOUNT_LINKED',
      'ACCOUNT_LINK_UNCHANGED',
      'ACCOUNT_LINK_UNCHANGED',
    ]);
  });

  it('doi sang tai khoan khac tren CUNG ho so duoc phep, va dau vet giu tai khoan cu', async () => {
    await service.setDriverAccount(driver.id, 'lx-an', ACTOR);
    await service.setDriverAccount(driver.id, 'lx-binh', ACTOR);

    const entries = await auditRepository.list({});
    const last = entries.find(
      (entry) => (entry.after as { authUserId?: unknown }).authUserId === 'lx-binh',
    );
    expect((last?.before as { authUserId: unknown }).authUserId).toBe('lx-an');
  });

  it('tai khoan khong ton tai: 404 `ACCOUNT_LINK_USER_NOT_FOUND`', async () => {
    const error = await service.setDriverAccount(driver.id, 'khong-co', ACTOR).catch((e) => e);
    expect(error).toMatchObject({ kind: 'NOT_FOUND', reason: 'ACCOUNT_LINK_USER_NOT_FOUND' });
    expect(decisions).toEqual([
      { point: 'driver.account_link', outcome: 'denied', reason: 'ACCOUNT_LINK_USER_NOT_FOUND' },
    ]);
  });

  it('tai khoan bi khoa: `ACCOUNT_LINK_USER_DISABLED`', async () => {
    expect(await reasonOf(service.setDriverAccount(driver.id, 'lx-khoa', ACTOR))).toBe(
      'ACCOUNT_LINK_USER_DISABLED',
    );
  });

  it('tai khoan khong phai vai Lai xe: `ACCOUNT_LINK_ROLE_MISMATCH`, cau tieng Viet co dau', async () => {
    const error = await service.setDriverAccount(driver.id, 'ke-toan', ACTOR).catch((e) => e);
    expect(error).toMatchObject({ kind: 'CONFLICT', reason: 'ACCOUNT_LINK_ROLE_MISMATCH' });
    expect((error as Error).message).toContain('Chỉ nối được tài khoản có vai Lái xe');
    expect((await fleet.findDriver(driver.id))?.authUserId).toBeNull();
  });

  it('tai khoan da noi ho so khac: `DRIVER_ACCOUNT_TAKEN`, ho so kia khong bi dung', async () => {
    const other = await newDriver('Tran Thi Mai');
    await service.setDriverAccount(other.id, 'lx-an', ACTOR);

    expect(await reasonOf(service.setDriverAccount(driver.id, 'lx-an', ACTOR))).toBe(
      'DRIVER_ACCOUNT_TAKEN',
    );
    expect((await fleet.findDriver(other.id))?.authUserId).toBe('lx-an');
    expect((await fleet.findDriver(driver.id))?.authUserId).toBeNull();
  });

  it('ho so lai xe da ngung: khong noi moi (`ACCOUNT_LINK_DRIVER_INACTIVE`)', async () => {
    const inactive = await newDriver('Le Van Nghi', 'INACTIVE');
    expect(await reasonOf(service.setDriverAccount(inactive.id, 'lx-an', ACTOR))).toBe(
      'ACCOUNT_LINK_DRIVER_INACTIVE',
    );
  });

  it('ho so khong ton tai: `DRIVER_NOT_FOUND`', async () => {
    expect(await reasonOf(service.setDriverAccount('khong-co', 'lx-an', ACTOR))).toBe(
      'DRIVER_NOT_FOUND',
    );
    expect(await reasonOf(service.setDriverAccount('khong-co', null, ACTOR))).toBe(
      'DRIVER_NOT_FOUND',
    );
    await expect(service.setDriverAccount('khong-co', 'lx-an', ACTOR)).rejects.toThrow(
      'Không tìm thấy hồ sơ lái xe này.',
    );
  });

  /**
   * HAI LAN NOI CUNG LUC: ca hai doc thay tai khoan con trong, lan sau chet o unique cua DB.
   * Hinh dang loi la dung hinh Prisma bao tren Postgres (ten TRUONG, khong phai ten index).
   */
  it('va cham unique cua DB (P2002 tren authUserId) doi thanh `DRIVER_ACCOUNT_TAKEN`', async () => {
    class RacingFleet extends InMemoryFleetRepository {
      override async updateDriver(id: string, patch: UpdateDriverInput) {
        if (patch.authUserId) {
          throw Object.assign(new Error('Unique constraint failed on the fields: (`authUserId`)'), {
            code: 'P2002',
            meta: { modelName: 'TransportDriver', target: ['authUserId'] },
          });
        }
        return super.updateDriver(id, patch);
      }
    }
    const racing = new RacingFleet();
    const target = await racing.createDriver({
      fullName: 'Pham Van Dua',
      phone: '0900000999',
      licenceClass: 'C',
      licenceExpiry: '2029-01-01',
    });
    const racingService = new DriverAccountLinkService(
      racing,
      users,
      new AuditLogService(auditRepository),
    );

    expect(await reasonOf(racingService.setDriverAccount(target.id, 'lx-an', ACTOR))).toBe(
      'DRIVER_ACCOUNT_TAKEN',
    );
    expect(await auditRepository.list({})).toHaveLength(0);
  });
});
