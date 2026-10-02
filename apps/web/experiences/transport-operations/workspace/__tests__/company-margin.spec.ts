import { describe, expect, it } from 'vitest';
import type { CompanyMarginRollup, CompanyMarginRow } from '../../transport-types';
import {
  filterMarginRows,
  marginFilterOptions,
  marginNotes,
  toMarginRow,
  toMarginTotals,
} from '../company-margin';

/**
 * `#381`/`#385` — man Hiệu quả o tang khung nhin. Kiem nhung dieu neu sai se lam giam doc doc ra
 * mot con so KHAC so cua may chu: chi phi chua biet hien thanh 0, don moi bi goi la chuyen cu, hay
 * mot canh bao "tien dau chua phan bo" bi nuot.
 */

const EMPTY_EXCLUDED = {
  FREIGHT_MISSING: 0,
  NO_RUN_YET: 0,
  SHARED_RUN: 0,
  COST_SOURCE_UNAVAILABLE: 0,
} as const;

const totals = (over: Partial<CompanyMarginRollup['basis']> = {}): CompanyMarginRollup => ({
  revenueAmount: 279_300_000,
  deductionAmount: 67_433_799,
  marginAmount: 211_866_201,
  marginBasisPoints: 7586,
  tripCount: 44,
  skippedTripCount: 0,
  fixedCostsIncluded: false,
  disclosure: 'Chưa gồm chi phí cố định',
  basis: {
    legacyTrips: {
      counted: 44,
      skipped: 0,
      revenueAmount: 273_300_000,
      deductionAmount: 66_113_799,
      marginAmount: 207_186_201,
    },
    runFirstOrders: {
      counted: 1,
      excluded: EMPTY_EXCLUDED,
      withoutRecordedCost: 0,
      revenueAmount: 6_000_000,
      deductionAmount: 1_320_000,
      marginAmount: 4_680_000,
    },
    projectedOrderCount: 40,
    pendingFuelCost: { amount: 0, entryCount: 0, rowCount: 0 },
    unassignedRunFirstCost: { amount: 0, runCount: 0 },
    ...over,
  },
});

const row = (over: Partial<CompanyMarginRow> = {}): CompanyMarginRow => ({
  key: 'ORDER:don-1',
  source: 'RUN_FIRST_ORDER',
  code: 'UAT-378-0923A',
  runCodes: ['RUN-S260923-BE4C94F9'],
  tripId: null,
  orderId: 'don-1',
  runIds: ['vong-1'],
  tripKind: null,
  orderStatus: 'FULFILLED',
  businessDate: '2026-09-23',
  originLabel: 'Kho A',
  destinationLabel: 'Kho B',
  customerId: 'kh-1',
  revenueAmount: 6_000_000,
  costs: { tripExpense: 0, carrierPayable: 0, commission: 0, fuelAttribution: 1_320_000 },
  deductionAmount: 1_320_000,
  marginAmount: 4_680_000,
  marginBasisPoints: 7800,
  counted: true,
  exclusion: null,
  pendingFuelCost: { amount: 0, entryCount: 0 },
  unexpectedInternalCost: false,
  currencyCode: 'VND',
  ...over,
});

const digits = (text: string): string => text.replace(/\D/g, '');

describe('tong + nguon', () => {
  it('doc tong cua may chu va tong con theo nguon — khong cong lai o man hinh', () => {
    const model = toMarginTotals(totals());

    expect(digits(model.revenueLabel)).toBe('279300000');
    expect(model.coverage).toBe('Tính trên 44 chuyến cũ và 1 đơn theo vòng xe.');
    expect(model.sources.map((source) => source.source)).toEqual([
      'RUN_FIRST_ORDER',
      'LEGACY_TRIP',
    ]);
    expect(digits(model.sources[0]!.marginLabel)).toBe('4680000');
    // 6.000.000 / 279.300.000 = 2,1% — HINH cua phan doanh thu, khong phai mot tong moi.
    expect(model.sources[0]!.revenueShare).toBe(2.1);
    // Dau thap phan kieu Viet, nhu moi ty le khac tren man (`#385`: ban dau in "13.4%").
    expect(model.sources[0]!.revenueShareLabel).toBe('2,1%');
    expect(model.disclosure).toBe('Chưa gồm chi phí cố định');
  });

  it('tong doanh thu bang 0: khong chia cho 0, thanh ti le rong', () => {
    const model = toMarginTotals({ ...totals(), revenueAmount: 0 });
    expect(model.sources.every((source) => source.revenueShare === null)).toBe(true);
  });

  it('bien am duoc danh dau de to do — khong giau mot thang lo', () => {
    expect(toMarginTotals({ ...totals(), marginAmount: -1 }).isNegative).toBe(true);
  });
});

describe('loi canh bao truoc khi tin tong', () => {
  it('tien dau chua phan bo noi ra so tien va so phieu', () => {
    const [first] = marginNotes(
      totals({ pendingFuelCost: { amount: 1_320_000, entryCount: 1, rowCount: 1 } }),
    );
    expect(first?.tone).toBe('warn');
    expect(first?.text).toContain('1 phiếu');
    expect(first?.text).toContain('biên thật có thể thấp hơn');
  });

  it('don chua vao tong: noi SO LUONG va LY DO, tung ly do mot', () => {
    const notes = marginNotes(
      totals({
        runFirstOrders: {
          ...totals().basis.runFirstOrders,
          excluded: { ...EMPTY_EXCLUDED, NO_RUN_YET: 2, SHARED_RUN: 1 },
        },
      }),
    );
    const text = notes.map((note) => note.text).join(' ');
    expect(text).toContain('2 chưa có vòng xe nào chạy đơn');
    expect(text).toContain('1 vòng xe chở cả việc khác');
  });

  it('don da vao tong nhung chua ghi chi phi nao: noi ra, bien 100% khong phai that', () => {
    const notes = marginNotes(
      totals({ runFirstOrders: { ...totals().basis.runFirstOrders, withoutRecordedCost: 7 } }),
    );
    expect(notes.map((note) => note.text).join(' ')).toContain(
      '7 đơn theo vòng xe chưa có khoản chi phí nào được ghi',
    );
  });

  it('khong co gi dang lo thi chi con dong giai thich don chieu', () => {
    expect(marginNotes(totals()).map((note) => note.tone)).toEqual(['info']);
  });
});

