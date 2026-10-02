'use client';

import { useMemo, useState } from 'react';
import { useTenantRuntime } from '../../../lib/tenant-runtime-context';
import { PermissionGate } from '../components/PermissionGate';
import { CommandPanel, DataTable, MetricCard, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useNavigationInput,
  useVehicleFuelConsumption,
  useVehicles,
} from '../hooks/useTransportWorkspace';
import { useRevealOnOpen } from '../hooks/useRevealOnOpen';
import { canPerform } from '../transport-actions';
import {
  consumptionPeriodProblem,
  monthRangeOf,
  toConsumptionDrilldownModel,
  type ConsumptionRow,
} from '../workspace/fuel-consumption';
import { businessTodayIn } from './business-today';

/** Mot lan mo drill-down: xe + ky, va (khi mo tu hop thu) phieu can danh dau. */
export interface ConsumptionFocus {
  readonly vehicleId: string;
  readonly from: string;
  readonly to: string;
  readonly entryId: string | null;
}

/**
 * CHON XE + KY de xem chuoi tieu hao — `#313`.
 *
 * Ky mac dinh la THANG HIEN TAI theo lich nghiep vu cua khach (`businessTodayIn`), khong theo UTC:
 * mo man hinh luc 6 gio sang ngay mung 1 phai ra thang moi, khong phai thang truoc.
 */
export function FuelConsumptionPicker({
  onOpen,
}: {
  readonly onOpen: (focus: ConsumptionFocus) => void;
}) {
  const navigation = useNavigationInput();
  const tenant = useTenantRuntime();
  const vehicles = toSectionQuery(useVehicles(navigation));
  const initial = useMemo(
    () => monthRangeOf(businessTodayIn(tenant.transport?.timeZone)),
    [tenant.transport],
  );
  const [vehicleId, setVehicleId] = useState('');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [problem, setProblem] = useState<string | null>(null);

  if (!canPerform(navigation, 'transport.fuel.entry.read')) return null;

  return (
    <CommandPanel
      title="Tiêu hao theo xe"
      hint="Mốc km trước → km hiện tại → quãng đường → số lít → L/100km của một xe trong một kỳ. Chỉ để soát xét."
      openLabel="Xem tiêu hao"
    >
      {/* `#395` — o chon xe doc danh sach xe: thieu quyen thi noi, khong de mot o chon rong. */}
      <PermissionGate viewer={navigation} action="transport.vehicle.read" />
      <form
        className="tx-filters"
        aria-label="Chọn xe và kỳ tiêu hao"
        hidden={!canPerform(navigation, 'transport.vehicle.read')}
        onSubmit={(event) => {
          event.preventDefault();
          const found = vehicleId === '' ? 'Chọn một xe.' : consumptionPeriodProblem({ from, to });
          setProblem(found);
          if (found === null) onOpen({ vehicleId, from, to, entryId: null });
        }}
      >
        <label className="tx-field">
          <span>Xe</span>
          <select
            aria-label="Xe cần xem tiêu hao"
            value={vehicleId}
            onChange={(event) => setVehicleId(event.target.value)}
          >
            <option value="">Chọn xe</option>
            {(vehicles.data ?? []).map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.registrationPlate}
              </option>
            ))}
          </select>
        </label>
        <label className="tx-field">
          <span>Từ ngày</span>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="tx-field">
          <span>Đến ngày</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button type="submit" className="tx-btn">
          Xem chuỗi km
        </button>
      </form>
      {problem === null ? null : (
        <p className="tx-note tx-note--warn" role="alert">
          {problem}
        </p>
      )}
    </CommandPanel>
  );
}

/**
 * CHUOI TIEU HAO cua mot xe trong mot ky — `#313`.
 *
 * Moi con so o day la cua MAY CHU. Mat xich khong tinh duoc hien `—` va noi VI SAO; canh bao vuot
 * dinh muc noi ro no chi de soat xet. Khong co nut nao o day tao mot khoan tru cho lai xe — va khong
 * co duong nao o may chu de mot nut nhu vay goi toi.
 */
