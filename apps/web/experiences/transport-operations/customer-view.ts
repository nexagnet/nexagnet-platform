import { formatVnd } from '../../lib/format';
import type { TollDuplicateSpendState, TollUnattributedReason } from './toll-report-types';
import type {
  AgingBucket,
  BusinessDate,
  ComplianceDocumentStatus,
  ComplianceDocumentType,
  ComplianceHealth,
  ComplianceSubjectKind,
  EffectiveVehicleStateReason,
  MaintenanceDueState,
  MaintenanceTriggerKind,
  MaintenanceWorkOrderStatus,
  OperationalAlertKind,
  OperationalAlertSeverity,
  OperationalAlertSource,
  PayrollMissingInput,
  PayrollPeriodStatus,
  PayslipComponentSource,
  PayslipKind,
  PayslipStatus,
  SettlementDocumentKind,
  SettlementDocumentStatus,
  SettlementFlow,
  VehicleStateInconsistency,
  DriverFundEntryKind,
  DriverStatus,
  ExpenseFundingSource,
  FuelDiscrepancyKind,
  FuelDiscrepancyResolution,
  FuelPaymentMethod,
  FuelReconciliationState,
  FuelReconciliationStatus,
  FuelStatementRejectReason,
  FuelVerificationStatus,
  FundBalanceStance,
  FundPeriodStatus,
  PartnerRoleKind,
  PartyStatus,
  TollApiStatus,
  TollLinkProvenance,
  TollMatchState,
  TollProvider,
  TollReviewAction,
  TollReviewState,
  TollSourceKind,
  TollTransactionKind,
  TripKind,
  TripStatus,
  VehicleStatus,
} from './transport-types';
import type {
  FuelCandidateFinding,
  FuelConsumptionInsight,
  FuelConsumptionLinkState,
  FuelDocumentRejectReason,
  FuelDocumentStatus,
  FuelStationMatch,
  KnownFuelReviewReason,
} from './fuel-review-types';

/**
 * TRINH BAY, khong co tham quyen nghiep vu.
 *
 * Tep nay duoc phep: doi ma may thanh chu tieng Viet, chia don vi ty le, dinh dang ngay/tien, chon
 * sac thai cho mot phu hieu. Tep nay KHONG duoc phep: quyet mot chuyen co gui duoc khong, tinh mot
 * so tien, suy ra mot trang thai. Nhung viec do thuoc may chu — xem hop dong mien §5.
 *
 * Phep thu khi phan van: neu bo tep nay di thi so lieu co SAI khong, hay chi kho doc hon? Neu sai
 * thi logic dang nam sai cho.
 */

/** Khi khong co so lieu. KHONG duoc thay bang `0` — thieu chi phi khac han chi phi bang khong. */
export const EMPTY_VALUE = '—';

/* ------------------------------------------------------------------ *
 * Don vi
 * ------------------------------------------------------------------ */

const plainNumber = new Intl.NumberFormat('vi-VN');
const scaledNumber = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

/**
 * Tien: so nguyen DONG. Dung lai `formatVnd` cua `lib/format` thay vi viet ban thu tu — nhung boc
 * them mot lop chiu `null`, vi `formatVnd` NEM `TypeError` voi gia tri khong huu han, va so lieu
 * van tai co nhieu truong tien nullable that (`freightAmount`, `amount` cua dong bang ke).
 */
export const formatMoney = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? formatVnd(value) : EMPTY_VALUE;

/** Ty le 3: `litersUnits` la MILILIT. Chia 1000 truoc khi cho nguoi doc thay. */
export const formatLiters = (units: number | null | undefined): string =>
  typeof units === 'number' && Number.isFinite(units)
    ? `${scaledNumber.format(units / 1000)} L`
    : EMPTY_VALUE;

/** Ty le 3: `consumptionUnits` la MILI-L/100km. */
export const formatConsumption = (units: number | null | undefined): string =>
  typeof units === 'number' && Number.isFinite(units)
    ? `${scaledNumber.format(units / 1000)} L/100km`
    : EMPTY_VALUE;

export const formatOdometer = (km: number | null | undefined): string =>
  typeof km === 'number' && Number.isFinite(km) ? `${plainNumber.format(km)} km` : EMPTY_VALUE;

export const formatDistance = formatOdometer;

export const formatCount = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? plainNumber.format(value) : EMPTY_VALUE;

const percentFormatter = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Diem co ban → phan tram: `1250` ⇒ `"12,50%"`. */
export const formatBasisPoints = (basisPoints: number | null | undefined): string =>
  typeof basisPoints === 'number' && Number.isFinite(basisPoints)
    ? `${percentFormatter.format(basisPoints / 100)}%`
    : EMPTY_VALUE;

/* ------------------------------------------------------------------ *
 * Thoi gian — hai khai niem, hai ham, khong dung lan
 * ------------------------------------------------------------------ */

const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `businessDate` la NGAY NGHIEP VU theo lich tenant, khong phai mot moc thoi gian.
 *
 * Tach chuoi, KHONG dung `new Date(...)`: `new Date('2026-09-04')` duoc doc la nua dem UTC, va o
 * mui gio Viet Nam mot phan cua nam se nhay ve ngay hom truoc. Day dung la loi ma cot rieng
 * `businessDate` duoc tao ra de tranh (`business-date.ts:1-8`) — hien thi lai bang `Date` la nem di
 * ca thiet ke do.
 */
