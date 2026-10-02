import {
  FUEL_PAYMENT_METHOD_LABEL,
  FUEL_RECONCILIATION_STATUS_LABEL,
  FUEL_VERIFICATION_LABEL,
  fuelReviewReasonLabel,
  TRIP_KIND_LABEL,
  TRIP_STATUS_LABEL,
  formatBusinessDate,
  formatConsumption,
  formatCount,
  formatInstant,
  formatLiters,
  formatMoney,
  formatOdometer,
  fuelVerificationTone,
  tripStatusTone,
  type StatusTone,
} from '../customer-view';
import type {
  DriverFieldWork,
  DriverFuelSlipView,
  DriverFundStatement,
  DriverTripView,
  FuelReconciliationStatus,
} from '../transport-types';
import { toFieldScreen, type FieldLegCard } from './driver-field';
import { toFundBalance, type FundBalanceModel } from './driver-fund';

/**
 * MO HINH KHUNG NHIN cua BE MAT LAI XE — `GD-23`, `INV-09`.
 *
 * BAT BIEN CUA CA TEP: khong mot ham nao o day duoc nhan, tinh, hay bay ra mot con so DOANH THU.
 * Dieu do khong duoc giu bang y chi tot: no duoc giu bang KIEU. `DriverTripView` va
 * `DriverFuelSlipView` la hai kieu RIENG o may chu, khong co truong `freightAmount`, nen mot lan
 * them truong doanh thu vao `Trip` sau nay KHONG the ro sang day.
 *
 * `REVENUE_FIELD_NAMES` + `revenueFieldsIn` la luoi thu hai: mot phep thu chay duoc tren chinh
 * payload that, de spec chung minh dieu tren thay vi chi tin vao kieu. #161 §8 doi dung bang chung
 * do — "payload cua lai xe khong chua doanh thu, chu khong phai chi bi CSS che di".
 */
/**
 * `INV-09` cam DOANH THU / GIA CUOC, khong cam moi con so tien.
 *
 * Lai xe VAN phai thay so tien tren phieu dau cua chinh minh — ho tra tien mat va can doi soat lai
 * — nen `amount` va `currencyCode` la truong HOP LE tren `DriverFuelSlipView`. Dua chung vao danh
 * sach nay se lam luoi bao dong keu sai cho, va mot luoi keu sai la mot luoi bi tat.
 */
export const REVENUE_FIELD_NAMES = [
  'freightAmount',
  'revenueAmount',
  'marginAmount',
  'marginBasisPoints',
  'commissionAmount',
  'carrierPayableAmount',
  'directCostAmount',
  'deductionAmount',
] as const;

/**
 * Tra ve nhung khoa "mui tien" tim thay trong mot payload cua be mat lai xe.
 * Rong la dat. Dung trong spec, va dung duoc ca voi du lieu that khi can dieu tra.
 */
export const revenueFieldsIn = (payload: unknown): readonly string[] => {
  if (payload === null || typeof payload !== 'object') return [];
  const rows = Array.isArray(payload) ? payload : [payload];
  const found = new Set<string>();
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    for (const key of Object.keys(row as Record<string, unknown>)) {
      if ((REVENUE_FIELD_NAMES as readonly string[]).includes(key)) found.add(key);
    }
  }
  return [...found].sort();
};

/* ------------------------------------------------------------------ *
 * Chuyen cua chinh minh
 * ------------------------------------------------------------------ */

export interface DriverTripCard {
  readonly id: string;
  readonly code: string;
  readonly statusLabel: string;
  readonly tone: StatusTone;
  readonly kindLabel: string;
  readonly businessDateLabel: string;
  readonly route: string;
  /** Ten khach hang la thong tin AN TOAN cho lai xe; gia cuoc thi khong. */
  readonly customerLabel: string;
  readonly vehicleLabel: string;
  readonly cargoDescription: string | null;
  readonly distanceLabel: string;
  readonly isCurrentAssignee: boolean;
}

