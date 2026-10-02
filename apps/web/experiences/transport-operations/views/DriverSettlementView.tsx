'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { PermissionNote } from '../components/PermissionGate';
import { DataTable, MetricCard, PageHeader, StatusBadge } from '../components/primitives';
import { ConfirmAction, EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useDrivers,
  useNavigationInput,
  useSettlementBalances,
  useSettlementStatement,
  useVehicles,
} from '../hooks/useTransportWorkspace';
import { canPerform, hasOperationsScope, operationsEmptyMessage } from '../transport-actions';
import { transportApi } from '../transport-api';
import { toAssetDirectory } from '../workspace/assets';
import {
  toSettlementBalanceRows,
  toSettlementStatementView,
  toWageLines,
  type CashoutRow,
  type SettlementBalanceRow,
  type UnsettledWageRow,
  type WageMonthRow,
} from '../workspace/driver-settlement';

/**
 * `TX-07b` tren man hinh — BE MAT KE TOAN.
 *
 * MOT CAM tuyet doi, cung cau voi man Luong: man hinh KHONG BAO GIO tinh mot so du nao. Da ghi
 * nhan, da rut, con lai va hoan ung deu do may chu cong tu so cai. Neu mot phep tru xuat hien o
 * day, hai nguoi mo cung mot bang se doc ra hai con so.
 *
 * BA quyen RIENG BIET dieu khien ba viec: doc bang (`...read`), chi tien (`...cashout`), dao mot
 * lan chi (`...reverse`). Ke toan co hai cai dau; chi Giam doc dao duoc — cung khuon `GD-11`.
 */
export function DriverSettlementView() {
  const navigation = useNavigationInput();
  const queryClient = useQueryClient();
  const vehicles = toSectionQuery(useVehicles(navigation));
  const drivers = toSectionQuery(useDrivers(navigation));
  const balances = toSectionQuery(useSettlementBalances(navigation));
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const statement = toSectionQuery(useSettlementStatement(navigation, selectedDriverId));

  const directory = useMemo(
    () => toAssetDirectory({ vehicles: vehicles.data ?? [], drivers: drivers.data ?? [] }),
    [vehicles.data, drivers.data],
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['transport', 'driver-settlement'] });
    // So quy doi cung mot lan chi hoan ung — man Quy lai xe phai doc lai, khong duoc giu so cu.
    void queryClient.invalidateQueries({ queryKey: ['transport', 'costing'] });
  };

  if (!hasOperationsScope(navigation)) {
    return (
      <>
        <PageHeader title="Quyết toán lái xe" />
        <ErrorState message={operationsEmptyMessage(navigation)} />
      </>
    );
  }

  const balanceRows = toSettlementBalanceRows(balances.data ?? [], directory);
  const view = statement.data ? toSettlementStatementView(statement.data, directory) : null;

  return (
    <>
      <PageHeader
        title="Quyết toán lái xe"
        summary="Lương đã ghi nhận theo tháng, các lần chi và phân bổ, hoàn ứng công ty còn nợ."
      />

      {balances.isLoading ? <LoadingState label="Đang đọc số dư quyết toán" /> : null}
      {balances.errorMessage ? <ErrorState message={balances.errorMessage} /> : null}
      {/* `#395` — ten lai xe va bien so la danh ba RIENG: thieu quyen thi noi ra, khong in `id`. */}
      <PermissionNote
        viewer={navigation}
        actions={['transport.driver.read', 'transport.vehicle.read']}
      />
      {!balances.isLoading && !balances.errorMessage && balanceRows.length === 0 ? (
        <EmptyState title="Chưa có lái xe nào có phiếu lương đã chốt." />
      ) : null}

      {balanceRows.length > 0 ? (
        <DataTable<SettlementBalanceRow>
          caption="Số dư quyết toán theo lái xe"
          columns={BALANCE_COLUMNS}
          rows={balanceRows}
          rowKey={(row) => row.driverId}
          selectedKey={selectedDriverId}
          onSelect={(row) => setSelectedDriverId(row.driverId)}
        />
      ) : null}

      {selectedDriverId === null || view === null ? null : (
        <>
          <MetricCard label="Đã ghi nhận" value={view.balance.creditedLabel} />
          <MetricCard label="Đã chi" value={view.balance.cashedOutLabel} />
          <MetricCard label="Còn lại" value={view.balance.remainingLabel} />
          <MetricCard
            label="Hoàn ứng công ty còn nợ"
            value={view.balance.reimbursementLabel}
            hint="Không phải lương — là tiền lái xe đã bỏ túi, chờ nhận lại."
          />

          {view.unsettled.length > 0 ? (
            <DataTable<UnsettledWageRow>
              caption={`Kỳ đã qua cửa sổ quyết toán ${view.windowLabel} mà tiền chưa chi`}
              columns={UNSETTLED_COLUMNS}
              rows={view.unsettled}
              rowKey={(row) => row.periodId}
            />
          ) : null}

          <DataTable<WageMonthRow>
            caption="Nguồn gốc theo tháng"
            columns={MONTH_COLUMNS}
            rows={view.months}
            rowKey={(row) => row.periodId}
          />

          <CashoutForm
            driverId={selectedDriverId}
            months={view.months}
            canCashout={canPerform(navigation, 'transport.driver_settlement.cashout')}
            reimbursementOutstanding={statement.data?.balance.reimbursementOutstanding ?? 0}
            onDone={refresh}
          />

          <CashoutHistory
            rows={view.cashouts}
            canReverse={canPerform(navigation, 'transport.driver_settlement.reverse')}
            onDone={refresh}
          />
        </>
      )}

      {statement.isLoading ? <LoadingState label="Đang đọc bảng quyết toán" /> : null}
      {statement.errorMessage ? <ErrorState message={statement.errorMessage} /> : null}
    </>
  );
}

