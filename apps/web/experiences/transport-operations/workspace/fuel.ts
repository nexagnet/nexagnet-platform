import {
  FUEL_DISCREPANCY_KIND_LABEL,
  FUEL_DISCREPANCY_RESOLUTION_LABEL,
  FUEL_PAYMENT_METHOD_LABEL,
  FUEL_RECONCILIATION_STATE_LABEL,
  FUEL_RECONCILIATION_STATUS_LABEL,
  FUEL_VERIFICATION_LABEL,
  formatBusinessDate,
  formatBusinessDateRange,
  formatConsumption,
  formatCount,
  formatInstant,
  formatLiters,
  formatMoney,
  formatOdometer,
  fuelReconciliationStateTone,
  fuelReconciliationStatusTone,
  fuelReviewReasonLabel,
  fuelVerificationTone,
  rejectReasonLabel,
  type StatusTone,
} from '../customer-view';
import { canPerform, type TransportViewerInput } from '../transport-actions';
import type { DeclaredFuelFacts } from './fuel-extraction';
import { REVISABLE_FUEL_RESOLUTIONS, type RevisableFuelResolution } from '../transport-types';
import type {
  FuelDiscrepancy,
  FuelDiscrepancyKind,
  FuelDiscrepancyResolution,
  FuelEntry,
  FuelEntryInboxPage,
  FuelEntryInboxRow,
  FuelInboxEvidenceRef,
  FuelPaymentMethod,
  FuelReconciliation,
  FuelReconciliationStatus,
  FuelReconciliationWorkspace,
  FuelStatementLine,
  FuelSupplier,
  StatementImportPreview,
} from '../transport-types';

/**
 * MO HINH KHUNG NHIN cua man Nhien lieu.
 *
 * HAI TRUC DOC LAP, va gop chung tren man hinh la lam mat dung cai gia tri ma chung duoc tach ra de
 * giu (hop dong mien §7.4):
 *
 *   · `verificationStatus`   — *ke toan da tin so lieu tren phieu nay chua?* Tra loi duoc NGAY khi
 *     anh ve.
 *   · `reconciliationStatus` — *phieu nay co tren bang ke cay xang chua?* Chi tra loi duoc CUOI KY.
 *
 * Nen mot phieu co the vua `VERIFIED` vua `UNMATCHED`, va do la trang thai binh thuong chu khong
 * phai mau thuan. Man hinh phai bay HAI phu hieu, khong phai mot.
 */

/* ------------------------------------------------------------------ *
 * Phieu dau
 * ------------------------------------------------------------------ */

export interface FuelEntryRow {
  readonly id: string;
  readonly businessDateLabel: string;
  readonly occurredAtLabel: string;
  readonly supplierLabel: string;
  readonly litersLabel: string;
  readonly amountLabel: string;
  readonly odometerLabel: string;
  readonly consumptionLabel: string;
  readonly paymentLabel: string;
  readonly verificationLabel: string;
  readonly verificationTone: StatusTone;
  readonly reconciliationLabel: string;
  readonly reconciliationTone: StatusTone;
  readonly reviewReasons: readonly string[];
  readonly invoiceNo: string | null;
  readonly canVerify: boolean;
  /** Cau cua hop xac nhan "Xác thực" — xem `verifyConsequence`. */
  readonly verifyConsequence: string;
  readonly canReject: boolean;
  readonly canAmend: boolean;
  /** Ly do khong sua duoc — HAI ly do khac nhau, doi hai viec khac nhau cua nguoi dung. */
  readonly amendBlockedReason: string | null;
  /**
   * Phieu bi tu choi NOP LAI duoc — `#168 B5` mo `POST /transport/fuel/entries/:id/resubmit`.
   *
   * Truoc do o day co mot `deadEndNote` noi "Máy chủ chưa mở đường nộp lại". Cau do nay SAI ve
   * nghiep vu, va con vi pham #195 o cho no ke ve may chu thay vi noi viec can lam.
   */
  readonly canResubmit: boolean;
  readonly rejectedNote: string | null;
}

const LOCKED_RECONCILIATION: readonly FuelReconciliationStatus[] = ['SETTLED', 'IGNORED'];