export const toDriverTripCard = (trip: DriverTripView): DriverTripCard => ({
  id: trip.id,
  code: trip.code,
  statusLabel: TRIP_STATUS_LABEL[trip.status],
  tone: tripStatusTone(trip.status),
  kindLabel: TRIP_KIND_LABEL[trip.kind],
  businessDateLabel: formatBusinessDate(trip.businessDate),
  route: `${trip.originLabel} → ${trip.destinationLabel}`,
  customerLabel: trip.customerName ?? 'Không có khách chỉ định',
  vehicleLabel: trip.vehicleRegistrationPlate ?? 'Chưa gán xe',
  cargoDescription: trip.cargoDescription,
  distanceLabel: formatOdometer(trip.distanceKm),
  isCurrentAssignee: trip.isCurrentAssignee,
});

/**
 * Chuyen DANG LAM: chuyen dang chay ma minh la nguoi phu trach hien tai. Neu khong co thi lay
 * chuyen ke tiep da len ke hoach — do la cau tra loi dung cho cau hoi "gio toi lam gi".
 */
export const currentDriverTrip = (trips: readonly DriverTripView[]): DriverTripView | null => {
  const mine = trips.filter((trip) => trip.isCurrentAssignee);
  return (
    mine.find((trip) => trip.status === 'IN_TRANSIT') ??
    mine.find((trip) => trip.status === 'PLANNED') ??
    null
  );
};

/**
 * Lai xe chi dat duoc HAI trang thai (`DRIVER_SETTABLE_STATUSES`), va `RECONCILED` co y nam ngoai
 * tam voi: `GD-01` doi mot lan chuyen tay co quyen. Nen o day khong bao gio co nut "chot doi soat".
 */
export interface DriverTripAction {
  readonly to: 'IN_TRANSIT' | 'DELIVERED';
  readonly label: string;
}

export const driverTripActions = (trip: DriverTripView | null): readonly DriverTripAction[] => {
  if (trip === null || !trip.isCurrentAssignee) return [];
  if (trip.status === 'PLANNED') return [{ to: 'IN_TRANSIT', label: 'Bắt đầu chuyến' }];
  if (trip.status === 'IN_TRANSIT') return [{ to: 'DELIVERED', label: 'Đã giao' }];
  return [];
};

/* ------------------------------------------------------------------ *
 * Phieu dau cua chinh minh
 * ------------------------------------------------------------------ */

