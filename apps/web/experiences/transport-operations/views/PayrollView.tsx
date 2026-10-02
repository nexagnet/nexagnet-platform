'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { formatVnd } from '../../../lib/format';
import { PermissionNote } from '../components/PermissionGate';
import { DataTable, MetricCard, PageHeader, StatusBadge } from '../components/primitives';
import { ConfirmAction, EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useDrivers,
  useNavigationInput,
  usePayrollPeriods,
  usePayrollRuns,
  usePayslipDetail,
  useRunPayslips,
  useVehicles,
} from '../hooks/useTransportWorkspace';
import { useRevealOnOpen } from '../hooks/useRevealOnOpen';
import { canPerform } from '../transport-actions';
import { transportApi } from '../transport-api';
import { toAssetDirectory } from '../workspace/assets';
import {
  toPayrollPeriodRows,
  toPayrollRunRows,
  toPayslipDetail,
  toPayslipRows,
} from '../workspace/payroll';

/**
 * `TX-07` tren man hinh.
 *
 * MOT CAM tuyet doi: man hinh khong tinh mot khoan luong nao. Luong co ban, don gia theo chuyen,
 * theo km, thuong tiet kiem nhien lieu va cac khoan tru deu do may chu tinh va CHOT vao
 * `policySnapshot` cua lan chay. O day chi hien va bam nut.
 *
 * Hai thao tac ghi deu doi XAC NHAN, va deu di theo dung vong doi may chu cho phep — mot phieu DA
 * TRA khong sua truc tiep duoc, chi phat duoc phieu bu hoac phieu dao (`INV-20`).
 */
import { PayrollPeriodCommands, PayrollRunCommand, PayslipCorrection } from './PayrollCommands';

