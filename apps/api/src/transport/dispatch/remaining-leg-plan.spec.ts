import { describe, expect, it } from 'vitest';
import type { Order } from '../movement/movement.types.js';
import type { PlaceIndexEntry } from './place-resolution.js';
import {
  legOrderPointRef,
  memoizeOrderLookup,
  resolveLegDestination,
  type OrderLookup,
} from './remaining-leg-plan.js';
import type { RemainingLegFact } from './vehicle-state-projection.js';

/**
 * DIEM DEN CUA CHANG CON LAI (#379) — ham thuan, kiem tach khoi `DispatchService`.
 *
 * Bo bai cua service (`dispatch.service.spec.ts`) chung minh ket qua di toi tan bang de nghi; o
 * day kiem nhung ranh gioi ma mot bai qua service kho dung: chang rong cuoi vong chay, chang rong
 * khong lien ke, va mot lan doc cho hai lan hoi dong thoi.
 */

const HAI_PHONG = { latitude: 20.8449, longitude: 106.6881 };
const NINH_BINH = { latitude: 20.2506, longitude: 105.9745 };

const leg = (over: Partial<RemainingLegFact> & { legId: string }): RemainingLegFact => ({
  runId: 'r1',
  orderId: null,
  sequence: 1,
  kind: 'LOADED',
  status: 'PLANNED',
  originLabel: 'A',
  destinationLabel: 'B',
  runStatus: 'ACTIVE',
  runBusinessDate: '2026-09-08',
  runCreatedAt: '2026-09-08T08:00:00.000Z',
  ...over,
});

const order = (over: Partial<Order> & { id: string }): Order => ({
  code: over.id.toUpperCase(),
  status: 'OPEN',
  businessDate: '2026-09-08',
  customerId: null,
  originLabel: 'Kho lay',
  destinationLabel: 'Kho giao',
  originPoint: NINH_BINH,
  destinationPoint: HAI_PHONG,
  cargoDescription: null,
  freightAmount: null,
  currencyCode: 'VND',
  note: null,
  createdAt: '2026-09-08T08:00:00.000Z',
  updatedAt: '2026-09-08T08:00:00.000Z',
  cancelledAt: null,
  cancellationReason: null,
  ...over,
});