export const formatBusinessDate = (date: BusinessDate | null | undefined): string => {
  if (typeof date !== 'string') return EMPTY_VALUE;
  const parts = BUSINESS_DATE_PATTERN.exec(date);
  return parts === null ? EMPTY_VALUE : `${parts[3]}/${parts[2]}/${parts[1]}`;
};

/** Khoang ngay nghiep vu, vd `01/09/2026 – 30/09/2026`. */
export const formatBusinessDateRange = (
  from: BusinessDate | null | undefined,
  to: BusinessDate | null | undefined,
): string => `${formatBusinessDate(from)} – ${formatBusinessDate(to)}`;

const instantFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Moc thoi gian ISO — `createdAt`, `occurredAt`, `closedAt`, … */
export const formatInstant = (iso: string | null | undefined): string => {
  if (typeof iso !== 'string' || iso.length === 0) return EMPTY_VALUE;
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? EMPTY_VALUE : instantFormatter.format(value);
};

/* ------------------------------------------------------------------ *
 * Nhan nghiep vu
 * ------------------------------------------------------------------ */

export const TRIP_STATUS_LABEL = {
  PLANNED: 'Đã lên kế hoạch',
  IN_TRANSIT: 'Đang chạy',
  DELIVERED: 'Đã giao',
  RECONCILED: 'Đã đối soát',
  CANCELLED: 'Đã huỷ',
} as const satisfies Record<TripStatus, string>;

export const TRIP_KIND_LABEL = {
  OWN_DIRECT: 'Xe nhà tự chạy',
  EXTERNAL_CARRIER: 'Thuê xe ngoài',
  PARTNER_REFERRED_INTERNAL_RUN: 'Nhận chạy hộ',
} as const satisfies Record<TripKind, string>;

export const VEHICLE_STATUS_LABEL = {
  IDLE: 'Đang rỗi',
  ON_TRIP: 'Đang trên chuyến',
  UNDER_MAINTENANCE: 'Đang bảo dưỡng',
} as const satisfies Record<VehicleStatus, string>;

export const DRIVER_STATUS_LABEL = {
  ACTIVE: 'Đang làm',
  INACTIVE: 'Đã nghỉ',
} as const satisfies Record<DriverStatus, string>;

export const PARTY_STATUS_LABEL = {
  ACTIVE: 'Đang hoạt động',
  INACTIVE: 'Đã dừng',
} as const satisfies Record<PartyStatus, string>;

export const PARTNER_ROLE_LABEL = {
  CARRIER: 'Nhà xe',
  ORDER_REFERRER: 'Nguồn đơn',
} as const satisfies Record<PartnerRoleKind, string>;

export const FUND_ENTRY_KIND_LABEL = {
  ADVANCE: 'Tạm ứng',
  RETURN: 'Hoàn quỹ',
  TRIP_EXPENSE: 'Chi phí chuyến',
  ADJUSTMENT: 'Điều chỉnh',
  REVERSAL: 'Đảo bút toán',
  /**
   * `TX-07b`. Chữ "hoàn ứng" chứ không phải "trả lương": khoản này là tiền lái xe đã bỏ túi được
   * nhận lại, và gọi nó là lương sẽ làm nó xuất hiện sai chỗ trên mọi bảng đối chiếu.
   */
  REIMBURSEMENT: 'Trả lại hoàn ứng',
  /**
   * `#369` R-4 — cung ho voi "Chi phí chuyến", nhung cho VIEC DUOC DIEU (vong xe). Truoc ban nay khoa
   * vang mat nen dong quy Run-first hien LOAI RONG ca o man lai xe lan man van phong.
   */
  RUN_EXPENSE: 'Chi phí vòng xe',
} as const satisfies Record<DriverFundEntryKind, string>;

/**
 * The dung cua so du quy. Ba cau nay la cach DUY NHAT dung de doc dau cua so du.
 * `COMPANY_OWES_DRIVER` KHONG phai "lai xe dang no" — doc nguoc la doi chieu sai ca ky.
 */
export const FUND_BALANCE_STANCE_LABEL = {
  DRIVER_HOLDS_COMPANY_CASH: 'Lái xe đang giữ tiền của công ty',
  SETTLED: 'Đã cân bằng',
  COMPANY_OWES_DRIVER: 'Công ty đang nợ lái xe',
} as const satisfies Record<FundBalanceStance, string>;

export const FUND_PERIOD_STATUS_LABEL = {
  OPEN: 'Đang mở',
  CLOSING: 'Đang chốt',
  CLOSED: 'Đã chốt',
  REOPENED: 'Đã mở lại',
} as const satisfies Record<FundPeriodStatus, string>;

export const EXPENSE_FUNDING_LABEL = {
  DRIVER_FUND: 'Lấy từ quỹ lái xe',
  COMPANY_DIRECT: 'Công ty trả trực tiếp',
} as const satisfies Record<ExpenseFundingSource, string>;

export const FUEL_VERIFICATION_LABEL = {
  DECLARED: 'Mới khai',
  VERIFIED: 'Đã xác thực',
  REJECTED: 'Bị từ chối',
} as const satisfies Record<FuelVerificationStatus, string>;

export const FUEL_RECONCILIATION_STATUS_LABEL = {
  UNMATCHED: 'Chưa khớp',
  MATCHED: 'Đã khớp',
  MISMATCHED: 'Lệch',
  SETTLED: 'Đã quyết toán',
  IGNORED: 'Đã bỏ qua',
} as const satisfies Record<FuelReconciliationStatus, string>;

