import type { CreateOrderInput } from '../transport-api';
import type {
  GeoPoint,
  KnownPlace,
  KnownPlaceKind,
  PlaceCandidate,
  TransportOrder,
} from '../transport-types';
import {
  accuracyPhrase,
  knownPlaceKindLabel,
  knownPlaceSourceLine,
  type PickerMarker,
} from './place-lookup';

/**
 * BAN NHAP CUA MOT DON MOI (`#379`) — reducer THUAN cho man tao don.
 *
 * ===========================================================================
 * MOT QUY TAC DUY NHAT: "MOI THU BAN CHON DI VAO O DANG CHON".
 *
 * Bam ban do, bam ghim dia diem da biet, "Chọn" o mot ket qua tim, hay "Đặt làm điểm …" o vi tri cua
 * toi — tat ca di qua `PLACE_CHOSEN`/`MAP_PICKED` vao DUNG o dang chon (`active`). Khong mot duong
 * nao tu doan "chac nguoi dung muon dat diem giao": doan sai la nham lay/giao, loi dat nhat cua man
 * nay. Ngoai le duy nhat: vua dat mot dau ma dau kia con trong thi o dang chon TU CHUYEN sang dau
 * kia, va man hinh NOI RA dieu do (`announcement`, `aria-live`).
 *
 * ===========================================================================
 * MOI LAN BAM BAN DO MOT MA LUOT.
 *
 * Bam ban do dat toa do NGAY (nguoi dung vua chi vao do), roi mot lan tim nguoc chay nen de dat ten.
 * Ket qua tim nguoc ve MUON — sau khi nguoi dung da bam cho khac, doi o, hay tu go ten — thi khong
 * duoc ghi de. `lookupToken` cua o phai TRUNG ma luot cua ket qua, neu khong ket qua bi bo.
 *
 * ===========================================================================
 * TOA DO LA SU THAT, TEN LA CHU IN TREN DON.
 *
 * `name` la `originLabel`/`destinationLabel` gui len; nguoi dung sua duoc. Toa do chi doi khi nguoi
 * dung chon lai hoac keo ghim — sua ten khong bao gio cham vao toa do, va nguoc lai.
 */

export type DraftEndpoint = 'ORIGIN' | 'DESTINATION';

/** Diem den tu DAU — de dong nguon tren phieu tuyen noi that, va de ten tim nguoc biet duoc thay. */
export type PlaceProvenance =
  | {
      readonly kind: 'KNOWN_PLACE';
      readonly placeKind: KnownPlaceKind;
      readonly owner: string | null;
      /** Nhan loai may chu tinh (`#395`), `null` = suy tu `placeKind`. */
      readonly kindLabel?: string | null;
    }
  | { readonly kind: 'SEARCH_RESULT'; readonly address: string | null }
  | {
      readonly kind: 'MAP_CLICK';
      readonly lookup: 'PENDING' | 'FOUND' | 'NOT_FOUND';
      readonly address: string | null;
    }
  | { readonly kind: 'MAP_ADJUSTED' }
  | { readonly kind: 'BROWSER_POSITION'; readonly accuracyMetres: number | null };

export interface DraftPlace {
  readonly point: GeoPoint;
  readonly provenance: PlaceProvenance;
  /** Ten in tren don. Dien san tu nguon; nguoi dung sua duoc. */
  readonly name: string;
  /** `true` sau lan go tay dau tien — tim nguoc KHONG duoc ghi de ten nguoi dung da go. */
  readonly isNameEdited: boolean;
  /** Ma luot cua lan tim nguoc dang cho; `null` = khong cho gi. */
  readonly lookupToken: number | null;
}

export interface OrderDraft {
  readonly active: DraftEndpoint;
  readonly origin: DraftPlace | null;
  readonly destination: DraftPlace | null;
  /** Cau cho vung `aria-live` sau mot thay doi ma nguoi dung khong tu bam (tu chuyen o). */
  readonly announcement: string | null;
}

