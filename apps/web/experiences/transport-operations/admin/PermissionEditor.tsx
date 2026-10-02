'use client';

import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import type { AuthRole } from '../../../lib/auth';
import { ConfirmAction } from '../components/SectionState';
import {
  actionRows,
  changeRole,
  DIRECTOR_CONFIRMATION_PHRASE,
  escalatedAllows,
  groupCheckbox,
  isDirectorConfirmed,
  neededByOf,
  needsSentence,
  permissionLabelLookup,
  presetsOf,
  presetLabelOf,
  sameAccess,
  setGroupAction,
  toggleGroup,
  transportGroupsOf,
  type AccessDraft,
} from './accounts-model';
import { accountsApi } from './admin-api';
import { violationMessage, violationsOf } from './admin-reasons';
import type { AccessBreakdown, AccountView, CatalogGroup, PermissionCatalog } from './admin-types';
import { AdminError, TriStateCheckbox } from './AdminBits';

/**
 * TRINH CHINH QUYEN (`#395`). Ba tang, tu tho toi min:
 *
 *   1. VAI KHOI DIEM — bon the; Giam doc phai GO cau xac nhan (toan quyen khong la mot lan bam);
 *   2. NHOM VIEC — o ba trang thai (`aria-checked="mixed"`) cho moi nhom cap duoc;
 *   3. TUNG VIEC — mo nhom ra, bat/tat tung dong; dong chi-Giam-doc KHOA, dong nhay cam hoi xac nhan.
 *
 * MOI thay doi goi may chu XEM TRUOC (`dryRun`): cau "Người này sẽ làm được gì?" va moi vi pham tach
 * nhiem la cua MAY CHU, khong phai man hinh tu doan. Man hinh chi giu mot bo quyen TOI GIAN.
 */

const PREVIEW_DELAY_MS = 350;
const EDITABLE_ROLES: readonly AuthRole[] = ['MANAGER', 'ACCOUNTING', 'SALE', 'ADMIN'];

const ROLE_HINT: Readonly<Record<AuthRole, string>> = {
  ADMIN: 'Giám đốc đã có toàn quyền vận hành và quản trị tài khoản — không chỉnh từng nhóm.',
  SALE: 'Lái xe làm việc của chính mình qua hồ sơ lái xe — không cấp thêm nhóm việc.',
  MANAGER: 'Bắt đầu trống: bật đúng những nhóm việc người này cần.',
  ACCOUNTING: 'Bắt đầu từ bộ quyền Kế toán: tắt bớt hoặc bật thêm từng nhóm.',
};

export function GroupEditor({
  group,
  draft,
  isOpen,
  neededBy,
  needsNote,
  onToggleOpen,
  onToggleGroup,
  onToggleAction,
}: {
  readonly group: CatalogGroup;
  readonly draft: AccessDraft;
  readonly isOpen: boolean;
  /** Ma → nhan cac nhom dang can no (`neededByOf`) — "Kèm theo để dùng được …" (`#395`). */
  readonly neededBy: ReadonlyMap<string, readonly string[]>;
  /** Cau "Kèm theo để dùng được: …" duoi ten nhom (`needsSentence`); `null` = nhom khong kem gi. */
  readonly needsNote: string | null;
  readonly onToggleOpen: () => void;
  readonly onToggleGroup: () => void;
  readonly onToggleAction: (code: string, isOn: boolean, needsConfirmation: boolean) => void;
}) {
  const summaryId = useId();
  const listId = useId();
  const box = groupCheckbox(group, draft);
  const rows = actionRows(group, draft, neededBy);
  const isDirectorOnly = group.actions.every((action) => action.directorOnly);

  return (
    <li className="tx-admin-group" data-state={box.isLocked ? 'locked' : box.checked}>
      <div className="tx-admin-group__head">
        <TriStateCheckbox
          checked={box.checked}
          isLocked={box.isLocked}
          label={`Nhóm ${group.label}`}
          describedBy={summaryId}
          onToggle={onToggleGroup}
        />
        <div className="tx-admin-group__text">
          <strong>{group.label}</strong>
          <span id={summaryId}>
            {isDirectorOnly ? 'Chỉ Giám đốc — ' : ''}
            {group.summary}
          </span>
          {needsNote === null ? null : <small className="tx-admin-group__needs">{needsNote}</small>}
        </div>
        {/* `aria-label` tren `<span>` bi cam (ARIA 1.2): so cho mat, cau cho trinh doc man hinh. */}
        <span className="tx-admin-group__count">
          <span aria-hidden="true">
            {box.held}/{box.total}
          </span>
          <span className="tx-visually-hidden">
            {box.held} trên {box.total} việc
          </span>
        </span>
        <button
          type="button"
          className="tx-btn tx-btn--ghost tx-btn--small"
          aria-expanded={isOpen}
          aria-controls={listId}
          onClick={onToggleOpen}
        >
          {isOpen ? 'Thu gọn' : 'Từng việc'}
          <span className="tx-visually-hidden"> của nhóm {group.label}</span>
        </button>
      </div>
      <ul className="tx-admin-actionlist" id={listId} hidden={!isOpen}>
        {rows.map((row, index) => (
          <li key={row.code} className="tx-admin-action" data-origin={row.origin}>
            <label>
              <input
                type="checkbox"
                checked={row.isOn}
                disabled={row.lockedReason !== null}
                // O khoa noi VI SAO khoa, khong chi "disabled".
                aria-describedby={row.lockedReason === null ? undefined : `${listId}-lock-${index}`}
                onChange={(event) =>
                  onToggleAction(row.code, event.target.checked, row.needsConfirmation)
                }
              />
              <span className="tx-admin-action__label">{row.label}</span>
            </label>
            <span className="tx-admin-kind" data-kind={row.kind}>
              {row.kindLabel}
            </span>
            {row.lockedReason === null ? null : (
              <span className="tx-admin-action__lock" id={`${listId}-lock-${index}`}>
                {row.lockedReason}
              </span>
            )}
            {row.origin === 'GRANTED' ? (
              <span className="tx-admin-action__origin">Cấp thêm</span>
            ) : null}
            {row.origin === 'DENIED' ? (
              <span className="tx-admin-action__origin">Đã bớt</span>
            ) : null}
            {row.neededByLabel === null ? null : (
              <span className="tx-admin-action__needed">{row.neededByLabel}</span>
            )}
            {row.sodLabel === null ? null : (
              <small className="tx-admin-action__sod">{row.sodLabel}</small>
            )}
          </li>
        ))}
      </ul>
    </li>
  );
}

