'use client';

import { useQueryClient } from '@tanstack/react-query';

import { useMemo } from 'react';
import {
  CommandPanel,
  DataTable,
  MetricCard,
  PageHeader,
  StatusBadge,
} from '../components/primitives';
import { PermissionGate, PermissionNote } from '../components/PermissionGate';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useComplianceAlerts,
  useComplianceDocuments,
  useDrivers,
  useFleetStatus,
  useMaintenanceDue,
  useNavigationInput,
  useOperationalAlerts,
  useVehicles,
  useWorkOrders,
} from '../hooks/useTransportWorkspace';
import { canPerform } from '../transport-actions';
import {
  toAssetDirectory,
  toComplianceAlertRows,
  toComplianceDocumentRows,
  toFleetStatusRows,
  toMaintenanceDueRows,
  toOperationalAlerts,
  toWorkOrderRows,
} from '../workspace/assets';

/**
 * `TX-06` tren man hinh — bao duong, giay to, trang thai hieu luc, bang canh bao.
 *
 * MOT CAM tuyet doi o day: man hinh KHONG BAO GIO tinh lai han bao duong hay trang thai hieu luc.
 * `state` va `effectiveStatus` deu do may chu quyet (`#170 §4.B`). Neu mot ngay nao do co mot phep
 * so `dueOnDate` voi hom nay o tep nay, hai nguoi o hai mui gio se doc ra hai ket qua.
 */
import {
  ComplianceDocumentForm,
  WorkOrderCommands,
  WorkOrderRowActions,
} from './MaintenanceCommands';

