import { describe, expect, it } from 'vitest';
import type {
  ApByCounterpartyRow,
  ArAgingReport,
  PartnerPosition,
  SettlementDocument,
  SettlementDocumentChain,
} from '../../transport-types';
import {
  DOCUMENT_CHAIN_NOTE,
  NET_DISPLAY_DISCLOSURE,
  toApFlow,
  toArAging,
  toDocumentChain,
  toPartnerPosition,
  toSettlementDirectory,
} from '../settlement';
import { customer, partner } from './fixtures';

/**
 * `TX-05` o tang khung nhin. Bo test nay khong kiem "co hien khong" — no kiem nhung dieu ma neu sai
 * se lam ke toan doc ra mot con so KHAC voi so cua may chu.
 */

const directory = toSettlementDirectory({
  customers: [customer({ id: 'cus-1', name: 'Công ty TNHH Bảo An' })],
  partners: [partner({ id: 'par-1', name: 'Nhà xe Hưng Thịnh', roles: ['CARRIER'] })],
});

const report = (over: Partial<ArAgingReport> = {}): ArAgingReport => ({
  asOf: '2026-09-30',
  rows: [
    {
      documentId: 'doc-1',
      counterpartyId: 'cus-1',
      businessDate: '2026-09-01',
      dueDate: '2026-09-15',
      outstandingAmount: 11_500_000,
      daysOverdue: 15,
      bucket: 'D1_30',
      currencyCode: 'VND',
    },
  ],
  totalsByBucket: { CURRENT: 0, D1_30: 11_500_000, D31_60: 0, D60_PLUS: 0 },
  outstandingTotal: 11_500_000,
  overdueTotal: 11_500_000,
  ...over,
});

describe('tuoi no phai thu', () => {
  it('doi counterpartyId thanh TEN khach, khong dan uuid len bang', () => {
    const model = toArAging(report(), directory);
    expect(model.rows[0]?.counterpartyLabel).toBe('Công ty TNHH Bảo An');
    expect(model.rows[0]?.counterpartyLabel).not.toContain('cus-1');
  });

  it('doi tac khong co trong danh ba thi NOI RA, khong bay id ra man hinh', () => {
    const base = report().rows[0];
    if (base === undefined) throw new Error('fixture thieu dong');
    const model = toArAging(
      report({ rows: [{ ...base, counterpartyId: 'khong-co-trong-danh-ba' }] }),
      directory,
    );
    expect(model.rows[0]?.counterpartyLabel).toBe('Khách hàng chưa đọc được tên');
    expect(model.rows[0]?.counterpartyLabel).not.toContain('khong-co-trong-danh-ba');
  });

  it('bon nhom tuoi no LUON du bon dong, ke ca nhom bang 0', () => {
    expect(toArAging(report(), directory).buckets).toHaveLength(4);
  });

  it('bang rong noi ro moc `asOf`, khong noi chung chung "khong co du lieu"', () => {
    const model = toArAging(report({ rows: [], outstandingTotal: 0, overdueTotal: 0 }), directory);
    expect(model.headline).toContain('30/09/2026');
  });

  it('chua doc duoc thi KHONG hien so 0 — thieu khac han bang khong', () => {
    const model = toArAging(null, directory);
    expect(model.outstandingLabel).toBe('—');
    expect(model.overdueLabel).toBe('—');
  });
});

describe('cong no phai tra — nam dong giu RIENG', () => {
  const rows: readonly ApByCounterpartyRow[] = [
    {
      counterpartyId: 'par-1',
      flow: 'CARRIER_SERVICE',
      documentCount: 2,
      outstandingAmount: 6_000_000,
      currencyCode: 'VND',
    },
  ];

  it('tong chi cong TRONG MOT dong', () => {
    expect(toApFlow('CARRIER_SERVICE', rows, directory).totalLabel).toContain('6.000.000');
  });

  it('moi dong mang nhan rieng cua no', () => {
    expect(toApFlow('CARRIER_SERVICE', rows, directory).flowLabel).toBe('Nhà xe');
    expect(toApFlow('FUEL_SUPPLIER', [], directory).flowLabel).toBe('Cây xăng');
  });

  it('dong rong duoc danh dau, khong lan voi dong chua doc duoc', () => {
    expect(toApFlow('FUEL_SUPPLIER', [], directory).isEmpty).toBe(true);
    expect(toApFlow('FUEL_SUPPLIER', null, directory).isEmpty).toBe(true);
  });
});

describe('vi the doi tac — hai chieu, khong bu tru', () => {
  const position: PartnerPosition = {
    partnerId: 'par-1',
    receivableAmount: 3_000_000,
    carrierPayableAmount: 5_000_000,
    commissionPayableAmount: 1_000_000,
    netDisplay: -3_000_000,
    currencyCode: 'VND',
  };

  it('BA con so goc luon di kem so rong', () => {
    const model = toPartnerPosition(position, directory);
    expect(model?.receivableLabel).toContain('3.000.000');
    expect(model?.carrierPayableLabel).toContain('5.000.000');
    expect(model?.commissionPayableLabel).toContain('1.000.000');
  });

  it('cau "chi de xem" di kem so rong va KHONG duoc bo', () => {
    expect(toPartnerPosition(position, directory)?.netDisclosure).toBe(NET_DISPLAY_DISCLOSURE);
    expect(NET_DISPLAY_DISCLOSURE).toContain('không bù trừ');
  });
});

describe('chuoi chung tu', () => {
  const document = (over: Partial<SettlementDocument> = {}): SettlementDocument => ({
    id: 'doc-1',
    direction: 'RECEIVABLE',
    flow: 'CUSTOMER_FREIGHT',
    counterpartyKind: 'CUSTOMER',
    counterpartyId: 'cus-1',
    kind: 'ORIGINAL',
    status: 'OPEN',
    signedAmount: 11_500_000,
    currencyCode: 'VND',
    businessDate: '2026-09-01',
    dueDate: '2026-09-15',
    tripId: 'trip-1',
    invoiceRef: 'HD-001',
    note: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...over,
  });

  const chain: SettlementDocumentChain = {
    original: document(),
    corrections: [document({ id: 'doc-2', kind: 'ADJUSTMENT', signedAmount: -1_500_000 })],
    allocations: [
      {
        id: 'alloc-1',
        documentId: 'doc-1',
        amount: 5_000_000,
        businessDate: '2026-09-20',
        method: 'BANK_TRANSFER',
        note: null,
        createdAt: '2026-09-20T00:00:00.000Z',
      },
    ],
    grossAmount: 10_000_000,
    outstandingAmount: 5_000_000,
  };

  it('ban goc va cac ban sua nam TRONG MOT bang, theo thu tu', () => {
    const model = toDocumentChain(chain, directory);
    expect(model?.documents.map((row) => row.kindLabel)).toEqual(['Chứng từ gốc', 'Điều chỉnh']);
  });

  it('so du doc tren CA CHUOI — va man hinh noi ra dieu do', () => {
    const model = toDocumentChain(chain, directory);
    expect(model?.outstandingLabel).toContain('5.000.000');
    expect(model?.note).toBe(DOCUMENT_CHAIN_NOTE);
  });

  it('khong tim thay chuoi thi tra null, khong dung mot bang rong', () => {
    expect(toDocumentChain(null, directory)).toBeNull();
  });
});