describe('chang nay di toi toa do cua don nao', () => {
  it('chang CO TAI co don -> diem GIAO cua don do', () => {
    expect(legOrderPointRef([leg({ legId: 'l1', orderId: 'ord-1' })], 0)).toEqual({
      orderId: 'ord-1',
      source: 'ORDER_DELIVERY_POINT',
    });
  });

  it('chang co tai KHONG gan don -> khong co toa do don nao (giai theo nhan)', () => {
    expect(legOrderPointRef([leg({ legId: 'l1' })], 0)).toBeNull();
  });

  it('vi tri ngoai danh sach -> khong co gi', () => {
    expect(legOrderPointRef([], 0)).toBeNull();
  });

  it('chang RONG ngay truoc chang co tai cung vong chay -> diem LAY cua don ke tiep', () => {
    const empty = leg({ legId: 'l1', kind: 'EMPTY', sequence: 3 });
    const loaded = leg({ legId: 'l2', sequence: 4, orderId: 'ord-2' });
    expect(legOrderPointRef([empty, loaded], 0)).toEqual({
      orderId: 'ord-2',
      source: 'ORDER_PICKUP_POINT',
    });
  });

  it('chang rong CUOI vong chay (chang ke thuoc vong chay khac) -> khong lay diem lay cua ai', () => {
    const empty = leg({ legId: 'l1', kind: 'EMPTY', sequence: 3 });
    const nextRun = leg({ legId: 'l2', runId: 'r2', sequence: 4, orderId: 'ord-2' });
    expect(legOrderPointRef([empty, nextRun], 0)).toBeNull();
  });

  it('chang rong KHONG lien ke chang co tai (so thu tu nhay) -> khong lay', () => {
    const empty = leg({ legId: 'l1', kind: 'EMPTY', sequence: 1 });
    const later = leg({ legId: 'l2', sequence: 3, orderId: 'ord-2' });
    expect(legOrderPointRef([empty, later], 0)).toBeNull();
  });

  it('chang rong truoc mot chang rong khac, hoac o cuoi danh sach -> khong lay', () => {
    const empty = leg({ legId: 'l1', kind: 'EMPTY', sequence: 1 });
    expect(
      legOrderPointRef([empty, leg({ legId: 'l2', kind: 'EMPTY', sequence: 2 })], 0),
    ).toBeNull();
    expect(legOrderPointRef([empty], 0)).toBeNull();
  });

  /**
   * DON CO HAI CHANG CO TAI (lay -> bai trung chuyen -> giao). Don chi ghi diem lay va diem giao,
   * nen chang dau KHONG dung o diem giao — gan diem giao cho no se cho xe "toi noi" tu chang dau.
   */
  it('don hai chang co tai: chang DAU giai theo nhan, chang CUOI toi diem giao', () => {
    const first = leg({ legId: 'l1', sequence: 1, orderId: 'ord-2', destinationLabel: 'Bai TC' });
    const last = leg({ legId: 'l2', sequence: 2, orderId: 'ord-2' });

    expect(legOrderPointRef([first, last], 0)).toBeNull();
    expect(legOrderPointRef([first, last], 1)).toEqual({
      orderId: 'ord-2',
      source: 'ORDER_DELIVERY_POINT',
    });
  });

  it('chang co tai cua don KHAC phia sau khong lam chang nay mat diem giao', () => {
    const mine = leg({ legId: 'l1', sequence: 1, orderId: 'ord-1' });
    const other = leg({ legId: 'l2', sequence: 2, orderId: 'ord-2' });

    expect(legOrderPointRef([mine, other], 0)).toEqual({
      orderId: 'ord-1',
      source: 'ORDER_DELIVERY_POINT',
    });
  });

  /**
   * Chang RONG truoc chang co tai THU HAI cua cung mot don la chay rong toi bai trung chuyen, khong
   * phai toi diem lay — diem lay da qua o chang co tai thu nhat.
   */
  it('chang rong truoc chang co tai thu HAI cua cung don -> giai theo nhan, khong toi diem lay', () => {
    const firstEmpty = leg({ legId: 'l1', kind: 'EMPTY', sequence: 1 });
    const firstHop = leg({ legId: 'l2', sequence: 2, orderId: 'ord-2' });
    const secondEmpty = leg({ legId: 'l3', kind: 'EMPTY', sequence: 3 });
    const secondHop = leg({ legId: 'l4', sequence: 4, orderId: 'ord-2' });
    const legs = [firstEmpty, firstHop, secondEmpty, secondHop];

    expect(legOrderPointRef(legs, 0)).toEqual({ orderId: 'ord-2', source: 'ORDER_PICKUP_POINT' });
    expect(legOrderPointRef(legs, 1)).toBeNull();
    expect(legOrderPointRef(legs, 2)).toBeNull();
    expect(legOrderPointRef(legs, 3)).toEqual({ orderId: 'ord-2', source: 'ORDER_DELIVERY_POINT' });
  });
});

describe('bo dem doc don cho mot luot tinh', () => {
  const countingLookup = (orders: readonly Order[]): { lookup: OrderLookup; reads: string[] } => {
    const reads: string[] = [];
    const lookup: OrderLookup = (orderId) => {
      reads.push(orderId);
      return Promise.resolve(orders.find((entry) => entry.id === orderId) ?? null);
    };
    return { lookup, reads };
  };

  it('moi ma don doc DUNG MOT lan, ke ca hai lan hoi dong thoi', async () => {
    const { lookup, reads } = countingLookup([order({ id: 'ord-2' })]);
    const memo = memoizeOrderLookup(lookup);

    const [first, second] = await Promise.all([memo('ord-2'), memo('ord-2')]);
    await memo('ord-khong-co');
    await memo('ord-khong-co');

    expect(first?.id).toBe('ord-2');
    expect(second).toBe(first);
    expect(reads).toEqual(['ord-2', 'ord-khong-co']);
  });

  it('don dua vao san KHONG bi doc lai', async () => {
    const { lookup, reads } = countingLookup([]);
    const memo = memoizeOrderLookup(lookup, [order({ id: 'ord-1' })]);

    expect((await memo('ord-1'))?.id).toBe('ord-1');
    expect(reads).toEqual([]);
  });
});

