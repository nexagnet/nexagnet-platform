'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { PermissionGate, PermissionNote } from '../components/PermissionGate';
import { DataTable, DetailRow, PageHeader, StatusBadge } from '../components/primitives';
import { ConfirmAction, EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  expenseCategoryLabel,
  formatMoney,
  TRIP_KIND_LABEL,
  TRIP_STATUS_LABEL,
} from '../customer-view';
import {
  toSectionQuery,
  useCustomers,
  useDrivers,
  useNavigationInput,
  usePartners,
  useTripAssignments,
  useTripCost,
  useTrips,
  useVehicles,
} from '../hooks/useTransportWorkspace';
import { useRevealOnOpen } from '../hooks/useRevealOnOpen';
import { canPerform, hasOperationsScope, operationsEmptyMessage } from '../transport-actions';
import { transportApi } from '../transport-api';
import { TRIP_KINDS, TRIP_STATUSES, type TripKind, type TripStatus } from '../transport-types';
import { toTripCost } from '../workspace/driver-fund';
import { TripFuelEntries } from './TripFuelEntries';
import { TripAssignForm, TripPlanForm } from './TripCommands';
import {
  activeAssignment,
  cancellationNote,
  filterTrips,
  findTripByCode,
  parseTripFilter,
  primaryOffer,
  sortTrips,
  toAssignmentRows,
  toDirectory,
  toTripFilterQuery,
  toTripRows,
  toTripTimeline,
  tripActionOffers,
  tripFilterAfterClose,
  tripFilterForSelection,
  type TripActionOffer,
  type TripFilter,
  type TripRow,
} from '../workspace/trips';
import { EMPTY_TRIP_FILTER_QUERY, type TripFilterQuery } from '../navigation';

/**
 * Man CHUYEN XE.
 *
 * Chon dong bang MA CHUYEN, khong bang `id`: dia chi phai doc duoc va dan duoc cho nguoi khac. API
 * khong co duong tra cuu theo ma chuyen, nen ma duoc doi nguoc ve `id`
 * ngay tren danh sach da tai ve — mot hau qua tinh co thuan tien cua viec API tra ve ca bang.
 */
