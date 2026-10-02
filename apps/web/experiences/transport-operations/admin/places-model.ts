import type { StatusTone } from '../customer-view';
import type { GeoPoint } from '../transport-types';
import type { MapBounds } from '../visual/map-camera';
import {
  boundsOfPoints,
  VIETNAM_PICKER_BOUNDS,
  type PickerMarker,
} from '../workspace/place-lookup';
import { foldText, withAuditReason } from './accounts-model';
import type {
  CreatePlaceInput,
  DepotPlannerStatus,
  PlaceAdminView,
  PlaceKindFilter,
  PlaceStatusFilter,
  UpdatePlaceInput,
} from './admin-types';

/**
 * MO HINH MAN "Địa điểm vận hành" (`#395`) — ham THUAN.
 *
 * MOT nguon cho moi noi dung dia diem: hang rao (`TransportGeofence`). Bai xe o day la CHINH bai xe
 * ma khau lap ke hoach dung cho chang rong va dong vong chay; nha may/kho o day la CHINH diem ma man
 * Tao don goi y. Nen cau chu tren man nay noi HAU QUA cua mot thay doi, khong chi noi thay doi.
 */

/* ------------------------------------------------------------------ *
 * Loai dia diem — chu cua man hinh (§2.1)
 * ------------------------------------------------------------------ */

export const PLACE_KIND_FILTER_LABEL: Readonly<Record<PlaceKindFilter, string>> = {
  ALL: 'Tất cả',
  DEPOT: 'Bãi xe',
  CUSTOMER_SITE: 'Địa điểm khách hàng',
  PARTNER_SITE: 'Nhà máy / kho đối tác',
  LEGACY_CUSTOMER: 'Điểm khách hàng (kiểu cũ)',
};

export const placeKindFilterOf = (place: PlaceAdminView): Exclude<PlaceKindFilter, 'ALL'> => {
  // May chu biet phap nhan co mat khach hang hay khong — uu tien cau tra loi cua no.
  if (place.displayKind !== undefined) return place.displayKind;
  if (place.kind === 'DEPOT') return 'DEPOT';
  if (place.kind === 'CUSTOMER') return 'LEGACY_CUSTOMER';
  return place.owner?.customerId != null ? 'CUSTOMER_SITE' : 'PARTNER_SITE';
};

/** Nhan loai: uu tien nhan MAY CHU tinh (no biet phap nhan co mat khach hang khong). */
export const placeKindLabel = (place: PlaceAdminView): string =>
  place.kindLabel.trim().length > 0
    ? place.kindLabel
    : PLACE_KIND_FILTER_LABEL[placeKindFilterOf(place)];

/** Chu cua dia diem, mot dong: khach hang (phap nhan) hoac don vi. Bai xe = cong ty minh. */
export function placeOwnerLine(place: PlaceAdminView): string {
  if (place.kind === 'DEPOT') return 'Bãi xe của công ty';
  const owner = place.owner;
  if (owner === null) return 'Chưa rõ chủ địa điểm';
  const legal = owner.counterpartyName?.trim() ?? '';
  if (owner.customerName != null && owner.customerName.trim().length > 0) {
    return legal.length === 0 || owner.customerName === legal
      ? `Khách hàng ${owner.customerName}`
      : `Khách hàng ${owner.customerName} (${legal})`;
  }
  return legal.length === 0 ? 'Chưa rõ chủ địa điểm' : legal;
}

export type PlaceEffectiveStatus = PlaceAdminView['effectiveStatus'];

export const PLACE_STATUS_LABEL: Readonly<Record<PlaceEffectiveStatus, string>> = {
  ACTIVE: 'Đang dùng',
  INACTIVE: 'Đã tắt',
  OWNER_INACTIVE: 'Chủ đã ngừng hoạt động',
};

export const PLACE_STATUS_TONE: Readonly<Record<PlaceEffectiveStatus, StatusTone>> = {
  ACTIVE: 'go',
  INACTIVE: 'flat',
  OWNER_INACTIVE: 'wait',
};

