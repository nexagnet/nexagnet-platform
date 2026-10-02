import {
  TOLL_API_STATUS_LABEL,
  TOLL_LINK_PROVENANCE_LABEL,
  TOLL_MATCH_STATE_LABEL,
  TOLL_PROVIDER_LABEL,
  TOLL_REVIEW_STATE_LABEL,
  TOLL_SOURCE_KIND_LABEL,
  TOLL_TRANSACTION_KIND_LABEL,
  formatBusinessDate,
  formatBusinessDateRange,
  formatCount,
  formatInstant,
  formatMoney,
  tollApiStatusTone,
  tollMatchStateTone,
  tollRejectReasonLabel,
  tollReviewStateTone,
  type StatusTone,
} from '../customer-view';
import { canPerform, type TransportViewerInput } from '../transport-actions';
import type {
  TollAccount,
  TollAccountLinkCount,
  TollAccountLinkListing,
  TollCandidate,
  TollCandidatePage,
  TollImportPreview,
  TollProviderSurface,
  TollReviewState,
} from '../transport-types';

/**
 * MO HINH KHUNG NHIN cua man Thu phi duong bo (ETC).
 *
 * ============================================================================================
 * BA DIEU TEP NAY KHONG DUOC LAM, VA CHUNG LA LY DO NO TON TAI
 * ============================================================================================
 *
 *   1. KHONG noi mot dong nao "da tra". `TOLL_REVIEW_STATES` co dung ba gia tri —
 *      `PENDING`/`CONFIRMED`/`REOPENED` — va khong mot cai nao nghia la tien da di. `CONFIRMED`
 *      nghia la MOT NGUOI da nhin dong nay va noi no khop. Mot nhan "da thanh toan" o day se bien
 *      mot phep doc tep thanh mot khang dinh ke toan ma khong ai ky (`#269 J7`, `#295` nhac lai).
 *   2. KHONG chon xe giup may chu. Mot dong `AMBIGUOUS` o lai hang cho NGUOI; man hinh de trong
 *      cot xe chu khong lay ung vien dau tien.
 *   3. KHONG tinh mot so tien nao. Tien la so nguyen dong VND do may chu cong; o day chi co
 *      `formatMoney`.
 *
 * ============================================================================================
 * CAC CO `can*` LA DE KHONG MOI NGUOI BAM MOT NUT SE 4xx — KHONG PHAI MOT CONG
 * ============================================================================================
 *
 * Cong that nam o may chu (`TollService.review()` + `TransportActionGuard`). Nhung co duoi day
 * PHAN ANH dung luat cua may chu de man hinh khong hua mot viec no se bi tu choi:
 * `RESOLVE_VEHICLE` chi ap dung cho `kind === 'TOLL_PASS'` — nap tien va phi tai khoan khong gan
 * vao mot chiec xe nao, va gan vao la tao ra mot lien he khong co that roi no di tiep vao moi bao
 * cao theo xe. Neu luat o may chu doi, day la cho phai sua theo — khong phai cho de dat luat moi.
 */

/* ------------------------------------------------------------------ *
 * Tai khoan + so dang ky xe nhan chi tra
 * ------------------------------------------------------------------ */

export interface TollAccountRow {
  readonly id: string;
  readonly providerLabel: string;
  readonly accountNo: string;
  readonly holderLabel: string;
  readonly activeLabel: string;
  readonly activeTone: StatusTone;
  /**
   * So xe DANG nhan chi tra, DO MAY CHU DEM.
   *
   * `null` = chua doc duoc con so nay. KHONG duoc thay bang `0`: hai dieu do khac han nhau, va
   * `0` la cai sai da xay ra that — xem khoi chu thich cua `toTollAccountRows`.
   */
  readonly effectiveLinkCountLabel: string | null;
}

