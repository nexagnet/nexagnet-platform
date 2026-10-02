'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DataTable, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  TOLL_MATCH_STATE_LABEL,
  TOLL_PROVIDER_LABEL,
  TOLL_REVIEW_ACTION_LABEL,
  TOLL_REVIEW_STATE_LABEL,
} from '../customer-view';
import { toSectionQuery, useTollCandidates } from '../hooks/useTransportWorkspace';
import type { NavigationInput } from '../navigation';
import { transportApi } from '../transport-api';
import {
  TOLL_MATCH_STATES,
  TOLL_PROVIDERS,
  TOLL_REVIEW_STATES,
  type TollCandidate,
  type TollCandidateQuery,
  type TollMatchState,
  type TollProvider,
  type TollReviewState,
  type Vehicle,
} from '../transport-types';
import { toTollQueueModel, type TollCandidateRow } from '../workspace/toll';
import { toTollVehicleOptions, tollVehicleLabelOf } from '../workspace/toll-admin';
import { tollQueueRowActions } from '../workspace/toll-duplicates';
import { TollCandidateDetail } from './TollCandidateDetail';

/**
 * HANG CHO DOI SOAT tung dong ETC.
 *
 * ==============================================================================================
 * MOT DONG CHUA GIAI DUOC XE O LAI DAY. MAN HINH KHONG DIEN GIUP.
 * ==============================================================================================
 *
 * May chu khong bao gio chon bua mot chiec xe khi co nhieu ung vien (`AMBIGUOUS`), nen man hinh
 * cung khong duoc chon giup. O chon xe bat dau o "— Chọn xe —", va bien so THO tu tep van hien ra
 * canh do — do la bang chung, khong phai ket luan.
 *
 * ==============================================================================================
 * `CONFIRMED` NGHIA LA MOT NGUOI DA NHIN, KHONG PHAI TIEN DA DI
 * ==============================================================================================
 *
 * Ba trang thai doi soat khong mot cai nao noi ve thanh toan (`#269 J7`). Cot "Đối soát" tra loi
 * dung mot cau: *da co nguoi nhin dong nay chua*.
 *
 * ==============================================================================================
 * DONG NGHI TRUNG CHI CO MOT CUA — `#314` G8
 * ==============================================================================================
 *
 * Truoc day hang cho chi mo `RESOLVE_VEHICLE`/`CONFIRM`/`REOPEN`, nen dong `DUPLICATE_CANDIDATE` nam
 * lai vinh vien (hoac bi "xac nhan" ma khong ai noi no la hay khong la trung). Gio viec tren tung
 * dong den tu `tollQueueRowActions`, va dong nghi trung chi co "Quyết trùng…" — mo bang quyet trung.
 */

export interface TollQueueFocus {
  readonly importId: string | null;
  readonly importLabel: string | null;
  readonly matchState: TollMatchState | null;
  /** Tang moi lan nguoi dung di toi hang cho tu noi khac — bo loc dat lai ca khi trung gia tri cu. */
  readonly nonce: number;
}

export const NO_TOLL_QUEUE_FOCUS: TollQueueFocus = {
  importId: null,
  importLabel: null,
  matchState: null,
  nonce: 0,
};

const PAGE_SIZE = 20;

type QuickAction = 'RESOLVE_VEHICLE' | 'CONFIRM' | 'REOPEN';

