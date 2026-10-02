import { describe, expect, it } from 'vitest';
import * as driverFundModule from '../driver-fund';
import {
  fundActionOffers,
  toFundBalance,
  toFundLedgerRows,
  toFundPeriodRows,
  toTripCost,
} from '../driver-fund';
import { fundEntry, fundPeriod, fundStatement, tripExpense } from './fixtures';

describe('so du quy — doc THE DUNG, khong doc dau cua so', () => {
  it('so duong nghia la lai xe dang giu tien cua cong ty', () => {
    const model = toFundBalance(fundStatement());
    expect(model.stanceLabel).toBe('Lái xe đang giữ tiền của công ty');
    expect(model.sentence).toContain('9.850.000');
  });

  it('so AM la "cong ty dang no lai xe", KHONG phai "lai xe dang no"', () => {
    // Doc nguoc cho nay la doi soat sai ca ky, va do la ly do may chu tra ve mot truong the dung
    // rieng thay vi de man hinh tu suy tu dau cua `balance`.
    const model = toFundBalance(
      fundStatement({ balance: -500_000, balanceStance: 'COMPANY_OWES_DRIVER' }),
    );
    expect(model.stanceLabel).toBe('Công ty đang nợ lái xe');
    expect(model.stanceLabel).not.toContain('lái xe đang nợ');
  });

  it('can bang doc len la da can bang', () => {
    expect(toFundBalance(fundStatement({ balance: 0, balanceStance: 'SETTLED' })).stanceLabel).toBe(
      'Đã cân bằng',
    );
  });

  it('lai xe chua co phat sinh thi noi thang, khong hien 0 dong nhu mot so da doi soat', () => {
    const model = toFundBalance(
      fundStatement({ account: null, balance: 0, balanceStance: 'SETTLED', entries: [] }),
    );
    expect(model.hasAccount).toBe(false);
    expect(model.sentence).toBe('Lái xe này chưa có phát sinh quỹ nào.');
  });
});

describe('so quy — sua lich su chi bang but toan dao', () => {
  it('but toan thuong dao duoc khi co quyen', () => {
    const rows = toFundLedgerRows([fundEntry()], 'ADMIN');
    expect(rows[0]!.canReverse).toBe(true);
    expect(rows[0]!.isReversal).toBe(false);
    expect(rows[0]!.isReversed).toBe(false);
  });

  it('but toan DA bi dao thi khong dao lan hai — dao hai lan la 409', () => {
    const rows = toFundLedgerRows(
      [fundEntry({ id: 'goc' }), fundEntry({ id: 'dao', kind: 'REVERSAL', reversalOfId: 'goc' })],
      'ADMIN',
    );
    const original = rows.find((row) => row.id === 'goc');
    expect(original?.isReversed).toBe(true);
    expect(original?.canReverse).toBe(false);
  });

  it('CHINH mot lan dao thi khong dao duoc — REVERSAL_OF_REVERSAL_DENIED', () => {
    const rows = toFundLedgerRows(
      [fundEntry({ id: 'dao', kind: 'REVERSAL', reversalOfId: 'goc' })],
      'ADMIN',
    );
    expect(rows[0]!.isReversal).toBe(true);
    expect(rows[0]!.canReverse).toBe(false);
  });

  it('khong co quyen dao thi khong bay nut', () => {
    expect(toFundLedgerRows([fundEntry()], 'MANAGER')[0]!.canReverse).toBe(false);
  });

  it('dau cua but toan duoc giu nguyen de to mau, khong tinh lai', () => {
    const rows = toFundLedgerRows(
      [fundEntry({ signedAmount: -150_000, kind: 'TRIP_EXPENSE' })],
      'ADMIN',
    );
    expect(rows[0]!.isCredit).toBe(false);
    expect(rows[0]!.kindLabel).toBe('Chi phí chuyến');
  });

  it('#380 — but toan Run-first `RUN_EXPENSE` co nhan tieng Viet, khong phai loai rong', () => {
    const rows = toFundLedgerRows(
      [fundEntry({ signedAmount: -1_320_000, kind: 'RUN_EXPENSE', tripId: null })],
      'ACCOUNTING',
    );
    expect(rows[0]!.kindLabel).toBe('Chi phí vòng xe');
    expect(rows[0]!.isCredit).toBe(false);
  });

  it('#385 — dien giai MAY viet cua phieu dau thanh cau nguoi doc hieu; ghi chu go tay giu nguyen', () => {
    const [runFirst, legacy, typed] = toFundLedgerRows(
      [
        fundEntry({ id: 'a', kind: 'RUN_EXPENSE', note: 'Phieu do dau cmuechrvf0003ob01j35cds1q' }),
        fundEntry({
          id: 'b',
          kind: 'TRIP_EXPENSE',
          note: 'Phieu do dau cmu0000000000000000000000',
        }),
        fundEntry({ id: 'c', kind: 'ADVANCE', note: 'Phieu do dau tay — ke toan go' }),
      ],
      'ACCOUNTING',
    );
    expect(runFirst!.note).toBe('Tiền dầu lái xe trả tiền mặt (phiếu đổ dầu theo vòng xe)');
    expect(legacy!.note).toBe('Tiền dầu lái xe trả tiền mặt (phiếu đổ dầu)');
    expect(typed!.note).toBe('Phieu do dau tay — ke toan go');
  });
});

