'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DataTable, StatusBadge } from '../components/primitives';
import { ConfirmAction, EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useFuelEntryDetail,
  useFuelSuppliers,
  useNavigationInput,
  useTripFuelEntries,
} from '../hooks/useTransportWorkspace';
import { useRevealOnOpen } from '../hooks/useRevealOnOpen';
import { evidenceUrls, transportApi } from '../transport-api';
import { toFuelEntryRows, type FuelEntryRow } from '../workspace/fuel';

/**
 * VONG DOI PHIEU DO DAU tren be mat VAN HANH / KE TOAN.
 *
 * ==============================================================================================
 * VI SAO MAN NAY NAM O CHUYEN, KHONG NAM O MUC NHIEN LIEU
 *
 * API chi co MOT duong doc phieu: `GET /transport/fuel/trips/:tripId/entries`. Khong co duong doc
 * phieu cua ca doi. Nen mot bang "tat ca phieu" o muc Nhien lieu se phai tu ghep bang N loi goi
 * theo tung chuyen — tuc man hinh tu bia ra mot phep truy van ma may chu khong ho tro, va no se
 * cham dan theo so chuyen. Cho dung cua danh sach nay la trong CHUYEN, canh chi phi cua chinh no.
 *
 * ==============================================================================================
 * HAI DUONG DOC, VA LY DO CAN CA HAI
 *
 * `tripEntries` tra `FuelEntry[]` KHONG kem anh. `entry(id)` tra `{ entry, evidence[] }`. Ke toan
 * phai NHIN duoc anh phieu truoc khi bam xac thuc — mot nut "xac thuc" ma khong co cach xem chung
 * tu la mot nut de bam bua. Nen chon mot dong se doc chi tiet cua dong do.
 *
 * ==============================================================================================
 * `INV-09` — DUONG CUA LAI XE VA DUONG CUA KE TOAN LA HAI DUONG KHAC NHAU
 *
 * Man nay dung `transportApi.fuel.*` (`/transport/fuel/...`) — duong cua NGUOI VAN HANH, co
 * `:entryId` trong dia chi va duoc gac bang `transport.fuel.entry.verify`. Be mat lai xe dung
 * `transportApi.me.*` (`/transport/me/...`), khong bao gio nhan mot dinh danh nao cua nguoi khac.
 * Hai duong nay KHONG duoc gop lai cho gon: cai giu `INV-09` la CAU TRUC dia chi, khong phai mot
 * cau lenh loc o giua.
 */
