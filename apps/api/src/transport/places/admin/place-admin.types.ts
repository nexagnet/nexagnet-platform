import type { CounterpartyLink } from '../../counterparty/counterparty.types.js';
import type { GeoPoint } from '../../geo/geo-point.js';
import type { DepotSource } from '../../planning/depot-directory.js';
import type { GeofenceSubjectKind } from '../../proof/geofence.repository.js';
import type { PartyStatus } from '../../transport.types.js';

/**
 * DIA DIEM VAN HANH (`#395`) — hop dong cua man "Dia diem van hanh".
 *
 * MOT nguon su that: `TransportGeofence`. Mot dia diem van hanh LA mot hang rao loai `DEPOT` (bai
 * xe cua minh) hoac `COUNTERPARTY_SITE` (cho lam viec cua mot phap nhan — kho cua khach hang, nha
 * may cua doi tac). Hang rao `CUSTOMER` cu van doc / sua / tat duoc, nhung khong tao moi: kho cua
 * mot khach hang la mot dia diem cua PHAP NHAN khach do (`TransportCounterpartyLink` loai
 * `CUSTOMER`), dung nhu du lieu mau da gieo.
 */

/** Ba loai hang rao man nay quan ly. Cay xang va hang rao tam khong phai dia diem van hanh. */
export const MANAGED_PLACE_KINDS = ['DEPOT', 'COUNTERPARTY_SITE', 'CUSTOMER'] as const;
export type ManagedPlaceKind = (typeof MANAGED_PLACE_KINDS)[number];

export const isManagedPlaceKind = (kind: GeofenceSubjectKind): kind is ManagedPlaceKind =>
  (MANAGED_PLACE_KINDS as readonly string[]).includes(kind);

/** Loai HIEN THI — suy tu loai hang rao va lien ket khach hang cua phap nhan so huu. */
export const PLACE_DISPLAY_KINDS = [
  'DEPOT',
  'CUSTOMER_SITE',
  'PARTNER_SITE',
  'LEGACY_CUSTOMER',
] as const;
export type PlaceDisplayKind = (typeof PLACE_DISPLAY_KINDS)[number];

export const PLACE_KIND_LABEL: Readonly<Record<PlaceDisplayKind, string>> = {
  DEPOT: 'Bãi xe',
  CUSTOMER_SITE: 'Địa điểm khách hàng',
  PARTNER_SITE: 'Nhà máy / kho đối tác',
  LEGACY_CUSTOMER: 'Điểm khách hàng (kiểu cũ)',
};

/** Nhan cua hai loai hang rao KHONG quan ly o day — chi dung de noi ten mot va cham. */
export const OTHER_FENCE_KIND_LABEL: Readonly<Record<'FUEL_SUPPLIER' | 'AD_HOC', string>> = {
  FUEL_SUPPLIER: 'Cây xăng',
  AD_HOC: 'Điểm tạm',
};

/**
 * MOT luat cho cau "dia diem phap nhan nay cua KHACH HANG hay cua DOI TAC?" (`#395` §2.1): phap nhan
 * so huu co lien ket `CUSTOMER` (`TransportCounterpartyLink`) thi la khach hang. Man "Dia diem van
 * hanh", luat trung ten, chu cua dia diem moi va Tao don (`known-places.ts`) deu hoi hai ham nay —
 * khong noi nao tu dem lai lien ket theo cach rieng.
 */
export const customerLinkOf = <T extends Pick<CounterpartyLink, 'kind'>>(
  links: readonly T[],
): T | null => links.find((link) => link.kind === 'CUSTOMER') ?? null;

export const isCustomerLinked = (links: readonly Pick<CounterpartyLink, 'kind'>[]): boolean =>
  customerLinkOf(links) !== null;

export function displayKindOf(kind: ManagedPlaceKind, customerLinked: boolean): PlaceDisplayKind {
  if (kind === 'DEPOT') return 'DEPOT';
  if (kind === 'CUSTOMER') return 'LEGACY_CUSTOMER';
  return customerLinked ? 'CUSTOMER_SITE' : 'PARTNER_SITE';
}

export function fenceKindLabel(kind: GeofenceSubjectKind, customerLinked: boolean): string {
  if (kind === 'FUEL_SUPPLIER' || kind === 'AD_HOC') return OTHER_FENCE_KIND_LABEL[kind];
  return PLACE_KIND_LABEL[displayKindOf(kind, customerLinked)];
}

