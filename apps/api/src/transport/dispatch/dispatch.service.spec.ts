import { beforeEach, describe, expect, it } from 'vitest';
import type { DispatchReadiness } from '../asset-compliance/vehicle-availability.js';
import type { Order, RunLeg, VehicleRun } from '../movement/movement.types.js';
import {
  DEFAULT_RUN_CLOSURE_SWEEP_BATCH_SIZE,
  DEFAULT_RUN_CLOSURE_SWEEP_INTERVAL_SECONDS,
  DEFAULT_RUN_GROUPING,
} from '../planning/planning-policy.js';
import type { RunGrouping, TransportPlanningPolicy } from '../planning/planning.types.js';
import { TransportDomainError } from '../transport.errors.js';
import type { Vehicle } from '../transport.types.js';
import {
  DispatchComplianceFacts,
  DispatchCoreFacts,
  DispatchLocationFacts,
  type DispatchLegFact,
} from './dispatch-facts.port.js';
import {
  DispatchAssignmentPlanner,
  type DispatchCommitCommand,
  type DispatchCommitResult,
} from './dispatch-planner.port.js';
import { DEFAULT_TRANSPORT_DISPATCH_POLICY } from './dispatch-policy.js';
import {
  DispatchService,
  EMPTY_DISPATCH_REQUEST,
  type DispatchCaller,
  type DispatchSuggestionRequest,
} from './dispatch.service.js';
import type { PlaceIndexEntry } from './place-resolution.js';
import type {
  MatrixOutcome,
  MatrixRequest,
  RouteOutcome,
  RouteRequest,
} from './routing/routing.types.js';
import { TransportRoutingPort } from './routing/transport-routing.port.js';
import type { ObservationSample } from './vehicle-state-projection.js';

/**
 * CHINH SACH LAP KE HOACH cho cac bai o tep nay.
 *
 * MAC DINH LA `MULTI_ORDER_RUN`, va do la mot lua chon phai doc ky — no NGUOC voi mac dinh cua san
 * pham (`DEFAULT_RUN_GROUPING = 'ONE_ORDER_PER_RUN'`).
 *
 * Ly do: ke tu `#294 S-OWNER-02`, ca be mat de nghi dieu xe CHI ton tai o che do `MULTI_ORDER_RUN`.
 * Moi bai trong tep nay deu kiem mot tinh chat CUA BANG DE NGHI — xep hang duong bo, hai diem xuat
 * phat, che toa do, tinh lai luc xac nhan — nen tat ca deu phai chay o che do co bang de nghi.
 * Dung mac dinh cua san pham o day se lam ca tep do vi mot ly do khong lien quan gi den thu no do.
 *
 * Che do `ONE_ORDER_PER_RUN` co bo bai RIENG ("cong che do gom nhom" o cuoi tep), va bo do moi la
 * cho kiem mac dinh that.
 */
/*
 * `sweep` di kem tu `#293` Lane R — luot quet dong vong chay dinh ky.
 *
 * Bo bai nay khong dung toi no (khong mot bai nao goi `sweep()`), nhung `TransportPlanningPolicy`
 * la MOT doi tuong chinh sach cho ca mien lap ke hoach, va mot doi tuong thieu truong se de nguoi
 * doc tuong che do quet la tuy chon. Lay thang hai mac dinh cua san pham thay vi go hai con so:
 * neu mac dinh doi, bo bai nay doi theo ma khong ai phai nho.
 */
const planningPolicy = (grouping: RunGrouping): TransportPlanningPolicy => ({
  grouping,
  depots: [],
  closure: { idleHours: null },
  sweep: {
    intervalSeconds: DEFAULT_RUN_CLOSURE_SWEEP_INTERVAL_SECONDS,
    batchSize: DEFAULT_RUN_CLOSURE_SWEEP_BATCH_SIZE,
  },
});
const multiOrderPlanningPolicy = (): TransportPlanningPolicy => planningPolicy('MULTI_ORDER_RUN');

/**
 * `#277 M14` — bo bai doi khang cua be mat de nghi dieu xe.
 *
 * Moi bai o day dung MOT cong dinh tuyen gia co CON SO DUONG BO DAT TAY. Do la co y: no cho phep
 * dung nhung tinh huong ma ket luan theo duong bo NGUOC voi ket luan theo duong chim bay, tuc
 * dung cai ma `M3` cam (*"straight-line distance ... must not be the final ranking metric"*).
 */

const NOW = new Date('2026-09-08T10:00:00.000Z');

const HA_NOI = { latitude: 21.0278, longitude: 105.8342 };
const HAI_PHONG = { latitude: 20.8449, longitude: 106.6881 };
const NINH_BINH = { latitude: 20.2506, longitude: 105.9745 };

const PLACE_INDEX: readonly PlaceIndexEntry[] = [
  { geofenceId: 'gf-hn', label: 'Kho Ha Noi', point: HA_NOI, siteId: null, siteName: null },
  { geofenceId: 'gf-hp', label: 'Kho Hai Phong', point: HAI_PHONG, siteId: null, siteName: null },
  { geofenceId: 'gf-nb', label: 'Bai Ninh Binh', point: NINH_BINH, siteId: null, siteName: null },
];

/*
 * Don mac dinh MANG TOA DO (#379) va nhan KHOP voi toa do — de moi bai cu kiem dung thu no kiem.
 * Nhung bai kiem rieng thu tu "toa do thang nhan" o cuoi tep co y lam lech hai thu do.
 */
const order = (over: Partial<Order> = {}): Order => ({
  id: 'ord-1',
  code: 'ORD-1',
  status: 'OPEN',
  businessDate: '2026-09-08',
  customerId: null,
  originLabel: 'Kho Hai Phong',
  destinationLabel: 'Bai Ninh Binh',
  originPoint: HAI_PHONG,
  destinationPoint: NINH_BINH,
  cargoDescription: null,
  freightAmount: null,
  currencyCode: 'VND',
  note: null,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  cancelledAt: null,
  cancellationReason: null,
  ...over,
});

const vehicle = (over: Partial<Vehicle> & { id: string }): Vehicle => ({
  registrationPlate: over.id,
  vehicleClass: 'TRUCK_10T',
  allowedPayloadKg: 10_000,
  currentOdoKm: 0,
  status: 'IDLE',
  operationalControl: 'INTERNAL_OPERATED',
  ownershipRegisterComplete: false,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  ...over,
});

const run = (over: Partial<VehicleRun> & { id: string; vehicleId: string }): VehicleRun => ({
  code: `RUN-${over.id}`,
  status: 'ACTIVE',
  businessDate: '2026-09-08',
  startedAt: null,
  completedAt: null,
  note: null,
  createdAt: '2026-09-08T08:00:00.000Z',
  updatedAt: '2026-09-08T08:00:00.000Z',
  cancelledAt: null,
  cancellationReason: null,
  ...over,
});

const leg = (over: Partial<RunLeg> & { id: string; runId: string }): RunLeg => ({
  sequence: 1,
  kind: 'LOADED',
  status: 'IN_TRANSIT',
  orderId: null,
  originLabel: 'Kho Ha Noi',
  destinationLabel: 'Kho Hai Phong',
  businessDate: '2026-09-08',
  distanceKm: null,
  // Lane L (#276) them cot nay: km DU KIEN cua bo lap ke hoach, tach khoi km NHAP TAY o tren.
  plannedDistanceKm: null,
  startedAt: null,
  completedAt: null,
  note: null,
  createdAt: '2026-09-08T08:00:00.000Z',
  updatedAt: '2026-09-08T08:00:00.000Z',
  ...over,
});

