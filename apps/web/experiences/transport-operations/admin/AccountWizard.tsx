'use client';

import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { TemporaryCredential } from '../../../lib/auth';
import { PermissionGate } from '../components/PermissionGate';
import { ConfirmAction } from '../components/SectionState';
import { useNavigationInput } from '../hooks/useTransportWorkspace';
import { buildSectionUrl } from '../navigation';
import {
  buildCreateInput,
  changeRole,
  DIRECTOR_CONFIRMATION_PHRASE,
  driverCandidates,
  EMPTY_IDENTITY,
  emptyAccessWarning,
  escalatedAllows,
  findPresetChoice,
  grantedGroupSummary,
  identityProblems,
  isDirectorConfirmed,
  localUsernameSuggestion,
  neededByOf,
  needsSentence,
  permissionLabelLookup,
  PRESET_CHOICES,
  setGroupAction,
  stakeholderCandidates,
  toggleGroup,
  transportGroupsOf,
  usernameAfterPresetChange,
  type AccessDraft,
  type IdentityDraft,
  type PresetChoiceId,
} from './accounts-model';
import { accountLinksApi, accountsApi } from './admin-api';
import { useDriverCandidates, useInvalidateAccount, useStakeholderCandidates } from './admin-hooks';
import type { AccountView, CatalogGroup, PermissionCatalog } from './admin-types';
import { AdminError } from './AdminBits';
import { CredentialCard } from './CredentialCard';
import { GroupEditor } from './PermissionEditor';

/**
 * TAO TAI KHOAN — bon buoc (`#395` §3.2):
 *
 *   1. NGUOI NAY LA AI — nam the vai, gom "Chủ xe / bên góp vốn" (vai Dieu hanh KHONG quyen + noi ho
 *      so ben gop von). Giam doc phai go cau xac nhan.
 *   2. DANH TINH — ho ten, dien thoai, chuc danh, ten dang nhap (may chu goi y, sua duoc). Lai xe:
 *      chon ho so lai xe CHUA co tai khoan — ho ten va dien thoai dien san tu ho so.
 *   3. NHOM VIEC — chi voi Dieu hanh / Ke toan.
 *   4. XONG — the mat khau tam (mot lan), roi noi ho so. Noi hong thi mot dong "Chưa nối hồ sơ lái
 *      xe — Nối lại" o lai tren man hinh, khong bien mat trong mot thong bao thoang qua.
 *
 * KHONG co o mat khau: may chu tao mat khau tam va bat doi o lan dang nhap dau.
 */

type Step = 'WHO' | 'IDENTITY' | 'GROUPS' | 'DONE';

interface Created {
  readonly account: AccountView;
  readonly credential: TemporaryCredential | null;
}

type LinkState =
  | { readonly status: 'NONE' }
  | { readonly status: 'LINKED'; readonly label: string }
  | { readonly status: 'FAILED'; readonly error: unknown };

const SUGGEST_DELAY_MS = 400;