export function PermissionEditor({
  account,
  catalog,
  onSaved,
  onCancel,
}: {
  readonly account: AccountView;
  readonly catalog: PermissionCatalog;
  readonly onSaved: (access: AccessBreakdown | null) => void;
  readonly onCancel: () => void;
}) {
  const initial: AccessDraft = useMemo(
    () => ({ role: account.role, grants: account.permissionGrants ?? [] }),
    [account.role, account.permissionGrants],
  );
  const [draft, setDraft] = useState<AccessDraft>(initial);
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<{
    code: string;
    label: string;
    group: CatalogGroup;
  } | null>(null);
  const [preview, setPreview] = useState<AccessBreakdown | null>(null);
  const [previewError, setPreviewError] = useState<unknown>(null);
  const groups = transportGroupsOf(catalog).filter((group) => group.grantable);
  const presets = presetsOf(catalog);
  const labelOf = useMemo(() => permissionLabelLookup(catalog), [catalog]);
  const isChanged = !sameAccess(draft, initial);
  const needsDirectorPhrase = draft.role === 'ADMIN' && account.role !== 'ADMIN';
  const escalated = escalatedAllows(draft, groups);
  const neededBy = neededByOf(groups, draft);

  /* XEM TRUOC moi thay doi — tre mot nhip de mot chuoi bam o khong ban mot chuoi yeu cau. */
  useEffect(() => {
    if (!isChanged) {
      setPreview(null);
      setPreviewError(null);
      return undefined;
    }
    let isCurrent = true;
    const timer = window.setTimeout(() => {
      accountsApi
        .previewAccess(account.id, { ...draft, confirmEscalation: true })
        .then((result) => {
          if (!isCurrent) return;
          setPreview(result);
          setPreviewError(null);
        })
        .catch((error: unknown) => {
          if (!isCurrent) return;
          setPreview(null);
          setPreviewError(error);
        });
    }, PREVIEW_DELAY_MS);
    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [account.id, draft, isChanged]);

  const save = useMutation({
    mutationFn: () =>
      accountsApi.saveAccess(account.id, {
        role: draft.role,
        grants: draft.grants,
        confirmEscalation: escalated.length > 0 || needsDirectorPhrase,
      }),
    onSuccess: (result) => onSaved(result.access ?? null),
  });

  const toggleOpen = (id: string) =>
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onToggleAction = (
    group: CatalogGroup,
    code: string,
    isOn: boolean,
    needsConfirmation: boolean,
  ) => {
    if (isOn && needsConfirmation) {
      setPending({ code, label: labelOf(code) ?? code, group });
      return;
    }
    setDraft((current) => setGroupAction(current, group, code, isOn));
  };

  /**
   * `#395` (e) — lan XEM TRUOC gan nhat cua may chu con bao vi pham (tach nhiem, quyen chi Giam
   * doc…) thi KHONG cho luu: bam "Lưu quyền" luc do chi nhan lai dung loi do, va nut sang lam nguoi
   * doc tuong bo quyen da hop le. Sua ban nhap thi may chu xem lai; het vi pham thi nut sang lai.
   */
  const previewViolations = violationsOf(previewError);
  const violations = previewViolations.concat(violationsOf(save.error));
  const hasPreviewViolations = isChanged && previewViolations.length > 0;
  const canSave =
    isChanged &&
    !save.isPending &&
    !hasPreviewViolations &&
    (!needsDirectorPhrase || isDirectorConfirmed(typedConfirmation));

  return (
    <section className="tx-admin-editor" aria-label={`Chỉnh quyền của ${account.name}`}>
      <fieldset className="tx-admin-presets">
        <legend>Vai khởi điểm</legend>
        {EDITABLE_ROLES.map((role) => {
          const summary =
            presets.find((preset) => preset.role === role)?.summary ?? ROLE_HINT[role];
          return (
            <label
              key={role}
              className="tx-admin-preset"
              data-checked={draft.role === role ? '' : undefined}
            >
              <input
                type="radio"
                name={`preset-${account.id}`}
                value={role}
                checked={draft.role === role}
                onChange={() => {
                  setDraft(role === initial.role ? initial : changeRole(role));
                  setTypedConfirmation('');
                }}
              />
              <strong>{presetLabelOf(role, presets)}</strong>
              <span>{summary}</span>
            </label>
          );
        })}
      </fieldset>

      {needsDirectorPhrase ? (
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

      <p className="tx-panel__lead">{ROLE_HINT[draft.role]}</p>
      <ul className="tx-admin-groups" aria-label="Nhóm việc">
        {groups.map((group) => (
          <GroupEditor
            key={group.id}
            group={group}
            draft={draft}
            isOpen={openGroups.has(group.id)}
            neededBy={neededBy}
            needsNote={needsSentence(group, labelOf)}
            onToggleOpen={() => toggleOpen(group.id)}
            onToggleGroup={() => setDraft((current) => toggleGroup(current, group))}
            onToggleAction={(code, isOn, needsConfirmation) =>
              onToggleAction(group, code, isOn, needsConfirmation)
            }
          />
        ))}
      </ul>

      <aside className="tx-admin-preview" aria-live="polite" aria-label="Xem trước">
        <h3>Sau khi lưu, người này làm được gì?</h3>
        {!isChanged ? (
          <p className="tx-note">Chưa có thay đổi.</p>
        ) : preview !== null ? (
          <ul className="tx-admin-sentences">
            {preview.sentences.map((sentence) => (
              <li key={sentence}>{sentence}</li>
            ))}
          </ul>
        ) : previewError === null ? (
          <p className="tx-note">Đang hỏi máy chủ…</p>
        ) : null}
        {violations.length > 0 ? (
          <ul className="tx-admin-violations" role="alert">
            {violations.map((violation, index) => (
              <li key={`${violation.code}-${violation.permission ?? index}`}>
                {violationMessage(violation, labelOf)}
              </li>
            ))}
          </ul>
        ) : null}
        {previewError !== null && violationsOf(previewError).length === 0 ? (
          <AdminError error={previewError} labelOf={labelOf} />
        ) : null}
        {escalated.length > 0 ? (
          <p className="tx-note tx-note--warn">
            Có {escalated.length} quyền nhạy cảm được cấp thêm — lần lưu này ghi tên bạn vào nhật ký
            cấp quyền.
          </p>
        ) : null}
      </aside>

      {save.error !== null && violationsOf(save.error).length === 0 ? (
        <AdminError error={save.error} labelOf={labelOf} />
      ) : null}
      <div className="tx-admin-actions">
        <button
          type="button"
          className="tx-btn tx-btn--go"
          disabled={!canSave}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Đang lưu…' : 'Lưu quyền'}
        </button>
        <button type="button" className="tx-btn tx-btn--ghost" onClick={onCancel}>
          Huỷ
        </button>
        {hasPreviewViolations ? (
          <span className="tx-admin-actions__status" role="status">
            Chưa lưu được: bộ quyền này còn vi phạm quy tắc ở khung “Xem trước”. Bỏ bớt quyền gây
            xung đột rồi lưu.
          </span>
        ) : needsDirectorPhrase && !isDirectorConfirmed(typedConfirmation) ? (
          <span className="tx-admin-actions__status">Cần gõ câu xác nhận trước khi lưu.</span>
        ) : null}
      </div>

      <ConfirmAction
        open={pending !== null}
        title={`Cấp quyền nhạy cảm: ${pending?.label ?? ''}?`}
        detail="Vai này bình thường không có quyền này vì lý do kiểm soát (người duyệt tiền không sửa căn cứ, không xem đường đi từng phút của người khác). Lần cấp được ghi vào nhật ký với tên bạn."
        confirmLabel="Tôi hiểu, cấp quyền"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending !== null) {
            setDraft((current) => setGroupAction(current, pending.group, pending.code, true));
          }
          setPending(null);
        }}
      />
    </section>
  );
}
