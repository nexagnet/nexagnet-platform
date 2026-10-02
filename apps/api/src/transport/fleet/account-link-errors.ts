import { TransportDomainError, type TransportErrorKind } from '../transport.errors.js';
import type { AccountLinkErrorReason } from './account-link-decisions.js';

/**
 * CAU CHO NGUOI DUNG cua moi ma tu choi noi tai khoan (`#395`) — tieng Viet co dau, noi viec phai
 * lam tiep, khong ten ma. Dung chung cho ho so lai xe va ho so ben gop von.
 *
 * `Record` day du theo `AccountLinkErrorReason`: them mot ma ma quen cau la loi bien dich.
 */
const MESSAGES: Readonly<Record<AccountLinkErrorReason, string>> = {
  ACCOUNT_LINK_USER_NOT_FOUND: 'Không tìm thấy tài khoản cần nối.',
  ACCOUNT_LINK_USER_DISABLED: 'Tài khoản này đang bị khoá — mở khoá trước khi nối.',
  ACCOUNT_LINK_ROLE_MISMATCH:
    'Chỉ nối được tài khoản có vai Lái xe với hồ sơ lái xe. Đổi vai tài khoản trước, hoặc chọn tài khoản khác.',
  DRIVER_ACCOUNT_TAKEN: 'Tài khoản này đã nối với một hồ sơ lái xe khác — gỡ nối ở hồ sơ cũ trước.',
  ACCOUNT_LINK_DRIVER_INACTIVE: 'Hồ sơ lái xe đã ngừng hoạt động — không nối tài khoản mới vào.',
  ASSET_STAKEHOLDER_ACCOUNT_TAKEN:
    'Tài khoản này đã nối với một hồ sơ bên góp vốn khác — gỡ nối ở hồ sơ cũ trước.',
};

/** Loai loi (→ ma HTTP) cua moi ma: chi "khong tim thay tai khoan" la `404`, con lai la `409`. */
const KINDS: Readonly<Record<AccountLinkErrorReason, TransportErrorKind>> = {
  ACCOUNT_LINK_USER_NOT_FOUND: 'NOT_FOUND',
  ACCOUNT_LINK_USER_DISABLED: 'CONFLICT',
  ACCOUNT_LINK_ROLE_MISMATCH: 'CONFLICT',
  DRIVER_ACCOUNT_TAKEN: 'CONFLICT',
  ACCOUNT_LINK_DRIVER_INACTIVE: 'CONFLICT',
  ASSET_STAKEHOLDER_ACCOUNT_TAKEN: 'CONFLICT',
};

export function accountLinkMessage(reason: AccountLinkErrorReason): string {
  return MESSAGES[reason];
}

export function accountLinkError(reason: AccountLinkErrorReason): TransportDomainError {
  return new TransportDomainError(KINDS[reason], reason, MESSAGES[reason]);
}
