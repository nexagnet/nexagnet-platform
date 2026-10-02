'use client';

import { useState } from 'react';
import {
  credentialMessage,
  formatDateTime,
  formatTemporaryPassword,
  loginUrlOf,
} from '../../lib/account-format';
import type { TemporaryCredential } from '../../lib/auth';
import { useBranding } from '../../lib/branding';
import { SettingsActionRow, SettingsWorkCard } from './SettingsFocus';

/**
 * THE MAT KHAU TAM cua `/settings` (`#395`) — cung loi nhan voi man "Tài khoản & quyền" cua khach
 * van tai (`lib/account-format.ts`), khac vo trinh bay.
 *
 * May chu chi tra mat khau tam trong DUNG mot phan hoi (tao / dat lai). Dong the la mat; can lai
 * thi dat lai mat khau. Nen the noi ro "chỉ hiện một lần" va dua san loi nhan de chuyen di.
 */
export function SettingsCredentialCard({
  name,
  username,
  credential,
  onClose,
}: {
  readonly name: string;
  readonly username: string;
  readonly credential: TemporaryCredential;
  readonly onClose: () => void;
}) {
  const branding = useBranding();
  const [copyState, setCopyState] = useState<'IDLE' | 'COPIED' | 'MANUAL'>('IDLE');
  const message = credentialMessage({
    productName: branding.productName,
    name,
    username,
    credential,
    loginUrl: loginUrlOf(),
  });

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(message);
      setCopyState('COPIED');
    } catch {
      setCopyState('MANUAL');
    }
  };

  return (
    <SettingsWorkCard
      eyebrow="Mật khẩu tạm · chỉ hiện một lần"
      title={`Gửi cho ${name} để đăng nhập lần đầu`}
      problem="Lần đầu đăng nhập, người này phải đặt mật khẩu riêng. Đóng thẻ này là không xem lại được."
      tone="ok"
      headingId="settings-users-credential"
      actions={
        <SettingsActionRow
          primary={
            <button
              type="button"
              className="settings-button settings-button--primary"
              onClick={() => void copy()}
            >
              Sao chép lời nhắn
            </button>
          }
          secondary={
            <button
              type="button"
              className="settings-button settings-button--quiet"
              onClick={onClose}
            >
              Đã gửi xong, đóng thẻ
            </button>
          }
        />
      }
    >
      <dl className="settings-focus-status__facts" data-testid="credential-card">
        <div>
          <dt>Tên đăng nhập</dt>
          <dd>{username}</dd>
        </div>
        <div>
          <dt>Mật khẩu tạm</dt>
          <dd data-testid="temporary-password">
            {formatTemporaryPassword(credential.temporaryPassword)}
          </dd>
        </div>
        <div>
          <dt>Hết hạn lúc</dt>
          <dd>{formatDateTime(credential.expiresAt)}</dd>
        </div>
      </dl>
      <label className="settings-focus-choice">
        <span>Lời nhắn để gửi (Zalo, SMS)</span>
        <textarea
          readOnly
          rows={5}
          value={message}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      <p className="settings-muted" role="status">
        {copyState === 'COPIED'
          ? 'Đã sao chép lời nhắn.'
          : copyState === 'MANUAL'
            ? 'Trình duyệt chặn sao chép — chọn ô lời nhắn rồi sao chép tay.'
            : ''}
      </p>
    </SettingsWorkCard>
  );
}
