'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import {
  customGrantCount,
  isNeverLoggedIn,
  relativeLastLogin,
  roleChangeNeedsConfirmation,
} from '../../lib/account-format';
import {
  authApi,
  type AuthRole,
  type AuthUser,
  type AuthUserWithCredential,
  type CreateUserInput,
  type TemporaryCredential,
} from '../../lib/auth';
import { useAuth } from '../auth/AuthGate';
import { PASSWORD_MIN_LENGTH } from '../auth/session-signals';
import { SettingsCredentialCard } from './SettingsCredentialCard';
import {
  SettingsActionRow,
  SettingsAdvanced,
  SettingsFocusModal,
  SettingsStatusBar,
  SettingsWorkCard,
  useFocusIntent,
  useFocusOnKey,
  useRestoreFocus,
} from './SettingsFocus';
import { SettingsPanelState } from './SettingsPanelState';

const ROLE_LABELS: Record<AuthRole, string> = {
  SALE: 'Sale',
  MANAGER: 'Quản lý',
  ACCOUNTING: 'Kế toán',
  ADMIN: 'Quản trị',
};

type Mode =
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'manage'; userId: string }
  | { kind: 'reset'; userId: string }
  | { kind: 'disable'; userId: string }
  | { kind: 'promote'; userId: string }
  | { kind: 'role'; userId: string; role: AuthRole };

/** Mat khau tam vua cap — chi giu trong bo nho cua man hinh cho toi khi dong the. */
interface IssuedCredential {
  readonly name: string;
  readonly username: string;
  readonly credential: TemporaryCredential;
}

/** Tao tai khoan vai Quan tri doi mot lan xac nhan rieng (`confirmEscalation`, `#395`). */
type PendingCreate = { readonly input: CreateUserInput; readonly form: HTMLFormElement };

/** Cau canh bao: doi vai bang duong nay XOA het quyen rieng cua tai khoan. */
const grantsDropSentence = (count: number): string =>
  `Tài khoản này đang có ${count} quyền riêng (cấp thêm hoặc bớt đi so với vai). Đổi vai ở đây sẽ xoá hết các quyền riêng đó — muốn giữ hoặc chỉnh từng quyền, dùng màn “Tài khoản & quyền”.`;

/**
 * Quan ly tai khoan — danh sach truoc, mot viec mot luc (#146 §10).
 *
 * Ba thay doi so voi ban cu:
 *  1. bieu mau tao tai khoan KHONG con mo san — no chi xuat hien khi nguoi dung chon "Thêm";
 *  2. ba nut `doi vai tro` / `dat lai mat khau` / `vo hieu hoa` khong con ngang hang tren moi dong:
 *     chon mot tai khoan moi mo ra mot be mat quan ly, va ba thao tac do duoc xep theo RUI RO;
 *  3. `window.prompt` cho mat khau tam bi thay bang mot hop thoai trong ung dung — `prompt` khong
 *     che duoc ky tu, khong kiem duoc do dai, va khong giu duoc tieu diem.
 *
 * KHONG noi long quyen: may chu van doi ADMIN cho ca `GET`, va man nay van tu tra ve trang thai
 * "chi quan tri vien" khi vai tro khong du.
 */
