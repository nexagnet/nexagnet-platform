'use client';

import { useEffect, useRef } from 'react';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { applyGoogleCamera, googleMapOptions } from './google-map-options';
import type { GoogleMapsLibraries } from './google-maps-loader';
import { buildJourneyLayers } from './journey-layers';
import type { ChartPalette } from './chart-options';
import type { MapCamera } from './map-camera';
import type { JourneyMapModel } from '../workspace/journey';

/**
 * NEN GOOGLE MAPS + LOP deck.gl (#374 §3).
 *
 * `GoogleMapsOverlay` la duong tich hop chinh thuc cua deck.gl voi Maps JavaScript API. Co Map ID
 * (nen vector) thi no ve BEN TRONG vong ve cua Google — mot canvas, khong co lop thu hai chay theo
 * sau camera; khong co Map ID (raster) thi canvas cua deck nam trong pane cua chinh Google va duoc
 * ve lai moi lan Google goi `draw()`.
 *
 * ===========================================================================
 * LOP DUNG MOI CHO MOI LAN GIAO — KHONG DUNG CHUNG VOI NEN KHAC.
 *
 * Mot lop deck.gl da duoc mot `Deck` khoi tao thi mang theo buffer cua ngu canh WebGL cua `Deck`
 * do. Khoa bi Google tu choi SAU khi ban do da ve (`gm_authFailure`) la chuyen that: khi do nen cuc
 * bo phai ve lai tuyen bang lop CUA NO. Dua lai cung doi tuong lop se lam deck.gl nem `assertion
 * failed` va nen cuc bo hien ra KHONG co tuyen — do dung tren trinh duyet that ngay 23/09/2026.
 * Nen component nhan DU LIEU (`model`, `palette`) va tu dung lop, dung nhu cach deck.gl khuyen.
 *
 * Thu tu hieu ung la co y: effect tao ban do chay TRUOC, nen hai effect sau (lop, khung nhin) luon
 * thay mot ban do da gan — ke ca lan gan thu hai cua `reactStrictMode`.
 */
export function GoogleBasemap({
  libraries,
  mapId,
  model,
  palette,
  camera,
}: {
  readonly libraries: GoogleMapsLibraries;
  readonly mapId: string | null;
  readonly model: JourneyMapModel;
  readonly palette: ChartPalette;
  readonly camera: MapCamera;
}): React.ReactElement {
  const container = useRef<HTMLDivElement | null>(null);
  const instance = useRef<{ map: google.maps.Map; overlay: GoogleMapsOverlay } | null>(null);

  useEffect(() => {
    const host = container.current;
    if (host === null) return undefined;

    const map = new libraries.maps.Map(host, googleMapOptions(libraries, mapId));
    const overlay = new GoogleMapsOverlay({ interleaved: true });
    overlay.setMap(map);
    instance.current = { map, overlay };

    return () => {
      instance.current = null;
      overlay.finalize();
      libraries.core.event.clearInstanceListeners(map);
      /* Google khong co `map.destroy()`; the chua la cua React va khong co con React nao. */
      host.replaceChildren();
    };
  }, [libraries, mapId]);

  useEffect(() => {
    instance.current?.overlay.setProps({ layers: buildJourneyLayers(model, palette) });
  }, [model, palette, libraries, mapId]);

  useEffect(() => {
    const current = instance.current;
    if (current !== null) applyGoogleCamera(current.map, camera);
  }, [camera, libraries, mapId]);

  return <div ref={container} className="tx-map__canvas" data-testid="tx-map-google" />;
}

export default GoogleBasemap;
