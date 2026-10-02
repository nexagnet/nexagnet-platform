'use client';

import { useMemo, useState } from 'react';
import { PermissionGate } from '../components/PermissionGate';
import { DataTable, PageHeader, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useAssetStakeholders,
  useNavigationInput,
  useOwnershipRegister,
  useVehicles,
} from '../hooks/useTransportWorkspace';
import { canPerform, hasOperationsScope, operationsEmptyMessage } from '../transport-actions';
import {
  OPERATIONAL_CONTROL_LABEL,
  OWNERSHIP_CLASS_LABEL,
  toOwnershipInterestRows,
  toRegisterSummary,
  toStakeholderRows,
  type OwnershipInterestRow,
  type StakeholderRow,
  type VehicleOwnershipClass,
} from '../workspace/asset-ownership';

/**
 * Man SO HUU TAI SAN — `TX-08`, #242 E5.
 *
 * Man nay tra loi hai cau hoi ma khong man nao khac tra loi duoc, va no giu chung TACH NHAU:
 *
 *   · AI DIEU HANH chiec xe (`operationalControl`);
 *   · AI SO HUU no, bao nhieu, tu bao gio (so dang ky).
 *
 * Nhan "Đồng sở hữu" KHONG dong nghia voi "nhà xe ngoài" — hai cot rieng, hai dong chu rieng. Do la
 * hieu nham dat nhat cua ca tranche, nen man hinh noi ra ca hai thay vi gop lam mot huy hieu.
 */

const OWNERSHIP_FILTERS: readonly {
  readonly id: VehicleOwnershipClass | 'all';
  readonly label: string;
}[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'sole-owner', label: OWNERSHIP_CLASS_LABEL['sole-owner'] },
  { id: 'co-owned', label: OWNERSHIP_CLASS_LABEL['co-owned'] },
  { id: 'external-carrier', label: OWNERSHIP_CLASS_LABEL['external-carrier'] },
  { id: 'unregistered', label: OWNERSHIP_CLASS_LABEL.unregistered },
];

/** Dung chung cho bang DANG hieu luc va bang LICH SU — hai bang, mot hop dong cot. */
const ownershipColumns = [
  {
    key: 'holder',
    header: 'Bên hữu quan',
    render: (row: OwnershipInterestRow) => `${row.stakeholderName} (${row.stakeholderKindLabel})`,
  },
  { key: 'share', header: 'Tỷ lệ', render: (row: OwnershipInterestRow) => row.shareLabel },
  { key: 'from', header: 'Hiệu lực từ', render: (row: OwnershipInterestRow) => row.fromLabel },
  { key: 'to', header: 'Đến', render: (row: OwnershipInterestRow) => row.toLabel },
  {
    key: 'provenance',
    header: 'Nguồn gốc',
    render: (row: OwnershipInterestRow) => row.provenanceLabel,
  },
];

