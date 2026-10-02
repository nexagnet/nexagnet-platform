import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  type HttpException,
} from '@nestjs/common';
import { ACCOUNT_ACCESS_REASONS, ACCOUNT_DECISIONS } from './account-decisions.js';

/**
 * THAN LOI cua quan tri tai khoan va dang nhap (`#395`) — cung khuon `transportErrorBody`:
 * `{ statusCode, message, error, reason, detail? }`.
 *
 * `reason` la ma CO KIEU, de man hinh chon cach xu ly (hoi xac nhan leo thang, bao "go noi ho so
 * lai xe truoc"…) thay vi doan tu cau chu. `message` la tieng Viet CO DAU cho nguoi doc. `detail`
 * chi mang ma quyen, ma vi pham va con so — KHONG mat khau, khong so dien thoai.
 */

/** Ma ly do khong phai mot quyet dinh `account.access` (khong co diem telemetry rieng). */
const NON_DECISION_REASONS = [
  /** Than yeu cau sai hinh dang. */
  'ACCOUNT_INPUT_INVALID',
  /** Dung mat khau tam da qua han. */
  'TEMPORARY_PASSWORD_EXPIRED',
  /** Tai khoan dang dung mat khau tam: phai doi truoc khi lam viec khac. */
  'PASSWORD_CHANGE_REQUIRED',
] as const;

/** MOI ma ly do API tai khoan / dang nhap co the tra — man hinh phai co cau cho tung ma. */
export const ACCOUNT_ERROR_REASONS = [
  ...ACCOUNT_ACCESS_REASONS.filter((reason) => reason !== 'ACCOUNT_CHANGE_ALLOWED'),
  ...NON_DECISION_REASONS,
] as const;
export type AccountErrorReason =
  | Exclude<(typeof ACCOUNT_ACCESS_REASONS)[number], 'ACCOUNT_CHANGE_ALLOWED'>
  | (typeof NON_DECISION_REASONS)[number];

export interface AccountErrorBody {
  readonly statusCode: number;
  readonly message: string;
  readonly error: string;
  readonly reason: AccountErrorReason;
  readonly detail?: Readonly<Record<string, unknown>>;
}

type HttpShape = 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT';

/**
 * Ma → loai HTTP. `403` chi cho cong tu choi NGUOI goi (tu khoa minh, chua doi mat khau); moi va
 * cham voi TRANG THAI he thong (Giam doc cuoi cung, tai khoan he thong, lien ket) la `409`.
 */
const SHAPE_OF: Readonly<Record<AccountErrorReason, HttpShape>> = {
  SELF_LOCKOUT: 'FORBIDDEN',
  LAST_ACTIVE_ADMIN: 'CONFLICT',
  PROTECTED_SERVICE_ACCOUNT: 'CONFLICT',
  USERNAME_RESERVED: 'CONFLICT',
  ACCOUNT_LINKED_TO_DRIVER: 'CONFLICT',
  ACCESS_INVALID: 'CONFLICT',
  ESCALATION_CONFIRMATION_REQUIRED: 'CONFLICT',
  ACCOUNT_NOT_FOUND: 'NOT_FOUND',
  ACCOUNT_IDENTITY_TAKEN: 'CONFLICT',
  ACCOUNT_INPUT_INVALID: 'BAD_REQUEST',
  TEMPORARY_PASSWORD_EXPIRED: 'UNAUTHORIZED',
  PASSWORD_CHANGE_REQUIRED: 'FORBIDDEN',
};

const HTTP: Readonly<
  Record<
    HttpShape,
    { status: number; error: string; build: (body: AccountErrorBody) => HttpException }
  >
> = {
  BAD_REQUEST: {
    status: 400,
    error: 'Bad Request',
    build: (body) => new BadRequestException(body),
  },
  UNAUTHORIZED: {
    status: 401,
    error: 'Unauthorized',
    build: (body) => new UnauthorizedException(body),
  },
  FORBIDDEN: { status: 403, error: 'Forbidden', build: (body) => new ForbiddenException(body) },
  NOT_FOUND: { status: 404, error: 'Not Found', build: (body) => new NotFoundException(body) },
  CONFLICT: { status: 409, error: 'Conflict', build: (body) => new ConflictException(body) },
};

/** Cau mac dinh cho ma khong phai quyet dinh; ma quyet dinh dung nhan cua bo tu vung. */
const NON_DECISION_MESSAGES: Readonly<Record<(typeof NON_DECISION_REASONS)[number], string>> = {
  ACCOUNT_INPUT_INVALID: 'Thông tin tài khoản không hợp lệ',
  TEMPORARY_PASSWORD_EXPIRED: 'Mật khẩu tạm đã hết hạn. Nhờ người quản trị cấp mật khẩu mới.',
  PASSWORD_CHANGE_REQUIRED: 'Bạn cần đổi mật khẩu tạm trước khi tiếp tục.',
};

function defaultMessage(reason: AccountErrorReason): string {
  if (reason in NON_DECISION_MESSAGES) {
    return NON_DECISION_MESSAGES[reason as keyof typeof NON_DECISION_MESSAGES];
  }
  return ACCOUNT_DECISIONS.labels[reason as keyof typeof ACCOUNT_DECISIONS.labels];
}

export function accountErrorBody(
  reason: AccountErrorReason,
  options: { readonly message?: string; readonly detail?: Readonly<Record<string, unknown>> } = {},
): AccountErrorBody {
  const shape = HTTP[SHAPE_OF[reason]];
  return {
    statusCode: shape.status,
    message: options.message ?? defaultMessage(reason),
    error: shape.error,
    reason,
    ...(options.detail ? { detail: options.detail } : {}),
  };
}

/** Ngoai le Nest mang than loi co kieu — nem ra la thanh dung than phan hoi. */
export function accountError(
  reason: AccountErrorReason,
  options: { readonly message?: string; readonly detail?: Readonly<Record<string, unknown>> } = {},
): HttpException {
  const body = accountErrorBody(reason, options);
  return HTTP[SHAPE_OF[reason]].build(body);
}

/** Loi sai hinh dang tu zod — chi ten truong va thong diep cua schema, khong gia tri nguoi goi. */
export function accountInputInvalid(
  message: string,
  issues?: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[],
): HttpException {
  return accountError('ACCOUNT_INPUT_INVALID', {
    message,
    ...(issues
      ? {
          detail: {
            issues: issues.map((issue) => ({
              path: issue.path.map((key) => String(key)).join('.'),
              message: issue.message,
            })),
          },
        }
      : {}),
  });
}
