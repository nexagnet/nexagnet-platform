import type { BusinessDate } from '../business-date.js';
import { money, MoneyError } from '../money.js';
import type { OrderStatus } from '../movement/movement.types.js';
import {
  DIRECT_MARGIN_DISCLOSURE,
  type DirectMargin,
  type DirectMarginRollup,
} from '../settlement/direct-margin.js';
import type { TripKind } from '../trips/trip-lifecycle.js';

/**
 * DOANH THU / BIEN TRUC TIEP CUA CA CONG TY — chuyen cu CONG viec Run-first (`#381`, `#385`). HAM THUAN.
 *
 * ===========================================================================
 * HAI NGUON, MOT BANG, KHONG DEM TRUNG
 *
 * ```text
 * chuyen cu (TransportTrip)       -> doanh thu = gia cuoc chuyen; chi phi = TX-03 + nha xe + hoa hong
 *                                    (`computeDirectMargin`, NGUYEN VAN). Van la nguon su that cua no.
 * don Run-first (TransportOrder)  -> doanh thu = gia cuoc DON (su that thuong mai); chi phi = so cai
 *                                    phan bo Run-first cua vong xe chay don (`runMargin`, `#369` R-1).
 * don CHIEU tu chuyen cu          -> BO QUA o nhanh don: chuyen cua no da duoc tinh o nhanh tren.
 * ```
 *
 * Hai so cai chi phi ROI NHAU theo cau truc (`#364` §3: mot phieu, mot so cai), nen nhanh don CHI doc
 * phan bo Run-first cua vong xe — KHONG doc `legacyTripExpense` cua `runMargin`: phan do la TX-03 cua
 * chuyen cu noi voi chang, va no da nam trong dong chuyen cu. Doc ca hai la dem hai lan.
 *
 * ===========================================================================
 * CHI PHI CHUA BIET KHONG BAO GIO THANH 0
 *
 * Mot don chua co vong xe, mot vong xe cho nhieu viec (chua co luat chia — `MULTI_ORDER_RUN` ngoai
 * pham vi), hay so phan bo khong doc duoc: bien cua don do la `null`, don KHONG vao tong, va tong noi
 * ra co bao nhieu don bi loai VI SAO. Coi chi phi la 0 se lam bien trong dep hon thuc te — dung cai
 * `GD-13` sinh ra de tranh.
 *
 * Phieu nhien lieu da khai tren vong xe nhung tien CHUA phan bo het thi khac: phan da phan bo la that,
 * nen don van vao tong — nhung phan con treo di kem (`pendingFuelCost`) de nguoi doc biet bien that
 * co the thap hon toi da bao nhieu.
 */

export const MARGIN_ROW_SOURCES = ['LEGACY_TRIP', 'RUN_FIRST_ORDER'] as const;
export type MarginRowSource = (typeof MARGIN_ROW_SOURCES)[number];

/** Vi sao mot dong KHONG vao tong. Moi ly do la mot viec khac nhau nguoi doc phai lam. */
export const MARGIN_EXCLUSIONS = [
  /** Chua nhap gia cuoc — ca chuyen cu lan don. Khac han doanh thu 0. */
  'FREIGHT_MISSING',
  /** Don chua co vong xe nao chay no: chua co chi phi nao de tru, khong phai chi phi bang 0. */
  'NO_RUN_YET',
  /** Vong xe cua don con cho viec khac — chua co luat chia chi phi (`MULTI_ORDER_RUN`). */
  'SHARED_RUN',
  /** So phan bo gia thanh Run-first khong doc duoc — chi phi chua biet. */
  'COST_SOURCE_UNAVAILABLE',
] as const;
export type MarginExclusion = (typeof MARGIN_EXCLUSIONS)[number];

/* ------------------------------------------------------------------ *
 * Dau vao
 * ------------------------------------------------------------------ */

export interface LegacyTripMarginInput {
  readonly trip: {
    readonly id: string;
    readonly code: string;
    readonly kind: TripKind;
    readonly businessDate: BusinessDate;
    readonly originLabel: string;
    readonly destinationLabel: string;
    readonly customerId: string | null;
  };
  /** Bien `TX-05` cua chuyen — nguyen van, khong tinh lai o day. */
  readonly margin: DirectMargin;
  /**
   * Phan bo nhien lieu Run-first nam tren vong xe CHIEU cua chinh chuyen nay (ke toan chon vong xe do
   * lam dich). Hiem, nhung co that: dich phan bo chi can cung xe. Cong vao dong chuyen de no duoc
   * tinh DUNG MOT LAN, khong bi rot khoi ca hai nhanh.
   */
  readonly runFirstFuelCost: number;
}

