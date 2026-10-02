'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PermissionGate } from '../components/PermissionGate';
import { DataTable, PageHeader, StatusBadge } from '../components/primitives';
import { ConfirmAction, EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import type { StatusTone } from '../customer-view';
import {
  TRANSPORT_QUERY_KEYS,
  toSectionQuery,
  useNavigationInput,
  useOrderCompletionQueue,
} from '../hooks/useTransportWorkspace';
import { canPerform } from '../transport-actions';
import { transportApi } from '../transport-api';
import type {
  OperationalDocumentView,
  OrderCompletionDetail,
  OrderCompletionOutcome,
  OrderCompletionRow,
  OrderCompletionState,
} from '../transport-types';
import { operationalFileContentUrl } from '../workspace/file-evidence';

/**
 * KET THUC DON — cong ma `#275` K4 doi phai co.
 *
 * ============================================================================================
 * MAN HINH NAY KHONG HOI AI MOT MA VONG CHAY
 * ============================================================================================
 *
 * `#275` K4: *"Normal boss/accounting surface should not ask them for a Run ID."* Vong chay chi
 * xuat hien o mot cot NGU CANH va no `null` duoc — mot don thue nha xe ngoai khong co vong chay
 * nao, va ke toan van ket thuc duoc no.
 *
 * `Da ket thuc` la hanh dong DUONG chinh, va chu do la chu cua chu so huu — khong doi. Hai duong
 * con lai (`Can bo sung`, `Tu choi`) di qua CUNG mot cong nghiep vu voi cung mot bo luat, chi khac
 * `outcome`.
 *
 * ============================================================================================
 * O NHAP TRONG HOP THOAI LA CAN CU, KHONG PHAI MA LY DO
 * ============================================================================================
 *
 * May chu doi HAI thu khac nhau: mot `reasonCode` CO KIEU de loc duoc, va mot cau van ke lai B da
 * nhan/xac nhan cai gi. Ma thi man hinh biet (no den tu chinh nut vua bam); cau van thi chi nguoi
 * dung biet. Nen o nhap la CAU VAN, va ma di kem hanh dong — hoi nguoi dung mot ma viet HOA gach
 * duoi la bat ho lam viec cua may.
 *
 * ============================================================================================
 * KHOA CHONG GHI TRUNG SINH MOT LAN KHI MO HOP THOAI
 * ============================================================================================
 *
 * Khong sinh luc bam. Neu mang dut giua luc gui va luc nhan, nguoi dung bam lai va lan thu hai
 * mang DUNG khoa cu — may chu tra ve chinh quyet dinh da ghi thay vi ghi ban thu hai (`#275` K8
 * bai 4). Sinh luc bam se lam moi lan bam la mot khoa moi, tuc bo di dung cai bao ve do.
 */

const STATE_LABEL: Readonly<Record<OrderCompletionState, string>> = {
  PENDING: 'Chờ kết thúc',
  APPROVED: 'Đã kết thúc',
  REJECTED: 'Từ chối',
  NEEDS_CORRECTION: 'Cần bổ sung',
};

const stateTone = (state: OrderCompletionState): StatusTone => {
  switch (state) {
    case 'PENDING':
      return 'wait';
    case 'APPROVED':
      return 'done';
    case 'REJECTED':
      return 'stop';
    case 'NEEDS_CORRECTION':
      return 'wait';
  }
};

/** MA ly do di kem HANH DONG, khong di kem nguoi dung. */
const REASON_CODE: Readonly<Record<OrderCompletionOutcome, string>> = {
  APPROVED: 'DOCUMENT_RECEIVED',
  NEEDS_CORRECTION: 'DOCUMENT_INCOMPLETE',
  REJECTED: 'DOCUMENT_NOT_ACCEPTED',
};

const ACTION_LABEL: Readonly<Record<OrderCompletionOutcome, string>> = {
  APPROVED: 'Đã kết thúc',
  NEEDS_CORRECTION: 'Cần bổ sung',
  REJECTED: 'Từ chối',
};

interface PendingDecision {
  readonly row: OrderCompletionRow;
  readonly outcome: OrderCompletionOutcome;
  /** Ban dang sua — `null` khi day la quyet dinh dau tien cua don. */
  readonly supersedesId: string | null;
  readonly idempotencyKey: string;
}

const newIdempotencyKey = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `web-${crypto.randomUUID()}`
    : `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const localTime = (iso: string | null): string =>
  iso === null ? '—' : new Date(iso).toLocaleString('vi-VN');

export function OrderCompletionView() {
  const navigation = useNavigationInput();
  const queryClient = useQueryClient();
  const queue = toSectionQuery(useOrderCompletionQueue(navigation));

  const [pending, setPending] = useState<PendingDecision | null>(null);
  const [note, setNote] = useState('');
  const [isBusy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [history, setHistory] = useState<OrderCompletionDetail | null>(null);
  const [documents, setDocuments] = useState<readonly OperationalDocumentView[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState<readonly string[]>([]);
  /**
   * BO LOC nam TRONG BO NHO, khong phai mot tham so truy van.
   *
   * Hang cho nay chi chua don DA GIAO XONG nen no bi chan tren tu ban chat. Goi lai may chu chi de
   * bo bot dong la mot lan cho khong can — va no lam nguoi truc mat cho dung luc ho dang doi chieu.
   */
  const [filter, setFilter] = useState<OrderCompletionState | 'ALL'>('ALL');

  const closeDialog = () => {
    setPending(null);
    setNote('');
    setDocuments([]);
    setSelectedEvidence([]);
  };

  /**
   * Mo hop thoai — va TRUOC do doc ban moi nhat cua ho so.
   *
   * `supersedesId` phai bang DUNG ban moi nhat, nen no phai duoc doc luc MO chu khong luc BAM: neu
   * doc luc bam thi hai nguoi cung mo mot don se cung ghi de len nhau ma khong ai bi tu choi. Doc
   * luc mo lam nguoi thu hai nhan `ACCEPTANCE_SUPERSEDES_STALE` va phai tai lai — dung dieu `#275`
   * K8 bai 5 doi.
   */
  const openDialog = (row: OrderCompletionRow, outcome: OrderCompletionOutcome) => {
    setFailure(null);
    // Chung tu van hanh la PHAN PHU (`transport.operational_document.read`, `#395`): khong co quyen
    // thi khong hoi — hop quyet dinh noi mot cau thay vi in `403` cua may chu nhu mot loi.
    if (canPerform(navigation, 'transport.operational_document.read')) {
      void transportApi.operationalDocuments
        .forOrder(row.orderId)
        .then((items) => setDocuments(items.filter((item) => item.status === 'ACTIVE')))
        .catch((error: unknown) =>
          setFailure(error instanceof Error ? error.message : 'Không đọc được chứng từ của đơn.'),
        );
    }
    if (row.acceptanceId === null) {
      setPending({ row, outcome, supersedesId: null, idempotencyKey: newIdempotencyKey() });
      return;
    }
    transportApi.orderCompletion
      .get(row.orderId)
      .then((detail) => {
        setHistory(detail);
        setPending({
          row,
          outcome,
          supersedesId: detail.acceptance.latestDecisionId,
          idempotencyKey: newIdempotencyKey(),
        });
      })
      .catch((error: unknown) => {
        setFailure(error instanceof Error ? error.message : 'Không đọc được hồ sơ. Hãy thử lại.');
      });
  };

  const confirm = () => {
    if (pending === null) return;
    setBusy(true);
    setFailure(null);

    transportApi.orderCompletion
      .decide(pending.row.orderId, {
        outcome: pending.outcome,
        reasonCode: REASON_CODE[pending.outcome],
        /* Chung tu so duoc doc tu chinh Order; khong cho client tu nhap mot ma cua don khac. */
        basis: selectedEvidence.length > 0 ? 'DOCUMENT' : 'EXTERNAL_PHYSICAL_CONFIRMATION',
        evidenceRefs: selectedEvidence,
        externalNote: selectedEvidence.length > 0 ? null : note.trim(),
        supersedesId: pending.supersedesId,
        idempotencyKey: pending.idempotencyKey,
      })
      .then((detail) => {
        setHistory(detail);
        void queryClient.invalidateQueries({ queryKey: TRANSPORT_QUERY_KEYS.orderCompletion });
        // Ket thuc mot don doi DIEU KIEN DOI SOAT cua no — bang tai chinh phai doc lai.
        void queryClient.invalidateQueries({ queryKey: ['transport', 'settlement'] });
        closeDialog();
      })
      .catch((error: unknown) => {
        // Hien NGUYEN VAN cau cua may chu: `transportErrorToHttp` da bo mot ma loi CO KIEU o bien
        // HTTP, nen cau do la thong tin chinh xac nhat man hinh co.
        setFailure(error instanceof Error ? error.message : 'Không thực hiện được. Hãy thử lại.');
      })
      .finally(() => setBusy(false));
  };

  if (queue.isBlocked) {
    return (
      <EmptyState title="Doanh nghiệp này chưa bật nghiệm thu chứng từ, hoặc vai của bạn không có quyền kết thúc đơn." />
    );
  }
  if (queue.errorMessage !== null) {
    return <ErrorState message={queue.errorMessage} onRetry={queue.refetch} />;
  }
  if (queue.isLoading || queue.data === undefined) {
    return <LoadingState label="Đang tải đơn chờ kết thúc…" />;
  }

  const rows = filter === 'ALL' ? queue.data : queue.data.filter((row) => row.state === filter);

  return (
    <>
      <PageHeader
        title="Kết thúc đơn"
        summary="Đơn đã giao xong và có chứng từ thì kế toán bấm “Đã kết thúc”. Chỉ đơn đã kết thúc mới vào kỳ đối soát mới."
      />

      {failure !== null && <ErrorState message={failure} />}

      <p className="tx-filters">
        {(['ALL', 'PENDING', 'APPROVED', 'NEEDS_CORRECTION', 'REJECTED'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className="tx-btn"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === 'ALL' ? 'Tất cả' : STATE_LABEL[value]}
          </button>
        ))}
      </p>

      <DataTable<OrderCompletionRow>
        caption="Đơn chờ kết thúc"
        rows={rows}
        rowKey={(row) => row.orderId}
        columns={[
          {
            key: 'order',
            header: 'Đơn',
            render: (row) => row.orderCode,
            isRowHeader: true,
          },
          {
            key: 'route',
            header: 'Lấy hàng → Giao hàng',
            render: (row) => `${row.originLabel} → ${row.destinationLabel}`,
          },
          { key: 'businessDate', header: 'Ngày', render: (row) => row.businessDate },
          {
            key: 'delivered',
            header: 'Giao hàng',
            render: (row) =>
              row.orderStatus === 'FULFILLED' ? (
                <StatusBadge label="Đã giao xong" tone="done" />
              ) : (
                <StatusBadge label={row.orderStatus} tone="wait" />
              ),
          },
          {
            key: 'evidence',
            header: 'Chứng từ',
            render: (row) =>
              row.evidenceCount > 0 ? (
                `${row.evidenceCount} chứng từ`
              ) : (
                <StatusBadge
                  label="Bản giấy"
                  tone="flat"
                  title="Chưa có bản số. Kế toán ghi rõ đã nhận/xác nhận gì khi kết thúc."
                />
              ),
          },
          {
            key: 'context',
            header: 'Vòng chạy (tham khảo)',
            render: (row) => row.runCode ?? '—',
          },
          {
            key: 'state',
            header: 'Trạng thái',
            render: (row) => (
              <StatusBadge label={STATE_LABEL[row.state]} tone={stateTone(row.state)} />
            ),
          },
          {
            key: 'eligible',
            header: 'Đủ điều kiện đối soát',
            render: (row) =>
              row.settlementEligible ? (
                <StatusBadge label="Rồi" tone="done" />
              ) : (
                <StatusBadge label="Chưa" tone="wait" />
              ),
          },
          {
            key: 'decided',
            header: 'Người quyết / lúc',
            // NHAN, khong phai ma tai khoan tho `latestDecidedBy` (`#334`).
            render: (row) =>
              row.latestDecidedByActor === null
                ? '—'
                : `${row.latestDecidedByActor.label} · ${localTime(row.latestDecidedAt)}`,
          },
          {
            key: 'actions',
            header: 'Kết thúc',
            render: (row) => (
              <>
                <button
                  type="button"
                  className="tx-btn"
                  onClick={() => openDialog(row, 'APPROVED')}
                >
                  Đã kết thúc
                </button>{' '}
                <button
                  type="button"
                  className="tx-btn"
                  onClick={() => openDialog(row, 'NEEDS_CORRECTION')}
                >
                  Cần bổ sung
                </button>{' '}
                <button
                  type="button"
                  className="tx-btn"
                  onClick={() => openDialog(row, 'REJECTED')}
                >
                  Từ chối
                </button>
              </>
            ),
          },
        ]}
      />

      {history !== null && history.decisions.length > 0 && (
        <DataTable<OrderCompletionDetail['decisions'][number]>
          caption="Lịch sử quyết định của đơn vừa mở"
          rows={history.decisions}
          rowKey={(decision) => decision.id}
          columns={[
            { key: 'sequence', header: '#', render: (d) => String(d.sequence), isNumeric: true },
            {
              key: 'outcome',
              header: 'Kết quả',
              render: (d) => (
                <StatusBadge label={STATE_LABEL[d.outcome]} tone={stateTone(d.outcome)} />
              ),
            },
            { key: 'reason', header: 'Mã lý do', render: (d) => d.reasonCode },
            { key: 'note', header: 'Căn cứ', render: (d) => d.externalNote ?? '—' },
            { key: 'by', header: 'Người quyết', render: (d) => d.decidedByActor.label },
            { key: 'at', header: 'Lúc', render: (d) => localTime(d.decidedAt) },
          ]}
        />
      )}

      {pending === null ? null : (
        <PermissionGate viewer={navigation} action="transport.operational_document.read" />
      )}
      {pending === null || documents.length === 0 ? null : (
        <section className="tx-panel" aria-label={`Chứng từ của đơn ${pending.row.orderCode}`}>
          <h2>Chứng từ số của đơn</h2>
          <p className="tx-note">
            Chọn đúng chứng từ làm căn cứ. Tệp mở qua mã đục, không lộ đường dẫn kho.
          </p>
          <ul className="tx-notes">
            {documents.map((document) => (
              <li key={document.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selectedEvidence.includes(document.id)}
                    onChange={(event) =>
                      setSelectedEvidence((held) =>
                        event.target.checked
                          ? [...held, document.id]
                          : held.filter((id) => id !== document.id),
                      )
                    }
                  />{' '}
                  {document.label ?? document.type} · {localTime(document.receivedAt)}
                </label>{' '}
                {document.fileId === null ? (
                  <span>Bản giấy</span>
                ) : (
                  <a
                    href={operationalFileContentUrl(document.fileId)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Mở tệp bằng chứng
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmAction
        open={pending !== null}
        title={
          pending === null ? '' : `${ACTION_LABEL[pending.outcome]} đơn ${pending.row.orderCode}?`
        }
        detail={
          pending?.outcome === 'APPROVED'
            ? 'Đơn này sẽ đủ điều kiện vào một kỳ đối soát mới. Hành động được ghi lại kèm người và giờ máy chủ.'
            : null
        }
        confirmLabel={pending === null ? '' : ACTION_LABEL[pending.outcome]}
        reasonLabel={selectedEvidence.length > 0 ? undefined : 'Bên B đã nhận / xác nhận gì'}
        reason={note}
        onReasonChange={setNote}
        onConfirm={confirm}
        onCancel={closeDialog}
        isDestructive={pending?.outcome === 'REJECTED'}
        isBusy={isBusy}
      />
    </>
  );
}