/**
 * Cong sua phieu kiem CA HAI truc va tra ve HAI ma khac nhau co chu dich
 * (`fuel-lifecycle.ts:230-233`): *"nguoi dung o hai tinh huong nay phai lam hai viec KHAC NHAU"*.
 * Nen man hinh cung phai noi hai cau khac nhau, khong duoc gop thanh "khong sua duoc".
 */
const amendBlockedReason = (entry: FuelEntry): string | null => {
  if (entry.verificationStatus !== 'DECLARED') {
    return 'Phiếu đã được xác thực hoặc từ chối nên số liệu không sửa trực tiếp được nữa.';
  }
  if (LOCKED_RECONCILIATION.includes(entry.reconciliationStatus)) {
    return 'Phiếu đã đi vào một kỳ đối soát đã chốt nên không sửa được ở đây.';
  }
  return null;
};

export const toFuelEntryRow = (
  entry: FuelEntry,
  suppliers: ReadonlyMap<string, string>,
  viewer: TransportViewerInput,
): FuelEntryRow => {
  const blocked = amendBlockedReason(entry);
  const mayVerify = canPerform(viewer, 'transport.fuel.entry.verify');
  return {
    id: entry.id,
    businessDateLabel: formatBusinessDate(entry.businessDate),
    occurredAtLabel: formatInstant(entry.occurredAt),
    supplierLabel: suppliers.get(entry.supplierId) ?? 'Cây xăng chưa đọc được tên',
    litersLabel: formatLiters(entry.litersUnits),
    amountLabel: formatMoney(entry.amount),
    odometerLabel: formatOdometer(entry.odometerKm),
    consumptionLabel: formatConsumption(entry.consumptionUnits),
    paymentLabel: FUEL_PAYMENT_METHOD_LABEL[entry.paymentMethod],
    verificationLabel: FUEL_VERIFICATION_LABEL[entry.verificationStatus],
    verificationTone: fuelVerificationTone(entry.verificationStatus),
    reconciliationLabel: FUEL_RECONCILIATION_STATUS_LABEL[entry.reconciliationStatus],
    reconciliationTone: fuelReconciliationStatusTone(entry.reconciliationStatus),
    // `#313` — cau cho nguoi doc, khong phai ma may (`ODOMETER_NOT_ADVANCED`).
    reviewReasons: entry.reviewReasons.map(fuelReviewReasonLabel),
    invoiceNo: entry.invoiceNo,
    // `verify` goi lai duoc nhieu lan theo thiet ke, nhung chi co nghia khi con `DECLARED`.
    canVerify: mayVerify && entry.verificationStatus === 'DECLARED',
    verifyConsequence: verifyConsequence(entry),
    canReject: mayVerify && entry.verificationStatus === 'DECLARED',
    canAmend: mayVerify && blocked === null,
    amendBlockedReason: blocked,
    canResubmit: mayVerify && entry.verificationStatus === 'REJECTED',
    // Giu NGUYEN VAN ghi chu cua nguoi tu choi khi co: no la thu duy nhat noi ro phai sua cai gi.
    rejectedNote:
      entry.verificationStatus === 'REJECTED'
        ? (entry.reviewNote ?? 'Phiếu bị từ chối. Sửa lại theo ghi chú rồi nộp lại.')
        : null,
  };
};

export const toFuelEntryRows = (
  entries: readonly FuelEntry[],
  suppliers: readonly FuelSupplier[],
  viewer: TransportViewerInput,
): readonly FuelEntryRow[] => {
  const index = new Map(suppliers.map((row) => [row.id, row.name]));
  return entries.map((entry) => toFuelEntryRow(entry, index, viewer));
};

/* ------------------------------------------------------------------ *
 * HOP THU PHIEU NHIEN LIEU cua CA DOI — #222 P1-B
 * ------------------------------------------------------------------ */

