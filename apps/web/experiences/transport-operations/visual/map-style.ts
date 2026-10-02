import type { StyleSpecification } from 'maplibre-gl';

/**
 * NEN BAN DO — mot quyet dinh co DO, khong phai mot mac dinh (#278 N1, #374).
 *
 * ===========================================================================
 * NEN CHI LA NEN. NGHIEP VU KHONG DOI THEO NHA CUNG CAP.
 *
 * OpenFreeMap, Google hay mot style tu khai CHI ve lop nen: tuyen, chang rong, moc va vet GPS van
 * la cac lop deck.gl ve tu du lieu cua may chu (`journey-layers.ts`), va `distanceKm` van la so cua
 * nghiep vu. Tep nay khong biet gi ve vong chay; no chi tra loi "nen nao, va vi sao".
 *
 * ===========================================================================
 * MAC DINH LA OPENFREEMAP — KHONG KHOA, KHONG GCP, KHONG THANH TOAN.
 *
 * `#374` (OWNER_DECISION_UPDATE_2026_09_23): chu du an khong bat duoc thanh toan GCP, nen nen mac
 * dinh doi sang instance CONG KHAI cua OpenFreeMap qua MapLibre dang co. Nguoi dung thay duong sa
 * that ma khong ai phai cau hinh gi. Google chi con la nha cung cap TUY CHON, va chi duoc goi khi
 * khai TUONG MINH `provider=google` — co khoa nam san trong moi truong cung khong du.
 *
 * Instance cong khai KHONG co SLA. Nen no hong (mang, chan, sap) thi ban do lui ve nen CUC BO va noi
 * ro — xem `maplibre-basemap-watch.ts`.
 *
 * ===========================================================================
 * NEN CUC BO KHONG PHAI MOT BAN DO GIA.
 *
 * `LOCAL_FALLBACK` ve mot nen TRONG — khong duong bo, khong ten tinh. Cai do la co y: mot nen
 * trong noi that rang he thong khong biet hinh dang mat dat o day, con duong di va cac moc VAN ve
 * dung toa do. Nen `notice` KHONG duoc `null` o nhanh cuc bo — `TransportMap` in no ra. CI bat buoc
 * khai `provider=local` de khong mot bai nao phu thuoc Internet.
 */

export const MAP_PROVIDERS = ['openfreemap', 'google', 'maplibre', 'local'] as const;
export type MapProvider = (typeof MAP_PROVIDERS)[number];

export const MAP_BASEMAP_SOURCES = [
  'OPENFREEMAP',
  'GOOGLE_MAPS',
  'CONFIGURED_STYLE_URL',
  'LOCAL_FALLBACK',
] as const;
export type MapBasemapSource = (typeof MAP_BASEMAP_SOURCES)[number];

/**
 * Style `liberty` cua instance CONG KHAI cua OpenFreeMap.
 *
 * Mot cho duy nhat trong ma nguon — style do chinh OpenFreeMap giu, trong do tro toi tile, sprite va
 * phong chu cung may chu `tiles.openfreemap.org`. Khong dang ky, khong khoa, cho phep dung thuong
 * mai; ghi nguon la BAT BUOC va MapLibre tu ve no tu `attribution` cua style.
 *
 * URL la hang so: khong mot ma khach, ma nguoi dung hay ma vong chay nao duoc gan vao — ban do goi
 * ra ngoai chi voi nhung gi moi trinh duyet mo trang nay deu goi giong het.
 */
export const OPENFREEMAP_LIBERTY_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/** Nen MapLibre ngoai hong THE NAO — do `maplibre-basemap-watch.ts` phan loai. */
export const MAPLIBRE_FAILURES = ['STYLE_FAILED', 'TILES_FAILED', 'TIMEOUT'] as const;
export type MapLibreFailure = (typeof MAPLIBRE_FAILURES)[number];