export interface DriverFuelSlipRow {
  readonly id: string;
  readonly businessDateLabel: string;
  readonly occurredAtLabel: string;
  readonly litersLabel: string;
  readonly amountLabel: string;
  readonly odometerLabel: string;
  readonly consumptionLabel: string;
  /** `#313` — lai xe thay lai DUNG nhung gi minh da khai: so hoa don va cach tra tien. */
  readonly invoiceNo: string | null;
  /** `#317` G1 — tram da khai. `null` = phieu khong khai tram. */
  readonly stationLabel: string | null;
  readonly paymentLabel: string;
  /** Ly do may chu gan de ke toan soat — noi bang cau, khong bang ma, va khong buoc toi ai. */
  readonly reviewReasonLabels: readonly string[];
  readonly verificationLabel: string;
  readonly tone: StatusTone;
  readonly reconciliationLabel: string;
  readonly reviewNote: string | null;
  readonly evidenceCountLabel: string;
  readonly hasEvidence: boolean;
  /**
   * ANH cua chinh phieu — `id` de dung dia chi doc byte, `contentType` de chon giua the anh va mot
   * lien ket tai ve cho PDF.
   */
  readonly evidence: readonly { readonly id: string; readonly contentType: string | null }[];
  /** Bi tu choi thi NOP LAI duoc qua dung vong doi cu (`#168 B5`). */
  readonly canResubmit: boolean;
  readonly rejectedNote: string | null;
  /**
   * GO DUOC CHUNG TU TAI NHAM khong — #222 P1-C.
   *
   * MAY CHU van la nguoi quyet (`evaluateFuelEvidenceRemoval` + mot cong thu hai di theo lenh ghi).
   * Co nay chi de man hinh khong bay mot nut chac chan se bi tu choi — mot nut nhu vay day nguoi
   * dung vao mot thong bao loi ma ho khong lam gi duoc.
   *
   * Va vi no la BAN SAO cua luat may chu, no phai giu DUNG hinh dang do: `VERIFIED` thi khong,
   * `MATCHED`/`SETTLED` thi khong, `REJECTED` thi CO (chup lai roi nop lai la duong chay thuong
   * ngay). Noi long o day se bay mot nut chi de nhan 409.
   */
  readonly canRemoveEvidence: boolean;
  /** Vi sao khong go duoc — `null` khi go duoc. Cau noi that thay cho mot nut bi an im lang. */
  readonly evidenceLockedReason: string | null;
  /**
   * DINH THEM chung tu duoc khong — mot cau HOAN TOAN KHAC voi "go duoc khong".
   *
   * May chu mo hai cong khac nhau, va do la co y (`fuel.service.ts` §"GAN ANH CHUNG TU"):
   *
   * ```text
   * dinh them : chan khi ky doi soat SETTLED            (EVIDENCE_FROZEN_FUEL_RECONCILIATION_STATUSES)
   * go ra     : chan khi VERIFIED, hoac MATCHED/SETTLED (evaluateFuelEvidenceRemoval)
   * ```
   *
   * CHI CO THEM SAU KHI XAC THUC, KHONG CO BOT — va do la tinh chat dung. Them mot tam anh khong
   * doi mot con so nao, va mot ke toan tim duoc phieu goc sau khi da duyet van phai gan duoc no
   * vao; con go mot tam anh sau khi da duyet la xoa chinh thu nguoi duyet da nhin. Nen KHONG duoc
   * dung `evidenceLockedReason` lam co cho o tai anh: lam vay se chan mot duong ma may chu cho
   * phep, va lam ho so tien khong bao gio hoan chinh duoc.
   */
  readonly canAttachEvidence: boolean;
  /** Vi sao khong dinh them duoc — `null` khi con dinh duoc. */
  readonly evidenceAttachLockedReason: string | null;
}

/**
 * Doi ban doi cua `evaluateFuelEvidenceRemoval` o may chu — GIU DUNG hai duong tu choi.
 *
 * Hai ma, hai cau: nguoi dung o hai tinh huong nay phai lam hai viec khac nhau (mot ben cho ke toan
 * dao phieu, mot ben xin mo lai ky doi soat).
 */
const EVIDENCE_LOCKED_RECONCILIATION: readonly FuelReconciliationStatus[] = ['MATCHED', 'SETTLED'];

const evidenceLockedReason = (slip: DriverFuelSlipView): string | null => {
  if (slip.verificationStatus === 'VERIFIED') {
    // Noi ca VE DUONG CON MO. Mot cau chi noi "khong go duoc" ben canh mot o tai anh VAN dung
    // duoc doc len nhu mot loi cua man hinh — chinh chu so huu da hoi "chung tu da xac thuc sao
    // van day len duoc anh moi?". Hai ve trong mot cau tra loi luon cau do.
    return 'Phiếu đã được kế toán xác thực: chứng từ không gỡ được nữa, nhưng vẫn đính thêm được.';
  }
  if (EVIDENCE_LOCKED_RECONCILIATION.includes(slip.reconciliationStatus)) {
    return 'Phiếu đã vào kỳ đối soát bảng kê nên chứng từ không gỡ được nữa.';
  }
  return null;
};

/**
 * Doi ban doi cua cong DINH THEM o may chu — `EVIDENCE_FROZEN_FUEL_RECONCILIATION_STATUSES`.
 *
 * Hep hon han cong go ra, va phai giu dung nhu vay: chi mot ky doi soat DA CHOT moi dong duong
 * dinh them. Noi rong ra `VERIFIED` la chan mot viec may chu cho phep.
 */
