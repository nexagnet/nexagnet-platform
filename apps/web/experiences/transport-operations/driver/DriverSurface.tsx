'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTenantRuntime } from '../../../lib/tenant-runtime-context';
import { MetricCard, StatusBadge } from '../components/primitives';
import { expenseCategoryLabel, FUEL_PAYMENT_METHOD_LABEL, formatMoney } from '../customer-view';
import { FUEL_PAYMENT_METHODS, type FuelPaymentMethod } from '../transport-types';
import {
  DEFAULT_DRIVER_PAYMENT_METHOD,
  DRIVER_PAYMENT_METHOD_HINT,
  driverFuelContextOptions,
  occurredAtProblem,
  toDateTimeLocalValue,
  toDriverFuelContext,
  toDriverFuelSubmission,
  type DriverFuelForm,
} from '../workspace/fuel-declaration';
import { useDriverFuelRuns } from '../hooks/useDriverFuelRuns';
import type { DriverFuelSlipView } from '../transport-types';
import { fuelContextLabel } from '../workspace/fuel';
import { ConfirmAction, EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useDriverExpenseCategories,
  useDriverFuelSlips,
  useDriverFund,
  useDriverPayslips,
  useDriverSettlement,
  useDriverTrips,
  useDriverFuelStations,
  useDriverFuelSuppliers,
  useNavigationInput,
} from '../hooks/useTransportWorkspace';
import type { DriverScreenId } from '../navigation';
import { evidenceUrls, newCorrelationKey, transportApi } from '../transport-api';
import { toFundBalance, toFundLedgerRows } from '../workspace/driver-fund';
import {
  currentDriverTrip,
  driverTripActions,
  EVIDENCE_UPLOAD_HINT,
  toDriverFuelSlipRows,
  toDriverTripCard,
} from '../workspace/driver';
import { toDriverPayslipRows } from '../workspace/payroll';
import { DriverFieldWork } from './FieldScreen';
import { DriverHome } from './HomeScreen';
import { DriverSiteIntake } from './SiteIntakeScreen';

/**
 * BE MAT LAI XE — `GD-23`, va moi payload di qua kieu khung nhin rieng khong co doanh thu (`INV-09`).
 *
 * Uu tien la 1–2 cham cho viec thuong lam (#161 §3): trang chu tra ve DUNG MOT viec dang lam, chu
 * khong tra ve mot danh sach de nguoi ta tu tim — va tu `#340` viec do doc tu VONG CHAY da duoc
 * dieu (`HomeScreen.tsx`), kem mot cham vao man Hien truong de lam no.
 *
 * MOI man hinh o day deu goi duoc mot duong that. Truoc T7D co HAI man chi doc duoc — nop phieu
 * dau (thieu `vehicleId`) va phieu luong (chua co route) — va ca hai da duoc #168 mo.
 */
export function DriverSurface({
  screen,
  onNavigate,
}: {
  readonly screen: DriverScreenId;
  /** Dieu huong TRONG ung dung — cung duong voi thanh tab duoi, de Back van la "ra khoi man nay". */
  readonly onNavigate: (screen: DriverScreenId) => void;
}) {
  switch (screen) {
    case 'home':
      return <DriverHome onNavigate={onNavigate} />;
    case 'site-intake':
      return <DriverSiteIntake />;
    case 'field':
      return <DriverFieldWork />;
    case 'trip':
      return <DriverTrip />;
    case 'fuel':
      return <DriverFuel />;
    case 'expense':
      return <DriverExpense />;
    case 'fund':
      return <DriverFund />;
    case 'history':
      return <DriverHistory />;
    case 'payslip':
      return <DriverPayslip />;
  }
}

function DriverTrip() {
  const navigation = useNavigationInput();
  const trips = toSectionQuery(useDriverTrips(navigation));
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);

  const setStatus = useMutation({
    mutationFn: (input: { readonly id: string; readonly to: 'IN_TRANSIT' | 'DELIVERED' }) =>
      transportApi.me.setTripStatus(input.id, input.to),
    onSuccess: () => {
      setFailure(null);
      void queryClient.invalidateQueries({ queryKey: ['transport', 'me'] });
    },
    onError: (error: Error) => setFailure(error.message),
  });

  if (trips.isLoading) return <LoadingState label="Đang đọc chuyến…" />;
  if (trips.errorMessage !== null) {
    return <ErrorState message={trips.errorMessage} onRetry={trips.refetch} />;
  }

  const trip = currentDriverTrip(trips.data ?? []);
  if (trip === null) {
    return (
      <>
        <h1 className="tx-driver__title">Chuyến</h1>
        <EmptyState title="Bạn không có chuyến nào đang mở." />
      </>
    );
  }

  const card = toDriverTripCard(trip);
  const actions = driverTripActions(trip);

  return (
    <>
      <h1 className="tx-driver__title">Chuyến {card.code}</h1>
      {failure === null ? null : <ErrorState message={failure} />}
      <section className="tx-driver__card" aria-label={`Chuyến ${card.code}`}>
        <p className="tx-driver__route">{card.route}</p>
        <StatusBadge label={card.statusLabel} tone={card.tone} />
        <dl className="tx-driver__facts">
          <dt>Ngày</dt>
          <dd>{card.businessDateLabel}</dd>
          <dt>Loại chuyến</dt>
          <dd>{card.kindLabel}</dd>
          <dt>Khách hàng</dt>
          <dd>{card.customerLabel}</dd>
          <dt>Xe</dt>
          <dd>{card.vehicleLabel}</dd>
          <dt>Quãng đường</dt>
          <dd>{card.distanceLabel}</dd>
        </dl>
        <div className="tx-driver__actions">
          {actions.length === 0 ? (
            <p className="tx-note">Chuyến này hiện không có thao tác nào bạn được làm.</p>
          ) : (
            actions.map((action) => (
              <button
                key={action.to}
                type="button"
                className="tx-btn tx-btn--go tx-btn--wide"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: trip.id, to: action.to })}
              >
                {action.label}
              </button>
            ))
          )}
        </div>
      </section>
    </>
  );
}