/** Cau cho the bai xe — noi HAU QUA voi khau lap ke hoach, khong noi ten trang thai. */
export const DEPOT_PLANNER_SENTENCE: Readonly<Record<DepotPlannerStatus, string>> = {
  IN_USE: 'Đang dùng để lập kế hoạch chặng rỗng và đóng vòng chạy',
  STANDBY: 'Bãi dự phòng',
  AMBIGUOUS: 'Nhiều bãi đang bật — hệ thống không dùng bãi nào',
  NOT_IN_USE: 'Không dùng để lập kế hoạch',
};

/** Nhan NGAN cho dong danh sach (cau day du nam o the chi tiet va trong `title`). */
export const DEPOT_PLANNER_SHORT: Readonly<Record<DepotPlannerStatus, string>> = {
  IN_USE: 'Bãi chính',
  STANDBY: 'Bãi dự phòng',
  AMBIGUOUS: 'Nhiều bãi đang bật',
  NOT_IN_USE: 'Không dùng lập kế hoạch',
};

/**
 * Bai du phong la bai DA TAT cho san de doi sang — goi no "Đã tắt" canh nhan "Bãi dự phòng" la hai
 * cau trai nhau tren cung mot dong. Dong danh sach bo nhan trang thai (nhan bai xe da noi du), the
 * chi tiet goi dung ten nghiep vu.
 */
export const isStandbyDepot = (place: Pick<PlaceAdminView, 'depot'>): boolean =>
  place.depot?.plannerStatus === 'STANDBY';

export const placeStatusLabel = (place: PlaceAdminView): string =>
  isStandbyDepot(place) ? DEPOT_PLANNER_SHORT.STANDBY : PLACE_STATUS_LABEL[place.effectiveStatus];

export const DEPOT_PLANNER_TONE: Readonly<Record<DepotPlannerStatus, StatusTone>> = {
  IN_USE: 'go',
  STANDBY: 'flat',
  AMBIGUOUS: 'stop',
  NOT_IN_USE: 'flat',
};

export interface DepotSummary {
  readonly tone: StatusTone;
  readonly title: string;
  readonly detail: string;
  readonly primary: PlaceAdminView | null;
  readonly standby: readonly PlaceAdminView[];
}

/** The tom tat bai xe o dau trang: co bai nao dang dung khong, va khau lap ke hoach thay gi. */
export function depotSummary(places: readonly PlaceAdminView[]): DepotSummary {
  const depots = places.filter((place) => place.kind === 'DEPOT');
  const inUse = depots.filter((place) => place.depot?.plannerStatus === 'IN_USE');
  const ambiguous = depots.filter((place) => place.depot?.plannerStatus === 'AMBIGUOUS');
  const standby = depots.filter((place) => place.depot?.plannerStatus === 'STANDBY');
  if (ambiguous.length > 0) {
    return {
      tone: 'stop',
      title: DEPOT_PLANNER_SENTENCE.AMBIGUOUS,
      detail: `Đang bật: ${ambiguous.map((place) => place.name).join(', ')}. Chọn một bãi và dùng “Đặt làm bãi chính”.`,
      primary: null,
      standby,
    };
  }
  const primary = inUse[0] ?? null;
  if (primary === null) {
    return {
      tone: 'wait',
      title: 'Chưa có bãi xe đang dùng',
      detail:
        depots.length === 0
          ? 'Thêm bãi xe của công ty để hệ thống lập được chặng rỗng và biết khi nào xe đã về bãi.'
          : 'Các bãi xe đều đang tắt. Đặt một bãi làm bãi chính để lập kế hoạch chặng rỗng và đóng vòng chạy.',
      primary: null,
      standby,
    };
  }
  return {
    tone: 'go',
    title: `${primary.name} — ${DEPOT_PLANNER_SENTENCE.IN_USE.toLowerCase()}`,
    detail:
      standby.length === 0
        ? 'Chỉ một bãi xe được bật một lúc. Bãi mới sẽ được lưu ở dạng dự phòng.'
        : `Bãi dự phòng: ${standby.map((place) => place.name).join(', ')}.`,
    primary,
    standby,
  };
}

/* ------------------------------------------------------------------ *
 * Danh sach — loc, dem
 * ------------------------------------------------------------------ */

export interface PlaceFilter {
  readonly kind: PlaceKindFilter;
  readonly status: PlaceStatusFilter;
  readonly query: string;
}

