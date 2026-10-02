'use client';

import type { ReactNode } from 'react';
import { ConfirmAction } from '../components/SectionState';
import type { OpenWorkDetail } from './admin-types';
import { openWorkLabel } from './places-model';

/**
 * VIEC DANG MO DUNG BAI XE NAY (`409 DEPOT_CHANGE_AFFECTS_OPEN_WORK`, `#395` §2.2).
 *
 * Doi ten, tat hay doi bai chinh khi con vong xe / don dang chay la hop le — nhung khong duoc lang
 * le: khau lap ke hoach nhan ra chang rong va "xe da ve bai" bang ten bai. Man hinh liet ke TUNG
 * vong xe, don bi anh huong va chi gui lai kem `acknowledgeOpenWork` sau khi nguoi dung xac nhan;
 * danh sach do duoc ghi vao lich su cua dia diem.
 */
export function OpenWorkDialog({
  detail,
  confirmLabel,
  isBusy,
  error,
  onConfirm,
  onCancel,
}: {
  readonly detail: OpenWorkDetail | null;
  readonly confirmLabel: string;
  readonly isBusy: boolean;
  /** Loi cua lan gui lai kem xac nhan — hien TRONG hop thoai (xem `ConfirmAction.error`). */
  readonly error?: ReactNode;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <ConfirmAction
      open={detail !== null}
      title="Còn việc đang mở dùng bãi xe này"
      detail="Các vòng xe và đơn dưới đây đang lấy bãi xe này làm điểm đi hoặc điểm về. Sau thay đổi, hệ thống lập chặng rỗng và đóng vòng chạy theo bãi mới; danh sách này được ghi vào lịch sử."
      confirmLabel={confirmLabel}
      isBusy={isBusy}
      error={error}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      {detail === null ? null : (
        <div className="tx-admin-openwork" data-testid="open-work">
          {detail.runs.length === 0 ? null : (
            <p>
              <strong>{detail.runs.length} vòng xe:</strong>{' '}
              {detail.runs.map(openWorkLabel).join(', ')}
            </p>
          )}
          {detail.orders.length === 0 ? null : (
            <p>
              <strong>{detail.orders.length} đơn:</strong>{' '}
              {detail.orders.map(openWorkLabel).join(', ')}
            </p>
          )}
          {detail.idleHours == null ? null : (
            <p className="tx-note">
              Vòng chạy tự đóng sau {detail.idleHours} giờ xe đứng yên ở bãi.
            </p>
          )}
        </div>
      )}
    </ConfirmAction>
  );
}
