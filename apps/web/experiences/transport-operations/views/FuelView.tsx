'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PermissionGate } from '../components/PermissionGate';
import { DataTable, MetricCard, PageHeader, StatusBadge } from '../components/primitives';
import { ConfirmAction, EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useFuelSuppliers,
  useNavigationInput,
  useReconciliation,
  useReconciliations,
} from '../hooks/useTransportWorkspace';
import { useRevealOnOpen } from '../hooks/useRevealOnOpen';
import { canPerform, hasOperationsScope, operationsEmptyMessage } from '../transport-actions';
import { transportApi } from '../transport-api';
import {
  FuelConsumptionDrilldown,
  FuelConsumptionPicker,
  type ConsumptionFocus,
} from './FuelConsumptionDrilldown';
import { FuelDocumentQueue } from './FuelDocumentQueue';
import { FuelInbox } from './FuelInbox';
import { StatementImport } from './StatementImport';
import type { FuelDiscrepancyResolution, RevisableFuelResolution } from '../transport-types';
import {
  DECISION_REVISION_NOTICE,
  MATCHING_REQUIRES_REFETCH,
  toReconciliationRows,
  toReconciliationWorkspace,
  type DiscrepancyRow,
  type ReconciliationRow,
  type StatementLineRow,
} from '../workspace/fuel';

/**
 * Man NHIEN LIEU.
 *
 * Trung tam cua man nay la BAN DOI SOAT, khong phai danh sach phieu — vi API khong co duong doc
 * phieu cua ca doi (chi theo tung chuyen), va vi cong viec that cuoi thang la doi soat bang ke.
 *
 * Hai dieu duoc noi that ngay tren man hinh:
 *   · danh sach ky KHONG kem so chenh lech con treo (API khong tra), nen cot do de trong co chu dich;
 *   · chay so khop KHONG tra ve trang thai moi cua ky, nen ban lam viec duoc DOC LAI sau khi chay.
 */
