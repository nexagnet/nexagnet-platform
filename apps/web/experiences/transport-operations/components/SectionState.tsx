'use client';

import type { ReactNode } from 'react';

/**
 * NAM trang thai ma moi man hinh van hanh phai co (#161 §7), gom vao mot tep — dung khuon
 * `b2b-sales-operations/components/SectionState.tsx` da co san, thay vi dung mot he thiet ke thu hai.
 *
 * TRUOC DAY co mot trang thai thu nam, `AwaitingApiState`: mot phan nghiep vu DA CHAY o may chu
 * nhung chua co duong HTTP nao, va cach trung thuc duy nhat luc do la noi ro dieu do. T7D (#170) da
 * noi het cac duong con thieu, nen trang thai do KHONG con ly do ton tai — giu lai mot khoi "chua
 * dung duoc" khi moi thu da dung duoc la noi doi theo huong nguoc lai.
 */

export function LoadingState({ label }: { readonly label: string }) {
  return (
    <p className="tx-state" role="status" aria-live="polite">
      {label}
    </p>
  );
}

export function EmptyState({
  title,
  nextAction,
}: {
  readonly title: string;
  /** Viec tiep theo. Mot o trong khong noi gi la mot o trong bo di. */
  readonly nextAction?: ReactNode;
}) {
  return (
    <div className="tx-state tx-state--empty">
      <p>{title}</p>
      {nextAction === undefined ? null : <div className="tx-state__action">{nextAction}</div>}
    </div>
  );
}

/**
 * Loi PHUC HOI DUOC: luon co duong thu lai, va HIEN NGUYEN VAN cau cua may chu.
 *
 * Khong dien dat lai loi cua may chu: `transportErrorToHttp` da bo mat ma loi co kieu o bien HTTP,
 * nen cau tieng Viet do la thong tin CHINH XAC NHAT ma man hinh co. Doan lai y no la lam mat thong
 * tin va co the noi sai.
 */
export function ErrorState({
  message,
  onRetry,
  action,
}: {
  readonly message: string;
  readonly onRetry?: () => void;
  /**
   * DUONG RA, khi loi khong phai thu-lai-duoc ma la di-cho-khac.
   *
   * Do o 390px tren ban dang chay: mot lai xe mo dia chi goc thay dung cau "Hãy dùng đường
   * 'Mở màn hình lái xe'" — con duong do nam trong thanh ben, ma o be ngang dien thoai thanh ben
   * DA GAP vao mot nut "Danh mục" khong duoc nhac toi. Cau chu tro toi mot thu nguoi doc khong
   * nhin thay: mot ngo cut, dung tren THIET BI CHINH cua vai do.
   */
  readonly action?: ReactNode;
}) {
  return (
    <div className="tx-state tx-state--error" role="alert">
      <p>{message}</p>
      {action}
      {onRetry === undefined ? null : (
        <button type="button" className="tx-btn" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  );
}

/**
 * Xac nhan cho thao tac PHA HUY / DAO / DONG KY / HUY — #161 §7 doi cai nay.
 *
 * Nhung thao tac can ly do (`cancel`, `reversal`, `reopen`) thi ly do la BAT BUOC va o nhap phai co
 * mat ngay trong hop thoai: may chu tu choi than thieu `reason`, nen hoi sau khi bam la mot vong
 * thua va mot lan that bai khong can thiet.
 */
export function ConfirmAction({
  open,
  title,
  detail,
  confirmLabel,
  reasonLabel,
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
  isDestructive = false,
  isBusy = false,
  confirmDisabled = false,
  reasonMaxLength,
  error,
  children,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly detail?: string | null;
  readonly confirmLabel: string;
  /** Co gia tri ⇒ thao tac doi ly do, va nut xac nhan khoa den khi co ly do. */
  readonly reasonLabel?: string;
  readonly reason?: string;
  readonly onReasonChange?: (value: string) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly isDestructive?: boolean;
  readonly isBusy?: boolean;
  /** `#395` — dieu kien rieng cua nguoi goi (vd da go cau xac nhan) truoc khi cho xac nhan. */
  readonly confirmDisabled?: boolean;
  /** `#395` — noi dung them giua cau mo ta va o ly do: canh bao, danh sach viec bi anh huong. */
  readonly children?: ReactNode;
  /** `#395` — do dai toi da cua ly do, trung luat cua may chu (vd `max(500)`). */
  readonly reasonMaxLength?: number;
  /**
   * `#395` — loi cua CHINH lan xac nhan nay. Hop thoai phu kin trang, nen loi hien o trang phia sau
   * la loi nguoi dung khong thay: no phai nam TRONG hop, ngay tren hai nut.
   */
  readonly error?: ReactNode;
}) {
  if (!open) return null;
  const needsReason = reasonLabel !== undefined;
  const reasonReady = !needsReason || (reason ?? '').trim().length > 0;

  return (
    <div className="tx-confirm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="tx-confirm__panel">
        <h2 className="tx-confirm__title">{title}</h2>
        {detail == null ? null : <p className="tx-confirm__detail">{detail}</p>}
        {children}
        {needsReason ? (
          <label className="tx-field">
            <span>{reasonLabel}</span>
            <textarea
              value={reason ?? ''}
              onChange={(event) => onReasonChange?.(event.target.value)}
              rows={3}
              maxLength={reasonMaxLength}
              required
            />
          </label>
        ) : null}
        {error}
        <div className="tx-confirm__actions">
          <button type="button" className="tx-btn" onClick={onCancel} disabled={isBusy}>
            Quay lại
          </button>
          <button
            type="button"
            className={isDestructive ? 'tx-btn tx-btn--stop' : 'tx-btn tx-btn--go'}
            onClick={onConfirm}
            disabled={isBusy || !reasonReady || confirmDisabled}
          >
            {isBusy ? 'Đang gửi…' : confirmLabel}
          </button>
        </div>
        {needsReason && !reasonReady ? (
          <p className="tx-field__hint">Cần ghi lý do trước khi xác nhận.</p>
        ) : null}
      </div>
    </div>
  );
}