describe('tung dong', () => {
  it('don theo vong xe: ma DON la dinh danh, ma vong xe la boi canh', () => {
    const model = toMarginRow(row());
    expect(model.code).toBe('UAT-378-0923A');
    expect(model.context).toBe('Vòng xe RUN-S260923-BE4C94F9');
    expect(model.sourceLabel).toBe('Đơn theo vòng xe');
    expect(model.flag).toBeNull();
    expect(model.detail.title).toContain('Đã giao xong');
    const sources = model.detail.lines.map((line) => [line.label, line.source]);
    expect(sources[0]).toEqual(['Doanh thu', 'Giá cước của đơn UAT-378-0923A']);
    expect(sources[1]![0]).toBe('Nhiên liệu phân bổ');
  });

  it('chi phi CHUA BIET hien "Chưa biết", khong bao gio 0 ₫', () => {
    const model = toMarginRow(
      row({
        costs: null,
        deductionAmount: null,
        marginAmount: null,
        marginBasisPoints: null,
        counted: false,
        exclusion: 'NO_RUN_YET',
        runCodes: [],
      }),
    );
    expect(model.costLabel).toBe('Chưa biết');
    expect(model.marginLabel).toBe('—');
    expect(model.flag).toEqual({ label: 'Chưa vào tổng · Chưa điều xe', tone: 'wait' });
    expect(model.context).toBe('Chưa có vòng xe');
    // Dong chi phi cua khoi chi tiet cung noi "Chưa biết" — khong mot so tien nao duoc bia ra.
    expect(model.detail.lines.map((line) => [line.label, line.value])).toEqual([
      ['Doanh thu', model.revenueLabel],
      ['Chi phí trực tiếp', 'Chưa biết'],
    ]);
  });

  it('don da vao tong ma chua ghi chi phi nao: nhan "Chưa ghi chi phí", khong im lang 100%', () => {
    const model = toMarginRow(
      row({
        costs: { tripExpense: 0, carrierPayable: 0, commission: 0, fuelAttribution: 0 },
        deductionAmount: 0,
        marginAmount: 6_000_000,
        marginBasisPoints: 10000,
      }),
    );
    expect(model.flag).toEqual({ label: 'Chưa ghi chi phí', tone: 'wait' });
    expect(model.detail.notes[0]?.text).toContain('không phải "không tốn chi phí"');
    // Chuyen cu bang 0 la mot su that khac — khong gan nhan nay.
    expect(
      toMarginRow(
        row({
          source: 'LEGACY_TRIP',
          key: 'TRIP:1',
          tripKind: 'OWN_DIRECT',
          deductionAmount: 0,
          costs: { tripExpense: 0, carrierPayable: 0, commission: 0, fuelAttribution: 0 },
        }),
      ).flag,
    ).toBeNull();
  });

  it('phieu dau chua phan bo co mot nhan rieng tren dong', () => {
    const model = toMarginRow(row({ pendingFuelCost: { amount: 500_000, entryCount: 1 } }));
    expect(model.flag?.label).toContain('Dầu chưa phân bổ');
    expect(model.detail.notes[0]?.text).toContain('phân bổ ở mục Nhiên liệu');
  });

  it('chuyen cu: nguon la so chi phi chuyen; mau thuan du lieu duoc noi ra', () => {
    const model = toMarginRow(
      row({
        key: 'TRIP:chuyen-1',
        source: 'LEGACY_TRIP',
        code: 'VT-2026-0913',
        runCodes: [],
        tripId: 'chuyen-1',
        orderId: null,
        tripKind: 'EXTERNAL_CARRIER',
        orderStatus: null,
        costs: {
          tripExpense: 200_000,
          carrierPayable: 5_000_000,
          commission: 0,
          fuelAttribution: 0,
        },
        unexpectedInternalCost: true,
      }),
    );
    expect(model.sourceLabel).toBe('Chuyến cũ');
    expect(model.detail.lines.map((line) => line.label)).toEqual([
      'Doanh thu',
      'Chi phí chuyến',
      'Cước nhà xe',
      'Biên trực tiếp',
    ]);
    expect(model.flag?.tone).toBe('stop');
  });

  it('loc theo nguon, nhan loc kem so dong', () => {
    const rows = [row(), row({ key: 'TRIP:1', source: 'LEGACY_TRIP' })];
    expect(filterMarginRows(rows, 'RUN_FIRST_ORDER')).toHaveLength(1);
    expect(filterMarginRows(rows, 'ALL')).toHaveLength(2);
    expect(marginFilterOptions(rows).map((option) => option.label)).toEqual([
      'Tất cả (2)',
      'Đơn theo vòng xe (1)',
      'Chuyến cũ (1)',
    ]);
  });

  it('khong mot nhan nao goi bien la lai rong', () => {
    const text = JSON.stringify([toMarginTotals(totals()), toMarginRow(row())]).toLowerCase();
    expect(text).not.toContain('lãi ròng');
    expect(text).not.toContain('lợi nhuận ròng');
  });
});