export interface FuelInboxRowModel {
  readonly id: string;
  /** `#313` — khoa de mo drill-down tieu hao cua DUNG xe, DUNG thang cua phieu. */
  readonly vehicleId: string;
  readonly businessDate: string;
  /**
   * Nhung gi to khai da ghi, o dang SO — de dat canh ung vien may doc. Hop thu khong tra odo, nen
   * `odometerKm` o day la `null`; khoi chi tiet bo sung tu `GET entries/:id` khi da doc xong.
   */
  readonly declared: DeclaredFuelFacts;
  /**
   * `#364` — NGU CANH doc duoc: ma chuyen v1 (phieu cu, giu NGUYEN chu de tim nguoc ve chuyen), hoac
   * ma vong xe (+ chang) cua phieu Run-first. Xem `fuelContextLabel`.
   */
  readonly contextLabel: string;
  readonly driverLabel: string;
  readonly vehicleLabel: string;
  readonly supplierLabel: string;
  /** `#317` G1 — tram lai xe khai; `null` = phieu khong khai tram. */
  readonly stationLabel: string | null;
  readonly businessDateLabel: string;
  readonly occurredAtLabel: string;
  readonly litersLabel: string;
  readonly amountLabel: string;
  readonly invoiceNo: string | null;
  readonly paymentLabel: string;
  readonly verificationLabel: string;
  readonly verificationTone: StatusTone;
  readonly reconciliationLabel: string;
  readonly reconciliationTone: StatusTone;
  readonly reviewReasons: readonly string[];
  readonly rejectedNote: string | null;
  readonly evidenceCountLabel: string;
  readonly evidence: readonly FuelInboxEvidenceRef[];
  readonly canVerify: boolean;
  /** Cau cua hop xac nhan "Xác thực" — xem `verifyConsequence`. */
  readonly verifyConsequence: string;
  readonly canReject: boolean;
  readonly canResubmit: boolean;
}

/**
 * HAU QUA cua lan XAC THUC, noi truoc khi bam — theo CACH TRA, vi hai cach tra dan tien di hai ngả.
 *
 * `DRIVER_CASH` tru quy lai xe NGAY luc duyet (chuyen cu qua `TX-03`, viec duoc dieu qua mot but toan
 * `RUN_EXPENSE`, `#369` R-4) va KHONG BAO GIO vao cong no cay xang. Cau cu "vao ky doi soat bang ke"
 * dung cho phieu ghi no, nhung noi sai voi phieu tien mat (`#385`).
 */
export const verifyConsequence = (entry: {
  readonly paymentMethod: FuelPaymentMethod;
  readonly amount: number;
  readonly tripId: string | null;
}): string => {
  if (entry.paymentMethod === 'SUPPLIER_ACCOUNT') {
    return 'Sau khi xác thực, phiếu vào được kỳ đối soát bảng kê; công nợ cây xăng chỉ ghi khi chốt kỳ.';
  }
  const cost =
    entry.tripId === null
      ? 'Giá thành của phiếu được phân bổ sau ở mục Giá thành nhiên liệu.'
      : 'Khoản này đồng thời vào chi phí của chuyến.';
  return (
    `Sau khi xác thực, ${formatMoney(entry.amount)} trừ vào quỹ lái xe (lái xe đã trả tiền mặt) — ` +
    `không vào công nợ cây xăng. ${cost}`
  );
};

/**
 * NGU CANH CUA MOT PHIEU o dang chu — `#364`. Mot ham cho hop thu ke toan VA danh sach phieu lai xe.
 *
 * Phieu chuyen v1 hien DUNG ma chuyen, khong tien to: day la dinh danh ke toan dung de tim nguoc ve
 * chuyen tu truoc `#364`, va doi no se lam lac moi thoi quen (va moi lien ket) dang co. Phieu Run-first
 * hien ma vong xe, kem so chang khi co. Phieu khong gan viec nao noi dung nhu vay — khong bia ma.
 */
export const fuelContextLabel = (context: {
  readonly tripCode: string | null;
  readonly runCode: string | null;
  readonly legSequence: number | null;
}): string => {
  if (context.tripCode !== null) return context.tripCode;
  if (context.runCode !== null) {
    return context.legSequence === null
      ? `Vòng xe ${context.runCode}`
      : `Vòng xe ${context.runCode} · Chặng ${context.legSequence}`;
  }
  return 'Không gắn việc';
};