export const FUEL_RECONCILIATION_STATE_LABEL = {
  DRAFT: 'Nháp',
  MATCHING: 'Đang so khớp',
  RESOLVED: 'Đã xử lý lệch',
  CLOSED: 'Đã đóng',
  REOPENED: 'Đã mở lại',
} as const satisfies Record<FuelReconciliationState, string>;

export const FUEL_PAYMENT_METHOD_LABEL = {
  DRIVER_CASH: 'Lái xe trả tiền mặt',
  SUPPLIER_ACCOUNT: 'Ghi nợ cây xăng',
} as const satisfies Record<FuelPaymentMethod, string>;

export const FUEL_DISCREPANCY_KIND_LABEL = {
  AMBIGUOUS_CANDIDATES: 'Nhiều ứng viên khớp',
  STATEMENT_LINE_ONLY: 'Chỉ có trên bảng kê',
  FUEL_ENTRY_ONLY: 'Chỉ có phiếu nội bộ',
  OUT_OF_TOLERANCE: 'Lệch quá dung sai',
  SELF_SOURCED_BLOCKED: 'Phiếu sinh từ chính bảng kê',
  INVOICE_CONFLICT: 'Số hoá đơn hai bên khác nhau',
  PAYMENT_METHOD_CONFLICT: 'Lái xe đã trả tiền mặt — không phải công nợ',
} as const satisfies Record<FuelDiscrepancyKind, string>;

export const FUEL_DISCREPANCY_RESOLUTION_LABEL = {
  ACCEPT_SUPPLIER_AMOUNT: 'Chấp nhận số của cây xăng',
  REJECT_SUPPLIER_LINE: 'Từ chối dòng bảng kê',
  MATCH_CONFIRMED: 'Xác nhận cặp khớp',
  IGNORE_WITH_REASON: 'Bỏ qua có lý do',
  ENTRY_CORRECTION_REQUIRED: 'Yêu cầu sửa phiếu',
} as const satisfies Record<FuelDiscrepancyResolution, string>;

export const FUEL_STATEMENT_REJECT_REASON_LABEL = {
  MISSING_REQUIRED_FIELD: 'Thiếu trường bắt buộc',
  MALFORMED_DATE: 'Ngày sai định dạng',
  MALFORMED_AMOUNT: 'Số tiền sai định dạng',
  MALFORMED_LITERS: 'Số lít sai định dạng',
  UNKNOWN_VEHICLE: 'Không nhận ra biển số',
  DUPLICATE_ROW: 'Dòng trùng',
} as const satisfies Record<FuelStatementRejectReason, string>;

/** Ma la chuoi mo phia API, nen tra lai chinh ma khi chua co nhan. */
export const rejectReasonLabel = (reason: string | null): string => {
  if (reason === null) return EMPTY_VALUE;
  const labels: Readonly<Record<string, string>> = FUEL_STATEMENT_REJECT_REASON_LABEL;
  return labels[reason] ?? reason;
};

/* --- Soat chung tu may doc + chuoi tieu hao (#313) --- */

/**
 * Ly do soat cua mot phieu. Truoc `#313` man hinh in THANG ma (`ODOMETER_NOT_ADVANCED`) cho ke
 * toan doc. Cau o day noi SU THAT, khong buoc toi: mot odo khong tang co the la go nham.
 */
export const FUEL_REVIEW_REASON_LABEL = {
  ODOMETER_NOT_ADVANCED: 'Số km chưa tăng so với lần đổ trước',
  NO_PREVIOUS_ODOMETER: 'Chưa có lần đổ trước để tính tiêu hao',
  CONSUMPTION_ABOVE_NORM: 'Tiêu hao vượt định mức — chỉ để soát xét',
} as const satisfies Record<KnownFuelReviewReason, string>;

export const fuelReviewReasonLabel = (reason: string): string => {
  const labels: Readonly<Record<string, string>> = FUEL_REVIEW_REASON_LABEL;
  return labels[reason] ?? reason;
};

export const FUEL_DOCUMENT_STATUS_LABEL = {
  PARSED: 'Máy đã đọc',
  REJECTED: 'Không đọc được',
  DUPLICATE: 'Hoá đơn đã nhập trước đó',
} as const satisfies Record<FuelDocumentStatus, string>;

export const fuelDocumentStatusTone = (status: FuelDocumentStatus): StatusTone => {
  switch (status) {
    case 'PARSED':
      return 'wait';
    case 'REJECTED':
      return 'stop';
    case 'DUPLICATE':
      return 'flat';
  }
};

export const FUEL_DOCUMENT_REJECT_REASON_LABEL = {
  EMPTY: 'Tệp rỗng',
  TOO_LARGE: 'Ảnh quá lớn',
  MALFORMED_XML: 'Tệp hoá đơn điện tử bị hỏng',
  EXTERNAL_ENTITY_REJECTED: 'Tệp hoá đơn chứa tham chiếu ngoài bị chặn',
  NOT_AN_INVOICE: 'Tệp không phải hoá đơn',
  MISSING_INVOICE_IDENTITY: 'Hoá đơn thiếu ký hiệu hoặc số',
  NO_LINE_ITEMS: 'Hoá đơn không có dòng hàng',
  UNSUPPORTED_MEDIA_TYPE: 'Định dạng ảnh không đọc được',
  EXTRACTION_UNAVAILABLE: 'Bộ đọc ảnh đang không dùng được — thử lại sau',
  EXTRACTION_MALFORMED_OUTPUT: 'Bộ đọc ảnh trả kết quả không hợp lệ',
} as const satisfies Record<FuelDocumentRejectReason, string>;

