'use client';

import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { TemporaryCredential } from '../../../lib/auth';
import { PermissionGate } from '../components/PermissionGate';
import { StatusBadge } from '../components/primitives';
import { ConfirmAction, LoadingState } from '../components/SectionState';
import { useNavigationInput } from '../hooks/useTransportWorkspace';
import { canPerform } from '../transport-actions';
import {
  ACCOUNT_STATUS_LABEL,
  ACCOUNT_STATUS_TONE,
  accountHistoryLabel,
  accountStatusOf,
  ADMIN_REASON_MAX_LENGTH,
  driverCandidates,
  formatDateTime,
  permissionLabelLookup,
  presetLabelOf,
  presetsOf,
  relativeLastLogin,
  stakeholderCandidates,
} from './accounts-model';
import { accountLinksApi, accountsApi } from './admin-api';
import { adminErrorMessage } from './admin-reasons';
import {
  useAccountAccess,
  useAccountHistory,
  useAccountLinks,
  useDriverCandidates,
  useInvalidateAccount,
  useStakeholderCandidates,
} from './admin-hooks';
import type { AccessBreakdown, AccountView, PermissionCatalog } from './admin-types';
import { AdminError, AdminNotice } from './AdminBits';
import { CredentialCard } from './CredentialCard';
import { PermissionEditor } from './PermissionEditor';

/**
 * CHI TIET MOT TAI KHOAN (`#395`) — tra loi bon cau theo thu tu Giam doc hoi:
 *
 *   1. Ai day? (danh tinh — sua duoc, tru ten dang nhap)
 *   2. Nguoi nay lam duoc gi? (cau cua MAY CHU, khong phai man hinh tu doan)
 *   3. Tai khoan noi voi ho so nao? (lai xe / ben gop von — pham vi den tu LIEN KET, khong tu vai)
 *   4. Lam gi voi no? (chinh quyen, dat lai mat khau, khoa/mo khoa, lich su)
 */

const SUMMARY_LABEL: Readonly<Record<AccessBreakdown['groups'][number]['summary'], string>> = {
  FULL: 'Đủ',
  PARTIAL: 'Một phần',
  NONE: 'Không',
};

function AccessAnswer({ access }: { readonly access: AccessBreakdown }) {
  const held = access.groups.filter((group) => group.summary !== 'NONE');
  const missing = access.groups.filter((group) => group.summary === 'NONE' && group.grantable);
  return (
    <div className="tx-admin-answer">
      <ul className="tx-admin-sentences" data-testid="access-sentences">
        {access.sentences.map((sentence) => (
          <li key={sentence}>{sentence}</li>
        ))}
      </ul>
      {access.scopes.length === 0 ? null : (
        <ul className="tx-admin-scopes">
          {access.scopes.map((scope) => (
            <li key={scope.id} data-active={scope.active ? '' : undefined}>
              <strong>{scope.label}</strong> — {scope.sentence}
            </li>
          ))}
        </ul>
      )}
      {held.length === 0 ? null : (
        <dl className="tx-admin-groupsummary">
          {held.map((group) => (
            <div key={group.id} data-summary={group.summary}>
              <dt>{group.label}</dt>
              <dd>
                {SUMMARY_LABEL[group.summary]} ·{' '}
                {
                  group.actions.filter((action) =>
                    ['PRESET', 'GRANTED', 'SCOPE_ACTIVE'].includes(action.state),
                  ).length
                }
                /{group.actions.length} việc
              </dd>
            </div>
          ))}
        </dl>
      )}
      {missing.length === 0 ? null : (
        <p className="tx-note">Không có: {missing.map((group) => group.label).join(', ')}.</p>
      )}
    </div>
  );
}

