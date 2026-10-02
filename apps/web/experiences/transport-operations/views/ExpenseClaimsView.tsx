'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PermissionNote } from '../components/PermissionGate';
import { DataTable, PageHeader, StatusBadge } from '../components/primitives';
import { ConfirmAction, EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import { unresolvedReference, type StatusTone } from '../customer-view';
import {
  TRANSPORT_QUERY_KEYS,
  toSectionQuery,
  useDrivers,
  useExpenseClaims,
  useNavigationInput,
} from '../hooks/useTransportWorkspace';
import { transportApi } from '../transport-api';
import type { ExpenseClaim, ExpenseClaimStatus } from '../transport-types';

/**
 * DUYET CHI LAI XE — cong ma `D-06` doi phai co.
 *
 * Man hinh nay hien HAI con so canh nhau, va do la ca diem: `claimedAmount` (lai xe de nghi) va
 * `approvedAmount` (ke toan duyet). Hom nay chung luon bang nhau vi `D-06` chi cho duyet TRON
 * KHOAN — nhung gop lam mot cot se lam ngay duyet mot phan mo ra, khong ai doc lai duoc lich su.
 *
 * `Da vao gia thanh` la mot cot RIENG, khong suy tu trang thai: mot de nghi chi gan vao vong
 * chay/chang van duyet duoc nhung CHUA vao gia thanh (duong tien cua T3 di qua mot CHUYEN). Im
 * lang o cho nay la cach mot khoan tien bien mat.
 *
 * Ca hai duong quyet dinh deu DOI MOT LY DO, va o nhap ly do nam ngay trong hop thoai: may chu tu
 * choi than thieu `reasonCode`, nen hoi sau khi bam la mot vong thua.
 */

const STATUS_LABEL: Readonly<Record<ExpenseClaimStatus, string>> = {
  PENDING_REVIEW: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
};

const statusTone = (status: ExpenseClaimStatus): StatusTone => {
  switch (status) {
    case 'PENDING_REVIEW':
      return 'wait';
    case 'APPROVED':
      return 'done';
    case 'REJECTED':
      return 'stop';
  }
};

const money = (value: number | null): string =>
  value === null ? '—' : `${value.toLocaleString('vi-VN')} đ`;

interface PendingReview {
  readonly claim: ExpenseClaim;
  readonly outcome: 'APPROVE' | 'REJECT';
}

export function ExpenseClaimsView() {
  const navigation = useNavigationInput();
  const queryClient = useQueryClient();
  const claims = toSectionQuery(useExpenseClaims(navigation));
  const drivers = toSectionQuery(useDrivers(navigation));

  const [pending, setPending] = useState<PendingReview | null>(null);
  const [reason, setReason] = useState('');
  const [isBusy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const closeDialog = () => {
    setPending(null);
    setReason('');
  };

  const confirm = () => {
    if (pending === null) return;
    setBusy(true);
    setFailure(null);
    const request =
      pending.outcome === 'APPROVE'
        ? transportApi.claims.approve(pending.claim.id, { reasonCode: reason.trim() })
        : transportApi.claims.reject(pending.claim.id, { reasonCode: reason.trim() });

    request
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: TRANSPORT_QUERY_KEYS.expenseClaims });
        // Duyet mot khoan lam doi CA so quy lan gia thanh chuyen — hai the do phai doc lai.
        void queryClient.invalidateQueries({ queryKey: ['transport', 'costing'] });
        closeDialog();
      })
      .catch((error: unknown) => {
        // Hien NGUYEN VAN cau cua may chu: `transportErrorToHttp` da bo mot ma loi CO KIEU o bien
        // HTTP, nen cau do la thong tin chinh xac nhat man hinh co.
        setFailure(error instanceof Error ? error.message : 'Không thực hiện được. Hãy thử lại.');
      })
      .finally(() => setBusy(false));
  };

  if (claims.isBlocked) {
    return (
      <EmptyState title="Doanh nghiệp này chưa bật sổ quỹ lái xe, hoặc vai của bạn không có quyền duyệt chi." />
    );
  }
  if (claims.errorMessage !== null) {
    return <ErrorState message={claims.errorMessage} onRetry={claims.refetch} />;
  }
  if (claims.isLoading || claims.data === undefined) {
    return <LoadingState label="Đang tải đề nghị chi…" />;
  }

  /**
   * Ten lai xe doc duoc thay cho `driverId`. Danh ba CHUA co trong tay (`#395`: chua duoc cap quyen
   * xem ho so lai xe) noi dung dieu do, khong in mot gach ngang nhu the lai xe khong co ten.
   */
  const driverName = (driverId: string): string =>
    drivers.data === undefined
      ? unresolvedReference('Lái xe')
      : (drivers.data.find((driver) => driver.id === driverId)?.fullName ?? '—');

  return (
    <>
      <PageHeader
        title="Duyệt chi lái xe"
        summary="Chỉ khoản được duyệt mới vào giá thành và sổ quỹ. Nhiên liệu và ETC không đi đường này."
      />

      {failure !== null && <ErrorState message={failure} />}
      <PermissionNote viewer={navigation} actions={['transport.driver.read']} />

      <DataTable<ExpenseClaim>
        caption="Đề nghị chi"
        rows={claims.data}
        rowKey={(claim) => claim.id}
        columns={[
          {
            key: 'driver',
            header: 'Lái xe',
            render: (claim) => driverName(claim.driverId),
            isRowHeader: true,
          },
          { key: 'category', header: 'Nhóm chi phí', render: (claim) => claim.categoryCode },
          { key: 'businessDate', header: 'Ngày', render: (claim) => claim.businessDate },
          {
            key: 'claimed',
            header: 'Lái xe đề nghị',
            render: (claim) => money(claim.claimedAmount),
            isNumeric: true,
          },
          {
            key: 'approved',
            header: 'Kế toán duyệt',
            render: (claim) => money(claim.approvedAmount),
            isNumeric: true,
          },
          {
            key: 'status',
            header: 'Trạng thái',
            render: (claim) => (
              <StatusBadge label={STATUS_LABEL[claim.status]} tone={statusTone(claim.status)} />
            ),
          },
          {
            key: 'settled',
            header: 'Đã vào giá thành',
            render: (claim) => {
              if (claim.status !== 'APPROVED') return '—';
              return claim.settlementExpenseId !== null ? (
                <StatusBadge label="Rồi" tone="done" />
              ) : (
                <StatusBadge
                  label="Chưa — đề nghị chưa gắn chuyến"
                  tone="wait"
                  title="Đường tiền đi qua một chuyến. Đề nghị này chỉ gắn vào vòng chạy hoặc chặng."
                />
              );
            },
          },
          {
            key: 'review',
            header: 'Duyệt',
            render: (claim) =>
              claim.status !== 'PENDING_REVIEW' ? null : (
                <>
                  <button
                    type="button"
                    className="tx-btn"
                    onClick={() => setPending({ claim, outcome: 'APPROVE' })}
                  >
                    Duyệt
                  </button>{' '}
                  <button
                    type="button"
                    className="tx-btn"
                    onClick={() => setPending({ claim, outcome: 'REJECT' })}
                  >
                    Từ chối
                  </button>
                </>
              ),
          },
        ]}
      />

      <ConfirmAction
        open={pending !== null}
        title={
          pending === null
            ? ''
            : pending.outcome === 'APPROVE'
              ? `Duyệt ${money(pending.claim.claimedAmount)} cho ${driverName(pending.claim.driverId)}?`
              : `Từ chối đề nghị của ${driverName(pending.claim.driverId)}?`
        }
        detail={
          pending === null || pending.outcome === 'REJECT'
            ? null
            : 'Khoản này sẽ vào giá thành chuyến và trừ vào sổ quỹ của lái xe.'
        }
        confirmLabel={pending?.outcome === 'APPROVE' ? 'Duyệt và ghi sổ' : 'Từ chối'}
        reasonLabel={pending?.outcome === 'APPROVE' ? 'Lý do duyệt' : 'Lý do từ chối'}
        reason={reason}
        onReasonChange={setReason}
        onConfirm={confirm}
        onCancel={closeDialog}
        isDestructive={pending?.outcome === 'REJECT'}
        isBusy={isBusy}
      />
    </>
  );
}
