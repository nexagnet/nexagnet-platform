import { describe, expect, it } from 'vitest';
import { InMemoryCounterpartyRepository } from '../counterparty/counterparty.repository.js';
import { InMemoryCounterpartySiteRepository } from '../counterparty/site.repository.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import {
  InMemoryGeofenceRepository,
  RepositoryGeofenceOwnerLookup,
} from '../proof/geofence.repository.js';
import type { TrackingRepository } from '../proof/tracking.repository.js';
import { DispatchLocationFactsAdapter } from './dispatch-facts.port.js';
import { resolvePlaceByLabel } from './place-resolution.js';

/**
 * SO TRA CUU DIA DIEM cua dieu xe doc hang rao CON HIEU LUC THAT (`#395`) — cung vi tu voi dia diem
 * da biet va luat trung ten. Kho / phap nhan da nghi khong con giai duoc nhan chang, va khong con lam
 * mot nhan cua ai "mo ho".
 */
describe('so tra cuu dia diem cua dieu xe (#395)', () => {
  const setup = async () => {
    const counterparties = new InMemoryCounterpartyRepository();
    const sites = new InMemoryCounterpartySiteRepository();
    const fleet = new InMemoryFleetRepository();
    const geofences = new InMemoryGeofenceRepository(
      new RepositoryGeofenceOwnerLookup(sites, counterparties, fleet),
    );
    const party = await counterparties.create({ name: 'Công ty A' });
    const site = await sites.create({
      counterpartyId: party.id,
      name: 'Kho Đình Vũ',
      address: null,
      note: null,
      status: 'ACTIVE',
      recordedBy: 'test',
    });
    const register = (
      label: string,
      subjectKind: 'DEPOT' | 'COUNTERPARTY_SITE',
      subjectId: string,
    ) =>
      geofences.register({
        label,
        subjectKind,
        subjectId,
        latitude: 20.83,
        longitude: 106.77,
        radiusMetres: 300,
        note: null,
        recordedBy: 'test',
      });
    await register('Bãi xe Hà Nội', 'DEPOT', 'DEPOT-HN');
    const siteFence = await register('Kho Đình Vũ', 'COUNTERPARTY_SITE', site.id);
    const adapter = new DispatchLocationFactsAdapter({} as TrackingRepository, geofences, sites);
    return { adapter, counterparties, sites, party, site, siteFence };
  };

  it('moi chu the con hoat dong: ca bai xe lan dia diem deu giai duoc', async () => {
    const { adapter, siteFence } = await setup();

    const index = await adapter.placeIndex();

    expect(index.map((entry) => entry.label)).toEqual(['Bãi xe Hà Nội', 'Kho Đình Vũ']);
    expect(resolvePlaceByLabel('kho dinh vu', index)).toMatchObject({
      ok: true,
      place: { geofenceId: siteFence.id },
    });
  });

  it('phap nhan da nghi -> hang rao dia diem cua no ra khoi so', async () => {
    const { adapter, counterparties, party } = await setup();
    await counterparties.update(party.id, { status: 'INACTIVE' });

    const index = await adapter.placeIndex();

    expect(index.map((entry) => entry.label)).toEqual(['Bãi xe Hà Nội']);
    expect(resolvePlaceByLabel('Kho Đình Vũ', index)).toEqual({
      ok: false,
      reason: 'PICKUP_LABEL_NO_MATCH',
    });
  });

  it('dia diem da nghi qua duong cu -> ra khoi so', async () => {
    const { adapter, sites, site } = await setup();
    await sites.update(site.id, { status: 'INACTIVE' });

    expect((await adapter.placeIndex()).map((entry) => entry.label)).toEqual(['Bãi xe Hà Nội']);
  });
});
