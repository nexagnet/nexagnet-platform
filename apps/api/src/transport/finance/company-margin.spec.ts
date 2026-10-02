import { describe, expect, it } from 'vitest';
import { computeDirectMargin } from '../settlement/direct-margin.js';
import {
  buildCompanyMargin,
  type CompanyMarginInput,
  type LegacyTripMarginInput,
  type RunFirstOrderMarginInput,
  type RunFirstRunFacts,
} from './company-margin.js';

/**
 * `#381`/`#385` — DOANH THU / BIEN CA CONG TY: chuyen cu CONG don Run-first, khong dem trung.
 *
 * Moi bai o day ung voi mot dong trong "Required tests" cua `#385`. Ham THUAN, nen moi quyet dinh
 * "dong nao vao tong, vi sao khong" do duoc ma khong can Postgres; duong doc that (chieu chuyen, vong
 * xe, so phan bo) co bai rieng o `finance-run-first.port.spec.ts`.
 */

const legacy = (
  id: string,
  over: {
    revenue?: number | null;
    cost?: number;
    runFirstFuelCost?: number;
    kind?: LegacyTripMarginInput['trip']['kind'];
    businessDate?: string;
  } = {},
): LegacyTripMarginInput => {
  const kind = over.kind ?? 'OWN_DIRECT';
  return {
    trip: {
      id,
      code: `VT-${id}`,
      kind,
      businessDate: over.businessDate ?? '2026-09-10',
      originLabel: 'Hà Nội',
      destinationLabel: 'Hải Phòng',
      customerId: 'kh-1',
    },
    margin: computeDirectMargin({
      tripId: id,
      tripKind: kind,
      revenueAmount: over.revenue === undefined ? 10_000_000 : over.revenue,
      directCostAmount: over.cost ?? 4_000_000,
      carrierPayableAmount: 0,
      commissionAmount: 0,
      currencyCode: 'VND',
    }),
    runFirstFuelCost: over.runFirstFuelCost ?? 0,
  };
};

const run = (runId: string, over: Partial<RunFirstRunFacts> = {}): RunFirstRunFacts => ({
  runId,
  runCode: `RUN-${runId}`,
  fuelCostAttribution: 1_320_000,
  carriesOtherWork: false,
  costSourceUnavailable: false,
  pendingFuel: { amount: 0, entryCount: 0 },
  ...over,
});

const order = (
  id: string,
  runs: readonly RunFirstRunFacts[],
  freight: number | null = 6_000_000,
): RunFirstOrderMarginInput => ({
  order: {
    id,
    code: `UAT-${id}`,
    status: 'FULFILLED',
    businessDate: '2026-09-23',
    originLabel: 'Kho A',
    destinationLabel: 'Kho B',
    customerId: 'kh-2',
    freightAmount: freight,
    currencyCode: 'VND',
  },
  runs,
});

const build = (over: Partial<CompanyMarginInput>) =>
  buildCompanyMargin({
    legacy: [],
    runFirst: [],
    projectedOrderCount: 0,
    unassignedRunFirstCost: { amount: 0, runCount: 0 },
    ...over,
  });