/**
 * MOT DONG HOP THU o dang man hinh doc duoc.
 *
 * KHONG dung lai `toFuelEntryRow`: dong hop thu da co san chu (`tripCode`, `driverName`,
 * `vehiclePlate`, `supplierName`) do MAY CHU doi, con `toFuelEntryRow` nhan `FuelEntry` tho va tu
 * tra bang cay xang. Ep chung chung mot ham se buoc mot trong hai ben phai gia vo co du lieu ma no
 * khong co.
 *
 * Ba cong hanh dong (`canVerify`/`canReject`/`canResubmit`) dung DUNG luat cua `toFuelEntryRow` —
 * mot ban sao lech o day se de hai man hinh cho hai cau tra loi khac nhau cho cung mot phieu.
 */
export const toFuelInboxRow = (
  row: FuelEntryInboxRow,
  viewer: TransportViewerInput,
): FuelInboxRowModel => {
  const mayVerify = canPerform(viewer, 'transport.fuel.entry.verify');
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    businessDate: row.businessDate,
    declared: {
      litersUnits: row.litersUnits,
      amount: row.amount,
      invoiceNo: row.invoiceNo,
      businessDate: row.businessDate,
      odometerKm: null,
      vehiclePlate: row.vehiclePlate,
    },
    contextLabel: fuelContextLabel(row),
    // May chu tra `null` khi ho so da bi xoa/doi ten. Noi that thay vi de mot o trong.
    driverLabel: row.driverName ?? 'Lái xe chưa đọc được tên',
    vehicleLabel: row.vehiclePlate ?? 'Xe chưa đọc được biển',
    supplierLabel: row.supplierName ?? 'Cây xăng chưa đọc được tên',
    stationLabel:
      row.stationId === null ? null : (row.stationName ?? 'Trạm đã khai nhưng chưa đọc được tên'),
    businessDateLabel: formatBusinessDate(row.businessDate),
    occurredAtLabel: formatInstant(row.occurredAt),
    litersLabel: formatLiters(row.litersUnits),
    amountLabel: formatMoney(row.amount),
    invoiceNo: row.invoiceNo,
    paymentLabel: FUEL_PAYMENT_METHOD_LABEL[row.paymentMethod],
    verificationLabel: FUEL_VERIFICATION_LABEL[row.verificationStatus],
    verificationTone: fuelVerificationTone(row.verificationStatus),
    reconciliationLabel: FUEL_RECONCILIATION_STATUS_LABEL[row.reconciliationStatus],
    reconciliationTone: fuelReconciliationStatusTone(row.reconciliationStatus),
    reviewReasons: row.reviewReasons.map(fuelReviewReasonLabel),
    rejectedNote:
      row.verificationStatus === 'REJECTED'
        ? (row.reviewNote ?? 'Phiếu bị từ chối. Lái xe sửa lại theo ghi chú rồi nộp lại.')
        : null,
    evidenceCountLabel: formatCount(row.evidenceCount),
    evidence: row.evidence,
    canVerify: mayVerify && row.verificationStatus === 'DECLARED',
    verifyConsequence: verifyConsequence(row),
    canReject: mayVerify && row.verificationStatus === 'DECLARED',
    canResubmit: mayVerify && row.verificationStatus === 'REJECTED',
  };
};

export interface FuelInboxModel {
  readonly rows: readonly FuelInboxRowModel[];
  /** `N chờ xác thực` — con so DUY NHAT tren man nay noi co viec phai lam. */
  readonly pendingLabel: string;
  readonly isIdle: boolean;
  readonly totalLabel: string;
  readonly rangeLabel: string;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
}

/**
 * TRANG HOP THU o dang man hinh doc duoc.
 *
 * `rangeLabel` (`1–50 / 214`) chu khong mot so trang: nguoi doi soat quan tam "toi dang nhin nhung
 * dong nao trong bao nhieu dong", khong quan tam day la trang thu may cua mot phep chia.
 */