describe('diem den cua mot chang', () => {
  const INDEX: readonly PlaceIndexEntry[] = [
    { geofenceId: 'gf-b', label: 'B', point: NINH_BINH, siteId: null, siteName: null },
  ];
  const lookupOf =
    (orders: readonly Order[]): OrderLookup =>
    (orderId) =>
      Promise.resolve(orders.find((entry) => entry.id === orderId) ?? null);

  it('toa do don THANG nhan chang, ke ca khi nhan khop mot hang rao', async () => {
    const place = await resolveLegDestination(
      [leg({ legId: 'l1', orderId: 'ord-1', destinationLabel: 'B' })],
      0,
      lookupOf([order({ id: 'ord-1' })]),
      INDEX,
    );
    expect(place).toMatchObject({ point: HAI_PHONG, source: 'ORDER_DELIVERY_POINT' });
  });

  it('don khong con / don cu khong toa do -> roi ve nhan chang', async () => {
    const byLabel = { point: NINH_BINH, source: 'GEOFENCE_LABEL_EXACT', geofenceId: 'gf-b' };
    const missing = await resolveLegDestination(
      [leg({ legId: 'l1', orderId: 'ord-mat', destinationLabel: 'B' })],
      0,
      lookupOf([]),
      INDEX,
    );
    const legacy = await resolveLegDestination(
      [leg({ legId: 'l1', orderId: 'ord-cu', destinationLabel: 'B' })],
      0,
      lookupOf([order({ id: 'ord-cu', originPoint: null, destinationPoint: null })]),
      INDEX,
    );
    expect(missing).toMatchObject(byLabel);
    expect(legacy).toMatchObject(byLabel);
  });

  /** Don co toa do giao o Hai Phong; chang dau cua no dung o bai `B` (Ninh Binh) — theo nhan. */
  it('chang co tai DAU cua don hai chang dung o nhan chang, chang CUOI o diem giao', async () => {
    const legs = [
      leg({ legId: 'l1', sequence: 1, orderId: 'ord-1', destinationLabel: 'B' }),
      leg({ legId: 'l2', sequence: 2, orderId: 'ord-1', destinationLabel: 'B' }),
    ];
    const orders = lookupOf([order({ id: 'ord-1' })]);

    expect(await resolveLegDestination(legs, 0, orders, INDEX)).toMatchObject({
      point: NINH_BINH,
      source: 'GEOFENCE_LABEL_EXACT',
    });
    expect(await resolveLegDestination(legs, 1, orders, INDEX)).toMatchObject({
      point: HAI_PHONG,
      source: 'ORDER_DELIVERY_POINT',
    });
  });

  it('chang rong truoc chang co tai thu hai cua don -> nhan chang, khong phai diem lay', async () => {
    const legs = [
      leg({ legId: 'l1', sequence: 1, orderId: 'ord-1', destinationLabel: 'B' }),
      leg({ legId: 'l2', sequence: 2, kind: 'EMPTY', destinationLabel: 'B' }),
      leg({ legId: 'l3', sequence: 3, orderId: 'ord-1' }),
    ];
    // Diem LAY cua don dat o Hai Phong de hai duong cho ra hai diem khac nhau.
    const orders = lookupOf([order({ id: 'ord-1', originPoint: HAI_PHONG })]);

    expect(await resolveLegDestination(legs, 1, orders, INDEX)).toMatchObject({
      point: NINH_BINH,
      source: 'GEOFENCE_LABEL_EXACT',
    });
  });
});