describe('buildCompanyMargin — nguon nao vao tong', () => {
  it('chi chuyen cu: tong bang dung cong don TX-05 cu, co so noi "chuyen cu"', () => {
    const view = build({ legacy: [legacy('1'), legacy('2', { cost: 7_000_000 })] });

    expect(view.totals).toMatchObject({
      revenueAmount: 20_000_000,
      deductionAmount: 11_000_000,
      marginAmount: 9_000_000,
      marginBasisPoints: 4500,
      tripCount: 2,
      skippedTripCount: 0,
      fixedCostsIncluded: false,
      disclosure: 'Chưa gồm chi phí cố định',
    });
    expect(view.totals.basis.legacyTrips).toEqual({
      counted: 2,
      skipped: 0,
      revenueAmount: 20_000_000,
      deductionAmount: 11_000_000,
      marginAmount: 9_000_000,
    });
    expect(view.totals.basis.runFirstOrders.counted).toBe(0);
    expect(view.rows.map((row) => row.source)).toEqual(['LEGACY_TRIP', 'LEGACY_TRIP']);
  });

  it('chi Run-first: doanh thu la gia cuoc DON, chi phi la phan bo cua vong xe', () => {
    const view = build({ runFirst: [order('0923A', [run('BE4C')])] });

    expect(view.totals).toMatchObject({
      revenueAmount: 6_000_000,
      deductionAmount: 1_320_000,
      marginAmount: 4_680_000,
      marginBasisPoints: 7800,
      tripCount: 0,
    });
    const [row] = view.rows;
    expect(row).toMatchObject({
      key: 'ORDER:0923A',
      source: 'RUN_FIRST_ORDER',
      code: 'UAT-0923A',
      runCodes: ['RUN-BE4C'],
      revenueAmount: 6_000_000,
      costs: { tripExpense: 0, carrierPayable: 0, commission: 0, fuelAttribution: 1_320_000 },
      counted: true,
      exclusion: null,
    });
  });

  it('hon hop: tong = chuyen cu + don Run-first, moi viec dung mot dong', () => {
    const view = build({
      legacy: [legacy('1')],
      runFirst: [order('0923A', [run('BE4C')])],
    });

    expect(view.totals.revenueAmount).toBe(16_000_000);
    expect(view.totals.deductionAmount).toBe(5_320_000);
    expect(view.totals.basis.legacyTrips).toMatchObject({
      counted: 1,
      revenueAmount: 10_000_000,
      deductionAmount: 4_000_000,
      marginAmount: 6_000_000,
    });
    expect(view.totals.basis.runFirstOrders).toMatchObject({
      counted: 1,
      revenueAmount: 6_000_000,
      deductionAmount: 1_320_000,
      marginAmount: 4_680_000,
    });
    // Hai tong con cong lai DUNG bang tong chung — man hinh khong phai tu cong.
    expect(
      view.totals.basis.legacyTrips.marginAmount + view.totals.basis.runFirstOrders.marginAmount,
    ).toBe(view.totals.marginAmount);
    expect(view.rows).toHaveLength(2);
    // Moi nhat truoc: don 23/09 dung tren chuyen 10/09.
    expect(view.rows.map((row) => row.key)).toEqual(['ORDER:0923A', 'TRIP:1']);
  });

  /**
   * CHONG DEM TRUNG. Don chieu tu chuyen cu KHONG den ham nay: `FinanceRunFirstFactsAdapter` da loc
   * no (bai rieng o `finance-run-first.port.spec.ts`) va chi bao so luong. Tong phai bang dung tong
   * cua CHUYEN — khong cong them gia cuoc cua don chieu.
   */
  it('chuyen cu da chieu sang don/vong xe khong bi dem hai lan', () => {
    const view = build({ legacy: [legacy('1')], projectedOrderCount: 1 });

    expect(view.totals.revenueAmount).toBe(10_000_000);
    expect(view.totals.basis.projectedOrderCount).toBe(1);
    expect(view.rows).toHaveLength(1);
  });

  it('phan bo nhien lieu tren vong xe CHIEU cua chuyen cu vao dong chuyen do, dung mot lan', () => {
    const view = build({ legacy: [legacy('1', { runFirstFuelCost: 500_000 })] });
    const [row] = view.rows;

    expect(row!.costs).toEqual({
      tripExpense: 4_000_000,
      carrierPayable: 0,
      commission: 0,
      fuelAttribution: 500_000,
    });
    expect(row!.deductionAmount).toBe(4_500_000);
    expect(view.totals.deductionAmount).toBe(4_500_000);
  });

  it('phan bo nhien lieu cua nhieu vong xe chay CUNG mot don cong dung mot lan moi vong', () => {
    const view = build({
      runFirst: [order('X', [run('A', { fuelCostAttribution: 300_000 }), run('B')])],
    });
    expect(view.rows[0]!.deductionAmount).toBe(1_620_000);
    expect(view.totals.deductionAmount).toBe(1_620_000);
  });
});

