/**
 * KHUNG NHIN theo DU LIEU — dung chung cho nen Google va nen MapLibre (#278 N5, #374 §7).
 *
 * ===========================================================================
 * KHONG CO TOA DO MAC DINH NAO.
 *
 * `bounds` den tu `boundsOf()` — segments + markers THAT. `null` hay mot khung hong (NaN, ngoai
 * [-180,180]/[-90,90]) cho ra `null`, va ban do KHONG duoc ve: mot ban do "bay ve giua Viet Nam"
 * doc y het mot ban do co du lieu ma xe dang o cho khac.
 *
 * ===========================================================================
 * MOT DIEM THI CANH GIUA, KHONG `fitBounds`.
 *
 * Khung rong 0 dua vao `fitBounds` cua Google se phong toi muc toi da (~21) — nhin thay mot mai
 * nha chu khong thay con duong. Mot diem duy nhat vi the la `CENTER` voi muc phong co dinh; hai
 * diem sat nhau thi khung duoc NOI toi mot be rong toi thieu truoc khi fit.
 */

export type MapBounds = readonly [west: number, south: number, east: number, north: number];

export type MapCamera =
  | {
      readonly kind: 'FIT';
      /** `[tay, nam, dong, bac]`, da noi toi `MIN_FIT_SPAN_DEG` moi chieu. */
      readonly bounds: MapBounds;
      readonly paddingPx: number;
      readonly maxZoom: number;
    }
  | {
      readonly kind: 'CENTER';
      readonly longitude: number;
      readonly latitude: number;
      readonly zoom: number;
    };

/** Le quanh tuyen khi fit — du de moc o mep khong nam duoi nut phong to. */
export const FIT_PADDING_PX = 48;

/** Muc phong toi da cua mot lan fit, va cua mot diem duy nhat — ~ mot quan/huyen tren khung 420px. */
export const MAX_FIT_ZOOM = 13;

/**
 * Be rong khung nho nhat, tinh bang do. 0,05° ≈ 5 km o vi do Viet Nam: tren khung cao 420px no
 * vua khit o muc ~13, nen Google (khong co `maxZoom` cho `fitBounds`) va MapLibre dung cung mot tran.
 */
export const MIN_FIT_SPAN_DEG = 0.05;

const isLongitude = (value: number): boolean =>
  Number.isFinite(value) && value >= -180 && value <= 180;
const isLatitude = (value: number): boolean =>
  Number.isFinite(value) && value >= -90 && value <= 90;

const widen = (low: number, high: number, min: number, max: number): [number, number] => {
  const span = high - low;
  if (span >= MIN_FIT_SPAN_DEG) return [low, high];
  const middle = (low + high) / 2;
  const half = MIN_FIT_SPAN_DEG / 2;
  return [Math.max(min, middle - half), Math.min(max, middle + half)];
};

export function cameraFor(bounds: MapBounds | null): MapCamera | null {
  if (bounds === null) return null;
  const [west, south, east, north] = bounds;
  if (!isLongitude(west) || !isLongitude(east) || !isLatitude(south) || !isLatitude(north)) {
    return null;
  }
  if (west > east || south > north) return null;

  if (west === east && south === north) {
    return { kind: 'CENTER', longitude: west, latitude: south, zoom: MAX_FIT_ZOOM };
  }

  const [fitWest, fitEast] = widen(west, east, -180, 180);
  const [fitSouth, fitNorth] = widen(south, north, -90, 90);
  return {
    kind: 'FIT',
    bounds: [fitWest, fitSouth, fitEast, fitNorth],
    paddingPx: FIT_PADDING_PX,
    maxZoom: MAX_FIT_ZOOM,
  };
}

/**
 * Khoa GIA TRI cua khung — de camera chi chay lai khi TOA DO doi.
 *
 * Man hinh tinh lai `boundsOf()` o moi lan ve, nen mang `bounds` la mot doi tuong MOI moi lan du
 * so khong doi. Neu camera chay theo doi tuong, moi lan React Query lam tuoi du lieu se keo ban do
 * ve khung cu va xoa mat cho nguoi dung vua keo/phong toi.
 */
export const boundsKey = (bounds: MapBounds | null): string =>
  bounds === null ? 'none' : bounds.join(',');
