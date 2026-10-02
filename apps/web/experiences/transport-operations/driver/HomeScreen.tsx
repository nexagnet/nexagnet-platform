'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { MetricCard, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useDriverFieldWork,
  useDriverFund,
  useDriverTrips,
  useNavigationInput,
} from '../hooks/useTransportWorkspace';
import { visibleDriverScreens, type DriverScreenId } from '../navigation';
import { transportApi } from '../transport-api';
import {
  toDriverHome,
  type DriverHomeModel,
  type DriverHomeRunCard,
  type DriverTripAction,
  type DriverTripCard,
} from '../workspace/driver';
import type { FundBalanceModel } from '../workspace/driver-fund';

/**
 * TRANG CHU LAI XE — `#340`: tra loi "bay gio toi phai lam gi?" tu VIEC DUOC DIEU.
 *
 * ============================================================================================
 * TRUOC `#340`
 * ============================================================================================
 *
 * Trang nay chi doc `/transport/me/trips` (`TransportTrip`). Mot lai xe duoc dieu mot vong chay
 * THAT — man Hien truong thay no va bam duoc no — van doc o day "Chưa có chuyến nào được phân công
 * cho bạn", va khong co duong nao dan sang Hien truong.
 *
 * ============================================================================================
 * BAY GIO
 * ============================================================================================
 *
 * The chinh doc `/transport/me/field-work` — CUNG khoa, CUNG lan doc voi man Hien truong — va chang
 * dang lam duoc chon bang CHINH `toFieldScreen()`. Chuyen cu chi con la loi phu, khong mang nut doi
 * trang thai. Moi quyet dinh "hien gi" nam o `toDriverHome()` (co bai kiem), khong nam trong JSX.
 *
 * Trang chu KHONG bam mot viec hien truong nao: nut bam song o man Hien truong, cung khoa chong lap
 * va chuoi vi tri cua no (`FieldScreen.tsx`). Chep mot nut sang day la sinh ra duong ghi thu hai.
 */
export function DriverHome({
  onNavigate,
}: {
  readonly onNavigate: (screen: DriverScreenId) => void;
}) {
  const navigation = useNavigationInput();
  const runWork = toSectionQuery(useDriverFieldWork(navigation));
  const trips = toSectionQuery(useDriverTrips(navigation));
  const fund = toSectionQuery(useDriverFund(navigation));
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);

  // CHI co nut dung toi khi chuyen la nguon viec duy nhat (khach chua co Hien truong) — hop dong cu.
  const setStatus = useMutation({
    mutationFn: (input: { readonly id: string; readonly to: DriverTripAction['to'] }) =>
      transportApi.me.setTripStatus(input.id, input.to),
    onSuccess: () => {
      setFailure(null);
      void queryClient.invalidateQueries({ queryKey: ['transport', 'me'] });
    },
    onError: (error: Error) => setFailure(error.message),
  });

  const open = new Set(visibleDriverScreens(navigation).map((screen) => screen.id));
  const model = toDriverHome({
    runWork,
    trips,
    fund: fund.data ?? null,
    canOpenField: open.has('field'),
    canIntakeAtSite: open.has('site-intake'),
  });

  return (
    <>
      <h1 className="tx-driver__title">Trang chủ</h1>
      {failure === null ? null : <ErrorState message={failure} />}

      <section className="tx-driver__card" aria-label={model.heading} data-testid="home-primary">
        <h2>{model.heading}</h2>
        <HomePrimary
          model={model}
          onNavigate={onNavigate}
          onRetry={model.source === 'RUN' ? runWork.refetch : trips.refetch}
          tripPending={setStatus.isPending}
          onTripAction={(id, to) => setStatus.mutate({ id, to })}
        />
      </section>

      <SiteIntakeHint hint={model.siteIntakeHint} onOpen={() => onNavigate('site-intake')} />
      <LegacyTrip trip={model.legacyTrip} notice={model.legacyNotice} />
      <HomeFund fund={model.fund} openWorkCount={model.openWorkCount} />
    </>
  );
}