describe('buildCompanyMargin — chi phi chua biet KHONG thanh 0', () => {
  it.each([
    ['don chua co vong xe', order('X', []), 'NO_RUN_YET'],
    ['vong xe cho viec khac', order('X', [run('A', { carriesOtherWork: true })]), 'SHARED_RUN'],
    [
      'so phan bo khong doc duoc',
      order('X', [run('A', { costSourceUnavailable: true })]),
      'COST_SOURCE_UNAVAILABLE',
    ],
  ] as const)('%s -> bien null, khong vao tong, ly do co ten', (_label, input, reason) => {
    const view = build({ legacy: [legacy('1')], runFirst: [input] });
    const row = view.rows.find((candidate) => candidate.source === 'RUN_FIRST_ORDER')!;

    expect(row).toMatchObject({
      counted: false,
      exclusion: reason,
      costs: null,
      deductionAmount: null,
      marginAmount: null,
      marginBasisPoints: null,
    });
    // Doanh thu cua don van hien tren dong — nguoi doc thay no — nhung KHONG vao tong.
    expect(row.revenueAmount).toBe(6_000_000);
    expect(view.totals.revenueAmount).toBe(10_000_000);
    expect(view.totals.basis.runFirstOrders.excluded[reason]).toBe(1);
    expect(view.totals.basis.runFirstOrders.counted).toBe(0);
  });

  it('don chua co gia cuoc: chi phi da biet van hien, bien null, dem vao FREIGHT_MISSING', () => {
    const view = build({ runFirst: [order('X', [run('A')], null)] });
    expect(view.rows[0]).toMatchObject({
      counted: false,
      exclusion: 'FREIGHT_MISSING',
      deductionAmount: 1_320_000,
      marginAmount: null,
    });
    expect(view.totals.basis.runFirstOrders.excluded.FREIGHT_MISSING).toBe(1);
  });

  it('chuyen cu chua co gia cuoc: bo qua nhu cu, `skippedTripCount` noi ra', () => {
    const view = build({ legacy: [legacy('1'), legacy('2', { revenue: null })] });
    expect(view.totals.tripCount).toBe(1);
    expect(view.totals.skippedTripCount).toBe(1);
    expect(view.rows.find((row) => row.tripId === '2')).toMatchObject({
      counted: false,
      exclusion: 'FREIGHT_MISSING',
    });
  });

  it('phieu chua phan bo het: don VAN vao tong, phan treo di kem de nguoi doc biet', () => {
    const view = build({
      runFirst: [order('X', [run('A', { pendingFuel: { amount: 1_320_000, entryCount: 1 } })])],
    });

    expect(view.rows[0]!.counted).toBe(true);
    expect(view.rows[0]!.pendingFuelCost).toEqual({ amount: 1_320_000, entryCount: 1 });
    expect(view.totals.basis.pendingFuelCost).toEqual({
      amount: 1_320_000,
      entryCount: 1,
      rowCount: 1,
    });
  });

  it('don chua ghi khoan chi phi nao: VAN vao tong, nhung duoc dem rieng', () => {
    const view = build({
      runFirst: [
        order('A', [run('A', { fuelCostAttribution: 0 })]),
        order('B', [
          run('B', { fuelCostAttribution: 0, pendingFuel: { amount: 1, entryCount: 1 } }),
        ]),
        order('C', [run('C')]),
      ],
    });
    expect(view.totals.basis.runFirstOrders.counted).toBe(3);
    // A: khong phan bo, khong phieu treo. B co phieu treo (da noi o `pendingFuelCost`). C co chi phi.
    expect(view.totals.basis.runFirstOrders.withoutRecordedCost).toBe(1);
  });

  it('phan bo tren vong xe khong gan duoc voi viec nao: khong vao dong nao, nhung duoc noi ra', () => {
    const view = build({ unassignedRunFirstCost: { amount: 700_000, runCount: 1 } });
    expect(view.totals.deductionAmount).toBe(0);
    expect(view.totals.basis.unassignedRunFirstCost).toEqual({ amount: 700_000, runCount: 1 });
  });
});