/** Mot lua chon san sang di vao o: diem + ten goi y + nguon. */
export interface PlaceChoice {
  readonly point: GeoPoint;
  readonly name: string;
  readonly provenance: PlaceProvenance;
}

export type DraftAction =
  | { readonly type: 'SELECT_ENDPOINT'; readonly endpoint: DraftEndpoint }
  | {
      readonly type: 'PLACE_CHOSEN';
      readonly choice: PlaceChoice;
      /** Chi "Đặt làm điểm lấy/giao hàng" o vi tri cua toi noi RO o dich; con lai = o dang chon. */
      readonly endpoint?: DraftEndpoint;
    }
  | { readonly type: 'MAP_PICKED'; readonly point: GeoPoint; readonly token: number }
  | {
      readonly type: 'REVERSE_SETTLED';
      readonly token: number;
      readonly candidate: PlaceCandidate | null;
    }
  | { readonly type: 'POINT_DRAGGED'; readonly endpoint: DraftEndpoint; readonly point: GeoPoint }
  | { readonly type: 'RENAMED'; readonly endpoint: DraftEndpoint; readonly name: string }
  | { readonly type: 'CLEARED'; readonly endpoint: DraftEndpoint };

export const EMPTY_DRAFT: OrderDraft = {
  active: 'ORIGIN',
  origin: null,
  destination: null,
  announcement: null,
};

/** Ten TAM ngay luc bam — truoc khi tim nguoc tra loi. */
export const MAP_POINT_PENDING_NAME = 'Điểm trên bản đồ';
/** Tim nguoc khong ra ten (tat, hong, bien, rung): van la mot diem hop le, chi thieu ten. */
export const MAP_POINT_UNNAMED = 'Điểm đã chọn trên bản đồ';
export const NAME_MAX_LENGTH = 200;

export const ENDPOINT_NOUN: Readonly<Record<DraftEndpoint, string>> = {
  ORIGIN: 'điểm lấy hàng',
  DESTINATION: 'điểm giao hàng',
};

export const ENDPOINT_ROLE: Readonly<Record<DraftEndpoint, string>> = {
  ORIGIN: 'Lấy hàng',
  DESTINATION: 'Giao hàng',
};

/** Chu tren ghim va tren dau cuong phieu — cung mot chu o hai noi de mat noi duoc chung. */
export const ENDPOINT_BADGE: Readonly<Record<DraftEndpoint, string>> = {
  ORIGIN: 'Lấy',
  DESTINATION: 'Giao',
};

const other = (endpoint: DraftEndpoint): DraftEndpoint =>
  endpoint === 'ORIGIN' ? 'DESTINATION' : 'ORIGIN';

const slotOf = (draft: OrderDraft, endpoint: DraftEndpoint): DraftPlace | null =>
  endpoint === 'ORIGIN' ? draft.origin : draft.destination;

const withSlot = (
  draft: OrderDraft,
  endpoint: DraftEndpoint,
  place: DraftPlace | null,
): OrderDraft =>
  endpoint === 'ORIGIN' ? { ...draft, origin: place } : { ...draft, destination: place };

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Dat mot diem vao `endpoint`, roi ap quy tac tu chuyen: dau kia con TRONG thi chuyen sang dau kia
 * va noi ra; du hai dau thi dung yen o dau vua dat.
 */
function assign(draft: OrderDraft, endpoint: DraftEndpoint, place: DraftPlace): OrderDraft {
  const next = withSlot(draft, endpoint, place);
  const target = other(endpoint);
  if (slotOf(next, target) === null) {
    return {
      ...next,
      active: target,
      announcement: `Đã đặt ${ENDPOINT_NOUN[endpoint]}. Tiếp theo: ${ENDPOINT_NOUN[target]}.`,
    };
  }
  return { ...next, active: endpoint, announcement: `Đã đặt ${ENDPOINT_NOUN[endpoint]}.` };
}