export const DEFAULT_PLACE_FILTER: PlaceFilter = { kind: 'ALL', status: 'active', query: '' };

const isActive = (place: PlaceAdminView): boolean => place.effectiveStatus === 'ACTIVE';

const KIND_ORDER: readonly Exclude<PlaceKindFilter, 'ALL'>[] = [
  'DEPOT',
  'CUSTOMER_SITE',
  'PARTNER_SITE',
  'LEGACY_CUSTOMER',
];

export function filterPlaces(
  places: readonly PlaceAdminView[],
  filter: PlaceFilter,
): readonly PlaceAdminView[] {
  const needle = foldText(filter.query);
  return places
    .filter((place) => filter.kind === 'ALL' || placeKindFilterOf(place) === filter.kind)
    .filter((place) =>
      filter.status === 'all'
        ? true
        : filter.status === 'active'
          ? isActive(place)
          : !isActive(place),
    )
    .filter((place) => {
      if (needle.length === 0) return true;
      return [place.name, place.address, place.owner?.counterpartyName, place.owner?.customerName]
        .filter((value): value is string => typeof value === 'string')
        .some((value) => foldText(value).includes(needle));
    })
    .sort((left, right) => {
      const byKind =
        KIND_ORDER.indexOf(placeKindFilterOf(left)) - KIND_ORDER.indexOf(placeKindFilterOf(right));
      if (byKind !== 0) return byKind;
      const byStatus = Number(!isActive(left)) - Number(!isActive(right));
      return byStatus !== 0 ? byStatus : left.name.localeCompare(right.name, 'vi');
    });
}

/** So dia diem cho moi nut loc loai, TRONG trang thai dang chon — con so tren nut phai khop bang. */
export function kindCounts(
  places: readonly PlaceAdminView[],
  status: PlaceStatusFilter,
): Readonly<Record<PlaceKindFilter, number>> {
  const scoped = filterPlaces(places, { kind: 'ALL', status, query: '' });
  const counts: Record<PlaceKindFilter, number> = {
    ALL: scoped.length,
    DEPOT: 0,
    CUSTOMER_SITE: 0,
    PARTNER_SITE: 0,
    LEGACY_CUSTOMER: 0,
  };
  for (const place of scoped) counts[placeKindFilterOf(place)] += 1;
  return counts;
}

/* ------------------------------------------------------------------ *
 * Ban do
 * ------------------------------------------------------------------ */

export const EDITING_MARKER_KEY = 'editing';

/** Ghim cua moi dia diem (hinh dang theo loai) + ghim DANG SUA keo duoc tren cung. */
export function placeMarkers(
  places: readonly PlaceAdminView[],
  selectedId: string | null,
  editingPoint: GeoPoint | null,
  editingPlaceId: string | null,
): readonly PickerMarker[] {
  const markers: PickerMarker[] = places
    .filter((place) => place.id !== editingPlaceId || editingPoint === null)
    .map((place) => ({
      key: `place:${place.id}`,
      kind: place.kind,
      point: place.point,
      label: `${placeKindLabel(place)}: ${place.name}`,
      badge: null,
      isHighlighted: place.id === selectedId,
      isDraggable: false,
    }));
  if (editingPoint !== null) {
    markers.push({
      key: EDITING_MARKER_KEY,
      kind: 'PLACE',
      point: editingPoint,
      label: 'Điểm đang đặt — kéo để chỉnh',
      badge: 'Đây',
      isHighlighted: false,
      isDraggable: true,
    });
  }
  return markers;
}

export interface PlaceRing {
  readonly center: GeoPoint;
  readonly radiusMetres: number;
}

/** Vong ban kinh: moi dia diem dang dung + vong cua diem dang sua (ban kinh dang keo). */
export function placeRings(
  places: readonly PlaceAdminView[],
  editing: {
    readonly point: GeoPoint | null;
    readonly radiusMetres: number;
    readonly placeId: string | null;
  } | null,
): readonly PlaceRing[] {
  const rings: PlaceRing[] = places
    .filter((place) => isActive(place) && place.id !== editing?.placeId)
    .map((place) => ({ center: place.point, radiusMetres: place.radiusMetres }));
  if (editing?.point != null)
    rings.push({ center: editing.point, radiusMetres: editing.radiusMetres });
  return rings;
}

