import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAuditLogRepository } from '../../../audit/audit-log.repository.js';
import { AuditLogService } from '../../../audit/audit-log.service.js';
import type { TelemetryRecord, TelemetrySink } from '../../../observability/telemetry-record.js';
import { TelemetryService } from '../../../observability/telemetry.service.js';
import { CounterpartySitePlaceGuardHub } from '../../counterparty/counterparty-site-place-guard.js';
import { InMemoryFleetRepository } from '../../fleet/fleet.repository.js';
import { InMemoryMovementRepository } from '../../movement/movement.repository.js';
import { MovementService } from '../../movement/movement.service.js';
import {
  ConfigDepotDirectory,
  DepotDirectoryHub,
  depotSourceOf,
} from '../../planning/depot-directory.js';
import { resolveDepotFrom } from '../../planning/planning-policy.js';
import { InMemoryRunPlanRepository } from '../../planning/planning.repository.js';
import { PlanningService } from '../../planning/planning.service.js';
import type { TransportPlanningPolicy } from '../../planning/planning.types.js';
import { RunClosureService } from '../../planning/run-closure.service.js';
import {
  InMemoryGeofenceRepository,
  type GeofenceRecord,
  type GeofenceRepository,
  type RegisterGeofenceInput,
} from '../../proof/geofence.repository.js';
import {
  GeofenceDepotDirectory,
  GeofenceSitePlaceGuard,
  TransportPlacesRegistrar,
} from './place-registrations.js';

/**
 * DANH BA BAI XE DUOC QUAN LY (`#395`) — luat uu tien, nhap nhang, tat bai, va CHINH khau lap ke
 * hoach / dong vong chay doc no.
 *
 * Bai tren Postgres that (tao bai -> chang rong -> dong vong chay, doi bai chinh khong ho) nam o
 * `place-admin.int.spec.ts`; o day la hop dong cua luat, tren kho trong bo nho.
 */

const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const ACTOR = 'giam-doc';
const MANAGED_LABEL = 'Bãi xe Gia Lâm';

const policy = (depots: TransportPlanningPolicy['depots']): TransportPlanningPolicy => ({
  grouping: 'ONE_ORDER_PER_RUN',
  depots,
  closure: { idleHours: null },
  sweep: { intervalSeconds: 60, batchSize: 50 },
});

const CONFIG_DEPOT = policy([{ code: 'DEPOT-CU', label: 'Bãi xe cấu hình' }]);

const depotFence = (
  label: string,
  code: string,
  status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
): RegisterGeofenceInput => ({
  label,
  subjectKind: 'DEPOT',
  subjectId: code,
  latitude: 21.03,
  longitude: 105.93,
  radiusMetres: 250,
  note: null,
  recordedBy: ACTOR,
  status,
});

const managed = (geofences: GeofenceRepository, fallback = CONFIG_DEPOT) =>
  new GeofenceDepotDirectory(geofences, new ConfigDepotDirectory(fallback));

