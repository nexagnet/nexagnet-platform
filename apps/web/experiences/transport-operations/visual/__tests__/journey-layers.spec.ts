import { describe, expect, it } from 'vitest';
import {
  CASING_EXTRA_WIDTH_PX,
  JOURNEY_LAYER_IDS,
  buildJourneyLayers,
  segmentWidthPx,
  toRgb,
} from '../journey-layers';
import { FALLBACK_PALETTE } from '../chart-options';
import type { JourneyMapModel, JourneyMarker, JourneySegment } from '../../workspace/journey';

/*
 * `#374` §2/§4 — NEN DOI, LOP NGHIEP VU KHONG DOI.
 *
 * Google va MapLibre nhan CUNG mot mang lop tu `buildJourneyLayers`. Cac bai duoi day khoa ba
 * dieu: moi doan va moi moc deu vao overlay, toa do di THANG tu du lieu (khong hinh hoc cua nha
 * cung cap nen nao chen vao), va chang RONG van doc ra khac chang CO HANG.
 */

const segment = (over: Partial<JourneySegment> = {}): JourneySegment => ({
  key: 'l-1:CHECKPOINT_ANCHORED',
  legSequence: 1,
  role: 'LOADED',
  pathKind: 'CHECKPOINT_ANCHORED',
  coordinates: [
    [105.8342, 21.0278],
    [106.6881, 20.8449],
  ],
  ...over,
});

const marker = (over: Partial<JourneyMarker> = {}): JourneyMarker => ({
  key: 'l-1:origin',
  legSequence: 1,
  role: 'ORIGIN',
  coordinate: [105.8342, 21.0278],
  label: 'Chặng 1 · điểm lấy hàng',
  ...over,
});

const model = (over: Partial<JourneyMapModel> = {}): JourneyMapModel => ({
  segments: [
    segment({
      key: 'l-0:RAW_OBSERVED',
      legSequence: 0,
      role: 'EMPTY',
      pathKind: 'RAW_OBSERVED',
      coordinates: [
        [105.79, 21.0],
        [105.81, 21.01],
        [105.8342, 21.0278],
      ],
    }),
    segment(),
  ],
  markers: [
    marker(),
    marker({ key: 'l-1:destination', role: 'DESTINATION', coordinate: [106.6881, 20.8449] }),
  ],
  gaps: [],
  hasGeometry: true,
  rawSampledFrom: 3,
  ...over,
});

type Accessor<T, R> = (object: T) => R;