const BALANCE_COLUMNS = [
  {
    key: 'driver',
    header: 'Lái xe',
    isRowHeader: true,
    render: (row: SettlementBalanceRow) => row.driverLabel,
  },
  {
    key: 'credited',
    header: 'Đã ghi nhận',
    isNumeric: true,
    render: (row: SettlementBalanceRow) => row.creditedLabel,
  },
  {
    key: 'cashedOut',
    header: 'Đã chi',
    isNumeric: true,
    render: (row: SettlementBalanceRow) => row.cashedOutLabel,
  },
  {
    key: 'remaining',
    header: 'Còn lại',
    isNumeric: true,
    render: (row: SettlementBalanceRow) => row.remainingLabel,
  },
  {
    key: 'reimbursement',
    header: 'Hoàn ứng',
    isNumeric: true,
    render: (row: SettlementBalanceRow) =>
      row.owesReimbursement ? (
        <StatusBadge label={row.reimbursementLabel} tone="wait" title="Công ty còn nợ lái xe" />
      ) : (
        row.reimbursementLabel
      ),
  },
];

const MONTH_COLUMNS = [
  { key: 'label', header: 'Kỳ', isRowHeader: true, render: (row: WageMonthRow) => row.label },
  { key: 'range', header: 'Khoảng ngày', render: (row: WageMonthRow) => row.rangeLabel },
  {
    key: 'credited',
    header: 'Đã ghi nhận',
    isNumeric: true,
    render: (row: WageMonthRow) => row.creditedLabel,
  },
  {
    key: 'cashedOut',
    header: 'Đã chi',
    isNumeric: true,
    render: (row: WageMonthRow) => row.cashedOutLabel,
  },
  {
    key: 'remaining',
    header: 'Còn lại',
    isNumeric: true,
    render: (row: WageMonthRow) => row.remainingLabel,
  },
  { key: 'payslips', header: 'Phiếu', render: (row: WageMonthRow) => row.payslipCountLabel },
];

const UNSETTLED_COLUMNS = [
  { key: 'label', header: 'Kỳ', isRowHeader: true, render: (row: UnsettledWageRow) => row.label },
  {
    key: 'remaining',
    header: 'Còn lại',
    isNumeric: true,
    render: (row: UnsettledWageRow) => row.remainingLabel,
  },
  { key: 'age', header: 'Tuổi', render: (row: UnsettledWageRow) => row.ageLabel },
];

/**
 * BIEU MAU CHI — chon nhung thang con du, cong mot o hoan ung tuy chon.
 *
 * So tien cua moi dong la `remaining` cua CHINH phieu do, doc thang tu may chu. Man hinh khong
 * chia, khong lam tron, khong doc nguoc mot chuoi da dinh dang — xem `toWageLines`.
 */