export const FUEL_STATION_MATCH_LABEL = {
  RESOLVED: 'Đã nhận ra cây xăng',
  AMBIGUOUS: 'Nhiều cây xăng có thể khớp — người soát chọn',
  SUPPLIER_MISMATCH: 'Cây xăng không thuộc nhà cung cấp trên hoá đơn',
  NO_MATCH: 'Không khớp cây xăng nào đã khai',
  NO_INPUT: 'Hoá đơn không ghi cây xăng',
} as const satisfies Record<FuelStationMatch, string>;

export const FUEL_CANDIDATE_FINDING_LABEL = {
  ARITHMETIC_MISMATCH: 'Số lít × đơn giá không ra thành tiền',
  QUANTITY_UNREADABLE: 'Không đọc được số lít',
  UNIT_PRICE_UNREADABLE: 'Không đọc được đơn giá',
  AMOUNT_UNREADABLE: 'Không đọc được thành tiền',
  ISSUED_DATE_UNREADABLE: 'Không đọc được ngày lập hoá đơn',
  ISSUED_DATE_IN_FUTURE: 'Ngày lập hoá đơn ở tương lai',
  UNIT_NOT_LITRES: 'Đơn vị tính không phải lít',
  STATION_UNRESOLVED: 'Chưa nhận ra cây xăng',
  SUPPLIER_UNLINKED: 'Chưa nối được với nhà cung cấp theo mã số thuế',
  PLATE_HINT_ABSENT: 'Hoá đơn không ghi biển số — người soát tự gắn xe',
  PLATE_HINT_UNKNOWN_VEHICLE: 'Biển số trên hoá đơn không khớp xe nào',
  FIELD_CONFIDENCE_BELOW_FLOOR: 'Máy đọc không chắc ở một số ô',
} as const satisfies Record<FuelCandidateFinding, string>;

export const FUEL_CONSUMPTION_LINK_STATE_LABEL = {
  COMPUTED: 'Đã tính',
  NO_PREVIOUS_ODOMETER: 'Chưa có mốc km trước — không tính',
  ODOMETER_NOT_ADVANCED: 'Số km không tăng — không tính, cần soát',
  PREVIOUS_FILL_UNANCHORED: 'Lần đổ xen giữa thiếu mốc km hợp lệ — không tính',
  EXCLUDED_REJECTED: 'Phiếu bị từ chối — không làm mốc km',
} as const satisfies Record<FuelConsumptionLinkState, string>;

export const fuelConsumptionLinkTone = (state: FuelConsumptionLinkState): StatusTone => {
  switch (state) {
    case 'COMPUTED':
      return 'done';
    case 'NO_PREVIOUS_ODOMETER':
      return 'flat';
    case 'ODOMETER_NOT_ADVANCED':
    case 'PREVIOUS_FILL_UNANCHORED':
      return 'wait';
    case 'EXCLUDED_REJECTED':
      return 'flat';
  }
};

export const FUEL_CONSUMPTION_INSIGHT_LABEL = {
  CONSUMPTION_ABOVE_NORM: 'Vượt định mức — chỉ để soát xét, không trừ tiền lái xe',
  RECORDED_SNAPSHOT_DIFFERS: 'Số ghi lúc khai khác chuỗi km hiện tại',
} as const satisfies Record<FuelConsumptionInsight, string>;

/* --- `TX-08` phi duong bo / ETC (#295) --- */

export const TOLL_PROVIDER_LABEL = {
  VETC: 'VETC',
  EPASS: 'ePass',
  OTHER: 'Nhà cung cấp khác',
} as const satisfies Record<TollProvider, string>;

export const TOLL_SOURCE_KIND_LABEL = {
  API: 'Đường API nhà cung cấp',
  STATEMENT_FILE: 'Tệp sao kê',
  INVOICE_PDF: 'Hoá đơn PDF',
  MANUAL: 'Nhập tay',
} as const satisfies Record<TollSourceKind, string>;

export const TOLL_TRANSACTION_KIND_LABEL = {
  TOLL_PASS: 'Lượt qua trạm',
  TOP_UP: 'Nạp tiền tài khoản',
  ACCOUNT_FEE: 'Phí tài khoản',
  ADJUSTMENT: 'Điều chỉnh',
} as const satisfies Record<TollTransactionKind, string>;

/**
 * NAM TRANG THAI SO KHOP, va khong cai nao duoc doc thanh "da tra tien".
 *
 * `MATCHED` co nghia la *dong nay noi ve chiec xe nao thi da ro*, khong phai *khoan nay da duoc
 * thanh toan*. Cau chu phai giu dung khoang cach do — #295 cam mot dong doc ra nghe nhu mot nghia
 * vu da duoc ghi nhan.
 */
export const TOLL_MATCH_STATE_LABEL = {
  MATCHED: 'Đã khớp xe',
  ACCOUNT_UNRESOLVED: 'Chưa nhận ra tài khoản',
  VEHICLE_UNRESOLVED: 'Chưa nhận ra xe',
  AMBIGUOUS: 'Nhiều xe cùng khớp',
  DUPLICATE_CANDIDATE: 'Nghi trùng dòng',
} as const satisfies Record<TollMatchState, string>;

export const TOLL_REVIEW_STATE_LABEL = {
  PENDING: 'Chờ người đối soát',
  CONFIRMED: 'Đã có người xác nhận',
  REOPENED: 'Đã mở lại',
} as const satisfies Record<TollReviewState, string>;