class FakeCoreFacts extends DispatchCoreFacts {
  orders: Order[] = [order()];
  vehicles: Vehicle[] = [];
  legs: DispatchLegFact[] = [];
  /**
   * MOI LAN HOI MOT DON, ghi lai.
   *
   * Ton tai cho `#294` bai 2/6: o che do `ONE_ORDER_PER_RUN`, cong chinh sach phai chan TRUOC khi
   * mien cham vao bat ky su that nao. Mot bai chi kiem "co nem loi khong" se van xanh neu ai do
   * doi cong xuong duoi `requireOpenOrder()` — danh sach nay la thu bat duoc dieu do.
   */
  orderReads: string[] = [];

  listVehicles(): Promise<readonly Vehicle[]> {
    return Promise.resolve(this.vehicles);
  }
  findVehicle(vehicleId: string): Promise<Vehicle | null> {
    return Promise.resolve(this.vehicles.find((entry) => entry.id === vehicleId) ?? null);
  }
  findOrder(orderId: string): Promise<Order | null> {
    this.orderReads.push(orderId);
    return Promise.resolve(this.orders.find((entry) => entry.id === orderId) ?? null);
  }
  listOpenLegsForVehicle(vehicleId: string): Promise<readonly DispatchLegFact[]> {
    return Promise.resolve(this.legs.filter((fact) => fact.run.vehicleId === vehicleId));
  }
  listLegsForOrder(orderId: string): Promise<readonly DispatchLegFact[]> {
    return Promise.resolve(this.legs.filter((fact) => fact.leg.orderId === orderId));
  }
}

class FakeLocationFacts extends DispatchLocationFacts {
  samples = new Map<string, ObservationSample>();

  latestObservationForVehicle(vehicleId: string): Promise<ObservationSample | null> {
    return Promise.resolve(this.samples.get(vehicleId) ?? null);
  }
  placeIndex(): Promise<readonly PlaceIndexEntry[]> {
    return Promise.resolve(PLACE_INDEX);
  }
}

class FakeComplianceFacts extends DispatchComplianceFacts {
  readiness = new Map<string, DispatchReadiness>();

  readinessForVehicle(target: Vehicle): Promise<DispatchReadiness> {
    return Promise.resolve(
      this.readiness.get(target.id) ?? {
        vehicleId: target.id,
        effectiveStatus: 'IDLE',
        warnings: [],
        blocking: [],
      },
    );
  }
}

/**
 * Cong dinh tuyen GIA voi bang quang duong DAT TAY.
 *
 * Khoa tra cuu la cap vi do da lam tron; khong tim thay thi roi ve mot con so co dinh. Nho vay
 * mot bai kiem thu dung duoc tinh huong "gan theo duong thang nhung xa theo duong bo".
 */
class TableRoutingPort extends TransportRoutingPort {
  readonly providerId = 'bang-tay';
  failure: MatrixOutcome | null = null;
  matrixCalls = 0;
  /** Moi lan dinh tuyen MOT doan (phep chieu chang con lai) — de doc diem den cua tung chang. */
  routeCalls: RouteRequest[] = [];

  constructor(private readonly table: ReadonlyMap<string, { metres: number; seconds: number }>) {
    super();
  }

  private static key(from: { latitude: number }, to: { latitude: number }): string {
    return `${from.latitude.toFixed(4)}->${to.latitude.toFixed(4)}`;
  }

  private lookup(
    from: { latitude: number },
    to: { latitude: number },
  ): { metres: number; seconds: number } {
    return this.table.get(TableRoutingPort.key(from, to)) ?? { metres: 50_000, seconds: 3_600 };
  }

  route(request: RouteRequest): Promise<RouteOutcome> {
    this.routeCalls.push(request);
    const hit = this.lookup(request.origin, request.destination);
    return Promise.resolve({
      ok: true,
      estimate: {
        providerId: this.providerId,
        providerProfile: null,
        quality: 'ROAD_NETWORK',
        roadDistanceMetres: hit.metres,
        durationSeconds: hit.seconds,
        estimated: true,
        geometry: null,
        computedAt: NOW.toISOString(),
        fromCache: false,
      },
    });
  }

  matrix(request: MatrixRequest): Promise<MatrixOutcome> {
    this.matrixCalls += 1;
    if (this.failure) return Promise.resolve(this.failure);
    return Promise.resolve({
      ok: true,
      cells: request.origins.flatMap((origin, originIndex) =>
        request.destinations.map((destination, destinationIndex) => {
          const hit = this.lookup(origin, destination);
          return {
            originIndex,
            destinationIndex,
            estimate: {
              providerId: this.providerId,
              providerProfile: null,
              quality: 'ROAD_NETWORK' as const,
              roadDistanceMetres: hit.metres,
              durationSeconds: hit.seconds,
              estimated: true as const,
              geometry: null,
              computedAt: NOW.toISOString(),
              fromCache: false,
            },
            failure: null,
          };
        }),
      ),
    });
  }
}

class RecordingPlanner extends DispatchAssignmentPlanner {
  calls: DispatchCommitCommand[] = [];

  commit(command: DispatchCommitCommand): Promise<DispatchCommitResult> {
    this.calls.push(command);
    return Promise.resolve({
      runId: 'run-moi',
      legId: 'leg-moi',
      created: true,
      reason: 'COMMIT_PLANNED',
    });
  }
}

const ADMIN: DispatchCaller = { actor: 'boss', canReadLocationHistory: true };
const ACCOUNTANT: DispatchCaller = { actor: 'ke-toan', canReadLocationHistory: false };

const distances = (
  entries: readonly (readonly [number, number, number, number])[],
): ReadonlyMap<string, { metres: number; seconds: number }> =>
  new Map(
    entries.map(([fromLat, toLat, metres, seconds]) => [
      `${fromLat.toFixed(4)}->${toLat.toFixed(4)}`,
      { metres, seconds },
    ]),
  );

