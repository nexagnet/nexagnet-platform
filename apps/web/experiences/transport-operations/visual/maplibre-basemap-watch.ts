import type { MapLibreFailure } from './map-style';

/**
 * THEO DOI NEN MAPLIBRE NGOAI (OpenFreeMap hoac style tu khai) cho toi khi no HIEN RA LAN DAU.
 *
 * ```
 *   WATCHING ──idle, da co it nhat mot o tile──────────────────────▶ READY
 *      │    └─ het han, da co o tile (idle chua den) ────────────────▶ READY
 *      │
 *      ├── loi TRUOC khi style JSON ap vao ban do ───────────────────▶ FAILED(STYLE_FAILED)
 *      ├── loi o tile/nguon, moi o da xong, chua o nao nap duoc ─────▶ FAILED(TILES_FAILED)
 *      ├── idle ma chua mot o tile nao nap duoc ─────────────────────▶ FAILED(TILES_FAILED)
 *      └── het han ma chua mot o tile nao hien ra ───────────────────▶ FAILED(TIMEOUT)
 * ```
 *
 * Instance cong khai cua OpenFreeMap KHONG co SLA. Hong o dau cung phai ra MOT trang thai cuoi, de
 * `TransportMap` lui ve nen cuc bo va noi ro — chu khong de lai mot khung trong ma tuyen van nam do
 * nhu the nen chi cham.
 *
 * ===========================================================================
 * VI SAO "LOI STYLE" CHI TINH TRUOC LAN `styledata` DAU TIEN.
 *
 * MapLibre 6.8 (`Style.loadURL`) phat `error` khi tai style that bai, TRUOC moi su kien `styledata`.
 * Sau khi style da ap, cung ten su kien `error` con dung cho sprite, phong chu hay o tile — mat mot bo
 * bieu tuong khong phai ly do de bo ca nen. Sau moc do chi loi CUA NGUON (co `tile` hoac `sourceId`)
 * moi duoc tinh.
 *
 * ===========================================================================
 * VI SAO KET LUAN "HONG TILE" NGAY O LOI CUOI, KHONG CHO `idle`.
 *
 * `TileManager._loadTile` cua MapLibre 6.8 dat `tile.state = 'errored'` roi phat `error` — va voi
 * loi KHONG phai 404 thi khong goi `update()`. Moi o tile deu hong thi khong gi len lich mot khung
 * ve moi, nen `idle` (phat tu vong ve) co khi KHONG BAO GIO den: do tren trinh duyet that 23/09/2026,
 * o tile bi chan luc 15,2 s ma toi han 25,1 s van chua `idle`. Nen o moi loi cua nguon, watch hoi
 * ban do "moi o dang xin da xong het chua" (`areTilesLoaded()` — o `errored` tinh la xong); xong het
 * ma chua o nao nap duoc thi la hong tile, ngay luc do.
 *
 * ===========================================================================
 * VI SAO DEM O TILE NAP DUOC, KHONG DEM LOI.
 *
 * MapLibre IM LANG voi o tile tra 404, va mot vai o hong le te la chuyen thuong. Dieu nguoi xem thay
 * la: co mat dat hay khong. `sourcedata` mang `tile` chi phat khi mot o nap THANH CONG.
 *
 * ===========================================================================
 * DA HIEN RA ROI THI KHONG LUI NEN NUA.
 *
 * Mang rot giua chung khi nguoi dung dang keo chi lam thieu vai o tile o vung moi; doi nen luc do la
 * dung lai ca ban do va keo khung nhin ve khung du lieu ngay truoc mat nguoi dang thao tac. Watch dung
 * lai o READY. Va het han LUON ra trang thai cuoi: da co o tile ma mot yeu cau khac treo (khong loi,
 * khong xong) thi `idle` khong den — neu khong co dong ho, `aria-busy` se treo mai.
 *
 * Tach khoi React de do bang su kien gia va dong ho gia trong moi truong `node` cua vitest.
 */

/** Du rong cho mang 3G cham; qua muc nay ma chua mot o tile nao hien, nguoi xem dang nhin nen trong. */
export const EXTERNAL_BASEMAP_TIMEOUT_MS = 15_000;

export type ExternalBasemapStatus =
  { readonly status: 'READY' } | { readonly status: 'FAILED'; readonly failure: MapLibreFailure };

/** Phan cua su kien `sourcedata` ma watch doc: co `tile` = mot o vua nap xong. */
export interface BasemapSourceDataEvent {
  readonly tile?: unknown;
}

/** Phan cua su kien `error` ma watch doc, kem mot cau hoi cho chinh ban do. */
export interface BasemapErrorEvent {
  /** Co = loi cua mot o tile. */
  readonly tile?: unknown;
  /** Co = loi cua mot nguon (o tile, hay TileJSON cua nguon). Sprite/phong chu khong co. */
  readonly sourceId?: string;
  /** `map.areTilesLoaded()` luc loi: moi o dang xin da xong (nap duoc hoac hong) chua. */
  readonly tilesSettled: boolean;
}

export interface ExternalBasemapWatch {
  /** `styledata` — style JSON da ap vao ban do. */
  readonly onStyleData: () => void;
  readonly onSourceData: (event: BasemapSourceDataEvent) => void;
  /** `error` — moi loi cua ban do; watch tu phan loai theo thoi diem va theo nguon loi. */
  readonly onError: (event: BasemapErrorEvent) => void;
  readonly onIdle: () => void;
  /** Goi khi component go ra; sau do khong con callback nao, va dong ho duoc don. */
  readonly dispose: () => void;
}

export function watchExternalBasemap(
  onStatus: (status: ExternalBasemapStatus) => void,
  timeoutMs: number = EXTERNAL_BASEMAP_TIMEOUT_MS,
): ExternalBasemapWatch {
  let finished = false;
  let styleApplied = false;
  let tilesLoaded = 0;

  const finish = (status: ExternalBasemapStatus): void => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    onStatus(status);
  };

  const timer = setTimeout(() => {
    finish(tilesLoaded > 0 ? { status: 'READY' } : { status: 'FAILED', failure: 'TIMEOUT' });
  }, timeoutMs);

  return {
    onStyleData: () => {
      styleApplied = true;
    },
    onSourceData: (event) => {
      if (event.tile !== undefined) tilesLoaded += 1;
    },
    onError: (event) => {
      if (!styleApplied) {
        finish({ status: 'FAILED', failure: 'STYLE_FAILED' });
        return;
      }
      const isSourceError = event.tile !== undefined || event.sourceId !== undefined;
      if (isSourceError && event.tilesSettled && tilesLoaded === 0) {
        finish({ status: 'FAILED', failure: 'TILES_FAILED' });
      }
    },
    onIdle: () => {
      if (!styleApplied) return;
      finish(tilesLoaded > 0 ? { status: 'READY' } : { status: 'FAILED', failure: 'TILES_FAILED' });
    },
    dispose: () => {
      finished = true;
      clearTimeout(timer);
    },
  };
}