export const TOLL_REVIEW_ACTION_LABEL = {
  RESOLVE_VEHICLE: 'Chỉ định xe cho dòng này',
  CONFIRM: 'Xác nhận dòng này đã đúng',
  FLAG_DUPLICATE: 'Đánh dấu trùng với một dòng khác',
  CLEAR_DUPLICATE: 'Bỏ nghi trùng — đây là hai sự kiện thật',
  REOPEN: 'Mở lại để xem xét tiếp',
} as const satisfies Record<TollReviewAction, string>;

export const TOLL_LINK_PROVENANCE_LABEL = {
  MANUAL: 'Người khai',
  STATEMENT_DECLARED: 'Đọc từ tệp sao kê',
} as const satisfies Record<TollLinkProvenance, string>;

/**
 * `#314` — VI SAO mot dong khong nam trong bang chi phi theo xe.
 *
 * Ba ly do dau la viec CON CHO NGUOI; `ACCOUNT_LEVEL` thi khong: nap tien va phi tai khoan xay ra o
 * muc tai khoan va khong co chiec xe nao trong do. Viet ca bon thanh "loi" se lam ke toan di "sua"
 * mot khoan nap tien cho toi khi no gan vao mot chiec xe — tuc dung cai sai ma bao cao nay tranh.
 */
export const TOLL_UNATTRIBUTED_REASON_LABEL = {
  ACCOUNT_UNRESOLVED: 'Chưa nhận ra tài khoản',
  VEHICLE_UNRESOLVED: 'Chưa nhận ra xe',
  AMBIGUOUS: 'Nhiều xe cùng khớp — chờ người chọn',
  ACCOUNT_LEVEL: 'Cấp tài khoản (nạp tiền, phí) — không thuộc xe nào',
} as const satisfies Record<TollUnattributedReason, string>;

/** `#314` — dong trung KHONG vao tong chi phi nao, ca khi con cho nguoi quyet. */
export const TOLL_DUPLICATE_SPEND_STATE_LABEL = {
  SUSPECTED: 'Nghi trùng — chờ người quyết',
  DECLARED: 'Đã ghi là trùng — không tính',
} as const satisfies Record<TollDuplicateSpendState, string>;

/**
 * TRANG THAI DUONG API — cau chu o day la mot LOI HUA KHONG DUOC PHEP SAI.
 *
 * `NOT_PUBLICLY_PROVEN` khong duoc viet thanh "đang kết nối" hay "sắp có": tinh den 08/09/2026 khong
 * nha cung cap nao cong bo tai lieu API, va mot cau chu mo ho o day se lam nguoi van hanh ngoi cho
 * mot duong khong ton tai thay vi di nap tep.
 */
export const TOLL_API_STATUS_LABEL = {
  NOT_PUBLICLY_PROVEN: 'Chưa có tài liệu API công khai',
  REGISTERED: 'Đã đăng ký đường API',
} as const satisfies Record<TollApiStatus, string>;

export const TOLL_ROW_REJECT_REASON_LABEL = {
  TOLL_ROW_UNPARSEABLE: 'Dòng không đọc được',
  TOLL_ROW_MISSING_AMOUNT: 'Thiếu số tiền',
  TOLL_ROW_MISSING_DATE: 'Thiếu ngày',
  TOLL_ROW_DATE_INVALID: 'Ngày sai định dạng',
  TOLL_ROW_PLATE_MISSING: 'Thiếu biển số',
  TOLL_ROW_KIND_UNKNOWN: 'Loại giao dịch chưa khai',
} as const;

/** Cung khuon `rejectReasonLabel`: ma la chuoi mo phia API, nen tra lai chinh ma khi chua co nhan. */
export const tollRejectReasonLabel = (reason: string | null): string => {
  if (reason === null) return EMPTY_VALUE;
  const labels: Readonly<Record<string, string>> = TOLL_ROW_REJECT_REASON_LABEL;
  return labels[reason] ?? reason;
};

/* ------------------------------------------------------------------ *
 * Sac thai phu hieu
 * ------------------------------------------------------------------ */

/**
 * `go` dang chay · `wait` dang cho nguoi · `done` da khep · `stop` da dung/lech · `flat` trung tinh.
 * Chi de nhin; khong mot quyet dinh nao doc gia tri nay.
 */
export type StatusTone = 'flat' | 'go' | 'wait' | 'done' | 'stop';

export const tripStatusTone = (status: TripStatus): StatusTone => {
  switch (status) {
    case 'PLANNED':
      return 'wait';
    case 'IN_TRANSIT':
      return 'go';
    case 'DELIVERED':
      return 'wait';
    case 'RECONCILED':
      return 'done';
    case 'CANCELLED':
      return 'stop';
  }
};

export const vehicleStatusTone = (status: VehicleStatus): StatusTone => {
  switch (status) {
    case 'IDLE':
      return 'flat';
    case 'ON_TRIP':
      return 'go';
    case 'UNDER_MAINTENANCE':
      return 'stop';
  }
};

export const fuelVerificationTone = (status: FuelVerificationStatus): StatusTone => {
  switch (status) {
    case 'DECLARED':
      return 'wait';
    case 'VERIFIED':
      return 'done';
    case 'REJECTED':
      return 'stop';
  }
};

export const fuelReconciliationStatusTone = (status: FuelReconciliationStatus): StatusTone => {
  switch (status) {
    case 'UNMATCHED':
      return 'wait';
    case 'MATCHED':
      return 'go';
    case 'MISMATCHED':
      return 'stop';
    case 'SETTLED':
      return 'done';
    case 'IGNORED':
      return 'flat';
  }
};