export const initialPlaceBounds = (places: readonly PlaceAdminView[]): MapBounds =>
  boundsOfPoints(places.map((place) => place.point)) ?? VIETNAM_PICKER_BOUNDS;

/* ------------------------------------------------------------------ *
 * Ban nhap cua trinh sua
 * ------------------------------------------------------------------ */

/** Cau hoi DAU TIEN cua trinh them dia diem: "Địa điểm này của ai?" */
export type OwnerChoice = 'DEPOT' | 'CUSTOMER' | 'PARTNER';

export const OWNER_CHOICES: readonly {
  readonly id: OwnerChoice;
  readonly label: string;
  readonly hint: string;
}[] = [
  {
    id: 'DEPOT',
    label: 'Bãi xe của công ty mình',
    hint: 'Nơi xe xuất phát và quay về. Hệ thống dùng nó cho chặng rỗng và đóng vòng chạy.',
  },
  {
    id: 'CUSTOMER',
    label: 'Kho / cửa hàng của một khách hàng',
    hint: 'Nơi lấy hoặc giao hàng thuộc về một khách hàng đang thuê vận chuyển.',
  },
  {
    id: 'PARTNER',
    label: 'Nhà máy / kho của đơn vị khác (nơi lấy/giao hàng)',
    hint: 'Nhà máy, kho, cảng của một đơn vị không phải khách hàng trực tiếp.',
  },
];

/** Gia tri dac biet cua o chon don vi: "Thêm đơn vị mới". */
export const NEW_COUNTERPARTY = '__new__';

export type PointSource = 'EXISTING' | 'MAP' | 'DRAG' | 'SEARCH' | 'POSITION' | 'PASTE' | 'NUDGE';

export interface PlaceDraft {
  readonly placeId: string | null;
  readonly ownerChoice: OwnerChoice | null;
  readonly customerId: string;
  readonly counterpartyId: string;
  readonly newCounterpartyName: string;
  readonly newCounterpartyTaxCode: string;
  readonly name: string;
  readonly address: string;
  readonly note: string;
  readonly point: GeoPoint | null;
  readonly pointSource: PointSource | null;
  readonly radiusMetres: number;
  /** Ban dau cua dia diem dang sua — de biet da doi hinh hoc/ten chua. `null` khi them moi. */
  readonly original: PlaceAdminView | null;
}

export const RADIUS_MIN_METRES = 10;
export const RADIUS_MAX_METRES = 100_000;
/** Thanh keo: khoang hay dung. O so ben canh nhan du ca khoang cua may chu. */
export const RADIUS_SLIDER_MIN = 50;
export const RADIUS_SLIDER_MAX = 2_000;
const DEFAULT_RADIUS: Readonly<Record<OwnerChoice, number>> = {
  DEPOT: 250,
  CUSTOMER: 300,
  PARTNER: 300,
};

export const newPlaceDraft = (): PlaceDraft => ({
  placeId: null,
  ownerChoice: null,
  customerId: '',
  counterpartyId: '',
  newCounterpartyName: '',
  newCounterpartyTaxCode: '',
  name: '',
  address: '',
  note: '',
  point: null,
  pointSource: null,
  radiusMetres: DEFAULT_RADIUS.DEPOT,
  original: null,
});

export const editPlaceDraft = (place: PlaceAdminView): PlaceDraft => ({
  placeId: place.id,
  ownerChoice:
    place.kind === 'DEPOT' ? 'DEPOT' : place.owner?.customerId != null ? 'CUSTOMER' : 'PARTNER',
  customerId: place.owner?.customerId ?? '',
  counterpartyId: place.owner?.counterpartyId ?? '',
  newCounterpartyName: '',
  newCounterpartyTaxCode: '',
  name: place.name,
  address: place.address ?? '',
  note: place.note ?? '',
  point: place.point,
  pointSource: 'EXISTING',
  radiusMetres: place.radiusMetres,
  original: place,
});

export const withOwnerChoice = (draft: PlaceDraft, choice: OwnerChoice): PlaceDraft => ({
  ...draft,
  ownerChoice: choice,
  radiusMetres: draft.point === null ? DEFAULT_RADIUS[choice] : draft.radiusMetres,
});