/**
 * VI SAO nen cuc bo — mot MA, khong phai mot cau van.
 *
 * Nguoi dung chi thay mot trong ba cau thong bao. Ma nay nam tren `data-basemap-fallback` cua khung
 * ban do de nguoi van hanh mo DevTools la biet cau hinh sai, OpenFreeMap khong tra loi, hay khoa
 * Google bi tu choi.
 */
export const BASEMAP_FALLBACK_REASONS = [
  'LOCAL_SELECTED',
  'UNKNOWN_PROVIDER',
  'MAPLIBRE_STYLE_MISSING',
  'OPENFREEMAP_STYLE_FAILED',
  'OPENFREEMAP_TILES_FAILED',
  'OPENFREEMAP_TIMEOUT',
  'MAPLIBRE_STYLE_FAILED',
  'MAPLIBRE_TILES_FAILED',
  'MAPLIBRE_TIMEOUT',
  'GOOGLE_KEY_MISSING',
  'GOOGLE_SCRIPT_FAILED',
  'GOOGLE_AUTH_FAILED',
  'GOOGLE_TIMEOUT',
] as const;
export type BasemapFallbackReason = (typeof BASEMAP_FALLBACK_REASONS)[number];

export type GoogleFailureReason = Extract<
  BasemapFallbackReason,
  'GOOGLE_SCRIPT_FAILED' | 'GOOGLE_AUTH_FAILED' | 'GOOGLE_TIMEOUT'
>;

export type TransportBasemap =
  | { readonly source: 'OPENFREEMAP'; readonly style: string; readonly notice: null }
  | {
      readonly source: 'GOOGLE_MAPS';
      /** Khoa trinh duyet — cong khai theo ban chat, bao ve bang gioi han HTTP referrer. */
      readonly apiKey: string;
      /**
       * Map ID (tuy chon). Co thi nen VECTOR va deck.gl ve chung ngu canh WebGL voi Google; khong
       * co thi nen RASTER — Google tu choi `WebGLOverlayView` khi thieu Map ID (do 23/09/2026).
       */
      readonly mapId: string | null;
      readonly notice: null;
    }
  | { readonly source: 'CONFIGURED_STYLE_URL'; readonly style: string; readonly notice: null }
  | {
      readonly source: 'LOCAL_FALLBACK';
      readonly style: StyleSpecification;
      readonly notice: string;
      readonly reason: BasemapFallbackReason;
    };

/** Hai nen MapLibre tai style tu MOT MAY CHU NGOAI — nen co the hong luc chay. */
export type ExternalStyleBasemap = Extract<
  TransportBasemap,
  { readonly source: 'OPENFREEMAP' | 'CONFIGURED_STYLE_URL' }
>;

export const isExternalStyle = (basemap: TransportBasemap): basemap is ExternalStyleBasemap =>
  basemap.source === 'OPENFREEMAP' || basemap.source === 'CONFIGURED_STYLE_URL';

/** Bien moi truong, doc nguyen — `resolveBasemap` moi la noi quyet dinh. */
export interface BasemapConfig {
  readonly provider?: string | null;
  readonly googleMapsApiKey?: string | null;
  readonly googleMapsMapId?: string | null;
  readonly styleUrl?: string | null;
}

/**
 * STYLE CUC BO — hop le voi MapLibre, va khong mot lan goi mang nao.
 *
 * `sources: {}` la diem chinh: khong tile, khong sprite, khong glyph. Nho vay ban do dung duoc
 * trong CI va tren mot may khong co duong ra Internet, va bai Playwright do duoc rang lop WebGL
 * that su khoi tao — chu khong do mot anh tile tai ve.
 */
export const LOCAL_BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'tx-map-background',
      type: 'background',
      paint: { 'background-color': '#eef1f4' },
    },
  ],
};

/** Nen cuc bo vi CAU HINH (`local`, ten la, `maplibre` thieu style). */
export const LOCAL_BASEMAP_NOTICE =
  'Nền bản đồ ngoài chưa được cấu hình, nên bản đồ chỉ vẽ đường đi và các mốc trên nền trống. ' +
  'Toạ độ vẫn đúng; phần thiếu là hình dạng đường sá.';