export const fuelReconciliationStateTone = (state: FuelReconciliationState): StatusTone => {
  switch (state) {
    case 'DRAFT':
      return 'flat';
    case 'MATCHING':
      return 'go';
    case 'RESOLVED':
      return 'wait';
    case 'CLOSED':
      return 'done';
    case 'REOPENED':
      return 'stop';
  }
};

/**
 * SAC THAI cua mot dong ETC — ba trang thai "chua ro" deu la `wait`, khong phai `stop`.
 *
 * `stop` danh cho thu DA SAI. Mot dong chua nhan ra xe thi khong sai: no dang cho mot con nguoi noi
 * ra chiec xe do la chiec nao. Chi `AMBIGUOUS` duoc bay `stop`, vi do la cho may chu TU CHOI chon —
 * va dung cho do la cho de nhat cho mot man hinh lo dang "chon giup" (#295).
 */
export const tollMatchStateTone = (state: TollMatchState): StatusTone => {
  switch (state) {
    case 'MATCHED':
      return 'go';
    case 'ACCOUNT_UNRESOLVED':
      return 'wait';
    case 'VEHICLE_UNRESOLVED':
      return 'wait';
    case 'AMBIGUOUS':
      return 'stop';
    case 'DUPLICATE_CANDIDATE':
      return 'stop';
  }
};

/** `done` o day nghia la DA CO NGUOI NHIN, khong phai da thanh toan — xem `TOLL_REVIEW_STATE_LABEL`. */
export const tollReviewStateTone = (state: TollReviewState): StatusTone => {
  switch (state) {
    case 'PENDING':
      return 'wait';
    case 'CONFIRMED':
      return 'done';
    case 'REOPENED':
      return 'stop';
  }
};

/** `flat` chu khong `stop`: khong co API la mot su that da do, khong phai mot su co dang xay ra. */
export const tollApiStatusTone = (status: TollApiStatus): StatusTone =>
  status === 'REGISTERED' ? 'go' : 'flat';

export const fundPeriodStatusTone = (status: FundPeriodStatus): StatusTone => {
  switch (status) {
    case 'OPEN':
      return 'go';
    case 'CLOSING':
      return 'wait';
    case 'CLOSED':
      return 'done';
    case 'REOPENED':
      return 'stop';
  }
};

export const fundBalanceStanceTone = (stance: FundBalanceStance): StatusTone => {
  switch (stance) {
    case 'DRIVER_HOLDS_COMPANY_CASH':
      return 'wait';
    case 'SETTLED':
      return 'done';
    case 'COMPANY_OWES_DRIVER':
      return 'stop';
  }
};

/* ------------------------------------------------------------------ *
 * Cau noi that
 * ------------------------------------------------------------------ */

/**
 * `direct-margin.ts:10-16` cam man hinh bo cau nay hoac goi con so la "loi nhuan". Giu nguyen van
 * chu cua may chu, khong dien dat lai.
 */
export const DIRECT_MARGIN_DISCLOSURE = 'Chưa gồm chi phí cố định';

/** Nhan cho mot thuc the ma nguoi doc nhan ra — KHONG bao gio la `id` ky thuat. */
export const entityLabel = (name: string | null | undefined, fallback: string): string => {
  const trimmed = name?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : fallback;
};

/**
 * Khi chi con `id` trong tay. Noi ro la chua doc duoc ten, thay vi dan mot `uuid` len man hinh nhu
 * the do la ten nghiep vu — #161 §7 cam lay `id` noi bo lam nhan chinh.
 */
export const unresolvedReference = (kind: string): string => `${kind} chưa đọc được tên`;

/* ------------------------------------------------------------------ *
 * `TX-05` — quyet toan
 * ------------------------------------------------------------------ */

export const AGING_BUCKET_LABEL = {
  CURRENT: 'Trong hạn',
  D1_30: 'Quá hạn 1–30 ngày',
  D31_60: 'Quá hạn 31–60 ngày',
  D60_PLUS: 'Quá hạn trên 60 ngày',
} as const satisfies Record<AgingBucket, string>;

/**
 * NAM DONG TIEN, moi dong mot cau. Khong duoc gop hai dong doi tac lam mot: mot doi tac co the vua
 * la nha xe vua la nguon don, va khoa phan biet la VAI chu khong phai partner (`GD-15`).
 */
export const SETTLEMENT_FLOW_LABEL = {
  CUSTOMER_FREIGHT: 'Cước khách hàng',
  FUEL_SUPPLIER: 'Cây xăng',
  CARRIER_SERVICE: 'Nhà xe',
  PARTNER_COMMISSION: 'Hoa hồng nguồn đơn',
} as const satisfies Record<SettlementFlow, string>;

export const SETTLEMENT_DOCUMENT_KIND_LABEL = {
  ORIGINAL: 'Chứng từ gốc',
  ADJUSTMENT: 'Điều chỉnh',
  REVERSAL: 'Đảo chứng từ',
} as const satisfies Record<SettlementDocumentKind, string>;

export const SETTLEMENT_DOCUMENT_STATUS_LABEL = {
  OPEN: 'Còn nợ',
  SETTLED: 'Đã tất toán',
  VOID: 'Đã huỷ hiệu lực',
} as const satisfies Record<SettlementDocumentStatus, string>;

export const agingBucketTone = (bucket: AgingBucket): StatusTone => {
  switch (bucket) {
    case 'CURRENT':
      return 'done';
    case 'D1_30':
      return 'wait';
    case 'D31_60':
      return 'wait';
    case 'D60_PLUS':
      return 'stop';
  }
};

