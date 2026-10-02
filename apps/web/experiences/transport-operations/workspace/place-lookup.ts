import { lineString, polygon } from '@turf/helpers';
import { length } from '@turf/length';
import { cameraFor, type MapBounds, type MapCamera } from '../visual/map-camera';
import type { GeoPoint, KnownPlace, KnownPlaceKind, PlaceSearchResponse } from '../transport-types';

/**
 * TIM VA CHON DIA DIEM cho man tao don (`#379`) — ham THUAN, khong DOM, khong mang.
 *
 * ===========================================================================
 * TOA DO LA SU THAT, CHU CHI LA CHU.
 *
 * Moi thu trong tep nay phuc vu MOT viec: giup nguoi dung chot hai TOA DO dung. Ket qua tim kiem,
 * dia diem da biet hay vi tri trinh duyet deu chi la GOI Y den khi nguoi dung bam chon; khong ham
 * nao o day doan mot toa do tu mot chuoi chu.
 *
 * ===========================================================================
 * KHOANG CACH O DAY LA DUONG CHIM BAY, KHONG PHAI QUANG DUONG.
 *
 * `straightLineKm` do mot doan thang tren mat cau de nguoi dung THAY hai diem cach nhau bao xa (bat
 * nham diem lay/giao cach nhau 5 m hay 900 km). No KHONG BAO GIO la km cua nghiep vu — km cua chang
 * do nguoi nhap hoac nha cung cap dinh tuyen tra ve (`journey.ts` luat 3).
 */

/** Ngan hon muc nay thi nha cung cap tra ve rac, va ta ton mot luot cua gioi han 1 lan/giay. */
export const SEARCH_MIN_LENGTH = 2;
/** Trung voi `.max(200)` cua may chu — go dai hon thi may chu tu choi bang 400. */
export const SEARCH_MAX_LENGTH = 200;

/** Duoi muc nay hai diem gan nhu trung nhau: canh bao mem, khong chan (mot kho co hai cong). */
export const NEARLY_SAME_POINT_METRES = 100;

/**
 * Khung duong bo Viet Nam cho CONG CU CHON khi chua co diem nao de nhin.
 *
 * Day KHONG phai du lieu va khong duoc luu o dau: `map-camera.ts` cam mot "toa do mac dinh" cho ban
 * do BAO CAO vi mot ban do bay ve giua Viet Nam doc y het mot ban do co du lieu. O day nguoc lai —
 * man hinh dang HOI nguoi dung mot diem, nen no phai mo ra o noi nguoi dung se tim.
 */
export const VIETNAM_PICKER_BOUNDS: MapBounds = [102.1, 8.1, 110.0, 23.6];

export type SearchQueryCheck =
  { readonly ok: true; readonly query: string } | { readonly ok: false; readonly message: string };

/**
 * Chuan hoa chuoi truoc khi gui: bo khoang trang dau/cuoi va gom khoang trang giua. KHONG bo dau —
 * nha cung cap tim tot hon voi tieng Viet co dau, va nguoi dung go khong dau van tim duoc.
 */
export function checkSearchQuery(raw: string): SearchQueryCheck {
  const query = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (query.length < SEARCH_MIN_LENGTH) {
    return { ok: false, message: `Gõ ít nhất ${SEARCH_MIN_LENGTH} ký tự rồi bấm Tìm.` };
  }
  if (query.length > SEARCH_MAX_LENGTH) {
    return { ok: false, message: `Tên tìm kiếm dài quá ${SEARCH_MAX_LENGTH} ký tự.` };
  }
  return { ok: true, query };
}

export const SEARCH_DISABLED_MESSAGE =
  'Tìm kiếm địa điểm chưa được bật cho doanh nghiệp này. Vẫn chọn được trên bản đồ, từ địa điểm đã biết hoặc vị trí của bạn.';
export const SEARCH_BUSY_MESSAGE = 'Đang có nhiều lượt tìm cùng lúc. Thử lại sau vài giây.';
export const SEARCH_UNAVAILABLE_MESSAGE =
  'Dịch vụ tìm kiếm không phản hồi. Thử lại sau, hoặc chọn trực tiếp trên bản đồ.';
export const SEARCH_EMPTY_MESSAGE =
  'Không tìm thấy địa điểm nào khớp. Thử tên ngắn hơn, bỏ số nhà, hoặc chọn trên bản đồ.';

