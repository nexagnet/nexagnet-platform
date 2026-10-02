import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXTERNAL_BASEMAP_TIMEOUT_MS,
  watchExternalBasemap,
  type BasemapErrorEvent,
  type ExternalBasemapStatus,
  type ExternalBasemapWatch,
} from '../maplibre-basemap-watch';
import { BASEMAP_UNAVAILABLE_NOTICE, effectiveBasemap, resolveBasemap } from '../map-style';

/*
 * `#374` §4 + §9 bai 13/14 — OpenFreeMap (instance cong khai, KHONG SLA) hong thi ban do LUI VE,
 * khong chet va khong nhay qua nhay lai.
 *
 * Su kien gia theo dung thu tu MapLibre 6.8 phat: `error` cua lan tai style den TRUOC moi
 * `styledata`; `sourcedata` mang `tile` chi khi mot o tile nap THANH CONG; `idle` khi moi o tile
 * dang xin da xong (ke ca o hong). Moi kich ban phai ra DUNG MOT trang thai cuoi.
 */

interface Harness {
  readonly watch: ExternalBasemapWatch;
  readonly statuses: ExternalBasemapStatus[];
}

function harness(): Harness {
  const statuses: ExternalBasemapStatus[] = [];
  return { watch: watchExternalBasemap((status) => statuses.push(status)), statuses };
}

const TILE = { tileID: { z: 9, x: 408, y: 228 } };

/* Loi tai style: khong o tile, khong nguon — MapLibre phat TRUOC moi `styledata`. */
const STYLE_ERROR: BasemapErrorEvent = { tilesSettled: true };
/* Loi sprite / phong chu sau khi style da ap: cung khong o tile, khong nguon. */
const ASSET_ERROR: BasemapErrorEvent = { tilesSettled: true };
/* Loi mot o tile trong khi o khac con dang xin. */
const TILE_ERROR_PENDING: BasemapErrorEvent = {
  tile: TILE,
  sourceId: 'openmaptiles',
  tilesSettled: false,
};
/* Loi o tile CUOI CUNG — moi o dang xin da xong (MapLibre dat `errored` truoc khi phat loi). */
const TILE_ERROR_LAST: BasemapErrorEvent = {
  tile: TILE,
  sourceId: 'openmaptiles',
  tilesSettled: true,
};
/* TileJSON cua nguon khong tai duoc: loi co `sourceId`, khong co o tile nao. */
const SOURCE_METADATA_ERROR: BasemapErrorEvent = { sourceId: 'openmaptiles', tilesSettled: true };