describe('be mat de nghi dieu xe', () => {
  let core: FakeCoreFacts;
  let location: FakeLocationFacts;
  let compliance: FakeComplianceFacts;
  let planner: RecordingPlanner;

  const build = (
    routing: TransportRoutingPort,
    planning: TransportPlanningPolicy = multiOrderPlanningPolicy(),
  ): DispatchService =>
    new DispatchService(
      core,
      routing,
      planner,
      DEFAULT_TRANSPORT_DISPATCH_POLICY,
      planning,
      location,
      compliance,
      undefined,
      () => NOW,
    );

  const observe = (vehicleId: string, point: typeof HA_NOI, ageSeconds = 60): void => {
    location.samples.set(vehicleId, {
      sessionId: `ses-${vehicleId}`,
      point,
      accuracyMetres: 10,
      source: 'DEVICE_GNSS',
      receivedAt: new Date(NOW.getTime() - ageSeconds * 1000),
    });
  };

  beforeEach(() => {
    core = new FakeCoreFacts();
    location = new FakeLocationFacts();
    compliance = new FakeComplianceFacts();
    planner = new RecordingPlanner();
  });

  /** `M14` muc 1. */
  it('xe dang ranh va gan diem lay hang dung dau bang', async () => {
    core.vehicles = [vehicle({ id: 'gan' }), vehicle({ id: 'xa' })];
    observe('gan', HAI_PHONG);
    observe('xa', HA_NOI);

    const service = build(
      new TableRoutingPort(
        distances([
          [HAI_PHONG.latitude, HAI_PHONG.latitude, 2_000, 300],
          [HA_NOI.latitude, HAI_PHONG.latitude, 120_000, 7_200],
        ]),
      ),
    );

    const view = await service.suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN);
    expect(view.candidates[0]?.vehicleId).toBe('gan');
    expect(view.candidates[0]?.mode).toBe('CURRENT_NEAR');
    expect(view.candidates[0]?.emptyRoadMetresToPickup).toBe(2_000);
    expect(view.assignmentCreated).toBe(false);
  });

  /**
   * `M14` muc 2 — VA LA BAI QUAN TRONG NHAT CUA TEP NAY.
   *
   * `dang-cho-hang` DANG DUNG ngay canh diem lay hang, nhung no dang cho hang cua mot don khac va
   * se ket thuc o Ninh Binh (xa). `se-ranh-gan` dang o Ha Noi (xa) nhung chang cuoi cua no ket
   * thuc NGAY TAI diem lay hang.
   *
   * Ket qua dung: `se-ranh-gan` thang — vi diem xuat phat THAT su cua no cho don nay la cho no se
   * ranh, khong phai cho no dang dung.
   */
  it('xe se RANH ngay tai diem lay hang thang xe dang dung gan nhung ban', async () => {
    core.vehicles = [vehicle({ id: 'dang-cho-hang' }), vehicle({ id: 'se-ranh-gan' })];
    observe('dang-cho-hang', HAI_PHONG);
    observe('se-ranh-gan', HA_NOI);

    core.legs = [
      {
        run: run({ id: 'r1', vehicleId: 'dang-cho-hang' }),
        leg: leg({ id: 'l1', runId: 'r1', destinationLabel: 'Bai Ninh Binh' }),
      },
      {
        run: run({ id: 'r2', vehicleId: 'se-ranh-gan' }),
        leg: leg({ id: 'l2', runId: 'r2', destinationLabel: 'Kho Hai Phong' }),
      },
    ];

    const service = build(
      new TableRoutingPort(
        distances([
          // Tu cho `dang-cho-hang` SE ranh (Ninh Binh) den diem lay hang (Hai Phong): xa.
          [NINH_BINH.latitude, HAI_PHONG.latitude, 130_000, 8_000],
          // Tu cho `se-ranh-gan` SE ranh (Hai Phong) den diem lay hang: ngay tai cho.
          [HAI_PHONG.latitude, HAI_PHONG.latitude, 500, 120],
          [HA_NOI.latitude, HAI_PHONG.latitude, 120_000, 7_200],
        ]),
      ),
    );

    const view = await service.suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN);
    expect(view.candidates[0]?.vehicleId).toBe('se-ranh-gan');
    expect(view.candidates[0]?.mode).toBe('NEXT_FREE_NEAR');

    // Xe dang cho hang van HIEN RA, nhung mang co cat ngang va KHONG duoc dung dau.
    const interruptingIndex = view.candidates.findIndex(
      (candidate) => candidate.vehicleId === 'dang-cho-hang' && candidate.mode === 'CURRENT_NEAR',
    );
    expect(interruptingIndex).toBeGreaterThan(0);
    expect(view.candidates[interruptingIndex]?.suitability).toContain(
      'WOULD_INTERRUPT_COMMITTED_WORK',
    );
  });

  /** `M14` muc 3. */
  it('xe khong du tai trong bi LOAI kem ly do co kieu', async () => {
    core.vehicles = [vehicle({ id: 'nho', allowedPayloadKg: 3_000 }), vehicle({ id: 'to' })];
    observe('nho', HAI_PHONG);
    observe('to', HAI_PHONG);

    const service = build(new TableRoutingPort(new Map()));
    const request: DispatchSuggestionRequest = {
      ...EMPTY_DISPATCH_REQUEST,
      requirement: { payloadKg: 8_000, vehicleClass: null },
    };

    const view = await service.suggest('ord-1', request, ADMIN);
    expect(view.candidates.map((candidate) => candidate.vehicleId)).toEqual(['to']);
    expect(view.excluded).toEqual([
      expect.objectContaining({
        vehicleId: 'nho',
        reasons: ['VEHICLE_PAYLOAD_BELOW_REQUIREMENT'],
      }),
    ]);
  });

  /** `M1` — xe nha ngoai khong duoc vao bang de nghi doi xe noi bo. */
  it('xe nha ngoai bi LOAI', async () => {
    core.vehicles = [vehicle({ id: 'ngoai', operationalControl: 'EXTERNAL_CARRIER' })];
    observe('ngoai', HAI_PHONG);

    const view = await build(new TableRoutingPort(new Map())).suggest(
      'ord-1',
      EMPTY_DISPATCH_REQUEST,
      ADMIN,
    );
    expect(view.candidates).toHaveLength(0);
    expect(view.excluded[0]?.reasons).toEqual(['VEHICLE_NOT_INTERNALLY_OPERATED']);
  });

  /** `M14` muc 4 — vi tri qua han khong lang le tro thanh diem xuat phat. */
  it('vi tri qua han KHONG duoc dung lam diem xuat phat', async () => {
    core.vehicles = [vehicle({ id: 'mat-song' })];
    observe(
      'mat-song',
      HAI_PHONG,
      DEFAULT_TRANSPORT_DISPATCH_POLICY.currentLocationUsableSeconds + 60,
    );

    const view = await build(new TableRoutingPort(new Map())).suggest(
      'ord-1',
      EMPTY_DISPATCH_REQUEST,
      ADMIN,
    );
    expect(view.candidates).toHaveLength(0);
    expect(view.excluded[0]?.reasons).toEqual(['VEHICLE_HAS_NO_USABLE_ORIGIN']);
  });

  /** `M14` muc 5 + 12 — khong biet thi noi la khong biet, khong lap day bang so 0. */
  it('xe chua bam vi tri va khong co ke hoach -> LOAI kem ly do, khong phai 0 km', async () => {
    core.vehicles = [vehicle({ id: 'chua-bam' })];

    const view = await build(new TableRoutingPort(new Map())).suggest(
      'ord-1',
      EMPTY_DISPATCH_REQUEST,
      ADMIN,
    );
    expect(view.candidates).toHaveLength(0);
    expect(view.excluded[0]?.reasons).toEqual(['VEHICLE_HAS_NO_USABLE_ORIGIN']);
  });

  it('ke hoach con lai khuyet -> ly do CO TEN, khong phai mot cho trong', async () => {
    core.vehicles = [vehicle({ id: 'khuyet' })];
    observe('khuyet', HA_NOI);
    core.legs = [
      {
        run: run({ id: 'r1', vehicleId: 'khuyet' }),
        leg: leg({ id: 'l1', runId: 'r1', destinationLabel: 'Mot cho chua khai hang rao' }),
      },
    ];

    const view = await build(new TableRoutingPort(new Map())).suggest(
      'ord-1',
      EMPTY_DISPATCH_REQUEST,
      ADMIN,
    );
    // Chang cuoi khong giai duoc -> khong co cho "se ranh" -> chi con duong cat ngang.
    expect(view.candidates.some((candidate) => candidate.mode === 'NEXT_FREE_NEAR')).toBe(false);
    const interrupting = view.candidates.find((candidate) => candidate.mode === 'CURRENT_NEAR');
    expect(interrupting?.nextFree?.gaps).toContain('FINAL_DESTINATION_UNRESOLVED');
    expect(interrupting?.nextFree?.completeness).toBe('UNKNOWN');
  });

  /** `M14` muc 7 — nha cung cap hong thi TU CHOI, khong tu xep hang bang duong chim bay. */
  it('nha cung cap dinh tuyen hong -> tu choi CO KIEU, khong mot phan cong nao', async () => {
    core.vehicles = [vehicle({ id: 'a' })];
    observe('a', HAI_PHONG);

    const routing = new TableRoutingPort(new Map());
    routing.failure = {
      ok: false,
      failure: {
        reason: 'PROVIDER_UNAVAILABLE',
        providerId: 'bang-tay',
        detail: 'khong goi duoc',
      },
    };

    await expect(
      build(routing).suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN),
    ).rejects.toMatchObject({ reason: 'DISPATCH_ROUTING_UNAVAILABLE' });
    expect(planner.calls).toHaveLength(0);
  });

  it('vuot tran ma tran -> ma ly do RIENG', async () => {
    core.vehicles = [vehicle({ id: 'a' })];
    observe('a', HAI_PHONG);

    const routing = new TableRoutingPort(new Map());
    routing.failure = {
      ok: false,
      failure: { reason: 'REQUEST_BOUND_EXCEEDED', providerId: 'bang-tay', detail: 'qua tran' },
    };

    await expect(
      build(routing).suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN),
    ).rejects.toMatchObject({ reason: 'DISPATCH_MATRIX_BOUND_EXCEEDED' });
  });

  /** `M14` muc 8 + 10 — xem bang bao nhieu lan cung khong sinh mot vong chay nao. */
  it('xem bang nhieu lan KHONG ghi mot dong nao', async () => {
    core.vehicles = [vehicle({ id: 'a' })];
    observe('a', HAI_PHONG);
    const service = build(new TableRoutingPort(new Map()));

    await service.suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN);
    await service.suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN);

    expect(planner.calls).toHaveLength(0);
  });

  /** `M14` muc 13 — don khong ton tai thi fail-closed. */
  it('ma don la, khong thuoc he thong -> khong tim thay', async () => {
    await expect(
      build(new TableRoutingPort(new Map())).suggest('ord-la', EMPTY_DISPATCH_REQUEST, ADMIN),
    ).rejects.toMatchObject({ reason: 'DISPATCH_ORDER_NOT_FOUND' });
  });

  it('don da huy khong con la mot cau hoi dieu xe', async () => {
    core.orders = [order({ status: 'CANCELLED', cancelledAt: NOW.toISOString() })];
    await expect(
      build(new TableRoutingPort(new Map())).suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN),
    ).rejects.toMatchObject({ reason: 'DISPATCH_ORDER_CANCELLED' });
  });

  it('don cu KHONG co toa do -> tu choi CO KIEU, khong lay dai mot toa do', async () => {
    core.orders = [order({ originLabel: 'Mot cho chua khai hang rao', originPoint: null })];
    core.vehicles = [vehicle({ id: 'a' })];
    observe('a', HAI_PHONG);

    await expect(
      build(new TableRoutingPort(new Map())).suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN),
    ).rejects.toMatchObject({ reason: 'DISPATCH_ORDER_PICKUP_COORDINATES_MISSING' });
  });

  /**
   * `#277 M13` — toa do la du lieu vi tri cua MOT CON NGUOI.
   *
   * Ke toan thay moi con so cua bang (km rong, gio den, ly do) nhung KHONG thay chiec xe dang dung
   * o dau. Bai nay kiem CA HAI cho co toa do: khung nhin vi tri hien tai, va diem xuat phat.
   */
  it('nguoi khong co quyen doc duong di khong nhan duoc toa do xe', async () => {
    core.vehicles = [vehicle({ id: 'a' })];
    observe('a', HAI_PHONG);
    const service = build(new TableRoutingPort(new Map()));

    const forAdmin = await service.suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN);
    expect(forAdmin.candidates[0]?.currentLocation?.point).toEqual(HAI_PHONG);
    expect(forAdmin.candidates[0]?.origin.point).toEqual(HAI_PHONG);

    const forAccountant = await service.suggest('ord-1', EMPTY_DISPATCH_REQUEST, ACCOUNTANT);
    expect(forAccountant.candidates[0]?.currentLocation?.point).toBeNull();
    expect(forAccountant.candidates[0]?.currentLocation?.pointRedacted).toBe(true);
    expect(forAccountant.candidates[0]?.origin.point).toBeNull();
    expect(forAccountant.candidates[0]?.origin.pointRedacted).toBe(true);
    // Nhung con so quyet dinh VAN con — do la thu ho can de doi soat.
    expect(forAccountant.candidates[0]?.emptyRoadMetresToPickup).toBeGreaterThan(0);
    expect(forAccountant.candidates[0]?.currentLocation?.freshness).toBe('FRESH');
  });

  /**
   * `M14` muc 11 — ban dinh vi THO khong bi ghi de boi ket qua dinh tuyen.
   *
   * Cong dinh tuyen o day tra ve mot quang duong hoan toan khac; toa do trong khung nhin phai van
   * la toa do da quan sat duoc, khong phai mot diem nao do tren tuyen.
   */
  it('ket qua dinh tuyen KHONG ghi de ban dinh vi goc', async () => {
    core.vehicles = [vehicle({ id: 'a' })];
    observe('a', HA_NOI);

    const view = await build(
      new TableRoutingPort(distances([[HA_NOI.latitude, HAI_PHONG.latitude, 120_000, 7_200]])),
    ).suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN);

    expect(view.candidates[0]?.currentLocation?.point).toEqual(HA_NOI);
    expect(view.candidates[0]?.currentLocation?.observedAt).toBe(
      new Date(NOW.getTime() - 60_000).toISOString(),
    );
  });

  it('canh bao bao duong KHONG loai xe — #237 chua co nguon cho mot cong chan', async () => {
    core.vehicles = [vehicle({ id: 'dang-sua' })];
    observe('dang-sua', HAI_PHONG);
    compliance.readiness.set('dang-sua', {
      vehicleId: 'dang-sua',
      effectiveStatus: 'UNDER_MAINTENANCE',
      warnings: ['VEHICLE_HAS_OPEN_WORK_ORDER'],
      blocking: [],
    });

    const view = await build(new TableRoutingPort(new Map())).suggest(
      'ord-1',
      EMPTY_DISPATCH_REQUEST,
      ADMIN,
    );
    expect(view.candidates).toHaveLength(1);
    expect(view.candidates[0]?.suitability).toContain('VEHICLE_HAS_OPEN_WORK_ORDER');
    expect(view.excluded).toHaveLength(0);
  });

  /**
   * `#277 M3`: *"design must not issue N x M wasteful calls when fleet grows."*
   *
   * Nam chiec xe -> DUNG MOT lan goi ma tran, khong phai nam lan goi le. Bai nay cung khoa phep
   * gom theo ho so xe: hom nay moi ho so deu rong nhu nhau nen dung mot nhom hinh thanh, va neu
   * ai do bo phep gom di de goi tung o thi con so o day nhay len 5.
   */
  it('nam ung vien -> DUNG MOT lan goi ma tran', async () => {
    core.vehicles = ['a', 'b', 'c', 'd', 'e'].map((id) => vehicle({ id }));
    for (const id of ['a', 'b', 'c', 'd', 'e']) observe(id, HAI_PHONG);

    const routing = new TableRoutingPort(new Map());
    const view = await build(routing).suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN);

    expect(view.candidates).toHaveLength(5);
    expect(routing.matrixCalls).toBe(1);
  });

  it('bo khoa xep hang duoc cong bo ra ngoai de man hinh giai thich duoc thu tu', async () => {
    core.vehicles = [vehicle({ id: 'a' })];
    observe('a', HAI_PHONG);
    const view = await build(new TableRoutingPort(new Map())).suggest(
      'ord-1',
      EMPTY_DISPATCH_REQUEST,
      ADMIN,
    );
    expect(view.orderingKeys).toContain('EMPTY_ROAD_DISTANCE');
    expect(view.orderingKeys).toContain('NO_WORK_INTERRUPTION');
    expect(view.candidates[0]?.reasonSummary).toMatch(/Chay rong/);
  });
});

