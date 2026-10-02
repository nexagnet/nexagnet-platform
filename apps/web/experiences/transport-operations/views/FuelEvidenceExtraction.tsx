'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DataTable, StatusBadge } from '../components/primitives';
import { ErrorState } from '../components/SectionState';
import {
  extractStoredFuelEvidence,
  receiptMediaTypeOf,
  UNSUPPORTED_EVIDENCE_MESSAGE,
  type StoredEvidenceExtraction,
  type StoredEvidenceRef,
} from '../fuel-evidence-extraction';
import { canPerform, type TransportViewerInput } from '../transport-actions';
import { evidenceUrls } from '../transport-api';
import {
  toExtractionReviewModel,
  type CandidateComparisonRow,
  type CandidateFieldRow,
  type CandidateReviewCard,
  type DeclaredFuelFacts,
  type ExtractionReviewModel,
} from '../workspace/fuel-extraction';

/**
 * DOC ANH CHUNG TU DA LUU BANG MAY — `#313`.
 *
 * ==============================================================================================
 * MOT CHIEU DUY NHAT: ANH -> UNG VIEN -> MAT NGUOI
 *
 * Khoi nay khong co nut "ap dung", "dien vao phieu" hay "xac thuc theo may". Ket qua may doc la
 * mot bang de NHIN canh anh goc, va moi quyet dinh ve phieu van di qua dung nhung nut da co cua
 * hop thu (`Xác thực`, `Từ chối`) — nhung nut do do NGUOI bam.
 *
 * Moi tam anh duoc goi bang `{ id, contentType }` DUNG HAI TRUONG, dung lai tu dau chu khong trai
 * doi tuong bang chung: mot DTO co `locator` (chi tiet phieu tren `main` van mang) khong co duong
 * nao di vao than yeu cau.
 */