describe('luat uu tien cua danh ba bai xe (#395)', () => {
  let geofences: InMemoryGeofenceRepository;

  beforeEach(() => {
    geofences = new InMemoryGeofenceRepository();
  });

  it('chua co hang rao DEPOT nao -> doc cau hinh goi khach', async () => {
    const list = await managed(geofences).list();

    expect(list).toEqual([
      { code: 'DEPOT-CU', label: 'Bãi xe cấu hình', active: true, source: 'TENANT_CONFIG' },
    ]);
    expect(depotSourceOf(list)).toBe('TENANT_CONFIG');
  });

  it('co mot hang rao DEPOT -> la su that, cau hinh bi bo qua hoan toan', async () => {
    const fence = await geofences.register(depotFence(MANAGED_LABEL, 'DEPOT-GIA-LAM'));

    const list = await managed(geofences).list();

    expect(list).toEqual([
      {
        code: 'DEPOT-GIA-LAM',
        label: MANAGED_LABEL,
        active: true,
        source: 'MANAGED',
        geofenceId: fence.id,
        point: { latitude: 21.03, longitude: 105.93 },
        radiusMetres: 250,
      },
    ]);
    expect(resolveDepotFrom(list)).toEqual({
      kind: 'RESOLVED',
      depot: { code: 'DEPOT-GIA-LAM', label: MANAGED_LABEL },
    });
  });

  /** Tat bai cuoi cung KHONG hoi sinh bai trong tep cau hinh ma man hinh khong hien. */
  it('moi hang rao DEPOT deu tat -> NOT_CONFIGURED, khong lui ve cau hinh', async () => {
    const fence = await geofences.register(depotFence(MANAGED_LABEL, 'DEPOT-GIA-LAM'));
    await geofences.setStatus([fence.id], 'INACTIVE');

    const list = await managed(geofences).list();

    expect(depotSourceOf(list)).toBe('MANAGED');
    expect(list.map((entry) => entry.active)).toEqual([false]);
    expect(resolveDepotFrom(list)).toEqual({ kind: 'NOT_CONFIGURED' });
  });

  it('bai du phong (tat) + bai chinh -> dung dung bai chinh', async () => {
    await geofences.register(depotFence('Bãi dự phòng', 'DEPOT-DU-PHONG', 'INACTIVE'));
    await geofences.register(depotFence(MANAGED_LABEL, 'DEPOT-GIA-LAM'));

    expect(resolveDepotFrom(await managed(geofences).list())).toMatchObject({
      kind: 'RESOLVED',
      depot: { code: 'DEPOT-GIA-LAM' },
    });
  });

  /**
   * DB chan hai bai cung bat, nhung mot ban ghi cu / mot duong ghi khac co the de lai hai: khau lap
   * ke hoach phai noi `AMBIGUOUS` chu khong doan bua mot bai.
   */
  it('hai bai cung bat (du lieu lot qua) -> AMBIGUOUS', async () => {
    const fences = [depotFence('Bãi A', 'DEPOT-A'), depotFence('Bãi B', 'DEPOT-B')].map(
      (input, index): GeofenceRecord => ({
        ...input,
        id: `f-${index}`,
        status: 'ACTIVE',
        address: null,
        createdAt: '2026-09-25T00:00:00.000Z',
        updatedAt: '2026-09-25T00:00:00.000Z',
      }),
    );
    const repository = { listAll: async () => fences } as unknown as GeofenceRepository;

    expect(resolveDepotFrom(await managed(repository).list())).toEqual({
      kind: 'AMBIGUOUS',
      codes: ['DEPOT-A', 'DEPOT-B'],
    });
  });

  it('hub: nguon dang ky thang cau hinh; dang ky lan hai NEM', async () => {
    const hub = new DepotDirectoryHub(CONFIG_DEPOT);
    const guards = new CounterpartySitePlaceGuardHub();
    await geofences.register(depotFence(MANAGED_LABEL, 'DEPOT-GIA-LAM'));

    new TransportPlacesRegistrar(geofences, hub, guards, CONFIG_DEPOT);

    expect(depotSourceOf(await hub.list())).toBe('MANAGED');
    expect(() => new TransportPlacesRegistrar(geofences, hub, guards, CONFIG_DEPOT)).toThrow(
      /Da co mot nguon bai xe/,
    );
  });
});

/**
 * KHAU LAP KE HOACH va DONG VONG CHAY doc CHINH danh ba — bai xe khai tren man "Dia diem van hanh"
 * la diem dau chang rong va diem dong vong chay, khong phai bai trong cau hinh.
 */