export function FuelConsumptionDrilldown({
  focus,
  onClose,
}: {
  readonly focus: ConsumptionFocus;
  readonly onClose: () => void;
}) {
  const navigation = useNavigationInput();
  const reveal = useRevealOnOpen<HTMLElement>(
    `${focus.vehicleId}|${focus.from}|${focus.to}|${focus.entryId ?? ''}`,
  );
  const consumption = toSectionQuery(
    useVehicleFuelConsumption(navigation, {
      vehicleId: focus.vehicleId,
      from: focus.from,
      to: focus.to,
    }),
  );

  const model =
    consumption.data === undefined
      ? null
      : toConsumptionDrilldownModel(consumption.data, focus.entryId);

  return (
    <section
      className="tx-detail tx-consumption"
      aria-label="Chuỗi tiêu hao nhiên liệu"
      ref={reveal}
    >
      <header className="tx-detail__head">
        <div>
          <h2>Tiêu hao nhiên liệu{model === null ? '' : ` — ${model.title}`}</h2>
          {model === null ? null : <p>{model.periodLabel}</p>}
        </div>
        <div className="tx-detail__actions">
          <button type="button" className="tx-btn tx-btn--ghost" onClick={onClose}>
            Đóng
          </button>
        </div>
      </header>

      {consumption.isLoading ? <LoadingState label="Đang dựng chuỗi km…" /> : null}
      {consumption.errorMessage === null ? null : (
        <ErrorState message={consumption.errorMessage} onRetry={consumption.refetch} />
      )}

      {model === null ? null : (
        <>
          <p className="tx-review__notice" role="note">
            {model.notice}
          </p>
          <section className="tx-cards" aria-label="Tổng kỳ tiêu hao">
            {model.cards.map((card) => (
              <MetricCard key={card.label} label={card.label} value={card.value} hint={card.hint} />
            ))}
          </section>
          <ul className="tx-consumption__notes">
            <li>{model.normLabel}</li>
            <li>{model.leadInLabel}</li>
            {model.unverifiedNote === null ? null : <li>{model.unverifiedNote}</li>}
            {model.truncatedNote === null ? null : (
              <li className="tx-note--warn">{model.truncatedNote}</li>
            )}
          </ul>

          {model.emptyNote !== null ? (
            <EmptyState title={model.emptyNote} />
          ) : (
            <DataTable<ConsumptionRow>
              caption="Chuỗi km và tiêu hao từng lần đổ"
              rows={model.rows}
              rowKey={(row) => row.id}
              selectedKey={focus.entryId}
              columns={[
                { key: 'date', header: 'Ngày', isRowHeader: true, render: (row) => row.dateLabel },
                {
                  key: 'verification',
                  header: 'Xác thực',
                  render: (row) => (
                    <StatusBadge label={row.verificationLabel} tone={row.verificationTone} />
                  ),
                },
                {
                  key: 'previous',
                  header: 'Mốc km trước',
                  isNumeric: true,
                  render: (row) => row.previousOdometerLabel,
                },
                {
                  key: 'odometer',
                  header: 'Km hiện tại',
                  isNumeric: true,
                  render: (row) => row.odometerLabel,
                },
                {
                  key: 'distance',
                  header: 'Quãng đường',
                  isNumeric: true,
                  render: (row) => row.distanceLabel,
                },
                {
                  key: 'liters',
                  header: 'Số lít',
                  isNumeric: true,
                  render: (row) => row.litersLabel,
                },
                {
                  key: 'consumption',
                  header: 'L/100km',
                  isNumeric: true,
                  render: (row) => row.consumptionLabel,
                },
                {
                  key: 'state',
                  header: 'Trạng thái',
                  render: (row) => (
                    <div className="tx-consumption__state">
                      <StatusBadge label={row.stateLabel} tone={row.stateTone} />
                      {row.insightLabels.map((label) => (
                        <span key={label} className="tx-consumption__insight">
                          {label}
                        </span>
                      ))}
                      {row.recordedNote === null ? null : (
                        <span className="tx-note">{row.recordedNote}</span>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          )}
        </>
      )}
    </section>
  );
}