export interface SearchOutcomeView {
  /** Cau cho dong trang thai (`aria-live`). */
  readonly message: string;
  /** `true` = mot that bai can nguoi dung doi cach (mau canh bao), khong phai mot ket qua. */
  readonly isProblem: boolean;
}

/**
 * Trang thai tim kiem -> MOT cau. Moi trang thai mot cau khac nhau: "chua bat" doi nguoi van hanh,
 * "ban" doi vai giay, "khong phan hoi" doi nha cung cap — gop chung lam nguoi dung thu lai vo ich.
 */
export function searchOutcomeOf(response: PlaceSearchResponse): SearchOutcomeView {
  switch (response.status) {
    case 'DISABLED':
      return { message: SEARCH_DISABLED_MESSAGE, isProblem: true };
    case 'BUSY':
      return { message: SEARCH_BUSY_MESSAGE, isProblem: true };
    case 'UNAVAILABLE':
      return { message: SEARCH_UNAVAILABLE_MESSAGE, isProblem: true };
    case 'OK':
      return response.results.length === 0
        ? { message: SEARCH_EMPTY_MESSAGE, isProblem: false }
        : {
            message: `Tìm thấy ${response.results.length} địa điểm. Chọn một kết quả để đặt điểm.`,
            isProblem: false,
          };
  }
}

/* ------------------------------------------------------------------ *
 * Dia diem da biet — doc tu hang rao, nhom theo viec nguoi dung lam
 * ------------------------------------------------------------------ */

/**
 * NHAN LOAI khi may chu KHONG tra `kindLabel` (`#395` §2.1 — cung nhan voi man "Địa điểm vận hành",
 * `PLACE_KIND_LABEL` phia API). Kho cua mot khach hang la mot `COUNTERPARTY_SITE` cua phap nhan
 * khach — chi may chu biet dieu do, nen duong lui o day noi "đối tác"; `CUSTOMER` la hang rao KIEU CU
 * gan thang vao khach hang, va may chu goi no dung ten do.
 */
export const KNOWN_PLACE_KIND_LABEL: Readonly<Record<KnownPlaceKind, string>> = {
  DEPOT: 'Bãi xe',
  COUNTERPARTY_SITE: 'Nhà máy / kho đối tác',
  CUSTOMER: 'Điểm khách hàng (kiểu cũ)',
};

/** Nhan may chu dat cho kho cua MOT KHACH HANG (phap nhan co mat khach hang). */
export const CUSTOMER_SITE_KIND_LABEL = 'Địa điểm khách hàng';

/** Nhan loai cua MOT dia diem: nhan may chu tinh, khong co thi suy tu `kind`. */
export const knownPlaceKindLabel = (place: {
  readonly kind: KnownPlaceKind;
  readonly kindLabel?: string | null;
}): string =>
  place.kindLabel != null && place.kindLabel.trim().length > 0
    ? place.kindLabel.trim()
    : KNOWN_PLACE_KIND_LABEL[place.kind];

/**
 * Thu tu nhom: bai xe truoc (noi xe xuat phat), roi kho khach hang, roi nha may/kho doi tac, cuoi
 * cung diem khach hang kieu cu.
 */
const KNOWN_PLACE_ORDER: readonly string[] = [
  KNOWN_PLACE_KIND_LABEL.DEPOT,
  CUSTOMER_SITE_KIND_LABEL,
  KNOWN_PLACE_KIND_LABEL.COUNTERPARTY_SITE,
  KNOWN_PLACE_KIND_LABEL.CUSTOMER,
];

export interface KnownPlaceGroup {
  /** Khoa on dinh cua nhom = nhan loai. */
  readonly key: string;
  readonly title: string;
  readonly places: readonly KnownPlace[];
}

/** Nhom rong KHONG hien: mot tieu de treo tren khoang trong la mot cau hoi thua. */
export function groupKnownPlaces(places: readonly KnownPlace[]): readonly KnownPlaceGroup[] {
  const titles = [...new Set(places.map(knownPlaceKindLabel))].sort((left, right) => {
    const rank = (title: string) => {
      const index = KNOWN_PLACE_ORDER.indexOf(title);
      return index < 0 ? KNOWN_PLACE_ORDER.length : index;
    };
    return rank(left) - rank(right) || left.localeCompare(right, 'vi');
  });
  return titles.map((title) => ({
    key: title,
    title,
    places: places.filter((place) => knownPlaceKindLabel(place) === title),
  }));
}

/**
 * Dong nguon cua mot dia diem da biet: loai, va CHU khi co (`#395`: moi loai). Bai xe khong mang ten
 * chu — no la cua chinh cong ty.
 */