export const toFuelInboxModel = (
  page: FuelEntryInboxPage,
  viewer: TransportViewerInput,
): FuelInboxModel => {
  const first = page.total === 0 ? 0 : page.offset + 1;
  const last = Math.min(page.offset + page.rows.length, page.total);
  return {
    rows: page.rows.map((row) => toFuelInboxRow(row, viewer)),
    pendingLabel:
      page.pendingVerificationCount === 0
        ? 'Không còn phiếu nào chờ xác thực'
        : `${formatCount(page.pendingVerificationCount)} chờ xác thực`,
    isIdle: page.pendingVerificationCount === 0,
    totalLabel: `${formatCount(page.total)} phiếu`,
    rangeLabel: page.total === 0 ? '0 / 0' : `${first}–${last} / ${formatCount(page.total)}`,
    hasPrevious: page.offset > 0,
    hasNext: page.offset + page.rows.length < page.total,
  };
};

/* ------------------------------------------------------------------ *
 * Ky doi soat
 * ------------------------------------------------------------------ */

export interface ReconciliationRow {
  readonly id: string;
  readonly supplierLabel: string;
  readonly periodLabel: string;
  readonly stateLabel: string;
  readonly tone: StatusTone;
  readonly closedAtLabel: string | null;
  /**
   * CO Y de `null`: `GET /transport/fuel/reconciliations` tra `FuelReconciliation[]` KHONG kem
   * `pendingDiscrepancyCount`. Bia mot con so o day la noi doi; muon biet phai mo tung ky.
   */
  readonly pendingCount: number | null;
}

export const toReconciliationRows = (
  reconciliations: readonly FuelReconciliation[],
  suppliers: readonly FuelSupplier[],
): readonly ReconciliationRow[] => {
  const index = new Map(suppliers.map((row) => [row.id, row.name]));
  return reconciliations.map((row) => ({
    id: row.id,
    supplierLabel: index.get(row.supplierId) ?? 'Cây xăng chưa đọc được tên',
    periodLabel: formatBusinessDateRange(row.periodStart, row.periodEnd),
    stateLabel: FUEL_RECONCILIATION_STATE_LABEL[row.state],
    tone: fuelReconciliationStateTone(row.state),
    closedAtLabel: row.closedAt === null ? null : formatInstant(row.closedAt),
    pendingCount: null,
  }));
};

export interface StatementLineRow {
  readonly id: string;
  readonly rowNumber: number;
  readonly plateRaw: string;
  readonly businessDateLabel: string;
  readonly litersLabel: string;
  readonly amountLabel: string;
  readonly invoiceNo: string | null;
  readonly statusLabel: string;
  readonly tone: StatusTone;
  readonly rejectLabel: string | null;
  readonly isAccepted: boolean;
}

export const toStatementLineRows = (
  lines: readonly FuelStatementLine[],
): readonly StatementLineRow[] =>
  lines.map((line) => ({
    id: line.id,
    rowNumber: line.rowNumber,
    plateRaw: line.vehiclePlateRaw,
    businessDateLabel: formatBusinessDate(line.businessDate),
    litersLabel: formatLiters(line.litersUnits),
    amountLabel: formatMoney(line.amount),
    invoiceNo: line.invoiceNo,
    statusLabel: FUEL_RECONCILIATION_STATUS_LABEL[line.reconciliationStatus],
    tone: fuelReconciliationStatusTone(line.reconciliationStatus),
    rejectLabel: line.status === 'REJECTED' ? rejectReasonLabel(line.rejectReason) : null,
    isAccepted: line.status === 'ACCEPTED',
  }));

/* ------------------------------------------------------------------ *
 * Chenh lech
 * ------------------------------------------------------------------ */

/**
 * Nhung cach xu ly HOP LY cho tung loai chenh lech.
 *
 * `requiresTargets` la diem de sai nhieu nhat: voi `AMBIGUOUS_CANDIDATES`, chon `MATCH_CONFIRMED`
 * ma khong chi ro CAP nao la 400 `FUEL_MATCH_TARGET_REQUIRED`. Nen o day noi thang cho man hinh
 * biet phai bat nguoi dung chon mot cap truoc khi cho bam.
 */
export interface DiscrepancyResolutionOption {
  readonly resolution: FuelDiscrepancyResolution;
  readonly label: string;
  readonly requiresTargets: boolean;
}

const RESOLUTIONS_BY_KIND: Readonly<
  Record<FuelDiscrepancyKind, readonly FuelDiscrepancyResolution[]>