describe('ky quy', () => {
  it('ky dang mo thi chot duoc, va chua mo lai duoc', () => {
    const row = toFundPeriodRows([fundPeriod()], 'ACCOUNTING')[0]!;
    expect(row.canClose).toBe(true);
    expect(row.canReopen).toBe(false);
    expect(row.rangeLabel).toBe('01/09/2026 – 30/09/2026');
  });

  it('ky dang CHOT la trang thai THAY DUOC, va bam chot lai la duong phuc hoi dung', () => {
    // Dong ky la hai lan commit; chet giua hai lan de ky nam o `CLOSING`. Man hinh khong duoc coi
    // day la loi.
    const row = toFundPeriodRows([fundPeriod({ status: 'CLOSING' })], 'ACCOUNTING')[0]!;
    expect(row.statusLabel).toBe('Đang chốt');
    expect(row.canClose).toBe(true);
    expect(row.hint).toContain('đường phục hồi đúng');
  });

  it('mo lai ky da chot la quyen RIENG cua Giam doc, khong phai quyen quan ly ky', () => {
    const closed = fundPeriod({ status: 'CLOSED', closedAt: '2026-10-01T02:00:00.000Z' });
    expect(toFundPeriodRows([closed], 'ACCOUNTING')[0]!.canReopen).toBe(false);
    expect(toFundPeriodRows([closed], 'ADMIN')[0]!.canReopen).toBe(true);
  });

  it('ky da mo lai thi chot lai duoc, va khong bao gio ve lai trang thai mo', () => {
    const row = toFundPeriodRows([fundPeriod({ status: 'REOPENED' })], 'ACCOUNTING')[0]!;
    expect(row.canClose).toBe(true);
    expect(row.statusLabel).toBe('Đã mở lại');
  });
});

describe('thao tac tren quy — loc theo quyen', () => {
  it('Ke toan tao duoc tam ung va mo duoc ky', () => {
    const ids = fundActionOffers('ACCOUNTING').map((offer) => offer.id);
    expect(ids).toContain('advance');
    expect(ids).toContain('open-period');
  });

  it('MANAGER khong co thao tac nao', () => {
    expect(fundActionOffers('MANAGER')).toEqual([]);
  });

  it('o dieu chinh noi ro la nhan so CO DAU — ba o kia thi khong', () => {
    const offers = fundActionOffers('ADMIN');
    expect(offers.find((offer) => offer.id === 'adjust')?.hint).toContain('có dấu');
    expect(offers.find((offer) => offer.id === 'advance')?.hint).toContain('số dương');
  });
});

describe('gia thanh chuyen — SO RIENG, khong cong voi so du quy', () => {
  it('module KHONG xuat mot ham nao cong hai so do lai voi nhau', () => {
    // §9.2: so du quy va gia thanh chuyen doi soat duoc nhung khong cong vao cung mot tong. Mot
    // khoan chi tu quy de lai HAI ban ghi; cong chung lai la dem mot khoan tien hai lan. Bai nay
    // khoa y do do o muc BE MAT MODULE, de khong ai lang le them mot ham "tong tat ca".
    for (const name of Object.keys(driverFundModule)) {
      expect(name).not.toMatch(/total|sum|combined|grand/i);
    }
    expect(driverFundModule.RECONCILIATION_NOTE).toContain('không cộng vào cùng một tổng');
  });

  it('chi phi chuyen doc ra nguon tien va co bang chung hay khong', () => {
    const model = toTripCost(
      { tripId: 't1', currencyCode: 'VND', directCost: 150_000, expenses: [tripExpense()] },
      'ADMIN',
    );
    expect(model.directCostLabel).toContain('150.000');
    expect(model.rows[0]!.fundedByLabel).toBe('Lấy từ quỹ lái xe');
    expect(model.rows[0]!.hasEvidence).toBe(true);
    expect(model.isEmpty).toBe(false);
  });

  it('"xoa mot khoan chi" khong ton tai — chi co dao', () => {
    const model = toTripCost(
      { tripId: 't1', currencyCode: 'VND', directCost: 150_000, expenses: [tripExpense()] },
      'ADMIN',
    );
    expect(model.rows[0]!.canReverse).toBe(true);
  });

  it('khoan chi da bi dao thi khong dao lan hai', () => {
    const model = toTripCost(
      {
        tripId: 't1',
        currencyCode: 'VND',
        directCost: 0,
        expenses: [
          tripExpense({ id: 'goc' }),
          tripExpense({ id: 'dao', kind: 'REVERSAL', reversalOfId: 'goc', signedAmount: -150_000 }),
        ],
      },
      'ADMIN',
    );
    expect(model.rows.find((row) => row.id === 'goc')?.canReverse).toBe(false);
    expect(model.rows.find((row) => row.id === 'dao')?.canReverse).toBe(false);
  });

  it('chua doc duoc chi phi thi noi la chua co, khong hien 0 dong', () => {
    const model = toTripCost(null, 'ADMIN');
    expect(model.directCostLabel).toBe('—');
    expect(model.isEmpty).toBe(true);
  });
});