/**
 * NHAN VIEC TAI DIEM — mot quy trinh RIENG (`#267`), chi chao khi van phong CHUA dieu viec nao.
 * Viec da duoc dieu thi khong phai "nhan" lai o do (`#340` yeu cau 5 + 6).
 */
function SiteIntakeHint({
  hint,
  onOpen,
}: {
  readonly hint: string | null;
  readonly onOpen: () => void;
}) {
  if (hint === null) return null;
  return (
    <section
      className="tx-driver__card"
      aria-label="Nhận việc tại điểm"
      data-testid="home-site-intake"
    >
      <h2>Nhận việc tại điểm</h2>
      <p className="tx-driver__lead">{hint}</p>
      <button type="button" className="tx-btn tx-btn--wide" onClick={onOpen}>
        Mở Nhận việc
      </button>
    </section>
  );
}

/** So du quy + so chuyen dang mo — con so thu hai dem theo DUNG nguon dang quyet dinh "co viec". */
function HomeFund({
  fund,
  openWorkCount,
}: {
  readonly fund: FundBalanceModel | null;
  readonly openWorkCount: number | null;
}) {
  if (fund === null) return null;
  return (
    <section className="tx-cards" aria-label="Số dư quỹ">
      <MetricCard label="Số dư quỹ" value={fund.balanceLabel} hint={fund.stanceLabel} />
      {openWorkCount === null ? null : (
        <MetricCard label="Chuyến đang mở" value={String(openWorkCount)} />
      )}
    </section>
  );
}

function HomePrimary({
  model,
  onNavigate,
  onRetry,
  tripPending,
  onTripAction,
}: {
  readonly model: DriverHomeModel;
  readonly onNavigate: (screen: DriverScreenId) => void;
  readonly onRetry: () => void;
  readonly tripPending: boolean;
  readonly onTripAction: (id: string, to: DriverTripAction['to']) => void;
}) {
  const { primary } = model;
  switch (primary.kind) {
    case 'LOADING':
      return <LoadingState label={primary.label} />;
    case 'FAILED':
      return <ErrorState message={primary.message} onRetry={onRetry} />;
    case 'NO_WORK':
      return (
        <>
          <EmptyState title={primary.headline} />
          {primary.detail === null ? null : <p className="tx-note">{primary.detail}</p>}
        </>
      );
    case 'RUN_CURRENT':
      return (
        <RunWork
          headline={primary.headline}
          model={model}
          cta="Mở Hiện trường"
          isPrimary
          onOpen={() => onNavigate('field')}
        >
          <RunFacts card={primary.card} />
        </RunWork>
      );
    case 'RUN_IDLE':
      return (
        <RunWork
          headline={primary.headline}
          model={model}
          cta="Xem Hiện trường"
          isPrimary={false}
          onOpen={() => onNavigate('field')}
        >
          <dl className="tx-driver__facts">
            <dt>Mã chuyến</dt>
            <dd>{primary.runCodes.join(', ')}</dd>
          </dl>
        </RunWork>
      );
    case 'TRIP':
      return (
        <TripCurrent
          headline={primary.headline}
          card={primary.card}
          actions={primary.actions}
          pending={tripPending}
          onAction={onTripAction}
        />
      );
  }
}

/**
 * VIEC DUOC DIEU dang mo: cau tra loi, cac su that, MOT loi vao Hien truong, roi cac ghi chu.
 * Nut bam cua chinh viec do nam o man Hien truong, khong o day.
 */
