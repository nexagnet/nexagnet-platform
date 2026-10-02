import { describe, expect, it } from 'vitest';
import { summariseRunDistance } from '../movement/run-distance.js';
import {
  buildCorridorInsight,
  buildFleetInsight,
  businessDaysBetween,
  corridorKeyOf,
  median,
  rollUpDistance,
} from './insight-metrics.js';
import type { Order, RunLeg, VehicleRun } from '../movement/movement.types.js';
import type { Vehicle } from '../transport.types.js';
import type { InsightRange } from './insight.types.js';

const RANGE: InsightRange = { from: '2026-09-01', to: '2026-09-30', businessDays: 30 };

const run = (over: Partial<VehicleRun> = {}): VehicleRun => ({
  id: 'r1',
  code: 'RUN-001',
  vehicleId: 'v1',
  status: 'COMPLETED',
  businessDate: '2026-09-08',
  startedAt: null,
  completedAt: null,
  note: null,
  createdAt: '2026-09-08T01:00:00.000Z',
  updatedAt: '2026-09-08T01:00:00.000Z',
  cancelledAt: null,
  cancellationReason: null,
  ...over,
});

const leg = (over: Partial<RunLeg> = {}): RunLeg => ({
  id: 'l1',
  runId: 'r1',
  sequence: 1,
  kind: 'LOADED',
  status: 'COMPLETED',
  orderId: null,
  originLabel: 'Hà Nội',
  destinationLabel: 'Hải Phòng',
  businessDate: '2026-09-08',
  distanceKm: 105,
  plannedDistanceKm: null,
  startedAt: null,
  completedAt: null,
  note: null,
  createdAt: '2026-09-08T01:00:00.000Z',
  updatedAt: '2026-09-08T01:00:00.000Z',
  ...over,
});

