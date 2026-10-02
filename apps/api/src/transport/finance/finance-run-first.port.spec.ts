import { describe, expect, it } from 'vitest';
import type { OperatingMetricsReadService } from '../analytics/operating-metrics-read.service.js';
import type { RunMargin } from '../analytics/operating-metrics.js';
import type { FuelCostAttribution } from '../fuel/fuel-cost-attribution.js';
import type { FuelCostAttributionRepository } from '../fuel/fuel-cost-attribution.repository.js';
import type { FuelRepository } from '../fuel/fuel.repository.js';
import type { FuelEntry } from '../fuel/fuel.types.js';
import type { MovementRepository } from '../movement/movement.repository.js';
import type {
  Order,
  RunLeg,
  TripOrderLink,
  TripRunLegLink,
  VehicleRun,
} from '../movement/movement.types.js';
import { FinanceRunFirstFactsAdapter, ownerOfRun } from './finance-run-first.port.js';

/**
 * `#385` — DUONG DOC viec Run-first cua bang tai chinh: loc don chieu, gan chi phi vong xe cho DUNG
 * mot viec, va dem phan nhien lieu con treo. Kho gia chi tra loi dung nhung ham adapter goi; phan
 * Postgres that nam o `transport-finance-run-first.int.spec.ts`.
 */

const order = (id: string, over: Partial<Order> = {}): Order => ({
  id,
  code: id.toUpperCase(),
  status: 'OPEN',
  businessDate: '2026-09-23',
  customerId: 'kh-1',
  originLabel: 'Kho A',
  destinationLabel: 'Kho B',
  originPoint: null,
  destinationPoint: null,
  cargoDescription: null,
  freightAmount: 6_000_000,
  currencyCode: 'VND',
  note: null,
  createdAt: '2026-09-23T00:00:00.000Z',
  updatedAt: '2026-09-23T00:00:00.000Z',
  cancelledAt: null,
  cancellationReason: null,
  ...over,
});

const leg = (
  id: string,
  runId: string,
  orderId: string | null,
  over: Partial<RunLeg> = {},
): RunLeg =>
  ({
    id,
    runId,
    sequence: 1,
    kind: orderId === null ? 'EMPTY' : 'LOADED',
    status: 'COMPLETED',
    orderId,
    originLabel: 'A',
    destinationLabel: 'B',
    businessDate: '2026-09-23',
    distanceKm: 10,
    plannedDistanceKm: null,
    startedAt: null,
    completedAt: null,
    note: null,
    createdAt: '2026-09-23T00:00:00.000Z',
    updatedAt: '2026-09-23T00:00:00.000Z',
    ...over,
  }) as RunLeg;

const margin = (runId: string, over: Partial<RunMargin>): RunMargin =>
  ({
    runId,
    revenue: 0,
    directCost: 0,
    directMargin: 0,
    costSources: { legacyTripExpense: 0, fuelCostAttribution: 0 },
    legCosts: [],
    runLevelCost: 0,
    orderIds: [],
    tripIds: [],
    fuelCostAttributionIds: [],
    unavailableSources: [],
    gaps: [],
    ...over,
  }) as RunMargin;

interface World {
  readonly orders: Order[];
  readonly orderLinks: TripOrderLink[];
  /** MOI chang cua moi vong xe — ke ca chang chieu tu chuyen cu va chang rong. */
  readonly legs: RunLeg[];
  readonly tripLinks?: TripRunLegLink[];
  readonly margins: Record<string, RunMargin>;
  readonly attributedRunIds: string[];
  readonly entriesByRun?: Record<string, FuelEntry[]>;
  readonly attributionsByEntry?: Record<string, FuelCostAttribution[]>;
}

const adapterFor = (world: World): FinanceRunFirstFactsAdapter => {
  const movement = {
    listOrders: async () => world.orders,
    findOrderLinksByOrders: async (ids: readonly string[]) =>
      world.orderLinks.filter((link) => ids.includes(link.orderId)),
    listLegsByOrders: async (ids: readonly string[]) =>
      world.legs.filter((row) => row.orderId !== null && ids.includes(row.orderId)),
    findRun: async (id: string) => ({ id, code: `RUN-${id}` }) as VehicleRun,
    listLegs: async (runId: string) => world.legs.filter((row) => row.runId === runId),
    findTripLinksByLegs: async (ids: readonly string[]) =>
      (world.tripLinks ?? []).filter((link) => ids.includes(link.legId)),
  } as unknown as MovementRepository;
  const metrics = {
    runMargin: async (id: string) => world.margins[id] ?? null,
  } as unknown as OperatingMetricsReadService;
  const fuel = {
    listEntriesByRun: async (id: string) => world.entriesByRun?.[id] ?? [],
  } as unknown as FuelRepository;
  const attributions = {
    listAttributedRunIds: async () => world.attributedRunIds,
    listForEntry: async (id: string) => world.attributionsByEntry?.[id] ?? [],
  } as unknown as FuelCostAttributionRepository;
  return new FinanceRunFirstFactsAdapter(movement, metrics, fuel, attributions);
};

