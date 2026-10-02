'use client';

import type { ReactNode } from 'react';
import type { TriState } from './accounts-model';
import { adminErrorMessage, type PermissionLabelOf } from './admin-reasons';

/**
 * Manh giao dien DUNG CHUNG cua khu quan tri (`#395`). Nho, khong trang thai — de hai man (tai khoan,
 * dia diem) noi cung mot giong: nut loc la nut bam that (`aria-pressed`), o nhom quyen la checkbox
 * ba trang thai that (`aria-checked="mixed"`), loi la mot cau tieng Viet co ten thu dang xung dot.
 */

export function FilterChip({
  label,
  count,
  isPressed,
  onClick,
}: {
  readonly label: string;
  readonly count?: number;
  readonly isPressed: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button type="button" className="tx-admin-chip" aria-pressed={isPressed} onClick={onClick}>
      <span>{label}</span>
      {count === undefined ? null : <span className="tx-admin-chip__count">{count}</span>}
    </button>
  );
}

export function ChipRow({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="tx-admin-chips" role="group" aria-label={label}>
      {children}
    </div>
  );
}

/**
 * CHECKBOX BA TRANG THAI cua mot nhom quyen. `<input type=checkbox>` chi co `indeterminate` qua JS va
 * trinh doc man hinh doc khong deu; mot `button role="checkbox"` voi `aria-checked="mixed"` la mau
 * WAI-ARIA chuan cho dung truong hop nay.
 *
 * `checked` va `isLocked` DOC LAP: o khoa (khong bam duoc) van noi dung trang thai that — du, do dang
 * hay trong — bang `aria-checked` va bang dau trong o.
 */
export function TriStateCheckbox({
  checked,
  isLocked,
  label,
  describedBy,
  onToggle,
}: {
  readonly checked: TriState;
  readonly isLocked: boolean;
  readonly label: string;
  readonly describedBy?: string;
  readonly onToggle: () => void;
}) {
  const ariaChecked = checked === 'on' ? true : checked === 'mixed' ? 'mixed' : false;
  return (
    <button
      type="button"
      role="checkbox"
      className="tx-admin-tri"
      data-state={checked}
      aria-checked={ariaChecked}
      aria-label={label}
      aria-describedby={describedBy}
      aria-disabled={isLocked ? true : undefined}
      onClick={isLocked ? undefined : onToggle}
    >
      <span className="tx-admin-tri__box" aria-hidden="true">
        {checked === 'on' ? '✓' : checked === 'mixed' ? '–' : ''}
      </span>
    </button>
  );
}

/** Mot loi cua khu quan tri — cau co ten, xuong dong theo tung vi pham. */
export function AdminError({
  error,
  labelOf,
  onRetry,
}: {
  readonly error: unknown;
  readonly labelOf?: PermissionLabelOf;
  readonly onRetry?: () => void;
}) {
  if (error === null || error === undefined) return null;
  return (
    <div className="tx-state tx-state--error tx-admin-error" role="alert">
      <p>{adminErrorMessage(error, labelOf)}</p>
      {onRetry === undefined ? null : (
        <button type="button" className="tx-btn" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  );
}

/**
 * TRA TIEU DIEM ve nut da mo chi tiet (`data-opens="<khoa>"`) sau khi chi tiet dong. Nut do vua bi an
 * (man hep) hoac go khoi DOM (man dia diem), nen tieu diem khong tu ve duoc — de nguyen thi roi ve
 * `<body>` va nguoi dung ban phim phai Tab lai tu dau trang. `false` khi khong con nut nao de ve.
 */
export function focusOpener(container: HTMLElement | null, key: string): boolean {
  const opener = Array.from(container?.querySelectorAll<HTMLElement>('[data-opens]') ?? []).find(
    (node) => node.dataset.opens === key,
  );
  if (opener === undefined) return false;
  opener.focus();
  return true;
}

export function AdminNotice({ message }: { readonly message: string | null }) {
  return (
    <p className="tx-notice tx-admin-notice" role="status" hidden={message === null}>
      {message}
    </p>
  );
}