describe('xac nhan cua con nguoi', () => {
  let core: FakeCoreFacts;
  let location: FakeLocationFacts;
  let planner: RecordingPlanner;

  const build = (planning: TransportPlanningPolicy = multiOrderPlanningPolicy()): DispatchService =>
    new DispatchService(
      core,
      new TableRoutingPort(new Map()),
      planner,
      DEFAULT_TRANSPORT_DISPATCH_POLICY,
      planning,
      location,
      undefined,
      undefined,
      () => NOW,
    );

  beforeEach(() => {
    core = new FakeCoreFacts();
    location = new FakeLocationFacts();
    planner = new RecordingPlanner();
    core.vehicles = [vehicle({ id: 'a' })];
    location.samples.set('a', {
      sessionId: 'ses-a',
      point: HAI_PHONG,
      accuracyMetres: 10,
      source: 'DEVICE_GNSS',
      receivedAt: NOW,
    });
  });

  it('chuyen dung don + xe da chon cho bo lap ke hoach', async () => {
    const result = await build().commit('ord-1', 'a', EMPTY_DISPATCH_REQUEST, {
      actor: 'boss',
      canReadLocationHistory: true,
    });
    expect(planner.calls).toEqual([{ orderId: 'ord-1', vehicleId: 'a', actor: 'boss' }]);
    expect(result.runId).toBe('run-moi');
    expect(result.created).toBe(true);
  });

  /**
   * `M14` muc 9 — VA LA BAI DOT BIEN CHO CONG XAC NHAN.
   *
   * Giua luc bang duoc ve va luc boss bam, chiec xe da tro thanh xe nha ngoai. Lan tinh lai o
   * `commit()` phai bat duoc dieu do va tu choi — bo lan tinh lai di se lam bai nay do.
   */
  it('su that doi giua luc nhin va luc bam -> tu choi, KHONG ghi gi', async () => {
    const service = build();
    core.vehicles = [vehicle({ id: 'a', operationalControl: 'EXTERNAL_CARRIER' })];

    await expect(
      service.commit('ord-1', 'a', EMPTY_DISPATCH_REQUEST, {
        actor: 'boss',
        canReadLocationHistory: true,
      }),
    ).rejects.toMatchObject({ reason: 'DISPATCH_RECOMMENDATION_STALE' });
    expect(planner.calls).toHaveLength(0);
  });

  it('xe khong ton tai -> khong tim thay, khong ghi gi', async () => {
    await expect(
      build().commit('ord-1', 'xe-la', EMPTY_DISPATCH_REQUEST, {
        actor: 'boss',
        canReadLocationHistory: true,
      }),
    ).rejects.toBeInstanceOf(TransportDomainError);
    expect(planner.calls).toHaveLength(0);
  });
});

