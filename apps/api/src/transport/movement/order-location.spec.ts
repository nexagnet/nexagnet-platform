import { beforeEach, describe, expect, it } from 'vitest';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import type { TelemetryService } from '../../observability/telemetry.service.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import type { GeoPoint } from '../geo/geo-point.js';
import { TransportDomainError } from '../transport.errors.js';
import { InMemoryTripRepository } from '../trips/trip.repository.js';
import { InMemoryMovementRepository } from './movement.repository.js';
import { MovementService, type CreateOrderCommand } from './movement.service.js';

/**
 * TOA DO DIEM LAY / DIEM GIAO cua don (#379), o tang MIEN.
 *
 * Ba dieu phai dung cung luc:
 *   1. diem hop le di NGUYEN VEN vao `Order` (khong lam tron, khong doi thu tu);
 *   2. diem hong bi `parseGeoPoint` tu choi voi ma RIENG cho tung dau, va KHONG co gi duoc ghi;
 *   3. duong noi bo khong co diem ghi `null` -- khong bao gio bia -- va nhat ky quyet dinh noi ro
 *      tung truong hop ma KHONG mang toa do.
 */

const ACTOR = 'ke-toan';
const POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;

const DINH_VU: GeoPoint = { latitude: 20.826401234, longitude: 106.775201234 };
const TAN_PHU_HUNG: GeoPoint = { latitude: 21.617, longitude: 105.817 };