export function TripFuelEntries({
  tripId,
  onChanged,
}: {
  readonly tripId: string;
  readonly onChanged: () => void;
}) {
  const navigation = useNavigationInput();
  const queryClient = useQueryClient();
  const entries = toSectionQuery(useTripFuelEntries(navigation, tripId));
  const suppliers = toSectionQuery(useFuelSuppliers(navigation));

  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<FuelEntryAction | null>(null);
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['transport', 'fuel'] });
    onChanged();
  };

  const mutation = useMutation({
    mutationFn: async (action: FuelEntryAction) => {
      if (action.id === 'verify') return transportApi.fuel.verifyEntry(action.entryId);
      if (action.id === 'resubmit') return transportApi.fuel.resubmitEntry(action.entryId);
      const note = reason.trim();
      // Chan o day thay vi de may chu tra 400: ly do tu choi la thu DUY NHAT noi cho lai xe biet
      // phai sua cai gi, nen mot lan tu choi khong ly do la mot ngo cut co ve hop le.
      if (note.length === 0) throw new Error('Từ chối phiếu thì phải ghi rõ lý do.');
      return transportApi.fuel.rejectEntry(action.entryId, note);
    },
    onSuccess: () => {
      setPending(null);
      setReason('');
      setFailure(null);
      refresh();
    },
    onError: (error: Error) => setFailure(error.message),
  });

  if (entries.isLoading) return <LoadingState label="Đang đọc phiếu đổ dầu…" />;
  if (entries.errorMessage !== null) {
    return <ErrorState message={entries.errorMessage} onRetry={entries.refetch} />;
  }

  const rows = toFuelEntryRows(entries.data ?? [], suppliers.data ?? [], navigation);
  if (rows.length === 0) {
    return <EmptyState title="Chưa có phiếu đổ dầu nào cho chuyến này." />;
  }

  return (
    <>
      {failure === null ? null : <ErrorState message={failure} />}

      <DataTable<FuelEntryRow>
        caption="Phiếu đổ dầu của chuyến"
        rows={rows}
        rowKey={(row) => row.id}
        selectedKey={openId}
        onSelect={(row) => setOpenId(row.id === openId ? null : row.id)}
        onShowAll={() => setOpenId(null)}
        columns={[
          {
            key: 'date',
            header: 'Ngày',
            isRowHeader: true,
            render: (row) => row.businessDateLabel,
          },
          { key: 'supplier', header: 'Cây xăng', render: (row) => row.supplierLabel },
          { key: 'liters', header: 'Số lít', render: (row) => row.litersLabel },
          { key: 'amount', header: 'Số tiền', render: (row) => row.amountLabel },
          { key: 'odometer', header: 'Km', render: (row) => row.odometerLabel },
          { key: 'payment', header: 'Thanh toán', render: (row) => row.paymentLabel },
          {
            key: 'verification',
            header: 'Xác thực',
            render: (row) => (
              <StatusBadge label={row.verificationLabel} tone={row.verificationTone} />
            ),
          },
          {
            key: 'reconciliation',
            header: 'Đối soát',
            render: (row) => (
              <StatusBadge label={row.reconciliationLabel} tone={row.reconciliationTone} />
            ),
          },
        ]}
      />

      {openId === null ? null : (
        <FuelEntryDetailPanel
          key={openId}
          row={rows.find((row) => row.id === openId) ?? null}
          onAct={(action) => {
            setReason('');
            setFailure(null);
            setPending(action);
          }}
        />
      )}

      <ConfirmAction
        open={pending !== null}
        title={pending === null ? '' : CONFIRM_TITLE[pending.id]}
        detail={pending?.detail ?? undefined}
        confirmLabel={pending === null ? 'Xác nhận' : CONFIRM_LABEL[pending.id]}
        reasonLabel={pending?.id === 'reject' ? 'Lý do từ chối' : undefined}
        reason={reason}
        onReasonChange={setReason}
        isDestructive={pending?.id === 'reject'}
        isBusy={mutation.isPending}
        onConfirm={() => {
          if (pending !== null) mutation.mutate(pending);
        }}
        onCancel={() => {
          setPending(null);
          setReason('');
        }}
      />
    </>
  );
}

interface FuelEntryAction {
  readonly id: 'verify' | 'reject' | 'resubmit';
  readonly entryId: string;
  readonly detail: string | null;
}

const CONFIRM_TITLE: Record<FuelEntryAction['id'], string> = {
  verify: 'Xác thực phiếu đổ dầu?',
  reject: 'Từ chối phiếu đổ dầu?',
  resubmit: 'Cho nộp lại phiếu này?',
};

const CONFIRM_LABEL: Record<FuelEntryAction['id'], string> = {
  verify: 'Xác thực',
  reject: 'Từ chối',
  resubmit: 'Cho nộp lại',
};

/**
 * CHI TIET MOT PHIEU — anh chung tu, ly do soat xet, va cac thao tac con lam duoc.
 *
 * Anh duoc ve bang `<img>` tro thang vao duong doc byte cua may chu. Khong dung `fetch` roi tao
 * `blob:` — the anh gui kem cookie phien khi cung goc, nen duong tren la duong DON GIAN NHAT ma
 * van di qua dung phep gac cua may chu.
 */
