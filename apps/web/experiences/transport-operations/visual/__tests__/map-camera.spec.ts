import { describe, expect, it } from 'vitest';
import {
  FIT_PADDING_PX,
  MAX_FIT_ZOOM,
  MIN_FIT_SPAN_DEG,
  boundsKey,
  cameraFor,
  type MapBounds,
} from '../map-camera';
import { boundsOf, type JourneyMapModel } from '../../workspace/journey';

/*
 * `#374` §7 — khung nhin = segments + markers THAT, khong mot toa do mac dinh nao.
 */

const HA_NOI_HAI_PHONG: MapBounds = [105.8342, 20.8449, 106.6881, 21.0278];

const mapModel = (points: readonly (readonly [number, number])[]): JourneyMapModel => ({
  segments:
    points.length > 1
      ? [
          {
            key: 's',
            legSequence: 1,
            role: 'LOADED',
            pathKind: 'RAW_OBSERVED',
            coordinates: points,
          },
        ]
      : [],
  markers:
    points.length === 1
      ? [
          {
            key: 'm',
            legSequence: 1,
            role: 'ORIGIN',
            coordinate: points[0] as readonly [number, number],
            label: 'Chặng 1 · điểm lấy hàng',
          },
        ]
      : [],
  gaps: [],
  hasGeometry: points.length > 0,
  rawSampledFrom: points.length,
});

describe('khung nhin theo du lieu', () => {
  it('khong co geometry → KHONG co khung nhin nao (khong bia Ha Noi hay giua Viet Nam)', () => {
    expect(cameraFor(null)).toBeNull();
    expect(cameraFor(boundsOf(mapModel([])))).toBeNull();
  });

  it('khung hong (NaN, ngoai pham vi, dao nguoc) → khong fit mot khung vo nghia', () => {
    expect(cameraFor([Number.NaN, 20, 106, 21])).toBeNull();
    expect(cameraFor([105, 20, 190, 21])).toBeNull();
    expect(cameraFor([105, -95, 106, 21])).toBeNull();
    expect(cameraFor([106, 20, 105, 21])).toBeNull();
  });

  it('MOT diem → canh giua tai diem do voi muc phong co dinh, khong goi fitBounds', () => {
    const camera = cameraFor(boundsOf(mapModel([[105.8342, 21.0278]])));

    expect(camera).toEqual({
      kind: 'CENTER',
      longitude: 105.8342,
      latitude: 21.0278,
      zoom: MAX_FIT_ZOOM,
    });
  });

  it('ca vong chay → fit DUNG khung du lieu, kem le va tran muc phong', () => {
    expect(cameraFor(HA_NOI_HAI_PHONG)).toEqual({
      kind: 'FIT',
      bounds: HA_NOI_HAI_PHONG,
      paddingPx: FIT_PADDING_PX,
      maxZoom: MAX_FIT_ZOOM,
    });
  });

  /*
   * Hai ban dinh vi cach nhau vai chuc met: `fitBounds` cua Google khong co `maxZoom` va se phong
   * toi ~21. Khung duoc NOI quanh chinh tam cua du lieu — khong dich di dau.
   */
  it('hai diem sat nhau → khung duoc noi toi be rong toi thieu, quanh dung tam du lieu', () => {
    const camera = cameraFor([105.8342, 21.0278, 105.8346, 21.0279]);

    expect(camera?.kind).toBe('FIT');
    if (camera?.kind !== 'FIT') return;
    const [west, south, east, north] = camera.bounds;
    expect(east - west).toBeCloseTo(MIN_FIT_SPAN_DEG, 10);
    expect(north - south).toBeCloseTo(MIN_FIT_SPAN_DEG, 10);
    expect((west + east) / 2).toBeCloseTo(105.8344, 10);
    expect((south + north) / 2).toBeCloseTo(21.02785, 10);
  });

  it('noi khung khong vuot ra ngoai trai dat', () => {
    const camera = cameraFor([179.99, 89.99, 180, 90]);

    expect(camera?.kind).toBe('FIT');
    if (camera?.kind !== 'FIT') return;
    expect(camera.bounds[2]).toBeLessThanOrEqual(180);
    expect(camera.bounds[3]).toBeLessThanOrEqual(90);
  });
});

describe('khoa khung nhin — camera chi chay lai khi TOA DO doi', () => {
  it('hai mang khac doi tuong nhung cung toa do → cung khoa (lam tuoi du lieu khong keo ban do)', () => {
    expect(boundsKey([...HA_NOI_HAI_PHONG])).toBe(boundsKey([...HA_NOI_HAI_PHONG]));
  });

  it('doi vong chay (toa do khac) → khoa khac, nen khung nhin duoc tinh lai', () => {
    const otherRun: MapBounds = [105.7, 20.9, 106.1, 21.2];

    expect(boundsKey(otherRun)).not.toBe(boundsKey(HA_NOI_HAI_PHONG));
    expect(cameraFor(otherRun)).not.toEqual(cameraFor(HA_NOI_HAI_PHONG));
  });

  it('khong co khung → mot khoa rieng, khong trung khung nao', () => {
    expect(boundsKey(null)).toBe('none');
  });
});