/* ------------------------------------------------------------------ *
 * `TX-06` — bao duong va giay to
 * ------------------------------------------------------------------ */

export const MAINTENANCE_TRIGGER_LABEL = {
  ODOMETER: 'Theo số km',
  CALENDAR: 'Theo ngày',
  ODOMETER_OR_CALENDAR: 'Theo km hoặc ngày, cái nào đến trước',
} as const satisfies Record<MaintenanceTriggerKind, string>;

export const MAINTENANCE_DUE_STATE_LABEL = {
  OK: 'Còn hạn',
  DUE_SOON: 'Sắp đến hạn',
  OVERDUE: 'Quá hạn',
} as const satisfies Record<MaintenanceDueState, string>;

export const MAINTENANCE_WORK_ORDER_STATUS_LABEL = {
  OPEN: 'Đang sửa',
  COMPLETED: 'Đã xong',
  CANCELLED: 'Đã huỷ',
} as const satisfies Record<MaintenanceWorkOrderStatus, string>;

export const COMPLIANCE_DOCUMENT_TYPE_LABEL = {
  VEHICLE_INSPECTION: 'Đăng kiểm xe',
  VEHICLE_INSURANCE: 'Bảo hiểm xe',
  VEHICLE_TRANSPORT_BADGE: 'Phù hiệu vận tải',
  DRIVER_LICENCE: 'Giấy phép lái xe',
  COMPANY_TRANSPORT_LICENSE: 'Giấy phép kinh doanh vận tải',
  CONDITIONAL_CARGO_PERMIT: 'Giấy phép hàng có điều kiện',
} as const satisfies Record<ComplianceDocumentType, string>;

export const COMPLIANCE_SUBJECT_LABEL = {
  VEHICLE: 'Xe',
  DRIVER: 'Lái xe',
  COMPANY: 'Công ty',
} as const satisfies Record<ComplianceSubjectKind, string>;

export const COMPLIANCE_DOCUMENT_STATUS_LABEL = {
  ACTIVE: 'Đang hiệu lực',
  SUPERSEDED: 'Đã thay bằng bản mới',
  REVOKED: 'Đã thu hồi',
} as const satisfies Record<ComplianceDocumentStatus, string>;

export const COMPLIANCE_HEALTH_LABEL = {
  HEALTHY: 'Còn hạn',
  DUE_SOON: 'Sắp hết hạn',
  EXPIRED: 'Đã hết hạn',
} as const satisfies Record<ComplianceHealth, string>;

/**
 * MOT MAU THUAN VAN HANH, khong phai mot trang thai. Hai cau nay noi ra dieu he thong DO DUOC,
 * khong phai dieu no doan.
 */
export const VEHICLE_STATE_INCONSISTENCY_LABEL = {
  MAINTENANCE_WHILE_IN_TRANSIT: 'Xe đang chạy chuyến nhưng có lệnh sửa chữa đang mở',
  RECORDED_STATUS_STALE: 'Trạng thái ghi trong hồ sơ đã cũ so với thực tế',
} as const satisfies Record<VehicleStateInconsistency, string>;

export const EFFECTIVE_VEHICLE_STATE_REASON_LABEL = {
  MAINTENANCE_LOCK: 'Đang có lệnh sửa chữa mở',
  ACTIVE_IN_TRANSIT_TRIP: 'Đang chạy một chuyến',
  NO_ACTIVE_WORK: 'Không có việc nào đang mở',
} as const satisfies Record<EffectiveVehicleStateReason, string>;

export const OPERATIONAL_ALERT_KIND_LABEL = {
  COMPLIANCE_DOCUMENT_EXPIRED: 'Giấy tờ đã hết hạn',
  COMPLIANCE_DOCUMENT_EXPIRING: 'Giấy tờ sắp hết hạn',
  COMPLIANCE_DOCUMENT_MISSING: 'Thiếu giấy tờ bắt buộc',
  MAINTENANCE_OVERDUE: 'Bảo dưỡng quá hạn',
  MAINTENANCE_DUE_SOON: 'Bảo dưỡng sắp đến hạn',
  FUEL_CONSUMPTION_ABNORMAL: 'Mức tiêu hao nhiên liệu bất thường',
  DRIVER_FUND_BALANCE_UNUSUAL: 'Số dư quỹ lái xe bất thường',
  VEHICLE_STATE_INCONSISTENT: 'Trạng thái xe mâu thuẫn',
} as const satisfies Record<OperationalAlertKind, string>;

export const OPERATIONAL_ALERT_SEVERITY_LABEL = {
  INFO: 'Ghi nhận',
  WARNING: 'Cần để ý',
  CRITICAL: 'Cần xử lý ngay',
} as const satisfies Record<OperationalAlertSeverity, string>;

/**
 * Nguon canh bao KHONG doc duoc — vi khach khong bat nghiep vu do. Phai noi ra: mot bang canh bao
 * rong khi thieu nguon se doc y het mot doi xe khong co van de gi.
 */
export const OPERATIONAL_ALERT_SOURCE_LABEL = {
  FUEL_CONSUMPTION: 'Mức tiêu hao nhiên liệu',
  DRIVER_FUND: 'Số dư quỹ lái xe',
} as const satisfies Record<OperationalAlertSource, string>;

export const maintenanceDueTone = (state: MaintenanceDueState): StatusTone => {
  switch (state) {
    case 'OK':
      return 'done';
    case 'DUE_SOON':
      return 'wait';
    case 'OVERDUE':
      return 'stop';
  }
};