/** Tim nguoc da tra loi: chi ap vao o CON cho dung ma luot do. */
function settleReverse(
  draft: OrderDraft,
  token: number,
  candidate: PlaceCandidate | null,
): OrderDraft {
  const endpoint: DraftEndpoint | null =
    draft.origin?.lookupToken === token
      ? 'ORIGIN'
      : draft.destination?.lookupToken === token
        ? 'DESTINATION'
        : null;
  if (endpoint === null) return draft;
  const place = slotOf(draft, endpoint) as DraftPlace;
  const label = candidate?.label.trim() ?? '';
  const isFound = label.length > 0;
  const name = place.isNameEdited ? place.name : isFound ? label : MAP_POINT_UNNAMED;
  return withSlot(draft, endpoint, {
    ...place,
    name,
    lookupToken: null,
    provenance: {
      kind: 'MAP_CLICK',
      lookup: isFound ? 'FOUND' : 'NOT_FOUND',
      address: isFound ? (candidate?.address ?? null) : null,
    },
  });
}

export function draftReducer(draft: OrderDraft, action: DraftAction): OrderDraft {
  switch (action.type) {
    case 'SELECT_ENDPOINT':
      return { ...draft, active: action.endpoint, announcement: null };
    case 'PLACE_CHOSEN':
      return assign(draft, action.endpoint ?? draft.active, {
        point: action.choice.point,
        provenance: action.choice.provenance,
        name: action.choice.name.trim(),
        isNameEdited: false,
        lookupToken: null,
      });
    case 'MAP_PICKED':
      return assign(draft, draft.active, {
        point: action.point,
        provenance: { kind: 'MAP_CLICK', lookup: 'PENDING', address: null },
        name: MAP_POINT_PENDING_NAME,
        isNameEdited: false,
        lookupToken: action.token,
      });
    case 'REVERSE_SETTLED':
      return settleReverse(draft, action.token, action.candidate);
    case 'POINT_DRAGGED': {
      const place = slotOf(draft, action.endpoint);
      if (place === null) return draft;
      /* Keo ghim = tinh chinh: giu ten, huy lan tim nguoc dang cho (no noi ve diem CU). */
      const moved: DraftPlace = {
        ...place,
        point: action.point,
        provenance: { kind: 'MAP_ADJUSTED' },
        name: place.lookupToken !== null && !place.isNameEdited ? MAP_POINT_UNNAMED : place.name,
        lookupToken: null,
      };
      return {
        ...withSlot(draft, action.endpoint, moved),
        announcement: `Đã chỉnh ${ENDPOINT_NOUN[action.endpoint]} trên bản đồ.`,
      };
    }
    case 'RENAMED': {
      const place = slotOf(draft, action.endpoint);
      // Ten BAI XE khoa (`#395` §2.3): khau lap ke hoach nhan ra bai xe bang DUNG ten nay.
      if (place === null || isNameLocked(place)) return draft;
      return withSlot(draft, action.endpoint, { ...place, name: action.name, isNameEdited: true });
    }
    case 'CLEARED':
      return {
        ...withSlot(draft, action.endpoint, null),
        active: action.endpoint,
        announcement: `Đã xoá ${ENDPOINT_NOUN[action.endpoint]}.`,
      };
  }
}

/* ------------------------------------------------------------------ *
 * Lua chon tu tung nguon -> PlaceChoice
 * ------------------------------------------------------------------ */

export const choiceFromKnownPlace = (place: KnownPlace): PlaceChoice => ({
  point: place.point,
  name: place.name,
  provenance: {
    kind: 'KNOWN_PLACE',
    placeKind: place.kind,
    owner: place.detail,
    kindLabel: place.kindLabel ?? null,
  },
});

/**
 * TEN BAI XE KHONG SUA DUOC tren don (`#395` §2.3). Khau lap ke hoach nhan ra chang rong va "xe da
 * ve bai" bang CHINH ten bai trong "Địa điểm vận hành"; mot ten go tay ("Bãi xe HN — cổng sau") se
 * sinh mot chang rong gia va khong bao gio dong vong chay. Keo ghim di cho khac thi diem khong con
 * la bai xe nua, va ten lai sua duoc.
 */
