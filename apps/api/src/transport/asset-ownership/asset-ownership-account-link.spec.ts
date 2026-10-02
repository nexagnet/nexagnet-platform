import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import type { UserRole } from '../../auth/auth.types.js';
import { InMemoryUserRepository, type AuthUserRecord } from '../../auth/user.repository.js';
import type { TelemetryService } from '../../observability/telemetry.service.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import { InMemoryAssetOwnershipRepository } from './asset-ownership.repository.js';
import { AssetOwnershipService } from './asset-ownership.service.js';
import { FleetVehicleOwnershipAdapter } from './fleet-vehicle-ownership.adapter.js';

/**
 * `#395` — noi tai khoan voi ho so BEN GOP VON: tai khoan phai CO THAT va DANG HOAT DONG.
 *
 * Truoc `#395` duong nay ghi bat ky chuoi nao vao `TransportAssetStakeholder.authUserId`: mot ma
 * go nham thanh mot lien ket treo, va mot tai khoan da khoa van "co" xe.
 */

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

describe('AssetOwnershipService.setStakeholderAccount — kiem tai khoan (#395)', () => {
  let audit: InMemoryAuditLogRepository;
  let decisions: string[];
  let details: Record<string, unknown>[];
  let service: AssetOwnershipService;

  const build = (repository: InMemoryAssetOwnershipRepository): AssetOwnershipService => {
    const telemetry = {
      step: async <T>(_name: string, run: () => Promise<T>) => run(),
      decision: (input: {
        point: string;
        outcome: string;
        reason: string;
        detail: Record<string, unknown>;
      }) => {
        decisions.push(`${input.point}:${input.outcome}:${input.reason}`);
        details.push(input.detail);
      },
    } as unknown as TelemetryService;
    return new AssetOwnershipService(
      repository,
      new FleetVehicleOwnershipAdapter(new InMemoryFleetRepository()),
      new AuditLogService(audit),
      telemetry,
      new InMemoryUserRepository([
        account('chu-xe', 'MANAGER'),
        account('chu-xe-moi', 'MANAGER'),
        account('ke-toan-gop-von', 'ACCOUNTING'),
        account('da-khoa', 'MANAGER', true),
      ]),
    );
  };

  beforeEach(() => {
    audit = new InMemoryAuditLogRepository();
    decisions = [];
    details = [];
    service = build(new InMemoryAssetOwnershipRepository());
  });

  const holder = () => service.createStakeholder({ kind: 'PERSON', displayName: 'Chủ xe' }, ACTOR);

  it('noi tai khoan dang hoat dong (moi vai), go noi duoc; moi lan deu co dau vet', async () => {
    const one = await holder();
    expect((await service.setStakeholderAccount(one.id, 'chu-xe', ACTOR)).hasAccount).toBe(true);
    expect((await service.setStakeholderAccount(one.id, null, ACTOR)).hasAccount).toBe(false);
    const two = await holder();
    await service.setStakeholderAccount(two.id, 'ke-toan-gop-von', ACTOR);

    // Thu tu cua kho dau vet khong on dinh trong cung mot mili-giay — dem, khong xep.
    const actions = (await audit.list({})).map((entry) => entry.action);
    expect(actions.filter((action) => action.includes('account_')).sort()).toEqual([
      'transport.asset_stakeholder.account_link',
      'transport.asset_stakeholder.account_link',
      'transport.asset_stakeholder.account_unlink',
    ]);
    expect(decisions).toEqual([
      'stakeholder.account_link:allowed:ACCOUNT_LINKED',
      'stakeholder.account_link:allowed:ACCOUNT_UNLINKED',
      'stakeholder.account_link:allowed:ACCOUNT_LINKED',
    ]);
  });

  it('ma tai khoan khong ton tai: 404 `ACCOUNT_LINK_USER_NOT_FOUND`, khong ghi', async () => {
    const one = await holder();
    const error = await service.setStakeholderAccount(one.id, 'go-nham', ACTOR).catch((e) => e);
    expect(error).toBeInstanceOf(TransportDomainError);
    expect(error).toMatchObject({ kind: 'NOT_FOUND', reason: 'ACCOUNT_LINK_USER_NOT_FOUND' });
    expect((error as Error).message).toBe('Không tìm thấy tài khoản cần nối.');
    expect((await service.getStakeholder(one.id)).hasAccount).toBe(false);
    expect(decisions).toEqual(['stakeholder.account_link:denied:ACCOUNT_LINK_USER_NOT_FOUND']);
  });

  it('tai khoan da khoa: 409 `ACCOUNT_LINK_USER_DISABLED`', async () => {
    const one = await holder();
    await expect(service.setStakeholderAccount(one.id, 'da-khoa', ACTOR)).rejects.toMatchObject({
      kind: 'CONFLICT',
      reason: 'ACCOUNT_LINK_USER_DISABLED',
    });
  });

  it('tai khoan da noi ho so khac van la `ASSET_STAKEHOLDER_ACCOUNT_TAKEN`, cau co dau', async () => {
    const one = await holder();
    const two = await holder();
    await service.setStakeholderAccount(one.id, 'chu-xe', ACTOR);
    const error = await service.setStakeholderAccount(two.id, 'chu-xe', ACTOR).catch((e) => e);
    expect(error).toMatchObject({ kind: 'CONFLICT', reason: 'ASSET_STAKEHOLDER_ACCOUNT_TAKEN' });
    expect((error as Error).message).toContain('bên góp vốn khác');
  });

  /**
   * Doi tai khoan X -> Y: khung nhin chi co `hasAccount` (true -> true). Truoc #395 dong kiem toan
   * giong het mot lan khong-doi-gi — khong ai tra loi duoc "ai duoc cap, ai bi mat" pham vi xe.
   */
  it('doi tai khoan dang noi sang tai khoan khac: dau vet ghi RO ai mat, ai duoc', async () => {
    const one = await holder();
    await service.setStakeholderAccount(one.id, 'chu-xe', ACTOR);
    await service.setStakeholderAccount(one.id, 'chu-xe-moi', ACTOR);
    await service.setStakeholderAccount(one.id, null, ACTOR);

    const rows = (await audit.list({ entityId: one.id })).filter((row) =>
      row.action.includes('account_'),
    );
    const byTransition = rows.map((row) => [
      row.action,
      (row.before as { authUserId?: unknown } | null)?.authUserId,
      (row.after as { authUserId?: unknown } | null)?.authUserId,
    ]);
    expect(byTransition).toEqual(
      expect.arrayContaining([
        ['transport.asset_stakeholder.account_link', null, 'chu-xe'],
        ['transport.asset_stakeholder.account_link', 'chu-xe', 'chu-xe-moi'],
        ['transport.asset_stakeholder.account_unlink', 'chu-xe-moi', null],
      ]),
    );
    expect(byTransition).toHaveLength(3);
    expect(details).toContainEqual({
      stakeholderId: one.id,
      authUserId: 'chu-xe-moi',
      previousAuthUserId: 'chu-xe',
    });
  });

  it('noi lai dung tai khoan dang noi: `ACCOUNT_LINK_UNCHANGED`, khong dong dau vet', async () => {
    const one = await holder();
    await service.setStakeholderAccount(one.id, 'chu-xe', ACTOR);
    await service.setStakeholderAccount(one.id, 'chu-xe', ACTOR);
    const linkRows = (await audit.list({ entityId: one.id })).filter((row) =>
      row.action.includes('account_'),
    );
    expect(linkRows).toHaveLength(1);
    expect(decisions).toEqual([
      'stakeholder.account_link:allowed:ACCOUNT_LINKED',
      'stakeholder.account_link:allowed:ACCOUNT_LINK_UNCHANGED',
    ]);
  });

  /**
   * HAI LAN NOI CUNG LUC cung mot tai khoan vao hai ho so: ca hai qua phep kiem (doc NGOAI khoa),
   * lan sau chet o unique cua DB. Ban gia: phep kiem luon thay tai khoan con trong.
   */
  it('va cham unique cua DB (P2002 tren authUserId) doi thanh `ASSET_STAKEHOLDER_ACCOUNT_TAKEN`', async () => {
    class RacingRepository extends InMemoryAssetOwnershipRepository {
      override async findStakeholderIdHoldingAccount(): Promise<string | null> {
        return null;
      }
    }
    const racing = build(new RacingRepository());
    const one = await racing.createStakeholder({ kind: 'PERSON', displayName: 'Chủ xe A' }, ACTOR);
    const two = await racing.createStakeholder({ kind: 'PERSON', displayName: 'Chủ xe B' }, ACTOR);
    await racing.setStakeholderAccount(one.id, 'chu-xe', ACTOR);

    const error = await racing.setStakeholderAccount(two.id, 'chu-xe', ACTOR).catch((e) => e);
    expect(error).toBeInstanceOf(TransportDomainError);
    expect(error).toMatchObject({ kind: 'CONFLICT', reason: 'ASSET_STAKEHOLDER_ACCOUNT_TAKEN' });
    expect(decisions.at(-1)).toBe(
      'stakeholder.account_link:denied:ASSET_STAKEHOLDER_ACCOUNT_TAKEN',
    );
    expect(details.at(-1)).toMatchObject({ stakeholderId: two.id, race: true });
    expect((await racing.getStakeholder(two.id)).hasAccount).toBe(false);
    expect(
      await audit.list({ entityId: two.id, action: 'transport.asset_stakeholder.account_link' }),
    ).toEqual([]);
  });
});