export interface RunFirstRunFacts {
  readonly runId: string;
  readonly runCode: string;
  /** Phan bo gia thanh nhien lieu Run-first DANG HIEU LUC cua vong xe (`runMargin.costSources`). */
  readonly fuelCostAttribution: number;
  /** Vong xe con cho don khac hoac chuyen cu — chi phi cua no chua chia duoc cho MOT don. */
  readonly carriesOtherWork: boolean;
  /** So phan bo khong doc duoc (`runMargin.unavailableSources`). */
  readonly costSourceUnavailable: boolean;
  /** Phieu nhien lieu khai tren vong xe (chua bi tu choi) ma tien chua phan bo het. */
  readonly pendingFuel: PendingFuelCost;
}

export interface RunFirstOrderMarginInput {
  readonly order: {
    readonly id: string;
    readonly code: string;
    readonly status: OrderStatus;
    readonly businessDate: BusinessDate;
    readonly originLabel: string;
    readonly destinationLabel: string;
    readonly customerId: string | null;
    readonly freightAmount: number | null;
    readonly currencyCode: string;
  };
  /** Vong xe co chang CHUA HUY chay don nay. Rong = chua dieu xe. */
  readonly runs: readonly RunFirstRunFacts[];
}

export interface PendingFuelCost {
  readonly amount: number;
  readonly entryCount: number;
}

export interface UnassignedRunFirstCost {
  readonly amount: number;
  readonly runCount: number;
}

export interface CompanyMarginInput {
  readonly legacy: readonly LegacyTripMarginInput[];
  readonly runFirst: readonly RunFirstOrderMarginInput[];
  /** Don CHIEU tu chuyen cu — da tinh qua chuyen. Dem de cau co so noi thang minh da bo gi. */
  readonly projectedOrderCount: number;
  /** Phan bo Run-first tren vong xe khong gan duoc voi MOT viec — khong vao dong nao, nhung noi ra. */
  readonly unassignedRunFirstCost: UnassignedRunFirstCost;
}

/* ------------------------------------------------------------------ *
 * Dau ra
 * ------------------------------------------------------------------ */

/** Chi phi cua mot dong, tach theo so cai — doi soat duoc ve tung bang nguon. */
export interface MarginCostBreakdown {
  /** `TX-03` — chi phi truc tiep cua chuyen cu. */
  readonly tripExpense: number;
  /** Cong no nha xe (chuyen thue ngoai). */
  readonly carrierPayable: number;
  /** Hoa hong doi tac mang don. */
  readonly commission: number;
  /** `#364` — phan bo gia thanh nhien lieu Run-first. */
  readonly fuelAttribution: number;
}

export interface CompanyMarginRow {
  /** `TRIP:<id>` hoac `ORDER:<id>` — on dinh giua hai lan doc. */
  readonly key: string;
  readonly source: MarginRowSource;
  /** Ma NGUOI DOC nhan ra: ma don (Run-first) hoac ma chuyen (chuyen cu). */
  readonly code: string;
  /** Boi canh van hanh — ma vong xe. Chuyen cu: rong. */
  readonly runCodes: readonly string[];
  readonly tripId: string | null;
  readonly orderId: string | null;
  readonly runIds: readonly string[];
  readonly tripKind: TripKind | null;
  readonly orderStatus: OrderStatus | null;
  readonly businessDate: BusinessDate;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly customerId: string | null;
  readonly revenueAmount: number | null;
  /** `null` = CHUA BIET (xem `exclusion`), khong phai 0. */
  readonly costs: MarginCostBreakdown | null;
  readonly deductionAmount: number | null;
  readonly marginAmount: number | null;
  readonly marginBasisPoints: number | null;
  /** Dong co vao tong hay khong. `false` thi `exclusion` noi vi sao. */
  readonly counted: boolean;
  readonly exclusion: MarginExclusion | null;
  readonly pendingFuelCost: PendingFuelCost;
  /** `INV-04` — chuyen thue ngoai lai co chi phi noi bo. Mau thuan du lieu, noi ra. */
  readonly unexpectedInternalCost: boolean;
  readonly currencyCode: string;
}

/**
 * Tong con cua MOT nguon, chi tren cac dong DA vao tong. Hai tong con cong lai dung bang tong chung —
 * nguoi doc thay duoc bao nhieu doanh thu den tu luong moi (don theo vong xe) ma khong phai tu cong.
 */
export interface MarginSubtotal {
  readonly revenueAmount: number;
  readonly deductionAmount: number;
  readonly marginAmount: number;
}

