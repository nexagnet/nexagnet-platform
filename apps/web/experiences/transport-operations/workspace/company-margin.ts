import {
  DIRECT_MARGIN_DISCLOSURE,
  formatBasisPoints,
  formatBusinessDate,
  formatCount,
  formatMoney,
  TRIP_KIND_LABEL,
  type StatusTone,
} from '../customer-view';
import type {
  CompanyMarginRollup,
  CompanyMarginRow,
  MarginExclusion,
  MarginRowSource,
} from '../transport-types';
import { ORDER_STATUS_LABEL } from './office-lifecycle';

/**
 * HIEU QUA CA CONG TY tren man hinh — `#381`/`#385`. HAM THUAN.
 *
 * ===========================================================================
 * MAY CHU CONG, MAN HINH CHI DOC
 *
 * Moi tong o day — tong chung LAN tong theo nguon — den tu `CompanyMarginRollup` cua may chu. Tep nay
 * khong co mot phep cong tien nao giua cac dong: man hinh ma tu cong thi hai man (Tổng hợp tài chính
 * va Hiệu quả) se co ngay mot con so lech nhau, va khong ai biet con nao dung.
 *
 * ===========================================================================
 * NOI RA NGUON CUA CON SO
 *
 * Giam doc/ke toan can doc ngay: doanh thu bao nhieu den tu don moi (giao theo vong xe) va bao nhieu
 * tu chuyen cu; don nao CHUA vao tong va vi sao; tien dau nao da khai ma chua phan bo. Cau "Tính trên
 * 44 chuyến" cu noi dung mot nua va lam nguoi doc tin rang da du — dung cai `#381` bat duoc.
 */

export const MARGIN_SOURCE_LABEL: Readonly<Record<MarginRowSource, string>> = {
  RUN_FIRST_ORDER: 'Đơn theo vòng xe',
  LEGACY_TRIP: 'Chuyến cũ',
};

/** Mau cua NGUON, khong phai cua trang thai: luong moi noi bat, chuyen cu lui xuong. */
const SOURCE_TONE: Readonly<Record<MarginRowSource, StatusTone>> = {
  RUN_FIRST_ORDER: 'done',
  LEGACY_TRIP: 'flat',
};

/** Vi sao mot dong CHUA vao tong — noi viec phai lam, khong noi ma enum. */
export const MARGIN_EXCLUSION_LABEL: Readonly<Record<MarginExclusion, string>> = {
  FREIGHT_MISSING: 'Chưa có giá cước',
  NO_RUN_YET: 'Chưa điều xe',
  SHARED_RUN: 'Vòng xe chở nhiều việc',
  COST_SOURCE_UNAVAILABLE: 'Chưa đọc được chi phí',
};

const EXCLUSION_EXPLAIN: Readonly<Record<MarginExclusion, string>> = {
  FREIGHT_MISSING: 'chưa nhập giá cước, nên chưa tính được biên',
  NO_RUN_YET: 'chưa có vòng xe nào chạy đơn, nên chưa có chi phí để trừ',
  SHARED_RUN: 'vòng xe chở cả việc khác, và chưa có luật chia chi phí giữa các việc',
  COST_SOURCE_UNAVAILABLE: 'không đọc được sổ chi phí của vòng xe',
};

/* ------------------------------------------------------------------ *
 * Tong + nguon
 * ------------------------------------------------------------------ */

export interface MarginSourceModel {
  readonly source: MarginRowSource;
  readonly label: string;
  /** "44 chuyến" / "1 đơn". */
  readonly countLabel: string;
  readonly revenueLabel: string;
  readonly deductionLabel: string;
  readonly marginLabel: string;
  /** Phan doanh thu cua nguon nay tren tong, `0..100` — de ve thanh ti le. `null` khi tong = 0. */
  readonly revenueShare: number | null;
  /** Cung con so, viet kieu Viet (`13,4%`) — dau thap phan la dau PHAY nhu moi ty le khac. */
  readonly revenueShareLabel: string | null;
}

