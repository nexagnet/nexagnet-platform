import type {
  AccessActionBreakdown,
  AccessActionState,
  AccessBreakdown,
  AccessGroupBreakdown,
  AccessGroupSummary,
  AccountView,
  PlatformPermissionBreakdown,
} from '../account.types.js';
import { USER_ROLES, type UserRole } from '../auth.types.js';
import type {
  AccessScopeNote,
  PermissionDomain,
  PermissionGrant,
  PermissionGroupView,
} from './permission-domain.js';
import { platformPermissionCatalog, platformPermissionsFor } from './platform-permissions.js';

/**
 * "NGUOI NAY LAM DUOC GI?" (`#395`) — tu danh muc cua tung mien, tap hieu luc va cac pham vi lien
 * ket. Ham THUAN: moi thu can biet duoc truyen vao.
 *
 * Nen tang khong biet mot ma quyen nghiep vu nao nghia la gi — cau chu den tu NHAN cua mien (nhom,
 * viec, vai khoi diem) va tu cau mo ta pham vi (`AccessScopeNote.sentence`). Nen tang chi noi cac
 * cau DUNG CHO MOI MIEN: "Làm được mọi việc", "Chỉ xem", "Không duyệt được tiền" (loai `DUYET` la
 * khai niem cua nen tang — `PermissionKind`).
 *
 * PHAM VI ↔ NHOM: mot pham vi (`AccessScopeNote`) mo NHOM KHONG CAP DUOC (`grantable: false`) CUNG
 * MIEN co `id` BANG `id` cua pham vi (vd mien van tai: pham vi `lai-xe` mo nhom `lai-xe`). Mien chi
 * mo ta cac lien ket DANG TON TAI; "chua noi ho so" la cau cua NEN TANG — chi nen tang biet vai
 * khoi diem cua tai khoan co viec trong nhom do hay khong.
 */

/** Nhan vai khoi diem khi khong mien nao dat ten cho vai do. */
const PLATFORM_PRESET_LABELS: Readonly<Record<UserRole, string>> = {
  ADMIN: 'Quản trị',
  ACCOUNTING: 'Kế toán',
  MANAGER: 'Quản lý',
  SALE: 'Nhân viên',
};

const USABLE: ReadonlySet<AccessActionState> = new Set(['PRESET', 'GRANTED', 'SCOPE_ACTIVE']);
const LISTED_ACTIONS = 3;
const NOTHING_GRANTED = 'Chưa làm được gì — chưa được cấp nhóm quyền nào';

/** Cac pham vi lien ket cua MOT mien (`describeScopes`). */
export interface DomainScopes {
  readonly domain: string;
  readonly notes: readonly AccessScopeNote[];
}

interface BreakdownInput {
  readonly account: AccountView;
  readonly domains: readonly PermissionDomain[];
  readonly scopes: readonly DomainScopes[];
  /** Vai va quyen rieng dem ra xem — mac dinh la cua chinh tai khoan (xem truoc dung cai nay). */
  readonly role?: UserRole;
  readonly grants?: readonly PermissionGrant[];
}

/**
 * QUYEN KEM THEO cua mot nhom (`PermissionGroupView.needs`, `#395`): phep XEM cua nhom khac ma man
 * hinh cua nhom nay can. Nen tang khong biet ma nao nghia la gi — chi so trang thai cua ma do.
 */
interface GroupNeeds {
  readonly group: AccessGroupBreakdown;
  readonly needs: readonly string[];
}

/** Mot nhom lien ket ma vai co viec nhung CHUA co lien ket nao mo — de noi "chua noi ho so". */
interface UnlinkedScope {
  readonly group: AccessGroupBreakdown;
  /** Nhan vai khoi diem trong mien so huu nhom, vd "Lái xe". */
  readonly presetLabel: string;
}

export function buildAccessBreakdown(input: BreakdownInput): AccessBreakdown {
  const role = input.role ?? input.account.role;
  const grants = input.grants ?? input.account.permissionGrants;
  const perDomain = input.domains.map((domain) =>
    domainGroups(domain, role, grants, scopesOf(input.scopes, domain.id)),
  );
  const groups = perDomain.flatMap((entry) => entry.groups);
  const unlinked = perDomain.flatMap((entry) => entry.unlinked);
  const needs = perDomain.flatMap((entry) => entry.needs);
  const notes = input.scopes.flatMap((entry) => entry.notes);
  const platform = platformBreakdown(role);
  return {
    account: input.account,
    preset: { role, label: presetLabel(input.domains, role) },
    grants,
    platform,
    groups,
    scopes: notes,
    sentences: accessSentences(groups, platform, notes, unlinked, needs),
  };
}

function scopesOf(scopes: readonly DomainScopes[], domainId: string): readonly AccessScopeNote[] {
  return scopes.filter((entry) => entry.domain === domainId).flatMap((entry) => entry.notes);
}

function domainPresetLabel(domain: PermissionDomain, role: UserRole): string | null {
  return domain.catalog().presets.find((candidate) => candidate.role === role)?.label ?? null;
}

