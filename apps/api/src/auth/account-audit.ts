import type { AuditLog } from '@netviet/shared';
import type { AppendAuditLogCommand } from '../audit/audit-log.service.js';
import type { AccountHistoryEntry } from './account.types.js';
import { sortGrants, type AuthUserRecord } from './user.repository.js';

/**
 * NOI DUNG SO KIEM TOAN cua tai khoan (`#395`) — ham THUAN.
 *
 * TEN KHOA DUOC CHON DE SONG QUA LOP CHE. `AuditLogService` cho `before`/`after` qua
 * `redactAuditValue`, va telemetry qua `sanitizeTelemetry`: khoa nao KET THUC bang `password`,
 * `phone`, `address`, `token`, `credential`… bi thay bang `[REDACTED]` o CA HAI phia. Nen:
 *   · `onboarding.passwordChangeRequired` (khong phai `mustChangePassword` — ket thuc bang
 *     `password`, se thanh `[REDACTED]` → `[REDACTED]` va khong ai thay duoc buoc chuyen);
 *   · `onboarding.temporaryCredentialExpiresAt`;
 *   · `profile.emailOnFile` / `profile.phoneOnFile` (khong phai `hasPhone` — ket thuc bang `phone`);
 *     so kiem toan chi can biet CO hay KHONG, khong can chinh so dien thoai.
 * `auth-audit-redaction.spec.ts` dua moi payload qua ca hai lop che va khoa dieu do.
 *
 * MAT KHAU TAM KHONG BAO GIO o day — no chi co trong MOT phan hoi HTTP.
 */

/** MOT dong kiem toan cua tai khoan `id` — `before`/`after` di qua lop che o `AuditLogService`. */
export function userAuditEntry(
  actor: { readonly username: string },
  action: string,
  id: string,
  change: { readonly before?: unknown; readonly after?: unknown },
): AppendAuditLogCommand {
  return { actor: actor.username, action, entityType: 'User', entityId: id, ...change };
}

export interface AccessSnapshot {
  readonly role: string;
  readonly grants: readonly { readonly permission: string; readonly effect: string }[];
}

export function accessSnapshot(record: AuthUserRecord): AccessSnapshot {
  return { role: record.role, grants: sortGrants(record.permissionGrants ?? []) };
}

export function onboardingSnapshot(record: AuthUserRecord): {
  readonly onboarding: {
    readonly passwordChangeRequired: boolean;
    readonly temporaryCredentialExpiresAt: string | null;
  };
} {
  return {
    onboarding: {
      passwordChangeRequired: record.mustChangePassword === true,
      temporaryCredentialExpiresAt: record.temporaryPasswordExpiresAt?.toISOString() ?? null,
    },
  };
}

export function profileSnapshot(record: AuthUserRecord): {
  readonly profile: {
    readonly name: string;
    readonly jobTitle: string | null;
    readonly emailOnFile: boolean;
    readonly phoneOnFile: boolean;
  };
} {
  return {
    profile: {
      name: record.name,
      jobTitle: record.jobTitle ?? null,
      emailOnFile: record.email !== null,
      phoneOnFile: record.phone !== null,
    },
  };
}

/**
 * Dong `auth.user.profile.update` — `null` khi KHONG gi doi (gui lai dung gia tri cu khong phai mot
 * lan sua, nhu khoa / mo khoa lap lai).
 *
 * `emailOnFile`/`phoneOnFile` khong phan biet "doi so nay sang so khac" voi "khong doi", nen `after`
 * ghi them CO DOI: `emailChanged`, `contactNumberChanged` (khong phai kieu `changedPhone` — ten ket
 * thuc bang `phone` bi che). Chi co, khong bao gio gia tri.
 */
export function profileChangeAudit(
  before: AuthUserRecord,
  after: AuthUserRecord,
): { readonly before: unknown; readonly after: unknown } | null {
  const emailChanged = before.email !== after.email;
  const contactNumberChanged = before.phone !== after.phone;
  const changed =
    emailChanged ||
    contactNumberChanged ||
    before.name !== after.name ||
    (before.jobTitle ?? null) !== (after.jobTitle ?? null);
  if (!changed) return null;
  return {
    before: profileSnapshot(before),
    after: { ...profileSnapshot(after), emailChanged, contactNumberChanged },
  };
}

export function statusSnapshot(record: AuthUserRecord): { readonly disabledAt: string | null } {
  return { disabledAt: record.disabledAt?.toISOString() ?? null };
}

/** Anh day du cua mot tai khoan — cho dong `auth.user.create`. */
export function accountSnapshot(record: AuthUserRecord): Record<string, unknown> {
  return {
    username: record.username,
    ...accessSnapshot(record),
    ...profileSnapshot(record),
    ...statusSnapshot(record),
    ...onboardingSnapshot(record),
  };
}

/* ------------------------------------------------------------------ *
 * LICH SU cho man hinh
 * ------------------------------------------------------------------ */

const HISTORY_SUMMARY: Readonly<Record<string, string>> = {
  'auth.login': 'Đăng nhập',
  'auth.logout': 'Đăng xuất',
  'auth.user.create': 'Tạo tài khoản',
  'auth.user.profile.update': 'Sửa thông tin tài khoản',
  'auth.user.access.change': 'Đổi vai trò hoặc quyền',
  'auth.user.access.escalate': 'Cấp quyền nhạy cảm (đã xác nhận)',
  'auth.user.role.assign': 'Đổi vai trò',
  'auth.user.disable': 'Khoá tài khoản',
  'auth.user.enable': 'Mở khoá tài khoản',
  'auth.credentials.reset': 'Cấp mật khẩu tạm mới',
  'auth.credentials.change': 'Tự đổi mật khẩu',
};

export function historySummary(action: string): string {
  return HISTORY_SUMMARY[action] ?? 'Thay đổi khác';
}

export function toHistoryEntry(row: AuditLog): AccountHistoryEntry {
  return {
    at: row.createdAt,
    actor: row.actor,
    action: row.action,
    summary: historySummary(row.action),
    before: row.before,
    after: row.after,
  };
}
