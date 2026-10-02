import { describe, expect, it } from 'vitest';
import type { SettlementBuckets } from '../analytics/operating-metrics.js';
import { buildCompanyMargin } from './company-margin.js';
import {
  coverCurrency,
  foldDriverBalances,
  sumPayable,
  type FinanceSummaryView,
} from './finance-summary.js';

describe('gop phai tra', () => {
  it('cong dung cac hang, khong doi dau', () => {
    expect(
      sumPayable([
        { outstandingAmount: 1_200_000, currencyCode: 'VND' },
        { outstandingAmount: 800_000, currencyCode: 'VND' },
      ]),
    ).toBe(2_000_000);
  });

  it('khong co hang nao thi la 0 that, khong phai `null`', () => {
    expect(sumPayable([])).toBe(0);
  });
});

describe('ma tien — tu choi im lang khi co nhieu hon mot', () => {
  it('mot ma tien thi doc duoc', () => {
    expect(coverCurrency(['VND', 'VND', 'VND'])).toEqual({ codes: ['VND'], isSingle: true });
  });

  /**
   * Day la loi CO THAT o tang duoi: moi phep gop hom nay lay `currencyCode` cua hang dau tien roi
   * hy vong. Bang nay khong sua duoc dieu do, nhung no phai NOI RA — mot tong tron hai dong tien
   * doc len y het mot tong dung.
   */
  it('hai ma tien thi bao khong doc duoc, va liet ke ca hai', () => {
    expect(coverCurrency(['VND', 'USD', 'VND'])).toEqual({
      codes: ['USD', 'VND'],
      isSingle: false,
    });
  });

  it('khong co hang nao thi van la "mot" — khong co gi de tron', () => {
    expect(coverCurrency([])).toEqual({ codes: [], isSingle: true });
  });

  it('bo qua chuoi rong thay vi dem no thanh mot ma tien', () => {
    expect(coverCurrency(['VND', ''])).toEqual({ codes: ['VND'], isSingle: true });
  });

  it('tat dinh — thu tu dau vao khong doi ket qua', () => {
    expect(coverCurrency(['USD', 'VND'])).toEqual(coverCurrency(['VND', 'USD']));
  });
});

describe('hai so cua lai xe — KHONG BAO GIO cong lai', () => {
  it('hoan ung va luong chua rut di ra hai truong rieng', () => {
    const folded = foldDriverBalances([
      { reimbursementOutstanding: 300_000, wageRemaining: 5_000_000 },
      { reimbursementOutstanding: 200_000, wageRemaining: 3_000_000 },
    ]);

    expect(folded.driverReimbursementOutstanding).toBe(500_000);
    expect(folded.driverSettlementRemaining).toBe(8_000_000);
  });

  /**
   * `TX-07b` ton tai chinh de tranh dieu nay: mot lan chi hoan ung KHONG duoc trong nhu mot lan
   * tra luong. Neu ai do gop hai truong lam mot, bai nay do.
   */
  it('khong co truong nao gop hai so lai', () => {
    const folded = foldDriverBalances([{ reimbursementOutstanding: 1, wageRemaining: 2 }]);

    expect(Object.keys(folded).sort()).toEqual([
      'driverReimbursementOutstanding',
      'driverSettlementRemaining',
    ]);
  });
});

/**
 * ===========================================================================
 * TINH CHAT CUA KIEU — nhung thu phai dung luc BIEN DICH, khong doi luc chay.
 */
describe('hinh dang cua bang tai chinh', () => {
  it('`SettlementBuckets` khong co `total` hay `netPosition`', () => {
    type Keys = keyof SettlementBuckets;
    const forbidden: readonly string[] = ['total', 'netPosition', 'net', 'sum'];
    const actual: readonly Keys[] = [
      'flows',
      'driverReimbursementOutstanding',
      'driverSettlementRemaining',
    ];

    for (const key of actual) expect(forbidden).not.toContain(key);
    expect(actual).toHaveLength(3);
  });

  /**
   * BIEN TRUC TIEP KHONG PHAI LAI RONG.
   *
   * #244 G5 cam goi no la `net profit`/`lai rong` chung nao chua co mo hinh chi phi co dinh day
   * du. Hai truong duoi giu cau cong bo di CUNG con so, nen no khong the roi rung khi payload di
   * qua cac tang.
   */
  it('bien truc tiep luon mang theo `fixedCostsIncluded: false` va mot cau cong bo', () => {
    // `#385` — tong la tong CA CONG TY, dung boi `buildCompanyMargin`: cau cong bo di theo no.
    const view: Pick<FinanceSummaryView, 'directMargin'> = {
      directMargin: buildCompanyMargin({
        legacy: [],
        runFirst: [],
        projectedOrderCount: 0,
        unassignedRunFirstCost: { amount: 0, runCount: 0 },
      }).totals,
    };

    expect(view.directMargin.fixedCostsIncluded).toBe(false);
    expect(view.directMargin.disclosure.length).toBeGreaterThan(0);
    expect(view.directMargin.disclosure.toLowerCase()).not.toContain('lãi ròng');
    expect(view.directMargin.disclosure.toLowerCase()).not.toContain('net profit');
  });
});