export function TripsView({
  selection,
  onSelect,
  filter: filterQuery,
  onFilterChange,
}: {
  readonly selection: string | null;
  /**
   * Nhan MA chuyen. `null` de dong khoi chi tiet.
   *
   * Bo loc di CUNG loi goi, khong phai mot loi goi thu hai: xem `selectWithin` trong
   * `TransportOperations.tsx` — hai loi goi roi nhau se ghi de len nhau.
   */
  readonly onSelect: (code: string | null, filter?: TripFilterQuery) => void;
  /**
   * BO LOC DEN TU DIA CHI, khong tu `useState` cua man nay — #222 P2.
   *
   * Truoc ban nay o tim kiem la trang thai cuc bo, nen tai lai trang la mat chu vua go trong khi
   * khoi chi tiet van mo: mot man hinh tu mau thuan voi chinh no. Nay MOT nguon su that duy nhat —
   * thanh dia chi — nen tai lai, Back/Forward va dan lien ket deu cho cung mot ket qua.
   */
  readonly filter: TripFilterQuery;
  readonly onFilterChange: (filter: TripFilterQuery) => void;
}) {
  const navigation = useNavigationInput();
  const queryClient = useQueryClient();
  const trips = toSectionQuery(useTrips(navigation));
  const customers = toSectionQuery(useCustomers(navigation));
  const partners = toSectionQuery(usePartners(navigation));
  const vehicles = toSectionQuery(useVehicles(navigation));
  const drivers = toSectionQuery(useDrivers(navigation));

  const filter = useMemo(() => parseTripFilter(filterQuery), [filterQuery]);
  const setFilter = (next: (previous: TripFilter) => TripFilter) =>
    onFilterChange(toTripFilterQuery(next(filter)));
  const [isPlanning, setPlanning] = useState(false);

  const directory = useMemo(
    () =>
      toDirectory({
        customers: customers.data ?? [],
        partners: partners.data ?? [],
        vehicles: vehicles.data ?? [],
        drivers: drivers.data ?? [],
      }),
    [customers.data, partners.data, vehicles.data, drivers.data],
  );

  const all = useMemo(() => sortTrips(trips.data ?? []), [trips.data]);
  const visible = useMemo(() => filterTrips(all, filter), [all, filter]);
  const rows = useMemo(() => toTripRows(visible, directory), [visible, directory]);
  const selected = findTripByCode(all, selection);

  if (!hasOperationsScope(navigation)) {
    return (
      <>
        <PageHeader title="Chuyến xe" />
        <ErrorState message={operationsEmptyMessage(navigation)} />
      </>
    );
  }

  const invalidateTrips = () => {
    void queryClient.invalidateQueries({ queryKey: ['transport', 'trips'] });
  };

  return (
    <>
      <PageHeader
        title="Chuyến xe"
        summary="Lập chuyến, phân công xe và lái xe, theo dõi vòng đời chuyến."
        context={
          <span className="tx-count">
            {visible.length === all.length
              ? `${all.length} chuyến`
              : `${visible.length} / ${all.length} chuyến`}
          </span>
        }
        actions={
          canPerform(navigation, 'transport.trip.create') ? (
            <button
              type="button"
              className="tx-btn tx-btn--go"
              onClick={() => setPlanning((prev) => !prev)}
            >
              {isPlanning ? 'Đóng biểu mẫu' : 'Lập chuyến'}
            </button>
          ) : null
        }
      />

      {isPlanning ? (
        <TripPlanForm
          customers={customers.data ?? []}
          partners={partners.data ?? []}
          onCancel={() => setPlanning(false)}
          onDone={(code) => {
            setPlanning(false);
            invalidateTrips();
            // Chuyen VUA LAP phai nhin thay duoc ngay, nen bo het bo loc dang co: mot bo loc trang
            // thai hay loai chuyen con lai tu truoc hoan toan co the dang giau dung no.
            onSelect(code, { search: code, status: null, kind: null });
          }}
        />
      ) : null}

      {/* `#395` — ten khach, doi tac, xe, lai xe la danh ba RIENG: thieu quyen thi noi ra. */}
      <PermissionNote
        viewer={navigation}
        actions={[
          'transport.customer.read',
          'transport.partner.read',
          'transport.vehicle.read',
          'transport.driver.read',
        ]}
      />

      <form
        className="tx-filters"
        role="search"
        aria-label="Bộ lọc chuyến"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="tx-field">
          <span>Tìm chuyến</span>
          <input
            type="search"
            value={filter.search}
            placeholder="Mã chuyến, điểm đi, điểm đến"
            onChange={(event) => setFilter((prev) => ({ ...prev, search: event.target.value }))}
          />
        </label>
        <label className="tx-field">
          <span>Trạng thái</span>
          <select
            aria-label="Trạng thái"
            value={filter.status}
            onChange={(event) =>
              setFilter((prev) => ({ ...prev, status: event.target.value as TripStatus | 'ALL' }))
            }
          >
            <option value="ALL">Tất cả</option>
            {TRIP_STATUSES.map((status) => (
              <option key={status} value={status}>
                {TRIP_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="tx-field">
          <span>Loại chuyến</span>
          <select
            aria-label="Loại chuyến"
            value={filter.kind}
            onChange={(event) =>
              setFilter((prev) => ({ ...prev, kind: event.target.value as TripKind | 'ALL' }))
            }
          >
            <option value="ALL">Tất cả</option>
            {TRIP_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {TRIP_KIND_LABEL[kind]}
              </option>
            ))}
          </select>
        </label>
      </form>

      {trips.errorMessage === null ? null : (
        <ErrorState message={trips.errorMessage} onRetry={trips.refetch} />
      )}
      {trips.isLoading ? <LoadingState label="Đang đọc danh sách chuyến…" /> : null}

      {!trips.isLoading && trips.errorMessage === null && rows.length === 0 ? (
        <EmptyState
          title={
            all.length === 0
              ? 'Chưa có chuyến nào được lập.'
              : 'Không có chuyến nào khớp với bộ lọc đang chọn.'
          }
          nextAction={
            all.length === 0 ? null : (
              <button
                type="button"
                className="tx-btn"
                onClick={() => onFilterChange(EMPTY_TRIP_FILTER_QUERY)}
              >
                Bỏ bộ lọc
              </button>
            )
          }
        />
      ) : null}

      {rows.length === 0 ? null : (
        <DataTable<TripRow>
          caption="Danh sách chuyến xe"
          rows={rows}
          rowKey={(row) => row.code}
          selectedKey={selection}
          // Bam mot dong = "chi xem chuyen nay": ma chuyen di vao o tim kiem, bang co lai dung mot
          // dong, va khoi chi tiet nam NGAY DUOI no thay vi o cuoi mot danh sach 45 dong.
          onSelect={(row) => onSelect(row.code, tripFilterForSelection(filter, row.code))}
          columns={[
            { key: 'code', header: 'Mã chuyến', isRowHeader: true, render: (row) => row.code },
            { key: 'date', header: 'Ngày', render: (row) => row.businessDateLabel },
            { key: 'route', header: 'Tuyến', render: (row) => row.route },
            { key: 'customer', header: 'Khách hàng', render: (row) => row.customerLabel },
            { key: 'kind', header: 'Loại', render: (row) => row.kindLabel },
            {
              key: 'status',
              header: 'Trạng thái',
              render: (row) => <StatusBadge label={row.statusLabel} tone={row.tone} />,
            },
            {
              key: 'freight',
              header: 'Giá cước',
              isNumeric: true,
              render: (row) => row.freightLabel,
            },
          ]}
        />
      )}

      {selected === null ? null : (
        <TripDetailView
          key={selected.id}
          tripId={selected.id}
          tripCode={selected.code}
          onClose={() => onSelect(null, tripFilterAfterClose(filter, selected.code))}
          onChanged={invalidateTrips}
        />
      )}
    </>
  );
}

/**
 * Chi tiet mot chuyen. Tach ra khoi bang de moi lan doi lua chon la mot cay component moi (`key`),
 * nen trang thai hop thoai/o nhap khong bao gio dinh sang chuyen khac — #161 §7 doi hanh vi tieu
 * diem/lua chon TAT DINH sau moi thao tac.
 */
function TripDetailView({
  tripId,
  tripCode,
  onClose,
  onChanged,
}: {
  readonly tripId: string;
  /** Dung lam KHOA MO cho `useRevealOnOpen` — biet ngay tu luc bam, khong doi tai xong. */
  readonly tripCode: string;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  const reveal = useRevealOnOpen<HTMLElement>(tripCode);
  const navigation = useNavigationInput();
  const queryClient = useQueryClient();
  const trips = toSectionQuery(useTrips(navigation));
  const customers = toSectionQuery(useCustomers(navigation));
  const partners = toSectionQuery(usePartners(navigation));
  const vehicles = toSectionQuery(useVehicles(navigation));
  const drivers = toSectionQuery(useDrivers(navigation));
  const assignments = toSectionQuery(useTripAssignments(navigation, tripId));
  const cost = toSectionQuery(useTripCost(navigation, tripId));

  const [pending, setPending] = useState<TripActionOffer | null>(null);
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const trip = (trips.data ?? []).find((row) => row.id === tripId) ?? null;

  const directory = useMemo(
    () =>
      toDirectory({
        customers: customers.data ?? [],
        partners: partners.data ?? [],
        vehicles: vehicles.data ?? [],
        drivers: drivers.data ?? [],
      }),
    [customers.data, partners.data, vehicles.data, drivers.data],
  );

  const mutation = useMutation({
    mutationFn: async (offer: TripActionOffer) => {
      if (offer.id === 'cancel') return transportApi.trips.cancel(tripId, reason);
      if (offer.transitionTo === null) throw new Error('Thao tác không có đích chuyển trạng thái.');
      return transportApi.trips.transition(tripId, offer.transitionTo);
    },
    onSuccess: () => {
      setPending(null);
      setReason('');
      setFailure(null);
      onChanged();
      void queryClient.invalidateQueries({ queryKey: ['transport', 'trips', tripId] });
    },
    // HIEN NGUYEN VAN cau tu choi cua may chu. Ma loi nghiep vu bi bo o bien HTTP, nen cau nay la
    // thong tin chinh xac nhat man hinh co — dien dat lai la lam mat thong tin.
    onError: (error: Error) => setFailure(error.message),
  });

  if (trip === null) {
    return (
      <section className="tx-detail" aria-label="Chi tiết chuyến" ref={reveal}>
        {trips.isLoading ? (
          <LoadingState label="Đang đọc chuyến…" />
        ) : (
          <EmptyState title="Không tìm thấy chuyến này trong danh sách đang xem." />
        )}
      </section>
    );
  }

  const current = activeAssignment(assignments.data ?? []);
  const offers = tripActionOffers(trip, current, navigation);
  const primary = primaryOffer(offers);
  const timeline = toTripTimeline(trip, assignments.data ?? [], directory);
  const costModel = toTripCost(cost.data ?? null, navigation);
  const cancelNote = cancellationNote(trip);
  const row = toTripRows([trip], directory)[0];

  return (
    <section className="tx-detail" aria-label={`Chi tiết chuyến ${trip.code}`} ref={reveal}>
      <header className="tx-detail__head">
        <div>
          <h2>Chuyến {trip.code}</h2>
          <p>
            {trip.originLabel} → {trip.destinationLabel}
          </p>
        </div>
        <div className="tx-detail__actions">
          {offers.map((offer) => (
            <button
              key={offer.id}
              type="button"
              className={
                offer.isDestructive
                  ? 'tx-btn tx-btn--stop'
                  : offer.id === primary?.id
                    ? 'tx-btn tx-btn--go'
                    : 'tx-btn'
              }
              onClick={() => {
                setFailure(null);
                setReason('');
                setPending(offer);
              }}
              title={offer.blockedReason ?? undefined}
            >
              {offer.label}
            </button>
          ))}
          <button type="button" className="tx-btn tx-btn--ghost" onClick={onClose}>
            Đóng
          </button>
        </div>
      </header>

      {primary?.blockedReason == null ? null : (
        <p className="tx-detail__blocked" role="status">
          {primary.blockedReason}
        </p>
      )}
      {cancelNote === null ? null : (
        <p className="tx-detail__blocked" role="status">
          {cancelNote}
        </p>
      )}
      {failure === null ? null : <ErrorState message={failure} />}

      <div className="tx-detail__grid">
        <dl className="tx-detail__block">
          <h3>Thông tin chuyến</h3>
          <DetailRow label="Loại chuyến">{TRIP_KIND_LABEL[trip.kind]}</DetailRow>
          <DetailRow label="Ngày nghiệp vụ">{row?.businessDateLabel ?? '—'}</DetailRow>
          <DetailRow label="Trạng thái">
            <StatusBadge label={TRIP_STATUS_LABEL[trip.status]} tone={row?.tone ?? 'flat'} />
          </DetailRow>
          <DetailRow label="Hàng hoá">{trip.cargoDescription ?? '—'}</DetailRow>
          <DetailRow label="Giá cước">{formatMoney(trip.freightAmount)}</DetailRow>
          <DetailRow label="Chi phí trực tiếp">{costModel.directCostLabel}</DetailRow>
        </dl>

        <div className="tx-detail__block">
          <h3>Phân công</h3>
          {assignments.isLoading ? <LoadingState label="Đang đọc phân công…" /> : null}
          <TripAssignForm
            tripId={tripId}
            vehicles={vehicles.data ?? []}
            drivers={drivers.data ?? []}
            currentVehicleId={current?.vehicleId ?? null}
            currentDriverId={current?.driverId ?? null}
            viewer={navigation}
            onDone={() => {
              void queryClient.invalidateQueries({ queryKey: ['transport', 'trips'] });
              onChanged();
            }}
          />
          {assignments.data === undefined || assignments.data.length === 0 ? (
            <EmptyState title="Chuyến này chưa có phân công nào." />
          ) : (
            <ul className="tx-timeline">
              {toAssignmentRows(assignments.data, directory).map((entry) => (
                <li key={entry.id} data-active={entry.isActive ? '' : undefined}>
                  <strong>
                    {entry.vehicleLabel} · {entry.driverLabel}
                  </strong>
                  <span>
                    {entry.fromLabel} → {entry.toLabel}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="tx-detail__block">
          <h3>Dòng thời gian</h3>
          <ul className="tx-timeline">
            {timeline.map((entry) => (
              <li key={`${entry.at}-${entry.title}`}>
                <strong>{entry.title}</strong>
                <span>{entry.atLabel}</span>
                {entry.detail === null ? null : <span>{entry.detail}</span>}
              </li>
            ))}
          </ul>
        </div>

        <div className="tx-detail__block">
          <h3>Chi phí &amp; nhiên liệu</h3>
          {!canPerform(navigation, 'transport.costing.expense.read') ? (
            <PermissionGate viewer={navigation} action="transport.costing.expense.read" />
          ) : costModel.isEmpty ? (
            <EmptyState title="Chưa ghi khoản chi nào cho chuyến này." />
          ) : (
            <ul className="tx-timeline">
              {costModel.rows.map((entry) => (
                <li key={entry.id}>
                  <strong>
                    {expenseCategoryLabel(entry.categoryCode)} · {entry.amountLabel}
                  </strong>
                  <span>
                    {entry.fundedByLabel} · {entry.businessDateLabel}
                  </span>
                  {entry.isReversed ? <span>Đã bị đảo</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/*
         * PHIEU DO DAU — day du vong doi, khong phai mot con so dem.
         *
         * Truoc day cho nay chi in "N phieu do dau gan voi chuyen nay". Mot con so dem noi rang
         * co viec phai lam nhung khong cho ai lam viec do: ke toan van phai di duong khac de xac
         * thuc, tu choi hay cho nop lai. Nay danh sach that nam o day, kem anh chung tu.
         */}
        <div className="tx-detail__block tx-detail__block--wide">
          <h3>Phiếu đổ dầu</h3>
          <PermissionGate viewer={navigation} action="transport.fuel.entry.read">
            <TripFuelEntries tripId={tripId} onChanged={onChanged} />
          </PermissionGate>
        </div>
      </div>

      <ConfirmAction
        open={pending !== null}
        title={
          pending?.id === 'cancel'
            ? `Huỷ chuyến ${trip.code}?`
            : `${pending?.label ?? 'Xác nhận'} — ${trip.code}?`
        }
        detail={pending?.blockedReason ?? undefined}
        confirmLabel={pending?.label ?? 'Xác nhận'}
        reasonLabel={pending?.id === 'cancel' ? 'Lý do huỷ' : undefined}
        reason={reason}
        onReasonChange={setReason}
        isDestructive={pending?.isDestructive ?? false}
        isBusy={mutation.isPending}
        onConfirm={() => {
          if (pending !== null) mutation.mutate(pending);
        }}
        onCancel={() => {
          setPending(null);
          setReason('');
        }}
      />
    </section>
  );
}