export function AccountWizard({
  catalog,
  onFinished,
  onCancel,
}: {
  readonly catalog: PermissionCatalog | undefined;
  readonly onFinished: (account: AccountView | null) => void;
  readonly onCancel: () => void;
}) {
  const titleId = useId();
  const driverHintId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState<Step>('WHO');
  const [choiceId, setChoiceId] = useState<PresetChoiceId>('OPERATIONS');
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [identity, setIdentity] = useState<IdentityDraft>(EMPTY_IDENTITY);
  const [isUsernameEdited, setIsUsernameEdited] = useState(false);
  const [linkTarget, setLinkTarget] = useState('');
  const [access, setAccess] = useState<AccessDraft>(changeRole('MANAGER'));
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<{
    code: string;
    label: string;
    group: CatalogGroup;
  } | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [link, setLink] = useState<LinkState>({ status: 'NONE' });
  const choice = findPresetChoice(choiceId);
  const groups = transportGroupsOf(catalog).filter((group) => group.grantable);
  const labelOf = useMemo(() => permissionLabelLookup(catalog), [catalog]);
  const invalidate = useInvalidateAccount();
  const navigation = useNavigationInput();
  const wantsDriver = choiceId === 'DRIVER';
  const wantsStakeholder = choiceId === 'OWNER';
  const drivers = useDriverCandidates(navigation, wantsDriver);
  const stakeholders = useStakeholderCandidates(navigation, wantsStakeholder);

  useEffect(() => heading.current?.focus(), [step]);

  /* Goi y ten dang nhap tu ho ten — chi khi nguoi dung CHUA tu go ten dang nhap. */
  useEffect(() => {
    if (isUsernameEdited || identity.name.trim().length === 0) return undefined;
    let isCurrent = true;
    const prefix = choice.usernamePrefix;
    const timer = window.setTimeout(() => {
      accountsApi
        .suggestUsername(identity.name.trim(), prefix)
        .then((result) => {
          if (isCurrent) setIdentity((current) => ({ ...current, username: result.username }));
        })
        .catch(() => {
          if (isCurrent) {
            setIdentity((current) => ({
              ...current,
              username: localUsernameSuggestion(current.name, prefix),
            }));
          }
        });
    }, SUGGEST_DELAY_MS);
    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [identity.name, isUsernameEdited, choice.usernamePrefix]);

  const escalated = escalatedAllows(access, groups);
  const isDirector = choiceId === 'DIRECTOR';

  const linkAccount = async (account: AccountView): Promise<void> => {
    if (linkTarget.length === 0 || (!wantsDriver && !wantsStakeholder)) return;
    try {
      if (wantsDriver) await accountLinksApi.linkDriver(linkTarget, account.id);
      else await accountLinksApi.linkStakeholder(linkTarget, account.id);
      const label = wantsDriver
        ? (drivers.data?.find((entry) => entry.id === linkTarget)?.fullName ?? 'hồ sơ lái xe')
        : (stakeholders.data?.find((entry) => entry.id === linkTarget)?.displayName ??
          'hồ sơ bên góp vốn');
      setLink({ status: 'LINKED', label });
    } catch (error) {
      setLink({ status: 'FAILED', error });
    }
    invalidate(account.id);
  };

  const create = useMutation({
    mutationFn: () =>
      accountsApi.create(
        buildCreateInput(
          choice,
          identity,
          access,
          escalated.length > 0 || (isDirector && isDirectorConfirmed(typedConfirmation)),
        ),
      ),
    onSuccess: async (result) => {
      const { credential, ...account } = result;
      setCreated({ account, credential: credential ?? null });
      setStep('DONE');
      invalidate(account.id);
      await linkAccount(account);
    },
  });

  const problems = identityProblems(identity);
  const warning = choice.choosesGroups
    ? emptyAccessWarning(access, groups, false)
    : wantsStakeholder && linkTarget.length === 0
      ? 'Chưa chọn hồ sơ bên góp vốn — tài khoản đăng nhập được nhưng chưa thấy xe nào.'
      : wantsDriver && linkTarget.length === 0
        ? 'Chưa chọn hồ sơ lái xe — tài khoản chưa làm được gì cho tới khi được nối.'
        : null;

  const pickPreset = (id: PresetChoiceId) => {
    const next = findPresetChoice(id);
    setChoiceId(id);
    setAccess(changeRole(next.role));
    setLinkTarget('');
    setTypedConfirmation('');
    setIdentity((current) => ({
      ...current,
      username: usernameAfterPresetChange(current, isUsernameEdited, choice, next),
    }));
  };

  const pickLinkTarget = (id: string) => {
    setLinkTarget(id);
    if (!wantsDriver) return;
    const driver = drivers.data?.find((entry) => entry.id === id);
    if (driver !== undefined) {
      setIdentity((current) => ({
        ...current,
        name: current.name.trim().length === 0 ? driver.fullName : current.name,
        phone: current.phone.trim().length === 0 ? driver.phone : current.phone,
      }));
    }
  };

  const goFromIdentity = () => {
    setShowProblems(true);
    if (problems.length > 0) return;
    if (choice.choosesGroups) setStep('GROUPS');
    else create.mutate();
  };

  const stepTitle: Readonly<Record<Step, string>> = {
    WHO: 'Người này là ai?',
    IDENTITY: 'Thông tin đăng nhập',
    GROUPS: 'Người này làm những nhóm việc nào?',
    DONE: 'Đã tạo tài khoản',
  };
  const steps: readonly Step[] = choice.choosesGroups
    ? ['WHO', 'IDENTITY', 'GROUPS', 'DONE']
    : ['WHO', 'IDENTITY', 'DONE'];

  return (
    <section className="tx-admin-sheet tx-admin-wizard" aria-labelledby={titleId}>
      <ol className="tx-admin-steps" aria-label="Các bước">
        {steps.map((entry, index) => (
          <li key={entry} aria-current={entry === step ? 'step' : undefined}>
            <span className="tx-admin-steps__num">{index + 1}</span>
            {stepTitle[entry]}
          </li>
        ))}
      </ol>
      <h2 id={titleId} ref={heading} tabIndex={-1}>
        {stepTitle[step]}
      </h2>

      {step === 'WHO' ? (
        <>
          <fieldset className="tx-admin-presets tx-admin-presets--wizard">
            <legend className="tx-visually-hidden">Loại tài khoản</legend>
            {PRESET_CHOICES.map((entry) => (
              <label
                key={entry.id}
                className="tx-admin-preset"
                data-checked={choiceId === entry.id ? '' : undefined}
              >
                <input
                  type="radio"
                  name="wizard-preset"
                  value={entry.id}
                  checked={choiceId === entry.id}
                  onChange={() => pickPreset(entry.id)}
                />
                <strong>{entry.label}</strong>
                <span>{entry.summary}</span>
              </label>
            ))}
          </fieldset>
          {isDirector ? (
            <label className="tx-field tx-admin-typed">
              <span>
                Giám đốc có toàn quyền, kể cả cấp và thu hồi quyền của người khác. Gõ đúng câu “
                {DIRECTOR_CONFIRMATION_PHRASE}” để tiếp tục.
              </span>
              <input
                value={typedConfirmation}
                onChange={(event) => setTypedConfirmation(event.target.value)}
                autoComplete="off"
              />
            </label>
          ) : null}
          <div className="tx-admin-actions">
            <button
              type="button"
              className="tx-btn tx-btn--go"
              disabled={isDirector && !isDirectorConfirmed(typedConfirmation)}
              onClick={() => setStep('IDENTITY')}
            >
              Tiếp tục
            </button>
            <button type="button" className="tx-btn tx-btn--ghost" onClick={onCancel}>
              Huỷ
            </button>
          </div>
        </>
      ) : null}

      {step === 'IDENTITY' ? (
        <form
          className="tx-form"
          aria-label="Thông tin đăng nhập"
          onSubmit={(event) => {
            event.preventDefault();
            goFromIdentity();
          }}
        >
          {/*
            Goi y "Chưa có hồ sơ?" nam NGOAI nhan (nhu trinh sua dia diem): nam trong `<label>` thi no
            thanh mot phan TEN cua o chon. Trinh doc man hinh doc no qua `aria-describedby`.
          */}
          {wantsDriver || wantsStakeholder ? (
            <PermissionGate
              viewer={navigation}
              action={wantsDriver ? 'transport.driver.read' : 'transport.asset_ownership.read'}
            >
              <div className="tx-admin-field">
                <label className="tx-field">
                  <span>
                    {wantsDriver
                      ? 'Hồ sơ lái xe (chưa có tài khoản)'
                      : 'Hồ sơ bên góp vốn (chưa có tài khoản)'}
                  </span>
                  <select
                    value={linkTarget}
                    onChange={(event) => pickLinkTarget(event.target.value)}
                    aria-describedby={wantsDriver ? driverHintId : undefined}
                  >
                    <option value="">— Chọn hồ sơ —</option>
                    {(wantsDriver
                      ? driverCandidates(drivers.data ?? []).map((entry) => ({
                          id: entry.id,
                          label: `${entry.fullName} · ${entry.phone}`,
                        }))
                      : stakeholderCandidates(stakeholders.data ?? []).map((entry) => ({
                          id: entry.id,
                          label: entry.displayName,
                        }))
                    ).map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
                {wantsDriver ? (
                  <small className="tx-admin-hint" id={driverHintId}>
                    Chưa có hồ sơ? Thêm ở <a href={buildSectionUrl('fleet')}>Đội xe &amp; lái xe</a>{' '}
                    rồi quay lại.
                  </small>
                ) : null}
              </div>
            </PermissionGate>
          ) : null}
          <div className="tx-admin-fields">
            <label className="tx-field">
              <span>Họ tên</span>
              <input
                value={identity.name}
                onChange={(event) => setIdentity({ ...identity, name: event.target.value })}
                required
                maxLength={120}
                autoComplete="off"
              />
            </label>
            <label className="tx-field">
              <span>Tên đăng nhập</span>
              <input
                value={identity.username}
                onChange={(event) => {
                  setIsUsernameEdited(true);
                  setIdentity({ ...identity, username: event.target.value.trim() });
                }}
                required
                maxLength={64}
                autoComplete="off"
                spellCheck={false}
                className="tx-admin-mono"
              />
            </label>
            <label className="tx-field">
              <span>Số điện thoại</span>
              <input
                value={identity.phone}
                onChange={(event) => setIdentity({ ...identity, phone: event.target.value })}
                inputMode="tel"
                maxLength={24}
              />
            </label>
            <label className="tx-field">
              <span>Chức danh</span>
              <input
                value={identity.jobTitle}
                onChange={(event) => setIdentity({ ...identity, jobTitle: event.target.value })}
                maxLength={80}
              />
            </label>
          </div>
          {showProblems && problems.length > 0 ? (
            <ul className="tx-admin-violations" role="alert">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
          {!choice.choosesGroups && warning !== null ? (
            <p className="tx-note tx-note--warn">{warning}</p>
          ) : null}
          <AdminError error={create.error} labelOf={labelOf} />
          <div className="tx-admin-actions">
            <button type="submit" className="tx-btn tx-btn--go" disabled={create.isPending}>
              {choice.choosesGroups ? 'Tiếp tục' : create.isPending ? 'Đang tạo…' : 'Tạo tài khoản'}
            </button>
            <button type="button" className="tx-btn tx-btn--ghost" onClick={() => setStep('WHO')}>
              Quay lại
            </button>
          </div>
        </form>
      ) : null}

      {step === 'GROUPS' ? (
        <>
          <p className="tx-panel__lead">
            Bật cả nhóm, hoặc mở “Từng việc” để chọn kỹ. Quyền nhạy cảm phải bật riêng từng dòng.
          </p>
          <ul className="tx-admin-groups" aria-label="Nhóm việc">
            {groups.map((group) => (
              <GroupEditor
                key={group.id}
                group={group}
                draft={access}
                isOpen={openGroups.has(group.id)}
                neededBy={neededByOf(groups, access)}
                needsNote={needsSentence(group, labelOf)}
                onToggleOpen={() =>
                  setOpenGroups((current) => {
                    const next = new Set(current);
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    return next;
                  })
                }
                onToggleGroup={() => setAccess((current) => toggleGroup(current, group))}
                onToggleAction={(code, isOn, needsConfirmation) => {
                  if (isOn && needsConfirmation) {
                    setPending({ code, label: labelOf(code) ?? code, group });
                  } else setAccess((current) => setGroupAction(current, group, code, isOn));
                }}
              />
            ))}
          </ul>
          <p className="tx-note" aria-live="polite">
            Đã chọn {grantedGroupSummary(access, groups).groups} nhóm,{' '}
            {grantedGroupSummary(access, groups).actions} việc.
          </p>
          {warning === null ? null : <p className="tx-note tx-note--warn">{warning}</p>}
          <AdminError error={create.error} labelOf={labelOf} />
          <div className="tx-admin-actions">
            <button
              type="button"
              className="tx-btn tx-btn--go"
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? 'Đang tạo…' : 'Tạo tài khoản'}
            </button>
            <button
              type="button"
              className="tx-btn tx-btn--ghost"
              onClick={() => setStep('IDENTITY')}
            >
              Quay lại
            </button>
          </div>
        </>
      ) : null}

      {step === 'DONE' && created !== null ? (
        <>
          {created.credential === null ? (
            <p className="tx-notice" role="status">
              Đã tạo tài khoản {created.account.username}.
            </p>
          ) : (
            <CredentialCard
              name={created.account.name}
              username={created.account.username}
              credential={created.credential}
              onClose={() => onFinished(created.account)}
            />
          )}
          {link.status === 'LINKED' ? (
            <p className="tx-notice" role="status">
              Đã nối với {link.label}.
            </p>
          ) : null}
          {link.status === 'FAILED' ? (
            <div className="tx-admin-linkfail" role="alert" data-testid="link-failed">
              <p>
                <strong>
                  {wantsDriver ? 'Chưa nối hồ sơ lái xe' : 'Chưa nối hồ sơ bên góp vốn'}
                </strong>{' '}
                — tài khoản đã tạo nhưng chưa làm được việc của hồ sơ đó.
              </p>
              <AdminError error={link.error} />
              <button
                type="button"
                className="tx-btn"
                onClick={() => void linkAccount(created.account)}
              >
                Nối lại
              </button>
            </div>
          ) : null}
          <div className="tx-admin-actions">
            <button
              type="button"
              className="tx-btn tx-btn--ghost"
              onClick={() => onFinished(created.account)}
            >
              Mở tài khoản vừa tạo
            </button>
          </div>
        </>
      ) : null}

      <ConfirmAction
        open={pending !== null}
        title={`Cấp quyền nhạy cảm: ${pending?.label ?? ''}?`}
        detail="Vai này bình thường không có quyền này vì lý do kiểm soát. Lần cấp được ghi vào nhật ký với tên bạn."
        confirmLabel="Tôi hiểu, cấp quyền"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending !== null) {
            setAccess((current) => setGroupAction(current, pending.group, pending.code, true));
          }
          setPending(null);
        }}
      />
    </section>
  );
}