> = {
  AMBIGUOUS_CANDIDATES: ['MATCH_CONFIRMED', 'IGNORE_WITH_REASON'],
  STATEMENT_LINE_ONLY: ['ACCEPT_SUPPLIER_AMOUNT', 'REJECT_SUPPLIER_LINE', 'IGNORE_WITH_REASON'],
  FUEL_ENTRY_ONLY: ['ENTRY_CORRECTION_REQUIRED', 'IGNORE_WITH_REASON'],
  OUT_OF_TOLERANCE: ['ACCEPT_SUPPLIER_AMOUNT', 'ENTRY_CORRECTION_REQUIRED', 'IGNORE_WITH_REASON'],
  SELF_SOURCED_BLOCKED: ['IGNORE_WITH_REASON', 'REJECT_SUPPLIER_LINE'],
  /**
   * `#317` G4 — so hoa don hai ben trai nhau. NGUOI xac nhan duoc cap (vd lai xe go nham so), hoac
   * chap nhan so cay xang, hoac bat sua phieu — may khong duoc tu chon.
   */
  INVOICE_CONFLICT: [
    'MATCH_CONFIRMED',
    'ACCEPT_SUPPLIER_AMOUNT',
    'ENTRY_CORRECTION_REQUIRED',
    'IGNORE_WITH_REASON',
  ],
  /**
   * `#371` — ung vien la phieu lai xe DA TRA TIEN MAT. Khong `MATCH_CONFIRMED`, khong
   * `ACCEPT_SUPPLIER_AMOUNT`: ca hai la tra cung mot lan do hai lan, va may chu tu choi ca hai (403).
   */
  PAYMENT_METHOD_CONFLICT: [
    'REJECT_SUPPLIER_LINE',
    'ENTRY_CORRECTION_REQUIRED',
    'IGNORE_WITH_REASON',
  ],
};

/** Hai loai chenh lech co danh sach UNG VIEN de nguoi chon cap khi xac nhan khop. */
const KINDS_WITH_CANDIDATE_PAIRS: readonly FuelDiscrepancyKind[] = [
  'AMBIGUOUS_CANDIDATES',
  'INVOICE_CONFLICT',
];

export const discrepancyResolutionOptions = (
  kind: FuelDiscrepancyKind,
): readonly DiscrepancyResolutionOption[] =>
  RESOLUTIONS_BY_KIND[kind].map((resolution) => ({
    resolution,
    label: FUEL_DISCREPANCY_RESOLUTION_LABEL[resolution],
    requiresTargets: KINDS_WITH_CANDIDATE_PAIRS.includes(kind) && resolution === 'MATCH_CONFIRMED',
  }));

/** Mot lua chon DOI Y (`#317` G0) — khong bao gio la `MATCH_CONFIRMED`. */
export interface DecisionRevisionOption {
  readonly resolution: RevisableFuelResolution;
  readonly label: string;
}

export interface DiscrepancyRow {
  readonly id: string;
  readonly kind: FuelDiscrepancyKind;
  readonly kindLabel: string;
  readonly isPending: boolean;
  /**
   * `#317` G0 — quyet dinh DA GHI nhung da co quyet dinh moi hon cho cung dong bang ke. Van hien de
   * nguoi soat doc lich su; KHONG con duoc tinh tien va KHONG sua duoc nua.
   */
  readonly isSuperseded: boolean;
  readonly statementLineId: string | null;
  readonly fuelEntryId: string | null;
  readonly candidateEntryIds: readonly string[];
  readonly candidateLineIds: readonly string[];
  readonly resolutionLabel: string | null;
  readonly resolutionNote: string | null;
  readonly resolvedAtLabel: string | null;
  readonly options: readonly DiscrepancyResolutionOption[];
  readonly canResolve: boolean;
  /**
   * `#317` G0 — doi y ve quyet dinh DANG HIEU LUC khi ky CHUA dong. Dieu kien y het may chu
   * (`evaluateDecisionRevision`): da quyet, gan dong bang ke, chua bi thay the, khong phai xac nhan
   * khop tay. Ky da dong thi phai mo lai truoc.
   */
  readonly canRevise: boolean;
  readonly reviseOptions: readonly DecisionRevisionOption[];
}

