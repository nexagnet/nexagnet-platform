import { describe, expect, it, vi } from 'vitest';
import { GOOGLE_MAP_TYPE_IDS, applyGoogleCamera, googleMapOptions } from '../google-map-options';
import type { GoogleMapsLibraries } from '../google-maps-loader';
import { cameraFor } from '../map-camera';

/*
 * `#374` §1/§3/§4 — Google la NEN: ROADMAP mac dinh, doi loai nen la dieu khien PHU, khong Street
 * View, khong dia diem bam duoc.
 */

const LIBRARIES = {
  core: { ControlPosition: { BLOCK_START_INLINE_START: 'BLOCK_START_INLINE_START' } },
  maps: { MapTypeControlStyle: { DROPDOWN_MENU: 'DROPDOWN_MENU' } },
} as unknown as GoogleMapsLibraries;

describe('tuy chon ban do Google', () => {
  const options = googleMapOptions(LIBRARIES, null);

  it('ROADMAP la mac dinh', () => {
    expect(options.mapTypeId).toBe('roadmap');
  });

  it('dia hinh / ve tinh / ket hop nam trong MOT menu tha xuong o goc — dieu khien phu', () => {
    expect(options.mapTypeControl).toBe(true);
    expect(options.mapTypeControlOptions?.mapTypeIds).toEqual([...GOOGLE_MAP_TYPE_IDS]);
    expect(options.mapTypeControlOptions?.style).toBe('DROPDOWN_MENU');
    expect(GOOGLE_MAP_TYPE_IDS).toEqual(['roadmap', 'terrain', 'satellite', 'hybrid']);
  });

  /*
   * `WebGLOverlayView` (deck.gl interleaved) CAN Map ID — Google that bao "initialized without a
   * valid map ID, which will prevent use of WebGLOverlayView". Co Map ID thi vector; khong co thi
   * xin raster ngay tu dau, khong xin vector roi bi lui.
   */
  it('co Map ID → nen VECTOR mang dung Map ID do', () => {
    const vector = googleMapOptions(LIBRARIES, 'map-id-thu');

    expect(vector.renderingType).toBe('VECTOR');
    expect(vector.mapId).toBe('map-id-thu');
    expect(vector.mapTypeId).toBe('roadmap');
  });

  it('khong Map ID → nen RASTER noi thang, khong gui Map ID nao', () => {
    expect(options.renderingType).toBe('RASTER');
    expect(options.mapId).toBeUndefined();
  });

  it('chi nen: khong Street View, khong dia diem bam duoc, khong xoay/nghieng', () => {
    expect(options.disableDefaultUI).toBe(true);
    expect(options.streetViewControl).toBe(false);
    expect(options.clickableIcons).toBe(false);
    expect(options.headingInteractionEnabled).toBe(false);
    expect(options.tiltInteractionEnabled).toBe(false);
  });

  it('giu phong to va thuoc ty le; lan chuot khong cuop cuon trang', () => {
    expect(options.zoomControl).toBe(true);
    expect(options.scaleControl).toBe(true);
    expect(options.gestureHandling).toBe('cooperative');
  });
});

describe('dat khung nhin len ban do Google', () => {
  const fakeMap = () => ({ fitBounds: vi.fn(), moveCamera: vi.fn() });

  it('ca vong chay → fitBounds DUNG khung, kem le', () => {
    const map = fakeMap();
    const camera = cameraFor([105.8342, 20.8449, 106.6881, 21.0278]);
    if (camera === null) throw new Error('camera phai co');

    applyGoogleCamera(map, camera);

    expect(map.fitBounds).toHaveBeenCalledWith(
      { west: 105.8342, south: 20.8449, east: 106.6881, north: 21.0278 },
      48,
    );
    expect(map.moveCamera).not.toHaveBeenCalled();
  });

  it('mot diem → canh giua + muc phong, KHONG goi fitBounds voi khung rong 0', () => {
    const map = fakeMap();
    const camera = cameraFor([105.8342, 21.0278, 105.8342, 21.0278]);
    if (camera === null) throw new Error('camera phai co');

    applyGoogleCamera(map, camera);

    expect(map.moveCamera).toHaveBeenCalledWith({
      center: { lat: 21.0278, lng: 105.8342 },
      zoom: 13,
    });
    expect(map.fitBounds).not.toHaveBeenCalled();
  });
});
