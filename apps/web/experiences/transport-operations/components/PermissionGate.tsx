'use client';

import type { ReactNode } from 'react';
import { missingActions, notPermittedSentence } from '../permission-notes';
import { canPerform, type TransportAction, type TransportViewerInput } from '../transport-actions';

/**
 * PHAN PHU CUA MOT MUC chi hien khi nguoi xem giu quyen cua no (`#395`).
 *
 * Query cua phan do da bi chan o `enabled` (khong ban mot yeu cau chac chan `403`). Component nay lo
 * nua con lai: THAY cho mot o trong ("Chưa có …") la mot cau nghiep vu noi dung ly do. Thuoc tinh
 * `action` la chu ky ma `section-access.spec.ts` doc de biet phan ve DA xu ly truong hop thieu quyen.
 */
export function PermissionGate({
  viewer,
  action,
  children,
}: {
  readonly viewer: TransportViewerInput;
  readonly action: TransportAction;
  readonly children?: ReactNode;
}) {
  if (canPerform(viewer, action)) return <>{children}</>;
  return (
    <p className="tx-note tx-note--permission" role="note">
      {notPermittedSentence([action])}
    </p>
  );
}

/**
 * MOT cau cho nhieu phan phu cung luc — vd danh ba ten (khach, xe, lai xe) cua mot bang. Khong thieu
 * gi thi khong ve gi.
 */
export function PermissionNote({
  viewer,
  actions,
}: {
  readonly viewer: TransportViewerInput;
  readonly actions: readonly TransportAction[];
}) {
  const sentence = notPermittedSentence(missingActions(viewer, actions));
  return sentence === null ? null : (
    <p className="tx-note tx-note--permission" role="note">
      {sentence}
    </p>
  );
}
