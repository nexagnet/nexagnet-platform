import type { AuthRole, AuthUser, TemporaryCredential } from '../../../lib/auth';
import type { GeoPoint } from '../transport-types';

/**
 * HOP DONG DU LIEU cua khu QUAN TRI (`#395`) — ban chep phia man hinh cua §1.7, §1.8, §2.2 trong
 * thiet ke. May chu la noi DUY NHAT tinh quyen; man hinh chi ve lai cau tra loi cua no.
 *
 * Moi truong ma may chu cu co the chua tra deu TUY CHON o day, de man hinh khong vo khi chay tren
 * mot ban API cham hon mot nhip.
 */

/* ------------------------------------------------------------------ *
 * Tai khoan
 * ------------------------------------------------------------------ */

export type PermissionEffect = 'ALLOW' | 'DENY';

export interface PermissionGrant {
  readonly permission: string;
  readonly effect: PermissionEffect;
}

export interface AccountView extends AuthUser {
  readonly createdAt?: string;
  readonly lastLoginAt?: string | null;
  readonly mustChangePassword?: boolean;
  readonly temporaryPasswordExpiresAt?: string | null;
  readonly jobTitle?: string | null;
  readonly permissionGrants?: readonly PermissionGrant[];
  /** Tai khoan he thong (vd tai khoan van hanh luc trien khai) — khong sua duoc o day. */
  readonly isProtected?: boolean;
}

export type AccountWithCredential = AccountView & { readonly credential?: TemporaryCredential };

export type AccountStatusFilter = 'active' | 'pending' | 'disabled';

export type PermissionKind = 'XEM' | 'THAO_TAC' | 'DUYET' | 'NHAY_CAM';

export interface CatalogAction {
  readonly code: string;
  readonly label: string;
  readonly kind: PermissionKind;
  readonly directorOnly: boolean;
  readonly escalation: boolean;
  readonly sod: 'DECISION' | 'EVIDENCE' | null;
}

export interface CatalogGroup {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  /** `false` = nhom den tu LIEN KET ho so (lai xe, ben gop von) — khong bat tat bang o danh dau. */
  readonly grantable: boolean;
  readonly actions: readonly CatalogAction[];
  /**
   * QUYEN KEM THEO DE DUNG DUOC (`#395`) — phep XEM cua NHOM KHAC ma man hinh cua nhom nay can (vd
   * nhom "Quỹ lái xe / lương" can "Xem hồ sơ lái xe" de chon lai xe). Trinh chinh quyen bat kem khi
   * Giam doc bat nhom, va ghi ro "Kèm theo để dùng được …". May chu cu khong tra = khong kem gi.
   */
  readonly needs?: readonly string[];
}

export interface CatalogPreset {
  readonly role: AuthRole;
  readonly label: string;
  readonly summary: string;
}

export interface PermissionCatalog {
  readonly domains: readonly {
    readonly id: string;
    readonly groups: readonly CatalogGroup[];
    readonly presets: readonly CatalogPreset[];
  }[];
  readonly platform: readonly { readonly code: string; readonly label: string }[];
}

export type ActionState =
  'PRESET' | 'GRANTED' | 'DENIED' | 'NONE' | 'DIRECTOR_ONLY' | 'SCOPE_ACTIVE' | 'SCOPE_INACTIVE';

export interface AccessScopeNote {
  readonly id: string;
  readonly label: string;
  readonly active: boolean;
  readonly sentence: string;
  readonly subject?: { readonly id: string; readonly name: string } | null;
}

export interface AccessBreakdown {
  readonly account?: AccountView;
  readonly preset: { readonly role: AuthRole; readonly label: string };
  readonly grants: readonly PermissionGrant[];
  /** Quyen NEN TANG (vd quan tri tai khoan) — chi Giam doc co. */
  readonly platform?: readonly {
    readonly code: string;
    readonly label: string;
    readonly state: 'PRESET' | 'NONE';
  }[];
  readonly groups: readonly {
    readonly domain?: string;
    readonly id: string;
    readonly label: string;
    readonly grantable: boolean;
    readonly actions: readonly {
      readonly code: string;
      readonly label: string;
      readonly kind: PermissionKind;
      readonly state: ActionState;
    }[];
    readonly summary: 'FULL' | 'PARTIAL' | 'NONE';
  }[];
  readonly scopes: readonly AccessScopeNote[];
  /** Cau tieng Viet tra loi "Người này làm được gì?" — do MAY CHU viet. */
  readonly sentences: readonly string[];
}