export function AssetOwnershipView() {
  const navigation = useNavigationInput();
  const vehicles = toSectionQuery(useVehicles(navigation));
  const stakeholders = toSectionQuery(useAssetStakeholders(navigation));
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [filter, setFilter] = useState<VehicleOwnershipClass | 'all'>('all');
  const register = toSectionQuery(useOwnershipRegister(navigation, selectedVehicleId));

  const vehicleRows = useMemo(
    () =>
      (vehicles.data ?? []).map((vehicle) => ({
        id: vehicle.id,
        plate: vehicle.registrationPlate,
        vehicleClass: vehicle.vehicleClass,
        control: vehicle.operationalControl,
        controlLabel: OPERATIONAL_CONTROL_LABEL[vehicle.operationalControl],
        registerLabel: vehicle.ownershipRegisterComplete ? 'Đã khai đủ' : 'Còn thiếu',
      })),
    [vehicles.data],
  );

  /*
   * BO LOC chi doc duoc HAI nhom tu danh sach xe: `external-carrier` va "phan con lai". Ba nhom kia
   * doi cac quyen loi DANG hieu luc, ma danh sach xe khong mang theo — va goi mot lan `register`
   * cho tung xe se la N+1 lan goi mang cho mot bo loc.
   *
   * Nen o day loc dung cai doc duoc, va noi ro dieu do tren man hinh thay vi lang le tra ve mot tap
   * sai. Khi Lane G lam read-model cho bang dieu khien, bo loc day du se doc tu do.
   */
  const filtered = useMemo(() => {
    if (filter === 'all') return vehicleRows;
    if (filter === 'external-carrier') {
      return vehicleRows.filter((row) => row.control === 'EXTERNAL_CARRIER');
    }
    return vehicleRows.filter((row) => row.control === 'INTERNAL_OPERATED');
  }, [vehicleRows, filter]);

  if (!hasOperationsScope(navigation)) {
    return (
      <>
        <PageHeader title="Sở hữu tài sản" />
        <ErrorState message={operationsEmptyMessage(navigation)} />
      </>
    );
  }

  const summary = register.data === undefined ? null : toRegisterSummary(register.data);
  const currentRows =
    register.data === undefined ? [] : toOwnershipInterestRows(register.data.current);
  const historyRows =
    register.data === undefined ? [] : toOwnershipInterestRows(register.data.history);
  const stakeholderRows = toStakeholderRows(stakeholders.data ?? []);

  return (
    <>
      <PageHeader
        title="Sở hữu tài sản"
        summary="Quyền điều hành và sổ đăng ký sở hữu của từng xe, kèm lịch sử và nguồn gốc từng lần ghi."
      />

      <p className="tx-note">
        Quyền <strong>điều hành</strong> và quyền <strong>sở hữu</strong> là hai trục độc lập. Một
        xe có người góp vốn mà công ty vẫn điều hành thì vẫn là xe nội bộ — thêm bên hữu quan không
        đổi cột điều hành. Tỷ lệ sở hữu <strong>không</strong> là công thức chia lợi nhuận: hệ thống
        không sinh ra bất kỳ khoản phải trả nào từ con số này.
      </p>

      {/*
        `#395` — so dang ky doc THEO XE, chon tu danh sach xe (`transport.vehicle.read`). Chua duoc
        xem danh sach xe thi phan chon xe noi mot cau; ho so ben huu quan ben duoi van dung duoc.
      */}
      {!canPerform(navigation, 'transport.vehicle.read') ? (
        <PermissionGate viewer={navigation} action="transport.vehicle.read" />
      ) : (
        <>
          <div className="tx-tabs" role="group" aria-label="Lọc theo nhóm sở hữu">
            {OWNERSHIP_FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="tx-tab"
                aria-pressed={filter === option.id}
                onClick={() => setFilter(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {vehicles.isLoading ? <LoadingState label="Đang tải đội xe" /> : null}
          {vehicles.errorMessage === null ? null : <ErrorState message={vehicles.errorMessage} />}

          {vehicles.errorMessage !== null ? null : filtered.length === 0 && !vehicles.isLoading ? (
            <EmptyState title="Không có xe nào trong nhóm đang lọc." />
          ) : (
            <DataTable
              caption="Đội xe — chọn một xe để xem sổ đăng ký sở hữu"
              rows={filtered}
              rowKey={(row) => row.id}
              selectedKey={selectedVehicleId}
              onSelect={(row) => setSelectedVehicleId(row.id)}
              columns={[
                { key: 'plate', header: 'Biển số', render: (row) => row.plate },
                { key: 'class', header: 'Hạng xe', render: (row) => row.vehicleClass },
                { key: 'control', header: 'Quyền điều hành', render: (row) => row.controlLabel },
                { key: 'register', header: 'Sổ đăng ký', render: (row) => row.registerLabel },
              ]}
            />
          )}
        </>
      )}

      {selectedVehicleId === null ? null : (
        <section className="tx-panel" aria-label="Sổ đăng ký sở hữu">
          {register.isLoading ? <LoadingState label="Đang tải sổ đăng ký" /> : null}
          {register.errorMessage === null ? null : <ErrorState message={register.errorMessage} />}

          {summary === null ? null : (
            <>
              <h3>Sổ đăng ký sở hữu — {summary.plate}</h3>
              <p className="tx-note">
                <StatusBadge label={summary.ownershipClassLabel} tone="flat" /> ·{' '}
                {summary.controlLabel} · Tổng tỷ lệ đang hiệu lực:{' '}
                <strong>{summary.totalLabel}</strong>
                {summary.unattributedLabel === null
                  ? null
                  : ` · Chưa quy được cho ai: ${summary.unattributedLabel}`}
              </p>
              <p className="tx-note">{summary.completenessNote}</p>

              {currentRows.length === 0 ? (
                <EmptyState title="Chưa ghi bên hữu quan nào cho xe này. Đây là trạng thái hợp lệ — dữ liệu sở hữu có thể nhập dần." />
              ) : (
                <DataTable
                  caption="Quyền lợi đang hiệu lực"
                  rows={currentRows}
                  rowKey={(row: OwnershipInterestRow) => row.id}
                  columns={ownershipColumns}
                />
              )}

              {historyRows.length === 0 ? null : (
                <DataTable
                  caption="Lịch sử sở hữu — các quyền lợi đã đóng"
                  rows={historyRows}
                  rowKey={(row: OwnershipInterestRow) => row.id}
                  columns={ownershipColumns}
                />
              )}
            </>
          )}
        </section>
      )}

      <section className="tx-panel" aria-label="Hồ sơ bên hữu quan">
        <h3>Bên hữu quan</h3>
        <p className="tx-note">
          Quyền xem của một cổ đông đến từ hồ sơ ở đây cộng với một quyền lợi đang hiệu lực — không
          đến từ chức danh. Cột &ldquo;Tài khoản xem&rdquo; chỉ nói đã mở hay chưa; hệ thống không
          hiển thị tài khoản nào được nối.
        </p>
        {stakeholders.isLoading ? <LoadingState label="Đang tải bên hữu quan" /> : null}
        {stakeholders.errorMessage === null ? null : (
          <ErrorState message={stakeholders.errorMessage} />
        )}
        {stakeholderRows.length === 0 && !stakeholders.isLoading ? (
          <EmptyState title="Chưa có hồ sơ bên hữu quan nào." />
        ) : (
          <DataTable
            caption="Hồ sơ bên hữu quan"
            rows={stakeholderRows}
            rowKey={(row: StakeholderRow) => row.id}
            columns={[
              { key: 'name', header: 'Tên', render: (row: StakeholderRow) => row.displayName },
              { key: 'kind', header: 'Loại', render: (row: StakeholderRow) => row.kindLabel },
              {
                key: 'status',
                header: 'Trạng thái',
                render: (row: StakeholderRow) => row.statusLabel,
              },
              {
                key: 'account',
                header: 'Tài khoản xem',
                render: (row: StakeholderRow) => row.accountLabel,
              },
              { key: 'note', header: 'Ghi chú', render: (row: StakeholderRow) => row.note },
            ]}
          />
        )}
      </section>
    </>
  );
}
