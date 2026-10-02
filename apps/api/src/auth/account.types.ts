import type {
  AccessScopeNote,
  PermissionCatalogView,
  PermissionGrant,
  PermissionKind,
} from './access/permission-domain.js';
import type { PlatformPermission } from './access/platform-permissions.js';
import type { AuthenticatedUser, UserRole } from './auth.types.js';

/**
 * HOP DONG HTTP cua QUAN TRI TAI KHOAN (`#395`, `/settings/users`). Xem
 * `docs/kien-truc/api-http.md` — moi doi o day phai doi o do.
 */

/**
 * Mot tai khoan nhu man hinh quan tri thay. MO RONG `AuthenticatedUser` (khong doi truong nao cu):
 * cac truong `#395` o day BAT BUOC, con o `AuthenticatedUser` chung tuy chon.
 */
export interface AccountView extends AuthenticatedUser {
  readonly mustChangePassword: boolean;
  readonly temporaryPasswordExpiresAt: string | null;
  readonly jobTitle: string | null;
  readonly permissionGrants: PermissionGrant[];
  /** Tai khoan he thong (`PROTECTED_ACCOUNT_USERNAMES`) — khong khoa/doi quyen/dat lai o day. */
  readonly isProtected: boolean;
}

/**
 * Mat khau tam — CHI xuat hien trong MOT phan hoi HTTP (tao / dat lai). Khong bao gio vao so kiem
 * toan, telemetry hay log.
 */
export interface IssuedCredential {
  readonly temporaryPassword: string;
  readonly expiresAt: string;
}

/** Phan hoi tao / dat lai: cac truong tai khoan O MUC NGOAI nhu cu, THEM `credential`. */
export type AccountWithCredential = AccountView & { readonly credential: IssuedCredential };

/** Trang thai cua MOT ma quyen voi MOT tai khoan, cho man hinh "Nguoi nay lam duoc gi?". */
export const ACCESS_ACTION_STATES = [
  /** Co san theo vai khoi diem. */
  'PRESET',
  /** Them bang quyen rieng (ALLOW). */
  'GRANTED',
  /** Vai khoi diem co, nhung da bi bo bot (DENY). */
  'DENIED',
  'NONE',
  /** Chi Giam doc — khong cap duoc cho ai khac. */
  'DIRECTOR_ONLY',
  /** Den tu mot LIEN KET dang hieu luc (ho so lai xe, ben gop von). */
  'SCOPE_ACTIVE',
  /** Vai co, nhung lien ket chua co — chua lam duoc. */
  'SCOPE_INACTIVE',
] as const;
export type AccessActionState = (typeof ACCESS_ACTION_STATES)[number];

export type AccessGroupSummary = 'FULL' | 'PARTIAL' | 'NONE';

export interface AccessActionBreakdown {
  readonly code: string;
  readonly label: string;
  readonly kind: PermissionKind;
  readonly state: AccessActionState;
}

export interface AccessGroupBreakdown {
  /** Mien so huu nhom (vd `transport`). */
  readonly domain: string;
  readonly id: string;
  readonly label: string;
  readonly grantable: boolean;
  readonly actions: readonly AccessActionBreakdown[];
  readonly summary: AccessGroupSummary;
}

export interface PlatformPermissionBreakdown {
  readonly code: PlatformPermission;
  readonly label: string;
  readonly state: 'PRESET' | 'NONE';
}

export interface AccessBreakdown {
  readonly account: AccountView;
  readonly preset: { readonly role: UserRole; readonly label: string };
  readonly grants: readonly PermissionGrant[];
  readonly platform: readonly PlatformPermissionBreakdown[];
  readonly groups: readonly AccessGroupBreakdown[];
  readonly scopes: readonly AccessScopeNote[];
  /** Cau tra loi tieng Viet cho "Nguoi nay lam duoc gi?". */
  readonly sentences: readonly string[];
}

export interface PermissionCatalogResponse {
  readonly domains: readonly ({ readonly id: string } & PermissionCatalogView)[];
  readonly platform: readonly { readonly code: PlatformPermission; readonly label: string }[];
}

export interface AccountHistoryEntry {
  readonly at: string;
  readonly actor: string;
  readonly action: string;
  /** Tieng Viet, cho nguoi doc. */
  readonly summary: string;
  readonly before: unknown;
  readonly after: unknown;
}

export interface CurrentAccessResponse {
  readonly user: AuthenticatedUser;
  readonly roles: readonly UserRole[];
  /** Tap quyen HIEU LUC: quyen nen tang + moi mien. */
  readonly permissions: readonly string[];
}
