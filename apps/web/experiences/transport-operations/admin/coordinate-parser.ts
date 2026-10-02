import type { GeoPoint } from '../transport-types';

/**
 * DAN TOA DO HOAC LIEN KET GOOGLE MAPS (`#395`) — ham THUAN.
 *
 * Duong NANG CAO cua man "Địa điểm vận hành", KHONG BAO GIO la duong chinh. No ton tai cho ba luc
 * that: (1) nguoi dung ban phim / trinh doc man hinh khong bam duoc ban do, (2) ban do nen khong tai
 * duoc (nen trang, khong duong xa), (3) khach gui mot liet ket Google Maps qua Zalo.
 *
 * KHONG doan: mot chuoi co hai so ma khong ro so nao la vi do thi TU CHOI kem mot cau noi ro — mot
 * diem bi dao vi/kinh do nam giua bien Dong, va hang rao cua no se cham sai moi chung cu.
 */

export type CoordinateSource = 'COORDINATES' | 'MAP_LINK' | 'GEO_URI';

export type CoordinateParse =
  | {
      readonly ok: true;
      readonly point: GeoPoint;
      readonly source: CoordinateSource;
      /** Hop le nhung dang ngo — vd nam ngoai Viet Nam. Khong chan. */
      readonly warning: string | null;
    }
  | { readonly ok: false; readonly message: string };

/** Khung Viet Nam (ca bien dao gan bo) — chi de CANH BAO, khong phai luat cua may chu. */
const VIETNAM = { minLat: 8.1, maxLat: 23.6, minLng: 102.1, maxLng: 110.0 };

export const PASTE_EMPTY = 'Dán toạ độ (ví dụ 21.0285, 105.8542) hoặc một liên kết Google Maps.';
export const PASTE_SHORT_LINK =
  'Liên kết rút gọn (maps.app.goo.gl) không chứa toạ độ. Mở liên kết trên điện thoại, nhấn giữ vào điểm rồi sao chép toạ độ, hoặc sao chép liên kết đầy đủ trên máy tính.';
export const PASTE_LINK_WITHOUT_POINT =
  'Liên kết này không chứa toạ độ. Mở nó trên Google Maps, nhấn giữ vào đúng điểm rồi sao chép toạ độ hiện ra.';
export const PASTE_UNREADABLE =
  'Chưa đọc được toạ độ. Dán theo dạng “vĩ độ, kinh độ”, ví dụ 21.0285, 105.8542.';
export const PASTE_OUTSIDE_VIETNAM = 'Điểm này nằm ngoài Việt Nam — kiểm tra lại trước khi lưu.';

const NUMBER = String.raw`[-+]?\d{1,3}(?:[.,]\d+)?`;

const toNumber = (text: string): number => Number(text.replace(',', '.'));

/** Kiem mot cap (vi do, kinh do) — noi RO khi hai so co ve bi dao. */
function validate(latitude: number, longitude: number, source: CoordinateSource): CoordinateParse {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { ok: false, message: PASTE_UNREADABLE };
  }
  if (Math.abs(latitude) > 90) {
    return {
      ok: false,
      message:
        Math.abs(longitude) <= 90
          ? 'Vĩ độ phải nằm trong khoảng −90 đến 90 — có vẻ hai số đang bị đảo (vĩ độ trước, kinh độ sau).'
          : 'Vĩ độ phải nằm trong khoảng −90 đến 90.',
    };
  }
  if (Math.abs(longitude) > 180) {
    return { ok: false, message: 'Kinh độ phải nằm trong khoảng −180 đến 180.' };
  }
  if (latitude === 0 && longitude === 0) {
    return { ok: false, message: 'Toạ độ (0, 0) không phải một địa điểm — kiểm tra lại.' };
  }
  const inVietnam =
    latitude >= VIETNAM.minLat &&
    latitude <= VIETNAM.maxLat &&
    longitude >= VIETNAM.minLng &&
    longitude <= VIETNAM.maxLng;
  return {
    ok: true,
    point: { latitude: round(latitude), longitude: round(longitude) },
    source,
    warning: inVietnam ? null : PASTE_OUTSIDE_VIETNAM,
  };
}

/** 7 chu so thap phan ≈ 1 cm — hon nua la so gia. */
const round = (value: number): number => Math.round(value * 1e7) / 1e7;