/**
 * NHIEN LIEU — nay NOP duoc tu dien thoai.
 *
 * Truoc T7B man nay chi doc duoc: `POST /transport/me/fuel/slips` doi `vehicleId`, va khung nhin
 * cua lai xe chi mang BIEN SO. `#168 B2` them `vehicleId` vao `DriverTripView`, nen ma xe nay den
 * tu CHINH phan cong cua nguoi dang dang nhap — khong tu mot o nhap, khong tu mot danh sach doi xe.
 *
 * Chuyen chua duoc phan cong xe thi bieu mau KHONG hien. Bay mot o nhap roi de nguoi ta go het so
 * lit, so tien, so km — roi bam gui va nhan 400 — la te hon nhieu so voi noi truoc.
 */
/** Form trong — thoi diem do mac dinh la LUC MO FORM, va lai xe sua duoc (`#313`). */
const emptyDriverFuelForm = (): DriverFuelForm => ({
  supplierId: '',
  stationId: '',
  liters: '',
  amount: '',
  odometerKm: '',
  invoiceNo: '',
  occurredAtLocal: toDateTimeLocalValue(new Date()),
  paymentMethod: DEFAULT_DRIVER_PAYMENT_METHOD,
});

/**
 * DONG "XE + NGU CANH" cua mot phieu — `#364`: uu tien bien so; vong xe/chang khi khai tren viec
 * duoc dieu; ma chuyen chi con la thong tin tuong thich cua phieu cu.
 */
function slipContextLine(slips: readonly DriverFuelSlipView[], id: string) {
  const slip = slips.find((candidate) => candidate.id === id);
  if (slip === undefined) return null;
  const context = fuelContextLabel(slip);
  const label = slip.tripCode === null ? context : `Chuyến cũ ${context}`;
  return (
    <span>
      Xe {slip.vehiclePlate ?? '—'} · {label}
    </span>
  );
}