/**
 * CONG CHE DO GOM NHOM — `#294 S1`, `S-OWNER-01`, `S-OWNER-02`, `S-OWNER-03`.
 *
 * ===========================================================================
 * DAY LA BO BAI DOT BIEN CUA CA LANE S
 *
 * Xoa mot dong `this.requireMultiOrderRun(orderId)` khoi `DispatchService` thi bo nay phai DO. Do
 * la ca muc dich cua no: `S-OWNER-03` cam giau cong chan trong React, va cach duy nhat de chung
 * minh cong nam o tang mien la goi THANG vao tang mien — khong qua HTTP, khong qua man hinh.
 *
 * Bai "che do ONE" dung `DEFAULT_RUN_GROUPING` nhap tu `planning-policy.ts` chu khong go tay chuoi
 * `'ONE_ORDER_PER_RUN'` vao day. Neu ngay nao do ai do doi mac dinh cua san pham, bai nay se doi
 * theo va noi ra — thay vi tiep tuc xanh trong khi kiem mot hang so khong con la mac dinh nua.
 */
describe('cong che do gom nhom', () => {
  let core: FakeCoreFacts;
  let location: FakeLocationFacts;
  let planner: RecordingPlanner;

  const build = (grouping: RunGrouping): DispatchService =>
    new DispatchService(
      core,
      new TableRoutingPort(new Map()),
      planner,
      DEFAULT_TRANSPORT_DISPATCH_POLICY,
      planningPolicy(grouping),
      location,
      undefined,
      undefined,
      () => NOW,
    );

  const boss: DispatchCaller = { actor: 'boss', canReadLocationHistory: true };

  beforeEach(() => {
    core = new FakeCoreFacts();
    location = new FakeLocationFacts();
    planner = new RecordingPlanner();
    core.vehicles = [vehicle({ id: 'a' })];
    location.samples.set('a', {
      sessionId: 'ses-a',
      point: HAI_PHONG,
      accuracyMetres: 10,
      source: 'DEVICE_GNSS',
      receivedAt: NOW,
    });
  });

  /** `#294` bai 1 — khach khong khai gi thi giai ra che do khong gom don. */
  it('khach khong khai gi -> mac dinh la ONE_ORDER_PER_RUN', () => {
    expect(DEFAULT_RUN_GROUPING).toBe('ONE_ORDER_PER_RUN');
  });

  /**
   * `#294` bai 3 — GOI THANG VAO TANG MIEN, khong qua man hinh nao.
   *
   * Day la cau tra loi cho `S-OWNER-03`: *"A caller must not be able to bypass the tenant
   * run-grouping rule by invoking the candidate endpoint directly."*
   */
  it('che do ONE: goi thang suggest() van bi tu choi CO MA', async () => {
    await expect(
      build(DEFAULT_RUN_GROUPING).suggest('ord-1', EMPTY_DISPATCH_REQUEST, boss),
    ).rejects.toMatchObject({
      kind: 'DENIED',
      reason: 'DISPATCH_MULTI_ORDER_DISABLED',
    });
  });

  /**
   * FAIL-CLOSED DUNG THU TU: cong chinh sach chay TRUOC khi hoi don co that khong.
   *
   * Neu hoi don truoc, mot khach che do ONE go bua ma don se phan biet duoc 404 voi 403 — tuc mot
   * be mat khach khong bat van tra loi duoc cau hoi "don nao co that". Hai ma don duoi day, mot co
   * that mot khong, phai ra CUNG mot ma tu choi.
   */
  it('che do ONE: don khong ton tai cung ra dung ma do, khong ro ri su ton tai cua don', async () => {
    const service = build('ONE_ORDER_PER_RUN');
    const real = await service.suggest('ord-1', EMPTY_DISPATCH_REQUEST, boss).catch((e) => e);
    const fake = await service.suggest('ord-bia', EMPTY_DISPATCH_REQUEST, boss).catch((e) => e);
    expect(real.reason).toBe('DISPATCH_MULTI_ORDER_DISABLED');
    expect(fake.reason).toBe(real.reason);
  });

  /** `#294` bai 5 — va la doi chung am cua bai 3: cung ma do, doi che do thi chay duoc. */
  it('che do MULTI: suggest() chay va tra ve mot bang de nghi', async () => {
    const view = await build('MULTI_ORDER_RUN').suggest('ord-1', EMPTY_DISPATCH_REQUEST, boss);
    expect(view.orderId).toBe('ord-1');
    expect(view.assignmentCreated).toBe(false);
  });

  /** `#294` bai 2 + 6 — che do ONE khong cham mot cong nao: khong doc don, khong ghi gi. */
  it('che do ONE: khong doc su that nao va khong ghi gi', async () => {
    await build('ONE_ORDER_PER_RUN')
      .suggest('ord-1', EMPTY_DISPATCH_REQUEST, boss)
      .catch(() => undefined);
    expect(core.orderReads).toHaveLength(0);
    expect(planner.calls).toHaveLength(0);
  });

  /** `#294` bai 3 — duong GHI cung bi chan, khong chi duong doc. */
  it('che do ONE: commit() bi tu choi va bo lap ke hoach khong duoc goi', async () => {
    await expect(
      build('ONE_ORDER_PER_RUN').commit('ord-1', 'a', EMPTY_DISPATCH_REQUEST, boss),
    ).rejects.toMatchObject({ reason: 'DISPATCH_MULTI_ORDER_DISABLED' });
    expect(planner.calls).toHaveLength(0);
  });

  /**
   * CONG RIENG CUA `commit()`, va day la bai DUY NHAT chung minh no ton tai.
   *
   * `commit()` goi `suggest()` de tinh lai, nen cong cua `suggest()` mot minh cung du de mot lan
   * xac nhan o che do ONE bi tu choi — tuc bai ngay tren VAN XANH ke ca khi cong rieng cua
   * `commit()` bi go. Cai phan biet duoc hai truong hop la THU TU: khong co cong rieng, dong
   * `findVehicle()` chay truoc va mot ma xe khong ton tai se ra `DISPATCH_VEHICLE_NOT_FOUND` —
   * mot cau tra loi ro ri rang he thong co tra loi cau hoi "xe nay co that khong" cho mot khach
   * khong bat nghiep vu nay.
   */
  it('che do ONE: commit() voi xe KHONG ton tai van ra ma chinh sach, khong phai ma "khong tim thay xe"', async () => {
    await expect(
      build('ONE_ORDER_PER_RUN').commit('ord-1', 'xe-khong-co', EMPTY_DISPATCH_REQUEST, boss),
    ).rejects.toMatchObject({ reason: 'DISPATCH_MULTI_ORDER_DISABLED' });
    expect(planner.calls).toHaveLength(0);
  });

  /**
   * `#294` bai 14 — CHE DO DOI GIUA LUC DE NGHI VA LUC XAC NHAN.
   *
   * Mot doi tuong chinh sach DUY NHAT di qua ca hai lan goi, va bi doi o giua. Neu `commit()` tin
   * vao ket qua cua `suggest()` thay vi doc lai, bai nay xanh mot cach sai — nen no la bai khoa
   * yeu cau *"reread tenant run-grouping policy"* cua `S5` buoc 2.
   */
  it('MULTI luc de nghi, ONE luc xac nhan -> xac nhan bi tu choi', async () => {
    const policy: { grouping: RunGrouping } & Omit<TransportPlanningPolicy, 'grouping'> = {
      grouping: 'MULTI_ORDER_RUN',
      depots: [],
      closure: { idleHours: null },
      sweep: {
        intervalSeconds: DEFAULT_RUN_CLOSURE_SWEEP_INTERVAL_SECONDS,
        batchSize: DEFAULT_RUN_CLOSURE_SWEEP_BATCH_SIZE,
      },
    };
    const service = new DispatchService(
      core,
      new TableRoutingPort(new Map()),
      planner,
      DEFAULT_TRANSPORT_DISPATCH_POLICY,
      policy,
      location,
      undefined,
      undefined,
      () => NOW,
    );

    const view = await service.suggest('ord-1', EMPTY_DISPATCH_REQUEST, boss);
    expect(view.candidates.length).toBeGreaterThan(0);

    policy.grouping = 'ONE_ORDER_PER_RUN';

    await expect(service.commit('ord-1', 'a', EMPTY_DISPATCH_REQUEST, boss)).rejects.toMatchObject({
      reason: 'DISPATCH_MULTI_ORDER_DISABLED',
    });
    expect(planner.calls).toHaveLength(0);
  });
});