export function knownPlaceSourceLine(
  kind: KnownPlaceKind,
  owner: string | null,
  kindLabel?: string | null,
): string {
  const label = knownPlaceKindLabel({ kind, kindLabel });
  if (kind !== 'DEPOT' && owner !== null && owner.trim().length > 0) {
    return `${label} của ${owner.trim()}`;
  }
  return label;
}

/* ------------------------------------------------------------------ *
 * Hinh hoc cho man hinh — khong phai so cua nghiep vu
 * ------------------------------------------------------------------ */

/** Duong chim bay, km. Xem dau tep: KHONG phai quang duong xe chay. */
export function straightLineKm(from: GeoPoint, to: GeoPoint): number {
  return length(
    lineString([
      [from.longitude, from.latitude],
      [to.longitude, to.latitude],
    ]),
    { units: 'kilometers' },
  );
}

export const isNearlySamePoint = (from: GeoPoint, to: GeoPoint): boolean =>
  straightLineKm(from, to) * 1000 < NEARLY_SAME_POINT_METRES;

/**
 * "≈ 98 km" / "≈ 4,2 km" / "≈ 40 m". Duoi 10 km giu mot chu so le — hai diem cach 1,4 km va 1,0 km
 * la hai cau tra loi khac nhau cho cau hoi "chon dung cong chua".
 */
export function formatStraightLine(km: number): string {
  if (km < 1) return `≈ ${Math.round(km * 1000).toLocaleString('vi-VN')} m`;
  if (km < 10) {
    return `≈ ${km.toLocaleString('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`;
  }
  return `≈ ${Math.round(km).toLocaleString('vi-VN')} km`;
}

/**
 * Toa do de DOI CHIEU, khong phai de doc: 5 chu so le (~1 m), dau cham thap phan theo quy uoc toa
 * do quoc te — dau phay kieu Viet se lan voi dau phay ngan vi do/kinh do.
 */