/**
 * Khau lap ke hoach dang dung bai nay the nao — doc tu CHINH danh ba bai xe va `resolveDepotFrom()`
 * ma khau lap ke hoach dung, khong tu mot phep tinh rieng.
 *
 *   · `IN_USE`     — bai duoc dung lam diem dau chang rong va diem dong vong chay;
 *   · `STANDBY`    — bai du phong (dang tat);
 *   · `AMBIGUOUS`  — nhieu bai cung bat: he thong khong dung bai nao;
 *   · `NOT_IN_USE` — bai dang bat nhung khau lap ke hoach khong doc no (vd nguon la cau hinh).
 */
export type DepotPlannerStatus = 'IN_USE' | 'STANDBY' | 'AMBIGUOUS' | 'NOT_IN_USE';

export type PlaceEffectiveStatus = 'ACTIVE' | 'INACTIVE' | 'OWNER_INACTIVE';

export interface PlaceOwnerView {
  /** NULL chi voi hang rao `CUSTOMER` cu ma khach chua noi vao phap nhan nao. */
  readonly counterpartyId: string | null;
  readonly counterpartyName: string | null;
  readonly customerId?: string;
  readonly customerName?: string;
  /** NULL voi hang rao `CUSTOMER` cu — no khong tro vao mot dia diem phap nhan. */
  readonly siteId: string | null;
  readonly siteName: string | null;
}

export interface PlaceDepotView {
  readonly code: string;
  readonly plannerStatus: DepotPlannerStatus;
  readonly source: DepotSource;
}

export interface PlaceAdminView {
  /** `TransportGeofence.id`. */
  readonly id: string;
  readonly kind: ManagedPlaceKind;
  readonly displayKind: PlaceDisplayKind;
  readonly kindLabel: string;
  readonly name: string;
  readonly address: string | null;
  readonly point: GeoPoint;
  readonly radiusMetres: number;
  readonly status: PartyStatus;
  readonly effectiveStatus: PlaceEffectiveStatus;
  readonly note: string | null;
  readonly owner: PlaceOwnerView | null;
  readonly depot: PlaceDepotView | null;
  /** Ten dia diem DANG HOAT DONG khac trung ten (sau chuan hoa) voi dia diem nay. */
  readonly conflicts: readonly string[];
  readonly updatedAt: string;
}

export type PlaceStatusFilter = 'active' | 'inactive' | 'all';

export interface PlaceListQuery {
  readonly kind?: PlaceDisplayKind;
  readonly status?: PlaceStatusFilter;
  readonly q?: string;
}

/** Chu cua mot dia diem MOI cua don vi khac — dung MOT trong ba cach. */
export type PlaceOwnerInput =
  | { readonly counterpartyId: string }
  | { readonly customerId: string }
  | { readonly newCounterparty: { readonly name: string; readonly taxCode?: string | null } };

export interface CreatePlaceCommand {
  readonly kind: 'DEPOT' | 'COUNTERPARTY_SITE';
  readonly name: string;
  readonly address?: string | null;
  readonly point: GeoPoint;
  readonly radiusMetres: number;
  readonly note?: string | null;
  readonly owner?: PlaceOwnerInput;
  /** Gan hang rao vao mot dia diem CO SAN chua co hang rao. */
  readonly siteId?: string;
}

export interface UpdatePlaceCommand {
  readonly name?: string;
  readonly address?: string | null;
  readonly point?: GeoPoint;
  readonly radiusMetres?: number;
  readonly note?: string | null;
  readonly acknowledgeOpenWork?: boolean;
}

export interface DeactivatePlaceCommand {
  readonly reason: string;
  readonly acknowledgeOpenWork?: boolean;
}

export interface MakePrimaryDepotCommand {
  readonly acknowledgeOpenWork?: boolean;
}

/**
 * NGUOI GOI — dieu may chu da biet ve quyen cua ho, tinh o controller tu phien (`#395`).
 *
 * `canManageCounterparties` = co `transport.counterparty.manage`: dia diem cua don vi khac la mot
 * mat cua ho so phap nhan, nen tao / doi ten / bat / tat no doi CA quyen do lan quyen hang rao.
 */
export interface PlaceWriteCaller {
  readonly actor: string;
  readonly canManageCounterparties: boolean;
}

export interface PlaceHistoryEntry {
  readonly at: string;
  readonly actor: string;
  readonly action: string;
  readonly entityType: string;
  readonly before: unknown;
  readonly after: unknown;
}
