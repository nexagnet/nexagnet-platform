'use client';

import { canPerform, type TransportViewerInput } from '../transport-actions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState, LoadingState } from '../components/SectionState';
import { transportApi } from '../transport-api';
import { toFuelCostAttributionModel } from '../workspace/fuel-cost-attribution';

/**
 * GIA THANH CUA MOT PHIEU — `#364`. Lop RIENG khoi su that "xe vua do dau".
 *
 * Dong mac dinh: khoi nay chi DOC khi ke toan mo no, nen mot trang hop thu 50 phieu khong ban 50
 * yeu cau cho mot cau hoi chua ai hoi. Khoa chong ghi trung cua lan cap phat duoc sinh MOT lan cho
 * moi lan mo bieu mau — bam lai (mang chap chon) gui DUNG khoa cu va may chu tra lai dong da ghi.
 */
export function FuelCostAttributionPanel({
  entryId,
  viewer,
}: {
  readonly entryId: string;
  readonly viewer: TransportViewerInput;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = ['transport', 'fuel', 'cost-attribution', entryId] as const;
  const view = useQuery({
    queryKey,
    queryFn: () => transportApi.fuel.costAttribution(entryId),
    // Cong = ma cua route (`#395`); khoi nay nam trong man Nhien lieu nen nguoi mo no von co ma do.
    enabled: isOpen && canPerform(viewer, 'transport.fuel.entry.read'),
  });

  const [targetKey, setTargetKey] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [correlationKey, setCorrelationKey] = useState(() => globalThis.crypto.randomUUID());
  const [reversing, setReversing] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const model = view.data === undefined ? null : toFuelCostAttributionModel(view.data, viewer);

  const settle = (next: Awaited<ReturnType<typeof transportApi.fuel.costAttribution>>) => {
    queryClient.setQueryData(queryKey, next);
    void queryClient.invalidateQueries({ queryKey: ['transport', 'fuel', 'entries'] });
    setFailure(null);
  };

  const attribute = useMutation({
    mutationFn: () => {
      const target = model?.targets.find((option) => option.key === targetKey)?.target;
      if (!target) throw new Error('Chọn vòng xe hoặc chặng nhận giá thành.');
      const value = Number(amount === '' ? model?.defaultAmount : amount);
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error('Số tiền phân bổ phải là số nguyên đồng dương.');
      }
      return transportApi.fuel.attributeCost(entryId, {
        target,
        amount: value,
        note: note.trim() === '' ? null : note.trim(),
        correlationKey,
      });
    },
    onSuccess: (next) => {
      settle(next);
      setAmount('');
      setNote('');
      // Lan cap phat KE TIEP la mot quyet dinh moi — khoa moi.
      setCorrelationKey(globalThis.crypto.randomUUID());
    },
    onError: (error: Error) => setFailure(error.message),
  });

  const reverse = useMutation({
    mutationFn: (attributionId: string) => {
      const text = reason.trim();
      if (text === '') throw new Error('Đảo một dòng phân bổ thì phải ghi rõ lý do.');
      return transportApi.fuel.reverseCostAttribution(attributionId, text);
    },
    onSuccess: (next) => {
      settle(next);
      setReversing(null);
      setReason('');
    },
    onError: (error: Error) => setFailure(error.message),
  });

  return (
    <section className="tx-detail__section" aria-label="Giá thành nhiên liệu">
      <button
        type="button"
        className="tx-btn"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        {isOpen ? 'Ẩn giá thành' : 'Giá thành nhiên liệu'}
      </button>

      {!isOpen ? null : view.isLoading ? (
        <LoadingState label="Đang đọc giá thành của phiếu…" />
      ) : view.error ? (
        <ErrorState message={(view.error as Error).message} onRetry={() => void view.refetch()} />
      ) : model === null ? null : (
        <div>
          <p className="tx-note">{model.ledgerNote}</p>
          {model.isLegacyTrip ? null : (
            <dl className="tx-detail__grid">
              <div>
                <dt>Số tiền phiếu</dt>
                <dd>{model.totalLabel}</dd>
              </div>
              <div>
                <dt>Đã phân bổ</dt>
                <dd>{model.attributedLabel}</dd>
              </div>
              <div>
                <dt>Còn lại</dt>
                <dd>{model.unattributedLabel}</dd>
              </div>
            </dl>
          )}

          {model.lines.length === 0 ? null : (
            <ul className="tx-detail__reasons" aria-label="Các dòng phân bổ">
              {model.lines.map((line) => (
                <li key={line.id}>
                  {line.kindLabel} · {line.targetLabel} · {line.amountLabel} · {line.recordedBy} ·{' '}
                  {line.createdAtLabel}
                  {line.note === null ? null : ` · ${line.note}`}
                  {model.canReverse && line.isActiveAllocation ? (
                    reversing === line.id ? (
                      <span>
                        {' '}
                        <input
                          aria-label="Lý do đảo"
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                        />
                        <button
                          type="button"
                          className="tx-btn"
                          disabled={reverse.isPending}
                          onClick={() => reverse.mutate(line.id)}
                        >
                          Xác nhận đảo
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="tx-btn"
                        onClick={() => {
                          setReversing(line.id);
                          setReason('');
                        }}
                      >
                        Đảo
                      </button>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {model.isLegacyTrip ? null : model.canAttribute ? (
            <form
              className="tx-filters"
              aria-label="Phân bổ giá thành"
              onSubmit={(event) => {
                event.preventDefault();
                attribute.mutate();
              }}
            >
              <label className="tx-field">
                <span>Công việc nhận giá thành</span>
                <select value={targetKey} onChange={(event) => setTargetKey(event.target.value)}>
                  <option value="">Chọn vòng xe / chặng</option>
                  {model.targets.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="tx-field">
                <span>Số tiền (đồng)</span>
                <input
                  inputMode="numeric"
                  placeholder={String(model.defaultAmount)}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))}
                />
              </label>
              <label className="tx-field">
                <span>Ghi chú</span>
                <input value={note} onChange={(event) => setNote(event.target.value)} />
              </label>
              <button type="submit" className="tx-btn" disabled={attribute.isPending}>
                Phân bổ
              </button>
            </form>
          ) : model.blockedReason === null ? null : (
            <p className="tx-note">{model.blockedReason}</p>
          )}

          {failure === null ? null : <ErrorState message={failure} />}
        </div>
      )}
    </section>
  );
}
