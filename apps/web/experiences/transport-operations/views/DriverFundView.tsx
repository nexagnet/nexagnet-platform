'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PermissionGate } from '../components/PermissionGate';
import { DataTable, MetricCard, PageHeader, StatusBadge } from '../components/primitives';
import { ConfirmAction, EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useDrivers,
  useFundPeriods,
  useFundStatement,
  useNavigationInput,
} from '../hooks/useTransportWorkspace';
import { canPerform, hasOperationsScope, operationsEmptyMessage } from '../transport-actions';
import { newCorrelationKey, transportApi } from '../transport-api';
import {
  fundActionOffers,
  RECONCILIATION_NOTE,
  toFundBalance,
  toFundLedgerRows,
  toFundPeriodRows,
  type FundLedgerRow,
  type FundPeriodRow,
} from '../workspace/driver-fund';

/**
 * Man QUY LAI XE (ten cu: Quy lai xe / Chi phi — #341 bo chu `Chi phí` dung mot minh).
 *
 * KHONG dua lai xe len dia chi. Hai ly do, va ly do thu hai la quyet dinh: `Driver` khong co ma
 * nghiep vu nao (chi co `id` ky thuat va so dien thoai), va so dien thoai la DU LIEU CA NHAN —
 * khong duoc dat vao tham so dia chi. Nen nguoi dang xem la trang thai CUC BO.
 *
 * Cau `RECONCILIATION_NOTE` la bat buoc: so du quy va gia thanh chuyen doi soat duoc voi nhau
 * nhung khong bao gio cong vao mot tong (hop dong mien §9.2).
 */
type MovementKind = 'advance' | 'return' | 'adjust';

interface MovementDraft {
  readonly kind: MovementKind;
  /**
   * Lai xe duoc GHIM vao ban nhap luc mo phieu, KHONG doc lai luc gui.
   *
   * Doc lai luc gui la mot loi an tien: o chon lai xe van bam duoc khi phieu dang mo, nen doi nguoi
   * xem roi bam ghi se dat khoan tam ung sang MOT NGUOI KHAC — thanh cong, im lang, va khong co 409
   * nao chan lai vi khoa tuong quan la khoa moi. Ghim tai day, va in ten len dau phieu de neu o
   * chon co doi thi phieu van noi ro nó thuoc ve ai.
   */
  readonly driverId: string;
  readonly driverName: string;
  readonly amount: string;
  readonly note: string;
  /** Sinh MOT lan cho mot lan bam, giu qua cac lan thu lai — co che chan trung duy nhat cua API. */
  readonly correlationKey: string;
}

const MOVEMENT_TITLE: Readonly<Record<MovementKind, string>> = {
  advance: 'Tạm ứng cho lái xe',
  return: 'Hoàn quỹ từ lái xe',
  adjust: 'Điều chỉnh sổ quỹ',
};

