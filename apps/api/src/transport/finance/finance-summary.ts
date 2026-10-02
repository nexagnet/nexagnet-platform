import type { SettlementBuckets } from '../analytics/operating-metrics.js';
import type { BusinessDate } from '../business-date.js';
import type { SettlementFlow } from '../settlement/settlement-flows.js';
import type { CompanyMarginRollup, CompanyMarginView } from './company-margin.js';

/**
 * BANG TAI CHINH — nguoi SAN XUAT dau tien cua `SettlementBuckets` (#244 G5).
 *
 * ===========================================================================
 * QUYET DINH DA BI HOAN LAI TU LAU, NAY TRA LOI.
 *
 * `operating-metrics.ts` khai `SettlementBuckets` tu `R8` roi de do: `analytics.ports.ts:17-28`
 * giai thich vi sao `transport-costing` KHONG duoc mo cong sang settlement/fuel/workforce, va
 * `docs/kien-truc/transport-domain-v2.md:1056-1063` ghi thang rang viec buoc no vao bon nguon that
 * "can mot quyet dinh CAPABILITY NAO SO HUU bao cao hop nhat, va quyet dinh do chua ai ra".
 *
 * Lane G ra quyet dinh do: **`transport-settlement`**. No da so huu bon dong tien, tuoi no phai
 * thu va bien truc tiep — tuc phan lon cac o. Hai so cua lai xe den qua cong TUY CHON, dung khuon
 * `OperationalAlertsService`.
 *
 * `import type` chu khong `import`: kieu bien mat khi sinh JavaScript, nen tep nay KHONG tao mot
 * phu thuoc luc chay tu `transport-settlement` sang `transport-costing`. Chinh
 * `operating-metrics.ts` da dat quy uoc do cho `SettlementFlow`.
 *
 * ===========================================================================
 * KHONG CO `total`, VA SE KHONG CO.
 *
 * `operating-metrics.spec.ts:269-276` khoa dieu nay o muc KIEU: `keyof SettlementBuckets` khong
 * duoc chua `total` hay `netPosition`, va tien hoan ung lai xe phai tach roi luong chua rut. Cong
 * sau con so lai cho ra mot con so khong ai no ai ca — va vi no doc len co ve co nghia, no se di
 * vao mot bao cao.
 */

/** Nguon nam NGOAI `transport-settlement`. Moi cai thuoc mot capability co the dang tat. */
export const FINANCE_SOURCES = ['DRIVER_SETTLEMENT'] as const;
export type FinanceSource = (typeof FINANCE_SOURCES)[number];

/**
 * MA TIEN da nhin thay — va do la mot canh bao co that, khong phai mot o trang tri.
 *
 * Moi phep gop tien trong mien nay hom nay deu lay `currencyCode` cua HANG DAU TIEN roi hy vong
 * (`settlement-read.service.ts:206-211`, `:146`). Voi du lieu mot dong tien thi khong sao. Voi du
 * lieu hai dong tien thi moi tong deu SAI, va khong mot cho nao trong he thong noi ra dieu do.
 *
 * Bang nay khong sua duoc loi o tang duoi, nhung no TU CHOI im lang: thay nhieu hon mot ma tien
 * thi `isSingle === false`, va be mat phai noi rang cac tong dang khong doc duoc.
 */
export interface CurrencyCoverage {
  readonly codes: readonly string[];
  readonly isSingle: boolean;
}

export interface ReceivableSummary {
  readonly outstandingTotal: number;
  readonly overdueTotal: number;
}

