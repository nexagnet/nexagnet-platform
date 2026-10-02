'use client';

import { useEffect, useRef } from 'react';
import Map, {
  NavigationControl,
  ScaleControl,
  useControl,
  type MapRef,
  type ViewState,
} from 'react-map-gl/maplibre';
import { setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { buildJourneyLayers } from './journey-layers';
import { MAPLIBRE_WORKER_URL } from './maplibre-worker-url';
import type { ExternalBasemapStatus } from './maplibre-basemap-watch';
import { toWatchError, useExternalBasemapWatch } from './use-external-basemap-watch';
import type { ChartPalette } from './chart-options';
import type { MapCamera } from './map-camera';
import type { JourneyMapModel } from '../workspace/journey';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * NEN MAPLIBRE — OpenFreeMap (mac dinh), style URL da khai, hoac nen CUC BO khong goi mang
 * (#278 N1/N2/N5, #374).
 *
 * ===========================================================================
 * NEN NGOAI THI GHI NGUON, VA DUOC THEO DOI CHO TOI KHI HIEN RA.
 *
 * Style ngoai (chuoi URL) bat dieu khien ghi nguon mac dinh cua MapLibre: no doc `attribution` cua
 * chinh style (OpenFreeMap © OpenMapTiles, du lieu © OpenStreetMap) va KHONG mot quy tac CSS nao che
 * no. Va `onExternalStatus` nhan ket qua cua `watchExternalBasemap`: hong thi `TransportMap` dung
 * lai mot ban do MOI tren nen cuc bo — kem lop MOI (xem ben duoi).
 *
 * ===========================================================================
 * DECK.GL DI VAO NHU MOT `control` CUA MAPLIBRE, KHONG PHAI MOT LOP CANVAS THU HAI.
 *
 * `MapboxOverlay` qua `useControl` la duong tich hop chinh thuc cua react-map-gl v8: deck.gl ve
 * trong CUNG vong ve cua MapLibre. Chong hai canvas len nhau thi khi thu phong hai lop se lech nhau
 * vai khung hinh — tren mot ban do van tai, "lech vai khung hinh" nghia la duong chay tach khoi cai
 * moc ma no phai di qua.
 *
 * ===========================================================================
 * KHUNG NHIN DAU TIEN CUNG LA KHUNG CUA DU LIEU.
 *
 * `initialViewState` lay tu `camera` — khong con mot toa do Ha Noi mac dinh nhay len truoc khi
 * `fitBounds` chay.
 *
 * Lop duoc dung MOI trong effect, khong nhan tu ngoai vao: xem `GoogleBasemap` — mot lop da thuoc
 * ngu canh WebGL cua nen Google khong ve duoc tren nen nay.
 */

/*
 * Mot lan cho ca trang, TRUOC ban do dau tien — tai lieu cua MapLibre 6 doi dieu nay o moi bundler.
 * Thieu no, nen ngoai tai style ve ma khong mot o tile nao duoc xin (xem `maplibre-worker-url.ts`).
 */
setWorkerUrl(MAPLIBRE_WORKER_URL);

function DeckOverlay({
  model,
  palette,
}: {
  readonly model: JourneyMapModel;
  readonly palette: ChartPalette;
}): null {
  const overlay = useControl(() => new MapboxOverlay({ interleaved: false }));

  useEffect(() => {
    overlay.setProps({ layers: buildJourneyLayers(model, palette) });
  }, [model, overlay, palette]);

  return null;
}

const initialViewStateFor = (
  camera: MapCamera,
): Partial<ViewState> & {
  bounds?: [[number, number], [number, number]];
  fitBoundsOptions?: { padding: number; maxZoom: number };
} =>
  camera.kind === 'CENTER'
    ? { longitude: camera.longitude, latitude: camera.latitude, zoom: camera.zoom }
    : {
        bounds: [
          [camera.bounds[0], camera.bounds[1]],
          [camera.bounds[2], camera.bounds[3]],
        ],
        fitBoundsOptions: { padding: camera.paddingPx, maxZoom: camera.maxZoom },
      };

/*
 * `toWatchError` + `useExternalBasemapWatch` nam o `use-external-basemap-watch.ts` tu `#379`: ban do
 * chon diem cua man tao don lui nen theo DUNG phan loai nay.
 */

export function MapLibreBasemap({
  style,
  onExternalStatus,
  model,
  palette,
  camera,
}: {
  /** Chuoi = URL style ngoai (co ghi nguon); doi tuong = style cuc bo khong goi mang. */
  readonly style: string | StyleSpecification;
  /** Chi cho style NGOAI: nen hien ra (`READY`) hay hong (`FAILED`). Phai la mot ham ON DINH. */
  readonly onExternalStatus?: (status: ExternalBasemapStatus) => void;
  readonly model: JourneyMapModel;
  readonly palette: ChartPalette;
  readonly camera: MapCamera;
}): React.ReactElement {
  const map = useRef<MapRef | null>(null);
  const watch = useExternalBasemapWatch(onExternalStatus);
  const isExternal = typeof style === 'string';

  useEffect(() => {
    const instance = map.current;
    if (instance === null) return;
    if (camera.kind === 'CENTER') {
      instance.jumpTo({ center: [camera.longitude, camera.latitude], zoom: camera.zoom });
      return;
    }
    instance.fitBounds(
      [
        [camera.bounds[0], camera.bounds[1]],
        [camera.bounds[2], camera.bounds[3]],
      ],
      { padding: camera.paddingPx, duration: 0, maxZoom: camera.maxZoom },
    );
  }, [camera]);

  return (
    <Map
      ref={map}
      initialViewState={initialViewStateFor(camera)}
      mapStyle={style}
      /*
       * `{}` (khong `compact`) = ghi nguon TU CO GIAN cua MapLibre 6.8: day du tren khung rong hon
       * 640px, thu gon thanh nut (i) o duoi. Khong `compact: true` — no thu gon ca tren man rong
       * ngay khi nguoi dung keo ban do.
       */
      attributionControl={isExternal ? {} : false}
      style={{ width: '100%', height: '100%' }}
      onStyleData={() => watch.current?.onStyleData()}
      onSourceData={(event) => watch.current?.onSourceData(event)}
      onIdle={() => watch.current?.onIdle()}
      /*
       * Chi thay trinh bao loi mac dinh (`console.error` moi o tile) khi CO watch: ly do da nam tren
       * `data-basemap-fallback`. Nen cuc bo giu nguyen trinh bao mac dinh cua react-map-gl.
       */
      onError={
        onExternalStatus === undefined
          ? undefined
          : (event) => watch.current?.onError(toWatchError(event))
      }
    >
      <NavigationControl position="top-right" showCompass={false} />
      <ScaleControl position="bottom-left" unit="metric" />
      <DeckOverlay model={model} palette={palette} />
    </Map>
  );
}

export default MapLibreBasemap;