export function DriverFundView() {
  const navigation = useNavigationInput();
  const queryClient = useQueryClient();
  const drivers = toSectionQuery(useDrivers(navigation));
  const [driverId, setDriverId] = useState<string | null>(null);

  const activeDriverId = driverId ?? drivers.data?.[0]?.id ?? null;
  const activeDriverName =
    (drivers.data ?? []).find((driver) => driver.id === activeDriverId)?.fullName ??
    'lái xe chưa đọc được tên';
  const statement = toSectionQuery(useFundStatement(navigation, activeDriverId));
  const periods = toSectionQuery(useFundPeriods(navigation, activeDriverId));

  const [movement, setMovement] = useState<MovementDraft | null>(null);
  const [pendingReversal, setPendingReversal] = useState<FundLedgerRow | null>(null);
  const [pendingPeriod, setPendingPeriod] = useState<{
    readonly row: FundPeriodRow;
    readonly intent: 'close' | 'reopen';
  } | null>(null);
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['transport', 'costing'] });
  };

  const postMovement = useMutation({
    mutationFn: async (draft: MovementDraft) => {
      const amount = Number(draft.amount.replace(/[\s.]/g, ''));
      if (!Number.isInteger(amount)) throw new Error('Số tiền phải là số nguyên đồng.');
      const base = {
        // Lai xe cua CHINH BAN NHAP nay — xem ghi chu o `MovementDraft`.
        driverId: draft.driverId,
        note: draft.note.trim().length === 0 ? null : draft.note.trim(),
        correlationKey: draft.correlationKey,
      };
      if (draft.kind === 'adjust') {
        if (amount === 0) throw new Error('Điều chỉnh 0 đồng không nói gì.');
        return transportApi.costing.adjust({ ...base, signedAmount: amount });
      }
      if (amount <= 0) throw new Error('Số tiền phải lớn hơn 0.');
      return draft.kind === 'advance'
        ? transportApi.costing.advance({ ...base, amount })
        : transportApi.costing.returnFund({ ...base, amount });
    },
    onSuccess: () => {
      setMovement(null);
      setFailure(null);
      refresh();
    },
    onError: (error: Error) => setFailure(error.message),
  });

  const postReversal = useMutation({
    mutationFn: async (row: FundLedgerRow) => transportApi.costing.reverseFundEntry(row.id, reason),
    onSuccess: () => {
      setPendingReversal(null);
      setReason('');
      setFailure(null);
      refresh();
    },
    onError: (error: Error) => setFailure(error.message),
  });

  const movePeriod = useMutation({
    mutationFn: async (input: {
      readonly row: FundPeriodRow;
      readonly intent: 'close' | 'reopen';
    }) =>
      input.intent === 'close'
        ? transportApi.costing.closePeriod(input.row.id)
        : transportApi.costing.reopenPeriod(input.row.id, reason),
    onSuccess: () => {
      setPendingPeriod(null);
      setReason('');
      setFailure(null);
      refresh();
    },
    onError: (error: Error) => setFailure(error.message),
  });

  if (!hasOperationsScope(navigation)) {
    return (
      <>
        <PageHeader title="Quỹ lái xe" />
        <ErrorState message={operationsEmptyMessage(navigation)} />
      </>
    );
  }

  const offers = fundActionOffers(navigation).filter((offer) => offer.id !== 'open-period');
  const balance = statement.data === undefined ? null : toFundBalance(statement.data);
  const ledger = toFundLedgerRows(statement.data?.entries ?? [], navigation);
  const periodRows = toFundPeriodRows(periods.data ?? [], navigation);
  const closingHint = periodRows.find((row) => row.hint !== null)?.hint ?? null;

  return (
    <>
      <PageHeader
        title="Quỹ lái xe"
        summary="Số dư quỹ từng lái xe, tạm ứng, hoàn quỹ, chi phí chuyến và kỳ quỹ."
        actions={
          <div className="tx-pagehead__btns">
            {offers.map((offer) => (
              <button
                key={offer.id}
                type="button"
                className={offer.id === 'advance' ? 'tx-btn tx-btn--go' : 'tx-btn'}
                onClick={() => {
                  setFailure(null);
                  if (activeDriverId === null) {
                    setFailure('Chưa chọn lái xe.');
                    return;
                  }
                  setMovement({
                    kind: offer.id as MovementKind,
                    driverId: activeDriverId,
                    driverName: activeDriverName,
                    amount: '',
                    note: '',
                    correlationKey: newCorrelationKey(),
                  });
                }}
              >
                {offer.label}
              </button>
            ))}
          </div>
        }
      />

      <label className="tx-field tx-field--inline">
        <span>Lái xe</span>
        {/* Khoa khi dang mo mot phieu: ban nhap da ghim lai xe cua chinh no, va de o nay bam duoc
            chi tao ra mot man hinh noi hai dieu khac nhau cung mot luc. */}
        <select
          aria-label="Lái xe"
          value={activeDriverId ?? ''}
          onChange={(event) => setDriverId(event.target.value)}
          disabled={movement !== null || drivers.data === undefined || drivers.data.length === 0}
        >
          {(drivers.data ?? []).map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.fullName}
            </option>
          ))}
        </select>
      </label>

      {failure === null ? null : <ErrorState message={failure} />}
      {statement.errorMessage === null ? null : (
        <ErrorState message={statement.errorMessage} onRetry={statement.refetch} />
      )}
      {statement.isLoading ? <LoadingState label="Đang đọc sổ quỹ…" /> : null}
      {drivers.errorMessage === null ? null : (
        <ErrorState message={drivers.errorMessage} onRetry={drivers.refetch} />
      )}
      {/*
        `#395` — CHI noi "chua co ho so" khi da DOC duoc danh sach va no rong. Danh sach bi chan
        (chua duoc cap quyen xem ho so lai xe) hoac doc loi la mot chuyen khac han, va truoc day
        man nay noi cau sai do voi nguoi co 12 lai xe trong danh muc.
      */}
      {activeDriverId === null && drivers.data !== undefined && drivers.data.length === 0 ? (
        <EmptyState title="Chưa có hồ sơ lái xe nào để xem quỹ." />
      ) : null}

      {movement === null ? null : (
        <form
          className="tx-panel tx-panel--form"
          aria-label={`${MOVEMENT_TITLE[movement.kind]} — ${movement.driverName}`}
          onSubmit={(event) => {
            event.preventDefault();
            postMovement.mutate(movement);
          }}
        >
          <h2>
            {MOVEMENT_TITLE[movement.kind]} — {movement.driverName}
          </h2>
          <p className="tx-panel__lead">
            {movement.kind === 'adjust'
              ? 'Ô này nhận số CÓ DẤU, và không nhận 0.'
              : 'Nhập số dương; hệ thống tự ghi đúng dấu theo loại bút toán.'}
          </p>
          <div className="tx-inlineform">
            <label className="tx-field">
              <span>Số tiền (đồng)</span>
              <input
                inputMode="numeric"
                autoFocus
                required
                value={movement.amount}
                onChange={(event) =>
                  setMovement((prev) =>
                    prev === null ? prev : { ...prev, amount: event.target.value },
                  )
                }
              />
            </label>
            <label className="tx-field">
              <span>Diễn giải</span>
              <input
                value={movement.note}
                onChange={(event) =>
                  setMovement((prev) =>
                    prev === null ? prev : { ...prev, note: event.target.value },
                  )
                }
              />
            </label>
          </div>
          <div className="tx-confirm__actions">
            <button
              type="button"
              className="tx-btn"
              onClick={() => {
                setMovement(null);
                setFailure(null);
              }}
            >
              Quay lại
            </button>
            <button type="submit" className="tx-btn tx-btn--go" disabled={postMovement.isPending}>
              {postMovement.isPending ? 'Đang gửi…' : 'Ghi bút toán'}
            </button>
          </div>
        </form>
      )}

      {balance === null ? null : (
        <>
          <section className="tx-cards" aria-label="Số dư quỹ">
            <MetricCard label="Số dư quỹ" value={balance.balanceLabel} hint={balance.stanceLabel} />
            <MetricCard label="Số bút toán" value={String(ledger.length)} />
          </section>
          <p className="tx-note" role="status">
            {balance.sentence}
          </p>
        </>
      )}
      <p className="tx-note">{RECONCILIATION_NOTE}</p>

      <section aria-label="Sổ quỹ lái xe">
        <h2>Sổ quỹ</h2>
        {/* Chua co lai xe nao dang xem, hoac so doc LOI: khong phai "chua co but toan" (`#395`). */}
        {activeDriverId === null || statement.errorMessage !== null ? null : ledger.length === 0 &&
          !statement.isLoading ? (
          <EmptyState title="Lái xe này chưa có bút toán quỹ nào." />
        ) : (
          <DataTable<FundLedgerRow>
            caption="Bút toán quỹ lái xe"
            rows={ledger}
            rowKey={(row) => row.id}
            columns={[
              {
                key: 'date',
                header: 'Ngày',
                isRowHeader: true,
                render: (row) => row.businessDateLabel,
              },
              { key: 'kind', header: 'Loại', render: (row) => row.kindLabel },
              {
                key: 'amount',
                header: 'Số tiền',
                isNumeric: true,
                render: (row) => (
                  <span className={row.isCredit ? 'tx-amount--in' : 'tx-amount--out'}>
                    {row.amountLabel}
                  </span>
                ),
              },
              { key: 'note', header: 'Diễn giải', render: (row) => row.note ?? '—' },
              { key: 'by', header: 'Người ghi', render: (row) => row.recordedBy },
              {
                key: 'act',
                header: '',
                render: (row) =>
                  row.isReversed ? (
                    <StatusBadge label="Đã bị đảo" tone="stop" />
                  ) : row.isReversal ? (
                    <StatusBadge label="Bút toán đảo" tone="flat" />
                  ) : row.canReverse ? (
                    <button
                      type="button"
                      className="tx-btn tx-btn--small"
                      onClick={() => {
                        setFailure(null);
                        setReason('');
                        setPendingReversal(row);
                      }}
                    >
                      Đảo
                    </button>
                  ) : null,
              },
            ]}
          />
        )}
      </section>

      <section aria-label="Kỳ quỹ">
        <h2>Kỳ quỹ</h2>
        {/* Ky quy doc bang ma KY KE TOAN (`transport.costing.period.read`) — phan phu cua man nay. */}
        {!canPerform(navigation, 'transport.costing.period.read') ? (
          <PermissionGate viewer={navigation} action="transport.costing.period.read" />
        ) : periods.errorMessage !== null ? (
          <ErrorState message={periods.errorMessage} onRetry={periods.refetch} />
        ) : periodRows.length === 0 ? (
          <EmptyState title="Chưa mở kỳ quỹ nào cho lái xe này." />
        ) : (
          <>
            <DataTable<FundPeriodRow>
              caption="Các kỳ quỹ"
              rows={periodRows}
              rowKey={(row) => row.id}
              columns={[
                { key: 'range', header: 'Kỳ', isRowHeader: true, render: (row) => row.rangeLabel },
                {
                  key: 'status',
                  header: 'Trạng thái',
                  render: (row) => (
                    <StatusBadge
                      label={row.statusLabel}
                      tone={row.tone}
                      title={row.hint ?? undefined}
                    />
                  ),
                },
                { key: 'closed', header: 'Chốt lúc', render: (row) => row.closedAtLabel ?? '—' },
                {
                  key: 'act',
                  header: '',
                  render: (row) => (
                    <span className="tx-rowbtns">
                      {row.canClose ? (
                        <button
                          type="button"
                          className="tx-btn tx-btn--small"
                          onClick={() => {
                            setFailure(null);
                            setReason('');
                            setPendingPeriod({ row, intent: 'close' });
                          }}
                        >
                          {row.status === 'CLOSING' ? 'Chốt lại' : 'Chốt kỳ'}
                        </button>
                      ) : null}
                      {row.canReopen ? (
                        <button
                          type="button"
                          className="tx-btn tx-btn--small tx-btn--stop"
                          onClick={() => {
                            setFailure(null);
                            setReason('');
                            setPendingPeriod({ row, intent: 'reopen' });
                          }}
                        >
                          Mở lại
                        </button>
                      ) : null}
                    </span>
                  ),
                },
              ]}
            />
            {closingHint === null ? null : <p className="tx-note tx-note--warn">{closingHint}</p>}
          </>
        )}
      </section>

      <ConfirmAction
        open={pendingReversal !== null}
        title="Đảo bút toán này?"
        detail="Sổ quỹ không sửa và không xoá. Đảo tạo một bút toán mới trỏ về bút toán gốc."
        confirmLabel="Đảo bút toán"
        reasonLabel="Lý do đảo"
        reason={reason}
        onReasonChange={setReason}
        isDestructive
        isBusy={postReversal.isPending}
        onConfirm={() => {
          if (pendingReversal !== null) postReversal.mutate(pendingReversal);
        }}
        onCancel={() => {
          setPendingReversal(null);
          setReason('');
        }}
      />

      <ConfirmAction
        open={pendingPeriod !== null}
        title={pendingPeriod?.intent === 'close' ? 'Chốt kỳ quỹ?' : 'Mở lại kỳ đã chốt?'}
        detail={
          pendingPeriod?.intent === 'close'
            ? 'Chốt kỳ không tạo bút toán — nó chụp một ảnh số dư. Số dư âm khi chốt là kết quả hợp lệ.'
            : 'Kỳ đã báo cáo ra ngoài. Mở lại được ghi lại kèm lý do và không bao giờ trở về trạng thái đang mở.'
        }
        confirmLabel={pendingPeriod?.intent === 'close' ? 'Chốt kỳ' : 'Mở lại kỳ'}
        reasonLabel={pendingPeriod?.intent === 'reopen' ? 'Lý do mở lại' : undefined}
        reason={reason}
        onReasonChange={setReason}
        isDestructive={pendingPeriod?.intent === 'reopen'}
        isBusy={movePeriod.isPending}
        onConfirm={() => {
          if (pendingPeriod !== null) movePeriod.mutate(pendingPeriod);
        }}
        onCancel={() => {
          setPendingPeriod(null);
          setReason('');
        }}
      />
    </>
  );
}
