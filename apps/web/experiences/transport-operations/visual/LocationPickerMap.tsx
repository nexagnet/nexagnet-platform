'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
  type MarkerDragEvent,
} from 'react-map-gl/maplibre';
import { setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
import type { GeoPoint } from '../transport-types';
import { createPickGate } from '../workspace/map-pick-gate';
import {
  FRAME_PADDING_PX,
  framePaddingFor,
  NO_INSETS,
  STAKE_HEADROOM_PX,
  type PickerInsets,
} from '../workspace/picker-insets';
import { accuracyRing, pickerCameraFor, type PickerMarker } from '../workspace/place-lookup';
import type { MapBounds, MapCamera } from './map-camera';
import {
  effectiveBasemap,
  isExternalStyle,
  LOCAL_BASEMAP_STYLE,
  pickerBasemap,
  readBasemapEnv,
  resolveBasemap,
} from './map-style';
import type { ExternalBasemapStatus } from './maplibre-basemap-watch';
import { MAPLIBRE_WORKER_URL } from './maplibre-worker-url';
import { toWatchError, useExternalBasemapWatch } from './use-external-basemap-watch';
import 'maplibre-gl/dist/maplibre-gl.css';
import './location-picker-map.css';

/**
 * BAN DO CHON DIEM cua man tao don (`#379`) — va ban do CHI DOC nho cua khoi "Tuyến".
 *
 * ===========================================================================
 * BAN DO NAY HOI, KHONG BAO CAO.
 *
 * `TransportMap` ve du lieu da co va tu choi ve khi khong co toa do. Ban do nay nguoc lai: no dang
 * HOI nguoi dung mot diem, nen no luon mo ra (khung dia diem da biet, hoac khung Viet Nam — khung
 * cua CONG CU, khong phai du lieu). Vi the no la mot thanh phan rieng, khong `role="img"`, khong lop
 * `.tx-map` (CSS man hep ep `.tx-map` cao 260px `!important`).
 *
 * ===========================================================================
 * NEN DUNG CHUNG MOT CO CHE LUI VOI BAN DO BAO CAO.
 *
 * `resolveBasemap` -> `pickerBasemap` (Google -> OpenFreeMap, xem `map-style.ts`) -> `effectiveBasemap`
 * voi CUNG watch (`use-external-basemap-watch.ts`). Nen ngoai hong thi dung lai ban do MOI tren nen
 * cuc bo (`key={source}`) — ghim la DOM nen khong co lop WebGL nao bi mat.
 *
 * ===========================================================================
 * GHIM LA NUT, KHONG PHAI PIXEL.
 *
 * Moi ghim la mot `<button>` (hoac `<span role="img">` o che do chi doc) co `aria-label`: ban phim
 * toi duoc, trinh doc man hinh doc duoc, va mau khong bao gio la tin hieu duy nhat — ghim Lay/Giao
 * mang CHU, dia diem da biet mang HINH DANG, ket qua tim mang SO.
 */

/* Mot lan cho ca trang — xem `MapLibreBasemap.tsx`. Tep nay chi duoc nap qua `next/dynamic`. */
setWorkerUrl(MAPLIBRE_WORKER_URL);

/** Mot yeu cau "nhin vao day". `key` doi thi camera chay lai — cung khung thi khong. */
export interface PickerFocus {
  readonly key: string;
  readonly bounds: MapBounds;
}

/** Phan ban do dang bi lop noi che (px) — xem `workspace/picker-insets.ts`. */
export type { PickerInsets };

export interface PickerAccuracy {
  readonly center: GeoPoint;
  readonly radiusMetres: number;
}

export interface LocationPickerMapProps {
  readonly markers: readonly PickerMarker[];
  readonly initialBounds: MapBounds;
  readonly ariaLabel: string;
  readonly focus?: PickerFocus | null;
  /** Co = che do CHON (con tro chu thap, bam dat diem). Khong = ban do chi doc. */
  readonly onPick?: (point: GeoPoint) => void;
  readonly onMarkerActivate?: (marker: PickerMarker) => void;
  readonly onMarkerDrag?: (marker: PickerMarker, point: GeoPoint) => void;
  readonly accuracy?: PickerAccuracy | null;
  /**
   * `#395` — VONG BAN KINH cua nhieu dia diem (man "Địa điểm vận hành"): moi vong la mot hang rao, ve
   * cung mau voi vong sai so nhung nhat hon. Vong DANG SUA nen dat o `accuracy` de noi ro hon.
   */
  readonly rings?: readonly PickerAccuracy[] | null;
  /** Doan thang noi hai dau — duong CHIM BAY, ve dut de khong ai doc nham la duong xe chay. */
  readonly straightLine?: readonly [GeoPoint, GeoPoint] | null;
  readonly testId?: string;
  /**
   * Phan ban do dang bi lop noi che, doc NGAY luc camera chay — the tim kiem va bang trang thai doi
   * kich thuoc theo man hinh, nen mot con so chot luc ve se sai sau lan doi co cua so dau tien.
   */
  readonly overlayInsets?: () => PickerInsets;
  /** Co = nguoi goi tu hien cau ve nen o cho cua ho; khong = ban do tu hien duoi khung. */
  readonly onBasemapNotice?: (notice: string | null) => void;
}

interface LayerColors {
  readonly accent: string;
  readonly line: string;
}

const FALLBACK_COLORS: LayerColors = { accent: '#1f4e5f', line: '#857f74' };

const cssVar = (style: CSSStyleDeclaration, name: string, fallback: string): string => {
  const value = style.getPropertyValue(name).trim();
  return value.length === 0 ? fallback : value;
};

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Dua mot khung vao phan ban do NHIN THAY DUOC. Luon qua `fitBounds` (ke ca mot diem: khung rong
 * bi chan boi `maxZoom`) vi `easeTo({ padding })` cua MapLibre GIU padding cho moi lan sau — ban do
 * se lech tam mai mai sau lan bay dau tien.
 */
function frame(instance: MapRef, bounds: MapBounds, insets: PickerInsets, duration: number): void {
  const camera = pickerCameraFor(bounds);
  const target: MapBounds = camera.kind === 'FIT' ? camera.bounds : bounds;
  const container = instance.getContainer();
  instance.fitBounds(
    [
      [target[0], target[1]],
      [target[2], target[3]],
    ],
    {
      padding: framePaddingFor(
        { width: container.clientWidth, height: container.clientHeight },
        insets,
      ),
      maxZoom: camera.kind === 'FIT' ? camera.maxZoom : camera.zoom,
      duration,
    },
  );
}

const initialViewFor = (camera: MapCamera) =>
  camera.kind === 'CENTER'
    ? { longitude: camera.longitude, latitude: camera.latitude, zoom: camera.zoom }
    : {
        bounds: [
          [camera.bounds[0], camera.bounds[1]],
          [camera.bounds[2], camera.bounds[3]],
        ] as [[number, number], [number, number]],
        fitBoundsOptions: {
          padding: {
            top: FRAME_PADDING_PX + STAKE_HEADROOM_PX,
            bottom: FRAME_PADDING_PX,
            left: FRAME_PADDING_PX,
            right: FRAME_PADDING_PX,
          },
          maxZoom: camera.maxZoom,
        },
      };

const PIN_CLASS: Readonly<Record<PickerMarker['kind'], string>> = {
  ORIGIN: 'tx-pin tx-pin--stake tx-pin--origin',
  DESTINATION: 'tx-pin tx-pin--stake tx-pin--destination',
  DEPOT: 'tx-pin tx-pin--known tx-pin--depot',
  COUNTERPARTY_SITE: 'tx-pin tx-pin--known tx-pin--site',
  CUSTOMER: 'tx-pin tx-pin--known tx-pin--customer',
  SEARCH_RESULT: 'tx-pin tx-pin--result',
  MY_POSITION: 'tx-pin tx-pin--me',
  PLACE: 'tx-pin tx-pin--stake tx-pin--place',
};

/** Ghim dang COC (neo day, keo duoc): hai dau tuyen, va diem dang dat o man dia diem (`#395`). */
const isEndpoint = (marker: PickerMarker): boolean =>
  marker.kind === 'ORIGIN' || marker.kind === 'DESTINATION' || marker.kind === 'PLACE';

/* Ghim dang duoc tro trong danh sach noi len tren moi ghim khac; hai dau tuyen luon tren cung. */
const zIndexOf = (marker: PickerMarker): number =>
  isEndpoint(marker) ? 3 : marker.isHighlighted ? 4 : marker.kind === 'MY_POSITION' ? 2 : 1;

function PickerPin({
  marker,
  onActivate,
}: {
  readonly marker: PickerMarker;
  readonly onActivate?: (marker: PickerMarker) => void;
}): React.ReactElement {
  const className = `${PIN_CLASS[marker.kind]}${marker.isHighlighted ? ' is-hot' : ''}`;
  const body = isEndpoint(marker) ? (
    <>
      <span className="tx-pin__tag">{marker.badge}</span>
      <span className="tx-pin__stem" aria-hidden="true" />
    </>
  ) : (
    <span className="tx-pin__mark" aria-hidden="true">
      {marker.badge}
    </span>
  );
  if (onActivate === undefined || marker.kind === 'MY_POSITION') {
    return (
      <span className={className} role="img" aria-label={marker.label}>
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={className}
      aria-label={marker.label}
      title={marker.label}
      onClick={() => onActivate(marker)}
    >
      {body}
    </button>
  );
}

interface CanvasProps extends Omit<LocationPickerMapProps, 'ariaLabel' | 'testId'> {
  readonly style: string | StyleSpecification;
  readonly onExternalStatus?: (status: ExternalBasemapStatus) => void;
}

function PickerCanvas({
  style,
  onExternalStatus,
  markers,
  initialBounds,
  focus,
  onPick,
  onMarkerActivate,
  onMarkerDrag,
  accuracy,
  rings,
  straightLine,
  overlayInsets,
}: CanvasProps): React.ReactElement {
  const map = useRef<MapRef | null>(null);
  const watch = useExternalBasemapWatch(onExternalStatus);
  const [colors, setColors] = useState<LayerColors>(FALLBACK_COLORS);
  const initialView = useMemo(() => initialViewFor(pickerCameraFor(initialBounds)), []);
  const focusKey = focus?.key ?? null;

  useEffect(() => {
    const instance = map.current;
    if (instance === null || focus == null) return;
    /* `prefers-reduced-motion`: nhay thang, khong bay — chuyen dong cua camera la chuyen dong lon. */
    frame(instance, focus.bounds, overlayInsets?.() ?? NO_INSETS, prefersReducedMotion() ? 0 : 450);
    // Chi chay lai khi KHOA doi: lam tuoi du lieu tao doi tuong `focus` moi ma khung khong doi.
  }, [focusKey]);

  /*
   * Bam dup / cham dup de PHONG TO khong bao gio la hai lan chon diem (`workspace/map-pick-gate.ts`):
   * mot lan bam chi thanh mot lan chon khi khong co lan bam thu hai theo sau. Cong giu `onPick` qua
   * mot ref vi lan chon chay SAU khoang cho — luc do nguoi goi co the da ve lai voi ham moi.
   */
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  });
  const pickGate = useMemo(
    () => createPickGate<GeoPoint>((point) => onPickRef.current?.(point)),
    [],
  );
  useEffect(() => () => pickGate.cancel(), [pickGate]);

  /*
   * Bam trung mot ghim thi KHONG phai bam ban do: MapLibre van phat `click` cua ban do cho ca lan bam
   * tren phan tu DOM cua ghim, va neu khong chan o day mot lan chon "Bãi xe" se dat them mot diem
   * "trên bản đồ" ngay duoi no. Lan bam ban do con dang cho cung bi huy: y dinh moi nhat thang.
   */
  const handleClick = (event: MapLayerMouseEvent): void => {
    if (onPick === undefined) return;
    const target = event.originalEvent.target;
    if (target instanceof Element && target.closest('.maplibregl-marker') !== null) {
      pickGate.cancel();
      return;
    }
    const { lng, lat } = event.lngLat.wrap();
    pickGate.click({ latitude: lat, longitude: lng }, event.originalEvent.detail);
  };

  const handleDragEnd = (marker: PickerMarker, event: MarkerDragEvent): void => {
    const { lng, lat } = event.lngLat.wrap();
    onMarkerDrag?.(marker, { latitude: lat, longitude: lng });
  };

  return (
    <Map
      ref={map}
      initialViewState={initialView}
      mapStyle={style}
      /* Nen ngoai: ghi nguon cua chinh style, tu co gian, KHONG CSS nao che (`#374` §6). */
      attributionControl={typeof style === 'string' ? {} : false}
      style={{ width: '100%', height: '100%' }}
      cursor={onPick === undefined ? 'grab' : 'crosshair'}
      onClick={onPick === undefined ? undefined : handleClick}
      /* `doubleClickZoom` VAN BAT: bam dup van phong to, chi khong dat diem. */
      onDblClick={onPick === undefined ? undefined : () => pickGate.cancel()}
      onLoad={(event) => {
        /* Khung dau tien tinh lai khi da biet phan bi the tim kiem che — mot lan, khong bay. */
        if (overlayInsets !== undefined && map.current !== null) {
          frame(map.current, initialBounds, overlayInsets(), 0);
        }
        const computed = window.getComputedStyle(event.target.getContainer());
        setColors({
          accent: cssVar(computed, '--tx-accent', FALLBACK_COLORS.accent),
          line: cssVar(computed, '--tx-ink-faint', FALLBACK_COLORS.line),
        });
      }}
      onStyleData={() => watch.current?.onStyleData()}
      onSourceData={(event) => watch.current?.onSourceData(event)}
      onIdle={() => watch.current?.onIdle()}
      onError={
        onExternalStatus === undefined
          ? undefined
          : (event) => watch.current?.onError(toWatchError(event))
      }
    >
      <NavigationControl position="top-right" showCompass={false} />
      {straightLine == null ? null : (
        <Source
          id="tx-picker-straight"
          type="geojson"
          data={{
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: straightLine.map((point) => [point.longitude, point.latitude]),
            },
          }}
        >
          <Layer
            id="tx-picker-straight-line"
            type="line"
            paint={{ 'line-color': colors.line, 'line-width': 2, 'line-dasharray': [2, 2] }}
          />
        </Source>
      )}
      {rings == null || rings.length === 0 ? null : (
        <Source
          id="tx-picker-rings"
          type="geojson"
          data={{
            type: 'FeatureCollection',
            features: rings.map((ring) => accuracyRing(ring.center, ring.radiusMetres)),
          }}
        >
          <Layer
            id="tx-picker-rings-fill"
            type="fill"
            paint={{ 'fill-color': colors.accent, 'fill-opacity': 0.06 }}
          />
          <Layer
            id="tx-picker-rings-edge"
            type="line"
            paint={{ 'line-color': colors.accent, 'line-opacity': 0.35, 'line-width': 1 }}
          />
        </Source>
      )}
      {accuracy == null ? null : (
        <Source
          id="tx-picker-accuracy"
          type="geojson"
          data={accuracyRing(accuracy.center, accuracy.radiusMetres)}
        >
          <Layer
            id="tx-picker-accuracy-fill"
            type="fill"
            paint={{ 'fill-color': colors.accent, 'fill-opacity': 0.12 }}
          />
          <Layer
            id="tx-picker-accuracy-edge"
            type="line"
            paint={{ 'line-color': colors.accent, 'line-opacity': 0.45, 'line-width': 1 }}
          />
        </Source>
      )}
      {markers.map((marker) => (
        <Marker
          key={marker.key}
          longitude={marker.point.longitude}
          latitude={marker.point.latitude}
          anchor={isEndpoint(marker) ? 'bottom' : 'center'}
          draggable={marker.isDraggable && onMarkerDrag !== undefined}
          onDragEnd={(event) => handleDragEnd(marker, event)}
          style={{ zIndex: zIndexOf(marker) }}
        >
          <PickerPin marker={marker} onActivate={onMarkerActivate} />
        </Marker>
      ))}
    </Map>
  );
}