describe('ownerOfRun — chi phi vong xe thuoc DUNG mot viec, hoac khong ai', () => {
  const live = new Set(['don-1', 'don-2']);
  it.each([
    [
      { orderIds: ['don-1'], tripIds: [] },
      { kind: 'ORDER', orderId: 'don-1' },
    ],
    // Hai chang cua CUNG mot don van la mot viec.
    [
      { orderIds: ['don-1', 'don-1'], tripIds: [] },
      { kind: 'ORDER', orderId: 'don-1' },
    ],
    [
      { orderIds: [], tripIds: ['chuyen-1'] },
      { kind: 'TRIP', tripId: 'chuyen-1' },
    ],
    // Don chieu tu chuyen cu KHONG phai don Run-first — vong chieu thuoc chuyen.
    [
      { orderIds: ['ord-chieu'], tripIds: ['chuyen-1'] },
      { kind: 'TRIP', tripId: 'chuyen-1' },
    ],
    [{ orderIds: ['don-1', 'don-2'], tripIds: [] }, { kind: 'SHARED' }],
    [{ orderIds: ['don-1'], tripIds: ['chuyen-1'] }, { kind: 'SHARED' }],
    [{ orderIds: [], tripIds: [] }, { kind: 'NONE' }],
  ] as const)('%o -> %o', (work, expected) => {
    expect(ownerOfRun(work, live)).toEqual(expected);
  });
});