export const isNameLocked = (place: DraftPlace): boolean =>
  place.provenance.kind === 'KNOWN_PLACE' && place.provenance.placeKind === 'DEPOT';

export const DEPOT_NAME_LOCK_HINT = 'Tên bãi xe lấy từ Địa điểm vận hành.';

export const choiceFromSearchResult = (candidate: PlaceCandidate): PlaceChoice => ({
  point: candidate.point,
  name: candidate.label,
  provenance: { kind: 'SEARCH_RESULT', address: candidate.address },
});

/** Ten mac dinh la mot cau nguoi dung NHIN la biet phai sua — khong gia vo la mot dia danh. */
export const BROWSER_POSITION_NAME = 'Vị trí hiện tại của tôi';

export const choiceFromBrowserPosition = (
  point: GeoPoint,
  accuracyMetres: number | null,
): PlaceChoice => ({
  point,
  name: BROWSER_POSITION_NAME,
  provenance: { kind: 'BROWSER_POSITION', accuracyMetres },
});

/* ------------------------------------------------------------------ *
 * Dong nguon tren phieu tuyen
 * ------------------------------------------------------------------ */

export interface SourceLine {
  /** Diem nay den tu dau: "Bãi xe", "Kết quả tìm kiếm", "Chọn trên bản đồ"… */
  readonly source: string;
  /** Dong phu tuy chon: dia chi, hoac viec nguoi dung nen lam tiep. */
  readonly detail: string | null;
}

export function sourceLineOf(place: DraftPlace): SourceLine {
  const provenance = place.provenance;
  switch (provenance.kind) {
    case 'KNOWN_PLACE':
      return {
        source: knownPlaceSourceLine(provenance.placeKind, provenance.owner, provenance.kindLabel),
        detail: null,
      };
    case 'SEARCH_RESULT':
      return { source: 'Kết quả tìm kiếm', detail: provenance.address };
    case 'MAP_CLICK':
      return {
        source: 'Chọn trên bản đồ',
        detail:
          provenance.lookup === 'PENDING'
            ? 'Đang tìm tên địa điểm…'
            : provenance.lookup === 'NOT_FOUND'
              ? 'Chưa tìm được tên cho điểm này. Đặt tên ở ô bên dưới.'
              : provenance.address,
      };
    case 'MAP_ADJUSTED':
      return { source: 'Chỉnh trên bản đồ', detail: null };
    case 'BROWSER_POSITION':
      return {
        source: `Vị trí trình duyệt, ${accuracyPhrase(provenance.accuracyMetres)}`,
        detail: 'Chỉ là gợi ý để chọn điểm, không phải bằng chứng vị trí.',
      };
  }
}

/* ------------------------------------------------------------------ *
 * Thong tin thuong mai + dieu kien gui
 * ------------------------------------------------------------------ */

/** Gia tri THO cua cac o nhap — chuoi, giong het nhung gi nguoi dung dang thay. */
export interface OrderDetailsDraft {
  readonly code: string;
  readonly customerId: string;
  readonly businessDate: string;
  readonly freightAmount: string;
  readonly cargoDescription: string;
}

export const emptyDetails = (businessDate: string): OrderDetailsDraft => ({
  code: '',
  customerId: '',
  businessDate,
  freightAmount: '',
  cargoDescription: '',
});

/**
 * Cuoc la so nguyen DONG, >= 1. `null` = chua hop le.
 *
 * KHACH va CUOC la BAT BUOC o man nay (xem `MovementView`): thieu mot trong hai, don chay xong roi
 * dung mai truoc cua doi soat cong no ma khong mot man hinh nao bao loi.
 */