const EVIDENCE_ATTACH_FROZEN_RECONCILIATION: readonly FuelReconciliationStatus[] = ['SETTLED'];

const evidenceAttachLockedReason = (slip: DriverFuelSlipView): string | null =>
  EVIDENCE_ATTACH_FROZEN_RECONCILIATION.includes(slip.reconciliationStatus)
    ? 'Kỳ đối soát của phiếu đã chốt nên không đính thêm chứng từ được nữa.'
    : null;

export const toDriverFuelSlipRows = (
  slips: readonly DriverFuelSlipView[],
): readonly DriverFuelSlipRow[] =>
  slips.map((slip) => ({
    id: slip.id,
    businessDateLabel: formatBusinessDate(slip.businessDate),
    occurredAtLabel: formatInstant(slip.occurredAt),
    litersLabel: formatLiters(slip.litersUnits),
    amountLabel: formatMoney(slip.amount),
    odometerLabel: formatOdometer(slip.odometerKm),
    consumptionLabel: formatConsumption(slip.consumptionUnits),
    invoiceNo: slip.invoiceNo,
    stationLabel: slip.stationId === null ? null : (slip.stationName ?? 'Trạm đã khai'),
    paymentLabel: FUEL_PAYMENT_METHOD_LABEL[slip.paymentMethod],
    reviewReasonLabels: slip.reviewReasons.map(fuelReviewReasonLabel),
    verificationLabel: FUEL_VERIFICATION_LABEL[slip.verificationStatus],
    tone: fuelVerificationTone(slip.verificationStatus),
    reconciliationLabel: FUEL_RECONCILIATION_STATUS_LABEL[slip.reconciliationStatus],
    reviewNote: slip.reviewNote,
    evidenceCountLabel: formatCount(slip.evidenceCount),
    hasEvidence: slip.evidenceCount > 0,
    evidence: slip.evidence,
    canResubmit: slip.verificationStatus === 'REJECTED',
    rejectedNote:
      slip.verificationStatus === 'REJECTED'
        ? (slip.reviewNote ?? 'Phiếu bị từ chối. Sửa lại theo ghi chú rồi nộp lại.')
        : null,
    canRemoveEvidence: evidenceLockedReason(slip) === null,
    evidenceLockedReason: evidenceLockedReason(slip),
    canAttachEvidence: evidenceAttachLockedReason(slip) === null,
    evidenceAttachLockedReason: evidenceAttachLockedReason(slip),
  }));

/** Cau canh o tai anh — noi ro anh di dau, vi day la anh chung tu tien. */
export const EVIDENCE_UPLOAD_HINT =
  'Chụp rõ phiếu, đủ số lít và số tiền. Ảnh gắn vào đúng phiếu này và kế toán xem được khi đối soát.';

/* ------------------------------------------------------------------ *
 * Trang chu — `#340`: viec DUOC DIEU (vong chay) truoc, chuyen cu la loi phu
 * ------------------------------------------------------------------ */

/**
 * MOT LAN DOC nhin tu trang chu — hinh dang toi thieu cua `SectionQuery`, khong phu thuoc vao no.
 *
 * `data` di TRUOC `errorMessage`: mot lan lam moi hong sau mot lan doc tot giu lai lan doc tot,
 * cung luat voi man Hien truong (`#333`). Con CHUA TUNG doc duoc ma da hong thi la HONG — khong bao
 * gio la "rong". Gop hai thu do chinh la loi `#340` sinh ra de sua.
 */
export interface DriverHomeRead<T> {
  readonly data: T | undefined;
  /** Query bi chan tu dau (`enabled: false`) — khach/vai khong co nguon nay. */
  readonly isBlocked: boolean;
  readonly errorMessage: string | null;
}