/** "21°01'42.6"N 105°51'15.1"E" — do/phut/giay kem huong. */
function parseDms(text: string): { latitude: number; longitude: number } | null {
  const part = String.raw`(\d{1,3})\s*°\s*(?:(\d{1,2})\s*['′]\s*)?(?:(\d{1,2}(?:[.,]\d+)?)\s*["″]\s*)?([NSEWnsew])`;
  const match = new RegExp(`${part}[\\s,;]+${part}`).exec(text);
  if (match === null) return null;
  const value = (deg?: string, min?: string, sec?: string, hemi?: string): number => {
    const magnitude =
      toNumber(deg ?? '0') + toNumber(min ?? '0') / 60 + toNumber(sec ?? '0') / 3600;
    return /[SWsw]/.test(hemi ?? '') ? -magnitude : magnitude;
  };
  const first = {
    value: value(match[1], match[2], match[3], match[4]),
    hemi: (match[4] ?? '').toUpperCase(),
  };
  const second = {
    value: value(match[5], match[6], match[7], match[8]),
    hemi: (match[8] ?? '').toUpperCase(),
  };
  const isLat = (hemi: string): boolean => hemi === 'N' || hemi === 'S';
  if (isLat(first.hemi) && !isLat(second.hemi))
    return { latitude: first.value, longitude: second.value };
  if (!isLat(first.hemi) && isLat(second.hemi))
    return { latitude: second.value, longitude: first.value };
  return null;
}

/** "21.0285, 105.8542" · "21.0285 105.8542" · "21.0285° N, 105.8542° E". */
function parsePair(text: string): { latitude: number; longitude: number } | null {
  const hemi = String.raw`\s*°?\s*([NSEWnsew])?`;
  const match = new RegExp(`^\\s*(${NUMBER})${hemi}\\s*[,;\\s]\\s*(${NUMBER})${hemi}\\s*$`).exec(
    text,
  );
  if (match === null) return null;
  const sign = (value: number, direction?: string): number =>
    direction !== undefined && /[SWsw]/.test(direction) ? -Math.abs(value) : value;
  const first = sign(toNumber(match[1] ?? ''), match[2]);
  const second = sign(toNumber(match[3] ?? ''), match[4]);
  const firstIsLongitude = match[2] !== undefined && /[EWew]/.test(match[2]);
  return firstIsLongitude
    ? { latitude: second, longitude: first }
    : { latitude: first, longitude: second };
}

/** Toa do trong mot liet ket ban do — uu tien GHIM cua dia diem (`!3d…!4d…`), roi tam ban do (`@`). */
function pointInLink(url: URL): { latitude: number; longitude: number } | null {
  const whole = decodeURIComponent(`${url.pathname}${url.search}${url.hash}`);
  const pin = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(whole);
  if (pin !== null) return { latitude: Number(pin[1]), longitude: Number(pin[2]) };
  for (const key of ['q', 'query', 'll', 'center', 'destination', 'daddr', 'sll']) {
    const raw = url.searchParams.get(key);
    if (raw === null) continue;
    const pair = parsePair(raw.replace(/^loc:/i, '').trim());
    if (pair !== null) return pair;
  }
  const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(whole);
  if (at !== null) return { latitude: Number(at[1]), longitude: Number(at[2]) };
  const search = /\/(?:search|place|dir)\/(-?\d+(?:\.\d+)?),\s*\+?(-?\d+(?:\.\d+)?)/.exec(whole);
  if (search !== null) return { latitude: Number(search[1]), longitude: Number(search[2]) };
  return null;
}

const SHORT_LINK_HOSTS = ['maps.app.goo.gl', 'goo.gl'];

export function parseCoordinateInput(raw: string): CoordinateParse {
  const text = raw.normalize('NFC').trim();
  if (text.length === 0) return { ok: false, message: PASTE_EMPTY };

  const geo = /^geo:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i.exec(text);
  if (geo !== null) return validate(Number(geo[1]), Number(geo[2]), 'GEO_URI');

  if (/^https?:\/\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return { ok: false, message: PASTE_UNREADABLE };
    }
    if (SHORT_LINK_HOSTS.includes(url.hostname.toLowerCase())) {
      return { ok: false, message: PASTE_SHORT_LINK };
    }
    const point = pointInLink(url);
    return point === null
      ? { ok: false, message: PASTE_LINK_WITHOUT_POINT }
      : validate(point.latitude, point.longitude, 'MAP_LINK');
  }

  const pair = parsePair(text) ?? parseDms(text);
  return pair === null
    ? { ok: false, message: PASTE_UNREADABLE }
    : validate(pair.latitude, pair.longitude, 'COORDINATES');
}
