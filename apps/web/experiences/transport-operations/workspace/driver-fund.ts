import {
  actorLabel,
  EXPENSE_FUNDING_LABEL,
  FUND_BALANCE_STANCE_LABEL,
  FUND_ENTRY_KIND_LABEL,
  FUND_PERIOD_STATUS_LABEL,
  formatBusinessDate,
  formatBusinessDateRange,
  formatInstant,
  formatMoney,
  fundBalanceStanceTone,
  fundPeriodStatusTone,
  type StatusTone,
} from '../customer-view';
import { canPerform, type TransportAction, type TransportViewerInput } from '../transport-actions';
import type {
  DriverFundEntry,
  DriverFundPeriod,
  DriverFundStatement,
  FundPeriodStatus,
  TripCostBreakdown,
  TripExpense,
} from '../transport-types';

/**
 * MO HINH KHUNG NHIN cua man Quy lai xe / Chi phi.
 *
 * LUAT DOC QUAN TRONG NHAT cua ca man nay (hop dong mien §9.2): so du quy va gia thanh chuyen phai
 * DOI SOAT DUOC VOI NHAU nhung KHONG duoc cong vao cung mot tong. Mot khoan BOT 150.000d chi tu quy
 * de lai HAI ban ghi — mot dong tien thuc (`DriverFundEntry`) va mot dong gia thanh (`TripExpense`)
 * — cung mot khoa tuong quan. Cong chung lai la dem mot khoan tien HAI LAN.
 *
 * Vi vay tep nay co y KHONG xuat mot ham nao tra ve "tong chi phi + so du". Hai mo hinh nam rieng,
 * va `RECONCILIATION_NOTE` duoc bay tren man hinh de nguoi doc biet tai sao chung khong cong.
 */

export const RECONCILIATION_NOTE =
  'Số dư quỹ và giá thành chuyến đối soát được với nhau nhưng không cộng vào cùng một tổng: một ' +
  'khoản chi từ quỹ để lại hai bản ghi — một dòng tiền và một dòng giá thành.';

/* ------------------------------------------------------------------ *
 * So quy
 * ------------------------------------------------------------------ */

export interface FundLedgerRow {
  readonly id: string;
  readonly kindLabel: string;
  readonly amountLabel: string;
  /** Dau cua chinh but toan — de to mau, khong de tinh lai. */
  readonly isCredit: boolean;
  readonly businessDateLabel: string;
  readonly tripId: string | null;
  readonly note: string | null;
  readonly recordedBy: string;
  readonly createdAtLabel: string;
  /** But toan nay DA bi dao. */
  readonly isReversed: boolean;
  /** But toan nay CHINH LA mot lan dao. */
  readonly isReversal: boolean;
  readonly canReverse: boolean;
}

/**
 * Mot but toan da bi dao duoc nhan ra bang cach co but toan khac tro ve no qua `reversalOfId`.
 * API khong co co `isReversed`, nen phai suy tu chinh bo du lieu — va suy MOT LAN o day thay vi
 * moi cho mot kieu.
 */
/**
 * DIEN GIAI do MAY viet khi mot phieu dau vao Quy — `fuel.service.ts` ghi `Phieu do dau <ma phieu>`
 * (ASCII + ma noi bo), ca o chan TX-03 lan chan `RUN_EXPENSE`. Nguoi doc so quy khong dung duoc mot
 * ma cuid; ho can biet day la TIEN DAU lai xe tu tra. Cac dien giai khac (nguoi go tay) giu nguyen.
 */
const FUEL_POSTING_NOTE = /^Phieu do dau \S+$/;

export const fundEntryNote = (entry: Pick<DriverFundEntry, 'kind' | 'note'>): string | null => {
  if (entry.note === null || !FUEL_POSTING_NOTE.test(entry.note)) return entry.note;
  return entry.kind === 'RUN_EXPENSE'
    ? 'Tiền dầu lái xe trả tiền mặt (phiếu đổ dầu theo vòng xe)'
    : 'Tiền dầu lái xe trả tiền mặt (phiếu đổ dầu)';
};

const reversedIds = (entries: readonly DriverFundEntry[]): ReadonlySet<string> => {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry.reversalOfId !== null) ids.add(entry.reversalOfId);
  }
  return ids;
};

