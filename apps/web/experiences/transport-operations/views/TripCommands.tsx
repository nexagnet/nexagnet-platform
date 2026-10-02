'use client';

import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ErrorState } from '../components/SectionState';
import { TRIP_KIND_LABEL } from '../customer-view';
import { canPerform } from '../transport-actions';
import { transportApi } from '../transport-api';
import {
  assignmentDraftIsNoOp,
  emptyAssignmentDraft,
  hydrateAssignmentDraft,
  releaseAssignmentDraft,
  toAssignSubmission,
  touchAssignmentDriver,
  touchAssignmentVehicle,
} from '../workspace/assignment-draft';
import {
  TRIP_KINDS,
  type Driver,
  type TransportCustomer,
  type TransportPartner,
  type TripKind,
  type Vehicle,
} from '../transport-types';

/**
 * BE MAT LENH cua man Chuyen xe — LAP chuyen va PHAN CONG xe/lai xe.
 *
 * Truoc ban nay, man Chuyen xe chi DOC duoc va doi duoc trang thai: khong co duong nao lap mot
 * chuyen moi tu trinh duyet. Tuc chuoi nghiep vu cua #196 §3 dut ngay o buoc dau tien, va nguoi
 * xem demo phai duoc gieo san du lieu thi moi co gi de bam.
 *
 * ==============================================================================================
 * BA DIEU O DAY LA HOP DONG CUA MAY CHU, KHONG PHAI LUA CHON THAM MY
 *
 *  · `code`, `kind`, `businessDate` KHONG sua duoc sau khi lap (`UpdateTripInput` bo ba truong
 *    do). Nen o hop thoai lap chuyen chung la truong phai nghi ky, khong phai thu de "sua sau".
 *  · `AssignTripInput` doi CA HAI khoa `vehicleId` va `driverId` co mat, va cho phep `null`.
 *    Thieu mot khoa la 400. Vi vay form luon gui du hai, va "chua chon" duoc gui thanh `null`
 *    chu khong phai bi bo di.
 *  · `freightAmount` chi ton tai o be mat VAN HANH. `INV-09` cam no o payload cua lai xe, khong
 *    cam o day — ke toan phai nhap duoc gia cuoc thi moi co bien truc tiep de doc.
 */