function DriverFuel() {
  const navigation = useNavigationInput();
  const queryClient = useQueryClient();
  const trips = toSectionQuery(useDriverTrips(navigation));
  const slips = toSectionQuery(useDriverFuelSlips(navigation));
  /*
   * Duong doc CUA CHINH MINH, khong phai duong van hanh.
   *
   * `useFuelSuppliers` gac bang `transport.fuel.entry.read` — mot quyen VAN HANH. Voi vai lai xe
   * no khong bao gio chay, nen o chon cay xang o duoi LUON RONG; va vi o do `required`, lai xe
   * khong bao gio nop duoc mot phieu nao. Do la mot ngo cut im lang, khong phai mot thong bao loi.
   */
  const suppliers = toSectionQuery(useDriverFuelSuppliers(navigation));

  const tenant = useTenantRuntime();
  const [failure, setFailure] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  /*
   * `occurredAtLocal` NAM TRONG FORM, dat mot lan khi form mo (`#313`). Than yeu cau la ham thuan
   * cua form + khoa, nen bam lai sau mot lan mat mang gui DUNG than cu va may chu phat lai phieu
   * da ghi — thay vi `409 FUEL_CORRELATION_KEY_REUSED` nhu khi thoi diem sinh luc bam.
   */
  const [form, setForm] = useState<DriverFuelForm>(emptyDriverFuelForm);
  // `#317` G1 — tram CUA cay xang dang chon; doi cay xang thi o tram ve trong (xem `onChange` ben duoi).
  const stations = toSectionQuery(useDriverFuelStations(navigation, form.supplierId));
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [correlationKey, setCorrelationKey] = useState(() => newCorrelationKey());
  const [pendingRemoval, setPendingRemoval] = useState<{
    readonly slipId: string;
    readonly evidenceId: string;
  } | null>(null);
  /*
   * `#364` — NGU CANH cua phieu: viec DUOC DIEU (vong xe) di truoc, chuyen v1 chi la loi phu. May chu
   * tu tim vong xe dang mo cua chinh lai xe (`GET /transport/me/fuel/runs`) va kiem lai moi thu luc
   * nop — o chon o day chi DE XUAT.
   */
  const fuelRuns = toSectionQuery(useDriverFuelRuns(navigation));
  const [contextKey, setContextKey] = useState<string | null>(null);
  const [legId, setLegId] = useState('');

  const trip = currentDriverTrip(trips.data ?? []);
  const contextOptions = driverFuelContextOptions({
    runs: fuelRuns.data ?? [],
    legacyTrip:
      trip === null
        ? null
        : {
            id: trip.id,
            code: trip.code,
            vehicleId: trip.vehicleId,
            vehiclePlate: trip.vehicleRegistrationPlate,
          },
  });
  const contextOption =
    contextOptions.find((option) => option.key === contextKey) ?? contextOptions[0] ?? null;
  const fuelContext =
    contextOption === null
      ? null
      : toDriverFuelContext(
          contextOption,
          contextOption.legs.some((leg) => leg.legId === legId) ? legId : null,
        );
  const rows = toDriverFuelSlipRows(slips.data ?? []);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['transport', 'me'] });
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (fuelContext === null) {
        throw new Error('Chưa có việc được điều nào để ghi phiếu — báo điều hành.');
      }
      const problem = occurredAtProblem(form.occurredAtLocal, new Date());
      if (problem !== null) throw new Error(problem);
      const slip = await transportApi.me.submitFuelSlip(
        // MOT khoa cho MOT lan bam, giu qua cac lan thu lai — va CUNG form -> CUNG than yeu cau.
        toDriverFuelSubmission({
          form,
          context: fuelContext,
          correlationKey,
          timeZone: tenant.transport?.timeZone,
        }),
      );
      if (photo === null) return { photoError: null, hasPhoto: false };
      // Phieu DA GHI roi moi dinh anh. Anh hong KHONG duoc lam mat phieu, va cung khong duoc lam lai
      // xe bam gui lai (se ra mot phieu khac): noi that, roi de duong dinh lai o danh sach duoi.
      try {
        await transportApi.me.uploadFuelEvidence(slip.id, photo);
        return { photoError: null, hasPhoto: true };
      } catch (error) {
        return {
          photoError: error instanceof Error ? error.message : 'Không đính được ảnh.',
          hasPhoto: true,
        };
      }
    },
    onSuccess: ({ photoError, hasPhoto }) => {
      setFailure(
        photoError === null
          ? null
          : `Phiếu đã gửi nhưng chưa đính được ảnh: ${photoError} Hãy đính lại ở phiếu bên dưới.`,
      );
      setSuccess(
        hasPhoto && photoError === null
          ? 'Đã gửi phiếu đổ dầu kèm ảnh. Kế toán sẽ xác thực khi đối soát.'
          : 'Đã gửi phiếu đổ dầu. Kế toán sẽ xác thực khi đối soát.',
      );
      setForm(emptyDriverFuelForm());
      setPhoto(null);
      setPhotoInputKey((key) => key + 1);
      setCorrelationKey(newCorrelationKey());
      invalidate();
    },
    onError: (error: Error) => {
      setSuccess(null);
      setFailure(error.message);
    },
  });

  const upload = useMutation({
    mutationFn: (input: { readonly slipId: string; readonly file: File }) =>
      transportApi.me.uploadFuelEvidence(input.slipId, input.file),
    onSuccess: () => {
      setFailure(null);
      setSuccess('Đã đính ảnh vào phiếu.');
      invalidate();
    },
    onError: (error: Error) => {
      setSuccess(null);
      setFailure(error.message);
    },
  });

  /**
   * GO MOT CHUNG TU TAI NHAM — #222 P1-C.
   *
   * Chu so huu KHONG muon them mot buoc xac nhan TRUOC khi tai len (chon tep -> tai ngay van giu
   * nguyen). Cai thieu la duong lui SAU mot lan tai nham, va no o day.
   *
   * May chu tra ve phieu DA CAP NHAT, nen man hinh khong doan trang thai moi; `invalidate()` van
   * duoc goi de moi khung nhin khac cua cung phieu do lam moi theo.
   */
  const removeEvidence = useMutation({
    mutationFn: (input: { readonly slipId: string; readonly evidenceId: string }) =>
      transportApi.me.removeFuelEvidence(input.slipId, input.evidenceId),
    onSuccess: () => {
      setFailure(null);
      setSuccess('Đã gỡ chứng từ khỏi phiếu.');
      setPendingRemoval(null);
      invalidate();
    },
    onError: (error: Error) => {
      setSuccess(null);
      setFailure(error.message);
    },
  });

  const resubmit = useMutation({
    mutationFn: (slipId: string) => transportApi.me.resubmitFuelSlip(slipId),
    onSuccess: () => {
      setFailure(null);
      setSuccess('Đã nộp lại phiếu.');
      invalidate();
    },
    onError: (error: Error) => {
      setSuccess(null);
      setFailure(error.message);
    },
  });

  const canSubmit =
    fuelContext !== null &&
    form.supplierId !== '' &&
    form.liters.trim() !== '' &&
    form.amount.trim() !== '' &&
    form.odometerKm.trim() !== '' &&
    form.occurredAtLocal !== '';

  return (
    <>
      <h1 className="tx-driver__title">Nhiên liệu</h1>
      {failure === null ? null : <ErrorState message={failure} />}
      {success === null ? null : (
        <p className="tx-note tx-note--ok" role="status">
          {success}
        </p>
      )}

      <section className="tx-driver__card" aria-label="Ghi phiếu đổ nhiên liệu">
        <h2>Ghi phiếu đổ nhiên liệu</h2>
        {/*
         * `#364` — doc viec duoc dieu hong/dang doc thi NOI RA, khong bao gio doc thanh "khong co viec".
         * Doi CA hai nguon (vong xe + chuyen cu) roi moi dung form: dung som thi o chon se tu doi tu
         * "chuyen cu" sang "vong xe" duoi tay lai xe khi danh sach vong xe ve toi.
         */}
        {fuelRuns.isLoading || trips.isLoading ? (
          <LoadingState label="Đang đọc việc được điều cho bạn…" />
        ) : fuelRuns.errorMessage !== null && contextOptions.length === 0 ? (
          <ErrorState message={fuelRuns.errorMessage} onRetry={fuelRuns.refetch} />
        ) : contextOption === null ? (
          trip !== null && trip.vehicleId === null ? (
            <p className="tx-note tx-note--warn">
              Chuyến {trip.code} chưa được phân công xe. Hãy báo điều hành phân xe trước khi ghi
              phiếu.
            </p>
          ) : (
            <EmptyState title="Bạn chưa có việc được điều nào đang mở, nên chưa ghi phiếu được. Cần đổ nhiên liệu thì báo điều hành." />
          )
        ) : (
          <form
            className="tx-driver__form"
            onSubmit={(event) => {
              event.preventDefault();
              submit.mutate();
            }}
          >
            {fuelRuns.errorMessage === null ? null : (
              // Con chuyen cu de chon, nhung danh sach viec duoc dieu KHONG doc duoc — noi ra.
              <p className="tx-note tx-note--warn">
                Chưa đọc được việc được điều ({fuelRuns.errorMessage}) — danh sách dưới đây có thể
                thiếu vòng xe của bạn.
              </p>
            )}
            {contextOptions.length > 1 ? (
              <label className="tx-field">
                <span>Việc được điều</span>
                <select
                  aria-label="Việc được điều"
                  value={contextOption.key}
                  onChange={(event) => {
                    setContextKey(event.target.value);
                    setLegId('');
                  }}
                >
                  {contextOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label} · xe {option.vehicleLabel}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="tx-note">
                {contextOption.label} · xe {contextOption.vehicleLabel}
              </p>
            )}
            {contextOption.legs.length === 0 ? null : (
              <label className="tx-field">
                <span>Chặng (không bắt buộc)</span>
                <select
                  aria-label="Chặng"
                  value={legId}
                  onChange={(event) => setLegId(event.target.value)}
                >
                  <option value="">Không gắn chặng</option>
                  {contextOption.legs.map((leg) => (
                    <option key={leg.legId} value={leg.legId}>
                      {leg.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="tx-field">
              <span>Cây xăng</span>
              <select
                aria-label="Cây xăng"
                value={form.supplierId}
                onChange={(event) =>
                  // Tram thuoc MOT nha cung cap: doi cay xang thi bo tram cu, khong gui mot cap lech.
                  setForm((prev) => ({ ...prev, supplierId: event.target.value, stationId: '' }))
                }
                required
              >
                <option value="">Chọn cây xăng</option>
                {(suppliers.data ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            {form.supplierId === '' ? null : (
              <label className="tx-field">
                <span>Trạm đổ</span>
                <select
                  aria-label="Trạm đổ"
                  value={form.stationId}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, stationId: event.target.value }))
                  }
                >
                  <option value="">
                    {(stations.data ?? []).length === 0
                      ? 'Cây xăng này chưa có danh mục trạm'
                      : 'Chọn trạm đổ'}
                  </option>
                  {(stations.data ?? []).map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.address === null
                        ? station.name
                        : `${station.name} — ${station.address}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="tx-field">
              <span>Số lít</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.001"
                min="0"
                value={form.liters}
                onChange={(event) => setForm((prev) => ({ ...prev, liters: event.target.value }))}
                required
              />
            </label>
            <label className="tx-field">
              <span>Số tiền (đồng)</span>
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min="0"
                value={form.amount}
                onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                required
              />
            </label>
            <label className="tx-field">
              <span>Số km trên đồng hồ</span>
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min="0"
                value={form.odometerKm}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, odometerKm: event.target.value }))
                }
                required
              />
            </label>
            <label className="tx-field">
              <span>Số hoá đơn (nếu có)</span>
              <input
                type="text"
                value={form.invoiceNo}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, invoiceNo: event.target.value }))
                }
              />
            </label>
            <label className="tx-field">
              <span>Thời điểm đổ</span>
              <input
                type="datetime-local"
                value={form.occurredAtLocal}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, occurredAtLocal: event.target.value }))
                }
                required
              />
            </label>
            <label className="tx-field">
              <span>Thanh toán</span>
              <select
                aria-label="Thanh toán"
                value={form.paymentMethod}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    paymentMethod: event.target.value as FuelPaymentMethod,
                  }))
                }
              >
                {/* `#369` R-4 — ca chuyen cu lan vong xe deu nhan hai cach tra; khong khoa theo ngu canh. */}
                {FUEL_PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {FUEL_PAYMENT_METHOD_LABEL[method]}
                  </option>
                ))}
              </select>
              <span className="tx-note" role="note">
                {DRIVER_PAYMENT_METHOD_HINT[form.paymentMethod]}
              </span>
            </label>
            <label className="tx-field tx-field--file">
              <span>Ảnh phiếu (nếu có)</span>
              <input
                key={photoInputKey}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
              />
            </label>
            {photo === null ? null : <span className="tx-note">{EVIDENCE_UPLOAD_HINT}</span>}
            <button
              type="submit"
              className="tx-btn tx-btn--go tx-btn--wide"
              disabled={!canSubmit || submit.isPending}
            >
              {submit.isPending ? 'Đang gửi…' : 'Gửi phiếu'}
            </button>
          </form>
        )}
      </section>

      {slips.errorMessage === null ? null : (
        <ErrorState message={slips.errorMessage} onRetry={slips.refetch} />
      )}
      {slips.isLoading ? <LoadingState label="Đang đọc phiếu đổ dầu…" /> : null}

      <section aria-label="Phiếu đổ dầu của bạn">
        <h2>Phiếu đã gửi</h2>
        {rows.length === 0 && !slips.isLoading ? (
          <EmptyState title="Bạn chưa có phiếu đổ dầu nào." />
        ) : (
          <ul className="tx-driver__list">
            {rows.map((row) => (
              <li key={row.id}>
                <div>
                  <strong>
                    {row.litersLabel} · {row.amountLabel}
                  </strong>
                  <span>
                    {row.businessDateLabel} · {row.odometerLabel}
                  </span>
                  <span>
                    {row.occurredAtLabel} · {row.paymentLabel}
                    {row.invoiceNo === null ? null : ` · Hoá đơn ${row.invoiceNo}`}
                  </span>
                  {/* `#364` — XE + ngu canh (vong xe/chang, hoac chuyen cu), khong bat buoc chuyen. */}
                  {slipContextLine(slips.data ?? [], row.id)}
                  {row.stationLabel === null ? null : <span>Trạm: {row.stationLabel}</span>}
                  <span>{row.evidenceCountLabel} ảnh</span>
                  {row.reviewReasonLabels.length === 0 ? null : (
                    <span className="tx-note">
                      Kế toán sẽ soát: {row.reviewReasonLabels.join('; ')}.
                    </span>
                  )}
                  {row.rejectedNote === null ? null : (
                    <span className="tx-note tx-note--warn">{row.rejectedNote}</span>
                  )}
                  {/*
                    ANH doc qua route CO XAC THUC, khong qua URL ky: kho anh la bucket PRIVATE chua
                    PII, va mot URL ky con song sau khi phien het han.
                  */}
                  {/*
                    MOI CHUNG TU CO DUONG XEM VA (khi con go duoc) DUONG GO — #222 P1-C.

                    Nut `Gỡ chứng từ` di kem mot hop xac nhan PHA HUY: nguoi dung dang dao nguoc
                    mot tep DA DINH VAO CHUNG TU TAI CHINH, khong phai dong mot hop thoai. Khi
                    khong con go duoc, nut BIEN MAT va mot cau noi ro VI SAO thay cho no — mot nut
                    bi tat khong loi giai la mot nut nguoi ta bam lai lan hai.
                  */}
                  {row.evidence.length === 0 ? null : (
                    <span className="tx-driver__thumbs">
                      {row.evidence.map((evidence) => (
                        <span key={evidence.id} className="tx-driver__thumb">
                          {evidence.contentType === 'application/pdf' ? (
                            <a
                              href={evidenceUrls.driverFuelSlip(row.id, evidence.id)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Xem chứng từ PDF
                            </a>
                          ) : (
                            <a
                              href={evidenceUrls.driverFuelSlip(row.id, evidence.id)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <img
                                src={evidenceUrls.driverFuelSlip(row.id, evidence.id)}
                                alt={`Ảnh chứng từ của phiếu ngày ${row.businessDateLabel}`}
                                loading="lazy"
                              />
                            </a>
                          )}
                          {row.canRemoveEvidence ? (
                            <button
                              type="button"
                              className="tx-btn tx-btn--stop tx-btn--small"
                              disabled={removeEvidence.isPending}
                              onClick={() =>
                                setPendingRemoval({ slipId: row.id, evidenceId: evidence.id })
                              }
                            >
                              Gỡ chứng từ
                            </button>
                          ) : null}
                        </span>
                      ))}
                    </span>
                  )}
                  {row.evidence.length > 0 && row.evidenceLockedReason !== null ? (
                    <span className="tx-note">{row.evidenceLockedReason}</span>
                  ) : null}
                  {/*
                    O TAI ANH THEO DUNG LUAT CUA MAY CHU, va do la mot cong KHAC voi cong `Gỡ`.

                    May chu chan dinh them CHI khi ky doi soat da chot; con da xac thuc thi VAN
                    dinh them duoc (`fuel.service.attachEvidence`) — them mot tam anh khong doi mot
                    con so nao, va ke toan tim duoc phieu goc sau khi duyet van phai gan duoc no.

                    Truoc ban nay o nay bay ra VO DIEU KIEN, ke ca voi phieu nam trong ky DA CHOT —
                    lai xe chon tep xong chi de nhan mot loi tu may chu. Nut `Gỡ chứng từ` ngay tren
                    da theo dung luat "khong bay mot nut chac chan bi tu choi"; o nay thi chua.
                  */}
                  {row.canAttachEvidence ? (
                    <>
                      <label className="tx-field tx-field--file">
                        <span>Đính ảnh chứng từ</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          disabled={upload.isPending}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) upload.mutate({ slipId: row.id, file });
                            event.target.value = '';
                          }}
                        />
                      </label>
                      <span className="tx-note">{EVIDENCE_UPLOAD_HINT}</span>
                    </>
                  ) : (
                    <span className="tx-note">{row.evidenceAttachLockedReason}</span>
                  )}
                </div>
                <div className="tx-driver__badges">
                  <StatusBadge label={row.verificationLabel} tone={row.tone} />
                  {row.canResubmit ? (
                    <button
                      type="button"
                      className="tx-btn"
                      disabled={resubmit.isPending}
                      onClick={() => resubmit.mutate(row.id)}
                    >
                      {resubmit.isPending ? 'Đang gửi…' : 'Nộp lại phiếu'}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/*
        XAC NHAN PHA HUY — #222 P1-C doi dung dieu nay: *"`Gỡ chứng từ` must require a destructive
        confirmation because the user is reversing an already-uploaded business attachment."*

        Cau `detail` noi ro HAI dieu ma nguoi dung can biet truoc khi bam: tep se bien mat that, va
        dau vet cua lan go van o lai. Giau ve thu hai se lam nguoi ta ngai bam mot thao tac hop le.
      */}
      <ConfirmAction
        open={pendingRemoval !== null}
        title="Gỡ chứng từ khỏi phiếu này?"
        detail="Tệp sẽ bị xoá khỏi kho ảnh và không xem lại được. Hệ thống vẫn ghi lại việc bạn đã gỡ nó."
        confirmLabel="Gỡ chứng từ"
        isDestructive
        isBusy={removeEvidence.isPending}
        onConfirm={() => {
          if (pendingRemoval !== null) removeEvidence.mutate(pendingRemoval);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </>
  );
}

/**
 * KHOAN CHI THUONG cua chinh lai xe — `#168 B3` + `#169` acceptance 4.
 *
 * Danh muc nhom chi phi den tu may chu (`#168 B4`): truoc do nguoi dung phai GO THU mot ma roi doi
 * 400 de biet minh go sai. `unrestricted` la mot truong tuong minh — `[]` nghia la khach cho nhap
 * tu do, KHONG phai "khong nhom nao hop le".
 *
 * Anh la TUY CHON, va khi co thi no di CUNG mot lan goi voi khoan chi: `evidenceLocator` la mot COT
 * duoc dat luc `INSERT`, va so cai append-only khong cho sua mot hang da ghi de gan anh sau.
 */
function DriverExpense() {
  const navigation = useNavigationInput();
  const queryClient = useQueryClient();
  const trips = toSectionQuery(useDriverTrips(navigation));
  const catalogue = toSectionQuery(useDriverExpenseCategories(navigation));

  const [failure, setFailure] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tripId, setTripId] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [correlationKey, setCorrelationKey] = useState(() => newCorrelationKey());

  const openTrips = (trips.data ?? []).filter(
    (trip) => trip.status === 'PLANNED' || trip.status === 'IN_TRANSIT',
  );
  const categories = catalogue.data?.categories ?? [];
  const unrestricted = catalogue.data?.unrestricted ?? false;

  const record = useMutation({
    mutationFn: () => {
      const input = {
        tripId,
        categoryCode: categoryCode.trim(),
        amount: Number(amount),
        note: note.trim() === '' ? null : note.trim(),
        correlationKey,
      };
      return file === null
        ? transportApi.me.recordExpense(input)
        : transportApi.me.recordExpenseWithEvidence(input, file);
    },
    onSuccess: () => {
      setFailure(null);
      setSuccess('Đã ghi khoản chi vào quỹ của bạn.');
      setTripId('');
      setCategoryCode('');
      setAmount('');
      setNote('');
      setFile(null);
      setCorrelationKey(newCorrelationKey());
      void queryClient.invalidateQueries({ queryKey: ['transport', 'me'] });
    },
    onError: (error: Error) => {
      setSuccess(null);
      setFailure(error.message);
    },
  });

  const canRecord = tripId !== '' && categoryCode.trim() !== '' && amount.trim() !== '';

  return (
    <>
      <h1 className="tx-driver__title">Ghi khoản chi</h1>
      {failure === null ? null : <ErrorState message={failure} />}
      {success === null ? null : (
        <p className="tx-note tx-note--ok" role="status">
          {success}
        </p>
      )}

      <section className="tx-driver__card" aria-label="Ghi một khoản chi">
        <p className="tx-driver__lead">
          Khoản chi này trừ vào quỹ tạm ứng của chính bạn, trên chuyến bạn được phân công.
        </p>
        {openTrips.length === 0 ? (
          <EmptyState title="Bạn chưa có chuyến nào đang mở để ghi khoản chi." />
        ) : (
          <form
            className="tx-driver__form"
            onSubmit={(event) => {
              event.preventDefault();
              record.mutate();
            }}
          >
            <label className="tx-field">
              <span>Chuyến</span>
              <select
                aria-label="Chuyến"
                value={tripId}
                onChange={(event) => setTripId(event.target.value)}
                required
              >
                <option value="">Chọn chuyến</option>
                {openTrips.map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {trip.code} · {trip.originLabel} → {trip.destinationLabel}
                  </option>
                ))}
              </select>
            </label>

            {/*
              Danh muc DONG thi cho chon; danh muc de trong (`unrestricted`) thi cho go tu do. Hai
              truong hop nay doi nguoc nhau ve nghia, nen khong duoc gop thanh mot o nhap.
            */}
            <label className="tx-field">
              <span>Nhóm chi phí</span>
              {unrestricted || categories.length === 0 ? (
                <input
                  type="text"
                  value={categoryCode}
                  onChange={(event) => setCategoryCode(event.target.value)}
                  placeholder="Ví dụ: BOT, bãi xe, sửa dọc đường"
                  required
                />
              ) : (
                <select
                  aria-label="Nhóm chi phí"
                  value={categoryCode}
                  onChange={(event) => setCategoryCode(event.target.value)}
                  required
                >
                  <option value="">Chọn nhóm chi phí</option>
                  {categories.map((code) => (
                    <option key={code} value={code}>
                      {expenseCategoryLabel(code)}
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label className="tx-field">
              <span>Số tiền (đồng)</span>
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </label>

            <label className="tx-field">
              <span>Ghi chú</span>
              <input type="text" value={note} onChange={(event) => setNote(event.target.value)} />
            </label>

            <label className="tx-field tx-field--file">
              <span>Ảnh chứng từ (nếu có)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>

            <button
              type="submit"
              className="tx-btn tx-btn--go tx-btn--wide"
              disabled={!canRecord || record.isPending}
            >
              {record.isPending ? 'Đang gửi…' : 'Ghi khoản chi'}
            </button>
          </form>
        )}
      </section>
    </>
  );
}

function DriverFund() {
  const navigation = useNavigationInput();
  const fund = toSectionQuery(useDriverFund(navigation));

  if (fund.isLoading) return <LoadingState label="Đang đọc quỹ của bạn…" />;
  if (fund.errorMessage !== null) {
    return <ErrorState message={fund.errorMessage} onRetry={fund.refetch} />;
  }
  if (fund.data === undefined) return <EmptyState title="Chưa đọc được sổ quỹ." />;

  const balance = toFundBalance(fund.data);
  // Lai xe KHONG dao duoc but toan: `SALE` khong co `transport.costing.reversal.post`, nen
  // `canReverse` cua moi dong se la `false` va khong nut nao hien ra.
  const rows = toFundLedgerRows(fund.data.entries, navigation);

  return (
    <>
      <h1 className="tx-driver__title">Quỹ của bạn</h1>
      <section className="tx-cards" aria-label="Số dư quỹ">
        <MetricCard label="Số dư" value={balance.balanceLabel} hint={balance.stanceLabel} />
      </section>
      <p className="tx-note" role="status">
        {balance.sentence}
      </p>
      <section aria-label="Bút toán quỹ">
        {rows.length === 0 ? (
          <EmptyState title="Bạn chưa có phát sinh quỹ nào." />
        ) : (
          <ul className="tx-driver__list">
            {rows.map((row) => (
              <li key={row.id}>
                <div>
                  <strong>
                    {row.kindLabel} · {row.amountLabel}
                  </strong>
                  <span>{row.businessDateLabel}</span>
                  {row.note === null ? null : <span>{row.note}</span>}
                </div>
                {row.isReversed ? <StatusBadge label="Đã bị đảo" tone="stop" /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function DriverHistory() {
  const navigation = useNavigationInput();
  const trips = toSectionQuery(useDriverTrips(navigation));

  if (trips.isLoading) return <LoadingState label="Đang đọc lịch sử…" />;
  if (trips.errorMessage !== null) {
    return <ErrorState message={trips.errorMessage} onRetry={trips.refetch} />;
  }

  // CHI du lieu cua chinh lai xe: `/transport/me/trips` khong nhan `:driverId`, danh tinh den tu
  // phien dang nhap. Day la cuong che bang CAU TRUC, khong phai mot bo loc o man hinh.
  const rows = (trips.data ?? []).map(toDriverTripCard);

  return (
    <>
      <h1 className="tx-driver__title">Lịch sử</h1>
      {rows.length === 0 ? (
        <EmptyState title="Chưa có chuyến nào trong lịch sử của bạn." />
      ) : (
        <ul className="tx-driver__list">
          {rows.map((row) => (
            <li key={row.id}>
              <div>
                <strong>
                  {row.code} · {row.route}
                </strong>
                <span>{row.businessDateLabel}</span>
                <span>{row.customerLabel}</span>
              </div>
              <StatusBadge label={row.statusLabel} tone={row.tone} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * BON CON SO CUA CHINH TOI — `TX-07b` (#237).
 *
 * KHONG hien so du quy tho. `DriverSettlementSelfStatement` khong co truong do, va do la mot bat
 * bien CAU TRUC chu khong phai mot bo loc o day: mot lai xe doc "so du quy: -1.500.000" se hieu la
 * minh dang no, dung cai ma `DA-T3-01` canh bao. Con so ho nhan la "hoan ung cong ty tra lai", luon
 * DUONG, va cau chu di kem noi ro do khong phai luong.
 *
 * KHONG co nut rut tien: mot nguoi tu chi tien cho chinh minh la dung cai ma kiem soat noi bo sinh
 * ra de chan. Lai xe noi voi ke toan, va ke toan ghi lan chi.
 *
 * `isBlocked` (khach tat capability, hoac vai khong co ma tu phuc vu) tra ve `null` — mot khoi
 * trong con hon mot khoi noi "0 dong" ve mot thu khong duoc do.
 */
function DriverSettlementSummary() {
  const navigation = useNavigationInput();
  const settlement = toSectionQuery(useDriverSettlement(navigation));

  if (settlement.isBlocked) return null;
  if (settlement.isLoading) return <LoadingState label="Đang đọc bảng quyết toán…" />;
  if (settlement.errorMessage !== null) {
    return <ErrorState message={settlement.errorMessage} onRetry={settlement.refetch} />;
  }

  const data = settlement.data;
  if (!data) return null;

  return (
    <section className="tx-driver__summary" aria-label="Bảng quyết toán của tôi">
      <dl>
        <div>
          <dt>Đã ghi nhận</dt>
          <dd>{formatMoney(data.wageCredited)}</dd>
        </div>
        <div>
          <dt>Đã nhận</dt>
          <dd>{formatMoney(data.wageCashedOut)}</dd>
        </div>
        <div>
          <dt>Còn lại</dt>
          <dd>{formatMoney(data.wageRemaining)}</dd>
        </div>
        <div>
          <dt>Công ty trả lại hoàn ứng</dt>
          <dd>{formatMoney(data.reimbursementOutstanding)}</dd>
        </div>
      </dl>
      <p className="tx-note">
        Hoàn ứng là tiền bạn đã bỏ túi cho chuyến, công ty trả lại — không phải lương.
      </p>
    </section>
  );
}

/**
 * PHIEU LUONG CUA CHINH MINH — `#168 B8`.
 *
 * KHONG loc `DRAFT` o day, va do khong phai thieu sot: may chu tra `null` cho phieu tam tinh ngay o
 * ham dung khung nhin, va kieu tra ve la `Exclude<PayslipStatus, 'DRAFT'>`. Mot lop loc thu hai o
 * man hinh se lech khoi lop dau vao mot ngay nao do.
 *
 * Phieu DA BI DAO van hien: giau no se lam phieu dao thanh mot dong am khong co doi ung.
 */
function DriverPayslip() {
  const navigation = useNavigationInput();
  const payslips = toSectionQuery(useDriverPayslips(navigation));

  if (payslips.isLoading) return <LoadingState label="Đang đọc phiếu lương…" />;
  if (payslips.errorMessage !== null) {
    return <ErrorState message={payslips.errorMessage} onRetry={payslips.refetch} />;
  }

  const rows = toDriverPayslipRows(payslips.data ?? []);

  return (
    <>
      <h1 className="tx-driver__title">Phiếu lương</h1>
      <DriverSettlementSummary />
      {rows.length === 0 ? (
        <EmptyState title="Bạn chưa có phiếu lương nào đã công bố." />
      ) : (
        <ul className="tx-driver__list">
          {rows.map((row) => (
            <li key={row.id}>
              <div>
                <strong>
                  {row.periodLabel} · {row.netLabel}
                </strong>
                <span>{row.rangeLabel}</span>
                <span>
                  {row.tripCountLabel} chuyến · {row.distanceLabel}
                </span>
                <span>
                  Tổng thu nhập {row.grossLabel} · khấu trừ {row.deductionsLabel}
                </span>
                {row.correctionReason === null ? null : (
                  <span className="tx-note tx-note--warn">Lý do sửa: {row.correctionReason}</span>
                )}
                {row.components.length === 0 ? null : (
                  <span className="tx-driver__components">
                    {row.components.map((component) => (
                      <span key={component.key}>
                        {component.label}: {component.isDeduction ? '− ' : ''}
                        {component.amountLabel}
                      </span>
                    ))}
                  </span>
                )}
                {row.paidAtLabel === '—' ? null : <span>Đã trả lúc {row.paidAtLabel}</span>}
              </div>
              <StatusBadge label={row.statusLabel} tone={row.tone} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