describe('FinanceRunFirstFactsAdapter', () => {
  it('bo don CHIEU tu chuyen cu va don da huy; don Run-first mang vong xe cua no', async () => {
    const facts = await adapterFor({
      orders: [
        order('don-1', { status: 'FULFILLED' }),
        order('demo-ar', { status: 'FULFILLED' }),
        order('don-huy', { status: 'CANCELLED' }),
      ],
      orderLinks: [{ tripId: 'chuyen-1', orderId: 'demo-ar', projectedBy: 'seed', createdAt: '' }],
      legs: [leg('l1', 'vong-1', 'don-1'), leg('l2', 'vong-2', 'don-huy')],
      margins: {
        'vong-1': margin('vong-1', {
          orderIds: ['don-1'],
          costSources: { legacyTripExpense: 0, fuelCostAttribution: 1_320_000 },
        }),
      },
      attributedRunIds: [],
    }).runFirstMargins();

    expect(facts.projectedOrderCount).toBe(1);
    expect(facts.orders.map((row) => row.order.id)).toEqual(['don-1']);
    expect(facts.orders[0]!.runs).toEqual([
      {
        runId: 'vong-1',
        runCode: 'RUN-vong-1',
        fuelCostAttribution: 1_320_000,
        carriesOtherWork: false,
        costSourceUnavailable: false,
        pendingFuel: { amount: 0, entryCount: 0 },
      },
    ]);
    expect(facts.unassigned).toEqual({ amount: 0, runCount: 0 });
  });

  it('chang DA HUY khong gan don vao vong xe: don quay ve "chua co vong xe"', async () => {
    const facts = await adapterFor({
      orders: [order('don-1')],
      orderLinks: [],
      legs: [leg('l1', 'vong-1', 'don-1', { status: 'CANCELLED' })],
      margins: {},
      attributedRunIds: [],
    }).runFirstMargins();
    expect(facts.orders[0]!.runs).toEqual([]);
  });

  /**
   * Chuyen chieu CHUA co khoan chi `TX-03` nao: `RunMargin.tripIds` rong (no chi ke chuyen co tien).
   * Chu so huu phai doc tu LIEN KET chang -> chuyen, neu khong 400.000 d nay rot khoi ca hai nhanh —
   * chinh loi ma bai Postgres that `F385-IT-04` da bat.
   */
  it('phan bo tren vong CHIEU cua mot chuyen cu -> ve dong chuyen do, du chuyen chua co khoan chi', async () => {
    const facts = await adapterFor({
      orders: [order('ord-chieu', { status: 'FULFILLED' })],
      orderLinks: [{ tripId: 'chuyen-1', orderId: 'ord-chieu', projectedBy: 'x', createdAt: '' }],
      legs: [leg('chang-chieu', 'vong-chieu', 'ord-chieu')],
      tripLinks: [{ tripId: 'chuyen-1', legId: 'chang-chieu', projectedBy: 'x', createdAt: '' }],
      margins: {
        'vong-chieu': margin('vong-chieu', {
          orderIds: ['ord-chieu'],
          tripIds: [],
          costSources: { legacyTripExpense: 0, fuelCostAttribution: 400_000 },
        }),
      },
      attributedRunIds: ['vong-chieu'],
    }).runFirstMargins();

    // CHI phan phan bo — `legacyTripExpense` da nam trong bien TX-05 cua chuyen.
    expect(facts.legacyTripFuelCost.get('chuyen-1')).toBe(400_000);
    expect(facts.unassigned).toEqual({ amount: 0, runCount: 0 });
    expect(facts.orders).toEqual([]);
  });

  it('chang chieu DA HUY khong con noi vong xe voi chuyen: phan bo vao `unassigned`', async () => {
    const facts = await adapterFor({
      orders: [],
      orderLinks: [],
      legs: [leg('chang-chieu', 'vong-chieu', null, { status: 'CANCELLED' })],
      tripLinks: [{ tripId: 'chuyen-1', legId: 'chang-chieu', projectedBy: 'x', createdAt: '' }],
      margins: {
        'vong-chieu': margin('vong-chieu', {
          costSources: { legacyTripExpense: 0, fuelCostAttribution: 400_000 },
        }),
      },
      attributedRunIds: ['vong-chieu'],
    }).runFirstMargins();
    expect(facts.legacyTripFuelCost.size).toBe(0);
    expect(facts.unassigned).toEqual({ amount: 400_000, runCount: 1 });
  });

  it('vong xe cho HAI don: ca hai bi danh dau, chi phi vao `unassigned` chu khong chia bua', async () => {
    const facts = await adapterFor({
      orders: [order('don-1'), order('don-2')],
      orderLinks: [],
      legs: [leg('l1', 'vong-1', 'don-1'), leg('l2', 'vong-1', 'don-2')],
      margins: {
        'vong-1': margin('vong-1', {
          orderIds: ['don-1', 'don-2'],
          costSources: { legacyTripExpense: 0, fuelCostAttribution: 900_000 },
        }),
      },
      attributedRunIds: ['vong-1'],
    }).runFirstMargins();

    expect(facts.orders.every((row) => row.runs[0]!.carriesOtherWork)).toBe(true);
    expect(facts.unassigned).toEqual({ amount: 900_000, runCount: 1 });
  });

  it('phieu tren vong xe chua phan bo het -> phan con treo; phieu bi tu choi khong tinh', async () => {
    const entry = (id: string, amount: number, status: FuelEntry['verificationStatus']) =>
      ({ id, amount, verificationStatus: status }) as FuelEntry;
    const allocation = (signedAmount: number) => ({ signedAmount }) as FuelCostAttribution;

    const facts = await adapterFor({
      orders: [order('don-1')],
      orderLinks: [],
      legs: [leg('l1', 'vong-1', 'don-1')],
      margins: {
        'vong-1': margin('vong-1', {
          orderIds: ['don-1'],
          costSources: { legacyTripExpense: 0, fuelCostAttribution: 1_320_000 },
        }),
      },
      attributedRunIds: ['vong-1'],
      entriesByRun: {
        'vong-1': [
          entry('ghi-no', 1_320_000, 'VERIFIED'),
          entry('tien-mat', 500_000, 'VERIFIED'),
          entry('moi-khai', 200_000, 'DECLARED'),
          entry('tu-choi', 900_000, 'REJECTED'),
        ],
      },
      attributionsByEntry: { 'ghi-no': [allocation(1_320_000)] },
    }).runFirstMargins();

    expect(facts.orders[0]!.runs[0]!.pendingFuel).toEqual({ amount: 700_000, entryCount: 2 });
  });

  it('vong xe khong doc lai duoc -> chi phi CHUA BIET, khong phai 0', async () => {
    const facts = await adapterFor({
      orders: [order('don-1')],
      orderLinks: [],
      legs: [leg('l1', 'vong-1', 'don-1')],
      margins: {},
      attributedRunIds: [],
    }).runFirstMargins();
    expect(facts.orders[0]!.runs[0]).toMatchObject({
      costSourceUnavailable: true,
      carriesOtherWork: false,
    });
  });
});