function CashoutForm({
  driverId,
  months,
  canCashout,
  reimbursementOutstanding,
  onDone,
}: {
  readonly driverId: string;
  readonly months: readonly WageMonthRow[];
  readonly canCashout: boolean;
  readonly reimbursementOutstanding: number;
  readonly onDone: () => void;
}) {
  const drawable = months.filter((month) => month.isDrawable);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [includeReimbursement, setIncludeReimbursement] = useState(false);
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [failure, setFailure] = useState<string | null>(null);

  const record = useMutation({
    mutationFn: () =>
      transportApi.driverSettlement.recordCashout({
        driverId,
        method,
        lines: [
          ...drawable
            .filter((month) => selected.includes(month.periodId))
            .flatMap((month) => toWageLines(month)),
          ...(includeReimbursement && reimbursementOutstanding > 0
            ? [
                {
                  source: 'REIMBURSEMENT' as const,
                  amount: reimbursementOutstanding,
                  payslipId: null,
                },
              ]
            : []),
        ],
      }),
    onSuccess: () => {
      setSelected([]);
      setIncludeReimbursement(false);
      setFailure(null);
      onDone();
    },
    onError: (error: Error) => setFailure(error.message),
  });

  if (!canCashout) return null;
  if (drawable.length === 0 && reimbursementOutstanding === 0) {
    return <EmptyState title="Không còn khoản nào để chi." />;
  }

  const toggle = (periodId: string) =>
    setSelected((current) =>
      current.includes(periodId) ? current.filter((id) => id !== periodId) : [...current, periodId],
    );

  return (
    <form
      className="tx-form"
      onSubmit={(event) => {
        event.preventDefault();
        record.mutate();
      }}
    >
      <h3>Ghi một lần chi</h3>
      {drawable.map((month) => (
        <label key={month.periodId} className="tx-field">
          <input
            type="checkbox"
            checked={selected.includes(month.periodId)}
            onChange={() => toggle(month.periodId)}
          />
          <span>
            {month.label} — còn {month.remainingLabel}
          </span>
        </label>
      ))}
      {reimbursementOutstanding > 0 ? (
        <label className="tx-field">
          <input
            type="checkbox"
            checked={includeReimbursement}
            onChange={() => setIncludeReimbursement((current) => !current)}
          />
          <span>Hoàn ứng (không phải lương)</span>
        </label>
      ) : null}
      <label className="tx-field">
        <span>Hình thức chi</span>
        <select value={method} onChange={(event) => setMethod(event.target.value)}>
          <option value="BANK_TRANSFER">Chuyển khoản</option>
          <option value="CASH">Tiền mặt</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={record.isPending || (selected.length === 0 && !includeReimbursement)}
      >
        Ghi lần chi
      </button>
      {failure ? <ErrorState message={failure} /> : null}
    </form>
  );
}

function CashoutHistory({
  rows,
  canReverse,
  onDone,
}: {
  readonly rows: readonly CashoutRow[];
  readonly canReverse: boolean;
  readonly onDone: () => void;
}) {
  const [pending, setPending] = useState<CashoutRow | null>(null);
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const reverse = useMutation({
    mutationFn: (input: { readonly id: string; readonly reason: string }) =>
      transportApi.driverSettlement.reverseCashout(input.id, input.reason),
    onSuccess: () => {
      setPending(null);
      setReason('');
      setFailure(null);
      onDone();
    },
    onError: (error: Error) => setFailure(error.message),
  });

  if (rows.length === 0) return <EmptyState title="Chưa có lần chi nào." />;

  return (
    <section>
      <h3>Các lần chi</h3>
      {failure ? <ErrorState message={failure} /> : null}
      {rows.map((row) => (
        <article key={row.id} className="tx-card">
          <header>
            <strong>{row.businessDateLabel}</strong> · {row.methodLabel} · {row.totalLabel}{' '}
            <StatusBadge
              label={row.statusLabel}
              tone={row.isReversal || row.isReversed ? 'stop' : 'done'}
            />
          </header>
          <ul>
            {row.allocations.map((allocation) => (
              <li key={allocation.id}>
                {allocation.sourceLabel}: {allocation.amountLabel}
                {allocation.isReimbursement ? null : ` · phiếu ${allocation.payslipLabel}`}
              </li>
            ))}
          </ul>
          {row.canReverse && canReverse ? (
            <button type="button" onClick={() => setPending(row)}>
              Đảo lần chi
            </button>
          ) : null}
        </article>
      ))}

      <ConfirmAction
        open={pending !== null}
        title="Đảo một lần chi đã ghi"
        detail="Bản gốc giữ nguyên mọi con số; hệ thống ghi thêm một phiếu đảo mang các dòng âm."
        confirmLabel="Xác nhận đảo"
        reasonLabel="Lý do đảo"
        reason={reason}
        onReasonChange={setReason}
        isDestructive
        isBusy={reverse.isPending}
        onConfirm={() => {
          if (pending) reverse.mutate({ id: pending.id, reason });
        }}
        onCancel={() => {
          setPending(null);
          setReason('');
        }}
      />
    </section>
  );
}