type ReadOutcome<T> =
  | { readonly status: 'READY'; readonly data: T }
  | { readonly status: 'FAILED'; readonly message: string }
  | { readonly status: 'BLOCKED' }
  | { readonly status: 'LOADING' };

const outcomeOf = <T>(read: DriverHomeRead<T>): ReadOutcome<T> => {
  if (read.data !== undefined) return { status: 'READY', data: read.data };
  if (read.errorMessage !== null) return { status: 'FAILED', message: read.errorMessage };
  return read.isBlocked ? { status: 'BLOCKED' } : { status: 'LOADING' };
};

/**
 * CHANG DANG LAM, nhin tu trang chu.
 *
 * Chon bang `toFieldScreen()` — DUNG luat cua man Hien truong — chu khong suy lai o day. Hai man
 * chi vao hai chang khac nhau la hai cau tra loi cho cung mot cau hoi "bay gio toi lam gi".
 */
export interface DriverHomeRunCard {
  readonly runCode: string;
  readonly legTitle: string;
  readonly route: string;
  readonly phaseLabel: string;
  readonly orderCode: string | null;
  /** Nhan cua viec DAU TIEN may chu da tinh — chi de DOC; nut bam nam o man Hien truong. */
  readonly nextStepLabel: string | null;
}

/**
 * THE CHINH cua trang chu — dung mot, va no tra loi "bay gio toi phai lam gi".
 *
 * `FAILED` va `LOADING` khong bao gio duoc doc thanh `NO_WORK`. `RUN_IDLE` cung khong: vong chay
 * con mo nghia la viec VAN con, chi chua co gi de bam ngay.
 */
export type DriverHomePrimary =
  | { readonly kind: 'LOADING'; readonly label: string }
  | { readonly kind: 'FAILED'; readonly message: string }
  | { readonly kind: 'NO_WORK'; readonly headline: string; readonly detail: string | null }
  | { readonly kind: 'RUN_CURRENT'; readonly headline: string; readonly card: DriverHomeRunCard }
  | { readonly kind: 'RUN_IDLE'; readonly headline: string; readonly runCodes: readonly string[] }
  /** CHI khi nguon la `TRIP` — khach/vai chua co man Hien truong. */
  | {
      readonly kind: 'TRIP';
      readonly headline: string;
      readonly card: DriverTripCard;
      readonly actions: readonly DriverTripAction[];
    };

/**
 * Nguon quyet dinh "co viec hay khong".
 *
 * `RUN` bat cu khi nao man Hien truong mo — va khi do Trip KHONG bao gio duoc quyet dinh dieu do
 * (`#340` yeu cau 3). `TRIP` chi con cho khach chua bat `transport-checkpoint`: voi ho tuyen
 * `/transport/me/field-work` khong duoc gan, va chuyen la nguon viec duy nhat doc duoc.
 */
export type DriverHomeSource = 'RUN' | 'TRIP';

export interface DriverHomeModel {
  readonly source: DriverHomeSource;
  /** Tieu de the chinh — hai nguon, hai ten, de khong ai doc nham viec nay thanh viec kia. */
  readonly heading: string;
  readonly primary: DriverHomePrimary;
  /** Chuyen theo cach lam truoc day dang mo — LOI PHU, chi khi nguon la `RUN`, khong mang nut. */
  readonly legacyTrip: DriverTripCard | null;
  /** Doc chuyen cu HONG khi nguon la `RUN` — noi ra o loi phu, khong im lang giau di. */
  readonly legacyNotice: string | null;
  /** Viec DA duoc dieu thi khong phai "nhan" lai o man Nhan viec (`#340` yeu cau 6). */
  readonly assignedNote: string | null;
  /** Loi vao Nhan viec tai diem — CHI khi van phong chua dieu viec nao (`#340` yeu cau 5). */
  readonly siteIntakeHint: string | null;
  /*
   * KHONG co canh bao nhien lieu (`#340` yeu cau 8): tu `#364` o khai phieu cua lai xe doc CHINH
   * viec duoc dieu (`/transport/me/fuel/runs`). Cau cu "phieu van ghi theo chuyen, chua ghi duoc"
   * nay la SAI — no day lai xe di bao dieu hanh cho mot phieu ho tu ghi duoc o man Nhien lieu.
   */
  /** `null` khi khach chua bat `transport-costing` — khong bia so 0. */
  readonly fund: FundBalanceModel | null;
  /** So chuyen dang mo theo DUNG nguon dang quyet dinh; `null` khi chua doc duoc — khong bia 0. */
  readonly openWorkCount: number | null;
}

