'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AuthRole } from '../../../lib/auth';
import { useAuth } from '../../../components/auth/AuthGate';
import { PageHeader, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import { useNavigationInput } from '../hooks/useTransportWorkspace';
import { hasPlatformPermission, PLATFORM_ACCOUNTS_MANAGE } from '../transport-actions';
import {
  ACCOUNT_STATUS_LABEL,
  ACCOUNT_STATUS_TONE,
  accountStatusOf,
  countAccounts,
  EMPTY_ACCOUNT_FILTER,
  filterAccounts,
  grantDeltaLabel,
  presetLabelOf,
  presetsOf,
  relativeLastLogin,
  ROLE_LABEL,
  type AccountFilter,
} from './accounts-model';
import { adminErrorMessage } from './admin-reasons';
import { useAccounts, usePermissionCatalog } from './admin-hooks';
import type { AccountStatusFilter, AccountView } from './admin-types';
import { ChipRow, FilterChip, focusOpener } from './AdminBits';
import { AccountDetail } from './AccountDetail';
import { AccountWizard } from './AccountWizard';
import './transport-admin.css';

/**
 * "Tài khoản & quyền" (`#395` §3.2) — ai dang nhap duoc, moi nguoi lam duoc gi.
 *
 * Bo cuc SO: danh sach ben trai (tim, loc theo trang thai va vai), chi tiet ben phai. Tren dien thoai
 * danh sach va chi tiet chong len nhau — chi tiet mo ra thi len tren, nut "Đóng" ve danh sach.
 *
 * `selection` la TEN DANG NHAP — mot dinh danh nghiep vu nguoi ta doc duoc, dung quy uoc
 * `SELECTION_QUERY_PARAM` (khong bao gio la `id` ky thuat).
 */

const STATUS_FILTERS: readonly (AccountStatusFilter | 'all')[] = [
  'all',
  'active',
  'pending',
  'disabled',
];
const STATUS_FILTER_LABEL: Readonly<Record<AccountStatusFilter | 'all', string>> = {
  all: 'Tất cả',
  active: 'Đang hoạt động',
  pending: 'Chờ đổi mật khẩu',
  disabled: 'Đã khoá',
};
const ROLE_FILTERS: readonly (AuthRole | 'all')[] = [
  'all',
  'ADMIN',
  'ACCOUNTING',
  'MANAGER',
  'SALE',
];

function PersonRow({
  account,
  presetLabel,
  isSelected,
  onOpen,
}: {
  readonly account: AccountView;
  readonly presetLabel: string;
  readonly isSelected: boolean;
  readonly onOpen: () => void;
}) {
  const status = accountStatusOf(account);
  const delta = grantDeltaLabel(account.permissionGrants);
  return (
    <li>
      <button
        type="button"
        className="tx-admin-person"
        aria-current={isSelected ? 'true' : undefined}
        data-opens={account.username}
        onClick={onOpen}
      >
        <span className="tx-admin-person__name">{account.name}</span>
        <span className="tx-admin-person__meta">
          <span className="tx-admin-mono">{account.username}</span>
          <span>{presetLabel}</span>
          {delta === null ? null : <span className="tx-admin-person__delta">{delta}</span>}
        </span>
        <span className="tx-admin-person__side">
          <StatusBadge label={ACCOUNT_STATUS_LABEL[status]} tone={ACCOUNT_STATUS_TONE[status]} />
          {account.isProtected === true ? <StatusBadge label="Hệ thống" tone="flat" /> : null}
          <span className="tx-admin-person__login">
            {relativeLastLogin(account.lastLoginAt, new Date())}
          </span>
        </span>
      </button>
    </li>
  );
}

export function AccountsAdminView({
  selection,
  onSelect,
}: {
  readonly selection: string | null;
  readonly onSelect: (selection: string | null) => void;
}) {
  const navigation = useNavigationInput();
  const { user } = useAuth();
  const allowed = hasPlatformPermission(navigation, PLATFORM_ACCOUNTS_MANAGE);
  const accounts = useAccounts(allowed);
  const catalog = usePermissionCatalog(allowed);
  const [filter, setFilter] = useState<AccountFilter>(EMPTY_ACCOUNT_FILTER);
  const [isCreating, setIsCreating] = useState(false);
  const list = useMemo(() => accounts.data ?? [], [accounts.data]);
  const presets = presetsOf(catalog.data);
  const counts = countAccounts(list);
  const visible = filterAccounts(list, filter);
  const selected =
    selection === null ? null : (list.find((entry) => entry.username === selection) ?? null);

  /* Dong chi tiet → tieu diem ve DUNG dong da mo no, sau khi danh sach hien lai. */
  const listRef = useRef<HTMLElement>(null);
  const returnFocusTo = useRef<string | null>(null);
  const hasDetail = selected !== null || isCreating;
  useEffect(() => {
    if (hasDetail || returnFocusTo.current === null) return;
    // Dong do da bi loc khuat: ve o tim cua danh sach, khong de tieu diem roi ve `<body>`.
    if (!focusOpener(listRef.current, returnFocusTo.current)) {
      listRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    }
    returnFocusTo.current = null;
  }, [hasDetail]);

  if (!allowed) {
    return (
      <>
        <PageHeader title="Tài khoản & quyền" />
        <ErrorState message="Chỉ Giám đốc quản trị tài khoản và phân quyền." />
      </>
    );
  }

  return (
    <div className="tx-admin">
      <PageHeader
        title="Tài khoản & quyền"
        summary="Ai đăng nhập được, mỗi người làm được gì. Quyền đổi có hiệu lực từ thao tác kế tiếp của người đó."
        context={
          <p className="tx-admin-counts" aria-label="Số tài khoản">
            <span>
              <strong>{counts.all}</strong> tài khoản
            </span>
            <span>
              <strong>{counts.active}</strong> đang hoạt động
            </span>
            <span>
              <strong>{counts.pending}</strong> chờ đổi mật khẩu
            </span>
            <span>
              <strong>{counts.disabled}</strong> đã khoá
            </span>
          </p>
        }
        actions={
          <button
            type="button"
            className="tx-btn tx-btn--go"
            onClick={() => {
              onSelect(null);
              setIsCreating(true);
            }}
          >
            Thêm tài khoản
          </button>
        }
      />

      <div className="tx-admin-split" data-has-detail={hasDetail ? '' : undefined}>
        <section className="tx-admin-listpane" aria-label="Danh sách tài khoản" ref={listRef}>
          <label className="tx-field tx-admin-search">
            <span>Tìm theo tên, tên đăng nhập, chức danh, số điện thoại</span>
            <input
              type="search"
              value={filter.query}
              onChange={(event) => setFilter({ ...filter, query: event.target.value })}
            />
          </label>
          <ChipRow label="Lọc theo trạng thái">
            {STATUS_FILTERS.map((status) => (
              <FilterChip
                key={status}
                label={STATUS_FILTER_LABEL[status]}
                count={
                  status === 'all'
                    ? counts.all
                    : status === 'active'
                      ? counts.active
                      : status === 'pending'
                        ? counts.pending
                        : counts.disabled
                }
                isPressed={filter.status === status}
                onClick={() => setFilter({ ...filter, status })}
              />
            ))}
          </ChipRow>
          <ChipRow label="Lọc theo vai">
            {ROLE_FILTERS.map((role) => (
              <FilterChip
                key={role}
                label={role === 'all' ? 'Mọi vai' : presetLabelOf(role, presets)}
                count={role === 'all' ? undefined : counts.byRole[role]}
                isPressed={filter.role === role}
                onClick={() => setFilter({ ...filter, role })}
              />
            ))}
          </ChipRow>

          {accounts.isPending ? <LoadingState label="Đang đọc danh sách tài khoản…" /> : null}
          {accounts.error === null ? null : (
            <ErrorState
              message={adminErrorMessage(accounts.error)}
              onRetry={() => void accounts.refetch()}
            />
          )}
          {!accounts.isPending && visible.length === 0 && accounts.error === null ? (
            <EmptyState title="Không có tài khoản nào khớp bộ lọc." />
          ) : (
            <ul className="tx-admin-people" aria-label="Tài khoản">
              {visible.map((account) => (
                <PersonRow
                  key={account.id}
                  account={account}
                  presetLabel={presetLabelOf(account.role, presets) ?? ROLE_LABEL[account.role]}
                  isSelected={selected?.id === account.id}
                  onOpen={() => {
                    setIsCreating(false);
                    onSelect(account.username);
                  }}
                />
              ))}
            </ul>
          )}
        </section>

        <div className="tx-admin-detailpane">
          {isCreating ? (
            <AccountWizard
              catalog={catalog.data}
              onCancel={() => setIsCreating(false)}
              onFinished={(account) => {
                setIsCreating(false);
                onSelect(account?.username ?? null);
              }}
            />
          ) : selected !== null ? (
            <AccountDetail
              key={selected.id}
              account={selected}
              catalog={catalog.data}
              currentUserId={user?.id ?? null}
              onClose={() => {
                returnFocusTo.current = selected.username;
                onSelect(null);
              }}
            />
          ) : (
            <div className="tx-admin-placeholder">
              <p>Chọn một tài khoản để xem người đó làm được gì, đặt lại mật khẩu hoặc khoá.</p>
              <p className="tx-note">
                Mỗi thay đổi quyền, khoá hay đặt lại mật khẩu đều được ghi vào lịch sử với tên bạn.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
