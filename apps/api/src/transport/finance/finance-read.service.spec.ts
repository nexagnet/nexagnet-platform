import { describe, expect, it } from 'vitest';
import { computeDirectMargin } from '../settlement/direct-margin.js';
import { FinanceSettlementFacts } from './finance-facts.port.js';
import { FinanceReadService } from './finance-read.service.js';
import { FinanceRunFirstFacts, type RunFirstMarginFacts } from './finance-run-first.port.js';

/**
 * `#385` — HAI MAN, MOT TONG. `Tổng hợp tài chính` doc `summary().directMargin`, `Hiệu quả từng
 * chuyến` doc `margin().totals`; ca hai phai la CUNG mot ket qua cua CUNG mot ham gop, va man hinh
 * khong tu cong gi. Neu mot ngay ai do tach hai duong doc, bai nay do truoc khi giam doc thay hai
 * con so doanh thu khac nhau cho cung mot ngay.
 */

const TRIP = {
  id: 'chuyen-1',
  code: 'VT-01',
  kind: 'OWN_DIRECT' as const,
  businessDate: '2026-09-10',
  originLabel: 'Hà Nội',
  destinationLabel: 'Hải Phòng',
  customerId: 'kh-1',
};

class FakeSettlement extends FinanceSettlementFacts {
  async receivable() {
    return { outstandingTotal: 0, overdueTotal: 0 };
  }
  async receivableCurrencies() {
    return ['VND'];
  }
  async payable() {
    return [];
  }
  async tripMargins() {
    return [
      {
        trip: TRIP,
        margin: computeDirectMargin({
          tripId: TRIP.id,
          tripKind: 'OWN_DIRECT',
          revenueAmount: 10_000_000,
          directCostAmount: 4_000_000,
          carrierPayableAmount: 0,
          commissionAmount: 0,
          currencyCode: 'VND',
        }),
      },
    ];
  }
}

class FakeRunFirst extends FinanceRunFirstFacts {
  constructor(private readonly facts: RunFirstMarginFacts) {
    super();
  }
  async runFirstMargins() {
    return this.facts;
  }
}

const RUN_FIRST: RunFirstMarginFacts = {
  orders: [
    {
      order: {
        id: 'don-1',
        code: 'UAT-378-0923A',
        status: 'FULFILLED',
        businessDate: '2026-09-23',
        originLabel: 'Kho A',
        destinationLabel: 'Kho B',
        customerId: 'kh-2',
        freightAmount: 6_000_000,
        currencyCode: 'VND',
      },
      runs: [
        {
          runId: 'vong-1',
          runCode: 'RUN-S260923-BE4C94F9',
          fuelCostAttribution: 1_320_000,
          carriesOtherWork: false,
          costSourceUnavailable: false,
          pendingFuel: { amount: 0, entryCount: 0 },
        },
      ],
    },
  ],
  projectedOrderCount: 40,
  legacyTripFuelCost: new Map([['chuyen-1', 200_000]]),
  unassigned: { amount: 0, runCount: 0 },
};

const service = (facts: RunFirstMarginFacts = RUN_FIRST) =>
  new FinanceReadService(new FakeSettlement(), new FakeRunFirst(facts), {
    timeZone: 'Asia/Ho_Chi_Minh',
  });

describe('FinanceReadService — hai man, mot tong', () => {
  it('`summary().directMargin` BANG `margin().totals`', async () => {
    const read = service();
    const [summary, margin] = await Promise.all([read.summary(), read.margin()]);
    expect(summary.directMargin).toEqual(margin.totals);
  });

  it('tong gom chuyen cu + don Run-first; phan bo tren vong chieu vao dong chuyen', async () => {
    const margin = await service().margin(new Date('2026-09-23T03:00:00.000Z'));

    expect(margin.generatedFor).toBe('2026-09-23');
    expect(margin.totals.revenueAmount).toBe(16_000_000);
    // 4.000.000 TX-03 + 200.000 phan bo tren vong chieu + 1.320.000 phan bo cua don.
    expect(margin.totals.deductionAmount).toBe(5_520_000);
    expect(margin.totals.basis).toMatchObject({
      legacyTrips: { counted: 1, skipped: 0 },
      runFirstOrders: { counted: 1 },
      projectedOrderCount: 40,
    });
    expect(margin.rows.map((row) => [row.key, row.code, row.runCodes])).toEqual([
      ['ORDER:don-1', 'UAT-378-0923A', ['RUN-S260923-BE4C94F9']],
      ['TRIP:chuyen-1', 'VT-01', []],
    ]);
  });

  it('phan bo tren vong chieu cua mot chuyen KHONG co trong danh sach -> `unassigned`, khong rot', async () => {
    const margin = await service({
      ...RUN_FIRST,
      legacyTripFuelCost: new Map([['chuyen-khac', 300_000]]),
      unassigned: { amount: 100_000, runCount: 1 },
    }).margin();
    expect(margin.totals.basis.unassignedRunFirstCost).toEqual({ amount: 400_000, runCount: 2 });
  });
});
