'use client';

import dynamic from 'next/dynamic';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { PageHeader, StatusBadge } from '../components/primitives';
import { ConfirmAction, EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import { useNavigationInput } from '../hooks/useTransportWorkspace';
import { canPerform } from '../transport-actions';
import type { GeoPoint } from '../transport-types';
import type { PickerFocus } from '../visual/LocationPickerMap';
import { boundsOfPoints, formatCoordinates, type PickerMarker } from '../workspace/place-lookup';
import { ADMIN_REASON_MAX_LENGTH, formatDateTime } from './accounts-model';
import { placesAdminApi } from './admin-api';
import { adminErrorMessage, openWorkOf } from './admin-reasons';
import { useAdminPlaces, useInvalidatePlaces, usePlaceHistory } from './admin-hooks';
import type {
  OpenWorkDetail,
  PlaceAdminView,
  PlaceKindFilter,
  PlaceStatusFilter,
} from './admin-types';
import { AdminError, AdminNotice, ChipRow, FilterChip, focusOpener } from './AdminBits';
import { OpenWorkDialog } from './OpenWorkDialog';
import { PlaceEditor } from './PlaceEditor';
import {
  COUNTERPARTY_MANAGE_NEEDED,
  DEACTIVATE_WARNING,
  DEFAULT_PLACE_FILTER,
  DEPOT_PLANNER_SENTENCE,
  DEPOT_PLANNER_SHORT,
  DEPOT_PLANNER_TONE,
  depotSummary,
  editPlaceDraft,
  EDITING_MARKER_KEY,
  filterPlaces,
  initialPlaceBounds,
  isStandbyDepot,
  kindCounts,
  needsCounterpartyManage,
  newPlaceDraft,
  PLACE_KIND_FILTER_LABEL,
  PLACE_STATUS_LABEL,
  PLACE_STATUS_TONE,
  placeHistoryLabel,
  placeKindLabel,
  placeMarkers,
  placeOwnerLine,
  placeRings,
  placeStatusLabel,
  savedNotice,
  withPoint,
  type PlaceDraft,
  type PlaceFilter,
} from './places-model';
import '../visual/location-picker-map.css';
import './transport-admin.css';

/**
 * "Địa điểm vận hành" (`#395` §3.2) — BAN DO TRUOC.
 *
 * MOT nguon cho moi dia diem: bai xe o day la CHINH bai khau lap ke hoach dung cho chang rong va dong
 * vong chay; kho khach hang va nha may doi tac o day la CHINH diem man Tao don goi y va hang rao cham
 * bang chung hien truong. Nen moi thao tac o day noi HAU QUA cua no truoc khi lam.
 *
 * Bo cuc: may ban — danh sach (hoac trinh sua) ben trai, ban do ben phai dung yen khi cuon. Dien
 * thoai — danh sach, mot nut chuyen sang ban do; khi dang them/sua thi ban do nam TREN trinh sua de
 * bam dat diem duoc.
 */

const LocationPickerMap = dynamic(() => import('../visual/LocationPickerMap'), {
  ssr: false,
  loading: () => <LoadingState label="Đang tải bản đồ…" />,
});

const KIND_FILTERS: readonly PlaceKindFilter[] = [
  'ALL',
  'DEPOT',
  'CUSTOMER_SITE',
  'PARTNER_SITE',
  'LEGACY_CUSTOMER',
];
const STATUS_FILTERS: readonly PlaceStatusFilter[] = ['active', 'inactive', 'all'];
const STATUS_FILTER_LABEL: Readonly<Record<PlaceStatusFilter, string>> = {
  active: 'Đang dùng',
  inactive: 'Đã tắt',
  all: 'Tất cả',
};

/** Nguon dat diem ma ban do nen BAY toi — bam/keo tren ban do thi nguoi dung dang nhin roi. */
const FOCUS_SOURCES = new Set(['SEARCH', 'POSITION', 'PASTE']);

type PendingOperation =
  { readonly kind: 'DEACTIVATE'; readonly reason: string } | { readonly kind: 'MAKE_PRIMARY' };

function PlaceRow({
  place,
  isSelected,
  onOpen,
}: {
  readonly place: PlaceAdminView;
  readonly isSelected: boolean;
  readonly onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="tx-admin-person tx-admin-place"
        aria-current={isSelected ? 'true' : undefined}
        data-kind={place.kind}
        data-opens={place.id}
        onClick={onOpen}
      >
        <span className="tx-admin-person__name">{place.name}</span>
        <span className="tx-admin-person__meta">
          <span className="tx-admin-place__kind">{placeKindLabel(place)}</span>
          <span>{placeOwnerLine(place)}</span>
        </span>
        <span className="tx-admin-person__side">
          {isStandbyDepot(place) ? null : (
            <StatusBadge
              label={PLACE_STATUS_LABEL[place.effectiveStatus]}
              tone={PLACE_STATUS_TONE[place.effectiveStatus]}
            />
          )}
          {place.depot === null ? null : (
            <StatusBadge
              label={DEPOT_PLANNER_SHORT[place.depot.plannerStatus]}
              title={DEPOT_PLANNER_SENTENCE[place.depot.plannerStatus]}
              tone={DEPOT_PLANNER_TONE[place.depot.plannerStatus]}
            />
          )}
          {place.conflicts.length === 0 ? null : <StatusBadge label="Trùng tên" tone="wait" />}
        </span>
      </button>
    </li>
  );
}

function PlaceHistory({ placeId }: { readonly placeId: string }) {
  const navigation = useNavigationInput();
  const history = usePlaceHistory(navigation, placeId, true);
  if (history.isPending) return <LoadingState label="Đang đọc lịch sử…" />;
  if (history.error !== null) return <AdminError error={history.error} />;
  if (history.data.length === 0) return <p className="tx-note">Chưa có thay đổi nào được ghi.</p>;
  return (
    <ol className="tx-admin-history" data-testid="place-history">
      {history.data.map((entry, index) => (
        <li key={`${entry.at}-${entry.action}-${index}`}>
          <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
          <span className="tx-admin-history__who">{entry.actor}</span>
          <span>{placeHistoryLabel(entry)}</span>
        </li>
      ))}
    </ol>
  );
}

function PlaceDetail({
  place,
  places,
  canManageCounterparties,
  onEdit,
  onClose,
  onChanged,
}: {
  readonly place: PlaceAdminView;
  readonly places: readonly PlaceAdminView[];
  readonly canManageCounterparties: boolean;
  readonly onEdit: () => void;
  readonly onClose: () => void;
  readonly onChanged: (saved: PlaceAdminView, message: string) => void;
}) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [dialog, setDialog] = useState<'DEACTIVATE' | 'MAKE_PRIMARY' | null>(null);
  const [reason, setReason] = useState('');
  const [openWork, setOpenWork] = useState<{
    readonly detail: OpenWorkDetail;
    readonly operation: PendingOperation;
  } | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const isDepot = place.kind === 'DEPOT';
  const isActive = place.status === 'ACTIVE';
  const lacksCounterpartyManage = needsCounterpartyManage(place) && !canManageCounterparties;
  const primary = places.find(
    (entry) => entry.kind === 'DEPOT' && entry.depot?.plannerStatus === 'IN_USE',
  );
  /*
   * Bai du phong KHONG "Bật lại" duoc khi bai khac dang bat: may chu chi cho MOT bai bat mot luc
   * (`409 DEPOT_ALREADY_ACTIVE`). Duong dung la "Đặt làm bãi chính" — nut bat lai khong duoc hien de
   * that bai moi lan bam.
   */
  const isStandbyDepot =
    isDepot &&
    places.some(
      (entry) => entry.kind === 'DEPOT' && entry.id !== place.id && entry.status === 'ACTIVE',
    );

  /* Mo chi tiet = tieu diem len tieu de (danh sach vua bi thay bang chi tiet, nut da bam khong con). */
  useEffect(() => heading.current?.focus(), []);

  const run = useMutation({
    mutationFn: async (input: { operation: PendingOperation; acknowledgeOpenWork: boolean }) => {
      const ack = input.acknowledgeOpenWork ? { acknowledgeOpenWork: true } : {};
      if (input.operation.kind === 'DEACTIVATE') {
        return {
          operation: input.operation,
          saved: await placesAdminApi.deactivate(place.id, {
            reason: input.operation.reason,
            ...ack,
          }),
        };
      }
      return {
        operation: input.operation,
        saved: await placesAdminApi.makePrimaryDepot(place.id, ack),
      };
    },
    onSuccess: ({ operation, saved }) => {
      setDialog(null);
      setOpenWork(null);
      setReason('');
      onChanged(
        saved,
        operation.kind === 'DEACTIVATE'
          ? `Đã tắt ${saved.name}. Bật lại được bất cứ lúc nào.`
          : `${saved.name} là bãi chính — dùng để lập kế hoạch chặng rỗng và đóng vòng chạy.`,
      );
    },
    onError: (error, input) => {
      const detail = openWorkOf(error);
      if (detail === null) return;
      setDialog(null);
      setOpenWork({ detail, operation: input.operation });
    },
  });

  const activate = useMutation({
    mutationFn: () => placesAdminApi.activate(place.id),
    onSuccess: (saved) => onChanged(saved, `Đã bật lại ${saved.name}.`),
  });

  /* Loi cua hop thoai nam TRONG hop (hop phu kin trang); `409` viec dang mo la hop rieng, khong phai loi. */
  const runError = run.error !== null && openWorkOf(run.error) === null ? run.error : null;
  const openDialog = (next: 'DEACTIVATE' | 'MAKE_PRIMARY') => {
    run.reset();
    setDialog(next);
  };

  return (
    <article className="tx-admin-sheet" aria-labelledby={titleId} data-testid="place-detail">
      <header className="tx-admin-sheet__head">
        <div>
          <p className="tx-admin-eyebrow">{placeKindLabel(place)}</p>
          <h2 id={titleId} ref={heading} tabIndex={-1}>
            {place.name}
          </h2>
          <p className="tx-admin-sheet__sub">{placeOwnerLine(place)}</p>
        </div>
        <div className="tx-admin-sheet__badges">
          <StatusBadge
            label={placeStatusLabel(place)}
            tone={PLACE_STATUS_TONE[place.effectiveStatus]}
          />
        </div>
        <button
          type="button"
          className="tx-btn tx-btn--ghost tx-btn--small tx-admin-sheet__close"
          onClick={onClose}
        >
          Đóng<span className="tx-visually-hidden"> chi tiết {place.name}</span>
        </button>
      </header>

      {place.depot === null ? null : (
        <div
          className="tx-admin-planner"
          data-tone={DEPOT_PLANNER_TONE[place.depot.plannerStatus]}
          data-testid="depot-planner"
        >
          <strong>{DEPOT_PLANNER_SENTENCE[place.depot.plannerStatus]}</strong>
          <span>
            Mã bãi <span className="tx-admin-mono">{place.depot.code}</span>
          </span>
        </div>
      )}
      {place.conflicts.length === 0 ? null : (
        <p className="tx-note tx-note--warn">
          Tên này trùng với địa điểm đang hoạt động khác: {place.conflicts.join(', ')}. Đổi tên một
          trong hai để lái xe và điều hành không nhầm.
        </p>
      )}
      {place.effectiveStatus === 'OWNER_INACTIVE' ? (
        <p className="tx-note tx-note--warn">
          Đơn vị sở hữu địa điểm này đã ngừng hoạt động, nên địa điểm không còn hiện ở Tạo đơn và
          không dùng để chấm bằng chứng mới.
        </p>
      ) : null}

      <dl className="tx-admin-facts">
        <div>
          <dt>Địa chỉ</dt>
          <dd>{place.address ?? '—'}</dd>
        </div>
        <div>
          <dt>Toạ độ</dt>
          <dd className="tx-admin-mono">{formatCoordinates(place.point)}</dd>
        </div>
        <div>
          <dt>Bán kính “đã đến nơi”</dt>
          <dd>{place.radiusMetres.toLocaleString('vi-VN')} m</dd>
        </div>
        <div>
          <dt>Cập nhật</dt>
          <dd>{formatDateTime(place.updatedAt)}</dd>
        </div>
        {place.note === null ? null : (
          <div className="tx-admin-facts__wide">
            <dt>Ghi chú</dt>
            <dd>{place.note}</dd>
          </div>
        )}
      </dl>

      <div className="tx-admin-actions">
        <button type="button" className="tx-btn" onClick={onEdit}>
          Sửa địa điểm
        </button>
        {isDepot && place.depot?.plannerStatus !== 'IN_USE' ? (
          <button
            type="button"
            className="tx-btn tx-btn--go"
            onClick={() => openDialog('MAKE_PRIMARY')}
          >
            Đặt làm bãi chính
          </button>
        ) : null}
        {isActive ? (
          <button
            type="button"
            className="tx-btn tx-btn--stop"
            disabled={lacksCounterpartyManage}
            onClick={() => openDialog('DEACTIVATE')}
          >
            Tắt địa điểm
          </button>
        ) : isStandbyDepot ? null : (
          <button
            type="button"
            className="tx-btn"
            disabled={lacksCounterpartyManage || activate.isPending}
            onClick={() => activate.mutate()}
          >
            {activate.isPending ? 'Đang bật…' : 'Bật lại'}
          </button>
        )}
      </div>
      {lacksCounterpartyManage ? <p className="tx-note">{COUNTERPARTY_MANAGE_NEEDED}</p> : null}
      <AdminError error={activate.error} />

      <section className="tx-admin-block" aria-label="Lịch sử">
        <button
          type="button"
          className="tx-btn tx-btn--ghost tx-btn--small"
          aria-expanded={isHistoryOpen}
          onClick={() => setIsHistoryOpen((open) => !open)}
        >
          {isHistoryOpen ? 'Ẩn lịch sử' : 'Lịch sử thay đổi'}
        </button>
        {isHistoryOpen ? <PlaceHistory placeId={place.id} /> : null}
      </section>

      <ConfirmAction
        open={dialog === 'DEACTIVATE'}
        title={`Tắt ${place.name}?`}
        detail={DEACTIVATE_WARNING}
        confirmLabel="Tắt địa điểm"
        reasonLabel="Lý do tắt (ghi vào lịch sử)"
        reason={reason}
        onReasonChange={setReason}
        reasonMaxLength={ADMIN_REASON_MAX_LENGTH}
        isDestructive
        isBusy={run.isPending}
        error={<AdminError error={runError} />}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          run.mutate({
            operation: { kind: 'DEACTIVATE', reason: reason.trim() },
            acknowledgeOpenWork: false,
          })
        }
      >
        <div className="tx-admin-warning" data-testid="deactivate-warning">
          {isDepot && place.depot?.plannerStatus === 'IN_USE' ? (
            <p>
              Đây là bãi đang dùng để lập kế hoạch. Tắt nó thì hệ thống không còn bãi xe nào cho
              chặng rỗng và đóng vòng chạy — cho tới khi bạn đặt một bãi khác làm bãi chính.
            </p>
          ) : null}
          {place.kind === 'COUNTERPARTY_SITE' ? (
            <p>
              Địa điểm này của {placeOwnerLine(place)} cũng tắt theo ở hồ sơ đơn vị; đơn mới không
              chọn được nó nữa.
            </p>
          ) : null}
        </div>
      </ConfirmAction>
      <ConfirmAction
        open={dialog === 'MAKE_PRIMARY'}
        title={`Đặt ${place.name} làm bãi chính?`}
        detail={
          primary === undefined || primary.id === place.id
            ? 'Từ lượt lập kế hoạch kế tiếp, chặng rỗng và đóng vòng chạy dùng bãi này.'
            : `${primary.name} chuyển thành bãi dự phòng. Từ lượt lập kế hoạch kế tiếp, chặng rỗng và đóng vòng chạy dùng bãi này.`
        }
        confirmLabel="Đặt làm bãi chính"
        isBusy={run.isPending}
        error={<AdminError error={runError} />}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          run.mutate({ operation: { kind: 'MAKE_PRIMARY' }, acknowledgeOpenWork: false })
        }
      />
      <OpenWorkDialog
        detail={openWork?.detail ?? null}
        confirmLabel={
          openWork?.operation.kind === 'DEACTIVATE' ? 'Tôi đã xem, vẫn tắt' : 'Tôi đã xem, vẫn đổi'
        }
        isBusy={run.isPending}
        error={<AdminError error={runError} />}
        onCancel={() => setOpenWork(null)}
        onConfirm={() => {
          if (openWork !== null)
            run.mutate({ operation: openWork.operation, acknowledgeOpenWork: true });
        }}
      />
    </article>
  );
}