describe('lop nghiep vu cua ban do — dung chung cho moi nen', () => {
  it('ba lop, thu tu co dinh: vien sang, tuyen, moc (moc ve tren cung)', () => {
    const layers = buildJourneyLayers(model(), FALLBACK_PALETTE);

    expect(layers.map((layer) => layer.id)).toEqual([
      JOURNEY_LAYER_IDS.casing,
      JOURNEY_LAYER_IDS.paths,
      JOURNEY_LAYER_IDS.markers,
    ]);
  });

  it('MOI JourneySegment deu vao overlay — ca lop tuyen lan lop vien', () => {
    const input = model();
    const [casing, paths] = buildJourneyLayers(input, FALLBACK_PALETTE);

    expect(paths.props.data).toEqual(input.segments);
    expect(casing.props.data).toEqual(input.segments);
  });

  it('MOI moc deu vao overlay, dung toa do cua no', () => {
    const input = model();
    const [, , markers] = buildJourneyLayers(input, FALLBACK_PALETTE);
    const getPosition = markers.props.getPosition as Accessor<JourneyMarker, unknown>;

    expect(markers.props.data).toEqual(input.markers);
    expect(input.markers.map((entry) => getPosition(entry))).toEqual([
      [105.8342, 21.0278],
      [106.6881, 20.8449],
    ]);
  });

  /*
   * `#374` §4: hinh hoc cua Google KHONG duoc thanh su that. Toa do ve ra phai la CHINH mang
   * toa do cua may chu — khong noi suy, khong bam duong, khong lam tron.
   */
  it('toa do di THANG tu du lieu — khong mot phep bien doi nao', () => {
    const input = model();
    const [casing, paths] = buildJourneyLayers(input, FALLBACK_PALETTE);
    const getPath = paths.props.getPath as Accessor<JourneySegment, unknown>;
    const getCasingPath = casing.props.getPath as Accessor<JourneySegment, unknown>;

    for (const entry of input.segments) {
      expect(getPath(entry)).toBe(entry.coordinates);
      expect(getCasingPath(entry)).toBe(entry.coordinates);
    }
  });

  it('chang RONG ve mau DO cua bang mau va DAY hon chang co hang', () => {
    const [, paths] = buildJourneyLayers(model(), FALLBACK_PALETTE);
    const getColor = paths.props.getColor as Accessor<JourneySegment, unknown>;
    const empty = segment({ role: 'EMPTY' });
    const loaded = segment({ role: 'LOADED' });

    expect(getColor(empty)).toEqual(toRgb(FALLBACK_PALETTE.empty));
    expect(getColor(loaded)).toEqual(toRgb(FALLBACK_PALETTE.loaded));
    expect(getColor(empty)).not.toEqual(getColor(loaded));
    expect(segmentWidthPx(empty)).toBeGreaterThan(segmentWidthPx(loaded));
  });

  it('ba loai duong co ba be rong: moc neo > GPS tho > ke hoach', () => {
    const anchored = segmentWidthPx(segment({ pathKind: 'CHECKPOINT_ANCHORED' }));
    const raw = segmentWidthPx(segment({ pathKind: 'RAW_OBSERVED' }));
    const planned = segmentWidthPx(segment({ pathKind: 'PLANNED' }));

    expect(anchored).toBeGreaterThan(raw);
    expect(raw).toBeGreaterThan(planned);
  });

  it('vien sang luon rong hon tuyen no bao — tuyen noi tren nen co duong sa', () => {
    const [casing, paths] = buildJourneyLayers(model(), FALLBACK_PALETTE);
    const casingWidth = casing.props.getWidth as Accessor<JourneySegment, number>;
    const pathWidth = paths.props.getWidth as Accessor<JourneySegment, number>;

    for (const entry of model().segments) {
      expect(casingWidth(entry)).toBe(pathWidth(entry) + CASING_EXTRA_WIDTH_PX);
    }
  });

  /*
   * Lop deck.gl da duoc mot `Deck` khoi tao thi thuoc ngu canh WebGL cua `Deck` do. Khi Google hong
   * SAU khi da ve, nen cuc bo phai nhan lop MOI — dua lai cung doi tuong lam deck.gl nem `assertion
   * failed` va ban do hien ra khong co tuyen (do tren Google that 23/09/2026). Cac nen goi ham nay
   * trong chinh effect cua chung; bai nay khoa rang ham luon tra doi tuong moi.
   */
  it('moi lan goi cho lop MOI — hai nen khong bao gio dung chung mot doi tuong lop', () => {
    const input = model();
    const first = buildJourneyLayers(input, FALLBACK_PALETTE);
    const second = buildJourneyLayers(input, FALLBACK_PALETTE);

    first.forEach((layer, index) => {
      expect(layer).not.toBe(second[index]);
      expect(layer.id).toBe(second[index]?.id);
    });
  });

  it('khong co gi de ve thi lop RONG — khong bia mot doan hay mot moc nao', () => {
    const [casing, paths, markers] = buildJourneyLayers(
      model({ segments: [], markers: [], hasGeometry: false, rawSampledFrom: 0 }),
      FALLBACK_PALETTE,
    );

    expect(casing.props.data).toEqual([]);
    expect(paths.props.data).toEqual([]);
    expect(markers.props.data).toEqual([]);
  });

  it('mau hex doc duoc ca dang ngan, va mau hong lui ve den thay vi nem', () => {
    expect(toRgb('#fff')).toEqual([255, 255, 255]);
    expect(toRgb(' #94271e ')).toEqual([148, 39, 30]);
    expect(toRgb('not-a-colour')).toEqual([0, 0, 0]);
  });
});
