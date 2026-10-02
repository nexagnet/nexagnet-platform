import { formatBusinessDate, formatCount, formatMoney } from '../customer-view';
import type { TransportSectionId } from '../navigation';
import type { FinanceSource, FinanceSummaryView, SettlementFlow } from '../transport-types';
import { toMarginTotals, type MarginNote, type MarginSourceModel } from './company-margin';

/**
 * BANG TAI CHINH — tang doc cua man hinh, HAM THUAN.
 *
 * ===========================================================================
 * SAU DONG, VA KHONG MOT TONG NAO.
 *
 * `INV-23` + Issue #87: cong no khach, cong no cay xang, cong no nha xe, hoa hong doi tac, tien
 * phai tra lai xe va luong da ghi nhan chua rut la SAU cau hoi khac nhau voi SAU doi tuong khac
 * nhau. Tep nay khong co mot phep cong nao giua chung — va do la tinh chat quan trong nhat cua no.
 *
 * Mot con so "tong cong no" doc len rat co nghia, va chinh vi the no se di vao mot bao cao roi
 * khong ai go ra duoc nua.
 *
 * ===========================================================================
 * BIEN TRUC TIEP KHONG PHAI LAI RONG.
 *
 * `disclosure` cua may chu di CUNG con so len man hinh, khong phai mot chu thich nho o cuoi trang.
 * #244 G5 cam goi day la mot khoan lai da tru het chi phi, chung nao chua co mo hinh chi phi co
 * dinh day du.
 */

const FLOW_LABEL: Readonly<Record<SettlementFlow, string>> = {
  CUSTOMER_FREIGHT: 'Khách hàng còn nợ',
  FUEL_SUPPLIER: 'Còn nợ cây xăng',
  CARRIER_SERVICE: 'Còn nợ nhà xe',
  PARTNER_COMMISSION: 'Hoa hồng phải trả đối tác',
};

/**
 * CHIEU cua tung dong — mot dong PHAI THU va mot dong PHAI TRA khong bao gio duoc doc chung mot
 * kieu. Nham chieu se lam mot khoan khach no doc thanh mot khoan cong ty no.
 */
const FLOW_DIRECTION: Readonly<Record<SettlementFlow, 'RECEIVABLE' | 'PAYABLE'>> = {
  CUSTOMER_FREIGHT: 'RECEIVABLE',
  FUEL_SUPPLIER: 'PAYABLE',
  CARRIER_SERVICE: 'PAYABLE',
  PARTNER_COMMISSION: 'PAYABLE',
};

const FLOW_ORDER: readonly SettlementFlow[] = [
  'CUSTOMER_FREIGHT',
  'FUEL_SUPPLIER',
  'CARRIER_SERVICE',
  'PARTNER_COMMISSION',
];

export interface FinanceMoneyRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly direction: 'RECEIVABLE' | 'PAYABLE';
  readonly section: TransportSectionId | null;
}

export interface FinanceMarginModel {
  readonly revenue: string;
  readonly deduction: string;
  readonly margin: string;
  readonly ratio: string;
  /** Cau cong bo cua may chu. KHONG duoc bo di, va KHONG duoc thay bang chu cua man hinh. */
  readonly disclosure: string;
  readonly coverage: string;
  /** `#385` — doanh thu/bien theo NGUON (don theo vong xe / chuyen cu), tong CON cua may chu. */
  readonly sources: readonly MarginSourceModel[];
  /** `#385` — dieu phai biet truoc khi tin tong: tien dau chua phan bo, don chua vao tong... */
  readonly notes: readonly MarginNote[];
}

export interface FinanceModel {
  readonly generatedFor: string;
  /** SAU dong, giu rieng, theo thu tu on dinh. */
  readonly rows: readonly FinanceMoneyRow[];
  readonly receivableOverdue: string;
  readonly margin: FinanceMarginModel;
  /** `null` khi du lieu chi co mot ma tien. Mot cau canh bao khi co nhieu hon mot. */
  readonly currencyWarning: string | null;
  readonly disabledSourceNotes: readonly string[];
}

const SOURCE_LABEL: Readonly<Record<FinanceSource, string>> = {
  DRIVER_SETTLEMENT: 'Quyết toán lái xe',
};

/**
 * MOI DONG DAN VE MUC TRA LOI DUNG CAU HOI CUA NO (#341).
 *
 * Truoc day hai duong dan nay bi DAO: dong khach hang dan sang `ar-ap` — man khong co tuoi no phai
 * thu nao — con ba dong phai tra dan sang `settlement`, man chi giu cuoc khach hang. Bam "Còn nợ
 * cây xăng" ra mot trang toan so tien khach no. Gio: phai thu → `Phải thu khách hàng`, phai tra →
 * `Phải trả đối tác & cây xăng`.
 */
const FLOW_SECTION: Readonly<Record<SettlementFlow, TransportSectionId>> = {
  CUSTOMER_FREIGHT: 'settlement',
  FUEL_SUPPLIER: 'ar-ap',
  CARRIER_SERVICE: 'ar-ap',
  PARTNER_COMMISSION: 'ar-ap',
};

export function toFinance(view: FinanceSummaryView): FinanceModel {
  const margin = toMarginTotals(view.directMargin);
  const flowRows = FLOW_ORDER.map((flow): FinanceMoneyRow => ({
    key: flow,
    label: FLOW_LABEL[flow],
    value: formatMoney(view.buckets.flows[flow]),
    direction: FLOW_DIRECTION[flow],
    section: FLOW_SECTION[flow],
  }));

  /*
   * HAI DONG CUOI PHAI TACH. `SettlementBuckets` giu chung o hai truong rieng chinh vi ly do nay,
   * va man hinh phai giu tiep — gop lai la lam mat dung cai `TX-07b` sinh ra de tranh.
   */
  const driverRows: readonly FinanceMoneyRow[] = [
    {
      key: 'driver-reimbursement',
      label: 'Công ty còn nợ lái xe (hoàn ứng)',
      value: formatMoney(view.buckets.driverReimbursementOutstanding),
      direction: 'PAYABLE',
      section: 'driver-fund',
    },
    {
      key: 'driver-wage-remaining',
      label: 'Lương đã ghi nhận, lái xe chưa rút',
      value: formatMoney(view.buckets.driverSettlementRemaining),
      direction: 'PAYABLE',
      section: 'driver-settlement',
    },
  ];

  return {
    generatedFor: formatBusinessDate(view.generatedFor),
    rows: [...flowRows, ...driverRows],
    receivableOverdue: formatMoney(view.receivable.overdueTotal),
    margin: {
      revenue: margin.revenueLabel,
      deduction: margin.deductionLabel,
      margin: margin.marginLabel,
      ratio: margin.rateLabel,
      disclosure: view.directMargin.disclosure,
      coverage: margin.coverage,
      sources: margin.sources,
      notes: margin.notes,
    },
    currencyWarning: view.currency.isSingle
      ? null
      : `Dữ liệu đang có ${formatCount(view.currency.codes.length)} mã tiền ` +
        `(${view.currency.codes.join(', ')}) — các tổng bên dưới không cộng thẳng được.`,
    disabledSourceNotes: view.unavailableSources.map(
      (source) => `${SOURCE_LABEL[source]}: khách chưa bật nghiệp vụ này, nên bảng thiếu mục đó.`,
    ),
  };
}