export const toDiscrepancyRows = (
  discrepancies: readonly FuelDiscrepancy[],
  viewer: TransportViewerInput,
  isFrozen: boolean,
  supersededIds: readonly string[],
): readonly DiscrepancyRow[] => {
  const mayResolve = canPerform(viewer, 'transport.fuel.reconciliation.resolve');
  const superseded = new Set(supersededIds);
  return discrepancies.map((row) => {
    const isSuperseded = superseded.has(row.id);
    const reviseOptions = RESOLUTIONS_BY_KIND[row.kind]
      .filter((resolution): resolution is RevisableFuelResolution =>
        (REVISABLE_FUEL_RESOLUTIONS as readonly string[]).includes(resolution),
      )
      .filter((resolution) => resolution !== row.resolution)
      .map((resolution) => ({ resolution, label: FUEL_DISCREPANCY_RESOLUTION_LABEL[resolution] }));
    return {
      id: row.id,
      kind: row.kind,
      kindLabel: FUEL_DISCREPANCY_KIND_LABEL[row.kind],
      isPending: row.status === 'PENDING',
      isSuperseded,
      statementLineId: row.statementLineId,
      fuelEntryId: row.fuelEntryId,
      candidateEntryIds: [...row.candidateEntryIds],
      candidateLineIds: [...row.candidateLineIds],
      resolutionLabel:
        row.resolution === null ? null : FUEL_DISCREPANCY_RESOLUTION_LABEL[row.resolution],
      resolutionNote: row.resolutionNote,
      resolvedAtLabel: row.resolvedAt === null ? null : formatInstant(row.resolvedAt),
      options: discrepancyResolutionOptions(row.kind),
      canResolve: mayResolve && row.status === 'PENDING' && !isFrozen,
      canRevise:
        mayResolve &&
        !isFrozen &&
        row.status === 'RESOLVED' &&
        !isSuperseded &&
        row.statementLineId !== null &&
        row.resolution !== 'MATCH_CONFIRMED' &&
        reviseOptions.length > 0,
      reviseOptions,
    };
  });
};

/**
 * Cau noi dung hau qua cua mot lan doi y — dat canh nut xac nhan, khop voi hanh vi THAT cua may chu.
 */
export const DECISION_REVISION_NOTICE =
  'Quyết định cũ vẫn giữ trong lịch sử. Tổng công nợ cây xăng chỉ đổi khi đóng kỳ lại; nếu công nợ kỳ trước đã ghi nhận, hệ thống ghi một chứng từ điều chỉnh chứ không sửa chứng từ cũ.';

/* ------------------------------------------------------------------ *
 * Ban lam viec doi soat
 * ------------------------------------------------------------------ */

export interface ReconciliationWorkspaceModel {
  readonly id: string;
  readonly supplierId: string;
  readonly stateLabel: string;
  readonly tone: StatusTone;
  readonly periodLabel: string;
  readonly statementFilename: string;
  readonly lineRows: readonly StatementLineRow[];
  readonly discrepancyRows: readonly DiscrepancyRow[];
  readonly matchedCountLabel: string;
  readonly pendingCountLabel: string;
  readonly isFrozen: boolean;
  readonly canRunMatching: boolean;
  readonly canClose: boolean;
  readonly canReopen: boolean;
  /** Vi sao chua dong duoc — cau noi that, doc tu `pendingDiscrepancyCount`. */
  readonly closeBlockedReason: string | null;
  readonly handoffSummary: string | null;
}

/**
 * `CLOSED` la trang thai DONG BANG duy nhat cua ky doi soat (`isFrozenFuelReconciliation`).
 * Va dong ky bi chan khi con bat ky chenh lech `PENDING` nao — dieu kien doc duoc ngay tu
 * `pendingDiscrepancyCount`, nen man hinh noi truoc thay vi de nguoi dung bam roi nhan 403.
 */