/**
 * DEM DO MAY CHU LAM, va man hinh chi hien lai.
 *
 * ============================================================================================
 * VI SAO KHONG DEM O DAY NUA — MOT LOI THAT, KHONG PHAI MOT SO THICH KIEN TRUC
 * ============================================================================================
 *
 * Ban truoc nhan mot mang `links` roi dem `link.accountId === account.id`. Van de khong nam o phep
 * dem ma nam o CAI MANG: man hinh chi tai doan noi cua tai khoan DANG CHON. Nen khi chua chon gi,
 * moi tai khoan hien `0`; chon A thi A dung con B, C van `0` du chung co xe.
 *
 * Va khong ai doc `0` do nhu "chua tai du lieu". Nguoi ta doc no la *"tai khoan nay chua noi xe
 * nao"* roi di mo mot doan noi da ton tai — tuc man hinh gay ra mot thao tac sai, khong chi hien
 * sai.
 *
 * Nen `counts` den tu `GET /transport/toll/accounts/link-counts`: mot cau tra loi ve CA BANG, va
 * "dang hieu luc" duoc tinh theo NGAY NGHIEP VU cua may chu chu khong theo `effectiveTo === null`
 * (mot doan mo tu thang sau cung co `effectiveTo` rong).
 *
 * Tai khoan KHONG co trong `counts` cho ra `null` chu khong `0` — chua doc duoc mot con so thi
 * man hinh phai noi rang no chua doc duoc.
 */
export const toTollAccountRow = (
  account: TollAccount,
  counts: ReadonlyMap<string, number>,
): TollAccountRow => {
  const count = counts.get(account.id);
  return {
    id: account.id,
    providerLabel: TOLL_PROVIDER_LABEL[account.provider],
    accountNo: account.accountNo,
    holderLabel: account.holderName ?? '—',
    activeLabel: account.active ? 'Đang dùng' : 'Đã ngừng',
    activeTone: account.active ? 'go' : 'flat',
    effectiveLinkCountLabel: count === undefined ? null : formatCount(count),
  };
};

export const toTollAccountRows = (
  accounts: readonly TollAccount[],
  counts: readonly TollAccountLinkCount[],
): readonly TollAccountRow[] => {
  const byAccount = new Map(counts.map((row) => [row.accountId, row.effectiveLinkCount]));
  return accounts.map((account) => toTollAccountRow(account, byAccount));
};

/*
 * KHONG CON MOT PHEP CHAM "dang hieu luc" NAO O TEP NAY.
 *
 * Ban truoc co `isEffectiveNow = link.effectiveTo === null`, va do la mot phep sai that: mot doan
 * MO TU THANG SAU cung co `effectiveTo` rong, nen no deo huy hieu xanh *"Dang hieu luc"* trong khi
 * phep dem cua may chu — ngay o bang ben canh — loai no ra. Hai con so canh nhau noi hai dieu khac
 * nhau ve cung mot doan noi.
 *
 * Sua bang cach KHONG cham o day nua: `TollAccountLinkView.effective` do may chu tra ve, cham bang
 * dung ham ma phep dem dung (`tollLinkEffectiveOn`). Ly do sau hon la ky thuat: mot ket luan
 * "dang hieu luc" can mot NGAY NGHIEP VU, va trinh duyet khong co ngay nghiep vu cua khach — no chi
 * co dong ho may nguoi dung.
 */

export interface TollLinkRow {
  readonly id: string;
  readonly accountLabel: string;
  readonly vehicleLabel: string;
  readonly providerVehicleRefLabel: string;
  readonly periodLabel: string;
  readonly effectiveNow: boolean;
  /**
   * Chu tren huy hieu — BA trang thai, khong hai.
   *
   * *"Chua toi han"* va *"Da dong"* deu la `effectiveNow === false`, nhung chung doi hai viec khac
   * nhau: mot cai la doan noi da duoc dat truoc va se tu chay, cai kia la mot doan da het. Gop
   * chung thanh mot chu se lam nguoi van hanh mo lai mot doan noi da duoc dat truoc.
   */
  readonly effectiveLabel: string;
  readonly effectiveTone: StatusTone;
  readonly provenanceLabel: string;
  readonly createdLabel: string;
  readonly createdBy: string;
}

/**
 * `accountLabelOf`/`vehicleLabelOf` di vao bang THAM SO chu khong tra bang mot lan goi mang o day.
 *
 * Mot mo hinh khung nhin goi mang la mot mo hinh khong kiem duoc bang mot ham thuan — va toan bo
 * gia tri cua tep nay nam o cho no kiem duoc.
 */