describe('khau lap ke hoach doc bai xe duoc quan ly (#395)', () => {
  let fleet: InMemoryFleetRepository;
  let movement: MovementService;
  let plans: InMemoryRunPlanRepository;
  let geofences: InMemoryGeofenceRepository;
  let records: TelemetryRecord[];
  let telemetry: TelemetryService;
  let now: Date;

  const build = (directory: DepotDirectoryHub) =>
    new PlanningService(
      movement,
      plans,
      fleet,
      new AuditLogService(new InMemoryAuditLogRepository()),
      CORE_POLICY,
      CONFIG_DEPOT,
      telemetry,
      () => now,
      directory,
    );

  const managedHub = (): DepotDirectoryHub => {
    const hub = new DepotDirectoryHub(CONFIG_DEPOT);
    hub.register(managed(geofences));
    return hub;
  };

  beforeEach(() => {
    now = new Date();
    fleet = new InMemoryFleetRepository();
    const trace = new InMemoryAuditLogRepository();
    movement = new MovementService(
      new InMemoryMovementRepository(trace),
      fleet,
      new AuditLogService(trace),
      CORE_POLICY,
    );
    plans = new InMemoryRunPlanRepository();
    geofences = new InMemoryGeofenceRepository();
    records = [];
    const sink: TelemetrySink = { record: (record) => records.push(record) };
    telemetry = new TelemetryService();
    telemetry.configure({
      release: { tenant: 'it', environment: 'test', gitSha: 'unknown', source: 'none' },
      privacy: 'full',
      sinks: [sink],
    });
  });

  const aVehicle = async () => {
    const vehicle = await fleet.createVehicle({
      registrationPlate: '29C-39501',
      vehicleClass: 'Đầu kéo',
    });
    const driver = await fleet.createDriver({
      fullName: 'Lai xe 395',
      phone: '0903950001',
      licenceClass: 'FC',
      licenceExpiry: '2030-01-01',
      authUserId: 'auth-395',
    });
    await fleet.assignDriverToVehicle(vehicle.id, driver.id, now);
    return vehicle;
  };

  it('chang rong xuat phat tu BAI DUOC QUAN LY; be mat chan doan noi nguon MANAGED', async () => {
    await geofences.register(depotFence(MANAGED_LABEL, 'DEPOT-GIA-LAM'));
    const planning = build(managedHub());
    const vehicle = await aVehicle();
    const order = await movement.createOrder(
      {
        code: 'ORD-395',
        originLabel: 'Kho Hà Nội',
        destinationLabel: 'Hải Phòng',
        businessDate: '2026-09-25',
      },
      ACTOR,
    );

    const proposal = await planning.preview(order.id, { vehicleId: vehicle.id });

    expect(proposal.legs[0]).toMatchObject({
      kind: 'EMPTY',
      originLabel: MANAGED_LABEL,
      destinationLabel: 'Kho Hà Nội',
    });
    expect((await planning.describePolicy()).depot).toEqual({
      kind: 'RESOLVED',
      depot: { code: 'DEPOT-GIA-LAM', label: MANAGED_LABEL },
      source: 'MANAGED',
    });
    const depotDecision = records.find(
      (record) =>
        record.type === 'decision' && (record as { point?: string }).point === 'planning.depot',
    ) as unknown as { reason: string; detail: Record<string, unknown> } | undefined;
    expect(depotDecision?.reason).toBe('DEPOT_RESOLVED');
    expect(depotDecision?.detail).toMatchObject({ source: 'MANAGED', code: 'DEPOT-GIA-LAM' });
  });

  it('xe ve BAI DUOC QUAN LY -> dong vong chay DEPOT_RETURN', async () => {
    await geofences.register(depotFence(MANAGED_LABEL, 'DEPOT-GIA-LAM'));
    const planning = build(managedHub());
    const vehicle = await aVehicle();
    const order = await movement.createOrder(
      {
        code: 'ORD-395B',
        originLabel: MANAGED_LABEL,
        destinationLabel: 'Hải Phòng',
        businessDate: '2026-09-25',
      },
      ACTOR,
    );
    const { run, legs } = await planning.commit(
      order.id,
      { vehicleId: vehicle.id, idempotencyKey: 'k-395' },
      ACTOR,
    );
    for (const leg of legs) {
      await movement.transitionLeg(leg.id, 'IN_TRANSIT', ACTOR);
      await movement.transitionLeg(leg.id, 'COMPLETED', ACTOR);
    }
    const home = await movement.addLeg(
      run.id,
      {
        sequence: legs.length + 1,
        kind: 'EMPTY',
        orderId: null,
        originLabel: 'Hải Phòng',
        destinationLabel: MANAGED_LABEL,
        businessDate: '2026-09-25',
        distanceKm: null,
        plannedDistanceKm: null,
        note: null,
      },
      ACTOR,
    );
    await movement.transitionLeg(home.id, 'IN_TRANSIT', ACTOR);
    await movement.transitionLeg(home.id, 'COMPLETED', ACTOR);

    const outcome = await planning.settleRunClosure(run.id);

    expect(outcome).toMatchObject({ closed: true, verdict: { trigger: 'DEPOT_RETURN' } });
  });

  it('bai duoc quan ly da tat -> KHONG chang rong, khong lui ve bai cau hinh', async () => {
    const fence = await geofences.register(depotFence(MANAGED_LABEL, 'DEPOT-GIA-LAM'));
    await geofences.setStatus([fence.id], 'INACTIVE');
    const planning = build(managedHub());
    const vehicle = await aVehicle();
    const order = await movement.createOrder(
      {
        code: 'ORD-395C',
        originLabel: 'Kho Hà Nội',
        destinationLabel: 'Hải Phòng',
        businessDate: '2026-09-25',
      },
      ACTOR,
    );

    const proposal = await planning.preview(order.id, { vehicleId: vehicle.id });

    expect(proposal.emptyLegRequired).toBe(false);
    expect((await planning.describePolicy()).depot).toEqual({
      kind: 'NOT_CONFIGURED',
      source: 'MANAGED',
    });
  });

  /** Luot quet doc danh ba DUNG MOT LAN — khong mot lan doc nao trong luc giu khoa vong chay. */
  it('luot quet doc danh ba bai xe dung mot lan cho ca luot', async () => {
    await geofences.register(depotFence(MANAGED_LABEL, 'DEPOT-GIA-LAM'));
    const hub = managedHub();
    const list = vi.spyOn(hub, 'list');
    const planning = build(hub);
    const closures = new RunClosureService(
      planning,
      movement,
      CONFIG_DEPOT,
      undefined,
      telemetry,
      () => now,
      hub,
    );

    await closures.sweep();

    expect(list).toHaveBeenCalledTimes(1);
  });
});

describe('cong chan sua dia diem qua duong cu (#395)', () => {
  it('dia diem co hang rao (ke ca da tat) -> COUNTERPARTY_SITE_MANAGED_AS_PLACE', async () => {
    const geofences = new InMemoryGeofenceRepository();
    const fence = await geofences.register({
      label: 'Kho Đình Vũ',
      subjectKind: 'COUNTERPARTY_SITE',
      subjectId: 'site-1',
      latitude: 20.82,
      longitude: 106.77,
      radiusMetres: 300,
      note: null,
      recordedBy: ACTOR,
    });
    await geofences.setStatus([fence.id], 'INACTIVE');
    const guard = new GeofenceSitePlaceGuard(geofences);

    expect(
      await guard.checkLegacySiteChange({
        siteId: 'site-1',
        changesName: true,
        changesStatus: false,
      }),
    ).toEqual({ allowed: false, reason: 'COUNTERPARTY_SITE_MANAGED_AS_PLACE' });
    expect(
      await guard.checkLegacySiteChange({
        siteId: 'site-2',
        changesName: true,
        changesStatus: false,
      }),
    ).toEqual({ allowed: true });
  });
});