function FuelEntryDetailPanel({
  row,
  onAct,
}: {
  readonly row: FuelEntryRow | null;
  readonly onAct: (action: FuelEntryAction) => void;
}) {
  const reveal = useRevealOnOpen<HTMLElement>(row?.id ?? null);
  const navigation = useNavigationInput();
  const detail = toSectionQuery(useFuelEntryDetail(navigation, row?.id ?? null));

  if (row === null) return null;

  const evidence = detail.data?.evidence ?? [];

  return (
    <section
      className="tx-detail"
      aria-label={`Phiếu đổ dầu ngày ${row.businessDateLabel}`}
      ref={reveal}
    >
      <h4>
        {row.supplierLabel} · {row.businessDateLabel}
      </h4>

      <dl className="tx-detail__grid">
        <div>
          <dt>Số lít</dt>
          <dd>{row.litersLabel}</dd>
        </div>
        <div>
          <dt>Số tiền</dt>
          <dd>{row.amountLabel}</dd>
        </div>
        <div>
          {/*
            `#313`: con so nay la TIEU HAO THUC TE may chu chup luc khai (`consumptionUnits`), khong
            phai dinh muc cua hang xe. Goi no la "Dinh muc" lam nguoi doc so sanh mot con so voi
            chinh no.
          */}
          <dt>Tiêu hao lúc khai</dt>
          <dd>{row.consumptionLabel}</dd>
        </div>
        <div>
          <dt>Số hoá đơn</dt>
          <dd>{row.invoiceNo ?? 'Không có'}</dd>
        </div>
      </dl>

      {row.rejectedNote === null ? null : (
        <p className="tx-note tx-note--warn">{row.rejectedNote}</p>
      )}

      {row.reviewReasons.length === 0 ? null : (
        <ul className="tx-detail__reasons">
          {row.reviewReasons.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      )}

      <div className="tx-evidence">
        <h5>Ảnh chứng từ</h5>
        {detail.isLoading ? <LoadingState label="Đang đọc ảnh chứng từ…" /> : null}
        {detail.errorMessage === null ? null : (
          <ErrorState message={detail.errorMessage} onRetry={detail.refetch} />
        )}
        {!detail.isLoading && detail.errorMessage === null && evidence.length === 0 ? (
          <p className="tx-note">Phiếu này chưa có ảnh chứng từ.</p>
        ) : null}
        {evidence.map((file) => {
          const href = evidenceUrls.fuelEntry(row.id, file.id);
          return file.contentType?.startsWith('image/') === true ? (
            <a key={file.id} href={href} target="_blank" rel="noreferrer">
              <img src={href} alt={`Ảnh chứng từ phiếu ngày ${row.businessDateLabel}`} />
            </a>
          ) : (
            <a key={file.id} href={href} target="_blank" rel="noreferrer">
              Mở chứng từ
            </a>
          );
        })}
      </div>

      <div className="tx-detail__actions">
        {row.canVerify ? (
          <button
            type="button"
            className="tx-btn"
            onClick={() =>
              onAct({
                id: 'verify',
                entryId: row.id,
                detail: row.verifyConsequence,
              })
            }
          >
            Xác thực
          </button>
        ) : null}
        {row.canReject ? (
          <button
            type="button"
            className="tx-btn tx-btn--stop"
            onClick={() =>
              onAct({
                id: 'reject',
                entryId: row.id,
                detail: 'Lái xe đọc được lý do này và nộp lại phiếu theo đó.',
              })
            }
          >
            Từ chối
          </button>
        ) : null}
        {row.canResubmit ? (
          <button
            type="button"
            className="tx-btn"
            onClick={() =>
              onAct({
                id: 'resubmit',
                entryId: row.id,
                detail: 'Phiếu quay lại trạng thái chờ xác thực.',
              })
            }
          >
            Cho nộp lại
          </button>
        ) : null}
        {row.amendBlockedReason === null ? null : (
          <p className="tx-note">{row.amendBlockedReason}</p>
        )}
      </div>
    </section>
  );
}
