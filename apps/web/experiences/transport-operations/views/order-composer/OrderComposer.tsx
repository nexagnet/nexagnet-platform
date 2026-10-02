'use client';

import dynamic from 'next/dynamic';
import { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { PageHeader } from '../../components/primitives';
import { ConfirmAction, ErrorState, LoadingState } from '../../components/SectionState';
import {
  toSectionQuery,
  useKnownPlaces,
  type SectionQuery,
  useNavigationInput,
  usePlaceReverse,
  usePlaceSearch,
} from '../../hooks/useTransportWorkspace';
import { transportApi, type CreateOrderInput, type TransportApiError } from '../../transport-api';
import type {
  GeoPoint,
  KnownPlacesResponse,
  PlaceCandidate,
  TransportCustomer,
  TransportOrder,
} from '../../transport-types';
import type { PickerFocus } from '../../visual/LocationPickerMap';
import {
  buildCreateOrderInput,
  choiceFromBrowserPosition,
  choiceFromKnownPlace,
  choiceFromSearchResult,
  createOrderErrorMessage,
  draftReducer,
  EMPTY_DRAFT,
  emptyDetails,
  isDraftDirty,
  knownPlaceMarkerKey,
  missingRequirements,
  missingSentence,
  pickerMarkers,
  searchResultMarkerKey,
  type DraftEndpoint,
  type OrderDetailsDraft,
  type OrderDraft,
  type PlaceChoice,
} from '../../workspace/order-draft';
import { insetsForOverlays, NO_INSETS, type PickerInsets } from '../../workspace/picker-insets';
import {
  boundsOfPoints,
  initialPickerBounds,
  POSITION_FAILURE_MESSAGE,
  type PickerMarker,
  type PositionState,
} from '../../workspace/place-lookup';
import { OrderFacts } from './OrderFacts';
import { ActiveBanner, LocateButton, MapLegend, PositionCard } from './PickerOverlay';
import { PlaceFinder, type KnownPlacesState } from './PlaceFinder';
import { RouteTicket } from './RouteTicket';
import { readOfficePosition } from './browser-position';
import '../../visual/location-picker-map.css';
import './order-composer.css';

/**
 * TAO DON MOI (`#379`) — mot BE MAT rieng thay cho danh sach, khong phai form dinh tren dau bang.
 *
 * ===========================================================================
 * VIEC CHINH LA CHOT DUNG HAI DIEM.
 *
 * Phieu tuyen (trai) noi dang dat diem nao va da chot gi; ban do (phai) la noi chon. Moi lua chon —
 * bam ban do, ghim dia diem da biet, ket qua tim, vi tri cua toi — di qua MOT reducer
 * (`workspace/order-draft.ts`) vao dung o dang chon. Don chi gui duoc khi du hai TOA DO: nhan chu
 * chi la chu in tren don.
 *
 * ===========================================================================
 * KHONG MOT YEU CAU NAO TU CHAY.
 *
 * Dia diem da biet doc khi be mat MO (component nay chi gan khi mo). Tim theo chu chi khi bam
 * "Tìm"; tim nguoc chi sau mot lan bam ban do; vi tri trinh duyet chi khi bam "Vị trí của tôi".
 *
 * ===========================================================================
 * LOI KHONG SAP BE MAT.
 *
 * Tim tat, tim ban, nen ban do hong, trinh duyet tu choi vi tri, may chu tu choi don: moi loi noi
 * mot cau ngay tai cho cua no, va moi thu nguoi dung da nhap van con nguyen. Tai lai / dong tab khi
 * ban nhap da co gi thi trinh duyet hoi truoc (`beforeunload`).
 *
 * ===========================================================================
 * THU TU DOM = THU TU NHIN O MAN HEP.
 *
 * Phieu tuyen -> the tim + ban do -> thong tin don -> thanh gui: dung thu tu nguoi dung di tren dien
 * thoai, nen Tab va trinh doc man hinh di dung duong do (WCAG 2.4.3). Man rong chi XEP LAI cac khoi
 * do bang o luoi (`order-composer.css`), khong dao thu tu.
 */

/** Moi lop co the de len ban do: camera doc khung cua chung ngay luc chay. */
const MAP_OVERLAY_SELECTOR =
  '[data-map-overlay], .maplibregl-ctrl-top-right, .maplibregl-ctrl-bottom-right';

const LocationPickerMap = dynamic(() => import('../../visual/LocationPickerMap'), {
  ssr: false,
  loading: () => <LoadingState label="Đang tải bản đồ…" />,
});

export interface OrderComposerProps {
  /** Chi khach DANG HOAT DONG — lua chon hop le duy nhat cho mot don moi. */
  readonly customers: readonly TransportCustomer[];
  readonly isCustomersLoading: boolean;
  readonly businessToday: string;
  readonly onCancel: () => void;
  readonly onCreated: (order: TransportOrder) => void;
}

const knownStateOf = (query: SectionQuery<KnownPlacesResponse>): KnownPlacesState => {
  if (query.isBlocked) return { status: 'NONE' };
  if (query.errorMessage !== null) return { status: 'ERROR', message: query.errorMessage };
  if (query.data === undefined) return { status: 'LOADING' };
  return query.data.available ? { status: 'READY', places: query.data.places } : { status: 'NONE' };
};

/** Diem nhin sau mot lua chon tu danh sach: du hai dau thi khung ca hai, khong thi diem vua chon. */
const focusPointsOf = (draft: OrderDraft, chosen: GeoPoint): readonly GeoPoint[] =>
  draft.origin !== null && draft.destination !== null
    ? [draft.origin.point, draft.destination.point]
    : [chosen];

export function OrderComposer({
  customers,
  isCustomersLoading,
  businessToday,
  onCancel,
  onCreated,
}: OrderComposerProps): React.ReactElement {
  const navigation = useNavigationInput();
  const formId = useId();
  const missingId = useId();
  const knownQuery = toSectionQuery(useKnownPlaces(navigation, true));
  const search = usePlaceSearch();
  const reverse = usePlaceReverse();
  const createOrder = useMutation({
    mutationFn: (input: CreateOrderInput) => transportApi.movement.createOrder(input),
    onSuccess: onCreated,
  });

  const [draft, dispatch] = useReducer(draftReducer, EMPTY_DRAFT);
  const [details, setDetails] = useState<OrderDetailsDraft>(() => emptyDetails(businessToday));
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [focus, setFocus] = useState<PickerFocus | null>(null);
  const [position, setPosition] = useState<PositionState>({ status: 'IDLE' });
  const [basemapNotice, setBasemapNotice] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const lookupToken = useRef(0);
  const focusCount = useRef(0);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const isDirty = isDraftDirty(draft, details, businessToday);

  /* Be mat vua THAY cho danh sach: nut vua bam da mat, tieu diem phai co cho dung. */
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  /*
   * Nut "Quay lại danh sách" hoi truoc khi bo; tai lai hay dong tab thi chi trinh duyet hoi duoc.
   * Go khi ban nhap sach, khi tao xong hay khi roi be mat (ham don dep cua effect).
   */
  useEffect(() => {
    if (!isDirty) return undefined;
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const known = knownStateOf(knownQuery);
  const knownPlaces = known.status === 'READY' ? known.places : [];
  const isMapReady = known.status !== 'LOADING';
  const results = search.data?.status === 'OK' ? search.data.results : [];
  const myPosition = position.status === 'FOUND' ? position.point : null;
  const initialBounds = useMemo(() => initialPickerBounds(knownPlaces), [isMapReady]);

  const markers = pickerMarkers({
    draft,
    knownPlaces,
    searchResults: results,
    highlightedResult: highlighted,
    myPosition,
  });

  /*
   * Lop noi che mot phan ban do (the tim, bang trang thai, nut vi tri, the vi tri, chu giai, nut phong
   * to): do khung THAT cua chung luc camera chay, khong doan theo bo cuc — xem `picker-insets.ts`.
   */
  const overlayInsets = (): PickerInsets => {
    const stage = stageRef.current;
    const canvas = stage?.querySelector<HTMLElement>('.tx-picker__canvas') ?? null;
    if (stage === null || canvas === null) return NO_INSETS;
    const overlays = Array.from(stage.querySelectorAll<HTMLElement>(MAP_OVERLAY_SELECTOR), (node) =>
      node.getBoundingClientRect(),
    );
    return insetsForOverlays(canvas.getBoundingClientRect(), overlays);
  };

  const lookAt = (points: readonly GeoPoint[]): void => {
    const bounds = boundsOfPoints(points);
    if (bounds === null) return;
    focusCount.current += 1;
    setFocus({ key: `${focusCount.current}`, bounds });
  };

  const choose = (choice: PlaceChoice, endpoint?: DraftEndpoint): void => {
    const action = { type: 'PLACE_CHOSEN', choice, endpoint } as const;
    dispatch(action);
    lookAt(focusPointsOf(draftReducer(draft, action), choice.point));
  };

  /*
   * Bam ban do: toa do vao o NGAY, ten den sau. Moi lan bam mot ma luot — ket qua tim nguoc cua lan
   * bam cu ve muon bi reducer bo qua, khong ghi de diem nguoi dung vua chon lai.
   */
  const pickOnMap = (point: GeoPoint): void => {
    lookupToken.current += 1;
    const token = lookupToken.current;
    dispatch({ type: 'MAP_PICKED', point, token });
    reverse
      .mutateAsync(point)
      .then((response) =>
        dispatch({
          type: 'REVERSE_SETTLED',
          token,
          candidate: response.status === 'OK' ? response.result : null,
        }),
      )
      .catch(() => dispatch({ type: 'REVERSE_SETTLED', token, candidate: null }));
  };

  /*
   * Bam mot GHIM tren ban do: nguoi dung dang nhin dung cho do, nen camera DUNG YEN — chi lua chon
   * tu danh sach moi dua ban do toi diem vua chon.
   */
  const activateMarker = (marker: PickerMarker): void => {
    if (marker.kind === 'ORIGIN' || marker.kind === 'DESTINATION') {
      dispatch({ type: 'SELECT_ENDPOINT', endpoint: marker.kind });
      return;
    }
    const candidate = results.find((_, index) => searchResultMarkerKey(index) === marker.key);
    const place = knownPlaces.find((entry) => knownPlaceMarkerKey(entry.id) === marker.key);
    const choice =
      candidate !== undefined
        ? choiceFromSearchResult(candidate)
        : place !== undefined
          ? choiceFromKnownPlace(place)
          : null;
    if (choice !== null) dispatch({ type: 'PLACE_CHOSEN', choice });
  };

  const dragMarker = (marker: PickerMarker, point: GeoPoint): void => {
    if (marker.kind === 'ORIGIN' || marker.kind === 'DESTINATION') {
      dispatch({ type: 'POINT_DRAGGED', endpoint: marker.kind, point });
    }
  };

  const runSearch = (query: string): void => {
    setHighlighted(null);
    search.mutate(query, {
      onSuccess: (response) => {
        if (response.status === 'OK') lookAt(response.results.map((entry) => entry.point));
      },
    });
  };

  const locate = (): void => {
    if (position.status === 'LOCATING') return;
    setPosition({ status: 'LOCATING' });
    void readOfficePosition().then((outcome) => {
      if (!outcome.ok) {
        setPosition({ status: 'FAILED', message: POSITION_FAILURE_MESSAGE[outcome.failure] });
        return;
      }
      setPosition({
        status: 'FOUND',
        point: outcome.point,
        accuracyMetres: outcome.accuracyMetres,
      });
      lookAt([outcome.point]);
    });
  };

  const missing = missingRequirements(draft, details);
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const built = buildCreateOrderInput(draft, details);
    if (built.ok && !createOrder.isPending) createOrder.mutate(built.input);
  };

  const requestLeave = (): void => {
    if (isDirty) setIsLeaving(true);
    else onCancel();
  };

  const straightLine =
    draft.origin !== null && draft.destination !== null
      ? ([draft.origin.point, draft.destination.point] as const)
      : null;

  return (
    <section className="tx-composer" aria-label="Tạo đơn mới">
      <PageHeader
        headingRef={headingRef}
        title="Tạo đơn mới"
        summary="Chốt điểm lấy và điểm giao trên bản đồ, rồi điền thông tin đơn."
        actions={
          <button type="button" className="tx-btn" onClick={requestLeave}>
            Quay lại danh sách
          </button>
        }
      />
      <div className="tx-composer__body">
        <RouteTicket
          draft={draft}
          onSelect={(endpoint) => dispatch({ type: 'SELECT_ENDPOINT', endpoint })}
          onRename={(endpoint, name) => dispatch({ type: 'RENAMED', endpoint, name })}
          onClear={(endpoint) => dispatch({ type: 'CLEARED', endpoint })}
        />

        <div ref={stageRef} className="tx-composer__stage">
          <div className="tx-composer__finder" data-map-overlay="">
            <PlaceFinder
              active={draft.active}
              known={known}
              search={{
                isPending: search.isPending,
                response: search.data ?? null,
                errorMessage: search.isError ? (search.error as Error).message : null,
              }}
              highlighted={highlighted}
              onSearch={runSearch}
              onHighlight={setHighlighted}
              onChooseKnown={(place) => choose(choiceFromKnownPlace(place))}
              onChooseResult={(candidate: PlaceCandidate) =>
                choose(choiceFromSearchResult(candidate))
              }
            />
          </div>
          <ActiveBanner
            draft={draft}
            onSwitch={(endpoint) => dispatch({ type: 'SELECT_ENDPOINT', endpoint })}
          />
          <div className="tx-composer__canvas">
            {isMapReady ? (
              <LocationPickerMap
                markers={markers}
                initialBounds={initialBounds}
                focus={focus}
                overlayInsets={overlayInsets}
                onPick={pickOnMap}
                onMarkerActivate={activateMarker}
                onMarkerDrag={dragMarker}
                accuracy={
                  position.status === 'FOUND' && position.accuracyMetres !== null
                    ? { center: position.point, radiusMetres: position.accuracyMetres }
                    : null
                }
                straightLine={straightLine}
                ariaLabel="Bản đồ chọn điểm. Bấm vào bản đồ để đặt điểm đang chọn, bấm đúp để phóng to; kéo ghim Lấy hoặc Giao để chỉnh."
                onBasemapNotice={setBasemapNotice}
              />
            ) : (
              <LoadingState label="Đang tải địa điểm đã biết…" />
            )}
          </div>
          <LocateButton position={position} onLocate={locate} />
          <PositionCard
            position={position}
            onDismiss={() => setPosition({ status: 'IDLE' })}
            onUse={(endpoint) => {
              if (position.status !== 'FOUND') return;
              choose(choiceFromBrowserPosition(position.point, position.accuracyMetres), endpoint);
            }}
          />
          <MapLegend />
          {basemapNotice === null ? null : (
            <p className="tx-note tx-composer__notice" data-testid="tx-picker-notice">
              {basemapNotice}
            </p>
          )}
        </div>

        <OrderFacts
          formId={formId}
          details={details}
          customers={customers}
          isCustomersLoading={isCustomersLoading}
          onChange={(patch) => setDetails((current) => ({ ...current, ...patch }))}
          onSubmit={submit}
        />
        {createOrder.isError ? (
          <div className="tx-composer__error">
            <ErrorState message={createOrderErrorMessage(createOrder.error as TransportApiError)} />
          </div>
        ) : null}
        <div className="tx-composer__submit">
          <p id={missingId} className="tx-composer__missing" aria-live="polite">
            {missingSentence(missing)}
          </p>
          <button
            type="submit"
            form={formId}
            className="tx-btn tx-btn--go tx-composer__create"
            disabled={missing.length > 0 || createOrder.isPending}
            aria-describedby={missingId}
          >
            {createOrder.isPending ? 'Đang tạo đơn…' : 'Tạo đơn'}
          </button>
        </div>
      </div>

      <ConfirmAction
        open={isLeaving}
        title="Bỏ đơn đang soạn?"
        detail="Điểm lấy, điểm giao và thông tin đã nhập sẽ không được lưu."
        confirmLabel="Bỏ đơn đang soạn"
        isDestructive
        onConfirm={onCancel}
        onCancel={() => setIsLeaving(false)}
      />
    </section>
  );
}