export function MaintenanceComplianceView() {
  const navigation = useNavigationInput();
  const queryClient = useQueryClient();
  const vehicles = toSectionQuery(useVehicles(navigation));
  const drivers = toSectionQuery(useDrivers(navigation));
  const due = toSectionQuery(useMaintenanceDue(navigation));
  const workOrders = toSectionQuery(useWorkOrders(navigation));
  const documents = toSectionQuery(useComplianceDocuments(navigation));
  const complianceAlerts = toSectionQuery(useComplianceAlerts(navigation));

  const refreshAssets = () => {
    for (const queryKey of [
      ['transport', 'maintenance'],
      ['transport', 'compliance'],
      ['transport', 'fleet-status'],
      ['transport', 'alerts'],
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
  const fleetStatus = toSectionQuery(useFleetStatus(navigation));
  const operational = toSectionQuery(useOperationalAlerts(navigation));

  const directory = useMemo(
    () => toAssetDirectory({ vehicles: vehicles.data ?? [], drivers: drivers.data ?? [] }),
    [vehicles.data, drivers.data],
  );

  const dueRows = toMaintenanceDueRows(due.data ?? [], directory);
  const orderRows = toWorkOrderRows(workOrders.data ?? [], directory);
  const documentRows = toComplianceDocumentRows(documents.data ?? [], directory);
  const alertRows = toComplianceAlertRows(complianceAlerts.data ?? [], directory);
  const statusRows = toFleetStatusRows(fleetStatus.data ?? []);
  const alerts = toOperationalAlerts(operational.data ?? null, directory);

  const overdueCount = (due.data ?? []).filter((row) => row.state === 'OVERDUE').length;
  const expiredCount = (complianceAlerts.data ?? []).filter(
    (row) => row.health === 'EXPIRED',
  ).length;
  const openOrderCount = orderRows.filter((row) => row.isOpen).length;
  const firstError = due.errorMessage ?? documents.errorMessage ?? fleetStatus.errorMessage ?? null;
  const isLoading = due.isLoading || documents.isLoading || fleetStatus.isLoading;
  /**
   * `#395` — ba khoi PHU cua man nay, moi khoi mot ma XEM rieng trong nhom "Bảo dưỡng / giấy tờ".
   * Thieu ma nao thi khoi do noi "Bạn chưa được cấp quyền xem …" — khong con "Không có giấy tờ nào
   * sắp hết hạn." (mot cau sai: chua doc thi chua biet) hay mot the "0" dau trang.
   */
  const canReadDocuments = canPerform(navigation, 'transport.compliance.document.read');
  const canReadAlerts = canPerform(navigation, 'transport.alerts.read');
  const canReadFleetStatus = canPerform(navigation, 'transport.fleet_status.read');

  return (
    <>
      <PageHeader
        title="Bảo dưỡng & giấy tờ"
        summary="Lịch bảo dưỡng đến hạn, lệnh sửa chữa, giấy tờ sắp hết hạn."
      />

      {firstError === null ? null : <ErrorState message={firstError} onRetry={due.refetch} />}
      {isLoading ? <LoadingState label="Đang đọc tình trạng đội xe…" /> : null}
      {/* Bien so va ten lai xe la danh ba cua nhom "Đội xe & lái xe" — quyen kem theo. */}
      <PermissionNote
        viewer={navigation}
        actions={['transport.vehicle.read', 'transport.driver.read']}
      />

      <section className="tx-cards" aria-label="Tình trạng đội xe">
        <MetricCard label="Kế hoạch quá hạn" value={String(overdueCount)} />
        <MetricCard label="Lệnh sửa đang mở" value={String(openOrderCount)} />
        {canReadDocuments ? (
          <MetricCard label="Giấy tờ đã hết hạn" value={String(expiredCount)} />
        ) : null}
        {canReadAlerts ? (
          <MetricCard label="Cảnh báo cần xử lý ngay" value={String(alerts.criticalCount)} />
        ) : null}
      </section>

      {/* BANG CANH BAO GOM CHUNG — cau ve nguon thieu phai hien TRUOC bang, khong o duoi. */}
      <section className="tx-panel" aria-label="Cảnh báo vận hành">
        <h2>Cảnh báo vận hành</h2>
        {!canReadAlerts ? (
          <PermissionGate viewer={navigation} action="transport.alerts.read" />
        ) : (
          <>
            <p className="tx-panel__lead">{alerts.headline}</p>
            {alerts.unavailableNote === null ? null : (
              <p className="tx-note tx-note--warn" role="note">
                {alerts.unavailableNote}
              </p>
            )}
            {alerts.rows.length === 0 ? (
              <EmptyState title="Không có cảnh báo nào đang mở." />
            ) : (
              <ul className="tx-worklist">
                {alerts.rows.map((row) => (
                  <li key={row.key}>
                    <div>
                      <strong>{row.kindLabel}</strong>
                      <span>{row.subjectLabel}</span>
                      {row.details.length === 0 ? null : <span>{row.details.join(' · ')}</span>}
                    </div>
                    <StatusBadge label={row.severityLabel} tone={row.tone} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="tx-panel" aria-label="Bảo dưỡng đến hạn">
        <h2>Bảo dưỡng đến hạn</h2>
        {/* Doc LOI (loi da noi dau trang) khong phai "chua co ke hoach nao" (`#395`). */}
        {due.errorMessage !== null ? null : dueRows.length === 0 ? (
          <EmptyState title="Chưa có kế hoạch bảo dưỡng nào đến hạn." />
        ) : (
          <DataTable
            caption="Kế hoạch bảo dưỡng theo mức độ"
            rows={dueRows}
            rowKey={(row) => row.planId}
            columns={[
              {
                key: 'vehicle',
                header: 'Xe',
                isRowHeader: true,
                render: (row) => row.vehicleLabel,
              },
              { key: 'plan', header: 'Kế hoạch', render: (row) => row.planName },
              { key: 'trigger', header: 'Mốc theo', render: (row) => row.triggerLabel },
              {
                key: 'state',
                header: 'Tình trạng',
                render: (row) => <StatusBadge label={row.stateLabel} tone={row.tone} />,
              },
              { key: 'remaining', header: 'Còn lại', render: (row) => row.remainingLabel },
              { key: 'dueAt', header: 'Đến hạn tại', render: (row) => row.dueAtLabel },
              {
                key: 'last',
                header: 'Lần bảo dưỡng gần nhất',
                render: (row) => row.lastServicedLabel,
              },
            ]}
          />
        )}
      </section>

      <section className="tx-panel" aria-label="Lệnh sửa chữa">
        <h2>Lệnh sửa chữa</h2>
        {/*
          Form MO LENH nam trong mot ngan dong san.

          Man nay cao 1370px o 1440px, va hai trong sau khoi cua no la form luon mo. Nguoi mo man
          hinh gan nhu bao gio cung de XEM co gi den han, khong phai de mo mot lenh sua chua — nen
          bon o nhap khong duoc dung truoc bang. Xem `CommandPanel` trong `components/primitives`.
        */}
        {/*
          `openLabel` KHONG duoc chua ten nut gui cua form ben trong.

          Playwright khop `getByRole('button', { name })` theo CHUOI CON. Nut gui cua form la
          `Mở lệnh sửa chữa`; de nut mo ngan mang dung chuoi do se lam moi lan chon nut gui trong
          bo E2E thanh mot loi `strict mode violation` — hai nut cung khop. Nen nut mo mang mot ten
          RIENG, va do la mot rang buoc that chu khong phai mot so thich dat ten.
        */}
        <CommandPanel
          title="Mở lệnh sửa chữa"
          openLabel="Ghi lệnh mới"
          hint="Ghi một lệnh sửa chữa mới cho một xe."
        >
          <WorkOrderCommands
            vehicles={vehicles.data ?? []}
            viewer={navigation}
            onChanged={refreshAssets}
          />
        </CommandPanel>
        {(workOrders.data ?? [])
          .filter((row) => row.status === 'OPEN')
          .map((row) => (
            <WorkOrderRowActions
              key={row.id}
              workOrder={row}
              vehicleLabel={
                (vehicles.data ?? []).find((v) => v.id === row.vehicleId)?.registrationPlate ??
                'Xe chưa đọc được biển số'
              }
              viewer={navigation}
              onChanged={refreshAssets}
            />
          ))}
        {workOrders.errorMessage !== null ? (
          <ErrorState message={workOrders.errorMessage} onRetry={workOrders.refetch} />
        ) : orderRows.length === 0 ? (
          <EmptyState title="Chưa có lệnh sửa chữa nào." />
        ) : (
          <DataTable
            caption="Lệnh sửa chữa và lịch sử"
            rows={orderRows}
            rowKey={(row) => row.id}
            columns={[
              {
                key: 'vehicle',
                header: 'Xe',
                isRowHeader: true,
                render: (row) => row.vehicleLabel,
              },
              { key: 'desc', header: 'Nội dung', render: (row) => row.description },
              {
                key: 'status',
                header: 'Trạng thái',
                render: (row) => <StatusBadge label={row.statusLabel} tone={row.tone} />,
              },
              { key: 'opened', header: 'Mở lúc', render: (row) => row.openedLabel },
              { key: 'done', header: 'Xong lúc', render: (row) => row.completedLabel },
              { key: 'cost', header: 'Chi phí', isNumeric: true, render: (row) => row.costLabel },
            ]}
          />
        )}
      </section>

      <section className="tx-panel" aria-label="Giấy tờ sắp hết hạn">
        <h2>Giấy tờ sắp hết hạn</h2>
        {!canReadDocuments ? (
          <PermissionGate viewer={navigation} action="transport.compliance.document.read" />
        ) : alertRows.length === 0 ? (
          <EmptyState title="Không có giấy tờ nào sắp hoặc đã hết hạn." />
        ) : (
          <DataTable
            caption="Giấy tờ theo mức độ"
            rows={alertRows}
            rowKey={(row) => row.documentId}
            columns={[
              {
                key: 'subject',
                header: 'Đối tượng',
                isRowHeader: true,
                render: (row) => row.subjectLabel,
              },
              { key: 'type', header: 'Loại giấy tờ', render: (row) => row.typeLabel },
              {
                key: 'health',
                header: 'Tình trạng',
                render: (row) => <StatusBadge label={row.healthLabel} tone={row.tone} />,
              },
              { key: 'validTo', header: 'Hết hạn', render: (row) => row.validToLabel },
              { key: 'countdown', header: 'Còn lại', render: (row) => row.countdownLabel },
              { key: 'threshold', header: 'Ngưỡng cảnh báo', render: (row) => row.thresholdLabel },
            ]}
          />
        )}
      </section>

      <section className="tx-panel" aria-label="Hồ sơ giấy tờ">
        <h2>Hồ sơ giấy tờ</h2>
        <CommandPanel
          title="Đăng ký giấy tờ"
          openLabel="Ghi giấy tờ mới"
          hint="Ghi một giấy tờ mới cho xe hoặc lái xe, kèm khoảng hiệu lực."
        >
          <ComplianceDocumentForm
            vehicles={vehicles.data ?? []}
            drivers={drivers.data ?? []}
            viewer={navigation}
            onChanged={refreshAssets}
          />
        </CommandPanel>
        {!canReadDocuments ? (
          <PermissionGate viewer={navigation} action="transport.compliance.document.read" />
        ) : documentRows.length === 0 ? (
          <EmptyState title="Chưa có giấy tờ nào được ghi nhận." />
        ) : (
          <DataTable
            caption="Toàn bộ giấy tờ đã ghi nhận"
            rows={documentRows}
            rowKey={(row) => row.id}
            columns={[
              {
                key: 'subject',
                header: 'Đối tượng',
                isRowHeader: true,
                render: (row) => row.subjectLabel,
              },
              { key: 'type', header: 'Loại', render: (row) => row.typeLabel },
              { key: 'no', header: 'Số hiệu', render: (row) => row.documentNo ?? '—' },
              { key: 'from', header: 'Hiệu lực từ', render: (row) => row.validFromLabel },
              { key: 'to', header: 'Đến', render: (row) => row.validToLabel },
              { key: 'status', header: 'Trạng thái', render: (row) => row.statusLabel },
            ]}
          />
        )}
      </section>

      <section className="tx-panel" aria-label="Trạng thái hiệu lực của đội xe">
        <h2>Trạng thái hiệu lực của đội xe</h2>
        <p className="tx-panel__lead">
          Trạng thái này do máy chủ tính từ lệnh sửa chữa đang mở và chuyến đang chạy. Khi nó khác
          với trạng thái ghi trong hồ sơ, đó là một mâu thuẫn cần kiểm tra chứ không phải một con số
          để chọn.
        </p>
        {!canReadFleetStatus ? (
          <PermissionGate viewer={navigation} action="transport.fleet_status.read" />
        ) : statusRows.length === 0 ? (
          <EmptyState title="Chưa đọc được trạng thái đội xe." />
        ) : (
          <DataTable
            caption="Trạng thái hiệu lực từng xe"
            rows={statusRows}
            rowKey={(row) => row.vehicleId}
            columns={[
              {
                key: 'plate',
                header: 'Biển số',
                isRowHeader: true,
                render: (row) => row.registrationPlate,
              },
              {
                key: 'effective',
                header: 'Hiệu lực',
                render: (row) => <StatusBadge label={row.effectiveLabel} tone={row.tone} />,
              },
              { key: 'reason', header: 'Vì sao', render: (row) => row.reasonLabel },
              { key: 'recorded', header: 'Ghi trong hồ sơ', render: (row) => row.recordedLabel },
              {
                key: 'issues',
                header: 'Mâu thuẫn',
                render: (row) =>
                  row.inconsistencies.length === 0 ? '—' : row.inconsistencies.join(' · '),
              },
            ]}
          />
        )}
      </section>
    </>
  );
}