export interface AccessViolation {
  readonly code: string;
  readonly permission?: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

export interface AccessChangeInput {
  readonly role: AuthRole;
  readonly grants: readonly PermissionGrant[];
  readonly confirmEscalation?: boolean;
}

export interface AccountHistoryEntry {
  readonly at: string;
  readonly actor: string;
  readonly action: string;
  readonly summary: string;
  readonly before?: unknown;
  readonly after?: unknown;
}

export interface AccountLinks {
  readonly driver: {
    readonly id: string;
    readonly name: string;
    readonly phone?: string | null;
    readonly status?: string;
    /** Xe lai xe nay DANG phu trach (ban phan cong con hieu luc), neu co. */
    readonly vehicle?: { readonly id: string; readonly registrationPlate: string } | null;
  } | null;
  readonly stakeholder: { readonly id: string; readonly name: string } | null;
}

export interface ProfilePatch {
  readonly name?: string;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly jobTitle?: string | null;
}

/* ------------------------------------------------------------------ *
 * Dia diem van hanh
 * ------------------------------------------------------------------ */

export type PlaceKind = 'DEPOT' | 'COUNTERPARTY_SITE' | 'CUSTOMER';

/** Bo loc loai cua danh sach — CHU cua man hinh, khong phai ten bang trong DB. */
export type PlaceKindFilter =
  'ALL' | 'DEPOT' | 'CUSTOMER_SITE' | 'PARTNER_SITE' | 'LEGACY_CUSTOMER';

export type PlaceStatusFilter = 'active' | 'inactive' | 'all';

export type DepotPlannerStatus = 'IN_USE' | 'STANDBY' | 'AMBIGUOUS' | 'NOT_IN_USE';

/**
 * Chu cua mot dia diem. `counterpartyId`/`siteId` la `null` CHI voi hang rao `CUSTOMER` kieu cu ma
 * khach chua noi vao phap nhan nao — no tro thang vao khach hang, khong vao mot dia diem phap nhan.
 */
export interface PlaceOwner {
  readonly counterpartyId: string | null;
  readonly counterpartyName: string | null;
  readonly customerId?: string | null;
  readonly customerName?: string | null;
  readonly siteId: string | null;
  readonly siteName: string | null;
}

export interface PlaceAdminView {
  readonly id: string;
  readonly kind: PlaceKind;
  /**
   * Loai HIEN THI do may chu suy (phap nhan co mat khach hang hay khong). TUY CHON: thieu thi man
   * hinh suy tu `kind` + `owner.customerId`.
   */
  readonly displayKind?: Exclude<PlaceKindFilter, 'ALL'>;
  readonly kindLabel: string;
  readonly name: string;
  readonly address: string | null;
  readonly point: GeoPoint;
  readonly radiusMetres: number;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly effectiveStatus: 'ACTIVE' | 'INACTIVE' | 'OWNER_INACTIVE';
  readonly note: string | null;
  readonly owner: PlaceOwner | null;
  readonly depot: {
    readonly code: string;
    readonly plannerStatus: DepotPlannerStatus;
    readonly source?: string | null;
  } | null;
  /** Ten trung voi mot dia diem dang hieu luc khac (du lieu cu) — man hinh canh bao. */
  readonly conflicts: readonly string[];
  readonly updatedAt: string;
}

export type PlaceOwnerInput =
  | { readonly counterpartyId: string }
  | { readonly customerId: string }
  | { readonly newCounterparty: { readonly name: string; readonly taxCode?: string | null } };

export interface CreatePlaceInput {
  readonly kind: 'DEPOT' | 'COUNTERPARTY_SITE';
  readonly name: string;
  readonly address?: string | null;
  readonly point: GeoPoint;
  readonly radiusMetres: number;
  readonly note?: string | null;
  readonly owner?: PlaceOwnerInput;
}

export interface UpdatePlaceInput {
  readonly name?: string;
  readonly address?: string | null;
  readonly point?: GeoPoint;
  readonly radiusMetres?: number;
  readonly note?: string | null;
  readonly acknowledgeOpenWork?: boolean;
}

export interface PlaceHistoryEntry {
  readonly at: string;
  readonly actor: string;
  readonly action: string;
  /** `TransportGeofence` (dia diem) hoac `TransportCounterpartySite` (dia diem cua phap nhan). */
  readonly entityType?: string;
  readonly summary?: string | null;
  readonly before?: unknown;
  readonly after?: unknown;
}

/** `detail` cua `409 DEPOT_CHANGE_AFFECTS_OPEN_WORK`. */
export interface OpenWorkDetail {
  readonly runs: readonly { readonly id: string; readonly code?: string | null }[];
  readonly orders: readonly { readonly id: string; readonly code?: string | null }[];
  readonly idleHours?: number | null;
}

export interface CounterpartyOption {
  readonly id: string;
  readonly name: string;
  readonly taxCode: string | null;
  readonly status: 'ACTIVE' | 'INACTIVE';
}