export const withPoint = (draft: PlaceDraft, point: GeoPoint, source: PointSource): PlaceDraft => ({
  ...draft,
  point,
  pointSource: source,
});

/** Mui ten tren ban phim: xe ghim ~10 m moi lan (Shift: ~100 m) — duong chinh xac khong can chuot. */
export function nudgePoint(
  point: GeoPoint,
  direction: 'N' | 'S' | 'E' | 'W',
  metres: number,
): GeoPoint {
  const latStep = metres / 111_320;
  const lngStep = metres / (111_320 * Math.max(Math.cos((point.latitude * Math.PI) / 180), 0.01));
  const round = (value: number) => Math.round(value * 1e7) / 1e7;
  switch (direction) {
    case 'N':
      return { latitude: round(point.latitude + latStep), longitude: point.longitude };
    case 'S':
      return { latitude: round(point.latitude - latStep), longitude: point.longitude };
    case 'E':
      return { latitude: point.latitude, longitude: round(point.longitude + lngStep) };
    case 'W':
      return { latitude: point.latitude, longitude: round(point.longitude - lngStep) };
  }
}

const samePoint = (left: GeoPoint, right: GeoPoint): boolean =>
  Math.abs(left.latitude - right.latitude) < 1e-7 &&
  Math.abs(left.longitude - right.longitude) < 1e-7;

/** Da doi VI TRI hoac BAN KINH — tuc doi phan quyet cua chung cu cu tai diem nay. */
export const geometryChanged = (draft: PlaceDraft): boolean =>
  draft.original !== null &&
  draft.point !== null &&
  (!samePoint(draft.point, draft.original.point) ||
    draft.radiusMetres !== draft.original.radiusMetres);

/** Hang rao duoc cham LUC DOC — doi hinh hoc hay tat dia diem deu cham lai chung cu cu. */
export const GEOMETRY_CHANGE_WARNING =
  'Các bằng chứng hiện trường tại điểm này sẽ được chấm lại theo vị trí mới.';
export const DEACTIVATE_WARNING =
  'Tắt địa điểm này thì các bằng chứng hiện trường đã chấm theo nó sẽ được chấm lại, và nó biến mất khỏi danh sách chọn ở Tạo đơn. Lịch sử vẫn được giữ; bật lại được bất cứ lúc nào.';

/** Cung khuon `TransportCounterparty_taxCode_shape` phia may chu. */
const TAX_CODE = /^[0-9]{10}(-[0-9]{3})?$/;

export function placeDraftProblems(draft: PlaceDraft): readonly string[] {
  const problems: string[] = [];
  const isCreate = draft.original === null;
  if (isCreate && draft.ownerChoice === null) problems.push('Chọn “Địa điểm này của ai?”.');
  if (isCreate && draft.ownerChoice === 'CUSTOMER' && draft.customerId.length === 0) {
    problems.push('Chọn khách hàng.');
  }
  if (isCreate && draft.ownerChoice === 'PARTNER') {
    if (draft.counterpartyId.length === 0) problems.push('Chọn đơn vị, hoặc “Thêm đơn vị mới”.');
    if (
      draft.counterpartyId === NEW_COUNTERPARTY &&
      draft.newCounterpartyName.trim().length === 0
    ) {
      problems.push('Nhập tên đơn vị mới.');
    }
    const taxCode = draft.newCounterpartyTaxCode.trim();
    if (
      draft.counterpartyId === NEW_COUNTERPARTY &&
      taxCode.length > 0 &&
      !TAX_CODE.test(taxCode)
    ) {
      problems.push('Mã số thuế gồm 10 số, hoặc 10 số kèm 3 số chi nhánh (ví dụ 0101234567-001).');
    }
  }
  if (draft.point === null) problems.push('Đặt vị trí trên bản đồ.');
  const name = draft.name.trim();
  if (name.length === 0) problems.push('Nhập tên địa điểm.');
  if (name.length > 200) problems.push('Tên địa điểm dài quá 200 ký tự.');
  if (
    !Number.isInteger(draft.radiusMetres) ||
    draft.radiusMetres < RADIUS_MIN_METRES ||
    draft.radiusMetres > RADIUS_MAX_METRES
  ) {
    problems.push(
      `Bán kính phải là số nguyên từ ${RADIUS_MIN_METRES} đến ${RADIUS_MAX_METRES.toLocaleString('vi-VN')} m.`,
    );
  }
  return problems;
}

const blankToNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

export function buildCreatePlaceInput(draft: PlaceDraft): CreatePlaceInput | null {
  if (placeDraftProblems(draft).length > 0 || draft.point === null || draft.ownerChoice === null) {
    return null;
  }
  const base = {
    name: draft.name.trim(),
    address: blankToNull(draft.address),
    point: draft.point,
    radiusMetres: draft.radiusMetres,
    note: blankToNull(draft.note),
  };
  if (draft.ownerChoice === 'DEPOT') return { kind: 'DEPOT', ...base };
  if (draft.ownerChoice === 'CUSTOMER') {
    return { kind: 'COUNTERPARTY_SITE', ...base, owner: { customerId: draft.customerId } };
  }
  return {
    kind: 'COUNTERPARTY_SITE',
    ...base,
    owner:
      draft.counterpartyId === NEW_COUNTERPARTY
        ? {
            newCounterparty: {
              name: draft.newCounterpartyName.trim(),
              taxCode: blankToNull(draft.newCounterpartyTaxCode),
            },
          }
        : { counterpartyId: draft.counterpartyId },
  };
}

/** Chi gui truong DA DOI — mot lan sua ghi chu khong duoc cham vao ten (luat trung ten o may chu). */
export function buildUpdatePlaceInput(
  draft: PlaceDraft,
  acknowledgeOpenWork = false,
): UpdatePlaceInput | null {
  const original = draft.original;
  if (original === null || draft.point === null || placeDraftProblems(draft).length > 0)
    return null;
  const patch: {
    name?: string;
    address?: string | null;
    point?: GeoPoint;
    radiusMetres?: number;
    note?: string | null;
    acknowledgeOpenWork?: boolean;
  } = {};
  if (draft.name.trim() !== original.name) patch.name = draft.name.trim();
  if (blankToNull(draft.address) !== (original.address ?? null))
    patch.address = blankToNull(draft.address);
  if (!samePoint(draft.point, original.point)) patch.point = draft.point;
  if (draft.radiusMetres !== original.radiusMetres) patch.radiusMetres = draft.radiusMetres;
  if (blankToNull(draft.note) !== (original.note ?? null)) patch.note = blankToNull(draft.note);
  if (acknowledgeOpenWork) patch.acknowledgeOpenWork = true;
  return patch;
}

export const isEmptyPatch = (patch: UpdatePlaceInput): boolean =>
  Object.keys(patch).filter((key) => key !== 'acknowledgeOpenWork').length === 0;

/** Cau sau khi luu — bai xe moi khi da co bai dang dung thi noi RO la no thanh bai du phong. */
export function savedNotice(saved: PlaceAdminView, isCreate: boolean): string {
  if (isCreate && saved.kind === 'DEPOT' && saved.depot?.plannerStatus === 'STANDBY') {
    return `Đã thêm ${saved.name} làm bãi dự phòng — đã có một bãi xe đang dùng. Dùng “Đặt làm bãi chính” khi muốn đổi.`;
  }
  return isCreate ? `Đã thêm ${saved.name}.` : `Đã lưu ${saved.name}.`;
}

/**
 * Dia diem cua DON VI KHAC (kho khach hang, nha may doi tac) la mot mat cua ho so phap nhan: tao,
 * doi ten, tat no doi them quyen quan ly khach hang/doi tac (`PLACE_SITE_REQUIRES_COUNTERPARTY_MANAGE`
 * phia may chu). Man hinh noi truoc thay vi de nguoi dung dien het roi moi bi tu choi.
 */
export const COUNTERPARTY_MANAGE_NEEDED =
  'Cần thêm quyền quản lý khách hàng, đối tác để thêm hay tắt địa điểm của đơn vị khác. Nhờ Giám đốc cấp quyền.';

export const isOwnerChoiceAllowed = (
  choice: OwnerChoice,
  canManageCounterparties: boolean,
): boolean => choice === 'DEPOT' || canManageCounterparties;

