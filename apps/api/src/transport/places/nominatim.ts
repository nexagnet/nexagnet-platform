import { parseGeoPoint, type GeoPoint } from '../geo/geo-point.js';
import type { PlaceCandidate } from './place-search.types.js';

/**
 * NOMINATIM — phan THUAN: dung URL va doc phan hoi. Khong mot lan goi mang nao o tep nay.
 *
 * Tach khoi adapter theo dung khuon `here-truck-routing.ts`: hai cho de sai nhat (tham so nao di ra
 * ngoai, va doc toa do tu chuoi) co bai kiem thu ngoai tuyen, con adapter chi con mot lan `fetch`.
 *
 * ===========================================================================
 * DANH SACH THAM SO DI RA NGOAI LA DONG, VA DO LA RANG BUOC RIENG TU
 *
 * Tim: `q`, `format`, `accept-language`, `countrycodes`, `limit` (+ `email` khi nguoi van hanh
 * khai). Tim nguoc: `lat`, `lon`, `format`, `accept-language`, `zoom` (+ `email`). Khong mot ma
 * khach, ma don, ma nguoi dung hay ten goi khach nao co cho di vao — ham nhan DUNG chuoi can tim
 * (hoac diem can tim nguoc) va cau hinh cua nguoi van hanh, khong nhan gi khac.
 *
 * `email` la dia chi LIEN HE CUA NGUOI VAN HANH (chinh sach Nominatim khuyen gui kem khi goi nhieu),
 * khong phai email cua nguoi dang dung man hinh.
 */

export interface NominatimConfig {
  /** Goc URL, khong co dau `/` cuoi — vd `https://nominatim.openstreetmap.org`. */
  readonly baseUrl: string;
  /** User-Agent DINH DANH ung dung — chinh sach Nominatim cam UA mac dinh cua thu vien. */
  readonly userAgent: string;
  readonly contactEmail: string | null;
}

/** So ket qua toi da moi lan tim. Nam goi y la du de chon; nhieu hon chi la nhieu hon de doc. */
export const NOMINATIM_SEARCH_LIMIT = 5;

/**
 * Muc chi tiet khi tim nguoc: 17 = "duong/ngo". Mot diem bam tren ban do can ten con duong gan
 * nhat, khong phai ten tinh (muc thap) hay so nha doan mo (muc 18).
 */
export const NOMINATIM_REVERSE_ZOOM = 17;

/** Tieng Viet truoc, tieng Anh sau — ten dia danh Viet Nam hien dung chinh ta nguoi dung doc. */
const ACCEPT_LANGUAGE = 'vi,en';

/**
 * Lam tron toa do tim nguoc toi 5 chu so (~1,1 m) — BANG DUNG do lam tron cua khoa bo nho dem.
 *
 * Gui cung con so ma khoa dem dung thi "ket qua dem" va "ket qua neu hoi lai" la mot cau hoi, khong
 * phai hai cau hoi rat gan nhau. Va mot diem bam tay tren ban do khong co do chinh xac duoi met.
 */
export const formatReverseCoordinate = (value: number): string => value.toFixed(5);

export function buildNominatimSearchUrl(config: NominatimConfig, query: string): string {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    'accept-language': ACCEPT_LANGUAGE,
    countrycodes: 'vn',
    limit: String(NOMINATIM_SEARCH_LIMIT),
  });
  if (config.contactEmail !== null) params.set('email', config.contactEmail);
  return `${config.baseUrl}/search?${params.toString()}`;
}

export function buildNominatimReverseUrl(config: NominatimConfig, point: GeoPoint): string {
  const params = new URLSearchParams({
    lat: formatReverseCoordinate(point.latitude),
    lon: formatReverseCoordinate(point.longitude),
    format: 'jsonv2',
    'accept-language': ACCEPT_LANGUAGE,
    zoom: String(NOMINATIM_REVERSE_ZOOM),
  });
  if (config.contactEmail !== null) params.set('email', config.contactEmail);
  return `${config.baseUrl}/reverse?${params.toString()}`;
}

/* ------------------------------------------------------------------ *
 * Doc phan hoi
 * ------------------------------------------------------------------ */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const trimmedText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text === '' ? null : text;
};

/**
 * Nominatim tra toa do dang CHUOI ("21.0285"). Doc CHAT: `Number('')` la 0 va `Number(' 1 ')` la
 * 1, nen mot chuoi rong se thanh vi do 0 — mot diem hop le giua xich dao. Chi nhan dung dang so
 * thap phan; con lai thanh `NaN` va de `parseGeoPoint` tu choi.
 */
const DECIMAL = /^-?\d+(?:\.\d+)?$/;
const coordinateOf = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && DECIMAL.test(value.trim())) return Number(value.trim());
  return Number.NaN;
};

/**
 * Mot muc ket qua -> mot goi y, hoac `null` neu khong dung duoc.
 *
 * Ten ngan: `name` khi co; khong thi doan DAU cua `display_name` (truoc dau phay dau tien) — mot
 * dia chi dai nam cap hanh chinh la dong phu, khong phai ten. Khong co ca hai thi bo: mot goi y
 * khong ten la mot cham tren ban do ma nguoi dung khong biet chon de lam gi.
 */
function toCandidate(item: unknown): PlaceCandidate | null {
  if (!isRecord(item)) return null;
  const parsed = parseGeoPoint(coordinateOf(item['lat']), coordinateOf(item['lon']));
  if (!parsed.ok) return null;

  const address = trimmedText(item['display_name']);
  const label = trimmedText(item['name']) ?? trimmedText(address?.split(',')[0]);
  if (label === null) return null;
  return { label, address, point: parsed.point };
}

/**
 * Than phan hoi `/search` -> danh sach goi y, hoac `null` khi than KHONG PHAI mot mang (tuc nha
 * cung cap tra loi sai hinh dang — adapter doi `null` thanh `PROVIDER_UNAVAILABLE`, KHONG thanh
 * "khong tim thay": hai cau do dan nguoi dung toi hai hanh dong khac nhau).
 */
export function parseNominatimSearch(body: unknown): readonly PlaceCandidate[] | null {
  if (!Array.isArray(body)) return null;
  return body
    .map(toCandidate)
    .filter((candidate): candidate is PlaceCandidate => candidate !== null)
    .slice(0, NOMINATIM_SEARCH_LIMIT);
}

export type NominatimReverseParse =
  { readonly ok: true; readonly candidate: PlaceCandidate | null } | { readonly ok: false };

/**
 * Than phan hoi `/reverse`.
 *
 * Mot diem giua bien tra `{"error": "Unable to geocode"}` voi ma 200 — do la "khong co ten o day",
 * mot ket qua HOP LE (`candidate: null`), khong phai mot su co. Mot than khong phai object moi la
 * sai hinh dang.
 */
export function parseNominatimReverse(body: unknown): NominatimReverseParse {
  if (!isRecord(body)) return { ok: false };
  if ('error' in body) return { ok: true, candidate: null };
  return { ok: true, candidate: toCandidate(body) };
}
