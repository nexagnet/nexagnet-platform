'use client';

import { useMemo, useState } from 'react';
import { PermissionGate } from '../components/PermissionGate';
import { DataTable, DetailRow, PageHeader, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useDrivers,
  useNavigationInput,
  useVehicleDriverHistory,
  useVehicleLocationHealth,
  useVehicles,
  type SectionQuery,
} from '../hooks/useTransportWorkspace';
import { canPerform, hasOperationsScope, operationsEmptyMessage } from '../transport-actions';
import {
  LICENCE_NOTE_SCOPE,
  NO_FLEET_WIDE_ASSIGNMENT_NOTE,
  NO_RESPONSIBLE_DRIVER,
  toDriverRows,
  toVehicleResponsibility,
  toVehicleRows,
  VEHICLE_STATUS_NOTE,
  type DriverRow,
  type ResponsibleDriver,
  type VehicleResponsibility,
  type VehicleRow,
} from '../workspace/fleet';
import type { Driver, VehicleDriverAssignment } from '../transport-types';
import { toLocationHealthPresentation } from '../workspace/location-health';

/**
 * Man DOI XE & LAI XE.
 *
 * Hai bang, mot man: khach doc "doi xe" nhu mot thu, va tach thanh hai muc dieu huong se bat ho
 * nho minh dang o dau. Chuyen giua hai bang la mot tab CUC BO, khong phai mot dia chi moi — cai
 * dang len dia chi la nhung thu dan duoc cho nguoi khac, con lua chon tab thi khong.
 */
type FleetTab = 'vehicles' | 'drivers';

/** Ngay nghiep vu HOM NAY theo lich may — dung de so han giay phep, khong dung de ghi du lieu. */
const todayBusinessDate = (): string => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

function ResponsibleDriverRows({ driver }: { readonly driver: ResponsibleDriver }) {
  return (
    <dl className="tx-detail__block">
      <DetailRow label="Lái xe">{driver.driverLabel}</DetailRow>
      <DetailRow label="Phụ trách từ">{driver.sinceLabel}</DetailRow>
      <DetailRow label="Trạng thái">
        {driver.statusLabel === null ? (
          '—'
        ) : (
          <StatusBadge label={driver.statusLabel} tone={driver.statusTone} />
        )}
      </DetailRow>
      <DetailRow label="Tài khoản">{driver.accountLabel ?? '—'}</DetailRow>
    </dl>
  );
}

function VehicleResponsibilityBody({ model }: { readonly model: VehicleResponsibility }) {
  return (
    <div className="tx-detail__grid">
      <div className="tx-detail__block">
        <h3>Đang phụ trách</h3>
        {model.kind === 'none' ? (
          <p>
            <StatusBadge label={NO_RESPONSIBLE_DRIVER} tone="wait" />
          </p>
        ) : null}
        {model.kind === 'assigned' ? <ResponsibleDriverRows driver={model.current} /> : null}
        {model.kind === 'conflict' ? (
          <>
            <p className="tx-note tx-note--warn" role="status">
              {model.current.length} lái xe cùng đang đứng tên phụ trách xe này, trong khi mỗi xe
              chỉ có một người phụ trách. Cần kiểm tra lại dữ liệu đội xe.
            </p>
            {model.current.map((driver) => (
              <ResponsibleDriverRows key={driver.assignmentId} driver={driver} />
            ))}
          </>
        ) : null}
      </div>
      <div className="tx-detail__block">
        <h3>Trước đó</h3>
        {model.previous.length === 0 ? (
          <p className="tx-note">Chưa có lượt phụ trách nào trước đó.</p>
        ) : (
          <ul className="tx-timeline" aria-label="Lịch sử phụ trách">
            {model.previous.map((row) => (
              <li key={row.id}>
                <strong>{row.driverLabel}</strong>
                <span>
                  {row.fromLabel} → {row.toLabel}
                </span>
              </li>
            ))}
          </ul>
        )}
        {model.olderCount === 0 ? null : (
          <p className="tx-note">Còn {model.olderCount} lượt phụ trách cũ hơn không hiện ở đây.</p>
        )}
      </div>
    </div>
  );
}

/**
 * "Xe nay hien ai dang phu trach?" (#335). Ba trang thai rieng — dang doc, loi, co cau tra loi —
 * va KHONG trang thai nao duoc noi "chua co lai xe phu trach" khi thuc ra chua doc duoc gi.
 */