function ProfileForm({
  account,
  onDone,
  onCancel,
}: {
  readonly account: AccountView;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}) {
  const update = useMutation({
    mutationFn: (form: FormData) => {
      const text = (key: string): string | null => {
        const value = String(form.get(key) ?? '').trim();
        return value.length === 0 ? null : value;
      };
      return accountsApi.updateProfile(account.id, {
        name: text('name') ?? account.name,
        jobTitle: text('jobTitle'),
        phone: text('phone'),
        email: text('email'),
      });
    },
    onSuccess: onDone,
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    update.mutate(new FormData(event.currentTarget));
  };
  return (
    <form className="tx-form tx-admin-profileform" onSubmit={submit} aria-label="Sửa thông tin">
      <div className="tx-admin-fields">
        <label className="tx-field">
          <span>Họ tên</span>
          <input name="name" defaultValue={account.name} required maxLength={120} />
        </label>
        <label className="tx-field">
          <span>Chức danh</span>
          <input name="jobTitle" defaultValue={account.jobTitle ?? ''} maxLength={80} />
        </label>
        <label className="tx-field">
          <span>Số điện thoại</span>
          <input name="phone" defaultValue={account.phone ?? ''} inputMode="tel" maxLength={24} />
        </label>
        <label className="tx-field">
          <span>Email</span>
          <input name="email" type="email" defaultValue={account.email ?? ''} maxLength={254} />
        </label>
      </div>
      <p className="tx-note">
        Tên đăng nhập không đổi được — nó nằm trong nhật ký của mọi thao tác.
      </p>
      <AdminError error={update.error} />
      <div className="tx-admin-actions">
        <button type="submit" className="tx-btn tx-btn--go" disabled={update.isPending}>
          {update.isPending ? 'Đang lưu…' : 'Lưu thông tin'}
        </button>
        <button type="button" className="tx-btn tx-btn--ghost" onClick={onCancel}>
          Huỷ
        </button>
      </div>
    </form>
  );
}

function LinksPanel({
  account,
  isEditable,
  onChanged,
}: {
  readonly account: AccountView;
  readonly isEditable: boolean;
  readonly onChanged: (message: string) => void;
}) {
  const selectId = useId();
  const navigation = useNavigationInput();
  const links = useAccountLinks(navigation, account.id);
  const wantsDriver = account.role === 'SALE';
  const wantsStakeholder = account.role === 'MANAGER';
  const drivers = useDriverCandidates(
    navigation,
    isEditable && wantsDriver && links.data?.driver === null,
  );
  const stakeholders = useStakeholderCandidates(
    navigation,
    isEditable && wantsStakeholder && links.data?.stakeholder === null,
  );
  const [choice, setChoice] = useState('');
  const [unlinking, setUnlinking] = useState<'DRIVER' | 'STAKEHOLDER' | null>(null);
  const link = useMutation({
    mutationFn: async (input: {
      kind: 'DRIVER' | 'STAKEHOLDER';
      targetId: string;
      on: boolean;
    }) => {
      if (input.kind === 'DRIVER') {
        await accountLinksApi.linkDriver(input.targetId, input.on ? account.id : null);
      } else {
        await accountLinksApi.linkStakeholder(input.targetId, input.on ? account.id : null);
      }
      return input;
    },
    onSuccess: (input) => {
      setChoice('');
      setUnlinking(null);
      void links.refetch();
      onChanged(
        input.on
          ? input.kind === 'DRIVER'
            ? 'Đã nối hồ sơ lái xe.'
            : 'Đã nối hồ sơ bên góp vốn.'
          : 'Đã gỡ nối hồ sơ.',
      );
    },
  });

  /* Mo hop go noi: loi cua lan truoc (noi hay go) khong duoc treo lai trong hop moi. */
  const startUnlink = (kind: 'DRIVER' | 'STAKEHOLDER') => {
    link.reset();
    setUnlinking(kind);
  };

  // Noi tai khoan la viec CHI Giam doc (`transport.account_link.manage`): khong co quyen do thi query
  // khong chay — noi ro thay vi treo o "Đang đọc…" mai mai.
  if (!canPerform(navigation, 'transport.account_link.manage')) {
    return <p className="tx-note">Chỉ Giám đốc xem và nối được hồ sơ lái xe, bên góp vốn.</p>;
  }
  if (links.isPending) return <LoadingState label="Đang đọc hồ sơ đã nối…" />;
  if (links.error !== null) {
    return (
      <p className="tx-note">
        Chưa đọc được hồ sơ đã nối ({adminErrorMessage(links.error)}). Liên kết lái xe vẫn xem được
        ở Đội xe & lái xe.
      </p>
    );
  }
  const driver = links.data.driver;
  const stakeholder = links.data.stakeholder;
  const candidates = wantsDriver
    ? driverCandidates(drivers.data ?? []).map((entry) => ({
        id: entry.id,
        label: `${entry.fullName} · ${entry.phone}`,
      }))
    : stakeholderCandidates(stakeholders.data ?? []).map((entry) => ({
        id: entry.id,
        label: entry.displayName,
      }));

  return (
    <div className="tx-admin-links">
      {driver === null ? null : (
        <p className="tx-admin-link" data-testid="linked-driver">
          <span className="tx-admin-link__kind">Hồ sơ lái xe</span>
          <strong>{driver.name}</strong>
          {driver.phone == null ? null : <span> · {driver.phone}</span>}
          {driver.vehicle == null ? null : <span> · Xe {driver.vehicle.registrationPlate}</span>}
          {isEditable ? (
            <button
              type="button"
              className="tx-btn tx-btn--ghost tx-btn--small"
              onClick={() => startUnlink('DRIVER')}
            >
              Gỡ nối
            </button>
          ) : null}
        </p>
      )}
      {stakeholder === null ? null : (
        <p className="tx-admin-link" data-testid="linked-stakeholder">
          <span className="tx-admin-link__kind">Hồ sơ bên góp vốn</span>
          <strong>{stakeholder.name}</strong>
          {isEditable ? (
            <button
              type="button"
              className="tx-btn tx-btn--ghost tx-btn--small"
              onClick={() => startUnlink('STAKEHOLDER')}
            >
              Gỡ nối
            </button>
          ) : null}
        </p>
      )}
      {wantsDriver && driver === null ? (
        <p className="tx-note tx-note--warn" data-testid="driver-link-missing">
          Chưa nối hồ sơ lái xe — tài khoản này chưa làm được gì.
        </p>
      ) : null}
      {!wantsDriver && !wantsStakeholder && driver === null && stakeholder === null ? (
        <p className="tx-note">
          Không nối với hồ sơ lái xe hay bên góp vốn nào — vai này không cần.
        </p>
      ) : null}
      {wantsStakeholder && stakeholder === null && driver === null ? (
        <p className="tx-note">Chưa nối hồ sơ bên góp vốn (chỉ cần với chủ xe / bên góp vốn).</p>
      ) : null}
      {isEditable &&
      ((wantsDriver && driver === null) || (wantsStakeholder && stakeholder === null)) ? (
        <PermissionGate
          viewer={navigation}
          action={wantsDriver ? 'transport.driver.read' : 'transport.asset_ownership.read'}
        >
          <div className="tx-inlineform">
            <label className="tx-field tx-field--inline" htmlFor={selectId}>
              <span>
                {wantsDriver
                  ? 'Hồ sơ lái xe chưa có tài khoản'
                  : 'Hồ sơ bên góp vốn chưa có tài khoản'}
              </span>
              <select
                id={selectId}
                value={choice}
                onChange={(event) => setChoice(event.target.value)}
              >
                <option value="">— Chọn —</option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="tx-btn"
              disabled={choice.length === 0 || link.isPending}
              onClick={() =>
                link.mutate({
                  kind: wantsDriver ? 'DRIVER' : 'STAKEHOLDER',
                  targetId: choice,
                  on: true,
                })
              }
            >
              {wantsDriver ? 'Nối hồ sơ lái xe' : 'Nối hồ sơ bên góp vốn'}
            </button>
          </div>
        </PermissionGate>
      ) : null}
      {unlinking === null ? <AdminError error={link.error} /> : null}
      <ConfirmAction
        open={unlinking !== null}
        title="Gỡ nối hồ sơ?"
        detail={
          unlinking === 'DRIVER'
            ? 'Tài khoản vẫn đăng nhập được nhưng không còn làm được việc của lái xe này nữa (chuyến, mốc hiện trường, quỹ).'
            : 'Tài khoản không còn xem được xe của bên góp vốn này nữa.'
        }
        confirmLabel="Gỡ nối"
        isDestructive
        isBusy={link.isPending}
        error={<AdminError error={link.error} />}
        onCancel={() => setUnlinking(null)}
        onConfirm={() => {
          const targetId = unlinking === 'DRIVER' ? driver?.id : stakeholder?.id;
          if (unlinking !== null && targetId !== undefined) {
            link.mutate({ kind: unlinking, targetId, on: false });
          }
        }}
      />
    </div>
  );
}

function HistoryList({ userId }: { readonly userId: string }) {
  const history = useAccountHistory(userId, true);
  if (history.isPending) return <LoadingState label="Đang đọc lịch sử…" />;
  if (history.error !== null) return <AdminError error={history.error} />;
  if (history.data.length === 0) return <p className="tx-note">Chưa có thay đổi nào được ghi.</p>;
  return (
    <ol className="tx-admin-history">
      {history.data.map((entry) => (
        <li key={`${entry.at}-${entry.action}`}>
          <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
          <span className="tx-admin-history__who">{entry.actor}</span>
          <span>{accountHistoryLabel(entry)}</span>
        </li>
      ))}
    </ol>
  );
}

type Dialog = 'RESET' | 'DISABLE' | 'ENABLE' | null;

export function AccountDetail({
  account,
  catalog,
  currentUserId,
  onClose,
}: {
  readonly account: AccountView;
  readonly catalog: PermissionCatalog | undefined;
  readonly currentUserId: string | null;
  readonly onClose: () => void;
}) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [mode, setMode] = useState<'VIEW' | 'PROFILE' | 'ACCESS'>('VIEW');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState('');
  const [credential, setCredential] = useState<TemporaryCredential | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const access = useAccountAccess(account.id);
  const invalidate = useInvalidateAccount();
  const labelOf = permissionLabelLookup(catalog);
  const status = accountStatusOf(account);
  const isSelf = currentUserId === account.id;
  const isProtected = account.isProtected === true;
  const isEditable = !isSelf && !isProtected;

  /*
   * Mo chi tiet = tieu diem len TIEU DE chi tiet (nhu trinh tao, trinh sua dia diem). Tren man hep
   * danh sach bi an khi chi tiet mo, nen nut vua bam bien mat — de nguyen thi tieu diem roi ve `<body>`.
   */
  useEffect(() => heading.current?.focus(), []);

  const changed = (message: string) => {
    setNotice(message);
    invalidate(account.id);
  };

  const reset = useMutation({
    mutationFn: () => accountsApi.resetPassword(account.id),
    onSuccess: (result) => {
      setDialog(null);
      setCredential(result.credential ?? null);
      changed(
        result.credential === undefined
          ? `Đã đặt lại mật khẩu cho ${account.name}.`
          : `Đã đặt lại mật khẩu cho ${account.name}. Mọi phiên cũ đã kết thúc.`,
      );
    },
  });
  const disable = useMutation({
    mutationFn: () => accountsApi.disable(account.id, reason),
    onSuccess: () => {
      setDialog(null);
      setReason('');
      changed(`Đã khoá ${account.name}. Mọi phiên đăng nhập của người này đã kết thúc.`);
    },
  });
  const enable = useMutation({
    mutationFn: () => accountsApi.enable(account.id),
    onSuccess: () => {
      setDialog(null);
      changed(`Đã mở khoá ${account.name}. Mật khẩu không đổi — cần thì đặt lại mật khẩu.`);
    },
  });

  /* Mo MOT hop xac nhan: loi cu cua ca ba viec bi xoa, hop moi chi noi ve lan bam nay. */
  const openDialog = (next: Exclude<Dialog, null>) => {
    reset.reset();
    disable.reset();
    enable.reset();
    setDialog(next);
  };

  return (
    <article className="tx-admin-sheet" aria-labelledby={titleId} data-testid="account-detail">
      <header className="tx-admin-sheet__head">
        <div>
          <p className="tx-admin-eyebrow">{presetLabelOf(account.role, presetsOf(catalog))}</p>
          <h2 id={titleId} ref={heading} tabIndex={-1}>
            {account.name}
          </h2>
          <p className="tx-admin-mono">{account.username}</p>
        </div>
        <div className="tx-admin-sheet__badges">
          <StatusBadge label={ACCOUNT_STATUS_LABEL[status]} tone={ACCOUNT_STATUS_TONE[status]} />
          {isProtected ? <StatusBadge label="Tài khoản hệ thống" tone="flat" /> : null}
        </div>
        <button
          type="button"
          className="tx-btn tx-btn--ghost tx-btn--small tx-admin-sheet__close"
          onClick={onClose}
        >
          Đóng<span className="tx-visually-hidden"> chi tiết {account.name}</span>
        </button>
      </header>

      <AdminNotice message={notice} />
      {credential === null ? null : (
        <CredentialCard
          name={account.name}
          username={account.username}
          credential={credential}
          onClose={() => setCredential(null)}
        />
      )}

      {isProtected ? (
        <p className="tx-note tx-note--warn">
          Tài khoản hệ thống — không sửa được ở đây. Bộ phận triển khai quản lý tài khoản này.
        </p>
      ) : null}
      {isSelf ? (
        <p className="tx-note">
          Đây là tài khoản bạn đang dùng: không tự khoá, tự đổi quyền hay tự đặt lại mật khẩu ở đây.
          Đổi mật khẩu của bạn ở menu tài khoản.
        </p>
      ) : null}

      <section className="tx-admin-block" aria-label="Thông tin">
        <h3>Thông tin</h3>
        {mode === 'PROFILE' ? (
          <ProfileForm
            account={account}
            onDone={() => {
              setMode('VIEW');
              changed('Đã lưu thông tin.');
            }}
            onCancel={() => setMode('VIEW')}
          />
        ) : (
          <dl className="tx-admin-facts">
            <div>
              <dt>Chức danh</dt>
              <dd>{account.jobTitle ?? '—'}</dd>
            </div>
            <div>
              <dt>Điện thoại</dt>
              <dd>{account.phone ?? '—'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{account.email ?? '—'}</dd>
            </div>
            <div>
              <dt>Đăng nhập gần nhất</dt>
              <dd>{relativeLastLogin(account.lastLoginAt, new Date())}</dd>
            </div>
            {account.mustChangePassword === true ? (
              <div>
                <dt>Mật khẩu tạm hết hạn</dt>
                <dd>{formatDateTime(account.temporaryPasswordExpiresAt)}</dd>
              </div>
            ) : null}
          </dl>
        )}
        {mode === 'VIEW' && !isProtected ? (
          <button
            type="button"
            className="tx-btn tx-btn--ghost tx-btn--small"
            onClick={() => setMode('PROFILE')}
          >
            Sửa thông tin
          </button>
        ) : null}
      </section>

      <section className="tx-admin-block" aria-label="Người này làm được gì?">
        <h3>Người này làm được gì?</h3>
        {mode === 'ACCESS' && catalog !== undefined ? (
          <PermissionEditor
            account={account}
            catalog={catalog}
            onCancel={() => setMode('VIEW')}
            onSaved={() => {
              setMode('VIEW');
              changed('Đã lưu quyền. Thay đổi có hiệu lực từ thao tác kế tiếp của người này.');
            }}
          />
        ) : access.isPending ? (
          <LoadingState label="Đang hỏi máy chủ…" />
        ) : access.error !== null ? (
          <AdminError
            error={access.error}
            labelOf={labelOf}
            onRetry={() => void access.refetch()}
          />
        ) : (
          <AccessAnswer access={access.data} />
        )}
        {mode === 'VIEW' && isEditable && account.disabledAt == null ? (
          <button
            type="button"
            className="tx-btn"
            disabled={catalog === undefined}
            onClick={() => setMode('ACCESS')}
          >
            Chỉnh quyền
          </button>
        ) : null}
      </section>

      <section className="tx-admin-block" aria-label="Hồ sơ đã nối">
        <h3>Hồ sơ đã nối</h3>
        <LinksPanel account={account} isEditable={isEditable} onChanged={changed} />
      </section>

      {isEditable ? (
        <section className="tx-admin-block tx-admin-block--danger" aria-label="Mật khẩu và khoá">
          <h3>Mật khẩu và khoá</h3>
          <div className="tx-admin-actions">
            {account.disabledAt == null ? (
              <>
                <button type="button" className="tx-btn" onClick={() => openDialog('RESET')}>
                  Đặt lại mật khẩu
                </button>
                <button
                  type="button"
                  className="tx-btn tx-btn--stop"
                  onClick={() => openDialog('DISABLE')}
                >
                  Khoá tài khoản
                </button>
              </>
            ) : (
              <button
                type="button"
                className="tx-btn tx-btn--go"
                onClick={() => openDialog('ENABLE')}
              >
                Mở khoá tài khoản
              </button>
            )}
          </div>
        </section>
      ) : null}

      <section className="tx-admin-block" aria-label="Lịch sử">
        <button
          type="button"
          className="tx-btn tx-btn--ghost tx-btn--small"
          aria-expanded={isHistoryOpen}
          onClick={() => setIsHistoryOpen((open) => !open)}
        >
          {isHistoryOpen ? 'Ẩn lịch sử' : 'Lịch sử thay đổi'}
        </button>
        {isHistoryOpen ? <HistoryList userId={account.id} /> : null}
      </section>

      <ConfirmAction
        open={dialog === 'RESET'}
        title={`Đặt lại mật khẩu cho ${account.name}?`}
        detail="Mọi phiên đăng nhập của người này kết thúc ngay. Hệ thống tạo một mật khẩu tạm dùng trong 72 giờ; lần đầu đăng nhập người này phải đặt mật khẩu riêng."
        confirmLabel="Đặt lại mật khẩu"
        isBusy={reset.isPending}
        error={<AdminError error={reset.error} labelOf={labelOf} />}
        onCancel={() => setDialog(null)}
        onConfirm={() => reset.mutate()}
      />
      <ConfirmAction
        open={dialog === 'DISABLE'}
        title={`Khoá tài khoản ${account.name}?`}
        detail="Người này bị đăng xuất ngay và không đăng nhập được nữa. Lịch sử thao tác vẫn giữ nguyên; mở khoá lại được bất cứ lúc nào."
        confirmLabel="Khoá tài khoản"
        reasonLabel="Lý do khoá (ghi vào nhật ký)"
        reason={reason}
        onReasonChange={setReason}
        reasonMaxLength={ADMIN_REASON_MAX_LENGTH}
        isDestructive
        isBusy={disable.isPending}
        error={<AdminError error={disable.error} labelOf={labelOf} />}
        onCancel={() => setDialog(null)}
        onConfirm={() => disable.mutate()}
      />
      <ConfirmAction
        open={dialog === 'ENABLE'}
        title={`Mở khoá ${account.name}?`}
        detail="Người này đăng nhập lại được bằng mật khẩu cũ. Nếu họ quên mật khẩu, đặt lại mật khẩu sau khi mở khoá."
        confirmLabel="Mở khoá"
        isBusy={enable.isPending}
        error={<AdminError error={enable.error} labelOf={labelOf} />}
        onCancel={() => setDialog(null)}
        onConfirm={() => enable.mutate()}
      />
    </article>
  );
}
