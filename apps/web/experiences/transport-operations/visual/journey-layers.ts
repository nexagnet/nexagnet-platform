import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { ChartPalette } from './chart-options';
import type { JourneyMapModel, JourneyMarker, JourneySegment } from '../workspace/journey';

/**
 * LOP NGHIEP VU CUA BAN DO — mot cho, dung chung cho moi nen (#278 N2/N5, #374 §2).
 *
 * ===========================================================================
 * NEN DOI, LOP KHONG DOI.
 *
 * Google (`GoogleMapsOverlay`) va MapLibre (`MapboxOverlay`) nhan CUNG mot mang lop tu ham nay.
 * Nho vay doi nen khong the lam doi nghia cua mot doan duong: chang rong van do va day hon, vet GPS
 * tho van la toa do tho. Toa do di THANG tu `JourneySegment.coordinates` — khong mot phep noi suy,
 * khong "bam duong" theo hinh hoc cua nha cung cap nen.
 *
 * ===========================================================================
 * MAU DO CUA CHANG RONG DEN TU DU LIEU, KHONG TU MOT NHANH `if` CUA MAN HINH.
 *
 * `segment.role` do may chu dat, tu `TransportRunLeg.kind`. `#274` §4 doi chang rong mau DO, va
 * mau do o day di kem hai thu nua de mau khong phai tin hieu duy nhat (`#278` N2): duong rong duoc
 * ve DAY hon, va chu giai ben duoi ban do goi ten no.
 */

export const JOURNEY_LAYER_IDS = {
  casing: 'tx-journey-casing',
  paths: 'tx-journey-paths',
  markers: 'tx-journey-markers',
} as const;

export const toRgb = (hex: string): [number, number, number] => {
  const value = hex.trim().replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : value;
  const parsed = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(parsed)) return [0, 0, 0];
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
};

/**
 * DO DAY theo LOAI DUONG — de nguoi doc phan biet duoc ba nguon.
 *
 * `#278` N5 doi *"planned route vs actual/matched route visually distinguishable"*. Tuyen ke hoach
 * hom nay khong bao gio co diem (`NO_ROUTE_PROVIDER`), nhung be rong cua no van duoc khai o day:
 * cho vao san se lam ngay Lane M co du lieu thi khong ai phai nghi lai xem ve no the nao.
 */
export const WIDTH_BY_PATH: Readonly<Record<JourneySegment['pathKind'], number>> = {
  PLANNED: 2,
  CHECKPOINT_ANCHORED: 5,
  RAW_OBSERVED: 3,
};

/** Chang rong ve DAY hon — tin hieu thu hai ben canh mau. */
export const EMPTY_EXTRA_WIDTH_PX = 2;

/**
 * VIEN SANG quanh tuyen — de tuyen noi tren nen co duong sa that (#374 §9).
 *
 * Nen Google co duong vang, cam, trang; mot tuyen xanh dam hay do dam nam de len duong quoc lo se
 * lan vao no. Vien mau giay ben duoi la cach ban do in van lam: tuyen doc ra duoc tren moi nen ma
 * khong phai doi mau nghiep vu.
 */
export const CASING_EXTRA_WIDTH_PX = 3;

export const segmentWidthPx = (segment: JourneySegment): number =>
  WIDTH_BY_PATH[segment.pathKind] + (segment.role === 'EMPTY' ? EMPTY_EXTRA_WIDTH_PX : 0);

const pathOf = (segment: JourneySegment): [number, number][] =>
  segment.coordinates as unknown as [number, number][];

export function buildJourneyLayers(
  model: JourneyMapModel,
  palette: ChartPalette,
): [PathLayer<JourneySegment>, PathLayer<JourneySegment>, ScatterplotLayer<JourneyMarker>] {
  const loaded = toRgb(palette.loaded);
  const empty = toRgb(palette.empty);
  const paper = toRgb(palette.paper);
  const segments = [...model.segments];

  return [
    new PathLayer<JourneySegment>({
      id: JOURNEY_LAYER_IDS.casing,
      data: segments,
      widthUnits: 'pixels',
      widthMinPixels: 2,
      getPath: pathOf,
      getColor: [...paper, 230],
      getWidth: (segment) => segmentWidthPx(segment) + CASING_EXTRA_WIDTH_PX,
      capRounded: true,
      jointRounded: true,
      antialiasing: true,
    }),
    new PathLayer<JourneySegment>({
      id: JOURNEY_LAYER_IDS.paths,
      data: segments,
      widthUnits: 'pixels',
      widthMinPixels: 2,
      getPath: pathOf,
      /* Mau tu DU LIEU: `role` do may chu dat tu `TransportRunLeg.kind`. */
      getColor: (segment) => (segment.role === 'EMPTY' ? empty : loaded),
      getWidth: segmentWidthPx,
      capRounded: true,
      jointRounded: true,
      /*
       * Nen Google vector dung chung ngu canh WebGL khong co khu rang cua (MSAA); deck.gl 9.4 bu
       * bang khu rang cua phan tich trong shader. Tren nen MapLibre no vo hai.
       */
      antialiasing: true,
      pickable: true,
    }),
    new ScatterplotLayer<JourneyMarker>({
      id: JOURNEY_LAYER_IDS.markers,
      data: [...model.markers],
      radiusUnits: 'pixels',
      getRadius: 6,
      getPosition: (marker) => marker.coordinate as unknown as [number, number],
      getFillColor: toRgb(palette.ink),
      stroked: true,
      lineWidthMinPixels: 2,
      getLineColor: paper,
      pickable: true,
    }),
  ];
}