export function LocationPickerMap({
  ariaLabel,
  testId = 'tx-picker-map',
  onBasemapNotice,
  ...canvas
}: LocationPickerMapProps): React.ReactElement {
  const configured = useMemo(() => pickerBasemap(resolveBasemap(readBasemapEnv())), []);
  /* `null` = nen ngoai dang tai. Ham `set` cua React on dinh — watch khong bi dung lai moi lan ve. */
  const [external, setExternal] = useState<ExternalBasemapStatus | null>(null);
  const basemap = effectiveBasemap(configured, {
    mapLibre: external?.status === 'FAILED' ? external.failure : null,
  });
  const isExternal = isExternalStyle(basemap);
  const notice = basemap.notice;

  useEffect(() => {
    onBasemapNotice?.(notice);
  }, [notice, onBasemapNotice]);

  /* `pickerBasemap` da loai Google; nhanh nay chi de kieu du — neu co, ve nen cuc bo. */
  const style = basemap.source === 'GOOGLE_MAPS' ? LOCAL_BASEMAP_STYLE : basemap.style;

  return (
    <div className="tx-picker">
      <div
        className="tx-picker__canvas"
        role="group"
        aria-label={ariaLabel}
        aria-busy={isExternal && external === null}
        data-testid={testId}
        data-mode={canvas.onPick === undefined ? 'view' : 'pick'}
        data-basemap={basemap.source}
        data-basemap-fallback={basemap.source === 'LOCAL_FALLBACK' ? basemap.reason : undefined}
      >
        <PickerCanvas
          key={basemap.source}
          style={style}
          onExternalStatus={isExternal ? setExternal : undefined}
          {...canvas}
        />
      </div>
      {onBasemapNotice !== undefined || notice === null ? null : (
        <p className="tx-note tx-picker__notice" data-testid="tx-picker-notice">
          {notice}
        </p>
      )}
    </div>
  );
}

export default LocationPickerMap;
