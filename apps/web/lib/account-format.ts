import type { AuthRole, AuthUser, TemporaryCredential } from './auth';

/**
 * CAU CHU dung chung cho moi man quan tri tai khoan (`#395`) — `/settings` (khach van hanh) va
 * "Tài khoản & quyền" (khach van tai). Ham THUAN: mot mat khau tam phai duoc doc ra, dan vao Zalo
 * va dang nhap duoc giong nhau o ca hai noi.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Gio VIET NAM, bat ke trinh duyet de mui gio nao: loi nhan Giam doc gui va man doi mat khau cua lai
 * xe phai noi CUNG mot gio. Xuat ra de bai kiem doc `resolvedOptions().timeZone` — may chay bai
 * kiem o UTC+7 thi so sanh chuoi gio khong phan biet duoc co `timeZone` hay khong.
 */
export const VIETNAM_DATE_TIME = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
});

export function formatDateTime(iso: string | null | undefined): string {
  if (iso == null) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return VIETNAM_DATE_TIME.format(date);
}

/** Chua tung dang nhap (hoac moc hong) — mot cau hoi co kieu, khong so chuoi hien thi. */
export function isNeverLoggedIn(iso: string | null | undefined): boolean {
  return iso == null || Number.isNaN(new Date(iso).getTime());
}

/** "Lần cuối đăng nhập" dang tuong doi — cau nguoi ta noi, khong phai dau thoi gian. */
export function relativeLastLogin(iso: string | null | undefined, now: Date): string {
  if (isNeverLoggedIn(iso)) return 'Chưa đăng nhập';
  const at = new Date(iso as string);
  const elapsed = now.getTime() - at.getTime();
  if (elapsed < MINUTE) return 'Vừa xong';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} phút trước`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} giờ trước`;
  if (elapsed < 2 * DAY) return 'Hôm qua';
  if (elapsed < 30 * DAY) return `${Math.floor(elapsed / DAY)} ngày trước`;
  return formatDateTime(iso);
}

/** `abcdefghjkmnpqrs` → `abcd-efgh-jkmn-pqrs`; chuoi da co gach thi giu nguyen. */
export function formatTemporaryPassword(value: string): string {
  if (value.includes('-')) return value;
  return value.match(/.{1,4}/g)?.join('-') ?? value;
}

/**
 * LOI NHAN de nguoi cap sao chep gui qua Zalo/SMS: du de nguoi nhan tu dang nhap ma khong phai hoi
 * lai — dia chi, ten dang nhap, mat khau tam, han, va viec se xay ra lan dau.
 */
export function credentialMessage(input: {
  readonly productName: string;
  readonly name: string;
  readonly username: string;
  readonly credential: TemporaryCredential;
  readonly loginUrl: string;
}): string {
  return [
    `Chào ${input.name}, đây là tài khoản ${input.productName} của bạn.`,
    `Địa chỉ đăng nhập: ${input.loginUrl}`,
    `Tên đăng nhập: ${input.username}`,
    `Mật khẩu tạm: ${formatTemporaryPassword(input.credential.temporaryPassword)}`,
    `Mật khẩu tạm hết hạn lúc ${formatDateTime(input.credential.expiresAt)}. Lần đầu đăng nhập, hệ thống sẽ yêu cầu bạn đặt mật khẩu riêng.`,
  ].join('\n');
}

/** Dia chi trang dang nhap cua CHINH trang dang mo — loi nhan tro dung may chu nguoi nhan dung. */
export const loginUrlOf = (): string =>
  typeof window === 'undefined' ? '/login' : `${window.location.origin}/login`;

/** So quyen RIENG cua mot tai khoan (`permissionGrants`) — may chu cu khong tra thi 0. */
export const customGrantCount = (user: Pick<AuthUser, 'permissionGrants'>): number =>
  user.permissionGrants?.length ?? 0;

/**
 * Doi vai o `/settings` (`PATCH /settings/users/:id/role`) la duong CU: may chu thay vai VA XOA moi
 * quyen rieng trong cung mot giao dich. Doi vai co quyen rieng — hoac len Quan tri — phai hoi truoc,
 * khong duoc chay thang tu mot o chon.
 */
export function roleChangeNeedsConfirmation(
  user: Pick<AuthUser, 'role' | 'permissionGrants'>,
  role: AuthRole,
): boolean {
  if (role === user.role) return false;
  return role === 'ADMIN' || customGrantCount(user) > 0;
}