function VehicleResponsibilityPanel({
  plate,
  history,
  drivers,
}: {
  readonly plate: string;
  readonly history: SectionQuery<readonly VehicleDriverAssignment[]>;
  readonly drivers: SectionQuery<readonly Driver[]>;
}) {
  if (history.isBlocked) return null;
  // Ten den tu danh sach lai xe. Ve truoc khi danh sach ve la in "chua doc duoc ten" cho mot nguoi
  // van co ten — nen cho ca hai.
  const isLoading = history.isLoading || drivers.isLoading;
  const model =
    isLoading || history.data === undefined
      ? null
      : toVehicleResponsibility(history.data, drivers.data ?? []);
  return (
    <section className="tx-panel" aria-label={`Lái xe phụ trách xe ${plate}`}>
      <h2>Lái xe phụ trách · {plate}</h2>
      {isLoading ? <LoadingState label="Đang đọc lái xe phụ trách…" /> : null}
      {history.errorMessage === null ? null : (
        <ErrorState message={history.errorMessage} onRetry={history.refetch} />
      )}
      {model === null ? null : <VehicleResponsibilityBody model={model} />}
    </section>
  );
}

export function FleetView() {
  const navigation = useNavigationInput();
  const vehicles = toSectionQuery(useVehicles(navigation));
  const drivers = toSectionQuery(useDrivers(navigation));
  const [tab, setTab] = useState<FleetTab>('vehicles');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const driverHistory = toSectionQuery(useVehicleDriverHistory(navigation, selectedVehicleId));
  const locationHealth = useVehicleLocationHealth(navigation, selectedVehicleId);
  /** `#395` — bang lai xe la phan phu (`transport.driver.read`), khong phai mot bang "0 lai xe". */
  const canReadDrivers = canPerform(navigation, 'transport.driver.read');
  const today = useMemo(todayBusinessDate, []);

  if (!hasOperationsScope(navigation)) {
    return (
      <>
        <PageHeader title="Đội xe & lái xe" />
        <ErrorState message={operationsEmptyMessage(navigation)} />
      </>
    );
  }

  const vehicleRows = toVehicleRows(vehicles.data ?? []);
  const selectedVehicle = vehicleRows.find((row) => row.id === selectedVehicleId);
  const driverRows = toDriverRows(drivers.data ?? [], today);
  const expiring = driverRows.filter((row) => row.licenceStanding !== 'valid');

  return (
    <>
      <PageHeader
        title="Đội xe & lái xe"
        summary="Hồ sơ xe, hồ sơ lái xe, lịch sử phụ trách và số km đồng hồ."
      />

      <div className="tx-tabs" role="tablist" aria-label="Chọn bảng">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'vehicles'}
          className="tx-tab"
          onClick={() => setTab('vehicles')}
        >
          Xe ({vehicleRows.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'drivers'}
          className="tx-tab"
          onClick={() => setTab('drivers')}
        >
          {canReadDrivers ? `Lái xe (${driverRows.length})` : 'Lái xe'}
        </button>
      </div>

      {tab === 'vehicles' ? (
        <section aria-label="Danh sách xe">
          {vehicles.errorMessage === null ? null : (
            <ErrorState message={vehicles.errorMessage} onRetry={vehicles.refetch} />
          )}
          {vehicles.isLoading ? <LoadingState label="Đang đọc đội xe…" /> : null}
          {vehicleRows.length === 0 && !vehicles.isLoading ? (
            <EmptyState title="Chưa có xe nào trong đội." />
          ) : (
            <>
              <DataTable<VehicleRow>
                caption="Danh sách xe"
                rows={vehicleRows}
                // Khoa dong PHAI cung loai voi `selectedKey` (ma xe). Truoc #335 day la bien so, nen
                // dong vua chon khong bao gio sang len va `Xem tất cả` khong bao gio hien ra.
                rowKey={(row) => row.id}
                selectedKey={selectedVehicleId}
                onSelect={(row) => setSelectedVehicleId(row.id)}
                onShowAll={() => setSelectedVehicleId(null)}
                columns={[
                  {
                    key: 'plate',
                    header: 'Biển số',
                    isRowHeader: true,
                    render: (row) => row.registrationPlate,
                  },
                  { key: 'class', header: 'Loại xe', render: (row) => row.vehicleClass },
                  {
                    key: 'status',
                    header: 'Trạng thái',
                    render: (row) => <StatusBadge label={row.statusLabel} tone={row.tone} />,
                  },
                  {
                    key: 'odo',
                    header: 'Đồng hồ',
                    isNumeric: true,
                    render: (row) => row.odometerLabel,
                  },
                  {
                    key: 'payload',
                    header: 'Tải cho phép',
                    isNumeric: true,
                    render: (row) => row.payloadLabel,
                  },
                ]}
              />
              {selectedVehicle === undefined ? null : (
                <VehicleResponsibilityPanel
                  plate={selectedVehicle.registrationPlate}
                  history={driverHistory}
                  drivers={drivers}
                />
              )}
              {selectedVehicle === undefined ? null : (
                <PermissionGate viewer={navigation} action="transport.tracking.read" />
              )}
              {locationHealth.isLoading ? <LoadingState label="Đang đọc sức khoẻ vị trí…" /> : null}
              {locationHealth.isError ? (
                <ErrorState message={(locationHealth.error as Error).message} />
              ) : null}
              {locationHealth.data === undefined
                ? null
                : (() => {
                    const health = toLocationHealthPresentation(locationHealth.data);
                    return (
                      <section className="tx-panel" aria-label="Sức khoẻ vị trí xe">
                        <h2>Sức khoẻ vị trí</h2>
                        <p>
                          <StatusBadge label={health.statusLabel} tone={health.statusTone} />
                        </p>
                        <p className="tx-note">{health.realDeviceProofLabel}</p>
                        <ul className="tx-notes">
                          {health.sources.map((source) => (
                            <li key={source.family}>
                              <strong>{source.label}</strong> —{' '}
                              <StatusBadge label={source.statusLabel} tone={source.tone} />
                              {source.ageSeconds === null
                                ? ''
                                : ` · nhận cách đây ${source.ageSeconds.toLocaleString('vi-VN')} giây`}
                            </li>
                          ))}
                        </ul>
                        {health.currentLocation === null ? null : (
                          <p className="tx-note">
                            Vị trí hiện tại · {health.currentLocation.sourceLabel} ·{' '}
                            {health.currentLocation.observedAt}
                          </p>
                        )}
                        {health.lastKnownLocation === null ? null : (
                          <p className="tx-note tx-note--warn">
                            Vị trí cuối cùng · {health.lastKnownLocation.sourceLabel} ·{' '}
                            {health.lastKnownLocation.observedAt}
                          </p>
                        )}
                      </section>
                    );
                  })()}
              <p className="tx-note">{VEHICLE_STATUS_NOTE}</p>
              <p className="tx-note">{NO_FLEET_WIDE_ASSIGNMENT_NOTE}</p>
            </>
          )}
        </section>
      ) : !canReadDrivers ? (
        <section aria-label="Danh sách lái xe">
          <PermissionGate viewer={navigation} action="transport.driver.read" />
        </section>
      ) : (
        <section aria-label="Danh sách lái xe">
          {drivers.errorMessage === null ? null : (
            <ErrorState message={drivers.errorMessage} onRetry={drivers.refetch} />
          )}
          {drivers.isLoading ? <LoadingState label="Đang đọc hồ sơ lái xe…" /> : null}
          {expiring.length === 0 ? null : (
            <p className="tx-note tx-note--warn" role="status">
              {expiring.length} lái xe có giấy phép đã hoặc sắp hết hạn.
            </p>
          )}
          {driverRows.length === 0 && !drivers.isLoading ? (
            <EmptyState title="Chưa có hồ sơ lái xe nào." />
          ) : (
            <>
              <DataTable<DriverRow>
                caption="Danh sách lái xe"
                rows={driverRows}
                rowKey={(row) => row.id}
                columns={[
                  {
                    key: 'name',
                    header: 'Họ tên',
                    isRowHeader: true,
                    render: (row) => row.fullName,
                  },
                  { key: 'phone', header: 'Điện thoại', render: (row) => row.phone },
                  { key: 'licence', header: 'Hạng GPLX', render: (row) => row.licenceClass },
                  {
                    key: 'expiry',
                    header: 'Hết hạn GPLX',
                    render: (row) =>
                      row.licenceNote === null ? (
                        row.licenceExpiryLabel
                      ) : (
                        <StatusBadge
                          label={row.licenceExpiryLabel}
                          tone={row.licenceStanding === 'expired' ? 'stop' : 'wait'}
                          title={row.licenceNote}
                        />
                      ),
                  },
                  { key: 'status', header: 'Trạng thái', render: (row) => row.statusLabel },
                  {
                    key: 'account',
                    header: 'Tài khoản',
                    render: (row) => (row.hasAuthUser ? 'Đã nối' : 'Chưa nối'),
                  },
                ]}
              />
              <p className="tx-note">{LICENCE_NOTE_SCOPE}</p>
              <p className="tx-note">
                Lái xe chưa nối tài khoản sẽ không mở được màn hình lái xe của chính mình.
              </p>
            </>
          )}
        </section>
      )}
    </>
  );
}