export interface MarginNote {
  readonly tone: 'info' | 'warn';
  readonly text: string;
}

export interface MarginTotalsModel {
  readonly revenueLabel: string;
  readonly deductionLabel: string;
  readonly marginLabel: string;
  readonly rateLabel: string;
  readonly isNegative: boolean;
  /** Cau cong bo cua may chu — KHONG duoc bo, KHONG duoc thay chu. */
  readonly disclosure: string;
  /** "Tính trên 44 chuyến cũ và 1 đơn theo vòng xe." */
  readonly coverage: string;
  readonly sources: readonly MarginSourceModel[];
  readonly notes: readonly MarginNote[];
}

const share = (part: number, whole: number): number | null =>
  whole === 0 ? null : Math.round((part * 1000) / whole) / 10;

const shareFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const shareLabel = (value: number | null): string | null =>
  value === null ? null : `${shareFormatter.format(value)}%`;

/**
 * Cau CO SO — noi DUNG don vi cua ca hai nguon (`#381`: "Tính trên 44 chuyến" noi mot nua). Chuyen cu
 * chua co gia cuoc noi ngay trong cau nay, nhu ban cu, vi Tong quan giam doc chi hien cau nay.
 */
export function coverageSentence(totals: CompanyMarginRollup): string {
  const { legacyTrips, runFirstOrders } = totals.basis;
  const base =
    `Tính trên ${formatCount(legacyTrips.counted)} chuyến cũ và ` +
    `${formatCount(runFirstOrders.counted)} đơn theo vòng xe.`;
  return legacyTrips.skipped === 0
    ? base
    : `${base} ${formatCount(legacyTrips.skipped)} chuyến cũ chưa có giá cước nên không được tính.`;
}

/**
 * Nhung dieu nguoi doc PHAI biet truoc khi tin tong — theo thu tu: cai lam tong sai nhieu nhat truoc.
 * `warn` = tong co the khac thuc te; `info` = giai thich vi sao mot thu KHONG co trong tong.
 */