export interface FinanceSummaryView {
  readonly generatedFor: BusinessDate;
  /** SAU dong tien, giu rieng. Xem khoi chu thich cua `SettlementBuckets`. */
  readonly buckets: SettlementBuckets;
  /**
   * BIEN TRUC TIEP — mang theo `fixedCostsIncluded: false` va `disclosure` cua chinh no.
   *
   * Hai truong do KHONG duoc bo di khi truyen len man hinh: `GD-13` doi cau "chua gom chi phi co
   * dinh" di kem con so, va #244 G5 cam goi day la `lai rong`/`net profit`. Giu chung trong kieu
   * la cach de cau do khong the roi rung tren duong.
   *
   * `#385` — tong CA CONG TY: chuyen cu CONG don Run-first, khong dem trung (`company-margin.ts`).
   * `basis` noi con so den tu bao nhieu chuyen cu, bao nhieu don, va bao nhieu viec bi loai vi sao.
   */
  readonly directMargin: CompanyMarginRollup;
  readonly receivable: ReceivableSummary;
  readonly currency: CurrencyCoverage;
  readonly unavailableSources: readonly FinanceSource[];
}

/**
 * `#385` — HIEU QUA TUNG VIEC: moi chuyen cu va moi don Run-first mot dong, CUNG tong voi
 * `FinanceSummaryView.directMargin` (cung mot ham gop o may chu). Man hinh KHONG cong lai cac dong:
 * tong co tham quyen la `totals`.
 */
export interface FinanceMarginView extends CompanyMarginView {
  readonly generatedFor: BusinessDate;
}

/* ------------------------------------------------------------------ *
 * Cac phep gop — HAM THUAN
 * ------------------------------------------------------------------ */

/** Mot hang phai tra, thu gon con dung phan bang can. */
export interface PayableRow {
  readonly outstandingAmount: number;
  readonly currencyCode: string;
}

/** Hai so cua MOT lai xe. Chung tra loi hai cau hoi khac nhau va khong bao gio duoc cong. */
export interface DriverBalanceRow {
  /** `TX-03` — cong ty no lai xe (so du quy am). KHONG PHAI luong. */
  readonly reimbursementOutstanding: number;
  /** `TX-07b` — luong DA GHI NHAN ma lai xe chua rut. KHONG PHAI hoan ung. */
  readonly wageRemaining: number;
}

export const sumPayable = (rows: readonly PayableRow[]): number =>
  rows.reduce((total, row) => total + row.outstandingAmount, 0);

/**
 * Gop ma tien tu MOI nguon da doc duoc, roi noi that co bao nhieu ma.
 *
 * Sap xep de hai lan doc cung du lieu cho ra cung mang — bang nay duoc doi chieu, nen thu tu phai
 * on dinh.
 */
export const coverCurrency = (codes: readonly string[]): CurrencyCoverage => {
  const distinct = [...new Set(codes.filter((code) => code.length > 0))].sort();
  return { codes: distinct, isSingle: distinct.length <= 1 };
};

/**
 * HAI TONG, KHONG PHAI MOT.
 *
 * `driver-settlement.types.ts:48-62` ghi mot cai bay da co ten: `reimbursementCashedOut` la LICH
 * SU va khong bao gio duoc tru khoi `reimbursementOutstanding`. O day khong cham vao no — chi cong
 * dung hai truong da la ket luan cua tang duoi.
 */
export const foldDriverBalances = (
  rows: readonly DriverBalanceRow[],
): Pick<SettlementBuckets, 'driverReimbursementOutstanding' | 'driverSettlementRemaining'> => ({
  driverReimbursementOutstanding: rows.reduce(
    (total, row) => total + row.reimbursementOutstanding,
    0,
  ),
  driverSettlementRemaining: rows.reduce((total, row) => total + row.wageRemaining, 0),
});

/**
 * Dung `Record<SettlementFlow, number>` day du — them mot dong tien thu nam vao `TX-05` thi tep
 * nay KHONG BIEN DICH, thay vi lang le bo sot no khoi bao cao. Chinh `SettlementBuckets` da chon
 * hinh dang do vi ly do nay.
 */
export const buildFlows = (
  amounts: Readonly<Record<SettlementFlow, number>>,
): Readonly<Record<SettlementFlow, number>> => ({ ...amounts });