export interface DriverHomeInput {
  /** `/transport/me/field-work` — CUNG khoa, CUNG lan doc voi man Hien truong. */
  readonly runWork: DriverHomeRead<DriverFieldWork>;
  /** `/transport/me/trips` — chuyen theo cach lam truoc day. */
  readonly trips: DriverHomeRead<readonly DriverTripView[]>;
  readonly fund: DriverFundStatement | null;
  /** Man Hien truong co mo cho nguoi nay khong — trang chu chi chi vao mot man co that. */
  readonly canOpenField: boolean;
  readonly canIntakeAtSite: boolean;
}

const OPEN_STATUSES = new Set(['PLANNED', 'IN_TRANSIT']);

const RUN_HEADING = 'Việc được điều từ văn phòng';
const TRIP_HEADING = 'Chuyến hiện tại';
const ASSIGNED_NOTE = 'Văn phòng đã giao việc này cho bạn — không cần vào Nhận việc để nhận lại.';
const SITE_INTAKE_HINT =
  'Nếu bạn đang ở điểm lấy hàng mà văn phòng chưa giao việc, dùng Nhận việc để báo đã đến.';
const LEGACY_READ_FAILED = 'Chưa đọc được chuyến theo cách làm trước đây.';

/** Phan cua mo hinh do VIEC DUOC DIEU quyet dinh — tach khoi phan chung (loi phu, quy). */
type RunPart = Pick<
  DriverHomeModel,
  'primary' | 'assignedNote' | 'siteIntakeHint' | 'openWorkCount'
>;

/** Chua doc xong / doc hong: KHONG ket luan gi — ke ca "khong co viec". */
const NOTHING_KNOWN = {
  assignedNote: null,
  siteIntakeHint: null,
  openWorkCount: null,
} as const;

/**
 * MOT viec troi nhat, MOT den hai lan bam — #161 §3 — va `#340`: viec do den tu VONG CHAY da duoc
 * dieu, khong tu `TransportTrip`.
 *
 * Thu tu la mot phan cua hop dong: man Hien truong khong mo (hoac query bi chan) thi moi roi ve
 * Trip; con mo thi Trip chi con la loi phu, du no la chuyen DANG CHAY.
 */
export const toDriverHome = (input: DriverHomeInput): DriverHomeModel => {
  const run = outcomeOf(input.runWork);
  const trips = outcomeOf(input.trips);
  const fund = input.fund === null ? null : toFundBalance(input.fund);
  if (!input.canOpenField || run.status === 'BLOCKED') {
    return {
      source: 'TRIP',
      heading: TRIP_HEADING,
      legacyTrip: null,
      legacyNotice: null,
      assignedNote: null,
      siteIntakeHint: null,
      fund,
      ...tripPart(trips),
    };
  }
  const legacy = trips.status === 'READY' ? currentDriverTrip(trips.data) : null;
  return {
    source: 'RUN',
    heading: RUN_HEADING,
    legacyTrip: legacy === null ? null : toDriverTripCard(legacy),
    legacyNotice: trips.status === 'FAILED' ? LEGACY_READ_FAILED : null,
    fund,
    ...runPart(run, input),
  };
};