export const toTollLinkRows = (
  listing: TollAccountLinkListing | null,
  accountLabelOf: (accountId: string) => string,
  vehicleLabelOf: (vehicleId: string) => string,
): readonly TollLinkRow[] =>
  (listing?.links ?? []).map((link) => ({
    id: link.id,
    accountLabel: accountLabelOf(link.accountId),
    vehicleLabel: vehicleLabelOf(link.vehicleId),
    providerVehicleRefLabel: link.providerVehicleRef ?? '—',
    periodLabel: formatBusinessDateRange(link.effectiveFrom, link.effectiveTo),
    effectiveNow: link.effective,
    // Ba trang thai duoc phan biet bang CHU, khong chi bang mau: mot doan CHUA toi han va mot doan
    // DA dong deu la "khong hieu luc hom nay", nhung nguoi van hanh phai lam hai viec khac nhau.
    effectiveLabel: link.effective
      ? 'Đang hiệu lực'
      : listing !== null && link.effectiveFrom > listing.onDate
        ? 'Chưa tới hạn'
        : 'Đã đóng',
    effectiveTone: link.effective ? 'go' : 'flat',
    provenanceLabel: TOLL_LINK_PROVENANCE_LABEL[link.provenance],
    createdLabel: formatInstant(link.createdAt),
    createdBy: link.createdBy,
  }));

/* ------------------------------------------------------------------ *
 * Do san sang cua nha cung cap — noi that, khong noi "sap co"
 * ------------------------------------------------------------------ */

export interface TollProviderRow {
  readonly provider: string;
  readonly providerLabel: string;
  readonly statementReady: boolean;
  readonly statementLabel: string;
  readonly statementTone: StatusTone;
  readonly blockedReasonLabel: string | null;
  readonly apiStatusLabel: string;
  readonly apiStatusTone: StatusTone;
  /** Duong DOI HOI HOP PHAP (NĐ 119/2024 Đ.26 kh.2) — khong phai mot cach di vong. */
  readonly requestPathLabel: string | null;
}

/**
 * `statementReady === false` duoc ve la MOT KET QUA DA DO, khong phai mot o trong cho cau hinh.
 *
 * Hai cach viet cung mot o nay dan toi hai hanh vi rat khac nhau cua nguoi van hanh: "chua san
 * sang" doc nhu mot thu se tu den, con "can mot tep mau cua nha cung cap" noi ro **ai phai lam
 * gi**. Do la toan bo khac biet giua mot man hinh dung duoc va mot man hinh de nhin.
 */
export const toTollProviderRows = (surface: TollProviderSurface): readonly TollProviderRow[] =>
  surface.readiness.map((readiness) => {
    const diagnostic = surface.api.find((entry) => entry.provider === readiness.provider) ?? null;
    return {
      provider: readiness.provider,
      providerLabel: TOLL_PROVIDER_LABEL[readiness.provider],
      statementReady: readiness.statementReady,
      statementLabel: readiness.statementReady
        ? 'Đọc được bảng kê'
        : 'Cần một tệp mẫu của nhà cung cấp',
      statementTone: readiness.statementReady ? 'go' : 'wait',
      blockedReasonLabel: readiness.blockedReason
        ? tollRejectReasonLabel(readiness.blockedReason)
        : null,
      apiStatusLabel: diagnostic
        ? TOLL_API_STATUS_LABEL[diagnostic.status]
        : TOLL_API_STATUS_LABEL.NOT_PUBLICLY_PROVEN,
      apiStatusTone: tollApiStatusTone(diagnostic?.status ?? 'NOT_PUBLICLY_PROVEN'),
      requestPathLabel: diagnostic?.requestPath ?? null,
    };
  });

/* ------------------------------------------------------------------ *
 * Ban doc thu cua mot lan nap tep
 * ------------------------------------------------------------------ */

export interface TollRejectionRow {
  readonly reasonLabel: string;
  readonly countLabel: string;
}

export interface TollPreviewRowModel {
  readonly rowNumber: number;
  readonly accepted: boolean;
  readonly statusLabel: string;
  readonly statusTone: StatusTone;
  readonly rejectReasonLabel: string | null;
  readonly kindLabel: string;
  readonly vehiclePlateRaw: string;
  readonly businessDateLabel: string;
  readonly amountLabel: string;
  readonly stationLabel: string;
  readonly matchStateLabel: string | null;
  readonly matchStateTone: StatusTone | null;
}

export interface TollPreviewModel {
  readonly providerLabel: string;
  readonly sourceKindLabel: string;
  readonly rowCountLabel: string;
  readonly acceptedCountLabel: string;
  readonly rejectedCountLabel: string;
  readonly rejections: readonly TollRejectionRow[];
  readonly matchStateCounts: readonly TollRejectionRow[];
  /**
   * `null` = bo byte nay chua tung duoc nap.
   *
   * Khi khong `null`, man hinh phai noi ra rang nap lai KHONG tao them mot nghia vu nao — neu
   * khong, nguoi van hanh se tuong minh vua lam doi so tien len hai lan.
   */
  readonly alreadyImportedId: string | null;
  readonly replayNotice: string | null;
  /** 20 dong dau, do MAY CHU cat. Khong phai ca tep. */
  readonly sample: readonly TollPreviewRowModel[];
  readonly sampleNotice: string;
}