export function FuelEvidenceExtraction({
  entryId,
  evidence,
  declared,
  viewer,
}: {
  readonly entryId: string;
  readonly evidence: readonly StoredEvidenceRef[];
  readonly declared: DeclaredFuelFacts | null;
  readonly viewer: TransportViewerInput;
}) {
  const queryClient = useQueryClient();
  const [results, setResults] = useState<Readonly<Record<string, StoredEvidenceExtraction>>>({});
  const [failures, setFailures] = useState<Readonly<Record<string, string>>>({});
  const mayExtract = canPerform(viewer, 'transport.fuel.document.ingest');

  const extract = useMutation({
    mutationFn: (file: StoredEvidenceRef) =>
      extractStoredFuelEvidence(entryId, { id: file.id, contentType: file.contentType }),
    onSuccess: (result, file) => {
      setResults((current) => ({ ...current, [file.id]: result }));
      setFailures(({ [file.id]: _cleared, ...rest }) => rest);
      void queryClient.invalidateQueries({ queryKey: ['transport', 'fuel', 'documents'] });
    },
    onError: (error: Error, file) =>
      setFailures((current) => ({ ...current, [file.id]: error.message })),
  });

  return (
    <section className="tx-extract" aria-label="Máy đọc ảnh chứng từ">
      <h5>Máy đọc ảnh chứng từ — chỉ là đề xuất</h5>
      {evidence.length === 0 ? <p className="tx-note">Phiếu này chưa có ảnh để máy đọc.</p> : null}
      <ul className="tx-extract__list">
        {evidence.map((file) => {
          const href = evidenceUrls.fuelEntry(entryId, file.id);
          const isImage = receiptMediaTypeOf(file.contentType) !== null;
          const result = results[file.id];
          const failure = failures[file.id];
          const isReading = extract.isPending && extract.variables?.id === file.id;
          return (
            <li key={file.id} className="tx-extract__item">
              <a className="tx-extract__thumb" href={href} target="_blank" rel="noreferrer">
                {isImage ? <img src={href} alt="Ảnh chứng từ gốc" loading="lazy" /> : 'Mở chứng từ'}
              </a>
              <div className="tx-extract__body">
                {!mayExtract ? (
                  <p className="tx-note">Chỉ kế toán hoặc giám đốc mới gửi ảnh cho máy đọc.</p>
                ) : !isImage ? (
                  <p className="tx-note">{UNSUPPORTED_EVIDENCE_MESSAGE}</p>
                ) : (
                  <button
                    type="button"
                    className="tx-btn tx-btn--small"
                    disabled={extract.isPending}
                    onClick={() => extract.mutate({ id: file.id, contentType: file.contentType })}
                  >
                    {isReading ? 'Máy đang đọc…' : result === undefined ? 'Đọc ảnh này' : 'Đọc lại'}
                  </button>
                )}
                {failure === undefined ? null : <ErrorState message={failure} />}
                {result === undefined ? null : (
                  <ExtractionReview model={toExtractionReviewModel(result, declared)} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Ket qua may doc — dung chung cho khoi trong phieu va hang soat chung tu. */
export function ExtractionReview({ model }: { readonly model: ExtractionReviewModel }) {
  return (
    <div className="tx-review" role="group" aria-label="Kết quả máy đọc">
      <p className="tx-review__notice" role="note">
        {model.notice}
      </p>
      <p className="tx-review__head">
        <StatusBadge label={model.statusLabel} tone={model.statusTone} />
        <strong>{model.headline}</strong>
      </p>
      {model.rejectLabel === null ? null : (
        <p className="tx-note tx-note--warn">{model.rejectLabel}</p>
      )}
      {model.duplicateNote === null ? null : <p className="tx-note">{model.duplicateNote}</p>}
      {model.cards.map((card) => (
        <CandidateCard key={card.id} card={card} />
      ))}
    </div>
  );
}

function CandidateCard({ card }: { readonly card: CandidateReviewCard }) {
  return (
    <article className="tx-review__card" aria-label={card.title}>
      <h6>{card.title}</h6>
      <p className="tx-note">
        {card.sellerLabel} · Cây xăng trên hoá đơn (ứng viên): {card.stationLabel} —{' '}
        {card.stationMatchLabel}
      </p>

      {card.findings.length === 0 ? null : (
        <ul className="tx-review__findings" aria-label="Điểm cần soát">
          {card.findings.map((row) => (
            <li key={row.finding}>
              <strong>{row.label}</strong>
              {row.detailLabel === null ? null : <span> — {row.detailLabel}</span>}
            </li>
          ))}
        </ul>
      )}

      <DataTable<CandidateFieldRow>
        caption="Các ô máy đọc được"
        rows={card.fields}
        rowKey={(row) => row.key}
        columns={[
          { key: 'field', header: 'Ô', isRowHeader: true, render: (row) => row.label },
          { key: 'value', header: 'Máy đọc', render: (row) => row.valueLabel },
          {
            key: 'confidence',
            header: 'Độ tin cậy',
            render: (row) =>
              row.confidenceLabel === null ? (
                '—'
              ) : row.isWeak ? (
                <StatusBadge label={`${row.confidenceLabel} · không chắc`} tone="wait" />
              ) : (
                row.confidenceLabel
              ),
          },
        ]}
      />

      {card.comparisons.length === 0 ? null : (
        <DataTable<CandidateComparisonRow>
          caption="Đối chiếu với tờ khai"
          rows={card.comparisons}
          rowKey={(row) => row.key}
          columns={[
            { key: 'field', header: 'Trường', isRowHeader: true, render: (row) => row.label },
            { key: 'declared', header: 'Tờ khai', render: (row) => row.declaredLabel },
            { key: 'receipt', header: 'Hoá đơn (máy đọc)', render: (row) => row.receiptLabel },
            {
              key: 'verdict',
              header: 'Kết quả',
              render: (row) => <StatusBadge label={row.verdictLabel} tone={row.tone} />,
            },
          ]}
        />
      )}
    </article>
  );
}