export function UsersSettings() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string>();
  const [issued, setIssued] = useState<IssuedCredential | null>(null);
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null);

  const users = useQuery({
    queryKey: ['auth-users'],
    queryFn: authApi.users,
    enabled: auth.user?.role === 'ADMIN',
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['auth-users'] });
  /** Mat khau tam do may chu tao (`credential`) — hien the MOT lan. Than cu khong co thi bo qua. */
  const rememberCredential = (result: AuthUserWithCredential) => {
    if (result.credential !== undefined) {
      setIssued({ name: result.name, username: result.username, credential: result.credential });
    }
  };
  const create = useMutation({ mutationFn: authApi.createUser, onSuccess: invalidate });
  const assign = useMutation({
    mutationFn: ({ id, role, confirm }: { id: string; role: AuthRole; confirm?: boolean }) =>
      authApi.assignRole(id, role, confirm),
    onSuccess: invalidate,
  });
  const disable = useMutation({
    mutationFn: (id: string) => authApi.disableUser(id),
    onSuccess: invalidate,
  });
  const enable = useMutation({ mutationFn: authApi.enableUser, onSuccess: invalidate });
  const reset = useMutation({
    mutationFn: ({ id, password: next }: { id: string; password: string }) =>
      authApi.resetPassword(id, next),
    onSuccess: invalidate,
  });

  const workHeading = useRef<HTMLHeadingElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  // Hai nut mo hop thoai. Hop thoai doc lai chung LUC DONG (`returnFocus`), nen chung phai la ref
  // song chu khong phai mot nut duoc chup lai luc mo.
  const resetTrigger = useRef<HTMLButtonElement>(null);
  const disableTrigger = useRef<HTMLButtonElement>(null);
  const intent = useFocusIntent();
  const { rememberTrigger } = useRestoreFocus(mode.kind !== 'list');
  // `null` khi ve danh sach: luc do tieu diem thuoc ve `useRestoreFocus` (tra ve nut da mo),
  // hai co che cung gianh mot tieu diem thi khong cai nao dung.
  useFocusOnKey(workHeading, mode.kind === 'list' ? null : modeKey(mode), intent);

  if (auth.user?.role !== 'ADMIN') {
    return (
      <SettingsPanelState
        title="Chỉ quản trị viên"
        detail="Vai trò hiện tại không được phép cấp tài khoản hoặc đổi quyền."
      />
    );
  }

  const list = users.data ?? [];
  const selected = managing(mode) ? list.find((user) => user.id === mode.userId) : undefined;
  const active = list.filter((user) => !user.disabledAt);
  const error =
    create.error ?? assign.error ?? disable.error ?? enable.error ?? reset.error ?? users.error;

  const submitCreate = async (input: CreateUserInput, form: HTMLFormElement) => {
    let result: AuthUserWithCredential;
    try {
      result = await create.mutateAsync(input);
    } catch {
      // Loi that duoc hien o khoi loi ben duoi; o day chi giu nguoi dung o lai bieu mau.
      return;
    }
    form.reset();
    setMode({ kind: 'list' });
    rememberCredential(result);
    setMessage(
      result.credential === undefined
        ? 'Đã tạo tài khoản. Hãy chuyển mật khẩu ban đầu qua kênh an toàn — lần đầu đăng nhập người dùng phải đổi mật khẩu.'
        : 'Đã tạo tài khoản. Gửi lời nhắn bên dưới cho người dùng — lần đầu đăng nhập họ phải đổi mật khẩu.',
    );
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(undefined);
    setMessage('');
    setIssued(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const input: CreateUserInput = {
      username: String(data.get('username') ?? ''),
      name: String(data.get('name') ?? ''),
      // Rong = may chu tao mat khau tam (`authApi.createUser` khong gui chuoi rong).
      password: String(data.get('password') ?? ''),
      role: String(data.get('role') ?? 'SALE') as AuthRole,
    };
    if (input.role === 'ADMIN') {
      setPendingCreate({ input, form });
      return;
    }
    await submitCreate(input, form);
  };

  return (
    <div className="settings-section-stack">
      <header className="settings-section-heading">
        <div>
          <p className="settings-eyebrow">Danh tính &amp; quyền</p>
          <h2>Người dùng &amp; phân quyền</h2>
          <p>Ai đăng nhập được vào hệ thống, và mỗi người được làm gì.</p>
        </div>
      </header>

      <SettingsStatusBar
        tone="ok"
        title={`${active.length} tài khoản đang hoạt động`}
        detail="Chỉ quản trị viên mới cấp được tài khoản và đổi được quyền."
        facts={[
          { label: 'Tổng số', value: `${list.length}` },
          {
            label: 'Chờ đổi mật khẩu',
            value: `${active.filter((user) => user.mustChangePassword === true).length}`,
          },
          { label: 'Đã vô hiệu hóa', value: `${list.length - active.length}` },
        ]}
      />

      {message && (
        <SettingsPanelState tone="success" title="Đã cập nhật tài khoản" detail={message} />
      )}
      {error && (
        <SettingsPanelState
          tone="error"
          title="Thao tác tài khoản chưa hoàn tất"
          detail={error.message}
        />
      )}

      {issued ? (
        // The mat khau tam LA viec dang lam luc nay (mot khoi viec, mot nut chinh): gui no di roi
        // moi quay lai danh sach / tai khoan dang quan ly.
        <SettingsCredentialCard
          name={issued.name}
          username={issued.username}
          credential={issued.credential}
          onClose={() => setIssued(null)}
        />
      ) : mode.kind === 'create' ? (
        <SettingsWorkCard
          eyebrow="Đang làm"
          title="Thêm người dùng mới"
          problem="Để trống mật khẩu thì hệ thống tạo mật khẩu tạm và hiện một lần để bạn gửi đi. Lần đầu đăng nhập, người dùng phải đổi mật khẩu."
          headingId="settings-users-work"
          headingRef={workHeading}
        >
          <form id="settings-users-create" onSubmit={handleCreate}>
            <div className="settings-focus-grid">
              <label className="settings-focus-choice">
                <span>Họ tên</span>
                <input ref={nameField} name="name" required maxLength={120} />
              </label>
              <label className="settings-focus-choice">
                <span>Tên đăng nhập</span>
                <input name="username" required minLength={3} maxLength={64} />
              </label>
              <label className="settings-focus-choice">
                <span>Mật khẩu ban đầu (tuỳ chọn, ít nhất {PASSWORD_MIN_LENGTH} ký tự)</span>
                <input
                  name="password"
                  type="password"
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder="Để trống để hệ thống tạo mật khẩu tạm"
                />
              </label>
              <label className="settings-focus-choice">
                <span>Vai trò</span>
                <select name="role" defaultValue="SALE">
                  {Object.entries(ROLE_LABELS).map(([role, label]) => (
                    <option key={role} value={role}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {formError && <p className="settings-focus-choice__error">{formError}</p>}
            <SettingsActionRow
              primary={
                <button
                  type="submit"
                  className="settings-button settings-button--primary"
                  disabled={create.isPending}
                >
                  {create.isPending ? 'Đang tạo…' : 'Tạo tài khoản'}
                </button>
              }
              secondary={
                <button
                  type="button"
                  className="settings-button settings-button--quiet"
                  onClick={() => setMode({ kind: 'list' })}
                >
                  Hủy
                </button>
              }
            />
          </form>
        </SettingsWorkCard>
      ) : selected && managing(mode) ? (
        // Van render trong luc hop xac nhan dang mo: hop thoai la mot BUOC CON cua viec quan ly tai
        // khoan nay. Thao the nay di thi nut da mo hop bien mat khoi DOM, va khong con gi de tra
        // tieu diem ve khi hop dong (#154 Finding B).
        <SettingsWorkCard
          eyebrow="Đang quản lý tài khoản"
          title={selected.name}
          problem={`@${selected.username}${selected.disabledAt ? ' · tài khoản đã bị vô hiệu hóa' : ''} · ${lastLoginPhrase(selected)}`}
          headingId="settings-users-work"
          headingRef={workHeading}
          tone={selected.disabledAt ? 'blocked' : 'attention'}
          actions={
            <SettingsActionRow
              primary={
                <button
                  type="button"
                  className="settings-button settings-button--primary"
                  onClick={() => setMode({ kind: 'list' })}
                >
                  Xong
                </button>
              }
              secondary={
                // Tu dat lai mat khau cua chinh minh o day se tu khoa minh ra ngoai (`SELF_LOCKOUT`):
                // doi mat khau cua ban dung duong "doi mat khau" rieng.
                selected.id === auth.user?.id ? undefined : (
                  <button
                    type="button"
                    ref={resetTrigger}
                    className="settings-button settings-button--quiet"
                    onClick={() => {
                      setPassword('');
                      setFormError(undefined);
                      setIssued(null);
                      setMode({ kind: 'reset', userId: selected.id });
                    }}
                  >
                    Đặt lại mật khẩu
                  </button>
                )
              }
              tertiary={
                selected.id === auth.user?.id || selected.disabledAt ? undefined : (
                  <button
                    type="button"
                    ref={disableTrigger}
                    className="settings-text-action settings-text-action--danger"
                    onClick={() => setMode({ kind: 'disable', userId: selected.id })}
                  >
                    Vô hiệu hóa tài khoản
                  </button>
                )
              }
            />
          }
        >
          <label className="settings-focus-choice">
            <span>Vai trò</span>
            <select
              aria-label={`Vai trò của ${selected.name}`}
              value={selected.role}
              disabled={selected.id === auth.user?.id || Boolean(selected.disabledAt)}
              onChange={(event) => {
                const role = event.target.value as AuthRole;
                // Len vai Quan tri = toan quyen: hoi truoc, may chu doi `confirmEscalation`.
                // Tai khoan CO quyen rieng: duong doi vai nay xoa chung — cung hoi truoc.
                if (role === 'ADMIN') setMode({ kind: 'promote', userId: selected.id });
                else if (roleChangeNeedsConfirmation(selected, role)) {
                  setMode({ kind: 'role', userId: selected.id, role });
                } else assign.mutate({ id: selected.id, role });
              }}
            >
              {Object.entries(ROLE_LABELS).map(([role, label]) => (
                <option key={role} value={role}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {selected.id === auth.user?.id && (
            <p className="settings-muted">
              Đây là tài khoản bạn đang dùng, nên không tự đổi quyền, tự đặt lại mật khẩu hay tự vô
              hiệu hóa được.
            </p>
          )}
          {selected.mustChangePassword === true && (
            <p className="settings-muted">
              Đang dùng mật khẩu tạm — người dùng phải đổi mật khẩu ở lần đăng nhập tới.
            </p>
          )}
        </SettingsWorkCard>
      ) : (
        <SettingsWorkCard
          eyebrow="Việc có thể làm ở đây"
          title="Cấp tài khoản cho người mới"
          problem="Chọn một tài khoản trong danh sách bên dưới để đổi quyền hoặc đặt lại mật khẩu."
          tone="ok"
          headingId="settings-users-work"
          headingRef={workHeading}
          actions={
            <SettingsActionRow
              primary={
                <button
                  type="button"
                  ref={rememberTrigger}
                  className="settings-button settings-button--primary"
                  onClick={() => {
                    intent.requestFocus();
                    setMessage('');
                    setMode({ kind: 'create' });
                  }}
                >
                  Thêm người dùng
                </button>
              }
            />
          }
        />
      )}

      <section aria-labelledby="settings-users-list">
        <div className="settings-subheading">
          <h3 id="settings-users-list">Tài khoản đang hoạt động</h3>
          <span className="settings-count">{active.length} tài khoản</span>
        </div>
        {users.isLoading ? (
          <SettingsPanelState title="Đang tải tài khoản" detail="Đối chiếu quyền đang được cấp…" />
        ) : (
          <ul className="settings-focus-queue">
            {active.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                selected={selected?.id === user.id}
                onOpen={(node) => {
                  intent.requestFocus();
                  rememberTrigger(node);
                  setMessage('');
                  setMode({ kind: 'manage', userId: user.id });
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {list.length > active.length && (
        <SettingsAdvanced
          title="Tài khoản đã vô hiệu hóa"
          hint={`${list.length - active.length} tài khoản`}
        >
          <ul className="settings-focus-queue">
            {list
              .filter((user) => user.disabledAt)
              .map((user) => (
                <li key={user.id}>
                  <div>
                    <strong>{user.name}</strong>
                  </div>
                  <button
                    type="button"
                    className="settings-button settings-button--quiet"
                    disabled={enable.isPending}
                    onClick={() =>
                      enable.mutate(user.id, {
                        onSuccess: () =>
                          setMessage(
                            `Đã mở khoá ${user.name}. Mật khẩu không đổi — cần thì đặt lại mật khẩu.`,
                          ),
                      })
                    }
                  >
                    Mở khoá
                  </button>
                  <small>
                    @{user.username} · {ROLE_LABELS[user.role] ?? user.role} · Đã vô hiệu hóa
                  </small>
                </li>
              ))}
          </ul>
        </SettingsAdvanced>
      )}

      {mode.kind === 'reset' && selected && (
        <SettingsFocusModal
          title={`Đặt lại mật khẩu cho ${selected.name}`}
          description="Mọi phiên đăng nhập của người này kết thúc ngay. Để trống thì hệ thống tạo mật khẩu tạm (hiệu lực 72 giờ); lần đầu đăng nhập người dùng phải đổi mật khẩu."
          confirmLabel="Đặt lại mật khẩu"
          tone="primary"
          pending={reset.isPending}
          confirmDisabled={password.length > 0 && password.length < PASSWORD_MIN_LENGTH}
          returnFocus={() => resetTrigger.current}
          onCancel={() => setMode({ kind: 'manage', userId: selected.id })}
          onConfirm={() => {
            if (password.length > 0 && password.length < PASSWORD_MIN_LENGTH) {
              setFormError(
                `Mật khẩu tạm phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự, hoặc để trống.`,
              );
              return;
            }
            reset.mutate(
              { id: selected.id, password },
              {
                onSuccess: (result) => {
                  setPassword('');
                  rememberCredential(result);
                  setMessage(`Đã đặt lại mật khẩu cho ${selected.name}.`);
                  setMode({ kind: 'manage', userId: selected.id });
                },
              },
            );
          }}
        >
          <label
            className={`settings-focus-choice ${formError ? 'settings-focus-choice--invalid' : ''}`}
          >
            <span>Mật khẩu tạm mới (tuỳ chọn)</span>
            <input
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              placeholder="Để trống để hệ thống tạo mật khẩu tạm"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setFormError(undefined);
              }}
            />
            {formError && <span className="settings-focus-choice__error">{formError}</span>}
          </label>
        </SettingsFocusModal>
      )}

      {mode.kind === 'disable' && selected && (
        <SettingsFocusModal
          title={`Vô hiệu hóa ${selected.name}?`}
          description="Mọi phiên đăng nhập hiện tại của tài khoản này sẽ hết hiệu lực ngay."
          confirmLabel="Vô hiệu hóa"
          tone="danger"
          pending={disable.isPending}
          returnFocus={() => disableTrigger.current}
          onCancel={() => setMode({ kind: 'manage', userId: selected.id })}
          onConfirm={() =>
            disable.mutate(selected.id, {
              onSuccess: () => {
                setMessage(`Đã vô hiệu hóa ${selected.name}.`);
                setMode({ kind: 'list' });
              },
            })
          }
        >
          <ul className="settings-confirmation">
            <li>Lịch sử thao tác của tài khoản này vẫn được giữ nguyên.</li>
            <li>Hoàn tác: mở khoá lại ở mục “Tài khoản đã vô hiệu hóa”; mật khẩu không đổi.</li>
          </ul>
        </SettingsFocusModal>
      )}

      {mode.kind === 'promote' && selected && (
        <SettingsFocusModal
          title={`Cấp vai Quản trị cho ${selected.name}?`}
          description={[
            'Quản trị có toàn quyền, kể cả cấp tài khoản và đổi quyền của người khác. Lần cấp này được ghi vào nhật ký với tên bạn.',
            customGrantCount(selected) > 0 ? grantsDropSentence(customGrantCount(selected)) : '',
          ]
            .filter((sentence) => sentence.length > 0)
            .join(' ')}
          confirmLabel="Cấp vai Quản trị"
          tone="danger"
          pending={assign.isPending}
          onCancel={() => setMode({ kind: 'manage', userId: selected.id })}
          onConfirm={() =>
            assign.mutate(
              { id: selected.id, role: 'ADMIN', confirm: true },
              {
                onSuccess: () => {
                  setMessage(`Đã cấp vai Quản trị cho ${selected.name}.`);
                  setMode({ kind: 'manage', userId: selected.id });
                },
              },
            )
          }
        />
      )}

      {mode.kind === 'role' && selected && (
        <SettingsFocusModal
          title={`Đổi vai của ${selected.name} thành ${ROLE_LABELS[mode.role]}?`}
          description={grantsDropSentence(customGrantCount(selected))}
          confirmLabel={`Đổi vai và xoá ${customGrantCount(selected)} quyền riêng`}
          tone="danger"
          pending={assign.isPending}
          onCancel={() => setMode({ kind: 'manage', userId: selected.id })}
          onConfirm={() =>
            assign.mutate(
              { id: selected.id, role: mode.role },
              {
                onSuccess: () => {
                  setMessage(`Đã đổi vai của ${selected.name} thành ${ROLE_LABELS[mode.role]}.`);
                  setMode({ kind: 'manage', userId: selected.id });
                },
              },
            )
          }
        />
      )}

      {pendingCreate && (
        <SettingsFocusModal
          title={`Tạo tài khoản Quản trị cho ${pendingCreate.input.name}?`}
          description="Quản trị có toàn quyền, kể cả cấp tài khoản và đổi quyền của người khác. Lần cấp này được ghi vào nhật ký với tên bạn."
          confirmLabel="Tạo tài khoản Quản trị"
          tone="danger"
          pending={create.isPending}
          onCancel={() => setPendingCreate(null)}
          onConfirm={() => {
            const pending = pendingCreate;
            setPendingCreate(null);
            void submitCreate({ ...pending.input, confirmEscalation: true }, pending.form);
          }}
        />
      )}
    </div>
  );
}

/** Dang o tren be mat quan ly mot tai khoan — ke ca khi mot hop xac nhan dang phu len tren no. */
function managing(mode: Mode): mode is Extract<Mode, { userId: string }> {
  return (
    mode.kind === 'manage' ||
    mode.kind === 'reset' ||
    mode.kind === 'disable' ||
    mode.kind === 'promote' ||
    mode.kind === 'role'
  );
}

/** Truong `lastLoginAt` chi co tu `#395`; may chu cu khong tra thi khong noi gi sai. */
function lastLoginPhrase(user: AuthUser): string {
  if (user.lastLoginAt === undefined) return 'chưa rõ lần đăng nhập gần nhất';
  if (isNeverLoggedIn(user.lastLoginAt)) return 'chưa đăng nhập lần nào';
  return `đăng nhập ${relativeLastLogin(user.lastLoginAt, new Date()).toLowerCase()}`;
}

function modeKey(mode: Mode): string {
  if (mode.kind === 'list') return 'users:list';
  // `reset`/`disable` KHONG phai mot viec khac: chung la buoc con cua viec dang quan ly tai khoan
  // do. Cho chung mot khoa rieng thi mo hop thoai bi doc thanh mot lan chuyen viec, va tieu diem
  // se bi giat sang tieu de khoi viec ngay khi hop vua hien ra.
  if (managing(mode)) return `users:manage:${mode.userId}`;
  return `users:${mode.kind}`;
}

function UserRow({
  user,
  selected,
  onOpen,
}: {
  user: AuthUser;
  selected: boolean;
  onOpen: (node: HTMLButtonElement) => void;
}) {
  return (
    <li>
      <div>
        <strong>{user.name}</strong>
      </div>
      <button
        type="button"
        className="settings-button settings-button--quiet"
        aria-current={selected ? 'true' : undefined}
        onClick={(event) => onOpen(event.currentTarget)}
      >
        {selected ? 'Đang mở' : 'Quản lý'}
      </button>
      <small>
        @{user.username} · {ROLE_LABELS[user.role] ?? user.role}
        {user.mustChangePassword === true ? ' · chờ đổi mật khẩu' : ''}
        {user.lastLoginAt === undefined ? '' : ` · ${lastLoginPhrase(user)}`}
      </small>
    </li>
  );
}