export function PayrollView() {
  const navigation = useNavigationInput();
  const queryClient = useQueryClient();
  const vehicles = toSectionQuery(useVehicles(navigation));
  const drivers = toSectionQuery(useDrivers(navigation));
  const periods = toSectionQuery(usePayrollPeriods(navigation));

  const [periodId, setPeriodId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [payslipId, setPayslipId] = useState<string | null>(null);
  const revealPayslip = useRevealOnOpen<HTMLElement>(payslipId);
  const [pending, setPending] = useState<{
    readonly id: string;
    readonly action: 'approve' | 'pay';
  } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const runs = toSectionQuery(usePayrollRuns(navigation, periodId));
  const payslips = toSectionQuery(useRunPayslips(navigation, runId));
  const detail = toSectionQuery(usePayslipDetail(navigation, payslipId));

  const refreshPayroll = () => {
    void queryClient.invalidateQueries({ queryKey: ['transport', 'payroll'] });
  };

  const directory = useMemo(
    () => toAssetDirectory({ vehicles: vehicles.data ?? [], drivers: drivers.data ?? [] }),
    [vehicles.data, drivers.data],
  );

  const periodRows = toPayrollPeriodRows(periods.data ?? []);
  const runRows = toPayrollRunRows(runs.data ?? []);
  const payslipRows = toPayslipRows(payslips.data ?? [], directory);
  const detailModel = toPayslipDetail(detail.data ?? null, directory);

  const canApprove = canPerform(navigation, 'transport.payslip.approve');
  const canPay = canPerform(navigation, 'transport.payslip.pay');

  const mutation = useMutation({
    mutationFn: (input: { readonly id: string; readonly action: 'approve' | 'pay' }) =>
      input.action === 'approve'
        ? transportApi.payroll.approvePayslip(input.id)
        : transportApi.payroll.payPayslip(input.id),
    onSuccess: () => {
      setPending(null);
      setFailure(null);
      void queryClient.invalidateQueries({ queryKey: ['transport', 'payroll'] });
    },
    // HIEN NGUYEN VAN cau tu choi cua may chu — dien dat lai la lam mat thong tin.
    onError: (error: Error) => setFailure(error.message),
  });

  // Cong TONG THUC NHAN cua lan chay. Day KHONG phai mot phep tinh luong: no cong lai dung nhung
  // con so may chu da chot, de nguoi duyet thay quy mo lan chi truoc khi bam.
  const totalNet = (payslips.data ?? []).reduce((sum, row) => sum + row.netAmount, 0);

  return (
    <>
      <PageHeader
        title="Lương"
        summary="Kỳ lương, bảng tính thử, phiếu lương và các khoản cấu thành."
      />

      {failure === null ? null : <ErrorState message={failure} />}
      {periods.errorMessage === null ? null : (
        <ErrorState message={periods.errorMessage} onRetry={periods.refetch} />
      )}
      {periods.isLoading ? <LoadingState label="Đang đọc kỳ lương…" /> : null}
      {/* `#395` — ten lai xe va bien so tren phieu luong la danh ba RIENG: thieu quyen thi noi ra. */}
      <PermissionNote
        viewer={navigation}
        actions={['transport.driver.read', 'transport.vehicle.read']}
      />

      <section className="tx-panel" aria-label="Kỳ lương">
        <h2>Kỳ lương</h2>
        <PayrollPeriodCommands
          periods={periods.data ?? []}
          viewer={navigation}
          onChanged={refreshPayroll}
        />
        {/* Mot lan doc LOI (vd `403`) khong phai "chua co ky nao" — loi da noi o tren (`#395`). */}
        {periods.errorMessage !== null ? null : periodRows.length === 0 && !periods.isLoading ? (
          <EmptyState title="Chưa có kỳ lương nào được mở." />
        ) : (
          <DataTable
            caption="Các kỳ lương"
            rows={periodRows}
            rowKey={(row) => row.id}
            selectedKey={periodId}
            onSelect={(row) => {
              setPeriodId(row.id);
              setRunId(null);
              setPayslipId(null);
            }}
            columns={[
              { key: 'label', header: 'Kỳ', isRowHeader: true, render: (row) => row.label },
              { key: 'range', header: 'Khoảng ngày', render: (row) => row.rangeLabel },
              {
                key: 'status',
                header: 'Trạng thái',
                render: (row) => <StatusBadge label={row.statusLabel} tone={row.tone} />,
              },
              { key: 'closed', header: 'Chốt lúc', render: (row) => row.closedAtLabel },
            ]}
          />
        )}
      </section>

      {periodId === null ? null : (
        <section className="tx-panel" aria-label="Lần chạy lương">
          <h2>Lần chạy</h2>
          <PayrollRunCommand
            periodId={periodId}
            periodStatus={
              (periods.data ?? []).find((row) => row.id === periodId)?.status ?? 'CLOSED'
            }
            viewer={navigation}
            onChanged={refreshPayroll}
          />
          {runs.isLoading ? <LoadingState label="Đang đọc các lần chạy…" /> : null}
          {runRows.length === 0 && !runs.isLoading ? (
            <EmptyState title="Kỳ này chưa được chạy lần nào." />
          ) : (
            <ul className="tx-worklist">
              {runRows.map((row) => (
                <li key={row.id}>
                  <div>
                    <strong>
                      {row.sequenceLabel} · {row.runAtLabel}
                    </strong>
                    <span>Bảng đơn giá: {row.policyLines.join(' · ')}</span>
                    {/*
                      NGUON THIEU phai hien ra. Mot lan chay thieu nguon van cho ra phieu — chi la
                      thieu mot khoan — va nguoi duyet can biet minh dang duyet mot bang khong day du.
                    */}
                    {row.hasMissingInputs ? (
                      <span className="tx-note tx-note--warn">{row.missingInputs.join(' · ')}</span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={runId === row.id ? 'tx-btn tx-btn--go' : 'tx-btn'}
                    onClick={() => {
                      setRunId(row.id);
                      setPayslipId(null);
                    }}
                  >
                    {runId === row.id ? 'Đang xem' : 'Xem phiếu'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {runId === null ? null : (
        <section className="tx-panel" aria-label="Phiếu lương của lần chạy">
          <h2>Phiếu lương</h2>
          {payslips.isLoading ? <LoadingState label="Đang đọc phiếu lương…" /> : null}
          {payslipRows.length === 0 && !payslips.isLoading ? (
            <EmptyState title="Lần chạy này không sinh phiếu lương nào." />
          ) : (
            <>
              <div className="tx-cards">
                <MetricCard label="Số phiếu" value={String(payslipRows.length)} />
                <MetricCard label="Tổng thực nhận" value={formatVnd(totalNet)} />
              </div>
              <DataTable
                caption="Phiếu lương của lần chạy"
                rows={payslipRows}
                rowKey={(row) => row.id}
                selectedKey={payslipId}
                onSelect={(row) => setPayslipId(row.id)}
                // Mot lan chay luong sinh mot phieu cho MOI lai xe, nen bang nay dai theo quan so.
                onShowAll={() => setPayslipId(null)}
                columns={[
                  {
                    key: 'driver',
                    header: 'Lái xe',
                    isRowHeader: true,
                    render: (row) => row.driverLabel,
                  },
                  { key: 'kind', header: 'Loại phiếu', render: (row) => row.kindLabel },
                  {
                    key: 'status',
                    header: 'Trạng thái',
                    render: (row) => <StatusBadge label={row.statusLabel} tone={row.tone} />,
                  },
                  {
                    key: 'trips',
                    header: 'Số chuyến',
                    isNumeric: true,
                    render: (row) => row.tripCountLabel,
                  },
                  {
                    key: 'km',
                    header: 'Số km',
                    isNumeric: true,
                    render: (row) => row.distanceLabel,
                  },
                  {
                    key: 'gross',
                    header: 'Tổng thu nhập',
                    isNumeric: true,
                    render: (row) => row.grossLabel,
                  },
                  {
                    key: 'deduct',
                    header: 'Khấu trừ',
                    isNumeric: true,
                    render: (row) => row.deductionsLabel,
                  },
                  {
                    key: 'net',
                    header: 'Thực nhận',
                    isNumeric: true,
                    render: (row) => row.netLabel,
                  },
                  {
                    key: 'actions',
                    header: 'Thao tác',
                    render: (row) => (
                      <span className="tx-rowactions">
                        {row.canApprove && canApprove ? (
                          <button
                            type="button"
                            className="tx-btn"
                            onClick={() => setPending({ id: row.id, action: 'approve' })}
                          >
                            Duyệt
                          </button>
                        ) : null}
                        {row.canPay && canPay ? (
                          <button
                            type="button"
                            className="tx-btn tx-btn--go"
                            onClick={() => setPending({ id: row.id, action: 'pay' })}
                          >
                            Chi trả
                          </button>
                        ) : null}
                      </span>
                    ),
                  },
                ]}
              />
            </>
          )}
        </section>
      )}

      {detailModel === null ? null : (
        <section className="tx-panel" aria-label="Chi tiết phiếu lương" ref={revealPayslip}>
          <h2>Chi tiết phiếu — {detailModel.row.driverLabel}</h2>
          <PayslipCorrection
            payslipId={detailModel.row.id}
            canCorrect={detailModel.row.canCorrect}
            viewer={navigation}
            onChanged={refreshPayroll}
          />
          <div className="tx-cards">
            <MetricCard label="Thực nhận" value={detailModel.row.netLabel} />
            <MetricCard label="Duyệt lúc" value={detailModel.approvedAtLabel} />
            <MetricCard label="Trả lúc" value={detailModel.paidAtLabel} />
            <MetricCard
              label="Số dư quỹ lúc chốt"
              value={detailModel.fundSnapshotLabel}
              hint="ảnh chụp để người duyệt nhìn trước khi quyết"
            />
          </div>
          {detailModel.row.correctionReason === null ? null : (
            <p className="tx-note tx-note--warn">Lý do sửa: {detailModel.row.correctionReason}</p>
          )}
          {detailModel.components.length === 0 ? (
            <EmptyState title="Phiếu này không có khoản cấu thành nào." />
          ) : (
            <DataTable
              caption="Các khoản cấu thành"
              rows={detailModel.components}
              rowKey={(row) => row.key}
              columns={[
                { key: 'label', header: 'Khoản', isRowHeader: true, render: (row) => row.label },
                { key: 'source', header: 'Nguồn', render: (row) => row.sourceLabel },
                { key: 'qty', header: 'Số lượng × đơn giá', render: (row) => row.quantityLabel },
                {
                  key: 'amount',
                  header: 'Số tiền',
                  isNumeric: true,
                  render: (row) => (row.isDeduction ? `− ${row.amountLabel}` : row.amountLabel),
                },
              ]}
            />
          )}
        </section>
      )}

      <ConfirmAction
        open={pending !== null}
        title={pending?.action === 'approve' ? 'Duyệt phiếu lương?' : 'Xác nhận đã chi trả?'}
        detail={
          pending?.action === 'approve'
            ? 'Sau khi duyệt, phiếu không sửa trực tiếp được nữa — mọi thay đổi phải đi qua một phiếu bổ sung hoặc phiếu đảo.'
            : 'Ghi nhận đã trả tiền cho lái xe. Thao tác này không hoàn tác được; sửa sai phải phát phiếu đảo.'
        }
        confirmLabel={pending?.action === 'approve' ? 'Duyệt' : 'Đã trả'}
        isBusy={mutation.isPending}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending !== null) mutation.mutate(pending);
        }}
      />
    </>
  );
}