export function TripPlanForm({
  customers,
  partners,
  onDone,
  onCancel,
}: {
  readonly customers: readonly TransportCustomer[];
  readonly partners: readonly TransportPartner[];
  readonly onDone: (code: string) => void;
  readonly onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<TripKind>('OWN_DIRECT');
  const [originLabel, setOrigin] = useState('');
  const [destinationLabel, setDestination] = useState('');
  const [businessDate, setBusinessDate] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [carrierPartnerId, setCarrierPartnerId] = useState('');
  const [referrerPartnerId, setReferrerPartnerId] = useState('');
  const [freight, setFreight] = useState('');
  const [distanceKm, setDistance] = useState('');
  const [cargoDescription, setCargo] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const plan = useMutation({
    mutationFn: () =>
      transportApi.trips.plan({
        code: code.trim(),
        kind,
        originLabel: originLabel.trim(),
        destinationLabel: destinationLabel.trim(),
        ...(businessDate === '' ? {} : { businessDate }),
        customerId: customerId === '' ? null : customerId,
        carrierPartnerId: carrierPartnerId === '' ? null : carrierPartnerId,
        referrerPartnerId: referrerPartnerId === '' ? null : referrerPartnerId,
        freightAmount: freight.trim() === '' ? null : Number(freight),
        distanceKm: distanceKm.trim() === '' ? null : Number(distanceKm),
        cargoDescription: cargoDescription.trim() === '' ? null : cargoDescription.trim(),
      }),
    onSuccess: (trip) => {
      setFailure(null);
      onDone(trip.code);
    },
    onError: (error: Error) => setFailure(error.message),
  });

  const ready =
    code.trim().length > 0 && originLabel.trim().length > 0 && destinationLabel.trim().length > 0;

  return (
    <form
      className="tx-panel tx-panel--form"
      aria-label="Lập chuyến mới"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) plan.mutate();
      }}
    >
      <h3>Lập chuyến mới</h3>
      <p className="tx-panel__lead">Mã chuyến, loại chuyến và ngày không sửa được sau khi lập.</p>

      {failure === null ? null : <ErrorState message={failure} />}

      <div className="tx-detail__grid">
        <label className="tx-field">
          <span>Mã chuyến</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} required />
        </label>
        <label className="tx-field">
          <span>Loại chuyến</span>
          <select
            aria-label="Loại chuyến"
            value={kind}
            onChange={(e) => setKind(e.target.value as TripKind)}
          >
            {TRIP_KINDS.map((value) => (
              <option key={value} value={value}>
                {TRIP_KIND_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="tx-field">
          <span>Ngày chạy</span>
          <input
            type="date"
            value={businessDate}
            onChange={(e) => setBusinessDate(e.target.value)}
          />
        </label>
        <label className="tx-field">
          <span>Điểm đi</span>
          <input value={originLabel} onChange={(e) => setOrigin(e.target.value)} required />
        </label>
        <label className="tx-field">
          <span>Điểm đến</span>
          <input
            value={destinationLabel}
            onChange={(e) => setDestination(e.target.value)}
            required
          />
        </label>
        <label className="tx-field">
          <span>Khách hàng</span>
          <select
            aria-label="Khách hàng"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">Không chỉ định</option>
            {customers.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>

        {/*
         * Nha xe thau lai chi co nghia voi chuyen THUE NGOAI, va moi gioi chi co nghia voi chuyen
         * DOI TAC GIOI THIEU. Hien theo loai chuyen thay vi bay het: mot o nhap khong bao gio
         * dung cho loai dang chon la mot o nhap de nguoi ta dien nham.
         */}
        {kind === 'EXTERNAL_CARRIER' ? (
          <label className="tx-field">
            <span>Nhà xe thầu lại</span>
            <select
              aria-label="Nhà xe thầu lại"
              value={carrierPartnerId}
              onChange={(e) => setCarrierPartnerId(e.target.value)}
            >
              <option value="">Chưa chọn</option>
              {partners.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {kind === 'PARTNER_REFERRED_INTERNAL_RUN' ? (
          <label className="tx-field">
            <span>Đối tác giới thiệu</span>
            <select
              aria-label="Đối tác giới thiệu"
              value={referrerPartnerId}
              onChange={(e) => setReferrerPartnerId(e.target.value)}
            >
              <option value="">Chưa chọn</option>
              {partners.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="tx-field">
          <span>Giá cước (đồng)</span>
          <input
            type="number"
            min="0"
            step="1"
            value={freight}
            onChange={(e) => setFreight(e.target.value)}
          />
        </label>
        <label className="tx-field">
          <span>Quãng đường (km)</span>
          <input
            type="number"
            min="0"
            step="1"
            value={distanceKm}
            onChange={(e) => setDistance(e.target.value)}
          />
        </label>
        <label className="tx-field">
          <span>Hàng hoá</span>
          <input value={cargoDescription} onChange={(e) => setCargo(e.target.value)} />
        </label>
      </div>

      <div className="tx-detail__actions">
        <button type="submit" className="tx-btn tx-btn--go" disabled={!ready || plan.isPending}>
          {plan.isPending ? 'Đang lập…' : 'Lập chuyến'}
        </button>
        <button type="button" className="tx-btn tx-btn--ghost" onClick={onCancel}>
          Huỷ
        </button>
      </div>
    </form>
  );
}

/**
 * PHAN CONG XE VA LAI XE cho mot chuyen da lap.
 *
 * Gui CA HAI khoa moi lan, ke ca khi nguoi dung chi doi mot ben: `AssignTripInput` la `.strict()`
 * va doi du hai khoa. Bo mot khoa di vi "khong doi" se lam may chu tra 400 — mot loi trong nhu
 * loi nhap lieu nhung that ra la loi cua man hinh.
 */
export function TripAssignForm({
  tripId,
  vehicles,
  drivers,
  currentVehicleId,
  currentDriverId,
  viewer,
  onDone,
}: {
  readonly tripId: string;
  readonly vehicles: readonly Vehicle[];
  readonly drivers: readonly Driver[];
  readonly currentVehicleId: string | null;
  readonly currentDriverId: string | null;
  readonly viewer: Parameters<typeof canPerform>[0];
  readonly onDone: () => void;
}) {
  const [draft, setDraft] = useState(emptyAssignmentDraft);
  const [failure, setFailure] = useState<string | null>(null);

  const active = useMemo(
    () => ({ vehicleId: currentVehicleId, driverId: currentDriverId }),
    [currentVehicleId, currentDriverId],
  );

  /*
   * PHAN CONG DEN SAU LAN VE DAU TIEN, va do la ca goc cua #222 P1-A.
   *
   * `useTripAssignments` la mot query RIENG: lan ve dau tien cua form nay luon thay `null`. Khong
   * co lan dong bo nay thi hai o chon dung yen o "Chưa gán" ke ca khi dong thoi gian ngay ben canh
   * da hien `15C-556.33 · Nguyễn Văn Bình`.
   *
   * `hydrateAssignmentDraft` tra ve CHINH doi tuong cu khi khong co gi doi, nen `setDraft` khong
   * lam React ve lai — mot `useEffect` chay theo `active` vi vay khong thanh mot vong vo tan.
   */
  useEffect(() => {
    setDraft((current) => hydrateAssignmentDraft(current, active));
  }, [active]);

  const assign = useMutation({
    // KHONG doc thang `draft`: `toAssignSubmission` lay tu PHAN CONG DANG CO o moi truong nguoi
    // dung chua cham. Do la thu lam mot lan bam "khong doi gi" KHONG THE go phan cong cua chuyen.
    mutationFn: () => transportApi.trips.assign(tripId, toAssignSubmission(draft, active)),
    onSuccess: () => {
      setFailure(null);
      // Tha ban nhap ra: tu day o chon bam theo ket qua THAT cua may chu, chu khong giu lai lua
      // chon vua gui — hai thu do trung nhau luc thanh cong, va khac nhau khi may chu sua lai.
      setDraft(releaseAssignmentDraft);
      onDone();
    },
    onError: (error: Error) => setFailure(error.message),
  });

  if (!canPerform(viewer, 'transport.trip.assign')) return null;

  const isNoOp = assignmentDraftIsNoOp(draft, active);

  return (
    <form
      className="tx-inlineform"
      aria-label="Phân công xe và lái xe"
      onSubmit={(event) => {
        event.preventDefault();
        if (!isNoOp) assign.mutate();
      }}
    >
      {failure === null ? null : <ErrorState message={failure} />}
      <label className="tx-field tx-field--inline">
        <span>Xe</span>
        <select
          aria-label="Xe"
          value={draft.vehicleId}
          onChange={(e) => setDraft((current) => touchAssignmentVehicle(current, e.target.value))}
        >
          <option value="">Chưa gán xe</option>
          {vehicles.map((row) => (
            <option key={row.id} value={row.id}>
              {row.registrationPlate}
            </option>
          ))}
        </select>
      </label>
      <label className="tx-field tx-field--inline">
        <span>Lái xe</span>
        <select
          aria-label="Lái xe"
          value={draft.driverId}
          onChange={(e) => setDraft((current) => touchAssignmentDriver(current, e.target.value))}
        >
          <option value="">Chưa gán lái xe</option>
          {drivers.map((row) => (
            <option key={row.id} value={row.id}>
              {row.fullName}
            </option>
          ))}
        </select>
      </label>
      {/*
        TAT nut khi khong co gi doi, thay vi de no bam duoc roi am tham bo qua: mot nut bam duoc ma
        khong lam gi la mot nut lam nguoi ta bam lai lan hai.
      */}
      <button type="submit" className="tx-btn" disabled={assign.isPending || isNoOp}>
        {assign.isPending ? 'Đang phân công…' : 'Phân công'}
      </button>
      {isNoOp ? <span className="tx-note">Chưa đổi xe hoặc lái xe nào.</span> : null}
    </form>
  );
}