function RunWork({
  headline,
  model,
  cta,
  isPrimary,
  onOpen,
  children,
}: {
  readonly headline: string;
  readonly model: DriverHomeModel;
  readonly cta: string;
  readonly isPrimary: boolean;
  readonly onOpen: () => void;
  readonly children: ReactNode;
}) {
  return (
    <>
      <p className="tx-driver__lead" data-testid="home-run-headline">
        {headline}
      </p>
      {children}
      <div className="tx-driver__actions">
        <button
          type="button"
          className={isPrimary ? 'tx-btn tx-btn--go tx-btn--wide' : 'tx-btn tx-btn--wide'}
          data-testid="home-open-field"
          onClick={onOpen}
        >
          {cta}
        </button>
      </div>
      <AssignedNotes model={model} />
    </>
  );
}

/** Ma vong chay, chang, tuyen, giai doan, don — `#340` yeu cau 2. Khong mot con so tien nao. */
function RunFacts({ card }: { readonly card: DriverHomeRunCard }) {
  return (
    <dl className="tx-driver__facts">
      <dt>Mã chuyến</dt>
      <dd data-testid="home-run-code">{card.runCode}</dd>
      <dt>Chặng</dt>
      <dd>{card.legTitle}</dd>
      <dt>Tuyến</dt>
      <dd data-testid="home-run-route">{card.route}</dd>
      <dt>Trạng thái</dt>
      <dd data-testid="home-run-phase">{card.phaseLabel}</dd>
      <dt>Đơn</dt>
      <dd>{card.orderCode ?? '—'}</dd>
    </dl>
  );
}

function AssignedNotes({ model }: { readonly model: DriverHomeModel }) {
  return model.assignedNote === null ? null : <p className="tx-note">{model.assignedNote}</p>;
}

/** Hop dong CU, nguyen van — chi con cho khach chua bat man Hien truong. */
function TripCurrent({
  headline,
  card,
  actions,
  pending,
  onAction,
}: {
  readonly headline: string;
  readonly card: DriverTripCard;
  readonly actions: readonly DriverTripAction[];
  readonly pending: boolean;
  readonly onAction: (id: string, to: DriverTripAction['to']) => void;
}) {
  return (
    <>
      <p className="tx-driver__lead">{headline}</p>
      <dl className="tx-driver__facts">
        <dt>Mã chuyến</dt>
        <dd>{card.code}</dd>
        <dt>Tuyến</dt>
        <dd>{card.route}</dd>
        <dt>Khách hàng</dt>
        <dd>{card.customerLabel}</dd>
        <dt>Xe</dt>
        <dd>{card.vehicleLabel}</dd>
        <dt>Hàng</dt>
        <dd>{card.cargoDescription ?? '—'}</dd>
      </dl>
      <div className="tx-driver__actions">
        {actions.map((action) => (
          <button
            key={action.to}
            type="button"
            className="tx-btn tx-btn--go tx-btn--wide"
            disabled={pending}
            onClick={() => onAction(card.id, action.to)}
          >
            {pending ? 'Đang gửi…' : action.label}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * LOI PHU: chuyen theo cach lam truoc day — `#340` yeu cau 4.
 *
 * Nam DUOI the viec duoc dieu va KHONG mang nut doi trang thai: mot nut `Đã giao` o day se bi doc
 * thanh "da giao xong viec van phong vua dieu". Doi trang thai van o man Chuyen, nhu truoc.
 */
function LegacyTrip({
  trip,
  notice,
}: {
  readonly trip: DriverTripCard | null;
  readonly notice: string | null;
}) {
  if (trip === null && notice === null) return null;
  return (
    <section
      className="tx-driver__card"
      aria-label="Chuyến theo cách làm trước đây"
      data-testid="home-legacy-trip"
    >
      <h2>Chuyến theo cách làm trước đây</h2>
      {notice === null ? null : <p className="tx-note tx-note--warn">{notice}</p>}
      {trip === null ? null : (
        <>
          <p className="tx-driver__lead">
            {trip.code} · {trip.route} <StatusBadge label={trip.statusLabel} tone={trip.tone} />
          </p>
          <p className="tx-note">Xem và cập nhật chuyến này ở màn Chuyến.</p>
        </>
      )}
    </section>
  );
}