/**
 * Tat/bat dia diem cua don vi khac cung doi quyen do. CHI `COUNTERPARTY_SITE` (mot mat cua ho so
 * phap nhan) — bai xe va diem khach hang kieu cu (`CUSTOMER`) chi can quyen quan ly vi tri, dung
 * nhu `place-admin.service` phia may chu. Chat hon may chu = chan nguoi dung khoi viec ho duoc lam.
 */
export const needsCounterpartyManage = (place: Pick<PlaceAdminView, 'kind'>): boolean =>
  place.kind === 'COUNTERPARTY_SITE';

/** O nao cua trinh sua bi khoa vi thieu quyen quan ly khach hang/doi tac. */
export interface PlaceFieldLocks {
  readonly name: boolean;
  readonly address: boolean;
}

/**
 * Ten VA dia chi cua dia diem don vi khac la du lieu cua ho so phap nhan (dia diem cua don vi di
 * theo) — may chu doi `transport.counterparty.manage` khi mot trong hai doi. Vi tri, ban kinh, ghi
 * chu van chi can quyen quan ly vi tri. Them moi khong khoa o nao: loai chu da bi chan tu cau hoi
 * "Địa điểm này của ai?".
 */
export function placeFieldLocks(
  original: Pick<PlaceAdminView, 'kind'> | null,
  canManageCounterparties: boolean,
): PlaceFieldLocks {
  const isLocked =
    original !== null && needsCounterpartyManage(original) && !canManageCounterparties;
  return { name: isLocked, address: isLocked };
}

/** Goi y ngan canh o bi khoa. */
export const NAME_LOCKED_HINT =
  'Đổi tên địa điểm của đơn vị khác cần quyền quản lý khách hàng, đối tác.';
export const ADDRESS_LOCKED_HINT =
  'Đổi địa chỉ của địa điểm thuộc đơn vị khác cần quyền quản lý khách hàng, đối tác.';

/**
 * Dien ten/dia chi tu ket qua tim (xuoi hoac nguoc) — CHI o dang trong VA khong bi khoa. Mot o bi
 * khoa ma van duoc dien tu dong se gui mot thay doi may chu tu choi (`403`) khi luu.
 */
export function withLookupFill(
  draft: PlaceDraft,
  found: { readonly label: string; readonly address: string | null },
  locks: PlaceFieldLocks,
): PlaceDraft {
  const fillName = !locks.name && draft.name.trim().length === 0;
  const fillAddress = !locks.address && draft.address.trim().length === 0;
  return {
    ...draft,
    name: fillName ? found.label : draft.name,
    address: fillAddress ? (found.address ?? '') : draft.address,
  };
}

const HISTORY_ACTION_LABEL: Readonly<Record<string, string>> = {
  'transport.place.create': 'Thêm địa điểm',
  // Duong dang ky CU (`POST /transport/geofences`) van gan — dong dau cua dia diem tao qua duong do.
  'transport.geofence.register': 'Thêm địa điểm',
  'transport.place.update': 'Sửa địa điểm',
  'transport.place.deactivate': 'Tắt địa điểm',
  'transport.place.activate': 'Bật lại địa điểm',
  'transport.place.make_primary_depot': 'Đặt làm bãi chính',
  'transport.counterparty_site.create': 'Thêm địa điểm của đơn vị',
  'transport.counterparty_site.update': 'Sửa địa điểm của đơn vị',
};

/**
 * Cau cho mot dong lich su: cau may chu viet neu co, khong thi ten viec — khong bao gio ma. Kem LY
 * DO (`after.reason`) khi co: hop thoai tat hoi "Lý do tắt (ghi vào lịch sử)", nen ly do phai doc lai
 * duoc o chinh lich su nay.
 */
export function placeHistoryLabel(entry: {
  readonly action: string;
  readonly summary?: string | null;
  readonly after?: unknown;
}): string {
  const summary = entry.summary?.trim() ?? '';
  const label =
    summary.length > 0 ? summary : (HISTORY_ACTION_LABEL[entry.action] ?? 'Thay đổi khác');
  return withAuditReason(label, entry.after);
}

/** Ma dong viec dang mo — ma nghiep vu neu co, khong thi ma ky thuat rut gon. */
export const openWorkLabel = (item: {
  readonly id: string;
  readonly code?: string | null;
}): string => (item.code != null && item.code.trim().length > 0 ? item.code : item.id.slice(0, 8));
