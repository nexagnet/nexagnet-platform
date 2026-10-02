'use client';

import { useState, type FormEvent } from 'react';
import { useBranding } from '../../lib/branding';
import { authApi } from '../../lib/auth';
import { useAuth } from '../../components/auth/AuthGate';

export default function LoginPage() {
  const branding = useBranding();
  const auth = useAuth();
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await authApi.login(String(form.get('username') ?? ''), String(form.get('password') ?? ''));
      await auth.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể đăng nhập');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main className="login-shell">
      <section className="login-brief" aria-labelledby="login-title">
        {/*
          MAN HINH NAY DUNG CHUNG cho MOI khach, nen chu tren no phai dung voi moi khach.
          Ban truoc noi "xu ly don, duyet chien dich va thay doi nguon su that" va liet ke vai
          "Sale" — ba danh tu cua mien BAN HANG cong mot ten vai NOI BO. Mot doanh nghiep van tai
          mo trang dang nhap va doc thay minh sap di duyet chien dich; do la man hinh DAU TIEN ho
          nhin thay. Chu o day vi the chi noi ve DANH TINH va TRACH NHIEM — dung cho ban hang, van
          tai va bat ky mien nao sau nay — con ten san pham thi lay tu goi khach.
        */}
        <p className="login-kicker">{branding.productName}</p>
        <h1 id="login-title">Mỗi thao tác quan trọng đều có người chịu trách nhiệm.</h1>
        <p>
          Đăng nhập để làm việc trên hệ thống theo đúng vai trò được giao. Mọi thay đổi đều ghi lại
          người thực hiện.
        </p>
        <dl>
          <div>
            <dt>Phiên</dt>
            <dd>Cookie bảo mật · tự hết hạn</dd>
          </div>
          <div>
            <dt>Thay đổi</dt>
            <dd>Ghi nhật ký theo tài khoản</dd>
          </div>
          <div>
            <dt>Quyền</dt>
            <dd>Theo vai trò được cấp</dd>
          </div>
        </dl>
      </section>
      <section className="login-card" aria-label="Đăng nhập">
        <span className="login-card__mark">{branding.shortName.slice(0, 2).toUpperCase()}</span>
        <p className="login-kicker">XÁC NHẬN DANH TÍNH</p>
        <h2>Vào ca làm việc</h2>
        {/* `#395` — phien vua bi ket thuc tu phia may chu: noi VI SAO, khong de nguoi dung doan. */}
        {auth.notice === null ? null : (
          <p className="login-notice" role="status">
            {auth.notice}
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <label htmlFor="username">Tên đăng nhập</label>
          <input id="username" name="username" autoComplete="username" required minLength={3} />
          <label htmlFor="password">Mật khẩu</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={isBusy}>
            {isBusy ? 'Đang xác minh…' : 'Bắt đầu ca làm việc'}
          </button>
        </form>
        <small>Không có tài khoản? Liên hệ quản trị viên nội bộ để được cấp quyền.</small>
      </section>
    </main>
  );
}