export interface CompanyMarginBasis {
  /** Chuyen cu: `counted` vao tong, `skipped` vi chua co gia cuoc. */
  readonly legacyTrips: MarginSubtotal & { readonly counted: number; readonly skipped: number };
  readonly runFirstOrders: MarginSubtotal & {
    readonly counted: number;
    readonly excluded: Readonly<Record<MarginExclusion, number>>;
    /**
     * Don DA vao tong ma CHUA co mot dong chi phi nao (khong phan bo, khong phieu treo). Bien 100%
     * cua chung la "chua ai ghi chi phi", khong phai "khong ton chi phi" — noi ra de khong ai doc
     * nham, nhung KHONG loai khoi tong: chi phi da ghi (0) la su that cua so cai hom nay.
     */
    readonly withoutRecordedCost: number;
  };
  readonly projectedOrderCount: number;
  /** Tong phan chua phan bo cua cac dong DA vao tong — bien that co the thap hon toi da so nay. */
  readonly pendingFuelCost: PendingFuelCost & { readonly rowCount: number };
  readonly unassignedRunFirstCost: UnassignedRunFirstCost;
}

/**
 * TONG — cung hinh `DirectMarginRollup` (`tripCount`/`skippedTripCount` giu nghia CHUYEN CU) cong
 * `basis`: moi con so tren man hinh noi duoc no den tu bao nhieu chuyen cu va bao nhieu don.
 */
export interface CompanyMarginRollup extends DirectMarginRollup {
  readonly basis: CompanyMarginBasis;
}

export interface CompanyMarginView {
  readonly totals: CompanyMarginRollup;
  /** Moi viec co doanh thu — ke ca dong KHONG vao tong (de nguoi doc thay no va ly do). */
  readonly rows: readonly CompanyMarginRow[];
}

/* ------------------------------------------------------------------ *
 * Phep gop
 * ------------------------------------------------------------------ */

const add = (left: number, right: number): number => {
  try {
    return money(money(left).amount + money(right).amount).amount;
  } catch (error) {
    if (error instanceof MoneyError) {
      throw new MoneyError(`Cong don bien cong ty vuot khoang bieu dien duoc: ${error.message}`);
    }
    throw error;
  }
};

const rate = (margin: number | null, revenue: number | null): number | null =>
  margin === null || revenue === null || revenue === 0
    ? null
    : Math.round((margin * 10000) / revenue);

const NO_PENDING: PendingFuelCost = { amount: 0, entryCount: 0 };

export function toLegacyRow(input: LegacyTripMarginInput): CompanyMarginRow {
  const { trip, margin } = input;
  const deductionAmount = add(margin.deductionAmount, input.runFirstFuelCost);
  const marginAmount =
    margin.revenueAmount === null ? null : add(margin.revenueAmount, -deductionAmount);
  return {
    key: `TRIP:${trip.id}`,
    source: 'LEGACY_TRIP',
    code: trip.code,
    runCodes: [],
    tripId: trip.id,
    orderId: null,
    runIds: [],
    tripKind: trip.kind,
    orderStatus: null,
    businessDate: trip.businessDate,
    originLabel: trip.originLabel,
    destinationLabel: trip.destinationLabel,
    customerId: trip.customerId,
    revenueAmount: margin.revenueAmount,
    costs: {
      tripExpense: margin.directCostAmount,
      carrierPayable: margin.carrierPayableAmount,
      commission: margin.commissionAmount,
      fuelAttribution: input.runFirstFuelCost,
    },
    deductionAmount,
    marginAmount,
    marginBasisPoints: rate(marginAmount, margin.revenueAmount),
    counted: marginAmount !== null,
    exclusion: marginAmount === null ? 'FREIGHT_MISSING' : null,
    pendingFuelCost: NO_PENDING,
    unexpectedInternalCost: margin.unexpectedInternalCost,
    currencyCode: margin.currencyCode,
  };
}

/**
 * Ly do loai, THEO THU TU UU TIEN: chi phi chua biet dung truoc gia cuoc thieu, vi no noi ve mot viec
 * ma nguoi van hanh phai lam truoc (dieu xe, chia chi phi) — nhap gia cuoc sau do van chua du.
 */
const runFirstExclusion = (input: RunFirstOrderMarginInput): MarginExclusion | null => {
  if (input.runs.length === 0) return 'NO_RUN_YET';
  if (input.runs.some((run) => run.carriesOtherWork)) return 'SHARED_RUN';
  if (input.runs.some((run) => run.costSourceUnavailable)) return 'COST_SOURCE_UNAVAILABLE';
  if (input.order.freightAmount === null) return 'FREIGHT_MISSING';
  return null;
};