export const toReconciliationWorkspace = (
  workspace: FuelReconciliationWorkspace,
  viewer: TransportViewerInput,
): ReconciliationWorkspaceModel => {
  const isFrozen = workspace.reconciliation.state === 'CLOSED';
  const pending = workspace.pendingDiscrepancyCount;
  return {
    id: workspace.reconciliation.id,
    supplierId: workspace.reconciliation.supplierId,
    stateLabel: FUEL_RECONCILIATION_STATE_LABEL[workspace.reconciliation.state],
    tone: fuelReconciliationStateTone(workspace.reconciliation.state),
    periodLabel: formatBusinessDateRange(
      workspace.reconciliation.periodStart,
      workspace.reconciliation.periodEnd,
    ),
    statementFilename: workspace.statement.filename,
    lineRows: toStatementLineRows(workspace.lines),
    discrepancyRows: toDiscrepancyRows(
      workspace.discrepancies,
      viewer,
      isFrozen,
      workspace.supersededDiscrepancyIds,
    ),
    matchedCountLabel: formatCount(workspace.matches.length),
    pendingCountLabel: formatCount(pending),
    isFrozen,
    canRunMatching: canPerform(viewer, 'transport.fuel.reconciliation.match') && !isFrozen,
    canClose:
      canPerform(viewer, 'transport.fuel.reconciliation.close') && !isFrozen && pending === 0,
    canReopen: canPerform(viewer, 'transport.fuel.reconciliation.reopen') && isFrozen,
    closeBlockedReason:
      pending > 0
        ? `Còn ${formatCount(pending)} chênh lệch chưa có quyết định. Đóng kỳ chỉ được khi mọi chênh lệch đã xử lý.`
        : null,
    handoffSummary:
      workspace.handoff === null
        ? null
        : `Đã bàn giao bản ${formatCount(workspace.handoff.revision)}: ` +
          `${formatCount(workspace.handoff.acceptedLineCount)} dòng, ` +
          `${formatMoney(workspace.handoff.acceptedAmount)}.`,
  };
};

/**
 * Sau khi chay so khop, `POST .../match` KHONG tra ve trang thai moi cua ky — nen man hinh PHAI doc
 * lai ban lam viec. Cau nay de nhac dung mot cho, va de test khoa duoc y do.
 */
export const MATCHING_REQUIRES_REFETCH =
  'Chạy so khớp không trả về trạng thái mới của kỳ, nên bảng được đọc lại sau khi chạy.';

/* ------------------------------------------------------------------ *
 * Xem truoc bang ke
 * ------------------------------------------------------------------ */

export interface StatementPreviewModel {
  readonly headers: readonly string[];
  readonly rowCountLabel: string;
  readonly acceptedCountLabel: string;
  readonly rejectedCountLabel: string;
  readonly rejections: readonly { readonly label: string; readonly countLabel: string }[];
  readonly lines: readonly {
    readonly rowNumber: number;
    readonly plateRaw: string;
    readonly businessDateLabel: string;
    readonly litersLabel: string;
    readonly amountLabel: string;
    readonly rejectLabel: string | null;
  }[];
  readonly isClean: boolean;
}

/** Xem truoc KHONG ghi gi — nen day la buoc an de chay truoc khi nhap that. */
export const toStatementPreview = (preview: StatementImportPreview): StatementPreviewModel => ({
  headers: [...preview.headers],
  rowCountLabel: formatCount(preview.rowCount),
  acceptedCountLabel: formatCount(preview.acceptedCount),
  rejectedCountLabel: formatCount(preview.rejectedCount),
  rejections: Object.entries(preview.rejectionsByReason).map(([reason, count]) => ({
    label: rejectReasonLabel(reason),
    countLabel: formatCount(count),
  })),
  lines: preview.lines.map((line) => ({
    // Dong xem truoc CHUA co `id`, chi co `rowNumber` — do la khoa duy nhat dung duoc o day.
    rowNumber: line.rowNumber,
    plateRaw: line.vehiclePlateRaw,
    businessDateLabel: formatBusinessDate(line.businessDate),
    litersLabel: formatLiters(line.litersUnits),
    amountLabel: formatMoney(line.amount),
    rejectLabel: line.status === 'REJECTED' ? rejectReasonLabel(line.rejectReason) : null,
  })),
  isClean: preview.rejectedCount === 0,
});