describe('nen MapLibre ngoai cua mot ban do', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('style ap vao, o tile nap xong, idle → READY dung mot lan', () => {
    const { watch, statuses } = harness();

    watch.onStyleData();
    watch.onSourceData({ tile: TILE });
    watch.onSourceData({ tile: TILE });
    watch.onIdle();
    watch.onIdle();

    expect(statuses).toEqual([{ status: 'READY' }]);
  });

  it('tai style that bai (mang chan, may chu sap) → FAILED(STYLE_FAILED)', () => {
    const { watch, statuses } = harness();

    watch.onError(STYLE_ERROR);

    expect(statuses).toEqual([{ status: 'FAILED', failure: 'STYLE_FAILED' }]);
  });

  /* Bai 14 — hong MUON: ban do da khoi tao va lop deck.gl da ve, roi moi biet nen khong co gi. */
  it('style da ap nhung MOI o tile deu hong → idle ra FAILED(TILES_FAILED)', () => {
    const { watch, statuses } = harness();

    watch.onStyleData();
    watch.onError(TILE_ERROR_PENDING);
    watch.onError(TILE_ERROR_PENDING);
    watch.onIdle();

    expect(statuses).toEqual([{ status: 'FAILED', failure: 'TILES_FAILED' }]);
  });

  /*
   * Do tren trinh duyet that 23/09/2026: moi o tile bi chan luc 15,2 s, toi 25,1 s van KHONG co
   * `idle` — MapLibre khong len lich khung ve moi sau loi o tile khong phai 404. Watch ket luan ngay
   * o loi cua o tile cuoi cung, khong cho `idle`.
   */
  it('moi o tile hong va KHONG co idle → TILES_FAILED ngay o loi cuoi, khong cho het han', () => {
    const { watch, statuses } = harness();

    watch.onStyleData();
    watch.onError(TILE_ERROR_PENDING);
    expect(statuses).toEqual([]);

    watch.onError(TILE_ERROR_LAST);
    expect(statuses).toEqual([{ status: 'FAILED', failure: 'TILES_FAILED' }]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('TileJSON cua nguon khong tai duoc, khong o nao khac dang xin → TILES_FAILED', () => {
    const { watch, statuses } = harness();

    watch.onStyleData();
    watch.onError(SOURCE_METADATA_ERROR);

    expect(statuses).toEqual([{ status: 'FAILED', failure: 'TILES_FAILED' }]);
  });

  it('loi sprite / phong chu KHONG bao gio ket luan hong tile, ke ca khi chua o nao dang xin', () => {
    const { watch, statuses } = harness();

    watch.onStyleData();
    watch.onError(ASSET_ERROR);
    expect(statuses).toEqual([]);

    watch.onSourceData({ tile: TILE });
    watch.onIdle();
    expect(statuses).toEqual([{ status: 'READY' }]);
  });

  it('mot o tile hong trong khi o khac con tai → chua ket luan; o khac ve thi READY', () => {
    const { watch, statuses } = harness();

    watch.onStyleData();
    watch.onError(TILE_ERROR_PENDING);
    watch.onSourceData({ tile: TILE });
    watch.onError(TILE_ERROR_LAST);
    expect(statuses).toEqual([]);

    watch.onIdle();
    expect(statuses).toEqual([{ status: 'READY' }]);
  });

  it('o tile 404 thi MapLibre im lang — idle khong mot o nao van ra TILES_FAILED', () => {
    const { watch, statuses } = harness();

    watch.onStyleData();
    watch.onSourceData({});
    watch.onIdle();

    expect(statuses).toEqual([{ status: 'FAILED', failure: 'TILES_FAILED' }]);
  });

  it('loi SAU khi style da ap (sprite, vai o tile le) khong bo ca nen', () => {
    const { watch, statuses } = harness();

    watch.onStyleData();
    watch.onError(ASSET_ERROR);
    watch.onSourceData({ tile: TILE });
    watch.onError(TILE_ERROR_LAST);
    watch.onIdle();

    expect(statuses).toEqual([{ status: 'READY' }]);
  });

  it('su kien nguon khong mang `tile` (metadata) khong duoc tinh la mat dat da hien', () => {
    const { watch, statuses } = harness();

    watch.onStyleData();
    watch.onSourceData({ tile: undefined });
    vi.advanceTimersByTime(EXTERNAL_BASEMAP_TIMEOUT_MS);

    expect(statuses).toEqual([{ status: 'FAILED', failure: 'TIMEOUT' }]);
  });

  it('khong mot tra loi nao (mang treo) → FAILED(TIMEOUT) dung han', () => {
    const { watch, statuses } = harness();

    vi.advanceTimersByTime(EXTERNAL_BASEMAP_TIMEOUT_MS - 1);
    expect(statuses).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(statuses).toEqual([{ status: 'FAILED', failure: 'TIMEOUT' }]);

    /* Style den muon sau khi da lui nen: bi bo qua, man hinh khong doi nen lan nua. */
    watch.onStyleData();
    watch.onSourceData({ tile: TILE });
    watch.onIdle();
    expect(statuses).toHaveLength(1);
  });

  it('mot o tile hien ra, idle den truoc han → READY, khong bao gio TIMEOUT', () => {
    const { watch, statuses } = harness();

    watch.onStyleData();
    watch.onSourceData({ tile: TILE });
    vi.advanceTimersByTime(EXTERNAL_BASEMAP_TIMEOUT_MS - 1);
    watch.onIdle();
    vi.advanceTimersByTime(EXTERNAL_BASEMAP_TIMEOUT_MS);

    expect(statuses).toEqual([{ status: 'READY' }]);
  });

  /*
   * Review 23/09/2026: mot o tile da ve, roi mot o khac / mot bo phong chu TREO (khong loi, khong
   * xong) — `idle` khong bao gio den. Watch van phai ra trang thai cuoi, neu khong `aria-busy` treo
   * mai. Nen dang hien mot phan, nen do la READY chu khong lui ve cuc bo.
   */
  it('da co o tile nhung mot yeu cau khac treo mai (khong idle) → READY dung han', () => {
    const { watch, statuses } = harness();

    watch.onStyleData();
    watch.onSourceData({ tile: TILE });
    vi.advanceTimersByTime(EXTERNAL_BASEMAP_TIMEOUT_MS - 1);
    expect(statuses).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(statuses).toEqual([{ status: 'READY' }]);
  });

  it('da READY thi mat mang giua chung KHONG lui nen — khong keo ban do khoi tay nguoi dung', () => {
    const { watch, statuses } = harness();

    watch.onStyleData();
    watch.onSourceData({ tile: TILE });
    watch.onIdle();
    watch.onError(TILE_ERROR_LAST);
    watch.onIdle();
    vi.advanceTimersByTime(EXTERNAL_BASEMAP_TIMEOUT_MS * 2);

    expect(statuses).toEqual([{ status: 'READY' }]);
  });

  it('FAILED la trang thai CUOI — loi thu hai khong lam ban do nhay them lan nua', () => {
    const { watch, statuses } = harness();

    watch.onError(STYLE_ERROR);
    watch.onError(STYLE_ERROR);
    watch.onStyleData();
    watch.onIdle();
    vi.advanceTimersByTime(EXTERNAL_BASEMAP_TIMEOUT_MS);

    expect(statuses).toEqual([{ status: 'FAILED', failure: 'STYLE_FAILED' }]);
  });

  it('idle truoc khi style ap vao (khong the xay ra o MapLibre) bi bo qua', () => {
    const { watch, statuses } = harness();

    watch.onIdle();

    expect(statuses).toEqual([]);
  });

  it('component go ra → khong mot callback nao nua, va dong ho duoc don', () => {
    const { watch, statuses } = harness();
    expect(vi.getTimerCount()).toBe(1);

    watch.dispose();
    watch.onError(STYLE_ERROR);
    vi.advanceTimersByTime(EXTERNAL_BASEMAP_TIMEOUT_MS);

    expect(statuses).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ket thuc (READY hay FAILED) thi dong ho cung duoc don', () => {
    const ready = harness();
    ready.watch.onStyleData();
    ready.watch.onSourceData({ tile: TILE });
    ready.watch.onIdle();
    const failed = harness();
    failed.watch.onError(STYLE_ERROR);

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('OpenFreeMap hong → man hinh doi sang nen cuc bo (bai 13)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loi style cua OpenFreeMap: nen hien thuc la LOCAL_FALLBACK, ma OPENFREEMAP_STYLE_FAILED', () => {
    const configured = resolveBasemap({});
    const { watch, statuses } = harness();

    watch.onError(STYLE_ERROR);
    const latest = statuses.at(-1);
    const shown = effectiveBasemap(configured, {
      mapLibre: latest?.status === 'FAILED' ? latest.failure : null,
    });

    expect(configured.source).toBe('OPENFREEMAP');
    expect(shown).toMatchObject({
      source: 'LOCAL_FALLBACK',
      reason: 'OPENFREEMAP_STYLE_FAILED',
      notice: BASEMAP_UNAVAILABLE_NOTICE,
    });
  });
});