export function toRunFirstRow(input: RunFirstOrderMarginInput): CompanyMarginRow {
  const { order, runs } = input;
  const exclusion = runFirstExclusion(input);
  const costKnown = exclusion === null || exclusion === 'FREIGHT_MISSING';
  const fuelAttribution = runs.reduce((total, run) => add(total, run.fuelCostAttribution), 0);
  const deductionAmount = costKnown ? fuelAttribution : null;
  const marginAmount =
    exclusion === null && order.freightAmount !== null && deductionAmount !== null
      ? add(order.freightAmount, -deductionAmount)
      : null;
  const pendingFuelCost = runs.reduce<PendingFuelCost>(
    (total, run) => ({
      amount: add(total.amount, run.pendingFuel.amount),
      entryCount: total.entryCount + run.pendingFuel.entryCount,
    }),
    NO_PENDING,
  );

  return {
    key: `ORDER:${order.id}`,
    source: 'RUN_FIRST_ORDER',
    code: order.code,
    runCodes: runs.map((run) => run.runCode),
    tripId: null,
    orderId: order.id,
    runIds: runs.map((run) => run.runId),
    tripKind: null,
    orderStatus: order.status,
    businessDate: order.businessDate,
    originLabel: order.originLabel,
    destinationLabel: order.destinationLabel,
    customerId: order.customerId,
    revenueAmount: order.freightAmount,
    costs: costKnown ? { tripExpense: 0, carrierPayable: 0, commission: 0, fuelAttribution } : null,
    deductionAmount,
    marginAmount,
    marginBasisPoints: rate(marginAmount, order.freightAmount),
    counted: exclusion === null,
    exclusion,
    pendingFuelCost,
    unexpectedInternalCost: false,
    currencyCode: order.currencyCode,
  };
}

const emptyExclusions = (): Record<MarginExclusion, number> => ({
  FREIGHT_MISSING: 0,
  NO_RUN_YET: 0,
  SHARED_RUN: 0,
  COST_SOURCE_UNAVAILABLE: 0,
});

const subtotal = (rows: readonly CompanyMarginRow[]): MarginSubtotal => {
  const revenueAmount = rows.reduce((total, row) => add(total, row.revenueAmount ?? 0), 0);
  const deductionAmount = rows.reduce((total, row) => add(total, row.deductionAmount ?? 0), 0);
  return { revenueAmount, deductionAmount, marginAmount: add(revenueAmount, -deductionAmount) };
};

/** Moi nhat truoc; cung ngay thi theo ma — hai lan doc cung du lieu ra cung thu tu. */
const byRecency = (left: CompanyMarginRow, right: CompanyMarginRow): number =>
  right.businessDate.localeCompare(left.businessDate) || left.code.localeCompare(right.code);

export function buildCompanyMargin(input: CompanyMarginInput): CompanyMarginView {
  const legacyRows = input.legacy.map(toLegacyRow);
  const runFirstRows = input.runFirst.map(toRunFirstRow);
  const legacyCountedRows = legacyRows.filter((row) => row.counted);
  const runFirstCountedRows = runFirstRows.filter((row) => row.counted);
  const counted = [...legacyCountedRows, ...runFirstCountedRows];

  const { revenueAmount, deductionAmount, marginAmount } = subtotal(counted);

  const excluded = emptyExclusions();
  for (const row of runFirstRows) {
    if (row.exclusion !== null) excluded[row.exclusion] += 1;
  }
  const pendingRows = counted.filter((row) => row.pendingFuelCost.entryCount > 0);
  const legacyCounted = legacyCountedRows.length;

  return {
    totals: {
      revenueAmount,
      deductionAmount,
      marginAmount,
      marginBasisPoints: rate(marginAmount, revenueAmount),
      tripCount: legacyCounted,
      skippedTripCount: legacyRows.length - legacyCounted,
      fixedCostsIncluded: false,
      disclosure: DIRECT_MARGIN_DISCLOSURE,
      basis: {
        legacyTrips: {
          ...subtotal(legacyCountedRows),
          counted: legacyCounted,
          skipped: legacyRows.length - legacyCounted,
        },
        runFirstOrders: {
          ...subtotal(runFirstCountedRows),
          counted: runFirstCountedRows.length,
          excluded,
          withoutRecordedCost: runFirstCountedRows.filter(
            (row) => row.deductionAmount === 0 && row.pendingFuelCost.entryCount === 0,
          ).length,
        },
        projectedOrderCount: input.projectedOrderCount,
        pendingFuelCost: {
          amount: pendingRows.reduce((total, row) => add(total, row.pendingFuelCost.amount), 0),
          entryCount: pendingRows.reduce((total, row) => total + row.pendingFuelCost.entryCount, 0),
          rowCount: pendingRows.length,
        },
        unassignedRunFirstCost: input.unassignedRunFirstCost,
      },
    },
    rows: [...legacyRows, ...runFirstRows].sort(byRecency),
  };
}