export const formatCoordinates = (point: GeoPoint): string =>
  `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;

/** Khung bao cac diem, hoac `null` khi khong co diem nao. */
export function boundsOfPoints(points: readonly GeoPoint[]): MapBounds | null {
  if (points.length === 0) return null;
  const longitudes = points.map((point) => point.longitude);
  const latitudes = points.map((point) => point.latitude);
  return [
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ];
}

/**
 * Muc phong khi ban do CHON DIEM bay toi MOT diem (vi tri cua toi, mot ket qua duy nhat).
 *
 * Cao hon `MAX_FIT_ZOOM` (13) cua ban do bao cao co chu dich: bao cao can thay CA tuyen, con o day
 * nguoi dung dang chon DUNG cong kho — o muc 13 mot khu cong nghiep chi la mot vet mau.
 */
export const PICKER_POINT_ZOOM = 15;

/**
 * Khung nhin cua ban do chon diem cho mot khung bao — khong bao gio `null`.
 *
 * Khac `cameraFor` cua ban do bao cao (tra `null` khi khong co du lieu): cong cu CHON luon phai mo
 * ra o dau do. Khung hong hay rong thi mo khung Viet Nam — do la khung cua cong cu, khong phai du
 * lieu, va khong gi o day duoc luu.
 */
export function pickerCameraFor(bounds: MapBounds | null): MapCamera {
  const camera = cameraFor(bounds) ?? (cameraFor(VIETNAM_PICKER_BOUNDS) as MapCamera);
  return camera.kind === 'CENTER' ? { ...camera, zoom: PICKER_POINT_ZOOM } : camera;
}

/**
 * Khung dau tien cua man tao don: bao cua cac dia diem da biet (noi nguoi dung SE lay/giao), hoac
 * khung Viet Nam khi doanh nghiep chua co dia diem nao.
 */
export const initialPickerBounds = (places: readonly KnownPlace[]): MapBounds =>
  boundsOfPoints(places.map((place) => place.point)) ?? VIETNAM_PICKER_BOUNDS;

/** Met tren mot do vi do — du chinh xac cho mot vong sai so vai tram met. */
const METRES_PER_DEGREE_LATITUDE = 111_320;

/**
 * Vong SAI SO quanh vi tri trinh duyet, dang polygon GeoJSON de MapLibre ve dung ban kinh o moi muc
 * phong. Phep chieu phang cuc bo du tot: ban kinh vai chuc toi vai tram met, sai so hinh hoc nho hon
 * chinh sai so GPS ma no ve.
 */
export function accuracyRing(center: GeoPoint, radiusMetres: number, steps = 48) {
  const radius = Math.max(radiusMetres, 1);
  const latitudeSpan = radius / METRES_PER_DEGREE_LATITUDE;
  const longitudeSpan =
    radius /
    (METRES_PER_DEGREE_LATITUDE * Math.max(Math.cos((center.latitude * Math.PI) / 180), 0.01));
  const ring = Array.from({ length: steps }, (_, index) => {
    const angle = (index / steps) * 2 * Math.PI;
    return [
      center.longitude + longitudeSpan * Math.cos(angle),
      center.latitude + latitudeSpan * Math.sin(angle),
    ];
  });
  return polygon([[...ring, ring[0] as number[]]]);
}

/* ------------------------------------------------------------------ *
 * Vi tri trinh duyet — mot GOI Y chon diem, khong phai bang chung
 * ------------------------------------------------------------------ */

export type BrowserPositionFailure = 'DENIED' | 'TIMEOUT' | 'UNSUPPORTED';

/**
 * Cau cho van phong — khac cau cua lai xe (`driver-location.ts` noi ve "mốc"): o day khong co moc
 * nao bi chan, nguoi dung chi mat MOT cach chon diem, va van con ba cach khac.
 */
export const POSITION_FAILURE_MESSAGE: Readonly<Record<BrowserPositionFailure, string>> = {
  DENIED:
    'Trình duyệt chưa cho phép lấy vị trí. Bật quyền vị trí cho trang này, hoặc chọn trên bản đồ.',
  TIMEOUT: 'Chưa bắt được vị trí sau 15 giây. Thử lại, hoặc chọn trên bản đồ.',
  UNSUPPORTED: 'Trình duyệt này không đọc được vị trí. Hãy chọn trên bản đồ hoặc tìm địa điểm.',
};

/** "sai số khoảng ±35 m" — lam tron toi 5 m: con so chinh xac hon GPS la mot loi hua sai. */
export function accuracyPhrase(accuracyMetres: number | null): string {
  if (accuracyMetres === null || !Number.isFinite(accuracyMetres) || accuracyMetres <= 0) {
    return 'không rõ sai số';
  }
  const rounded = Math.max(5, Math.round(accuracyMetres / 5) * 5);
  return `sai số khoảng ±${rounded.toLocaleString('vi-VN')} m`;
}

export type PositionState =
  | { readonly status: 'IDLE' }
  | { readonly status: 'LOCATING' }
  | {
      readonly status: 'FOUND';
      readonly point: GeoPoint;
      readonly accuracyMetres: number | null;
    }
  | { readonly status: 'FAILED'; readonly message: string };

export const LOCATING_MESSAGE = 'Đang lấy vị trí…';

/**
 * Cau cho vung `role="status"` cua "Vị trí của tôi". Vung do LUON co mat (rong khi chua bam) de ca
 * cau dau tien cung duoc doc: trinh doc man hinh bo qua mot vung sinh ra da co san chu.
 */
export function positionStatusText(position: PositionState): string {
  switch (position.status) {
    case 'IDLE':
      return '';
    case 'LOCATING':
      return LOCATING_MESSAGE;
    case 'FOUND':
      return `Đã có vị trí của bạn, ${accuracyPhrase(position.accuracyMetres)}. Chọn đặt làm điểm lấy hàng hoặc điểm giao hàng.`;
    case 'FAILED':
      return position.message;
  }
}

/* ------------------------------------------------------------------ *
 * Ghim tren ban do chon diem
 * ------------------------------------------------------------------ */

export type PickerMarkerKind =
  | 'ORIGIN'
  | 'DESTINATION'
  | 'DEPOT'
  | 'COUNTERPARTY_SITE'
  | 'CUSTOMER'
  | 'SEARCH_RESULT'
  | 'MY_POSITION'
  /** `#395` — diem DANG DAT o man "Địa điểm vận hành": coc keo duoc, cung khuon Lay/Giao. */
  | 'PLACE';

/**
 * Mot ghim. Mau KHONG BAO GIO la tin hieu duy nhat: moi ghim co `badge` (chu tren ghim) hoac hinh
 * dang rieng, va `label` la ten doc duoc cho trinh doc man hinh.
 */
export interface PickerMarker {
  readonly key: string;
  readonly kind: PickerMarkerKind;
  readonly point: GeoPoint;
  readonly label: string;
  readonly badge: string | null;
  readonly isHighlighted: boolean;
  readonly isDraggable: boolean;
}