export function parseFreight(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

const hasName = (place: DraftPlace | null): boolean => {
  if (place === null) return true;
  const length = place.name.trim().length;
  return length >= 1 && length <= NAME_MAX_LENGTH;
};

/**
 * NHUNG GI CON THIEU, theo dung thu tu nguoi dung nhin tren man hinh — liet ke THAT, khong phai
 * "form chua hop le". Rong = gui duoc.
 */
export function missingRequirements(
  draft: OrderDraft,
  details: OrderDetailsDraft,
): readonly string[] {
  const missing: string[] = [];
  if (draft.origin === null) missing.push('điểm lấy hàng');
  if (draft.destination === null) missing.push('điểm giao hàng');
  if (!hasName(draft.origin)) missing.push('tên điểm lấy hàng');
  if (!hasName(draft.destination)) missing.push('tên điểm giao hàng');
  if (details.code.trim().length === 0) missing.push('mã đơn');
  if (details.customerId.length === 0) missing.push('khách hàng');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(details.businessDate)) missing.push('ngày vận hành');
  if (parseFreight(details.freightAmount) === null) missing.push('cước');
  return missing;
}

export const missingSentence = (missing: readonly string[]): string =>
  missing.length === 0 ? 'Đủ thông tin để tạo đơn.' : `Còn thiếu: ${missing.join(', ')}.`;

export type CreateOrderBuild =
  | { readonly ok: true; readonly input: CreateOrderInput }
  | { readonly ok: false; readonly missing: readonly string[] };

/**
 * Than yeu cau tao don — CHI khi du. Toa do di NGUYEN nhu nguoi dung da chon; nhan la ten da cat
 * khoang trang. Khong co nhanh nao gui mot don chi co chu.
 */
export function buildCreateOrderInput(
  draft: OrderDraft,
  details: OrderDetailsDraft,
): CreateOrderBuild {
  const missing = missingRequirements(draft, details);
  const freight = parseFreight(details.freightAmount);
  if (
    missing.length > 0 ||
    draft.origin === null ||
    draft.destination === null ||
    freight === null
  ) {
    return { ok: false, missing };
  }
  const cargo = details.cargoDescription.trim();
  return {
    ok: true,
    input: {
      code: details.code.trim(),
      originLabel: draft.origin.name.trim(),
      destinationLabel: draft.destination.name.trim(),
      originPoint: {
        latitude: draft.origin.point.latitude,
        longitude: draft.origin.point.longitude,
      },
      destinationPoint: {
        latitude: draft.destination.point.latitude,
        longitude: draft.destination.point.longitude,
      },
      businessDate: details.businessDate,
      customerId: details.customerId,
      freightAmount: freight,
      cargoDescription: cargo.length === 0 ? null : cargo,
    },
  };
}

/** Da nhap GI DO chua — de "Quay lại danh sách" hoi truoc khi bo. */
export const isDraftDirty = (
  draft: OrderDraft,
  details: OrderDetailsDraft,
  initialBusinessDate: string,
): boolean =>
  draft.origin !== null ||
  draft.destination !== null ||
  details.code.trim().length > 0 ||
  details.customerId.length > 0 ||
  details.freightAmount.trim().length > 0 ||
  details.cargoDescription.trim().length > 0 ||
  details.businessDate !== initialBusinessDate;

/** Cau sau khi tao xong — noi MA DON va HAI DAU tuyen, de nguoi dung doi chieu ngay. */
export const createdNotice = (order: TransportOrder): string =>
  `Đã tạo đơn ${order.code} — lấy tại ${order.originLabel}, giao tại ${order.destinationLabel}.`;

/*
 * May chu tu choi mot toa do (ngoai khoang, (0, 0), khong huu han) bang HAI ma rieng de man hinh chi
 * dung o sai. Cau cua may chu viet cho nguoi goi API (khong dau, kem ma ky thuat); man hinh noi cho
 * nguoi dang chon diem: diem NAO, va lam gi tiep.
 */