const toCountRows = (counts: Readonly<Record<string, number>>): readonly TollRejectionRow[] =>
  Object.entries(counts)
    // Sap tat dinh: nhieu truoc, roi theo ten — de hai lan doc cung mot tep ra cung mot bang.
    .sort(([leftKey, leftCount], [rightKey, rightCount]) =>
      rightCount === leftCount ? leftKey.localeCompare(rightKey) : rightCount - leftCount,
    )
    .map(([reason, count]) => ({
      reasonLabel: tollRejectReasonLabel(reason),
      countLabel: formatCount(count),
    }));

export const toTollPreviewModel = (preview: TollImportPreview): TollPreviewModel => ({
  providerLabel: TOLL_PROVIDER_LABEL[preview.provider],
  sourceKindLabel: TOLL_SOURCE_KIND_LABEL[preview.sourceKind],
  rowCountLabel: formatCount(preview.rowCount),
  acceptedCountLabel: formatCount(preview.acceptedCount),
  rejectedCountLabel: formatCount(preview.rejectedCount),
  rejections: toCountRows(preview.rejectionsByReason),
  matchStateCounts: toCountRows(preview.matchStateCounts as Readonly<Record<string, number>>),
  alreadyImportedId: preview.alreadyImportedId,
  replayNotice:
    preview.alreadyImportedId === null
      ? null
      : 'Đúng bộ byte này đã được nạp trước đó. Nạp lại sẽ trả về chính lần cũ và không tạo thêm nghĩa vụ nào.',
  sample: preview.sample.map((row) => ({
    rowNumber: row.rowNumber,
    accepted: row.parseStatus === 'ACCEPTED',
    statusLabel: row.parseStatus === 'ACCEPTED' ? 'Đọc được' : 'Bỏ qua',
    statusTone: row.parseStatus === 'ACCEPTED' ? 'go' : 'wait',
    rejectReasonLabel: row.rejectReason ? tollRejectReasonLabel(row.rejectReason) : null,
    kindLabel: row.kind ? TOLL_TRANSACTION_KIND_LABEL[row.kind] : '—',
    vehiclePlateRaw: row.vehiclePlateRaw,
    businessDateLabel: formatBusinessDate(row.businessDate),
    amountLabel: formatMoney(row.signedAmount),
    stationLabel: row.stationLabel ?? '—',
    matchStateLabel: row.matchState ? TOLL_MATCH_STATE_LABEL[row.matchState] : null,
    matchStateTone: row.matchState ? tollMatchStateTone(row.matchState) : null,
  })),
  sampleNotice: `Bản đọc thử hiển thị ${String(preview.sample.length)} dòng đầu trên tổng ${formatCount(preview.rowCount)} dòng.`,
});

/* ------------------------------------------------------------------ *
 * Hang cho doi soat
 * ------------------------------------------------------------------ */

export interface TollCandidateRow {
  readonly id: string;
  readonly rowNumber: number;
  readonly providerLabel: string;
  readonly accountNoRaw: string;
  readonly kindLabel: string;
  readonly vehiclePlateRaw: string;
  /**
   * `null` khi may chu CHUA giai duoc xe.
   *
   * Day la truong quan trong nhat cua ca hang cho: mot dong `AMBIGUOUS` hay `VEHICLE_UNRESOLVED`
   * KHONG duoc man hinh dien giup mot chiec xe. Bo trong la cau tra loi dung.
   */
  readonly vehicleId: string | null;
  readonly passedAtLabel: string;
  readonly businessDateLabel: string;
  readonly amountLabel: string;
  readonly stationLabel: string;
  readonly matchStateLabel: string;
  readonly matchStateTone: StatusTone;
  /**
   * TRANG THAI THO, giu nguyen kieu — va no o day de HANH VI khong doc chu hien thi.
   *
   * Ban truoc, nut "Mo lai / Xac nhan" chon nhanh bang `reviewStateLabel === 'Đã có người xác
   * nhận'`. Mot lan sua chu trong `TOLL_REVIEW_STATE_LABEL` — hay mot ban dich — se lang le doi
   * hanh vi cua nut: khong mot bai kiem kieu nao do duoc, va man hinh van bien dich.
   *
   * Nhan la de NGUOI doc; quyet dinh phai doc mot gia tri co kieu.
   */
  readonly reviewState: TollReviewState;
  readonly reviewStateLabel: string;
  readonly reviewStateTone: StatusTone;
  readonly duplicateOfCandidateId: string | null;
  readonly rejectReasonLabel: string | null;
  /** Phan anh luat may chu: chi `TOLL_PASS` moi gan duoc vao mot chiec xe. */
  readonly vehicleApplicable: boolean;
}

