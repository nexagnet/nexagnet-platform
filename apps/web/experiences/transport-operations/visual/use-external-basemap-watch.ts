'use client';

import { useEffect, useRef } from 'react';
import type { ErrorEvent as MapErrorEvent } from 'react-map-gl/maplibre';
import {
  watchExternalBasemap,
  type BasemapErrorEvent,
  type ExternalBasemapStatus,
  type ExternalBasemapWatch,
} from './maplibre-basemap-watch';

/**
 * CAU NOI giua su kien MapLibre cua React va `watchExternalBasemap` — DUNG CHUNG cho moi ban do
 * MapLibre (ban do bao cao `MapLibreBasemap` va ban do chon diem `LocationPickerMap`, `#379`).
 *
 * Tach ra tu `MapLibreBasemap.tsx` KHONG doi hanh vi: hai ban do lui ve nen cuc bo theo CUNG mot
 * phan loai loi. Hai ban sao cua hai ham nay se lech nhau o lan sua dau tien, va mot ban do se
 * treo `aria-busy` trong khi ban kia da lui nen.
 */

/**
 * Su kien `error` cua MapLibre → dieu watch can: loi cua NGUON nao (o tile / TileJSON co `tile` /
 * `sourceId`; sprite, phong chu thi khong), va luc do moi o dang xin da xong het chua. MapLibre dat
 * `tile.state = 'errored'` TRUOC khi phat loi, nen cau hoi nay dung ngay o loi cuoi cung.
 */
export const toWatchError = (event: MapErrorEvent): BasemapErrorEvent => {
  const detail = event as unknown as { readonly tile?: unknown; readonly sourceId?: string };
  return {
    tile: detail.tile,
    sourceId: detail.sourceId,
    tilesSettled: event.target.areTilesLoaded(),
  };
};

/**
 * Watch song TRONG effect, khong trong luc ve: tao no la bat dong ho. Cac handler su kien doc watch
 * dang song qua `ref`; `reactStrictMode` gan-go-gan thi watch thu nhat da `dispose` va im lang.
 */
export function useExternalBasemapWatch(
  onStatus: ((status: ExternalBasemapStatus) => void) | undefined,
): React.RefObject<ExternalBasemapWatch | null> {
  const watch = useRef<ExternalBasemapWatch | null>(null);
  useEffect(() => {
    if (onStatus === undefined) return undefined;
    const current = watchExternalBasemap(onStatus);
    watch.current = current;
    return () => {
      watch.current = null;
      current.dispose();
    };
  }, [onStatus]);
  return watch;
}
