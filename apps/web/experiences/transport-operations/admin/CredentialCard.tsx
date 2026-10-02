'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { TemporaryCredential } from '../../../lib/auth';
import { useBranding } from '../../../lib/branding';
import { loginUrlOf } from '../../../lib/account-format';
import { credentialMessage, formatDateTime, formatTemporaryPassword } from './accounts-model';

/**
 * THE MAT KHAU TAM (`#395`) — hien DUNG MOT LAN, ngay sau khi tao tai khoan hoac dat lai mat khau.
 *
 * May chu chi tra mat khau tam trong mot phan hoi; no khong nam trong danh sach, lich su hay nhat ky.
 * Nen the nay noi ro "chỉ hiện một lần" va dua san mot LOI NHAN du de nguoi nhan tu dang nhap —
 * Giam doc sao chep, dan vao Zalo, xong. Dong the la mat; can lai thi dat lai mat khau.
 */
export function CredentialCard({
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
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [copyState, setCopyState] = useState<'IDLE' | 'COPIED' | 'MANUAL'>('IDLE');
  const message = credentialMessage({
    productName: branding.productName,
    name,
    username,
    credential,
    loginUrl: loginUrlOf(),
  });

  // The vua hien la cau tra loi cho lan bam vua roi — tieu diem vao day, khong roi ve <body>.
  useEffect(() => heading.current?.focus(), []);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(message);
      setCopyState('COPIED');
    } catch {
      // Trinh duyet chan clipboard (http, quyen): de nguoi dung tu chon o loi nhan ben duoi.
      setCopyState('MANUAL');
    }
  };

  return (
    <section
      className="tx-admin-credential"
      aria-labelledby={titleId}
      data-testid="credential-card"
    >
      <header className="tx-admin-credential__head">
        <p className="tx-admin-eyebrow">Mật khẩu tạm · chỉ hiện một lần</p>
        <h2 id={titleId} ref={heading} tabIndex={-1}>
          Gửi cho {name} để đăng nhập lần đầu
        </h2>
      </header>
      <dl className="tx-admin-credential__facts">
        <div>
          <dt>Tên đăng nhập</dt>
          <dd className="tx-admin-mono">{username}</dd>
        </div>
        <div>
          <dt>Mật khẩu tạm</dt>
          <dd
            className="tx-admin-mono tx-admin-credential__secret"
            data-testid="temporary-password"
          >
            {formatTemporaryPassword(credential.temporaryPassword)}
          </dd>
        </div>
        <div>
          <dt>Hết hạn lúc</dt>
          <dd>{formatDateTime(credential.expiresAt)}</dd>
        </div>
      </dl>
      <p className="tx-note">
        Lần đầu đăng nhập, người này phải đặt mật khẩu riêng. Đóng thẻ này là không xem lại được —
        cần lại thì dùng “Đặt lại mật khẩu”.
      </p>
      <label className="tx-field tx-admin-credential__message">
        <span>Lời nhắn để gửi (Zalo, SMS)</span>
        <textarea
          readOnly
          rows={5}
          value={message}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      <div className="tx-admin-actions">
        <button type="button" className="tx-btn tx-btn--go" onClick={() => void copy()}>
          Sao chép lời nhắn
        </button>
        <button type="button" className="tx-btn tx-btn--ghost" onClick={onClose}>
          Đã gửi xong, đóng thẻ
        </button>
        <span className="tx-admin-actions__status" role="status">
          {copyState === 'COPIED'
            ? 'Đã sao chép lời nhắn.'
            : copyState === 'MANUAL'
              ? 'Trình duyệt chặn sao chép — chọn ô lời nhắn rồi sao chép tay.'
              : ''}
        </span>
      </div>
    </section>
  );
}