export const toFundLedgerRows = (
  entries: readonly DriverFundEntry[],
  viewer: TransportViewerInput,
): readonly FundLedgerRow[] => {
  const reversed = reversedIds(entries);
  const mayReverse = canPerform(viewer, 'transport.costing.reversal.post');
  return entries.map((entry) => {
    const isReversal = entry.reversalOfId !== null;
    const isReversed = reversed.has(entry.id);
    return {
      id: entry.id,
      kindLabel: FUND_ENTRY_KIND_LABEL[entry.kind],
      amountLabel: formatMoney(entry.signedAmount),
      isCredit: entry.signedAmount >= 0,
      businessDateLabel: formatBusinessDate(entry.businessDate),
      tripId: entry.tripId,
      note: fundEntryNote(entry),
      recordedBy: actorLabel(entry.recordedBy),
      createdAtLabel: formatInstant(entry.createdAt),
      isReversed,
      isReversal,
      // Dao mot lan dao bi tu choi (`REVERSAL_OF_REVERSAL_DENIED`), va dao hai lan cung mot but
      // toan la 409. Ca hai deu doc duoc ngay tu du lieu, nen khong bay nut chac chan that bai.
      canReverse: mayReverse && !isReversal && !isReversed,
    };
  });
};

export interface FundBalanceModel {
  readonly balanceLabel: string;
  readonly stanceLabel: string;
  readonly tone: StatusTone;
  readonly hasAccount: boolean;
  /** Cau day du de doc len ma khong hieu sai dau. */
  readonly sentence: string;
}

/**
 * Doc THE DUNG (`balanceStance`), khong doc dau cua `balance`.
 * `COMPANY_OWES_DRIVER` la "cong ty dang no lai xe" — doc nguoc thanh "lai xe dang no" la doi soat
 * sai ca ky, va do dung la ly do may chu tra ve mot truong rieng thay vi de man hinh tu suy.
 */
export const toFundBalance = (statement: DriverFundStatement): FundBalanceModel => {
  const stanceLabel = FUND_BALANCE_STANCE_LABEL[statement.balanceStance];
  return {
    balanceLabel: formatMoney(statement.balance),
    stanceLabel,
    tone: fundBalanceStanceTone(statement.balanceStance),
    hasAccount: statement.account !== null,
    sentence:
      statement.account === null
        ? 'Lái xe này chưa có phát sinh quỹ nào.'
        : `${stanceLabel}: ${formatMoney(Math.abs(statement.balance))}.`,
  };
};

/* ------------------------------------------------------------------ *
 * Ky quy
 * ------------------------------------------------------------------ */

export interface FundPeriodRow {
  readonly id: string;
  readonly rangeLabel: string;
  readonly status: FundPeriodStatus;
  readonly statusLabel: string;
  readonly tone: StatusTone;
  readonly closedAtLabel: string | null;
  readonly reopenReason: string | null;
  readonly canClose: boolean;
  readonly canReopen: boolean;
  /** Cau giai thich vi sao mot nut dang bay ra. */
  readonly hint: string | null;
}

const CLOSEABLE: readonly FundPeriodStatus[] = ['OPEN', 'CLOSING', 'REOPENED'];

/**
 * `CLOSING` la mot trang thai NGUOI DUNG THAY DUOC, khong phai mot khoanh khac ky thuat.
 *
 * Dong ky la hai lan commit; mot lan chet giua hai lan de ky nam lai o `CLOSING`. Duong phuc hoi
 * CHINH THUC la goi `close` lan nua. Nen man hinh khong duoc coi `CLOSING` la loi, va phai noi ro
 * rang bam lai la dung viec can lam.
 */
export const toFundPeriodRows = (
  periods: readonly DriverFundPeriod[],
  viewer: TransportViewerInput,
): readonly FundPeriodRow[] => {
  const mayManage = canPerform(viewer, 'transport.costing.period.manage');
  const mayReopen = canPerform(viewer, 'transport.costing.period.reopen');
  return periods.map((period) => ({
    id: period.id,
    rangeLabel: formatBusinessDateRange(period.startDate, period.endDate),
    status: period.status,
    statusLabel: FUND_PERIOD_STATUS_LABEL[period.status],
    tone: fundPeriodStatusTone(period.status),
    closedAtLabel: period.closedAt === null ? null : formatInstant(period.closedAt),
    reopenReason: period.reopenReason,
    canClose: mayManage && CLOSEABLE.includes(period.status),
    canReopen: mayReopen && period.status === 'CLOSED',
    hint:
      period.status === 'CLOSING'
        ? 'Kỳ đang ở giữa hai bước chốt. Bấm chốt lại để hoàn tất — đây là đường phục hồi đúng, không phải lỗi.'
        : null,
  }));
};