const POINT_REJECTED_MESSAGE: Readonly<Record<string, string>> = {
  ORDER_ORIGIN_POINT_INVALID: `Toạ độ ${ENDPOINT_NOUN.ORIGIN} không hợp lệ — chọn lại điểm trên bản đồ.`,
  ORDER_DESTINATION_POINT_INVALID: `Toạ độ ${ENDPOINT_NOUN.DESTINATION} không hợp lệ — chọn lại điểm trên bản đồ.`,
};

/** Cau hien khi tao don that bai. Loi khac giu NGUYEN VAN cau cua may chu. */
export function createOrderErrorMessage(error: {
  readonly message: string;
  readonly reason?: string | null;
}): string {
  const reason = error.reason ?? null;
  return (reason === null ? undefined : POINT_REJECTED_MESSAGE[reason]) ?? error.message;
}

/* ------------------------------------------------------------------ *
 * Ghim cua ban do chon diem
 * ------------------------------------------------------------------ */

export interface MarkerSources {
  readonly draft: OrderDraft;
  readonly knownPlaces: readonly KnownPlace[];
  readonly searchResults: readonly PlaceCandidate[];
  /** Chi so ket qua dang duoc tro/focus trong danh sach — ghim so tuong ung noi len. */
  readonly highlightedResult: number | null;
  readonly myPosition: GeoPoint | null;
}

export const knownPlaceMarkerKey = (id: string): string => `known:${id}`;
export const searchResultMarkerKey = (index: number): string => `result:${index}`;
export const ENDPOINT_MARKER_KEY: Readonly<Record<DraftEndpoint, string>> = {
  ORIGIN: 'endpoint:ORIGIN',
  DESTINATION: 'endpoint:DESTINATION',
};
export const MY_POSITION_MARKER_KEY = 'me';

const endpointMarker = (endpoint: DraftEndpoint, place: DraftPlace): PickerMarker => ({
  key: ENDPOINT_MARKER_KEY[endpoint],
  kind: endpoint,
  point: place.point,
  label: `${capitalise(ENDPOINT_NOUN[endpoint])}: ${place.name.trim() || MAP_POINT_UNNAMED}`,
  badge: ENDPOINT_BADGE[endpoint],
  isHighlighted: false,
  isDraggable: true,
});

/**
 * Thu tu = thu tu VE: dia diem da biet duoi cung, roi ket qua tim, vi tri cua toi, va hai diem LAY/
 * GIAO tren cung — hai ghim do la cai nguoi dung dang chot, khong gi duoc de len chung.
 */
export function pickerMarkers(sources: MarkerSources): readonly PickerMarker[] {
  const known = sources.knownPlaces.map<PickerMarker>((place) => ({
    key: knownPlaceMarkerKey(place.id),
    kind: place.kind,
    point: place.point,
    label: `${knownPlaceKindLabel(place)}: ${place.name}`,
    badge: null,
    isHighlighted: false,
    isDraggable: false,
  }));
  const results = sources.searchResults.map<PickerMarker>((candidate, index) => ({
    key: searchResultMarkerKey(index),
    kind: 'SEARCH_RESULT',
    point: candidate.point,
    label: `Kết quả ${index + 1}: ${candidate.label}`,
    badge: String(index + 1),
    isHighlighted: sources.highlightedResult === index,
    isDraggable: false,
  }));
  const me: PickerMarker[] =
    sources.myPosition === null
      ? []
      : [
          {
            key: MY_POSITION_MARKER_KEY,
            kind: 'MY_POSITION',
            point: sources.myPosition,
            label: 'Vị trí của bạn',
            badge: null,
            isHighlighted: false,
            isDraggable: false,
          },
        ];
  const endpoints: PickerMarker[] = [];
  if (sources.draft.origin !== null) endpoints.push(endpointMarker('ORIGIN', sources.draft.origin));
  if (sources.draft.destination !== null) {
    endpoints.push(endpointMarker('DESTINATION', sources.draft.destination));
  }
  return [...known, ...results, ...me, ...endpoints];
}