/**
 * Nen OpenFreeMap / style tu khai KHONG TAI DUOC luc chay.
 *
 * Noi NEN hong, khong noi toa do sai; va khong goi ten nha cung cap — voi nguoi dieu hanh, OpenFreeMap
 * la ha tang, khong phai viec cua ho. Ten nha cung cap nam o `data-basemap-fallback`.
 */
export const BASEMAP_UNAVAILABLE_NOTICE =
  'Không tải được nền bản đồ; tuyến và mốc vẫn đang được hiển thị đúng trên nền đơn giản.';

/**
 * Cau cua `#374` §6 cho nha cung cap TUY CHON Google — noi NEN hong, KHONG noi toa do sai.
 *
 * Nguoi van hanh da CO Y bat Google, nen cau noi dung ten Google: thieu khoa, khoa bi tu choi hay
 * mang chan Google deu doc ra cung mot cau.
 */
export const GOOGLE_BASEMAP_UNAVAILABLE_NOTICE =
  'Nền Google Maps chưa khả dụng; tuyến và mốc vẫn đang được hiển thị đúng trên nền đơn giản.';

/** Ba ly do CAU HINH — khong nha cung cap nao duoc goi, nen khong co gi "khong tai duoc". */
const CONFIGURATION_REASONS: ReadonlySet<BasemapFallbackReason> = new Set([
  'LOCAL_SELECTED',
  'UNKNOWN_PROVIDER',
  'MAPLIBRE_STYLE_MISSING',
]);

const noticeFor = (reason: BasemapFallbackReason): string => {
  if (reason.startsWith('GOOGLE_')) return GOOGLE_BASEMAP_UNAVAILABLE_NOTICE;
  return CONFIGURATION_REASONS.has(reason) ? LOCAL_BASEMAP_NOTICE : BASEMAP_UNAVAILABLE_NOTICE;
};

export const localFallback = (reason: BasemapFallbackReason): TransportBasemap => ({
  source: 'LOCAL_FALLBACK',
  style: LOCAL_BASEMAP_STYLE,
  notice: noticeFor(reason),
  reason,
});

/** Ma ly do cua mot lan nen MapLibre ngoai hong — tien to theo NGUON, duoi theo CACH hong. */
export const mapLibreFailureReason = (
  source: ExternalStyleBasemap['source'],
  failure: MapLibreFailure,
): BasemapFallbackReason =>
  source === 'OPENFREEMAP' ? `OPENFREEMAP_${failure}` : `MAPLIBRE_${failure}`;

/**
 * Rong hay chi co khoang trang deu la CHUA KHAI.
 *
 * Mot bien moi truong dat thanh chuoi rong la chuyen thuong gap trong `docker compose`, va no phai
 * doc ra giong het "khong dat" — chu khong lam MapLibre di tai mot URL rong, hay nap Google voi
 * mot khoa rong roi that bai voi mot loi khong ai hieu.
 */
const present = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed;
};

const OPENFREEMAP: TransportBasemap = {
  source: 'OPENFREEMAP',
  style: OPENFREEMAP_LIBERTY_STYLE_URL,
  notice: null,
};

/**
 * Phan quyet TAT DINH: cung cau hinh thi cung nen, va ham nay khong goi mang.
 *
 * `PROVIDER` de trong:
 *   - co `STYLE_URL` → style do (hanh vi truoc #374: mot moi truong da khai style rieng KHONG bi
 *     doi nen sau khi nang cap — style tu khai la mot lua chon tuong minh);
 *   - khong → OpenFreeMap.
 */
