'use client';

import { useMemo, useState } from 'react';
import { useTenantRuntime } from '../../../lib/tenant-runtime-context';
import { PermissionGate, PermissionNote } from '../components/PermissionGate';
import { PageHeader } from '../components/primitives';
import { EmptyState, ErrorState } from '../components/SectionState';
import {
  toSectionQuery,
  useApByFlow,
  useArAging,
  useCustomers,
  useDrivers,
  useFundStatement,
  useNavigationInput,
  usePartners,
  usePayrollPeriods,
  usePayrollRuns,
  useRunPayslips,
  useTripFuelEntries,
  useTrips,
  useVehicles,
} from '../hooks/useTransportWorkspace';
import { canPerformAll } from '../transport-actions';
import type { ApByCounterpartyRow, SettlementFlow } from '../transport-types';
import { toAssetDirectory } from '../workspace/assets';
import {
  apCsv,
  arAgingCsv,
  downloadCsv,
  driverFundCsv,
  fuelReconciliationCsv,
  payrollCsv,
  tripsCsv,
  type CsvFile,
} from '../workspace/exports';
import { toSettlementDirectory } from '../workspace/settlement';
import { businessTodayIn } from './business-today';

/**
 * KET XUAT — de ke toan lay so lieu ra ma khong can hoi lap trinh vien (#170 §6).
 *
 * Moi ban xuat chay tren DUNG du lieu man hinh dang co, khong goi mot duong rieng nao. Do la mot
 * lua chon co gia: ban xuat khong bao gio nhieu hon cai nguoi dung dang nhin, nen khong co chuyen
 * "tep khac voi man hinh". Doi lai, mot ban xuat toan bo lich su can mot duong API rieng — va do
 * la viec cua mot task khac, khong phai T7D.
 */