function presetLabel(domains: readonly PermissionDomain[], role: UserRole): string {
  for (const domain of domains) {
    const label = domainPresetLabel(domain, role);
    if (label) return label;
  }
  return PLATFORM_PRESET_LABELS[role];
}

function platformBreakdown(role: UserRole): PlatformPermissionBreakdown[] {
  const held = new Set<string>(platformPermissionsFor(role));
  return platformPermissionCatalog().map((entry) => ({
    code: entry.code,
    label: entry.label,
    state: held.has(entry.code) ? 'PRESET' : 'NONE',
  }));
}

function domainGroups(
  domain: PermissionDomain,
  role: UserRole,
  grants: readonly PermissionGrant[],
  scopes: readonly AccessScopeNote[],
): {
  readonly groups: AccessGroupBreakdown[];
  readonly unlinked: UnlinkedScope[];
  readonly needs: GroupNeeds[];
} {
  const preset = new Set(domain.effective({ role }));
  const effective = new Set(domain.effective({ role, permissionGrants: grants }));
  // Viec ma KHONG vai nao co san (vd xem xe minh gop von) chi den tu lien ket; viec ma mot vai co
  // san (viec cua chinh lai xe) can CA vai do LAN lien ket.
  const inSomePreset = new Set(
    USER_ROLES.flatMap((candidate) => domain.effective({ role: candidate })),
  );
  const catalog = domain.catalog().groups;
  const groups = catalog.map((group): AccessGroupBreakdown => {
    const actions = group.actions.map((action): AccessActionBreakdown => ({
      code: action.code,
      label: action.label,
      kind: action.kind,
      state: group.grantable
        ? grantableState(action.code, action.directorOnly, preset, effective)
        : scopeState(group, action.code, { preset, inSomePreset }, scopes),
    }));
    return {
      domain: domain.id,
      id: group.id,
      label: group.label,
      grantable: group.grantable,
      actions,
      summary: summarize(actions),
    };
  });
  const label = domainPresetLabel(domain, role) ?? PLATFORM_PRESET_LABELS[role];
  const unlinked = groups
    .filter((group) => !group.grantable)
    .filter((group) => !scopes.some((scope) => scope.id === group.id))
    .filter((group) => group.actions.some((action) => action.state === 'SCOPE_INACTIVE'))
    .map((group) => ({ group, presetLabel: label }));
  const needs = groups.flatMap((group, index): GroupNeeds[] => {
    const codes = catalog[index]?.needs ?? [];
    return codes.length === 0 ? [] : [{ group, needs: codes }];
  });
  return { groups, unlinked, needs };
}

function grantableState(
  code: string,
  directorOnly: boolean,
  preset: ReadonlySet<string>,
  effective: ReadonlySet<string>,
): AccessActionState {
  const held = effective.has(code);
  const fromPreset = preset.has(code);
  if (held) return fromPreset ? 'PRESET' : 'GRANTED';
  if (fromPreset) return 'DENIED';
  return directorOnly ? 'DIRECTOR_ONLY' : 'NONE';
}

/**
 * Nhom den tu LIEN KET: viec cua nhom chi lam duoc khi pham vi mo nhom dang hieu luc.
 *   · viec ma MOT vai co san (viec cua chinh lai xe): can vai do VA lien ket — vai co ma lien ket
 *     chua co / dang ngung → `SCOPE_INACTIVE`; vai khong co → `NONE` (du lien ket co);
 *   · viec KHONG vai nao co san (xem xe minh gop von): chi lien ket mo no.
 */
function scopeState(
  group: PermissionGroupView,
  code: string,
  presets: { readonly preset: ReadonlySet<string>; readonly inSomePreset: ReadonlySet<string> },
  scopes: readonly AccessScopeNote[],
): AccessActionState {
  const active = scopes.some((note) => note.id === group.id && note.active);
  if (!presets.inSomePreset.has(code)) return active ? 'SCOPE_ACTIVE' : 'NONE';
  if (!presets.preset.has(code)) return 'NONE';
  return active ? 'SCOPE_ACTIVE' : 'SCOPE_INACTIVE';
}

function summarize(actions: readonly AccessActionBreakdown[]): AccessGroupSummary {
  const usable = actions.filter((action) => USABLE.has(action.state)).length;
  if (usable === 0) return 'NONE';
  return usable === actions.length ? 'FULL' : 'PARTIAL';
}

/* ------------------------------------------------------------------ *
 * CAU TRA LOI
 * ------------------------------------------------------------------ */