export const toTollCandidateRow = (candidate: TollCandidate): TollCandidateRow => ({
  id: candidate.id,
  rowNumber: candidate.rowNumber,
  providerLabel: TOLL_PROVIDER_LABEL[candidate.provider],
  accountNoRaw: candidate.accountNoRaw,
  kindLabel: candidate.kind ? TOLL_TRANSACTION_KIND_LABEL[candidate.kind] : '—',
  vehiclePlateRaw: candidate.vehiclePlateRaw,
  vehicleId: candidate.vehicleId,
  passedAtLabel: formatInstant(candidate.passedAt),
  businessDateLabel: formatBusinessDate(candidate.businessDate),
  amountLabel: formatMoney(candidate.signedAmount),
  stationLabel: candidate.stationLabel ?? '—',
  matchStateLabel: candidate.matchState ? TOLL_MATCH_STATE_LABEL[candidate.matchState] : '—',
  matchStateTone: candidate.matchState ? tollMatchStateTone(candidate.matchState) : 'flat',
  reviewState: candidate.reviewState,
  reviewStateLabel: TOLL_REVIEW_STATE_LABEL[candidate.reviewState],
  reviewStateTone: tollReviewStateTone(candidate.reviewState),
  duplicateOfCandidateId: candidate.duplicateOfCandidateId,
  rejectReasonLabel: candidate.rejectReason ? tollRejectReasonLabel(candidate.rejectReason) : null,
  vehicleApplicable: candidate.kind === 'TOLL_PASS',
});

export interface TollQueueModel {
  readonly rows: readonly TollCandidateRow[];
  readonly totalLabel: string;
  readonly shownLabel: string;
  readonly hasMore: boolean;
  /** So dong CON CHO NGUOI — dem theo `reviewState`, khong theo `matchState`. */
  readonly pendingCountLabel: string;
  readonly canRead: boolean;
  readonly canResolve: boolean;
  readonly emptyNotice: string;
}

export const toTollQueueModel = (
  page: TollCandidatePage,
  viewer: TransportViewerInput,
): TollQueueModel => {
  const rows = page.items.map(toTollCandidateRow);
  return {
    rows,
    totalLabel: formatCount(page.total),
    shownLabel: formatCount(rows.length),
    hasMore: page.offset + rows.length < page.total,
    pendingCountLabel: formatCount(
      page.items.filter((candidate) => candidate.reviewState !== 'CONFIRMED').length,
    ),
    canRead: canPerform(viewer, 'transport.toll.review.read'),
    canResolve: canPerform(viewer, 'transport.toll.review.resolve'),
    emptyNotice:
      page.total === 0
        ? 'Chưa có dòng nào trong hàng chờ. Nạp một bảng kê để bắt đầu đối soát.'
        : 'Không có dòng nào khớp bộ lọc đang chọn.',
  };
};

/* ------------------------------------------------------------------ *
 * Quyen cua ca man hinh
 * ------------------------------------------------------------------ */

export interface TollCapabilities {
  readonly canReadAccounts: boolean;
  readonly canManageAccounts: boolean;
  readonly canImport: boolean;
  readonly canReadReview: boolean;
  readonly canResolveReview: boolean;
}

/**
 * NAM ma quyen DA CO tu truoc, khong mot ma moi nao.
 *
 * Do la dieu giu lane nay khong dung `transport-actions.ts` lan ban guong web — hai mang do dang
 * bi mot lane khac sua VA bi khoa theo THU TU boi hai spec, nen them mot ma o day se thanh mot va
 * cham bon tep.
 */
export const tollCapabilities = (viewer: TransportViewerInput): TollCapabilities => ({
  canReadAccounts: canPerform(viewer, 'transport.toll.account.read'),
  canManageAccounts: canPerform(viewer, 'transport.toll.account.manage'),
  canImport: canPerform(viewer, 'transport.toll.import'),
  canReadReview: canPerform(viewer, 'transport.toll.review.read'),
  canResolveReview: canPerform(viewer, 'transport.toll.review.resolve'),
});