export function marginNotes(totals: CompanyMarginRollup): readonly MarginNote[] {
  const { basis } = totals;
  const notes: MarginNote[] = [];
  if (basis.pendingFuelCost.entryCount > 0) {
    notes.push({
      tone: 'warn',
      text:
        `Còn ${formatMoney(basis.pendingFuelCost.amount)} tiền dầu ` +
        `(${formatCount(basis.pendingFuelCost.entryCount)} phiếu) đã khai trên vòng xe nhưng chưa ` +
        'phân bổ vào chi phí — biên thật có thể thấp hơn tới mức này.',
    });
  }
  const excluded = (Object.entries(basis.runFirstOrders.excluded) as [MarginExclusion, number][])
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${formatCount(count)} ${EXCLUSION_EXPLAIN[reason]}`);
  if (excluded.length > 0) {
    notes.push({
      tone: 'warn',
      text: `Đơn theo vòng xe chưa vào tổng: ${excluded.join('; ')}.`,
    });
  }
  if (basis.runFirstOrders.withoutRecordedCost > 0) {
    notes.push({
      tone: 'warn',
      text:
        `${formatCount(basis.runFirstOrders.withoutRecordedCost)} đơn theo vòng xe chưa có khoản chi ` +
        'phí nào được ghi (chưa có phiếu dầu nào được phân bổ) — biên 100% của các đơn này chưa ' +
        'phản ánh chi phí thật.',
    });
  }
  if (basis.unassignedRunFirstCost.runCount > 0) {
    notes.push({
      tone: 'warn',
      text:
        `${formatMoney(basis.unassignedRunFirstCost.amount)} chi phí đã phân bổ cho ` +
        `${formatCount(basis.unassignedRunFirstCost.runCount)} vòng xe không gắn với đúng một ` +
        'đơn hay chuyến — chưa nằm trong dòng nào.',
    });
  }
  if (basis.projectedOrderCount > 0) {
    notes.push({
      tone: 'info',
      text:
        `${formatCount(basis.projectedOrderCount)} đơn sinh từ chuyến cũ đã tính qua chuyến, ` +
        'không cộng lần hai.',
    });
  }
  return notes;
}

export function toMarginTotals(totals: CompanyMarginRollup): MarginTotalsModel {
  const { legacyTrips, runFirstOrders } = totals.basis;
  return {
    revenueLabel: formatMoney(totals.revenueAmount),
    deductionLabel: formatMoney(totals.deductionAmount),
    marginLabel: formatMoney(totals.marginAmount),
    rateLabel: formatBasisPoints(totals.marginBasisPoints),
    isNegative: totals.marginAmount < 0,
    disclosure: totals.disclosure.length > 0 ? totals.disclosure : DIRECT_MARGIN_DISCLOSURE,
    coverage: coverageSentence(totals),
    sources: [
      {
        source: 'RUN_FIRST_ORDER',
        label: MARGIN_SOURCE_LABEL.RUN_FIRST_ORDER,
        countLabel: `${formatCount(runFirstOrders.counted)} đơn`,
        revenueLabel: formatMoney(runFirstOrders.revenueAmount),
        deductionLabel: formatMoney(runFirstOrders.deductionAmount),
        marginLabel: formatMoney(runFirstOrders.marginAmount),
        revenueShare: share(runFirstOrders.revenueAmount, totals.revenueAmount),
        revenueShareLabel: shareLabel(share(runFirstOrders.revenueAmount, totals.revenueAmount)),
      },
      {
        source: 'LEGACY_TRIP',
        label: MARGIN_SOURCE_LABEL.LEGACY_TRIP,
        countLabel: `${formatCount(legacyTrips.counted)} chuyến`,
        revenueLabel: formatMoney(legacyTrips.revenueAmount),
        deductionLabel: formatMoney(legacyTrips.deductionAmount),
        marginLabel: formatMoney(legacyTrips.marginAmount),
        revenueShare: share(legacyTrips.revenueAmount, totals.revenueAmount),
        revenueShareLabel: shareLabel(share(legacyTrips.revenueAmount, totals.revenueAmount)),
      },
    ],
    notes: marginNotes(totals),
  };
}

/* ------------------------------------------------------------------ *
 * Tung dong
 * ------------------------------------------------------------------ */

export interface MarginDetailLine {
  readonly label: string;
  readonly value: string;
  /** Con so nay den tu dau — so cai nao, ban ghi nao. */
  readonly source: string;
}

export interface MarginRowModel {
  readonly key: string;
  readonly source: MarginRowSource;
  readonly sourceLabel: string;
  readonly sourceTone: StatusTone;
  /** Ma don (luong moi) hoac ma chuyen — dinh danh nguoi doc nhan ra. */
  readonly code: string;
  /** Boi canh van hanh: "Vòng xe RUN-…" / loai chuyen cu. */
  readonly context: string;
  readonly dateLabel: string;
  readonly routeLabel: string;
  readonly revenueLabel: string;
  readonly costLabel: string;
  readonly marginLabel: string;
  readonly rateLabel: string;
  readonly isNegative: boolean;
  readonly counted: boolean;
  /** Mot nhan ngan cho cot "Ghi chú" — `null` khi dong sach. */
  readonly flag: { readonly label: string; readonly tone: StatusTone } | null;
  readonly detail: {
    readonly title: string;
    readonly lines: readonly MarginDetailLine[];
    readonly notes: readonly MarginNote[];
  };
}

const runContext = (row: CompanyMarginRow): string =>
  row.runCodes.length === 0 ? 'Chưa có vòng xe' : `Vòng xe ${row.runCodes.join(', ')}`;

const flagOf = (row: CompanyMarginRow): MarginRowModel['flag'] => {
  if (row.exclusion !== null) {
    return { label: `Chưa vào tổng · ${MARGIN_EXCLUSION_LABEL[row.exclusion]}`, tone: 'wait' };
  }
  if (row.unexpectedInternalCost) return { label: 'Dữ liệu mâu thuẫn', tone: 'stop' };
  if (row.pendingFuelCost.entryCount > 0) {
    return {
      label: `Dầu chưa phân bổ ${formatMoney(row.pendingFuelCost.amount)}`,
      tone: 'wait',
    };
  }
  if (hasNoRecordedCost(row)) return { label: 'Chưa ghi chi phí', tone: 'wait' };
  return null;
};

/**
 * Don DA vao tong nhung so cai chua co mot dong chi phi nao. Chi don theo vong xe: chuyen cu mang
 * chi phi TX-03 tu luc chot, va mot chuyen cu bang 0 la mot su that khac (van hien 0 ₫ nhu truoc).
 */
const hasNoRecordedCost = (row: CompanyMarginRow): boolean =>
  row.source === 'RUN_FIRST_ORDER' &&
  row.counted &&
  row.deductionAmount === 0 &&
  row.pendingFuelCost.entryCount === 0;

const detailLines = (row: CompanyMarginRow): readonly MarginDetailLine[] => {
  const revenue: MarginDetailLine = {
    label: 'Doanh thu',
    value: formatMoney(row.revenueAmount),
    source:
      row.source === 'RUN_FIRST_ORDER'
        ? `Giá cước của đơn ${row.code}`
        : `Giá cước của chuyến ${row.code}`,
  };
  if (row.costs === null) {
    return [
      revenue,
      {
        label: 'Chi phí trực tiếp',
        value: 'Chưa biết',
        source: row.exclusion === null ? '' : EXCLUSION_EXPLAIN[row.exclusion],
      },
    ];
  }
  const costs: MarginDetailLine[] = [];
  if (row.source === 'LEGACY_TRIP') {
    costs.push({
      label: 'Chi phí chuyến',
      value: formatMoney(row.costs.tripExpense),
      source: 'Sổ chi phí chuyến (dầu, cầu đường, bốc xếp… đã ghi cho chuyến)',
    });
    if (row.costs.carrierPayable !== 0) {
      costs.push({
        label: 'Cước nhà xe',
        value: formatMoney(row.costs.carrierPayable),
        source: 'Công nợ nhà xe của chuyến thuê ngoài',
      });
    }
    if (row.costs.commission !== 0) {
      costs.push({
        label: 'Hoa hồng nguồn đơn',
        value: formatMoney(row.costs.commission),
        source: 'Hoa hồng phải trả đối tác mang đơn',
      });
    }
  }
  if (row.source === 'RUN_FIRST_ORDER' || row.costs.fuelAttribution !== 0) {
    costs.push({
      label: 'Nhiên liệu phân bổ',
      value: formatMoney(row.costs.fuelAttribution),
      source:
        row.source === 'RUN_FIRST_ORDER'
          ? `Phiếu dầu kế toán đã phân bổ cho ${runContext(row).toLowerCase()}`
          : 'Phiếu dầu kế toán phân bổ cho vòng xe của chuyến này',
    });
  }
  return [
    revenue,
    ...costs,
    {
      label: 'Biên trực tiếp',
      value: formatMoney(row.marginAmount),
      source: `Doanh thu trừ ${formatMoney(row.deductionAmount)} chi phí trực tiếp`,
    },
  ];
};

const detailNotes = (row: CompanyMarginRow): readonly MarginNote[] => {
  const notes: MarginNote[] = [];
  if (row.exclusion !== null) {
    notes.push({
      tone: 'warn',
      text: `Dòng này chưa vào tổng: ${EXCLUSION_EXPLAIN[row.exclusion]}.`,
    });
  }
  if (row.pendingFuelCost.entryCount > 0) {
    notes.push({
      tone: 'warn',
      text:
        `${formatCount(row.pendingFuelCost.entryCount)} phiếu dầu (${formatMoney(row.pendingFuelCost.amount)}) ` +
        'đã khai trên vòng xe nhưng chưa phân bổ vào chi phí — phân bổ ở mục Nhiên liệu.',
    });
  }
  if (hasNoRecordedCost(row)) {
    notes.push({
      tone: 'warn',
      text:
        'Vòng xe của đơn chưa có khoản chi phí nào được ghi — chưa có phiếu dầu nào được phân bổ. ' +
        'Biên 100% ở đây là "chưa ghi chi phí", không phải "không tốn chi phí".',
    });
  }
  if (row.unexpectedInternalCost) {
    notes.push({
      tone: 'warn',
      text:
        'Chuyến thuê xe ngoài nhưng lại có chi phí vận hành nội bộ. Đây là một mâu thuẫn dữ liệu ' +
        'cần kiểm tra, không phải một con số nhỏ hơn.',
    });
  }
  return notes;
};

export function toMarginRow(row: CompanyMarginRow): MarginRowModel {
  const context =
    row.source === 'RUN_FIRST_ORDER'
      ? runContext(row)
      : row.tripKind === null
        ? MARGIN_SOURCE_LABEL.LEGACY_TRIP
        : TRIP_KIND_LABEL[row.tripKind];
  const status =
    row.source === 'RUN_FIRST_ORDER' && row.orderStatus !== null
      ? ` · ${ORDER_STATUS_LABEL[row.orderStatus]}`
      : '';
  return {
    key: row.key,
    source: row.source,
    sourceLabel: MARGIN_SOURCE_LABEL[row.source],
    sourceTone: SOURCE_TONE[row.source],
    code: row.code,
    context,
    dateLabel: formatBusinessDate(row.businessDate),
    routeLabel: `${row.originLabel} → ${row.destinationLabel}`,
    revenueLabel: formatMoney(row.revenueAmount),
    costLabel: row.deductionAmount === null ? 'Chưa biết' : formatMoney(row.deductionAmount),
    marginLabel: formatMoney(row.marginAmount),
    rateLabel: formatBasisPoints(row.marginBasisPoints),
    isNegative: row.marginAmount !== null && row.marginAmount < 0,
    counted: row.counted,
    flag: flagOf(row),
    detail: {
      title: `${MARGIN_SOURCE_LABEL[row.source]} ${row.code} · ${context}${status}`,
      lines: detailLines(row),
      notes: detailNotes(row),
    },
  };
}

export type MarginFilter = 'ALL' | MarginRowSource;

export interface MarginFilterOption {
  readonly value: MarginFilter;
  readonly label: string;
}

/** Nhan loc KEM so dong — dem dong da co, khong cong tien. */
export function marginFilterOptions(
  rows: readonly CompanyMarginRow[],
): readonly MarginFilterOption[] {
  const count = (source: MarginRowSource): number =>
    rows.filter((row) => row.source === source).length;
  return [
    { value: 'ALL', label: `Tất cả (${formatCount(rows.length)})` },
    {
      value: 'RUN_FIRST_ORDER',
      label: `${MARGIN_SOURCE_LABEL.RUN_FIRST_ORDER} (${formatCount(count('RUN_FIRST_ORDER'))})`,
    },
    {
      value: 'LEGACY_TRIP',
      label: `${MARGIN_SOURCE_LABEL.LEGACY_TRIP} (${formatCount(count('LEGACY_TRIP'))})`,
    },
  ];
}

export const filterMarginRows = (
  rows: readonly CompanyMarginRow[],
  filter: MarginFilter,
): readonly CompanyMarginRow[] =>
  filter === 'ALL' ? rows : rows.filter((row) => row.source === filter);