export function FuelView() {
  const navigation = useNavigationInput();
  const queryClient = useQueryClient();
  const suppliers = toSectionQuery(useFuelSuppliers(navigation));
  const reconciliations = toSectionQuery(useReconciliations(navigation));
  const [openId, setOpenId] = useState<string | null>(null);
  const [consumptionFocus, setConsumptionFocus] = useState<ConsumptionFocus | null>(null);

  if (!hasOperationsScope(navigation)) {
    return (
      <>
        <PageHeader title="Nhiên liệu" />
        <ErrorState message={operationsEmptyMessage(navigation)} />
      </>
    );
  }

  const rows = toReconciliationRows(reconciliations.data ?? [], suppliers.data ?? []);
  /**
   * `#395` — KY DOI SOAT la phan phu (`transport.fuel.reconciliation.read`): nguoi chi duoc xem va
   * duyet phieu thay mot cau, khong thay "Chưa có kỳ đối soát nào." (mot cau sai) hay "0 kỳ".
   */
  const canReadReconciliations = canPerform(navigation, 'transport.fuel.reconciliation.read');

  return (
    <>
      <PageHeader
        title="Nhiên liệu"
        summary="Phiếu đổ dầu, xác thực phiếu, nhập bảng kê cây xăng và đối soát."
        context={
          canReadReconciliations ? (
            <span className="tx-count">{rows.length} kỳ đối soát</span>
          ) : undefined
        }
      />

      {/*
        HOP THU PHIEU DAT TREN CUNG — #222 P1-B.

        Thu tu tren man nay la thu tu CONG VIEC, khong phai thu tu ky thuat: xac thuc phieu la viec
        HANG NGAY, nhap bang ke va doi soat la viec CUOI THANG. Truoc ban nay khoi tren cung la
        nhap bang ke, va viec hang ngay khong co cho nao de lam ca.
      */}
      <FuelInbox onOpenConsumption={setConsumptionFocus} />

      {/*
        VIEC HANG NGAY THU HAI va THU BA (`#313`): soat chung tu may doc, va soi chuoi km khi mot
        phieu co ly do soat. Ca hai nam TRUOC bang ke/doi soat — viec cuoi thang.
      */}
      <FuelDocumentQueue />
      <FuelConsumptionPicker onOpen={setConsumptionFocus} />
      {consumptionFocus === null ? null : (
        <FuelConsumptionDrilldown
          key={`${consumptionFocus.vehicleId}|${consumptionFocus.from}|${consumptionFocus.to}`}
          focus={consumptionFocus}
          onClose={() => setConsumptionFocus(null)}
        />
      )}

      {reconciliations.errorMessage === null ? null : (
        <ErrorState message={reconciliations.errorMessage} onRetry={reconciliations.refetch} />
      )}
      {reconciliations.isLoading ? <LoadingState label="Đang đọc các kỳ đối soát…" /> : null}

      <StatementImport
        suppliers={suppliers.data ?? []}
        viewer={navigation}
        onImported={() => void queryClient.invalidateQueries({ queryKey: ['transport', 'fuel'] })}
      />

      <section aria-label="Kỳ đối soát bảng kê">
        <h2>Kỳ đối soát</h2>
        {!canReadReconciliations ? (
          <PermissionGate viewer={navigation} action="transport.fuel.reconciliation.read" />
        ) : rows.length === 0 && !reconciliations.isLoading ? (
          <EmptyState
            title="Chưa có kỳ đối soát nào."
            nextAction={
              <p className="tx-note">Kỳ đối soát được tạo khi nhập bảng kê của cây xăng.</p>
            }
          />
        ) : (
          <DataTable<ReconciliationRow>
            caption="Các kỳ đối soát bảng kê"
            rows={rows}
            rowKey={(row) => row.id}
            selectedKey={openId}
            onSelect={(row) => setOpenId(row.id)}
            onShowAll={() => setOpenId(null)}
            columns={[
              {
                key: 'supplier',
                header: 'Cây xăng',
                isRowHeader: true,
                render: (row) => row.supplierLabel,
              },
              { key: 'period', header: 'Kỳ', render: (row) => row.periodLabel },
              {
                key: 'state',
                header: 'Trạng thái',
                render: (row) => <StatusBadge label={row.stateLabel} tone={row.tone} />,
              },
              { key: 'closed', header: 'Đóng lúc', render: (row) => row.closedAtLabel ?? '—' },
              {
                key: 'pending',
                header: 'Chênh lệch chờ',
                render: (row) =>
                  row.pendingCount === null ? (
                    <span title="Mở kỳ để xem">—</span>
                  ) : (
                    String(row.pendingCount)
                  ),
              },
            ]}
          />
        )}
      </section>

      {openId === null ? null : (
        <ReconciliationWorkspace
          key={openId}
          reconciliationId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => void queryClient.invalidateQueries({ queryKey: ['transport', 'fuel'] })}
        />
      )}
    </>
  );
}