/**
 * Chu giai ghim — CUNG ky hieu voi ghim tren ban do (cung lop `tx-pin--*`). Hinh ghim theo LOAI HANG
 * RAO: kho khach hang va nha may doi tac cung la dia diem cua mot phap nhan (`COUNTERPARTY_SITE`,
 * `#395` §2.1) nen cung mot hinh; danh sach ben canh moi tach hai loai do.
 */
const LEGEND_ENTRIES = [
  { pin: 'tx-pin--depot', label: PLACE_KIND_FILTER_LABEL.DEPOT },
  { pin: 'tx-pin--site', label: 'Kho, nhà máy của khách hàng hoặc đối tác' },
  { pin: 'tx-pin--customer', label: PLACE_KIND_FILTER_LABEL.LEGACY_CUSTOMER },
] as const;

function PlacesMapLegend() {
  return (
    <ul className="tx-admin-maplegend" aria-label="Chú giải bản đồ">
      {LEGEND_ENTRIES.map((entry) => (
        <li key={entry.pin}>
          <span className={`tx-pin tx-pin--known ${entry.pin}`} aria-hidden="true">
            <span className="tx-pin__mark" />
          </span>
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

function DepotCard({
  places,
  onOpen,
}: {
  readonly places: readonly PlaceAdminView[];
  readonly onOpen: (place: PlaceAdminView) => void;
}) {
  const summary = depotSummary(places);
  return (
    <section
      className="tx-admin-depotcard"
      data-tone={summary.tone}
      aria-label="Bãi xe dùng để lập kế hoạch"
    >
      <p className="tx-admin-eyebrow">Bãi xe dùng để lập kế hoạch</p>
      <p className="tx-admin-depotcard__title" data-testid="depot-summary">
        {summary.title}
      </p>
      <p className="tx-note">{summary.detail}</p>
      {summary.standby.length === 0 ? null : (
        <ul className="tx-admin-depotcard__standby" aria-label="Bãi dự phòng">
          {summary.standby.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                className="tx-btn tx-btn--ghost tx-btn--small"
                data-opens={place.id}
                onClick={() => onOpen(place)}
              >
                {place.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PlacesAdminView() {
  const navigation = useNavigationInput();
  const canManage = canPerform(navigation, 'transport.geofence.manage');
  const canManageCounterparties = canPerform(navigation, 'transport.counterparty.manage');
  const canLookUp = canPerform(navigation, 'transport.order.manage');
  // Doc danh sach bang ma DOC cua route (`transport.geofence.read`) — truoc `#395` hook nhan ma SUA
  // tu day, va nguoi chi duoc sua nhan `403` o chinh lan doc nay.
  const places = useAdminPlaces(navigation);
  const invalidate = useInvalidatePlaces();
  const [filter, setFilter] = useState<PlaceFilter>(DEFAULT_PLACE_FILTER);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<PlaceAdminView | null>(null);
  const [draft, setDraft] = useState<PlaceDraft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'LIST' | 'MAP'>('LIST');
  const [focus, setFocus] = useState<PickerFocus | null>(null);
  const [basemapNotice, setBasemapNotice] = useState<string | null>(null);
  const focusCount = useRef(0);
  const sideRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<string | null>(null);

  const all = useMemo(() => places.data ?? [], [places.data]);
  const visible = filterPlaces(all, filter);
  const counts = kindCounts(all, filter.status);
  const selected =
    selectedId === null
      ? null
      : (all.find((place) => place.id === selectedId) ??
        (lastSaved?.id === selectedId ? lastSaved : null));

  /* Khung dau tien cua ban do: bao moi dia diem — chot MOT lan khi du lieu ve, khong nhay theo loc. */
  const [initialBounds, setInitialBounds] = useState<ReturnType<typeof initialPlaceBounds> | null>(
    null,
  );
  useEffect(() => {
    if (initialBounds === null && places.data !== undefined) {
      setInitialBounds(initialPlaceBounds(places.data));
    }
  }, [initialBounds, places.data]);

  const lookAt = (points: readonly GeoPoint[]) => {
    const bounds = boundsOfPoints(points);
    if (bounds === null) return;
    focusCount.current += 1;
    setFocus({ key: `${focusCount.current}`, bounds });
  };

  /* Diem dat bang tim / vi tri / dan toa do nam ngoai khung dang nhin — bay toi do. */
  const draftPoint = draft?.point ?? null;
  const draftSource = draft?.pointSource ?? null;
  const draftPointKey =
    draftPoint === null ? null : `${draftPoint.latitude},${draftPoint.longitude}`;
  useEffect(() => {
    if (draftPoint === null || draftSource === null || !FOCUS_SOURCES.has(draftSource)) return;
    focusCount.current += 1;
    setFocus({
      key: `${focusCount.current}`,
      bounds: boundsOfPoints([draftPoint]) ?? [0, 0, 0, 0],
    });
    // `draftPoint` doi danh tinh moi lan ve; khoa theo TOA DO + nguon, khong theo doi tuong.
  }, [draftPointKey, draftSource]);

  const markers = placeMarkers(visible, selectedId, draftPoint, draft?.placeId ?? null);
  const rings = placeRings(
    visible,
    draft === null
      ? null
      : { point: null, radiusMetres: draft.radiusMetres, placeId: draft.placeId },
  );

  const openPlace = (place: PlaceAdminView) => {
    setDraft(null);
    setSelectedId(place.id);
    setMobileView('LIST');
    lookAt([place.point]);
  };

  const startCreate = () => {
    setSelectedId(null);
    setNotice(null);
    setDraft(newPlaceDraft());
  };

  const afterWrite = (saved: PlaceAdminView, message: string) => {
    setLastSaved(saved);
    setSelectedId(saved.id);
    setNotice(message);
    invalidate();
  };

  /* Dong chi tiet → tieu diem ve nut da mo no (dong danh sach, the bai xe) khi danh sach hien lai. */
  const isListShown = draft === null && selected === null;
  useEffect(() => {
    if (!isListShown || returnFocusTo.current === null) return;
    if (!focusOpener(sideRef.current, returnFocusTo.current)) {
      sideRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    }
    returnFocusTo.current = null;
  }, [isListShown]);

  const onMarkerActivate = (marker: PickerMarker) => {
    if (draft !== null || !marker.key.startsWith('place:')) return;
    const place = all.find((entry) => `place:${entry.id}` === marker.key);
    if (place !== undefined) openPlace(place);
  };

  if (!canManage) {
    return (
      <>
        <PageHeader title="Địa điểm vận hành" />
        <ErrorState message="Tài khoản của bạn chưa được cấp quyền quản lý địa điểm vận hành. Nhờ Giám đốc cấp quyền." />
      </>
    );
  }

  const isEditing = draft !== null;

  return (
    <div className="tx-admin tx-admin-places" data-mobile-view={isEditing ? 'EDIT' : mobileView}>
      <PageHeader
        title="Địa điểm vận hành"
        summary="Bãi xe, kho khách hàng và nhà máy đối tác — một nguồn cho Tạo đơn, lập kế hoạch chặng rỗng và chấm bằng chứng hiện trường."
        context={
          <p className="tx-admin-counts" aria-label="Số địa điểm">
            <span>
              <strong>{counts.DEPOT}</strong> bãi xe
            </span>
            <span>
              <strong>{counts.CUSTOMER_SITE}</strong> địa điểm khách hàng
            </span>
            <span>
              <strong>{counts.PARTNER_SITE}</strong> nhà máy / kho đối tác
            </span>
            {/* Diem khach hang kieu cu cung dang dung — thieu no thi cac con so khong cong ra tong. */}
            {counts.LEGACY_CUSTOMER === 0 ? null : (
              <span>
                <strong>{counts.LEGACY_CUSTOMER}</strong> điểm khách hàng (kiểu cũ)
              </span>
            )}
          </p>
        }
        actions={
          isEditing ? undefined : (
            <button type="button" className="tx-btn tx-btn--go" onClick={startCreate}>
              Thêm địa điểm
            </button>
          )
        }
      />
      <AdminNotice message={notice} />

      <div className="tx-admin-mapsplit">
        <div className="tx-admin-mapsplit__side" ref={sideRef}>
          {isEditing ? (
            <PlaceEditor
              key={draft.placeId ?? 'new'}
              draft={draft}
              onChange={setDraft}
              canLookUp={canLookUp}
              canManageCounterparties={canManageCounterparties}
              basemapNotice={basemapNotice}
              onCancel={() => setDraft(null)}
              onSaved={(saved, isCreate) => {
                setDraft(null);
                afterWrite(saved, savedNotice(saved, isCreate));
                lookAt([saved.point]);
              }}
            />
          ) : selected !== null ? (
            <PlaceDetail
              key={selected.id}
              place={selected}
              places={all}
              canManageCounterparties={canManageCounterparties}
              onEdit={() => {
                setNotice(null);
                setDraft(editPlaceDraft(selected));
              }}
              onClose={() => {
                returnFocusTo.current = selected.id;
                setSelectedId(null);
              }}
              onChanged={afterWrite}
            />
          ) : (
            <section className="tx-admin-listpane" aria-label="Danh sách địa điểm">
              {places.data === undefined ? null : <DepotCard places={all} onOpen={openPlace} />}
              <label className="tx-field tx-admin-search">
                <span>Tìm theo tên, địa chỉ, chủ địa điểm</span>
                <input
                  type="search"
                  value={filter.query}
                  onChange={(event) => setFilter({ ...filter, query: event.target.value })}
                />
              </label>
              <ChipRow label="Lọc theo loại">
                {KIND_FILTERS.map((kind) => (
                  <FilterChip
                    key={kind}
                    label={PLACE_KIND_FILTER_LABEL[kind]}
                    count={counts[kind]}
                    isPressed={filter.kind === kind}
                    onClick={() => setFilter({ ...filter, kind })}
                  />
                ))}
              </ChipRow>
              <ChipRow label="Lọc theo trạng thái">
                {STATUS_FILTERS.map((status) => (
                  <FilterChip
                    key={status}
                    label={STATUS_FILTER_LABEL[status]}
                    isPressed={filter.status === status}
                    onClick={() => setFilter({ ...filter, status })}
                  />
                ))}
              </ChipRow>
              <button
                type="button"
                className="tx-btn tx-admin-maptoggle"
                aria-pressed={mobileView === 'MAP'}
                onClick={() => setMobileView(mobileView === 'MAP' ? 'LIST' : 'MAP')}
              >
                {mobileView === 'MAP' ? 'Xem danh sách' : 'Xem bản đồ'}
              </button>

              {places.isPending ? <LoadingState label="Đang đọc địa điểm…" /> : null}
              {places.error === null ? null : (
                <ErrorState
                  message={adminErrorMessage(places.error)}
                  onRetry={() => void places.refetch()}
                />
              )}
              {!places.isPending && places.error === null && visible.length === 0 ? (
                <EmptyState
                  title={
                    all.length === 0
                      ? 'Chưa có địa điểm vận hành nào. Bắt đầu từ bãi xe của công ty.'
                      : 'Không có địa điểm nào khớp bộ lọc.'
                  }
                  nextAction={
                    all.length === 0 ? (
                      <button type="button" className="tx-btn tx-btn--go" onClick={startCreate}>
                        Thêm bãi xe
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <ul className="tx-admin-people" aria-label="Địa điểm">
                  {visible.map((place) => (
                    <PlaceRow
                      key={place.id}
                      place={place}
                      isSelected={place.id === selectedId}
                      onOpen={() => openPlace(place)}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <div className="tx-admin-mapsplit__map" data-editing={isEditing ? '' : undefined}>
          {initialBounds === null ? (
            <LoadingState label="Đang tải địa điểm…" />
          ) : (
            <LocationPickerMap
              markers={markers}
              rings={rings}
              accuracy={
                draft?.point == null
                  ? null
                  : { center: draft.point, radiusMetres: draft.radiusMetres }
              }
              initialBounds={initialBounds}
              focus={focus}
              onPick={
                draft === null
                  ? undefined
                  : (point) =>
                      setDraft((current) =>
                        current === null ? current : withPoint(current, point, 'MAP'),
                      )
              }
              onMarkerActivate={onMarkerActivate}
              onMarkerDrag={(marker, point) => {
                if (marker.key !== EDITING_MARKER_KEY) return;
                setDraft((current) =>
                  current === null ? current : withPoint(current, point, 'DRAG'),
                );
              }}
              onBasemapNotice={setBasemapNotice}
              testId="tx-places-map"
              ariaLabel={
                isEditing
                  ? 'Bản đồ địa điểm. Bấm vào bản đồ để đặt điểm, kéo ghim “Đây” để chỉnh.'
                  : 'Bản đồ địa điểm vận hành. Bấm một ghim để xem địa điểm đó.'
              }
            />
          )}
          <PlacesMapLegend />
          {isEditing ? (
            <p className="tx-note tx-admin-maphint">
              Bấm vào bản đồ để đặt điểm. Kéo ghim “Đây” để chỉnh; vòng tròn là bán kính “đã đến
              nơi”.
            </p>
          ) : null}
          {basemapNotice === null || isEditing ? null : (
            <p className="tx-note tx-note--warn">{basemapNotice}</p>
          )}
        </div>
      </div>
    </div>
  );
}
