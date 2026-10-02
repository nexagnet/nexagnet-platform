'use client';

import { useState } from 'react';
import { PermissionGate } from '../components/PermissionGate';
import { CommandPanel, DataTable, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import { FUEL_DOCUMENT_STATUS_LABEL } from '../customer-view';
import { FUEL_DOCUMENT_STATUSES, type FuelDocumentStatus } from '../fuel-review-types';
import {
  toSectionQuery,
  useFuelDocumentReview,
  useFuelDocuments,
  useNavigationInput,
} from '../hooks/useTransportWorkspace';
import { useRevealOnOpen } from '../hooks/useRevealOnOpen';
import { canPerform } from '../transport-actions';
import {
  toDocumentQueueRows,
  toExtractionReviewModel,
  type DocumentQueueRow,
} from '../workspace/fuel-extraction';
import { ExtractionReview } from './FuelEvidenceExtraction';

const PAGE_SIZE = 50;

/**
 * HANG SOAT CHUNG TU MAY DOC — `#313`.
 *
 * Moi chung tu da dua cho may doc (hoa don dien tu, anh phieu), bat ke no vao tu duong nao. Hang
 * nay CHI DOC: khong co nut sua ung vien, khong co nut gan ung vien vao phieu — nhung viec do chua
 * co duong nao o may chu, va mot nut goi y rang no co la mot loi hua sai.
 *
 * `GET documents` khong tra tong so, nen phan trang noi dung su that: con trang sau KHI trang nay
 * day, khong phai mot con so "1–50 / N" bia ra.
 */
export function FuelDocumentQueue() {
  const navigation = useNavigationInput();
  const [status, setStatus] = useState<FuelDocumentStatus | null>(null);
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const documents = toSectionQuery(
    useFuelDocuments(navigation, { status, limit: PAGE_SIZE, offset }),
  );
  const selected = (documents.data ?? []).find((row) => row.id === openId) ?? null;
  const review = toSectionQuery(useFuelDocumentReview(navigation, openId));
  const original = toSectionQuery(
    useFuelDocumentReview(
      navigation,
      selected?.status === 'DUPLICATE' ? selected.duplicateOfId : null,
    ),
  );
  const reveal = useRevealOnOpen<HTMLDivElement>(openId);

  // `#395` — phan phu cua man Nhien lieu: thieu quyen thi noi mot cau, khong lang le bien mat.
  if (!canPerform(navigation, 'transport.fuel.document.read')) {
    return <PermissionGate viewer={navigation} action="transport.fuel.document.read" />;
  }

  const rows = toDocumentQueueRows(documents.data ?? []);

  return (
    <CommandPanel
      title="Chứng từ máy đọc"
      hint="Hoá đơn điện tử và ảnh phiếu đã đưa cho máy đọc — ứng viên chờ người soát, chưa phải số liệu đã xác thực."
      openLabel="Mở hàng soát"
    >
      <form
        className="tx-filters"
        aria-label="Lọc chứng từ máy đọc"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="tx-field">
          <span>Trạng thái đọc</span>
          <select
            aria-label="Trạng thái đọc"
            value={status ?? 'ALL'}
            onChange={(event) => {
              setOffset(0);
              setOpenId(null);
              setStatus(
                event.target.value === 'ALL' ? null : (event.target.value as FuelDocumentStatus),
              );
            }}
          >
            <option value="ALL">Tất cả</option>
            {FUEL_DOCUMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {FUEL_DOCUMENT_STATUS_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
      </form>

      {documents.errorMessage === null ? null : (
        <ErrorState message={documents.errorMessage} onRetry={documents.refetch} />
      )}
      {documents.isLoading ? <LoadingState label="Đang đọc chứng từ máy đọc…" /> : null}
      {!documents.isLoading && documents.errorMessage === null && rows.length === 0 ? (
        <EmptyState title="Không có chứng từ nào khớp bộ lọc." />
      ) : null}

      {rows.length === 0 ? null : (
        <>
          <DataTable<DocumentQueueRow>
            caption="Chứng từ đã đưa cho máy đọc"
            rows={rows}
            rowKey={(row) => row.id}
            selectedKey={openId}
            onSelect={(row) => setOpenId(row.id === openId ? null : row.id)}
            onShowAll={() => setOpenId(null)}
            columns={[
              { key: 'kind', header: 'Loại', isRowHeader: true, render: (row) => row.kindLabel },
              { key: 'source', header: 'Nguồn', render: (row) => row.sourceLabel },
              { key: 'received', header: 'Nhận lúc', render: (row) => row.receivedAtLabel },
              {
                key: 'status',
                header: 'Trạng thái đọc',
                render: (row) => <StatusBadge label={row.statusLabel} tone={row.statusTone} />,
              },
              {
                key: 'candidates',
                header: 'Ứng viên',
                isNumeric: true,
                render: (row) => row.candidateCountLabel,
              },
              { key: 'reject', header: 'Lý do', render: (row) => row.rejectLabel ?? '—' },
            ]}
          />
          <div className="tx-inbox__pager">
            <button
              type="button"
              className="tx-btn tx-btn--small"
              disabled={offset === 0}
              onClick={() => setOffset((current) => Math.max(current - PAGE_SIZE, 0))}
            >
              Trang trước
            </button>
            <button
              type="button"
              className="tx-btn tx-btn--small"
              disabled={rows.length < PAGE_SIZE}
              onClick={() => setOffset((current) => current + PAGE_SIZE)}
            >
              Trang sau
            </button>
          </div>
        </>
      )}

      {openId === null ? null : (
        <div className="tx-detail" ref={reveal}>
          {review.isLoading ? <LoadingState label="Đang đọc kết quả máy đọc…" /> : null}
          {review.errorMessage === null ? null : (
            <ErrorState message={review.errorMessage} onRetry={review.refetch} />
          )}
          {review.data === undefined ? null : (
            <ExtractionReview
              model={toExtractionReviewModel(
                { review: review.data, originalReview: original.data ?? null },
                null,
              )}
            />
          )}
        </div>
      )}
    </CommandPanel>
  );
}