/** Danh sach thao tac tren so quy, da loc theo quyen. */
export interface FundActionOffer {
  readonly id: 'advance' | 'return' | 'adjust' | 'open-period';
  readonly label: string;
  readonly requiredAction: TransportAction;
  readonly hint: string | null;
}

export const fundActionOffers = (viewer: TransportViewerInput): readonly FundActionOffer[] =>
  (
    [
      {
        id: 'advance',
        label: 'Tạm ứng',
        requiredAction: 'transport.costing.driver_fund.advance',
        hint: 'Nhập số dương; hệ thống tự ghi đúng dấu theo loại bút toán.',
      },
      {
        id: 'return',
        label: 'Hoàn quỹ',
        requiredAction: 'transport.costing.driver_fund.return',
        hint: 'Nhập số dương; khoản này được ghi thành bút toán giảm.',
      },
      {
        id: 'adjust',
        label: 'Điều chỉnh',
        requiredAction: 'transport.costing.driver_fund.adjust',
        hint: 'Chỉ ô này nhận số có dấu, và không nhận 0.',
      },
      {
        id: 'open-period',
        label: 'Mở kỳ quỹ',
        requiredAction: 'transport.costing.period.manage',
        hint: null,
      },
    ] as const satisfies readonly FundActionOffer[]
  ).filter((offer) => canPerform(viewer, offer.requiredAction));

/* ------------------------------------------------------------------ *
 * Gia thanh chuyen — SO RIENG, khong cong voi so du quy
 * ------------------------------------------------------------------ */

export interface TripExpenseRow {
  readonly id: string;
  readonly categoryCode: string;
  readonly amountLabel: string;
  readonly fundedByLabel: string;
  readonly businessDateLabel: string;
  readonly note: string | null;
  readonly hasEvidence: boolean;
  readonly isReversal: boolean;
  readonly isReversed: boolean;
  readonly canReverse: boolean;
}

const reversedExpenseIds = (expenses: readonly TripExpense[]): ReadonlySet<string> => {
  const ids = new Set<string>();
  for (const expense of expenses) {
    if (expense.reversalOfId !== null) ids.add(expense.reversalOfId);
  }
  return ids;
};

export interface TripCostModel {
  readonly directCostLabel: string;
  readonly rows: readonly TripExpenseRow[];
  readonly isEmpty: boolean;
}

/**
 * "Xoa mot khoan chi" KHONG ton tai. Sua lich su chi bang mot but toan DAO tro ve ban goc — khong
 * co `PATCH`, khong co `DELETE` tren chi phi chuyen (`INV-20`). Nen `canReverse` la thao tac sua
 * duy nhat man hinh duoc bay ra.
 */
export const toTripCost = (
  breakdown: TripCostBreakdown | null,
  viewer: TransportViewerInput,
): TripCostModel => {
  if (breakdown === null) {
    return { directCostLabel: formatMoney(null), rows: [], isEmpty: true };
  }
  const reversed = reversedExpenseIds(breakdown.expenses);
  const mayReverse = canPerform(viewer, 'transport.costing.reversal.post');
  return {
    directCostLabel: formatMoney(breakdown.directCost),
    isEmpty: breakdown.expenses.length === 0,
    rows: breakdown.expenses.map((expense) => {
      const isReversal = expense.kind === 'REVERSAL' || expense.reversalOfId !== null;
      const isReversed = reversed.has(expense.id);
      return {
        id: expense.id,
        categoryCode: expense.categoryCode,
        amountLabel: formatMoney(expense.signedAmount),
        fundedByLabel: EXPENSE_FUNDING_LABEL[expense.fundedBy],
        businessDateLabel: formatBusinessDate(expense.businessDate),
        note: expense.note,
        hasEvidence: expense.evidenceLocator !== null,
        isReversal,
        isReversed,
        canReverse: mayReverse && !isReversal && !isReversed,
      };
    }),
  };
};