const runPart = (
  run: Exclude<ReadOutcome<DriverFieldWork>, { readonly status: 'BLOCKED' }>,
  input: DriverHomeInput,
): RunPart => {
  if (run.status === 'LOADING') {
    return {
      ...NOTHING_KNOWN,
      primary: { kind: 'LOADING', label: 'Đang đọc việc được điều cho bạn…' },
    };
  }
  if (run.status === 'FAILED') {
    return { ...NOTHING_KNOWN, primary: { kind: 'FAILED', message: run.message } };
  }

  const field = toFieldScreen(run.data);
  const cards = field.current === null ? field.others : [field.current, ...field.others];
  if (cards.length === 0) {
    return {
      primary: {
        kind: 'NO_WORK',
        headline: 'Hiện chưa có việc nào được điều cho bạn.',
        detail: 'Việc văn phòng giao sẽ hiện ở đây và ở màn Hiện trường.',
      },
      assignedNote: null,
      siteIntakeHint: input.canIntakeAtSite ? SITE_INTAKE_HINT : null,
      openWorkCount: 0,
    };
  }

  // Dem theo VONG CHAY (`runId`), khong theo so chang: mot vong chay hai chang van la mot viec.
  const runs = new Map(cards.map((card) => [card.runId, card.runCode]));
  return {
    primary:
      field.current === null
        ? { kind: 'RUN_IDLE', headline: field.headline, runCodes: [...runs.values()] }
        : runCurrent(field.current, field.headline),
    assignedNote: input.canIntakeAtSite ? ASSIGNED_NOTE : null,
    siteIntakeHint: null,
    openWorkCount: runs.size,
  };
};

/**
 * `toFieldScreen` chi chon lam `current` mot chang CO it nhat mot nut, nen viec ke tiep luon co.
 * Neu mot ngay luat do doi, cau dau roi ve dong tieu de cua man Hien truong — khong ve dau ngoac rong.
 */
const runCurrent = (current: FieldLegCard, fieldHeadline: string): DriverHomePrimary => {
  const next = current.actions[0]?.label ?? null;
  return {
    kind: 'RUN_CURRENT',
    headline: next === null ? fieldHeadline : `Việc kế tiếp: bấm “${next}” ở màn Hiện trường.`,
    card: {
      runCode: current.runCode,
      legTitle: current.title,
      route: current.route,
      phaseLabel: current.phaseLabel,
      orderCode: current.orderCode,
      nextStepLabel: next,
    },
  };
};

/**
 * KHACH CHUA CO MAN HIEN TRUONG — chuyen la nguon viec duy nhat doc duoc, nen hop dong cu giu
 * nguyen: the chuyen dang lam kem hai nut cua chinh no (`driverTripActions`).
 */
const tripPart = (
  trips: ReadOutcome<readonly DriverTripView[]>,
): Pick<DriverHomeModel, 'primary' | 'openWorkCount'> => {
  if (trips.status === 'LOADING') {
    return { primary: { kind: 'LOADING', label: 'Đang đọc chuyến của bạn…' }, openWorkCount: null };
  }
  if (trips.status === 'FAILED') {
    return { primary: { kind: 'FAILED', message: trips.message }, openWorkCount: null };
  }

  const list = trips.status === 'READY' ? trips.data : [];
  const current = currentDriverTrip(list);
  const openWorkCount = list.filter(
    (trip) => trip.isCurrentAssignee && OPEN_STATUSES.has(trip.status),
  ).length;
  if (current === null) {
    return {
      primary: {
        kind: 'NO_WORK',
        headline: 'Hiện chưa có chuyến nào được phân công cho bạn.',
        detail: null,
      },
      openWorkCount,
    };
  }
  return {
    primary: {
      kind: 'TRIP',
      headline: `${TRIP_STATUS_LABEL[current.status]} · ${current.originLabel} → ${current.destinationLabel}`,
      card: toDriverTripCard(current),
      actions: driverTripActions(current),
    },
    openWorkCount,
  };
};
