import { describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { InMemoryCounterpartyRepository } from '../counterparty/counterparty.repository.js';
import { InMemoryCounterpartySiteRepository } from '../counterparty/site.repository.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  InMemoryGeofenceRepository,
  RepositoryGeofenceOwnerLookup,
} from './geofence.repository.js';
import { GeofenceService, type RegisterGeofenceCommand } from './geofence.service.js';
import { InMemoryPlaceWriteStore } from './place-write.store.js';
import { DEFAULT_TRANSPORT_PROOF_POLICY } from './tracking-policy.js';

/**
 * ROUTE CU `POST /transport/geofences` (`#395`): cung duong ghi, cung khoa, cung luat trung ten voi
 * man "Dia diem van hanh" — cho MOI loai hang rao. Van nhan ma bai tuy y (bai boot dung `kho-boot`).
 */
const world = () => {
  const counterparties = new InMemoryCounterpartyRepository();
  const sites = new InMemoryCounterpartySiteRepository();
  const fleet = new InMemoryFleetRepository();
  const geofences = new InMemoryGeofenceRepository(
    new RepositoryGeofenceOwnerLookup(sites, counterparties, fleet),
  );
  const audit = new InMemoryAuditLogRepository();
  const service = new GeofenceService(
    geofences,
    DEFAULT_TRANSPORT_PROOF_POLICY,
    new InMemoryPlaceWriteStore({ geofences, sites, counterparties, customers: fleet }),
    new AuditLogService(audit),
  );
  return { service, geofences, audit };
};

const command = (over: Partial<RegisterGeofenceCommand> = {}): RegisterGeofenceCommand => ({
  label: 'Boot kho Hai Phong',
  subjectKind: 'DEPOT',
  subjectId: 'kho-boot',
  latitude: 20.8449,
  longitude: 106.6881,
  radiusMetres: 200,
  note: null,
  recordedBy: 'boot',
  ...over,
});

const reasonOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
    return 'KHONG BI CHAN';
  } catch (error) {
    if (error instanceof TransportDomainError) return error.reason;
    throw error;
  }
};

describe('route cu khai hang rao di qua duong ghi dia diem (#395)', () => {
  it('ma bai tuy y van duoc nhan, co dau vet', async () => {
    const { service, audit } = world();

    const fence = await service.register(command());

    expect(fence).toMatchObject({ subjectId: 'kho-boot', status: 'ACTIVE' });
    expect(await audit.list({ action: 'transport.geofence.register' })).toHaveLength(1);
  });

  it('trung ten voi MOI loai hang rao con hieu luc -> PLACE_NAME_TAKEN', async () => {
    const { service } = world();
    await service.register(command());

    expect(
      await reasonOf(() =>
        service.register(
          command({ label: 'BOOT KHO HAI PHONG', subjectKind: 'AD_HOC', subjectId: null }),
        ),
      ),
    ).toBe('PLACE_NAME_TAKEN');
  });

  it('bai thu hai dang bat -> DEPOT_ALREADY_ACTIVE; ma bai trung -> DEPOT_CODE_TAKEN (khong 500)', async () => {
    const { service, geofences } = world();
    const first = await service.register(command());

    expect(
      await reasonOf(() => service.register(command({ label: 'Bãi hai', subjectId: 'kho-2' }))),
    ).toBe('DEPOT_ALREADY_ACTIVE');
    await geofences.setStatus([first.id], 'INACTIVE');
    expect(await reasonOf(() => service.register(command({ label: 'Bãi ba' })))).toBe(
      'DEPOT_CODE_TAKEN',
    );
  });

  it('ba phep kiem cu giu nguyen thu tu: toa do, ban kinh, hinh chu the', async () => {
    const { service } = world();

    expect(await reasonOf(() => service.register(command({ latitude: 0, longitude: 0 })))).toBe(
      'GEOFENCE_COORDINATE_REJECTED',
    );
    expect(await reasonOf(() => service.register(command({ radiusMetres: 5 })))).toBe(
      'GEOFENCE_RADIUS_OUT_OF_RANGE',
    );
    expect(await reasonOf(() => service.register(command({ subjectId: null })))).toBe(
      'GEOFENCE_SUBJECT_SHAPE_INVALID',
    );
  });
});