function accessSentences(
  groups: readonly AccessGroupBreakdown[],
  platform: readonly PlatformPermissionBreakdown[],
  scopes: readonly AccessScopeNote[],
  unlinked: readonly UnlinkedScope[],
  needs: readonly GroupNeeds[] = [],
): string[] {
  const canDoAnything =
    platform.some((entry) => entry.state === 'PRESET') ||
    groups.some((group) => group.summary !== 'NONE');
  if (!canDoAnything) {
    // Khong lam duoc gi: cau cua pham vi (vd "Chưa nối hồ sơ lái xe — chưa làm được gì") la cau
    // tra loi dung nhat; khong co thi noi thang.
    const scopeLines = [
      ...scopes.map((scope) => scope.sentence),
      ...unlinked.map(
        ({ presetLabel }) => `Chưa nối hồ sơ ${lower(presetLabel)} — chưa làm được gì`,
      ),
    ];
    return scopeLines.length > 0 ? unique(scopeLines) : [NOTHING_GRANTED];
  }

  const sentences: string[] = platform
    .filter((entry) => entry.state === 'PRESET')
    .map((entry) => entry.label);
  const grantable = groups.filter((group) => group.grantable);

  const full = grantable.filter((group) => group.summary === 'FULL');
  if (full.length > 0) {
    sentences.push(`Làm được mọi việc: ${full.map((group) => group.label).join('; ')}`);
  }
  const partial = grantable.filter((group) => group.summary === 'PARTIAL');
  const readOnly = partial.filter((group) => usableActions(group).every(isReadOnly));
  if (readOnly.length > 0) {
    sentences.push(`Chỉ xem: ${readOnly.map((group) => group.label).join('; ')}`);
  }
  for (const group of partial.filter((candidate) => !readOnly.includes(candidate))) {
    sentences.push(`${group.label}: ${listActions(usableActions(group))}`);
  }

  sentences.push(...prerequisiteSentences(groups, needs));

  const denied = grantable.flatMap((group) =>
    group.actions.filter((action) => action.state === 'DENIED'),
  );
  if (denied.length > 0) sentences.push(`Đã bỏ bớt: ${listActions(denied)}`);

  sentences.push(...scopes.map((scope) => scope.sentence));
  for (const { group, presetLabel } of unlinked) {
    sentences.push(`${group.label}: chưa có hiệu lực — chưa nối hồ sơ ${lower(presetLabel)}`);
  }

  const decisions = grantable.flatMap((group) =>
    group.actions.filter((action) => action.kind === 'DUYET'),
  );
  if (decisions.length > 0 && !decisions.some((action) => USABLE.has(action.state))) {
    sentences.push('Không duyệt được tiền');
  }
  return unique(sentences);
}

/**
 * QUYEN KEM THEO trong cau tra loi (`#395`) — hai cau, chi khi can:
 *
 *   · nhom dang dung ma THIEU ma kem theo → "…: chưa dùng được đủ trên màn hình — cần kèm theo …"
 *     (vd Ke toan bi bot "Xem danh sách xe" thi lich bao duong chi con "Xe chưa đọc được tên");
 *   · ma kem theo DUOC CAP RIENG ma nhom cua no khong du → "Kèm theo để dùng được …: …" — de Giam
 *     doc hieu vi sao "Chỉ xem: Đội xe & lái xe" hien ra khi ho chi bat nhom quy lai xe.
 *
 * Ma kem theo co san theo vai khoi diem (hoac nam trong mot nhom du) thi khong noi gi them.
 */
function prerequisiteSentences(
  groups: readonly AccessGroupBreakdown[],
  needs: readonly GroupNeeds[],
): string[] {
  const owners = new Map<string, { group: AccessGroupBreakdown; action: AccessActionBreakdown }>();
  for (const group of groups) {
    for (const action of group.actions) owners.set(action.code, { group, action });
  }
  const pulledIn = new Set(needs.flatMap((entry) => entry.needs));
  const sentences: string[] = [];
  for (const { group, needs: codes } of needs) {
    if (!group.grantable || group.summary === 'NONE') continue;
    // Nhom chi dang giu nhung phep XEM ma nhom khac keo theo thi KHONG phai nhom Giam doc da bat —
    // canh bao "chua dung duoc du" cho no la noi ve mot nhom ho chua he chon (khong day chuyen).
    if (usableActions(group).every((action) => pulledIn.has(action.code))) continue;
    const found = codes.flatMap((code) => {
      const owner = owners.get(code);
      return owner === undefined ? [] : [owner];
    });
    const missing = found.filter((entry) => !USABLE.has(entry.action.state));
    if (missing.length > 0) {
      sentences.push(
        `${group.label}: chưa dùng được đủ trên màn hình — cần kèm theo ${listActions(
          missing.map((entry) => entry.action),
        )}`,
      );
    }
    const granted = found.filter(
      (entry) => entry.action.state === 'GRANTED' && entry.group.summary !== 'FULL',
    );
    if (granted.length > 0) {
      sentences.push(
        `Kèm theo để dùng được ${group.label}: ${listActions(granted.map((entry) => entry.action))}`,
      );
    }
  }
  return sentences;
}

function usableActions(group: AccessGroupBreakdown): AccessActionBreakdown[] {
  return group.actions.filter((action) => USABLE.has(action.state));
}

function isReadOnly(action: AccessActionBreakdown): boolean {
  return action.kind === 'XEM';
}

function listActions(actions: readonly AccessActionBreakdown[]): string {
  const shown = actions.slice(0, LISTED_ACTIONS).map((action) => action.label);
  const rest = actions.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} và ${rest} việc khác` : shown.join(', ');
}

/** "Lái xe" → "lái xe" (dung giua cau). */
function lower(label: string): string {
  return label.toLocaleLowerCase('vi');
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
