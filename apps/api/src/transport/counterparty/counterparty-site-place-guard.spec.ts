import { describe, expect, it, vi } from 'vitest';
import {
  CounterpartySitePlaceGuardHub,
  type CounterpartySitePlaceGuard,
  type LegacySiteChange,
} from './counterparty-site-place-guard.js';
import { InMemoryGeofenceRepository } from '../proof/geofence.repository.js';
import { GeofenceSitePlaceGuard } from '../places/admin/place-registrations.js';
import { TransportDomainError } from '../transport.errors.js';
import { InMemoryCounterpartyRepository } from './counterparty.repository.js';
import { InMemoryCounterpartySiteRepository } from './site.repository.js';
import { CounterpartySiteService } from './site.service.js';

const change = (patch: Partial<LegacySiteChange>): LegacySiteChange => ({
  siteId: 'site-1',
  changesName: false,
  changesStatus: false,
  ...patch,
});

const blocking = (): CounterpartySitePlaceGuard & { calls: LegacySiteChange[] } => {
  const calls: LegacySiteChange[] = [];
  return {
    calls,
    checkLegacySiteChange: vi.fn(async (input: LegacySiteChange) => {
      calls.push(input);
      return { allowed: false as const, reason: 'COUNTERPARTY_SITE_MANAGED_AS_PLACE' as const };
    }),
  };
};

describe('cong chan sua dia diem qua duong cu (#395)', () => {
  it('chua ai dang ky: khong chan gi — dung nhu truoc #395', async () => {
    const hub = new CounterpartySitePlaceGuardHub();
    expect(await hub.checkLegacySiteChange(change({ changesName: true }))).toEqual({
      allowed: true,
    });
  });

  it('da dang ky: doi ten hoac trang thai thi hoi cong that', async () => {
    const hub = new CounterpartySitePlaceGuardHub();
    const guard = blocking();
    hub.register(guard);
    expect(await hub.checkLegacySiteChange(change({ changesStatus: true }))).toEqual({
      allowed: false,
      reason: 'COUNTERPARTY_SITE_MANAGED_AS_PLACE',
    });
    expect(guard.calls).toEqual([change({ changesStatus: true })]);
  });

  it('sua dia chi / ghi chu khong phai danh tinh — khong hoi cong', async () => {
    const hub = new CounterpartySitePlaceGuardHub();
    const guard = blocking();
    hub.register(guard);
    expect(await hub.checkLegacySiteChange(change({}))).toEqual({ allowed: true });
    expect(guard.calls).toEqual([]);
  });

  it('dang ky hai cong thi NEM', () => {
    const hub = new CounterpartySitePlaceGuardHub();
    hub.register(blocking());
    expect(() => hub.register(blocking())).toThrow(/Da co mot cong dia diem/);
  });
});

/**
 * `#395` S3 — route cu `PATCH /transport/counterparties/:id/sites/:siteId` qua
 * `CounterpartySiteService.update`: doi TEN hoac TRANG THAI mot dia diem co hang rao (MOI trang thai)
 * -> 409 `COUNTERPARTY_SITE_MANAGED_AS_PLACE`; dia chi / ghi chu van sua duoc; dia diem chua co hang
 * rao thi sua tu do nhu truoc.
 */
describe('dich vu dia diem hoi cong truoc khi sua (#395)', () => {
  const setup = async () => {
    const counterparties = new InMemoryCounterpartyRepository();
    const sites = new InMemoryCounterpartySiteRepository();
    const geofences = new InMemoryGeofenceRepository();
    const hub = new CounterpartySitePlaceGuardHub();
    hub.register(new GeofenceSitePlaceGuard(geofences));
    const service = new CounterpartySiteService(sites, counterparties, undefined, hub);
    const party = await counterparties.create({ name: 'Công ty A' });
    const fenced = await service.create(party.id, { name: 'Kho có hàng rào' }, 'ke-toan');
    const bare = await service.create(party.id, { name: 'Kho chưa khai vị trí' }, 'ke-toan');
    const fence = await geofences.register({
      label: 'Kho có hàng rào',
      subjectKind: 'COUNTERPARTY_SITE',
      subjectId: fenced.id,
      latitude: 20.8,
      longitude: 106.7,
      radiusMetres: 200,
      note: null,
      recordedBy: 'giam-doc',
    });
    return { service, geofences, fenced, bare, fence };
  };

  const reasonOf = async (run: () => Promise<unknown>): Promise<string> => {
    try {
      await run();
      return 'KHONG BI CHAN';
    } catch (error) {
      if (error instanceof TransportDomainError) return error.reason;
      throw error;
    }
  };

  it('doi ten / tat dia diem co hang rao -> COUNTERPARTY_SITE_MANAGED_AS_PLACE (409)', async () => {
    const { service, fenced } = await setup();

    expect(await reasonOf(() => service.update(fenced.id, { name: 'Kho mới' }, 'ke-toan'))).toBe(
      'COUNTERPARTY_SITE_MANAGED_AS_PLACE',
    );
    expect(await reasonOf(() => service.update(fenced.id, { status: 'INACTIVE' }, 'ke-toan'))).toBe(
      'COUNTERPARTY_SITE_MANAGED_AS_PLACE',
    );
    const blocked = await service
      .update(fenced.id, { status: 'INACTIVE' }, 'ke-toan')
      .catch((error: unknown) => error);
    expect(blocked).toMatchObject({ kind: 'CONFLICT' });
  });

  it('hang rao da tat van la dia diem van hanh', async () => {
    const { service, geofences, fenced, fence } = await setup();
    await geofences.setStatus([fence.id], 'INACTIVE');

    expect(await reasonOf(() => service.update(fenced.id, { name: 'Kho mới' }, 'ke-toan'))).toBe(
      'COUNTERPARTY_SITE_MANAGED_AS_PLACE',
    );
  });

  it('dia chi / ghi chu sua tu do; dia diem chua co hang rao sua nhu truoc', async () => {
    const { service, fenced, bare } = await setup();

    expect(
      (await service.update(fenced.id, { address: 'Lô C7', name: 'Kho có hàng rào' }, 'ke-toan'))
        .address,
    ).toBe('Lô C7');
    expect((await service.update(bare.id, { name: 'Kho B' }, 'ke-toan')).name).toBe('Kho B');
  });
});