export function TollCandidateQueue({
  navigation,
  focus,
  onClearImportFocus,
  vehicles,
  importLabelOf,
}: {
  readonly navigation: NavigationInput;
  readonly focus: TollQueueFocus;
  readonly onClearImportFocus: () => void;
  readonly vehicles: readonly Vehicle[] | undefined;
  readonly importLabelOf: (importId: string) => string | null;
}) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<TollProvider | 'ALL'>('ALL');
  const [matchState, setMatchState] = useState<TollMatchState | 'ALL'>(focus.matchState ?? 'ALL');
  const [reviewState, setReviewState] = useState<TollReviewState | 'ALL'>('ALL');
  const [offset, setOffset] = useState(0);
  const [vehicleDraft, setVehicleDraft] = useState<Readonly<Record<string, string>>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const query: TollCandidateQuery = {
    provider: provider === 'ALL' ? null : provider,
    importId: focus.importId,
    matchState: matchState === 'ALL' ? null : matchState,
    reviewState: reviewState === 'ALL' ? null : reviewState,
    limit: PAGE_SIZE,
    offset,
  };
  const candidates = toSectionQuery(useTollCandidates(navigation, query));

  const review = useMutation({
    mutationFn: (input: {
      readonly id: string;
      readonly action: QuickAction;
      readonly vehicleId: string | null;
      readonly rowLabel: string;
    }) =>
      transportApi.toll.review(input.id, {
        action: input.action,
        vehicleId: input.vehicleId,
        duplicateOfCandidateId: null,
        note: null,
      }),
    onSuccess: (_updated, input) => {
      setStatus(`Đã ghi «${TOLL_REVIEW_ACTION_LABEL[input.action]}» cho ${input.rowLabel}.`);
      setVehicleDraft((current) => ({ ...current, [input.id]: '' }));
      // Mot lan quyet doi CA dong do, so dem, bao cao va dong doi ung — lam moi ca nhanh `toll`.
      void queryClient.invalidateQueries({ queryKey: ['transport', 'toll'] });
    },
    /*
     * MAY CHU TU CHOI thi hang cho dang hien mot ban CU (`#318`): vd nguoi khac vua ghi dong nay la
     * trung, nen `CONFIRM` bi tu choi. Cau cua may chu hien nguyen van o tren, va hang cho tai lai de
     * dong do hien DUNG viec con lam duoc — thay vi giu mot nut ma may chu se lai tu choi.
     */
    onError: () => {
      setStatus(null);
      void queryClient.invalidateQueries({ queryKey: ['transport', 'toll'] });
    },
  });

  const vehicleLabelOf = tollVehicleLabelOf(vehicles);
  const vehicleOptions = toTollVehicleOptions(vehicles);
  const page = candidates.data;
  const model = page === undefined ? null : toTollQueueModel(page, navigation);
  const rawById = new Map((page?.items ?? []).map((item) => [item.id, item]));

  const rowLabelOf = (candidate: TollCandidate): string => {
    const label = importLabelOf(candidate.importId);
    return label === null
      ? `dòng ${String(candidate.rowNumber)}`
      : `dòng ${String(candidate.rowNumber)} (${label})`;
  };

  const resetPage = () => {
    setOffset(0);
    setSelectedId(null);
  };

  const rowActions = (row: TollCandidateRow) => {
    const raw = rawById.get(row.id);
    if (raw === undefined) return '—';
    const label = rowLabelOf(raw);
    const actions = model?.canResolve === true ? tollQueueRowActions(raw) : [];
    const draft = vehicleDraft[row.id] ?? '';

    return (
      <div className="tx-rowbtns">
        {actions.includes('RESOLVE_VEHICLE') ? (
          <>
            <span className="tx-field tx-field--inline">
              <select
                aria-label={`Chọn xe cho ${label}`}
                value={draft}
                onChange={(event) =>
                  setVehicleDraft((current) => ({ ...current, [row.id]: event.target.value }))
                }
              >
                <option value="">— Chọn xe —</option>
                {vehicleOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </span>
            <button
              type="button"
              className="tx-btn tx-btn--small"
              aria-label={`Chỉ định xe đã chọn cho ${label}`}
              disabled={draft === '' || review.isPending}
              onClick={() =>
                review.mutate({
                  id: row.id,
                  action: 'RESOLVE_VEHICLE',
                  vehicleId: draft,
                  rowLabel: label,
                })
              }
            >
              Chỉ định xe
            </button>
          </>
        ) : null}

        {actions.includes('CONFIRM') ? (
          <button
            type="button"
            className="tx-btn tx-btn--small"
            aria-label={`Xác nhận ${label}`}
            title={
              raw.vehicleId === null && raw.kind === 'TOLL_PASS'
                ? 'Xác nhận mà không gắn xe: dòng này sẽ nằm ở mục chưa gắn xe trong báo cáo chi phí.'
                : undefined
            }
            disabled={review.isPending}
            onClick={() =>
              review.mutate({ id: row.id, action: 'CONFIRM', vehicleId: null, rowLabel: label })
            }
          >
            Xác nhận
          </button>
        ) : null}

        {actions.includes('REOPEN') ? (
          <button
            type="button"
            className="tx-btn tx-btn--small"
            aria-label={`Mở lại ${label}`}
            disabled={review.isPending}
            onClick={() =>
              review.mutate({ id: row.id, action: 'REOPEN', vehicleId: null, rowLabel: label })
            }
          >
            Mở lại
          </button>
        ) : null}

        {actions.includes('REVIEW_DUPLICATE') ? (
          <button
            type="button"
            className="tx-btn tx-btn--small tx-btn--stop"
            aria-label={`Quyết trùng cho ${label}`}
            onClick={() => {
              setStatus(null);
              setSelectedId(row.id);
            }}
          >
            Quyết trùng…
          </button>
        ) : (
          <button
            type="button"
            className="tx-btn tx-btn--small tx-btn--ghost"
            aria-label={`Xem chi tiết ${label}`}
            onClick={() => {
              setStatus(null);
              setSelectedId(row.id);
            }}
          >
            Chi tiết
          </button>
        )}
      </div>
    );
  };

  const columns = [
    {
      key: 'row',
      header: 'Dòng',
      isRowHeader: true,
      // KHONG tien to "#": be mat khach chan moi khuon `#<hai chu so tro len>`.
      render: (row: TollCandidateRow) => String(row.rowNumber),
    },
    {
      key: 'source',
      header: 'Nguồn',
      render: (row: TollCandidateRow) => {
        const raw = rawById.get(row.id);
        return raw === undefined ? '—' : (importLabelOf(raw.importId) ?? '—');
      },
    },
    {
      key: 'provider',
      header: 'Nhà cung cấp',
      render: (row: TollCandidateRow) => row.providerLabel,
    },
    { key: 'kind', header: 'Loại', render: (row: TollCandidateRow) => row.kindLabel },
    { key: 'date', header: 'Ngày', render: (row: TollCandidateRow) => row.businessDateLabel },
    {
      key: 'amount',
      header: 'Số tiền',
      isNumeric: true,
      render: (row: TollCandidateRow) => row.amountLabel,
    },
    { key: 'station', header: 'Trạm', render: (row: TollCandidateRow) => row.stationLabel },
    {
      key: 'plate',
      header: 'Biển số trên tệp',
      render: (row: TollCandidateRow) => (row.vehiclePlateRaw === '' ? '—' : row.vehiclePlateRaw),
    },
    {
      key: 'vehicle',
      header: 'Xe đã khớp',
      render: (row: TollCandidateRow) =>
        row.vehicleId === null ? '— chờ người chỉ định —' : vehicleLabelOf(row.vehicleId),
    },
    {
      key: 'match',
      header: 'Khớp xe',
      render: (row: TollCandidateRow) => (
        <StatusBadge label={row.matchStateLabel} tone={row.matchStateTone} />
      ),
    },
    {
      key: 'review',
      header: 'Đối soát',
      render: (row: TollCandidateRow) => (
        <StatusBadge
          label={row.reviewStateLabel}
          tone={row.reviewStateTone}
          title="Trạng thái này nói đã có người nhìn dòng này chưa — không nói tiền đã trả."
        />
      ),
    },
    { key: 'actions', header: 'Việc', render: rowActions },
  ];

  return (
    <section className="tx-panel" aria-labelledby="toll-queue-heading">
      <h2 id="toll-queue-heading">Hàng chờ đối soát</h2>
      <p className="tx-panel__lead">
        Một dòng đã khớp xe vẫn còn chờ xác nhận — chọn được xe không nghĩa là đối soát xong, và xác
        nhận không nghĩa là đã thanh toán. Dòng nghi trùng phải được quyết là trùng hay không trước
        khi tính vào chi phí.
      </p>

      {focus.importId === null ? null : (
        <p className="tx-note" role="status">
          Đang xem các dòng của lần nạp «
          {focus.importLabel ?? importLabelOf(focus.importId) ?? 'không rõ nhãn'}».{' '}
          <button type="button" className="tx-btn tx-btn--small" onClick={onClearImportFocus}>
            Xem mọi lần nạp
          </button>
        </p>
      )}

      <div className="tx-filters">
        <label className="tx-field tx-field--inline">
          <span>Nhà cung cấp</span>
          <select
            aria-label="Lọc hàng chờ theo nhà cung cấp"
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value as TollProvider | 'ALL');
              resetPage();
            }}
          >
            <option value="ALL">Tất cả</option>
            {TOLL_PROVIDERS.map((value) => (
              <option key={value} value={value}>
                {TOLL_PROVIDER_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="tx-field tx-field--inline">
          <span>Khớp xe</span>
          <select
            aria-label="Lọc hàng chờ theo khớp xe"
            value={matchState}
            onChange={(event) => {
              setMatchState(event.target.value as TollMatchState | 'ALL');
              resetPage();
            }}
          >
            <option value="ALL">Tất cả</option>
            {TOLL_MATCH_STATES.map((value) => (
              <option key={value} value={value}>
                {TOLL_MATCH_STATE_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="tx-field tx-field--inline">
          <span>Đối soát</span>
          <select
            aria-label="Lọc hàng chờ theo đối soát"
            value={reviewState}
            onChange={(event) => {
              setReviewState(event.target.value as TollReviewState | 'ALL');
              resetPage();
            }}
          >
            <option value="ALL">Tất cả</option>
            {TOLL_REVIEW_STATES.map((value) => (
              <option key={value} value={value}>
                {TOLL_REVIEW_STATE_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {status === null ? null : (
        <p className="tx-note" role="status">
          {status}
        </p>
      )}
      {review.error === null ? null : <ErrorState message={review.error.message} />}

      {candidates.isLoading ? <LoadingState label="Đang tải hàng chờ đối soát…" /> : null}
      {candidates.errorMessage === null ? null : (
        <ErrorState message={candidates.errorMessage} onRetry={candidates.refetch} />
      )}
      {candidates.isBlocked ? (
        <EmptyState title="Vai của bạn không đọc được hàng chờ đối soát phí đường bộ." />
      ) : null}

      {model === null ? null : model.rows.length === 0 ? (
        <EmptyState title={model.emptyNotice} />
      ) : (
        <>
          <p className="tx-note">
            {model.shownLabel} trên {model.totalLabel} dòng · {model.pendingCountLabel} dòng trên
            trang này còn chờ người xác nhận.
          </p>
          <DataTable
            caption="Các dòng phí đường bộ trong hàng chờ đối soát"
            columns={columns}
            rows={model.rows}
            rowKey={(row) => row.id}
            selectedKey={selectedId}
            onShowAll={() => setSelectedId(null)}
          />
          <div className="tx-detail__actions">
            {offset === 0 ? null : (
              <button type="button" className="tx-btn tx-btn--small" onClick={resetPage}>
                Về trang đầu
              </button>
            )}
            {model.hasMore ? (
              <button
                type="button"
                className="tx-btn tx-btn--small"
                onClick={() => {
                  setOffset(offset + PAGE_SIZE);
                  setSelectedId(null);
                }}
              >
                Xem tiếp {PAGE_SIZE} dòng
              </button>
            ) : null}
          </div>
        </>
      )}

      {selectedId === null ? null : (
        <TollCandidateDetail
          key={selectedId}
          navigation={navigation}
          candidateId={selectedId}
          canResolve={model?.canResolve === true}
          vehicleLabelOf={vehicleLabelOf}
          importLabelOf={importLabelOf}
          onClose={() => setSelectedId(null)}
          onDecided={setStatus}
        />
      )}
    </section>
  );
}
