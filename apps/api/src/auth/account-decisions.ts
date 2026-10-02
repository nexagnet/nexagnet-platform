import { defineDecisionVocabulary } from '../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH cua QUAN TRI TAI KHOAN (`#395`) — thuoc nen tang, khong thuoc mien nao.
 *
 * MOT diem quyet dinh: `account.access` — "lan tao / doi quyen / khoa / mo / dat lai mat khau nay
 * co duoc phep khong, va neu khong thi vi sao". Moi duong tu choi mot MA rieng, de mot trace tra loi
 * duoc *"vi sao Giam doc khong khoa duoc tai khoan nay"* ma khong phai mo source.
 *
 * `detail` cua quyet dinh nay chi mang ma tai khoan, vai, ma quyen va con so — KHONG BAO GIO mat
 * khau (ke ca mat khau tam), so dien thoai hay email: lop che telemetry khong biet mot khoa tu dat
 * ten la bi mat.
 *
 * Ma ly do phai DUY NHAT tren moi bo tu vung: `defineDecisionVocabulary` ghi de nhan im lang.
 */
export const ACCOUNT_ACCESS_REASONS = [
  /** Thay doi hop le va da duoc ghi. */
  'ACCOUNT_CHANGE_ALLOWED',
  /** Tu khoa / tu doi vai / tu doi quyen / tu dat lai mat khau cua chinh minh qua duong quan tri. */
  'SELF_LOCKOUT',
  /** Khoa hoac ha vai Giam doc DANG HOAT DONG cuoi cung. */
  'LAST_ACTIVE_ADMIN',
  /** Tai khoan he thong (vd tai khoan van hanh luc trien khai) — khong sua o day. */
  'PROTECTED_SERVICE_ACCOUNT',
  /** Ten dang nhap trung mot danh tinh he thong. */
  'USERNAME_RESERVED',
  /** Doi vai mot tai khoan dang noi voi ho so lai xe. */
  'ACCOUNT_LINKED_TO_DRIVER',
  /** Bo quyen rieng bi mien so huu tu choi (chi tiet trong `detail.violations`). */
  'ACCESS_INVALID',
  /** Leo thang (cap vai Giam doc, hoac mot quyen nhay cam) ma chua xac nhan. */
  'ESCALATION_CONFIRMATION_REQUIRED',
  'ACCOUNT_NOT_FOUND',
  /** Ten dang nhap / email / so dien thoai da thuoc tai khoan khac. */
  'ACCOUNT_IDENTITY_TAKEN',
] as const;
export type AccountAccessReason = (typeof ACCOUNT_ACCESS_REASONS)[number];

export const ACCOUNT_DECISIONS = defineDecisionVocabulary({
  owner: 'platform-accounts',
  points: ['account.access'],
  labels: {
    ACCOUNT_CHANGE_ALLOWED: 'Thay đổi tài khoản hợp lệ và đã được ghi',
    SELF_LOCKOUT: 'Không tự khoá, tự đổi quyền hay tự đặt lại mật khẩu của chính mình ở đây',
    LAST_ACTIVE_ADMIN:
      'Đây là tài khoản quản trị đang hoạt động cuối cùng — không khoá hay hạ vai được',
    PROTECTED_SERVICE_ACCOUNT: 'Tài khoản hệ thống — không sửa ở màn hình quản trị',
    USERNAME_RESERVED: 'Tên đăng nhập này dành cho hệ thống',
    ACCOUNT_LINKED_TO_DRIVER: 'Tài khoản đang nối với hồ sơ lái xe — gỡ nối trước khi đổi vai',
    ACCESS_INVALID: 'Bộ quyền không hợp lệ cho vai này',
    ESCALATION_CONFIRMATION_REQUIRED: 'Cấp quyền nhạy cảm cần xác nhận rõ ràng',
    ACCOUNT_NOT_FOUND: 'Không tìm thấy tài khoản',
    ACCOUNT_IDENTITY_TAKEN: 'Tên đăng nhập, email hoặc số điện thoại đã thuộc tài khoản khác',
  } satisfies Record<AccountAccessReason, string>,
});