interface RecordedDecision {
  readonly point: string;
  readonly outcome: string;
  readonly reason: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

describe('MovementService.createOrder — toa do diem lay / diem giao (#379)', () => {
  let repository: InMemoryMovementRepository;
  let auditLog: InMemoryAuditLogRepository;
  let decisions: RecordedDecision[];
  let service: MovementService;

  beforeEach(() => {
    repository = new InMemoryMovementRepository();
    auditLog = new InMemoryAuditLogRepository();
    decisions = [];
    const telemetry = {
      decision: (input: RecordedDecision) => {
        decisions.push(input);
      },
    } as unknown as TelemetryService;
    service = new MovementService(
      repository,
      new InMemoryFleetRepository(),
      new AuditLogService(auditLog),
      POLICY,
      undefined,
      telemetry,
    );
  });

  const command = (patch: Partial<CreateOrderCommand> = {}): CreateOrderCommand => ({
    code: 'ORD-379',
    originLabel: 'Nhà máy thép Đình Vũ',
    destinationLabel: 'Kho Nhựa Tân Phú Hưng',
    businessDate: '2026-09-23',
    originPoint: DINH_VU,
    destinationPoint: TAN_PHU_HUNG,
    ...patch,
  });

  const locationDecisions = () => decisions.filter((entry) => entry.point === 'order.location');

  const failureOf = async (run: () => Promise<unknown>): Promise<TransportDomainError> => {
    try {
      await run();
    } catch (error) {
      if (error instanceof TransportDomainError) return error;
      throw error;
    }
    throw new Error('mong doi mot TransportDomainError, nhung loi goi da thanh cong');
  };

  /** Mot toa do nao lot vao nhat ky thi chuoi cua no se hien ra o day. */
  const assertNoCoordinates = (detail: Readonly<Record<string, unknown>> | undefined) => {
    const serialized = JSON.stringify(detail ?? {});
    for (const value of [
      DINH_VU.latitude,
      DINH_VU.longitude,
      TAN_PHU_HUNG.latitude,
      TAN_PHU_HUNG.longitude,
    ]) {
      expect(serialized).not.toContain(String(value));
    }
    expect(Object.values(detail ?? {}).every((value) => typeof value !== 'number')).toBe(true);
  };

  it('diem hop le di NGUYEN VEN vao don tra ve va vao kho', async () => {
    const order = await service.createOrder(command(), ACTOR);

    expect(order.originPoint).toEqual(DINH_VU);
    expect(order.destinationPoint).toEqual(TAN_PHU_HUNG);
    expect((await repository.findOrder(order.id))?.originPoint).toEqual(DINH_VU);
    // Nhan van la nhan -- khong bi toa do ghi de, va nguoc lai.
    expect(order.originLabel).toBe('Nhà máy thép Đình Vũ');
  });

  it('chi giu hai so cua diem: khoa la cua nguoi goi khong vao duoc don', async () => {
    const noisy = { ...DINH_VU, accuracyMetres: 5, source: 'gps' } as GeoPoint;

    const order = await service.createOrder(command({ originPoint: noisy }), ACTOR);

    expect(order.originPoint).toStrictEqual(DINH_VU);
  });

  it('ghi quyet dinh ORDER_LOCATION_CAPTURED, co `orderId`, KHONG co toa do', async () => {
    const order = await service.createOrder(command(), ACTOR);

    const [decision] = locationDecisions();
    expect(locationDecisions()).toHaveLength(1);
    expect(decision).toMatchObject({
      point: 'order.location',
      outcome: 'allowed',
      reason: 'ORDER_LOCATION_CAPTURED',
      detail: {
        orderId: order.id,
        hasOriginPoint: true,
        hasDestinationPoint: true,
        originOutsideOperatingArea: false,
        destinationOutsideOperatingArea: false,
      },
    });
    assertNoCoordinates(decision?.detail);
  });

  it('diem ngoai vung hoat dong chi GAN CO, khong tu choi', async () => {
    const kansas = { latitude: 39.0997, longitude: -94.5786 };

    const order = await service.createOrder(command({ destinationPoint: kansas }), ACTOR);

    expect(order.destinationPoint).toEqual(kansas);
    expect(locationDecisions()[0]?.detail).toMatchObject({
      originOutsideOperatingArea: false,
      destinationOutsideOperatingArea: true,
    });
  });

  it('duong noi bo KHONG co diem -> ca hai `null`, quyet dinh ORDER_LOCATION_ABSENT', async () => {
    const order = await service.createOrder(
      command({ originPoint: undefined, destinationPoint: undefined }),
      ACTOR,
    );

    expect(order.originPoint).toBeNull();
    expect(order.destinationPoint).toBeNull();
    expect(locationDecisions()).toEqual([
      expect.objectContaining({
        outcome: 'allowed',
        reason: 'ORDER_LOCATION_ABSENT',
        detail: expect.objectContaining({ hasOriginPoint: false, hasDestinationPoint: false }),
      }),
    ]);
  });

  it('thieu MOT diem van la ABSENT — khong goi mot don nua-co-toa-do la "da ghi"', async () => {
    const order = await service.createOrder(command({ destinationPoint: null }), ACTOR);

    expect(order.originPoint).toEqual(DINH_VU);
    expect(order.destinationPoint).toBeNull();
    expect(locationDecisions()[0]?.reason).toBe('ORDER_LOCATION_ABSENT');
  });

  const BROKEN: ReadonlyArray<readonly [string, GeoPoint, string]> = [
    ['null island (0, 0)', { latitude: 0, longitude: 0 }, 'NULL_ISLAND'],
    ['vi do ngoai khoang', { latitude: 91, longitude: 106 }, 'LATITUDE_OUT_OF_RANGE'],
    ['kinh do ngoai khoang', { latitude: 21, longitude: 181 }, 'LONGITUDE_OUT_OF_RANGE'],
    ['vi do NaN', { latitude: Number.NaN, longitude: 106 }, 'LATITUDE_NOT_FINITE'],
    [
      'kinh do vo cuc',
      { latitude: 21, longitude: Number.POSITIVE_INFINITY },
      'LONGITUDE_NOT_FINITE',
    ],
  ];

  describe.each([
    ['originPoint', 'ORDER_ORIGIN_POINT_INVALID', 'ORDER_ORIGIN_POINT_REJECTED', 'ORIGIN'],
    [
      'destinationPoint',
      'ORDER_DESTINATION_POINT_INVALID',
      'ORDER_DESTINATION_POINT_REJECTED',
      'DESTINATION',
    ],
  ] as const)('%s hong', (field, errorReason, decisionReason, role) => {
    it.each(BROKEN)('%s -> %s va KHONG ghi gi', async (_name, point, rejection) => {
      const failure = await failureOf(() =>
        service.createOrder(command({ [field]: point }), ACTOR),
      );

      expect(failure.kind).toBe('INVALID');
      expect(failure.reason).toBe(errorReason);
      expect(failure.message).toContain(rejection);
      expect(await repository.listOrders()).toEqual([]);
      expect(await auditLog.list({ entityType: 'TransportOrder' })).toEqual([]);

      const [decision] = locationDecisions();
      expect(locationDecisions()).toHaveLength(1);
      expect(decision).toMatchObject({
        outcome: 'denied',
        reason: decisionReason,
        detail: { role, rejection },
      });
      assertNoCoordinates(decision?.detail);
    });
  });

  /**
   * BIEN NULL ISLAND: `parseGeoPoint` chi tu choi khi CA HAI truc `< 1e-9`. Diem (1e-9, 0) nam
   * dung tren bien va phai DUOC NHAN — CHECK `TransportOrder_*_not_null_island` dung `>=` de nhan
   * no y het (bai Postgres that: MV-IT-379-05). (0, 0) bi tu choi o ca hai tang.
   */
  it.each([
    ['originPoint', { latitude: 1e-9, longitude: 0 }],
    ['destinationPoint', { latitude: 0, longitude: 1e-9 }],
  ] as const)('bien null island: %s = %o duoc nhan nguyen ven', async (field, point) => {
    const order = await service.createOrder(command({ [field]: point }), ACTOR);

    expect(order[field]).toStrictEqual(point);
    expect(locationDecisions()[0]?.reason).toBe('ORDER_LOCATION_CAPTURED');
  });

  it('diem hong duoc bao TRUOC ma trung: day la loi hinh dang, khong phu thuoc du lieu', async () => {
    await service.createOrder(command(), ACTOR);

    const failure = await failureOf(() =>
      service.createOrder(command({ originPoint: { latitude: 0, longitude: 0 } }), ACTOR),
    );

    expect(failure.reason).toBe('ORDER_ORIGIN_POINT_INVALID');
  });

  it('sua NHAN qua updateOrder giu nguyen toa do — nhan khong bao gio dan duong cho diem', async () => {
    const order = await service.createOrder(command(), ACTOR);

    const renamed = await service.updateOrder(
      order.id,
      { originLabel: 'Bãi xe Hà Nội', destinationLabel: 'Kho khác' },
      ACTOR,
    );

    expect(renamed.originLabel).toBe('Bãi xe Hà Nội');
    expect(renamed.originPoint).toEqual(DINH_VU);
    expect(renamed.destinationPoint).toEqual(TAN_PHU_HUNG);
  });

  it('dau vet kiem toan cua lan tao mang hai diem', async () => {
    const order = await service.createOrder(command(), ACTOR);

    const [entry] = await auditLog.list({ entityType: 'TransportOrder', entityId: order.id });
    expect(entry?.after).toMatchObject({
      originPoint: DINH_VU,
      destinationPoint: TAN_PHU_HUNG,
    });
  });

  it('khong co telemetry thi van tao don duoc (observability khong phai dieu kien thanh cong)', async () => {
    const bare = new MovementService(
      new InMemoryMovementRepository(),
      new InMemoryFleetRepository(),
      new AuditLogService(new InMemoryAuditLogRepository()),
      POLICY,
    );

    const order = await bare.createOrder(command(), ACTOR);

    expect(order.originPoint).toEqual(DINH_VU);
  });
});

/**
 * DON CHIEU TU CHUYEN v1 cung ghi quyet dinh `order.location` (#379).
 *
 * Hai phep chieu TAO don khong qua `createOrder`, nen truoc day nhat ky chi thay ABSENT tu duong
 * noi bo con don chieu thi im lang — nguoi doc trace khong phan biet duoc "don nay chua bao gio co
 * diem" voi "khong ai ghi lai". Chi nhanh VUA TAO moi ghi; goi lai (UNCHANGED) khong ghi lan hai.
 */
describe('MovementService — don chieu tu chuyen v1 ghi ORDER_LOCATION_ABSENT (#379)', () => {
  let decisions: RecordedDecision[];
  let trips: InMemoryTripRepository;
  let service: MovementService;

  beforeEach(() => {
    decisions = [];
    trips = new InMemoryTripRepository();
    const telemetry = {
      decision: (input: RecordedDecision) => {
        decisions.push(input);
      },
    } as unknown as TelemetryService;
    service = new MovementService(
      new InMemoryMovementRepository(),
      new InMemoryFleetRepository(),
      new AuditLogService(new InMemoryAuditLogRepository()),
      POLICY,
      trips,
      telemetry,
    );
  });

  const tripWithCustomer = () =>
    trips.create({
      code: 'CH-379',
      kind: 'OWN_DIRECT',
      businessDate: '2026-09-23',
      originLabel: 'Bãi xe Hà Nội',
      destinationLabel: 'Nhà máy thép Đình Vũ',
      customerId: 'khach-1',
    });

  const locationDecisions = () => decisions.filter((entry) => entry.point === 'order.location');

  /** Detail khong mang mot con so nao — khong toa do, khong gi co the la toa do. */
  const expectAbsentWithoutCoordinates = (orderId: string) => {
    expect(locationDecisions()).toEqual([
      {
        vocabulary: expect.anything(),
        point: 'order.location',
        outcome: 'allowed',
        reason: 'ORDER_LOCATION_ABSENT',
        detail: {
          orderId,
          hasOriginPoint: false,
          hasDestinationPoint: false,
          originOutsideOperatingArea: false,
          destinationOutsideOperatingArea: false,
        },
      },
    ]);
    const detail = locationDecisions()[0]?.detail ?? {};
    expect(Object.values(detail).every((value) => typeof value !== 'number')).toBe(true);
  };

  it('projectTripOrder: don vua tao -> ABSENT, khong toa do; goi lai khong ghi them', async () => {
    const trip = await tripWithCustomer();

    const first = await service.projectTripOrder(trip.id, ACTOR);
    expect(first.order.originPoint).toBeNull();
    expectAbsentWithoutCoordinates(first.order.id);

    await service.projectTripOrder(trip.id, ACTOR);
    expect(locationDecisions()).toHaveLength(1);
  });

  it('projectTrip: don vua tao cung vong chay -> ABSENT, khong toa do; goi lai khong ghi them', async () => {
    const trip = await tripWithCustomer();
    await trips.assign(trip.id, {
      vehicleId: 'xe-1',
      driverId: 'tai-1',
      assignedBy: ACTOR,
      at: new Date('2026-09-23T01:00:00.000Z'),
    });

    const first = await service.projectTrip(trip.id, ACTOR);
    expect(first.order?.destinationPoint).toBeNull();
    expectAbsentWithoutCoordinates(first.order?.id ?? 'thieu-don');

    await service.projectTrip(trip.id, ACTOR);
    expect(locationDecisions()).toHaveLength(1);
  });

  it('projectTrip: chuyen KHONG khach -> khong co don, khong ghi quyet dinh diem', async () => {
    const trip = await trips.create({
      code: 'CH-KHONG-KHACH',
      kind: 'OWN_DIRECT',
      businessDate: '2026-09-23',
      originLabel: 'A',
      destinationLabel: 'B',
    });
    await trips.assign(trip.id, {
      vehicleId: 'xe-1',
      driverId: 'tai-1',
      assignedBy: ACTOR,
      at: new Date('2026-09-23T01:00:00.000Z'),
    });

    const projection = await service.projectTrip(trip.id, ACTOR);

    expect(projection.order).toBeNull();
    expect(locationDecisions()).toEqual([]);
  });
});