/**
 * TOA DO DON LA SU THAT CUA DIEM LAY (#379).
 *
 * ===========================================================================
 * MOI BAI O DAY LAM LECH NHAN CHU VA TOA DO CUA CUNG MOT DON
 *
 * Do la cach duy nhat chung minh he thong doc TOA DO chu khong doc NHAN: khi hai thu trung nhau,
 * mot ban cai dat van suy tu nhan cung xanh. Hoan lai duong cu (`resolvePlaceByLabel(originLabel)`
 * cho diem lay, hay nhan chang cho chang co don) thi bo nay phai do.
 */
describe('toa do don la su that cua diem lay (#379)', () => {
  let core: FakeCoreFacts;
  let location: FakeLocationFacts;
  let planner: RecordingPlanner;

  interface BuildOptions {
    readonly routing?: TransportRoutingPort;
    /** `false` = khach khong bat `transport-proof`: khong vi tri xe, khong so tra cuu hang rao. */
    readonly withLocation?: boolean;
    readonly maxProjectionRouteCalls?: number;
  }

  const build = (options: BuildOptions = {}): DispatchService =>
    new DispatchService(
      core,
      options.routing ?? new TableRoutingPort(new Map()),
      planner,
      {
        ...DEFAULT_TRANSPORT_DISPATCH_POLICY,
        maxProjectionRouteCalls:
          options.maxProjectionRouteCalls ??
          DEFAULT_TRANSPORT_DISPATCH_POLICY.maxProjectionRouteCalls,
      },
      multiOrderPlanningPolicy(),
      options.withLocation === false ? undefined : location,
      undefined,
      undefined,
      () => NOW,
    );

  const observe = (vehicleId: string, point: typeof HA_NOI): void => {
    location.samples.set(vehicleId, {
      sessionId: `ses-${vehicleId}`,
      point,
      accuracyMetres: 10,
      source: 'DEVICE_GNSS',
      receivedAt: new Date(NOW.getTime() - 60_000),
    });
  };

  const pickupAt = (point: typeof HA_NOI): DispatchSuggestionRequest => ({
    ...EMPTY_DISPATCH_REQUEST,
    pickup: { kind: 'POINT', latitude: point.latitude, longitude: point.longitude },
  });

  beforeEach(() => {
    core = new FakeCoreFacts();
    location = new FakeLocationFacts();
    planner = new RecordingPlanner();
    core.vehicles = [vehicle({ id: 'a' })];
    observe('a', HAI_PHONG);
  });

  it('toa do THANG nhan: nhan noi Ha Noi, toa do o Hai Phong -> lay hang o Hai Phong', async () => {
    core.orders = [order({ originLabel: 'Kho Ha Noi', originPoint: HAI_PHONG })];
    const routing = new TableRoutingPort(
      distances([
        [HAI_PHONG.latitude, HAI_PHONG.latitude, 700, 90],
        [HAI_PHONG.latitude, HA_NOI.latitude, 120_000, 7_200],
      ]),
    );

    const view = await build({ routing }).suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN);

    expect(view.pickup.resolution).toBe('PICKUP_FROM_ORDER_COORDINATES');
    // Nhan di kem de HIEN THI, toa do la cua don — khong phai cua hang rao "Kho Ha Noi".
    expect(view.pickup.place).toEqual({
      point: HAI_PHONG,
      source: 'ORDER_PICKUP_POINT',
      label: 'Kho Ha Noi',
      geofenceId: null,
      siteId: null,
    });
    // Va bang xep hang do bang chinh toa do do.
    expect(view.candidates[0]?.emptyRoadMetresToPickup).toBe(700);
  });

  it('nhan khong khop hang rao nao van giai duoc nho toa do cua don', async () => {
    core.orders = [
      order({ originLabel: 'Bai tap ket moi, chua khai hang rao', originPoint: HAI_PHONG }),
    ];

    const view = await build().suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN);

    expect(view.pickup.place.point).toEqual(HAI_PHONG);
    expect(view.candidates.map((candidate) => candidate.vehicleId)).toEqual(['a']);
  });

  /**
   * BAI DOT BIEN CUA #379: nhan `Kho Hai Phong` KHOP mot hang rao, nen duong cu se giai ra ngay.
   * Don nay khong co toa do -> phai tu choi, khong mot lan dinh tuyen nao, khong ghi gi.
   */
  it('don cu KHONG roi ve nhan chu, ke ca khi nhan trung ten mot hang rao', async () => {
    core.orders = [
      order({ originLabel: 'Kho Hai Phong', originPoint: null, destinationPoint: null }),
    ];
    const routing = new TableRoutingPort(new Map());

    await expect(
      build({ routing }).suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN),
    ).rejects.toMatchObject({
      kind: 'INVALID',
      reason: 'DISPATCH_ORDER_PICKUP_COORDINATES_MISSING',
    });
    expect(routing.matrixCalls).toBe(0);
    expect(planner.calls).toHaveLength(0);
  });

  it('toa do hong luu tren don cung bi tu choi, khong dung lam diem lay', async () => {
    core.orders = [order({ originPoint: { latitude: 0, longitude: 0 } })];

    await expect(build().suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN)).rejects.toMatchObject({
      reason: 'DISPATCH_ORDER_PICKUP_COORDINATES_MISSING',
    });
  });

  it('tham chieu tuong minh POINT thang toa do cua don', async () => {
    const view = await build().suggest('ord-1', pickupAt(HA_NOI), ADMIN);

    expect(view.pickup.resolution).toBe('PICKUP_FROM_EXPLICIT_REQUEST');
    expect(view.pickup.place.source).toBe('EXPLICIT_REQUEST_POINT');
    expect(view.pickup.place.point).toEqual(HA_NOI);
  });

  it('tham chieu tuong minh GEOFENCE thang toa do cua don', async () => {
    const view = await build().suggest(
      'ord-1',
      { ...EMPTY_DISPATCH_REQUEST, pickup: { kind: 'GEOFENCE', geofenceId: 'gf-nb' } },
      ADMIN,
    );

    expect(view.pickup.resolution).toBe('PICKUP_FROM_EXPLICIT_REQUEST');
    expect(view.pickup.place.source).toBe('EXPLICIT_REQUEST_GEOFENCE');
    expect(view.pickup.place.point).toEqual(NINH_BINH);
  });

  it('don cu VAN dieu duoc khi nguoi dieu xe chi dinh diem lay tuong minh', async () => {
    core.orders = [order({ originPoint: null, destinationPoint: null })];

    const view = await build().suggest('ord-1', pickupAt(HAI_PHONG), ADMIN);

    expect(view.pickup.place.point).toEqual(HAI_PHONG);
    expect(view.candidates.map((candidate) => candidate.vehicleId)).toEqual(['a']);
  });

  /**
   * Khong `transport-proof` thi so tra cuu hang rao RONG — duong cu theo nhan se luon
   * `PICKUP_LABEL_NO_MATCH` va nem. Toa do cua don khong phu thuoc capability do.
   */
  it('khach khong bat transport-proof: diem lay VAN giai duoc tu toa do don', async () => {
    const view = await build({ withLocation: false }).suggest(
      'ord-1',
      EMPTY_DISPATCH_REQUEST,
      ADMIN,
    );

    expect(view.pickup.resolution).toBe('PICKUP_FROM_ORDER_COORDINATES');
    expect(view.pickup.place.point).toEqual(HAI_PHONG);
    expect(view.candidates).toHaveLength(0);
    expect(view.excluded[0]?.reasons).toEqual(['VEHICLE_HAS_NO_USABLE_ORIGIN']);
  });

  /**
   * KHONG `transport-proof`, nhung xe BAN co chang cuoi toi mot don CO toa do: phep chieu "xe se
   * ranh o dau" lay diem giao cua don — khong can vi tri xe, khong can so hang rao. Xe ranh thi van
   * bi loai vi khong co diem xuat phat nao. Gio ranh khong tinh duoc (khong biet xe dang o dau) nen
   * `availableAt` la `null` va nguoi dieu xe thay dung dieu do; do la hanh vi CO Y, khong phai lo.
   */
  it('khach khong bat transport-proof: xe ranh bi loai, xe ban hien NEXT_FREE_NEAR khong gio ranh', async () => {
    core.vehicles = [vehicle({ id: 'a' }), vehicle({ id: 'ban' })];
    core.orders = [
      order(),
      order({ id: 'ord-2', code: 'ORD-2', originPoint: HA_NOI, destinationPoint: NINH_BINH }),
    ];
    core.legs = [
      {
        run: run({ id: 'r1', vehicleId: 'ban' }),
        leg: leg({ id: 'l1', runId: 'r1', orderId: 'ord-2', destinationLabel: 'Kho Hai Phong' }),
      },
    ];

    const view = await build({ withLocation: false }).suggest(
      'ord-1',
      EMPTY_DISPATCH_REQUEST,
      ADMIN,
    );

    expect(view.excluded).toEqual([
      expect.objectContaining({ vehicleId: 'a', reasons: ['VEHICLE_HAS_NO_USABLE_ORIGIN'] }),
    ]);
    expect(view.candidates).toHaveLength(1);
    const [busy] = view.candidates;
    expect(busy).toMatchObject({
      vehicleId: 'ban',
      mode: 'NEXT_FREE_NEAR',
      availableAt: null,
      pickupEtaAt: null,
      currentLocation: null,
    });
    // Diem giao cua DON (Ninh Binh), khong phai nhan chang ("Kho Hai Phong") — so hang rao rong.
    expect(busy?.origin).toMatchObject({ point: NINH_BINH, source: 'ORDER_DELIVERY_POINT' });
    expect(busy?.nextFree?.gaps).toContain('CURRENT_POSITION_UNKNOWN');
  });

  it('xac nhan tren don cu bi chan TRUOC bo lap ke hoach', async () => {
    core.orders = [order({ originPoint: null, destinationPoint: null })];

    await expect(build().commit('ord-1', 'a', EMPTY_DISPATCH_REQUEST, ADMIN)).rejects.toMatchObject(
      { reason: 'DISPATCH_ORDER_PICKUP_COORDINATES_MISSING' },
    );
    expect(planner.calls).toHaveLength(0);
  });

  it('chang CO TAI di toi diem GIAO cua don, ke ca khi nhan chang trung mot hang rao khac', async () => {
    core.vehicles = [vehicle({ id: 'ban' })];
    observe('ban', HA_NOI);
    core.orders = [
      order(),
      order({
        id: 'ord-2',
        code: 'ORD-2',
        originPoint: HA_NOI,
        destinationPoint: HAI_PHONG,
        destinationLabel: 'Cang Hai Phong moi',
      }),
    ];
    core.legs = [
      {
        run: run({ id: 'r1', vehicleId: 'ban' }),
        // Nhan chang KHOP hang rao Ninh Binh — duong cu se cho xe "ranh" o Ninh Binh.
        leg: leg({ id: 'l1', runId: 'r1', orderId: 'ord-2', destinationLabel: 'Bai Ninh Binh' }),
      },
    ];
    const routing = new TableRoutingPort(
      distances([
        [HAI_PHONG.latitude, HAI_PHONG.latitude, 500, 120],
        [NINH_BINH.latitude, HAI_PHONG.latitude, 130_000, 8_000],
      ]),
    );

    const view = await build({ routing }).suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN);
    const afterWork = view.candidates.find((candidate) => candidate.mode === 'NEXT_FREE_NEAR');

    expect(afterWork?.origin).toMatchObject({
      point: HAI_PHONG,
      source: 'ORDER_DELIVERY_POINT',
      label: 'Cang Hai Phong moi',
    });
    expect(afterWork?.emptyRoadMetresToPickup).toBe(500);
  });

  it('chang RONG ngay truoc chang co tai di toi diem LAY cua don ke tiep', async () => {
    core.vehicles = [vehicle({ id: 'ban' })];
    observe('ban', HA_NOI);
    core.orders = [
      order(),
      order({ id: 'ord-3', code: 'ORD-3', originPoint: NINH_BINH, destinationPoint: HAI_PHONG }),
    ];
    const r1 = run({ id: 'r1', vehicleId: 'ban' });
    core.legs = [
      {
        run: r1,
        // Nhan chang rong KHOP hang rao Ha Noi — duong cu se tinh chang rong la "dung tai cho".
        leg: leg({
          id: 'l-rong',
          runId: 'r1',
          sequence: 1,
          kind: 'EMPTY',
          status: 'PLANNED',
          destinationLabel: 'Kho Ha Noi',
        }),
      },
      {
        run: r1,
        leg: leg({
          id: 'l-tai',
          runId: 'r1',
          sequence: 2,
          status: 'PLANNED',
          orderId: 'ord-3',
          destinationLabel: 'Kho Ha Noi',
        }),
      },
    ];
    const routing = new TableRoutingPort(new Map());

    await build({ routing }).suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN);

    expect(routing.routeCalls.map((call) => [call.origin, call.destination])).toEqual([
      [HA_NOI, NINH_BINH],
      [NINH_BINH, HAI_PHONG],
    ]);
  });

  it('chang cua don cu (khong toa do) VAN giai theo nhan chang — phep chieu, khong phai diem lay', async () => {
    core.vehicles = [vehicle({ id: 'ban' })];
    observe('ban', HA_NOI);
    core.orders = [
      order(),
      order({ id: 'ord-cu', code: 'ORD-CU', originPoint: null, destinationPoint: null }),
    ];
    core.legs = [
      {
        run: run({ id: 'r1', vehicleId: 'ban' }),
        leg: leg({ id: 'l1', runId: 'r1', orderId: 'ord-cu', destinationLabel: 'Kho Hai Phong' }),
      },
    ];

    const view = await build().suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN);
    const afterWork = view.candidates.find((candidate) => candidate.mode === 'NEXT_FREE_NEAR');

    expect(afterWork?.origin).toMatchObject({ point: HAI_PHONG, source: 'GEOFENCE_LABEL_EXACT' });
  });

  it('moi don doc DUNG MOT lan moi luot tinh, ke ca don dang dieu', async () => {
    core.vehicles = [vehicle({ id: 'x1' }), vehicle({ id: 'x2' })];
    observe('x1', HA_NOI);
    observe('x2', HA_NOI);
    core.orders = [
      order(),
      order({ id: 'ord-2', code: 'ORD-2', originPoint: HA_NOI, destinationPoint: NINH_BINH }),
    ];
    const r1 = run({ id: 'r1', vehicleId: 'x1' });
    core.legs = [
      // Chang rong + chang co tai cua CUNG don `ord-2` — hai lan hoi, mot lan doc.
      { run: r1, leg: leg({ id: 'l1', runId: 'r1', sequence: 1, kind: 'EMPTY' }) },
      { run: r1, leg: leg({ id: 'l2', runId: 'r1', sequence: 2, orderId: 'ord-2' }) },
      // Chang tro toi chinh don dang dieu — da doc o dau luot, khong doc lai.
      {
        run: run({ id: 'r2', vehicleId: 'x2' }),
        leg: leg({ id: 'l3', runId: 'r2', orderId: 'ord-1' }),
      },
    ];

    await build().suggest('ord-1', EMPTY_DISPATCH_REQUEST, ADMIN);

    expect([...core.orderReads].sort()).toEqual(['ord-1', 'ord-2']);
  });

  it('ngan sach dinh tuyen giu nguyen nghia: doc don khong ton lan goi nao', async () => {
    core.vehicles = [vehicle({ id: 'ban' })];
    observe('ban', HA_NOI);
    core.orders = [
      order(),
      order({ id: 'ord-3', code: 'ORD-3', originPoint: NINH_BINH, destinationPoint: HAI_PHONG }),
    ];
    const r1 = run({ id: 'r1', vehicleId: 'ban' });
    core.legs = [
      { run: r1, leg: leg({ id: 'l1', runId: 'r1', sequence: 1, kind: 'EMPTY' }) },
      { run: r1, leg: leg({ id: 'l2', runId: 'r1', sequence: 2, orderId: 'ord-3' }) },
    ];
    const routing = new TableRoutingPort(new Map());

    const view = await build({ routing, maxProjectionRouteCalls: 1 }).suggest(
      'ord-1',
      EMPTY_DISPATCH_REQUEST,
      ADMIN,
    );

    // Hai chang, ngan sach MOT: dung mot doan duoc dinh tuyen, doan kia thanh mot khoang trong co ten.
    expect(routing.routeCalls).toHaveLength(1);
    const afterWork = view.candidates.find((candidate) => candidate.mode === 'NEXT_FREE_NEAR');
    expect(afterWork?.nextFree?.gaps).toContain('ROUTING_UNAVAILABLE_FOR_REMAINING_LEG');
    expect(afterWork?.origin.point).toEqual(HAI_PHONG);
  });
});