export const complianceHealthTone = (health: ComplianceHealth): StatusTone => {
  switch (health) {
    case 'HEALTHY':
      return 'done';
    case 'DUE_SOON':
      return 'wait';
    case 'EXPIRED':
      return 'stop';
  }
};

export const alertSeverityTone = (severity: OperationalAlertSeverity): StatusTone => {
  switch (severity) {
    case 'INFO':
      return 'flat';
    case 'WARNING':
      return 'wait';
    case 'CRITICAL':
      return 'stop';
  }
};

export const workOrderStatusTone = (status: MaintenanceWorkOrderStatus): StatusTone => {
  switch (status) {
    case 'OPEN':
      return 'go';
    case 'COMPLETED':
      return 'done';
    case 'CANCELLED':
      return 'flat';
  }
};

/* ------------------------------------------------------------------ *
 * `TX-07` — luong
 * ------------------------------------------------------------------ */

export const PAYROLL_PERIOD_STATUS_LABEL = {
  OPEN: 'Đang mở',
  CLOSED: 'Đã chốt',
} as const satisfies Record<PayrollPeriodStatus, string>;

export const PAYSLIP_STATUS_LABEL = {
  DRAFT: 'Tạm tính',
  APPROVED: 'Đã duyệt',
  PAID: 'Đã trả',
  REVERSED: 'Đã bị đảo',
} as const satisfies Record<PayslipStatus, string>;

export const PAYSLIP_KIND_LABEL = {
  ORIGINAL: 'Phiếu gốc',
  SUPPLEMENTAL: 'Phiếu bổ sung',
  REVERSAL: 'Phiếu đảo',
} as const satisfies Record<PayslipKind, string>;

export const PAYSLIP_COMPONENT_SOURCE_LABEL = {
  BASE_SALARY: 'Lương cơ bản',
  PER_TRIP: 'Theo chuyến',
  PER_KM: 'Theo km',
  FUEL_SAVING_BONUS: 'Thưởng tiết kiệm nhiên liệu',
  MANUAL_BONUS: 'Thưởng nhập tay',
  MANUAL_DEDUCTION: 'Khoản trừ nhập tay',
} as const satisfies Record<PayslipComponentSource, string>;

/**
 * DU LIEU DAU VAO THIEU cua mot lan chay luong. Phai hien ra: mot lan chay thieu nguon van cho ra
 * phieu, chi la thieu mot khoan — va nguoi duyet can biet minh dang duyet mot bang khong day du.
 */
export const PAYROLL_MISSING_INPUT_LABEL = {
  FUEL_SAVING_UNAVAILABLE:
    'Chưa đọc được dữ liệu tiết kiệm nhiên liệu — không tính khoản thưởng đó',
  DRIVER_FUND_UNAVAILABLE: 'Chưa đọc được số dư quỹ lái xe — phiếu không kèm ảnh chụp số dư',
} as const satisfies Record<PayrollMissingInput, string>;

export const payrollPeriodTone = (status: PayrollPeriodStatus): StatusTone =>
  status === 'OPEN' ? 'go' : 'done';

export const payslipStatusTone = (status: PayslipStatus): StatusTone => {
  switch (status) {
    case 'DRAFT':
      return 'flat';
    case 'APPROVED':
      return 'wait';
    case 'PAID':
      return 'done';
    case 'REVERSED':
      return 'stop';
  }
};

/**
 * NGUOI GHI mot but toan — ten tai khoan, tru khi khong co ai.
 *
 * Cac hang do buoc gieo du lieu tao ra mang tac nhan `demo-seed` (`DEMO_SEED_ACTOR` cua API). Do la
 * su that trong so kiem toan va PHAI o nguyen do; nhung mot ke toan mo so quy va doc cot "Người
 * ghi" thay chu `demo-seed` thi dang doc mot chi tiet ky thuat cua chung ta, khong phai mot cai ten.
 *
 * Doi o CHO HIEN THI, khong o cho luu: `recordedBy` van di nguyen ve may chu va van nam trong
 * `AuditLog`. Man hinh la mot GOC NHIN, va goc nhin duoc phep dich.
 */
const SEED_ACTOR = 'demo-seed';

export const actorLabel = (recordedBy: string | null | undefined): string => {
  const actor = (recordedBy ?? '').trim();
  if (actor.length === 0) return '—';
  return actor === SEED_ACTOR ? 'Dữ liệu khởi tạo' : actor;
};

/**
 * NHOM CHI PHI — ten do khach dat, tru mot ma HE THONG dat.
 *
 * Hau het cac nhom la chuoi tu goi khach (`policies.transportCosting.expenseCategories`) va da la
 * tieng Viet san: "Phí cầu đường", "Bốc xếp"... Rieng `FUEL` la MA DANH RIENG cua nen tang
 * (`FUEL_EXPENSE_CATEGORY_CODE` ben API): moi but toan sinh ra tu mot phieu do dau deu roi vao no,
 * nen no khong doi ten duoc o tang du lieu.
 *
 * Ket qua tren man hinh lai xe: mot o chon liet ke nam nhom tieng Viet roi mot chu `FUEL` in hoa.
 * Doi o CHO HIEN THI la cach duy nhat sua duoc ma khong dung vao ma he thong.
 */
const SYSTEM_EXPENSE_CATEGORY_LABEL: Readonly<Record<string, string>> = {
  FUEL: 'Nhiên liệu',
};

export const expenseCategoryLabel = (code: string): string =>
  SYSTEM_EXPENSE_CATEGORY_LABEL[code] ?? code;