const vehicle = (over: Partial<Vehicle> = {}): Vehicle => ({
  id: 'v1',
  registrationPlate: '29H-111.11',
  vehicleClass: 'TRACTOR',
  allowedPayloadKg: 20000,
  currentOdoKm: 100_000,
  status: 'IDLE',
  operationalControl: 'INTERNAL_OPERATED',
  ownershipRegisterComplete: false,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

const order = (over: Partial<Order> = {}): Order => ({
  id: 'o1',
  code: 'ORD-001',
  status: 'FULFILLED',
  businessDate: '2026-09-08',
  customerId: null,
  originLabel: 'Hà Nội',
  destinationLabel: 'Hải Phòng',
  originPoint: null,
  destinationPoint: null,
  cargoDescription: null,
  freightAmount: null,
  currencyCode: 'VND',
  note: null,
  createdAt: '2026-09-08T01:00:00.000Z',
  updatedAt: '2026-09-08T01:00:00.000Z',
  cancelledAt: null,
  cancellationReason: null,
  ...over,
});

describe('khoang ngay nghiep vu', () => {
  it('tinh ca hai dau', () => {
    expect(businessDaysBetween('2026-09-01', '2026-09-30')).toBe(30);
    expect(businessDaysBetween('2026-09-08', '2026-09-08')).toBe(1);
  });

  it('khoang nguoc cho 0 — khong phai mot so am', () => {
    expect(businessDaysBetween('2026-09-30', '2026-09-01')).toBe(0);
  });
});

describe('gop km — thieu MOT phan thi tong la null', () => {
  it('du du lieu thi cong that', () => {
    expect(rollUpDistance([leg(), leg({ id: 'l2', kind: 'EMPTY', distanceKm: 45 })])).toEqual({
      loadedKm: 105,
      emptyKm: 45,
      totalKm: 150,
      emptyRatio: 45 / 150,
      legsMissingDistance: 0,
    });
  });

  it('mot chang thieu km thi MOI tong deu null, khong cong mot phan', () => {
    const result = rollUpDistance([leg(), leg({ id: 'l2', kind: 'EMPTY', distanceKm: null })]);

    expect(result.loadedKm).toBeNull();
    expect(result.totalKm).toBeNull();
    expect(result.emptyRatio).toBeNull();
    expect(result.legsMissingDistance).toBe(1);
  });

  it('chang DA HUY khong duoc dem — mot ke hoach bi bo khong phai quang duong da di', () => {
    const result = rollUpDistance([leg(), leg({ id: 'l2', status: 'CANCELLED', distanceKm: 999 })]);

    expect(result.loadedKm).toBe(105);
  });

  /*
   * Hai ham gop km song song o hai grain khac nhau. Chung PHAI dong y tren cung mot tap chang, neu
   * khong thi bang doi xe va bao cao vong chay se noi hai con so cho cung mot chiec xe.
   */
  it('dong y voi `summariseRunDistance` tren cung tap chang', () => {
    const legs = [
      leg(),
      leg({ id: 'l2', kind: 'EMPTY', distanceKm: 45 }),
      leg({ id: 'l3', status: 'CANCELLED', distanceKm: 999 }),
    ];
    const mine = rollUpDistance(legs);
    const theirs = summariseRunDistance(legs);

    expect(mine.loadedKm).toBe(theirs.loadedKm);
    expect(mine.emptyKm).toBe(theirs.emptyKm);
    expect(mine.totalKm).toBe(theirs.totalKm);
    expect(mine.emptyRatio).toBe(theirs.emptyRatio);
  });
});

describe('trung vi', () => {
  it('tap rong cho null, khong phai 0', () => {
    expect(median([])).toBeNull();
  });

  it('le thi lay giua, chan thi trung binh hai o giua', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('bang doi xe', () => {
  const input = {
    range: RANGE,
    vehicles: [
      vehicle(),
      vehicle({ id: 'v2', registrationPlate: '29H-222.22', status: 'ON_TRIP' }),
    ],
    runs: [run()],
    legsByRun: new Map([
      [
        'r1',
        [
          leg({ businessDate: '2026-09-08' }),
          leg({ id: 'l2', kind: 'EMPTY', distanceKm: 45, businessDate: '2026-09-09' }),
        ],
      ],
    ]),
  };

  it('ty le su dung dem NGAY co chang, va cong thuc di kem ket qua', () => {
    const view = buildFleetInsight(input);
    const first = view.vehicles.find((entry) => entry.vehicleId === 'v1');

    /* Hai chang o hai ngay khac nhau => hai ngay co viec, du chi mot vong chay. */
    expect(first?.activeBusinessDays).toBe(2);
    expect(first?.utilisation).toBeCloseTo(2 / 30);
    expect(view.utilisationFormula).toBe('ngayCoChangKhongHuy / ngayLichTrongKhoang');
  });

  it('xe khong chay gi trong khoang van co mat, voi so 0 THAT va ty le rong null', () => {
    const view = buildFleetInsight(input);
    const idle = view.vehicles.find((entry) => entry.vehicleId === 'v2');

    expect(idle?.runCount).toBe(0);
    expect(idle?.activeBusinessDays).toBe(0);
    /* Khong chang nao => khong thieu km nao => tong la 0 THAT, khong phai `null`. */
    expect(idle?.totalKm).toBe(0);
    expect(idle?.emptyRatio).toBeNull();
  });

  it('khoang rong thi ty le la null — mot cau hoi sai, khong phai mot chiec xe khong chay', () => {
    const view = buildFleetInsight({
      ...input,
      range: { from: '2026-09-30', to: '2026-09-01', businessDays: 0 },
    });

    expect(view.vehicles.every((entry) => entry.utilisation === null)).toBe(true);
  });

  it('chang NGOAI khoang khong duoc dem', () => {
    const view = buildFleetInsight({
      ...input,
      legsByRun: new Map([['r1', [leg({ businessDate: '2026-08-31' })]]]),
    });

    expect(view.vehicles.find((entry) => entry.vehicleId === 'v1')?.activeBusinessDays).toBe(0);
  });

  it('xep on dinh theo BIEN SO, khong theo `id`', () => {
    const view = buildFleetInsight(input);

    expect(view.vehicles.map((entry) => entry.registrationPlate)).toEqual([
      '29H-111.11',
      '29H-222.22',
    ]);
  });

  it('tat dinh', () => {
    expect(buildFleetInsight(input)).toEqual(buildFleetInsight(input));
  });
});

describe('bao cao tuyen', () => {
  const legsByRun = new Map([
    [
      'r1',
      [
        leg({ id: 'l1', sequence: 1, kind: 'LOADED', orderId: 'o1', distanceKm: 105 }),
        leg({ id: 'l2', sequence: 2, kind: 'EMPTY', distanceKm: 40 }),
        leg({
          id: 'l3',
          sequence: 3,
          kind: 'LOADED',
          originLabel: 'Ninh Bình',
          destinationLabel: 'Hà Nội',
          distanceKm: 90,
        }),
      ],
    ],
  ]);

  const input = { range: RANGE, runs: [run()], legsByRun, orders: [order()] };

  it('gom theo NHAN da chuan hoa, va cong bo rang do la phep gom tam', () => {
    const view = buildCorridorInsight(input);

    expect(view.grouping).toBe('FREE_TEXT_LABEL_COMPATIBILITY');
    expect(view.corridors).toHaveLength(2);
  });

  it('nhan khac hoa nhung cung noi dung ra CUNG mot tuyen', () => {
    expect(corridorKeyOf('  Hà Nội ', 'HẢI  PHÒNG')).toBe(corridorKeyOf('hà nội', 'hải phòng'));
  });

  /*
   * KHONG bo dau. "Hà Nội" va "Ha Noi" la hai chuoi ma nguoi nhap co the co y phan biet; gop chung
   * lai la mot phep doan ma bao cao khong duoc phep. Phep gom nay phai gom IT hon la nhieu hon.
   */
  it('khong bo dau tieng Viet — gom it hon con hon gom nham', () => {
    expect(corridorKeyOf('Hà Nội', 'Hải Phòng')).not.toBe(corridorKeyOf('Ha Noi', 'Hai Phong'));
  });

  it('km rong quy cho chang co hang LIEN TRUOC, trong cung vong chay', () => {
    const view = buildCorridorInsight(input);
    const hanoiHaiphong = view.corridors.find((entry) => entry.originLabel === 'Hà Nội');
    const ninhbinhHanoi = view.corridors.find((entry) => entry.originLabel === 'Ninh Bình');

    expect(view.emptyAttribution).toBe('PRECEDING_LOADED_LEG_IN_SAME_RUN');
    expect(hanoiHaiphong?.attributedEmptyKm).toBe(40);
    /* Chang cuoi khong co chang rong nao SAU no — khong quy nham cua ai. */
    expect(ninhbinhHanoi?.attributedEmptyKm).toBe(0);
  });

  it('chang rong thieu km lam km rong quy ve thanh null, khong thanh 0', () => {
    const view = buildCorridorInsight({
      ...input,
      legsByRun: new Map([
        [
          'r1',
          [
            leg({ id: 'l1', sequence: 1, kind: 'LOADED', distanceKm: 105 }),
            leg({ id: 'l2', sequence: 2, kind: 'EMPTY', distanceKm: null }),
          ],
        ],
      ]),
    });

    expect(view.corridors[0]?.attributedEmptyKm).toBeNull();
    expect(view.corridors[0]?.legsMissingDistance).toBe(1);
  });

  it('moi tuyen mang ma don va ma vong chay — duong lan nguoc ve ban ghi goc', () => {
    const view = buildCorridorInsight(input);
    const first = view.corridors.find((entry) => entry.originLabel === 'Hà Nội');

    expect(first?.orderCodes).toEqual(['ORD-001']);
    expect(first?.runCodes).toEqual(['RUN-001']);
  });

  it('vong chay DA HUY khong vao bao cao tuyen', () => {
    const view = buildCorridorInsight({ ...input, runs: [run({ status: 'CANCELLED' })] });

    expect(view.corridors).toEqual([]);
  });

  it('tat dinh', () => {
    expect(buildCorridorInsight(input)).toEqual(buildCorridorInsight(input));
  });
});