export function ExportsView() {
  const navigation = useNavigationInput();
  const tenant = useTenantRuntime();
  const stamp = useMemo(() => businessTodayIn(tenant.transport?.timeZone), [tenant.transport]);

  const trips = toSectionQuery(useTrips(navigation));
  const customers = toSectionQuery(useCustomers(navigation));
  const partners = toSectionQuery(usePartners(navigation));
  const vehicles = toSectionQuery(useVehicles(navigation));
  const drivers = toSectionQuery(useDrivers(navigation));
  const aging = toSectionQuery(useArAging(navigation, stamp, null));

  const [driverId, setDriverId] = useState<string | null>(null);
  const [tripId, setTripId] = useState<string | null>(null);
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const fund = toSectionQuery(useFundStatement(navigation, driverId));
  const fuelEntries = toSectionQuery(useTripFuelEntries(navigation, tripId));
  const periods = toSectionQuery(usePayrollPeriods(navigation));
  const runs = toSectionQuery(usePayrollRuns(navigation, periodId));
  const latestRunId = (runs.data ?? []).at(-1)?.id ?? null;
  const payslips = toSectionQuery(useRunPayslips(navigation, latestRunId));

  const carrierAp = toSectionQuery(useApByFlow(navigation, 'CARRIER_SERVICE'));
  const commissionAp = toSectionQuery(useApByFlow(navigation, 'PARTNER_COMMISSION'));
  const fuelAp = toSectionQuery(useApByFlow(navigation, 'FUEL_SUPPLIER'));

  /**
   * `#395` — ban xuat CHUYEN XE la ban chinh cua muc (va la cong cua muc). Moi ban xuat con lai doc
   * mot so rieng voi ma cua no: thieu quyen thi khoi do NOI mot cau, khong con mot nut xam khong ly
   * do hay mot o chon rong.
   */
  const canExportFund = canPerformAll(navigation, [
    'transport.costing.driver_fund.read',
    'transport.driver.read',
  ]);

  const settlementDirectory = useMemo(
    () => toSettlementDirectory({ customers: customers.data ?? [], partners: partners.data ?? [] }),
    [customers.data, partners.data],
  );
  const assetDirectory = useMemo(
    () => toAssetDirectory({ vehicles: vehicles.data ?? [], drivers: drivers.data ?? [] }),
    [vehicles.data, drivers.data],
  );

  const apByFlow = useMemo(() => {
    const map = new Map<SettlementFlow, readonly ApByCounterpartyRow[]>();
    if (carrierAp.data) map.set('CARRIER_SERVICE', carrierAp.data);
    if (commissionAp.data) map.set('PARTNER_COMMISSION', commissionAp.data);
    if (fuelAp.data) map.set('FUEL_SUPPLIER', fuelAp.data);
    return map;
  }, [carrierAp.data, commissionAp.data, fuelAp.data]);

  /**
   * Mot lan bam KHONG duoc lam trang man hinh. `downloadCsv` cham `Blob`/`URL`/`document`, va ba
   * thu do co the tu choi trong mot trinh duyet khoa chat — bat lai va noi ra, thay vi de mot
   * ngoai le chay len ranh gioi React.
   */
  const run = (build: () => CsvFile | null) => {
    setFailure(null);
    try {
      const file = build();
      if (file === null) {
        setFailure('Chưa có dữ liệu để kết xuất cho lựa chọn này.');
        return;
      }
      downloadCsv(file);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Không tải được tệp kết xuất.');
    }
  };

  return (
    <>
      <PageHeader
        title="Xuất dữ liệu"
        summary="Kết xuất sổ sách để đối chiếu ngoài hệ thống."
        context={
          <p className="tx-note">
            Tệp CSV mở trực tiếp bằng Excel: tách cột bằng dấu chấm phẩy, có dấu tiếng Việt, số để
            thô để cộng và lọc được. Mỗi bản xuất chạy trên đúng dữ liệu màn hình đang có.
          </p>
        }
      />

      {failure === null ? null : <ErrorState message={failure} />}
      {/* Ten khach, doi tac, bien so trong tep: thieu danh ba thi tep ghi "chưa đọc được tên". */}
      <PermissionNote
        viewer={navigation}
        actions={['transport.customer.read', 'transport.partner.read', 'transport.vehicle.read']}
      />

      <section className="tx-panel" aria-label="Kết xuất không cần chọn thêm">
        <h2>Xuất ngay</h2>
        <div className="tx-driver__actions">
          <button
            type="button"
            className="tx-btn"
            disabled={(trips.data ?? []).length === 0}
            onClick={() => run(() => tripsCsv(trips.data ?? [], settlementDirectory, stamp))}
          >
            Chuyến xe ({(trips.data ?? []).length})
          </button>
          <PermissionGate viewer={navigation} action="transport.settlement.report.read">
            <button
              type="button"
              className="tx-btn"
              disabled={aging.data === undefined}
              onClick={() =>
                run(() =>
                  aging.data === undefined
                    ? null
                    : arAgingCsv(aging.data, settlementDirectory, stamp),
                )
              }
            >
              Công nợ phải thu
            </button>
            <button
              type="button"
              className="tx-btn"
              disabled={apByFlow.size === 0}
              onClick={() => run(() => apCsv(apByFlow, settlementDirectory, stamp))}
            >
              Công nợ phải trả
            </button>
          </PermissionGate>
        </div>
      </section>

      <section className="tx-panel" aria-label="Sổ quỹ một lái xe">
        <h2>Sổ quỹ lái xe</h2>
        <PermissionNote
          viewer={navigation}
          actions={['transport.costing.driver_fund.read', 'transport.driver.read']}
        />
        {canExportFund ? (
          <>
            <label className="tx-field">
              <span>Lái xe</span>
              <select
                aria-label="Lái xe"
                value={driverId ?? ''}
                onChange={(event) =>
                  setDriverId(event.target.value === '' ? null : event.target.value)
                }
              >
                <option value="">Chọn một lái xe</option>
                {(drivers.data ?? []).map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.fullName}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="tx-btn"
              disabled={fund.data === undefined}
              onClick={() =>
                run(() =>
                  fund.data === undefined ? null : driverFundCsv(fund.data, assetDirectory, stamp),
                )
              }
            >
              Xuất sổ quỹ
            </button>
          </>
        ) : null}
      </section>

      <section className="tx-panel" aria-label="Đối soát nhiên liệu của một chuyến">
        <h2>Đối soát nhiên liệu</h2>
        <PermissionGate viewer={navigation} action="transport.fuel.entry.read">
          <label className="tx-field">
            <span>Chuyến</span>
            <select
              aria-label="Chuyến"
              value={tripId ?? ''}
              onChange={(event) => setTripId(event.target.value === '' ? null : event.target.value)}
            >
              <option value="">Chọn một chuyến</option>
              {(trips.data ?? []).map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.code} · {trip.originLabel} → {trip.destinationLabel}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="tx-btn"
            disabled={(fuelEntries.data ?? []).length === 0}
            onClick={() => run(() => fuelReconciliationCsv(fuelEntries.data ?? [], stamp))}
          >
            Xuất phiếu đổ dầu
          </button>
        </PermissionGate>
      </section>

      <section className="tx-panel" aria-label="Bảng lương của một kỳ">
        <h2>Bảng lương</h2>
        <PermissionGate viewer={navigation} action="transport.payroll.period.read">
          <label className="tx-field">
            <span>Kỳ lương</span>
            <select
              aria-label="Kỳ lương"
              value={periodId ?? ''}
              onChange={(event) =>
                setPeriodId(event.target.value === '' ? null : event.target.value)
              }
            >
              <option value="">Chọn một kỳ</option>
              {(periods.data ?? []).map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}
                </option>
              ))}
            </select>
          </label>
          {periodId !== null && latestRunId === null ? (
            <EmptyState title="Kỳ này chưa được chạy lần nào, nên chưa có bảng lương để xuất." />
          ) : null}
          <button
            type="button"
            className="tx-btn"
            disabled={(payslips.data ?? []).length === 0}
            onClick={() => run(() => payrollCsv(payslips.data ?? [], assetDirectory, stamp))}
          >
            Xuất bảng lương (lần chạy gần nhất)
          </button>
        </PermissionGate>
      </section>
    </>
  );
}