export function resolveBasemap(config: BasemapConfig): TransportBasemap {
  const provider = present(config.provider)?.toLowerCase() ?? null;
  const apiKey = present(config.googleMapsApiKey);
  const styleUrl = present(config.styleUrl);

  if (provider === null) {
    return styleUrl === null
      ? OPENFREEMAP
      : { source: 'CONFIGURED_STYLE_URL', style: styleUrl, notice: null };
  }
  if (provider === 'openfreemap') return OPENFREEMAP;
  if (provider === 'google') {
    return apiKey === null
      ? localFallback('GOOGLE_KEY_MISSING')
      : { source: 'GOOGLE_MAPS', apiKey, mapId: present(config.googleMapsMapId), notice: null };
  }
  if (provider === 'maplibre') {
    return styleUrl === null
      ? localFallback('MAPLIBRE_STYLE_MISSING')
      : { source: 'CONFIGURED_STYLE_URL', style: styleUrl, notice: null };
  }
  return localFallback(provider === 'local' ? 'LOCAL_SELECTED' : 'UNKNOWN_PROVIDER');
}

/** Nhung gi nen THAT SU gap luc chay — moi nha cung cap mot o, `null` = chua hong. */
export interface BasemapRuntimeFailures {
  readonly google?: GoogleFailureReason | null;
  readonly mapLibre?: MapLibreFailure | null;
}

/**
 * Nen THAT SU dang ve — sau khi nha cung cap da tra loi.
 *
 * `resolveBasemap` chi biet cau hinh. OpenFreeMap co the khong tra loi, khoa Google co the bi tu
 * choi; khi do ban do lui ve nen cuc bo va noi ro — chu khong de lai mot khung trong hay mot hop
 * thoai loi. Loi cua mot nha cung cap khong lam lui nen cua mot nha cung cap khac.
 */
export function effectiveBasemap(
  configured: TransportBasemap,
  failures: BasemapRuntimeFailures,
): TransportBasemap {
  if (configured.source === 'GOOGLE_MAPS') {
    const failure = failures.google ?? null;
    return failure === null ? configured : localFallback(failure);
  }
  if (isExternalStyle(configured)) {
    const failure = failures.mapLibre ?? null;
    return failure === null
      ? configured
      : localFallback(mapLibreFailureReason(configured.source, failure));
  }
  return configured;
}

/**
 * Nen cho BAN DO CHON DIEM cua man tao don (`#379`) — mot quy tac, mot ngoai le.
 *
 * Moi cau hinh giu NGUYEN nen cua no (OpenFreeMap, style tu khai, cuc bo), tru Google: nen Google
 * cua ta (`GoogleBasemap`) tu dung `google.maps.Map` va khong co duong bam-de-lay-toa-do hay ghim
 * keo duoc. Thay vi dung mot ban do chon diem thu hai tren API Google, ban do chon diem dung
 * OpenFreeMap — nen MAC DINH, khong khoa, khong thanh toan. Ban do bao cao van theo Google.
 *
 * Khong them gia tri nao vao `MAP_PROVIDERS`/`MAP_BASEMAP_SOURCES`/`BASEMAP_FALLBACK_REASONS`:
 * ngoai le nay la cua mot BE MAT, khong phai mot nha cung cap moi.
 */
export function pickerBasemap(configured: TransportBasemap): TransportBasemap {
  return configured.source === 'GOOGLE_MAPS' ? OPENFREEMAP : configured;
}

/**
 * Doc bien moi truong — TUNG TEN VIET DU.
 *
 * Next.js thay `process.env.NEXT_PUBLIC_*` bang gia tri luc BUILD, va chi khi ten duoc viet nguyen
 * van; `process.env[ten]` se ra `undefined` trong trinh duyet. Doi bien = build lai, khong phai
 * chi khoi dong lai (xem `docs/phat-trien/van-hanh/ban-do-nen.md`).
 */
export const readBasemapEnv = (): BasemapConfig => ({
  provider: process.env.NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER,
  googleMapsApiKey: process.env.NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_API_KEY,
  googleMapsMapId: process.env.NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_MAP_ID,
  styleUrl: process.env.NEXT_PUBLIC_TRANSPORT_MAP_STYLE_URL,
});