function ReconciliationWorkspace({
  reconciliationId,
  onClose,
  onChanged,
}: {
  readonly reconciliationId: string;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  const reveal = useRevealOnOpen<HTMLElement>(reconciliationId);
  const navigation = useNavigationInput();
  const queryClient = useQueryClient();
  const workspace = toSectionQuery(useReconciliation(navigation, reconciliationId));

  const [pendingClose, setPendingClose] = useState<'close' | 'reopen' | null>(null);
  const [resolving, setResolving] = useState<DiscrepancyRow | null>(null);
  /** `#317` G0 — doi y ve mot quyet dinh DA GHI (them quyet dinh thay the, khong sua hang cu). */
  const [revising, setRevising] = useState<DiscrepancyRow | null>(null);
  const [revision, setRevision] = useState<RevisableFuelResolution | ''>('');
  const [revisionReason, setRevisionReason] = useState('');
  const [resolution, setResolution] = useState<FuelDiscrepancyResolution | ''>('');
  const [pairLineId, setPairLineId] = useState('');
  const [pairEntryId, setPairEntryId] = useState('');
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const refresh = () => {
    // `POST .../match` khong tra trang thai moi cua ky, nen phai DOC LAI ban lam viec.
    void queryClient.invalidateQueries({ queryKey: ['transport', 'fuel'] });
    onChanged();
  };

  const runMatching = useMutation({
    mutationFn: () => transportApi.fuel.runMatching(reconciliationId),
    onSuccess: () => {
      setFailure(null);
      refresh();
    },
    onError: (error: Error) => setFailure(error.message),
  });

  const resolveDiscrepancy = useMutation({
    mutationFn: async (row: DiscrepancyRow) => {
      if (resolution === '') throw new Error('Chưa chọn cách xử lý.');
      const option = row.options.find((entry) => entry.resolution === resolution);
      if (option?.requiresTargets === true && (pairLineId === '' || pairEntryId === '')) {
        // Chan o day thay vi de may chu tra 400 `FUEL_MATCH_TARGET_REQUIRED`.
        throw new Error('Xác nhận cặp khớp phải chỉ rõ dòng bảng kê và phiếu nào ghép với nhau.');
      }
      return transportApi.fuel.resolveDiscrepancy(row.id, {
        resolution,
        note: reason.trim().length === 0 ? null : reason.trim(),
        statementLineId: pairLineId === '' ? undefined : pairLineId,
        fuelEntryId: pairEntryId === '' ? undefined : pairEntryId,
      });
    },
    onSuccess: () => {
      setResolving(null);
      setResolution('');
      setPairLineId('');
      setPairEntryId('');
      setReason('');
      setFailure(null);
      refresh();
    },
    onError: (error: Error) => setFailure(error.message),
  });

  const reviseDecision = useMutation({
    mutationFn: async (row: DiscrepancyRow) => {
      if (revision === '') throw new Error('Chưa chọn quyết định mới.');
      // May chu tu choi ly do rong (400); noi truoc thay vi de nguoi dung bam roi doc loi.
      if (revisionReason.trim() === '') throw new Error('Đổi quyết định phải ghi lý do.');
      return transportApi.fuel.reviseDiscrepancy(row.id, {
        resolution: revision,
        reason: revisionReason.trim(),
      });
    },
    onSuccess: () => {
      setRevising(null);
      setRevision('');
      setRevisionReason('');
      setFailure(null);
      refresh();
    },
    onError: (error: Error) => setFailure(error.message),
  });

  const movePeriod = useMutation({
    mutationFn: async (intent: 'close' | 'reopen') =>
      intent === 'close'
        ? transportApi.fuel.closeReconciliation(reconciliationId)
        : transportApi.fuel.reopenReconciliation(reconciliationId, reason),
    onSuccess: () => {
      setPendingClose(null);
      setReason('');
      setFailure(null);
      refresh();
    },
    onError: (error: Error) => setFailure(error.message),
  });

  if (workspace.data === undefined) {
    return (
      <section className="tx-detail" aria-label="Bàn đối soát" ref={reveal}>
        {workspace.isLoading ? (
          <LoadingState label="Đang đọc bàn đối soát…" />
        ) : workspace.errorMessage !== null ? (
          <ErrorState message={workspace.errorMessage} onRetry={workspace.refetch} />
        ) : (
          <EmptyState title="Không đọc được kỳ đối soát này." />
        )}
      </section>
    );
  }

  const model = toReconciliationWorkspace(workspace.data, navigation);
  const needsPair =
    resolving?.options.find((option) => option.resolution === resolution)?.requiresTargets === true;

  return (
    <section className="tx-detail" aria-label={`Bàn đối soát ${model.periodLabel}`} ref={reveal}>
      <header className="tx-detail__head">
        <div>
          <h2>Đối soát {model.periodLabel}</h2>
          <p>
            {model.statementFilename} · <StatusBadge label={model.stateLabel} tone={model.tone} />
          </p>
        </div>
        <div className="tx-detail__actions">
          {model.canRunMatching ? (
            <button
              type="button"
              className="tx-btn tx-btn--go"
              disabled={runMatching.isPending}
              onClick={() => runMatching.mutate()}
            >
              {runMatching.isPending ? 'Đang so khớp…' : 'Chạy so khớp'}
            </button>
          ) : null}
          {model.canClose ? (
            <button type="button" className="tx-btn" onClick={() => setPendingClose('close')}>
              Đóng kỳ
            </button>
          ) : null}
          {model.canReopen ? (
            <button
              type="button"
              className="tx-btn tx-btn--stop"
              onClick={() => {
                setReason('');
                setPendingClose('reopen');
              }}
            >
              Mở lại kỳ
            </button>
          ) : null}
          <button type="button" className="tx-btn tx-btn--ghost" onClick={onClose}>
            Đóng
          </button>
        </div>
      </header>

      {failure === null ? null : <ErrorState message={failure} />}
      {model.closeBlockedReason === null ? null : (
        <p className="tx-detail__blocked" role="status">
          {model.closeBlockedReason}
        </p>
      )}
      {model.handoffSummary === null ? null : (
        <p className="tx-note" role="status">
          {model.handoffSummary}
        </p>
      )}
      <p className="tx-note">{MATCHING_REQUIRES_REFETCH}</p>

      <section className="tx-cards" aria-label="Số liệu đối soát">
        <MetricCard label="Đã khớp" value={model.matchedCountLabel} />
        <MetricCard label="Chênh lệch chờ xử lý" value={model.pendingCountLabel} />
        <MetricCard label="Dòng bảng kê" value={String(model.lineRows.length)} />
      </section>

      <h3>Chênh lệch</h3>
      {model.discrepancyRows.length === 0 ? (
        <EmptyState title="Không còn chênh lệch nào trong kỳ này." />
      ) : (
        <DataTable<DiscrepancyRow>
          caption="Chênh lệch của kỳ đối soát"
          rows={model.discrepancyRows}
          rowKey={(row) => row.id}
          columns={[
            { key: 'kind', header: 'Loại', isRowHeader: true, render: (row) => row.kindLabel },
            {
              key: 'status',
              header: 'Trạng thái',
              render: (row) =>
                row.isPending ? (
                  <StatusBadge label="Chờ xử lý" tone="wait" />
                ) : row.isSuperseded ? (
                  <StatusBadge
                    label={`${row.resolutionLabel ?? 'Đã xử lý'} · đã thay bằng quyết định mới`}
                    tone="flat"
                  />
                ) : (
                  <StatusBadge label={row.resolutionLabel ?? 'Đã xử lý'} tone="done" />
                ),
            },
            { key: 'note', header: 'Ghi chú', render: (row) => row.resolutionNote ?? '—' },
            {
              key: 'act',
              header: '',
              render: (row) =>
                row.canResolve ? (
                  <button
                    type="button"
                    className="tx-btn tx-btn--small"
                    onClick={() => {
                      setFailure(null);
                      setRevising(null);
                      setResolution('');
                      setPairLineId(row.statementLineId ?? '');
                      setPairEntryId(row.fuelEntryId ?? '');
                      setReason('');
                      setResolving(row);
                    }}
                  >
                    Xử lý
                  </button>
                ) : row.canRevise ? (
                  <button
                    type="button"
                    className="tx-btn tx-btn--small"
                    onClick={() => {
                      setFailure(null);
                      setResolving(null);
                      setRevision('');
                      setRevisionReason('');
                      setRevising(row);
                    }}
                  >
                    Đổi quyết định
                  </button>
                ) : null,
            },
          ]}
        />
      )}

      {revising === null ? null : (
        <form
          className="tx-panel tx-panel--form"
          aria-label={`Đổi quyết định: ${revising.kindLabel}`}
          onSubmit={(event) => {
            event.preventDefault();
            reviseDecision.mutate(revising);
          }}
        >
          <h3>Đổi quyết định — {revising.kindLabel}</h3>
          <p className="tx-note">
            Quyết định đang có: {revising.resolutionLabel ?? '—'}
            {revising.resolutionNote === null ? null : ` (${revising.resolutionNote})`}
          </p>
          <p className="tx-note" role="note">
            {DECISION_REVISION_NOTICE}
          </p>
          <label className="tx-field">
            <span>Quyết định mới</span>
            <select
              aria-label="Quyết định mới"
              required
              value={revision}
              onChange={(event) => setRevision(event.target.value as RevisableFuelResolution | '')}
            >
              <option value="">Chọn quyết định mới</option>
              {revising.reviseOptions.map((option) => (
                <option key={option.resolution} value={option.resolution}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="tx-field">
            <span>Lý do đổi quyết định</span>
            <input
              aria-label="Lý do đổi quyết định"
              required
              value={revisionReason}
              onChange={(event) => setRevisionReason(event.target.value)}
            />
          </label>
          <div className="tx-confirm__actions">
            <button type="button" className="tx-btn" onClick={() => setRevising(null)}>
              Quay lại
            </button>
            <button type="submit" className="tx-btn tx-btn--go" disabled={reviseDecision.isPending}>
              {reviseDecision.isPending ? 'Đang gửi…' : 'Ghi quyết định mới'}
            </button>
          </div>
        </form>
      )}

      {resolving === null ? null : (
        <form
          className="tx-panel tx-panel--form"
          aria-label={`Xử lý chênh lệch: ${resolving.kindLabel}`}
          onSubmit={(event) => {
            event.preventDefault();
            resolveDiscrepancy.mutate(resolving);
          }}
        >
          <h3>Xử lý chênh lệch — {resolving.kindLabel}</h3>
          <label className="tx-field">
            <span>Cách xử lý</span>
            <select
              aria-label="Cách xử lý"
              required
              value={resolution}
              onChange={(event) =>
                setResolution(event.target.value as FuelDiscrepancyResolution | '')
              }
            >
              <option value="">Chọn cách xử lý</option>
              {resolving.options.map((option) => (
                <option key={option.resolution} value={option.resolution}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {needsPair ? (
            <div className="tx-inlineform">
              <label className="tx-field">
                <span>Dòng bảng kê</span>
                <select
                  aria-label="Dòng bảng kê"
                  required
                  value={pairLineId}
                  onChange={(event) => setPairLineId(event.target.value)}
                >
                  <option value="">Chọn dòng</option>
                  {resolving.candidateLineIds.map((id) => (
                    <option key={id} value={id}>
                      {model.lineRows.find((line) => line.id === id)?.plateRaw ?? id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="tx-field">
                <span>Phiếu đổ dầu</span>
                <select
                  aria-label="Phiếu đổ dầu"
                  required
                  value={pairEntryId}
                  onChange={(event) => setPairEntryId(event.target.value)}
                >
                  <option value="">Chọn phiếu</option>
                  {resolving.candidateEntryIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <label className="tx-field">
            <span>Ghi chú</span>
            <input value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>

          <div className="tx-confirm__actions">
            <button type="button" className="tx-btn" onClick={() => setResolving(null)}>
              Quay lại
            </button>
            <button
              type="submit"
              className="tx-btn tx-btn--go"
              disabled={resolveDiscrepancy.isPending}
            >
              {resolveDiscrepancy.isPending ? 'Đang gửi…' : 'Ghi quyết định'}
            </button>
          </div>
        </form>
      )}

      <h3>Dòng bảng kê</h3>
      <DataTable<StatementLineRow>
        caption="Các dòng của bảng kê cây xăng"
        rows={model.lineRows}
        rowKey={(row) => row.id}
        columns={[
          { key: 'row', header: 'Dòng', isRowHeader: true, render: (row) => String(row.rowNumber) },
          { key: 'plate', header: 'Biển số', render: (row) => row.plateRaw },
          { key: 'date', header: 'Ngày', render: (row) => row.businessDateLabel },
          { key: 'liters', header: 'Số lít', isNumeric: true, render: (row) => row.litersLabel },
          { key: 'amount', header: 'Số tiền', isNumeric: true, render: (row) => row.amountLabel },
          {
            key: 'status',
            header: 'Đối soát',
            render: (row) =>
              row.rejectLabel === null ? (
                <StatusBadge label={row.statusLabel} tone={row.tone} />
              ) : (
                <StatusBadge label={row.rejectLabel} tone="stop" />
              ),
          },
        ]}
      />

      <ConfirmAction
        open={pendingClose !== null}
        title={pendingClose === 'close' ? 'Đóng kỳ đối soát?' : 'Mở lại kỳ đã đóng?'}
        detail={
          pendingClose === 'close'
            ? 'Đóng kỳ phát một bàn giao công nợ sang phần quyết toán, và khoá kỳ khỏi mọi thay đổi.'
            : 'Kỳ này đã phát bàn giao công nợ ra ngoài. Mở lại là một quyết định khác hẳn về mức độ, và được ghi lại kèm lý do.'
        }
        confirmLabel={pendingClose === 'close' ? 'Đóng kỳ' : 'Mở lại kỳ'}
        reasonLabel={pendingClose === 'reopen' ? 'Lý do mở lại' : undefined}
        reason={reason}
        onReasonChange={setReason}
        isDestructive={pendingClose === 'reopen'}
        isBusy={movePeriod.isPending}
        onConfirm={() => {
          if (pendingClose !== null) movePeriod.mutate(pendingClose);
        }}
        onCancel={() => {
          setPendingClose(null);
          setReason('');
        }}
      />
    </section>
  );
}
