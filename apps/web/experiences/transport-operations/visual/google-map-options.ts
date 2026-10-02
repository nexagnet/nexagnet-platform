import type { GoogleMapsLibraries } from './google-maps-loader';
import type { MapCamera } from './map-camera';

/**
 * TUY CHON BAN DO GOOGLE — nen, khong phai mot san pham ban do thu hai (#374 §1/§3/§6).
 *
 * - `ROADMAP` mac dinh; Dia hinh / Ve tinh / Ket hop nam trong MOT menu tha xuong nho o goc — mot
 *   dieu khien phu, khong phai giao dien chinh.
 * - CO Map ID → `VECTOR`: `GoogleMapsOverlay` ve deck.gl VAO CHUNG ngu canh WebGL cua Google
 *   (interleaved, `WebGLOverlayView`) — mot canvas, mot vong ve, nen keo/phong tuyen khong the lech
 *   khoi duong; va nhan duong cua Google ve DE LEN tuyen thay vi bi tuyen che.
 * - KHONG Map ID → `RASTER`, noi thang ra: Google tu choi `WebGLOverlayView` khi thieu Map ID
 *   ("initialized without a valid map ID", do tren Google that 23/09/2026), nen xin `VECTOR` o day
 *   chi de nhan mot canh bao roi van ve raster. Tren raster, canvas cua deck nam TRONG pane cua
 *   Google va di cung khi keo; nhan duong nam duoi tuyen.
 * - May khong ho tro vector thi Google tu lui ve raster, va overlay tu doi sang `OverlayView`.
 * - Tat Street View, xoay/nghieng, va bieu tuong dia diem bam duoc: khong Places, khong mot cua
 *   so thong tin nao cua Google chen len bao cao van tai.
 * - `cooperative`: ban do nam giua mot trang cuon; lan chuot khong duoc cuop cuon trang.
 */
export const GOOGLE_MAP_TYPE_IDS = ['roadmap', 'terrain', 'satellite', 'hybrid'] as const;

export function googleMapOptions(
  libraries: GoogleMapsLibraries,
  mapId: string | null,
): google.maps.MapOptions {
  return {
    mapTypeId: 'roadmap',
    ...(mapId === null ? { renderingType: 'RASTER' } : { mapId, renderingType: 'VECTOR' }),
    disableDefaultUI: true,
    zoomControl: true,
    scaleControl: true,
    mapTypeControl: true,
    mapTypeControlOptions: {
      mapTypeIds: [...GOOGLE_MAP_TYPE_IDS],
      style: libraries.maps.MapTypeControlStyle.DROPDOWN_MENU,
      position: libraries.core.ControlPosition.BLOCK_START_INLINE_START,
    },
    streetViewControl: false,
    clickableIcons: false,
    gestureHandling: 'cooperative',
    headingInteractionEnabled: false,
    tiltInteractionEnabled: false,
  };
}

/** Dat khung nhin len mot ban do Google. Chi nhan `MapCamera` da kiem — khong bao gio `null`. */
export function applyGoogleCamera(
  map: Pick<google.maps.Map, 'fitBounds' | 'moveCamera'>,
  camera: MapCamera,
): void {
  if (camera.kind === 'CENTER') {
    map.moveCamera({ center: { lat: camera.latitude, lng: camera.longitude }, zoom: camera.zoom });
    return;
  }
  const [west, south, east, north] = camera.bounds;
  map.fitBounds({ west, south, east, north }, camera.paddingPx);
}
