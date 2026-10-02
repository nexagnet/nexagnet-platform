import type { UserRole } from '../../auth/auth.types.js';
import {
  grantsOf,
  type AccessSubject,
  type AccessViolation,
  type PermissionGrant,
} from '../../auth/access/permission-domain.js';
import {
  ACCOUNTING_DENIED,
  DIRECTOR_ONLY_ACTIONS,
  OPERATIONS_ACTIONS,
  SELF_SCOPE_ACTIONS,
  STAKEHOLDER_SCOPE_ACTIONS,
  TRANSPORT_ACTIONS,
  actionsForRole,
  type TransportAction,
} from '../transport-actions.js';

/**
 * QUY TAC QUYEN RIENG cua mien van tai (`#395`) — ham THUAN, khong DI, khong I/O.
 *
 * `transport-actions.ts` giu TU VUNG va VAI KHOI DIEM (literal, de ban guong web so duoc). Tep nay
 * giu phan con lai: ma nao cap duoc, cap nao xung dot tach nhiem, cap nao la leo thang, va tap quyen
 * HIEU LUC cua mot tai khoan = vai khoi diem + dong quyen rieng.
 *
 * Moi noi kiem quyen van tai (guard, ba cho kiem trong ma) di qua `canPerformTransportAction` — mot
 * cau tra loi, mot cho. Man hinh chi hien lai cau tra loi cua may chu.
 */

export type { AccessSubject, PermissionGrant } from '../../auth/access/permission-domain.js';

/* ------------------------------------------------------------------ *
 * TACH NHIEM — nguoi DUYET tien ⟂ nguoi SUA can cu
 * ------------------------------------------------------------------ */

/** Ba quyet dinh bien mot can cu thanh TIEN. */
export const FINANCIAL_DECISION_ACTIONS = [
  'transport.commercial_acceptance.decide',
  'transport.waiting_allowance.decide',
  'transport.customer_reconciliation.confirm',
] as const satisfies readonly TransportAction[];

/**
 * Bay thao tac SUA chinh can cu ma ba quyet dinh tren dua vao: moc, phien cho, chung tu, chung cu,
 * vi tri phan cung, hang rao (cham LUC DOC — sua mot hang rao doi phan quyet cua ca lich su).
 */
export const EVIDENCE_MUTATION_ACTIONS = [
  'transport.checkpoint.record',
  'transport.waiting.close',
  'transport.operational_document.record',
  'transport.operational_document.withdraw',
  'transport.proof.withdraw',
  'transport.telematics.observation.ingest',
  'transport.geofence.manage',
] as const satisfies readonly TransportAction[];

/**
 * LEO THANG: moi dieu Ke toan bi cam vi mot ly do kiem soat (`ACCOUNTING_DENIED`) nhung KHONG phai
 * chi-Giam-doc. Cap mot ma o day cho vai khac phai co xac nhan tuong minh (`confirmEscalation`) va
 * de lai dong `auth.user.access.escalate` — khong phai mot o danh dau tien tay.
 */
export const ESCALATION_ACTIONS: readonly TransportAction[] = ACCOUNTING_DENIED.filter(
  (action) => !DIRECTOR_ONLY_ACTIONS.includes(action),
);

/** Ma CAP DUOC bang quyen rieng: moi viec van hanh TRU chi-Giam-doc. Pham vi lai xe/ben huu quan den tu LIEN KET. */
export const GRANTABLE_ACTIONS: readonly TransportAction[] = OPERATIONS_ACTIONS.filter(
  (action) => !DIRECTOR_ONLY_ACTIONS.includes(action),
);

/* ------------------------------------------------------------------ *
 * VAI KHOI DIEM co cho quyen rieng khong
 * ------------------------------------------------------------------ */

/**
 * Mot BANG, khong phai mot `if (role === ...)`:
 *   · `FULL`            — Giam doc da co moi quyen van hanh; quyen rieng khong them duoc gi;
 *   · `SELF_SCOPE_ONLY` — Lai xe chi co viec CUA CHINH MINH, va pham vi do den tu lien ket ho so;
 *   · `CUSTOMISABLE`    — Ke toan va Dieu hanh/Quan ly: vai khoi diem + ALLOW/DENY.
 */
type GrantPolicy = 'FULL' | 'SELF_SCOPE_ONLY' | 'CUSTOMISABLE';

const GRANT_POLICY: Readonly<Record<UserRole, GrantPolicy>> = {
  ADMIN: 'FULL',
  SALE: 'SELF_SCOPE_ONLY',
  ACCOUNTING: 'CUSTOMISABLE',
  MANAGER: 'CUSTOMISABLE',
};

export const roleAcceptsGrants = (role: UserRole): boolean => GRANT_POLICY[role] === 'CUSTOMISABLE';

/* ------------------------------------------------------------------ *
 * TAP HIEU LUC
 * ------------------------------------------------------------------ */

const ALL_ACTIONS: ReadonlySet<string> = new Set<string>(TRANSPORT_ACTIONS);
const GRANTABLE: ReadonlySet<TransportAction> = new Set(GRANTABLE_ACTIONS);
const DIRECTOR_ONLY: ReadonlySet<TransportAction> = new Set(DIRECTOR_ONLY_ACTIONS);
const ESCALATION: ReadonlySet<TransportAction> = new Set(ESCALATION_ACTIONS);
const EVIDENCE: ReadonlySet<TransportAction> = new Set(EVIDENCE_MUTATION_ACTIONS);
const SCOPE_ONLY: ReadonlySet<TransportAction> = new Set([
  ...SELF_SCOPE_ACTIONS,
  ...STAKEHOLDER_SCOPE_ACTIONS,
]);

/** Tap vai khoi diem, tinh MOT lan: guard goi o moi request. */
const PRESETS: Readonly<Record<UserRole, ReadonlySet<TransportAction>>> = {
  ADMIN: new Set(actionsForRole('ADMIN')),
  ACCOUNTING: new Set(actionsForRole('ACCOUNTING')),
  MANAGER: new Set(actionsForRole('MANAGER')),
  SALE: new Set(actionsForRole('SALE')),
};

export const isTransportAction = (permission: string): permission is TransportAction =>
  ALL_ACTIONS.has(permission);

const holdsAny = (
  set: ReadonlySet<TransportAction>,
  actions: readonly TransportAction[],
): boolean => actions.some((action) => set.has(action));

/**
 * Tap quyen HIEU LUC cua mot nguoi trong mien van tai.
 *
 *   · `ADMIN` / `SALE` — dung vai khoi diem; quyen rieng (neu lot vao DB) bi BO QUA;
 *   · `ACCOUNTING` / `MANAGER` — (khoi diem − DENY) ∪ (ALLOW ∩ cap duoc). Ma la bi bo qua.
 *
 * PHONG THU THEM TANG: neu tap ket qua giu CA mot quyet dinh tien LAN mot thao tac sua can cu, cac
 * thao tac sua can cu den tu ALLOW bi go ra. `validateTransportGrants` da tu choi bo quyen do luc
 * ghi; dong nay giu cho mot dong DB ghi tay (hoac mot quy tac doi sau nay) khong mo duoc cap cam.
 *
 * Tra ve tap CHI DOC — voi nguoi khong co quyen rieng, chinh la tap vai khoi diem dung chung.
 */
export function effectiveTransportActions(subject: AccessSubject): ReadonlySet<TransportAction> {
  const preset = PRESETS[subject.role];
  const grants = grantsOf(subject);
  if (grants.length === 0 || !roleAcceptsGrants(subject.role)) return preset;

  const denied = new Set<TransportAction>();
  const allowed = new Set<TransportAction>();
  for (const grant of grants) {
    if (!isTransportAction(grant.permission)) continue;
    if (grant.effect === 'DENY' && preset.has(grant.permission)) denied.add(grant.permission);
    if (
      grant.effect === 'ALLOW' &&
      GRANTABLE.has(grant.permission) &&
      !preset.has(grant.permission)
    ) {
      allowed.add(grant.permission);
    }
  }

  const effective = new Set<TransportAction>([...preset].filter((action) => !denied.has(action)));
  for (const action of allowed) effective.add(action);
  if (
    holdsAny(effective, FINANCIAL_DECISION_ACTIONS) &&
    holdsAny(effective, EVIDENCE_MUTATION_ACTIONS)
  ) {
    for (const action of allowed) if (EVIDENCE.has(action)) effective.delete(action);
  }
  return effective;
}

/**
 * Nguoi nay lam duoc hanh dong nay khong — CAU TRA LOI DUY NHAT cua mien van tai.
 *
 * Pham vi ben huu quan KHONG di qua day: no den tu mot hang du lieu, va `TransportActionGuard` xu ly
 * no bang nhanh rieng (xem `STAKEHOLDER_SCOPE_ACTIONS`).
 */
export function canPerformTransportAction(
  subject: AccessSubject,
  action: TransportAction,
): boolean {
  return effectiveTransportActions(subject).has(action);
}

/** Tap hieu luc theo THU TU cua tu vung — cho `/auth/me` va man hinh. */
export function effectiveTransportActionList(subject: AccessSubject): readonly TransportAction[] {
  const effective = effectiveTransportActions(subject);
  return TRANSPORT_ACTIONS.filter((action) => effective.has(action));
}

/* ------------------------------------------------------------------ *
 * KIEM MOT BO QUYEN RIENG truoc khi ghi
 * ------------------------------------------------------------------ */

export const TRANSPORT_GRANT_VIOLATION_CODES = [
  /** Giam doc da co moi quyen van hanh — quyen rieng khong them duoc gi. */
  'ADMIN_PRESET_IS_FULL',
  /** Lai xe chi co viec cua chinh minh, qua lien ket ho so — khong cap them bang quyen rieng. */
  'DRIVER_PRESET_IS_SELF_SCOPE_ONLY',
  'UNKNOWN_PERMISSION',
  /** Viec cua chinh lai xe / xe minh co co phan: den tu LIEN KET, khong cap bang o danh dau. */
  'SCOPE_ACTION_NOT_GRANTABLE',
  'DIRECTOR_ONLY_ACTION',
  /** ALLOW mot quyen vai khoi diem da co, hoac DENY mot quyen vai khoi diem khong co. */
  'GRANT_REDUNDANT',
  /** Cung mot ma quyen xuat hien hai lan trong mot bo. */
  'GRANT_DUPLICATED',
  /** Bo quyen giu CA quyet dinh tien LAN sua can cu cua quyet dinh do. */
  'SOD_CONFLICT',
  /** Cap mot quyen nhay cam ma chua xac nhan leo thang. */
  'ESCALATION_CONFIRMATION_REQUIRED',
] as const;
export type TransportGrantViolationCode = (typeof TRANSPORT_GRANT_VIOLATION_CODES)[number];

export interface TransportGrantViolation extends AccessViolation {
  readonly code: TransportGrantViolationCode;
}

export interface TransportGrantValidationInput {
  readonly role: UserRole;
  readonly grants: readonly PermissionGrant[];
  readonly confirmEscalation: boolean;
}

interface GrantTriage {
  readonly violations: readonly TransportGrantViolation[];
  readonly allows: readonly TransportAction[];
  readonly denies: readonly TransportAction[];
}

/** Tung dong mot: dong nao sai hinh thi thanh mot ly do, dong nao dung thi vao ALLOW/DENY. */
function triageGrants(role: UserRole, grants: readonly PermissionGrant[]): GrantTriage {
  const preset = PRESETS[role];
  const violations: TransportGrantViolation[] = [];
  const allows: TransportAction[] = [];
  const denies: TransportAction[] = [];
  const seen = new Set<string>();
  for (const { permission, effect } of grants) {
    if (seen.has(permission)) {
      violations.push({ code: 'GRANT_DUPLICATED', permission });
      continue;
    }
    seen.add(permission);
    if (!isTransportAction(permission)) {
      violations.push({ code: 'UNKNOWN_PERMISSION', permission });
    } else if (SCOPE_ONLY.has(permission)) {
      violations.push({ code: 'SCOPE_ACTION_NOT_GRANTABLE', permission });
    } else if (DIRECTOR_ONLY.has(permission)) {
      violations.push({ code: 'DIRECTOR_ONLY_ACTION', permission });
    } else if ((effect === 'ALLOW') === preset.has(permission)) {
      violations.push({ code: 'GRANT_REDUNDANT', permission, detail: { effect } });
    } else {
      (effect === 'ALLOW' ? allows : denies).push(permission);
    }
  }
  return { violations, allows, denies };
}

/** Moi cap (quyet dinh tien, sua can cu) cung nam trong tap ket qua, co it nhat mot ve den tu ALLOW. */
function separationOfDutyConflicts(
  role: UserRole,
  allows: readonly TransportAction[],
  denies: readonly TransportAction[],
): TransportGrantViolation[] {
  const allowed = new Set(allows);
  const result = new Set<TransportAction>(
    [...PRESETS[role]].filter((action) => !denies.includes(action)),
  );
  for (const action of allows) result.add(action);

  const conflicts: TransportGrantViolation[] = [];
  for (const decision of FINANCIAL_DECISION_ACTIONS) {
    if (!result.has(decision)) continue;
    for (const evidence of EVIDENCE_MUTATION_ACTIONS) {
      if (!result.has(evidence)) continue;
      if (!allowed.has(decision) && !allowed.has(evidence)) continue;
      conflicts.push({
        code: 'SOD_CONFLICT',
        permission: allowed.has(evidence) ? evidence : decision,
        detail: { decision, evidence },
      });
    }
  }
  return conflicts;
}

/**
 * Ly do tu choi mot bo quyen rieng cho mot vai khoi diem; mang rong = ghi duoc.
 *
 * `grants` la TOAN BO bo quyen sau thay doi (khong phai phan chenh), vi xung dot tach nhiem va leo
 * thang chi co nghia tren ca bo.
 */
export function validateTransportGrants(
  input: TransportGrantValidationInput,
): readonly TransportGrantViolation[] {
  const { role, grants, confirmEscalation } = input;
  if (grants.length === 0) return [];
  const permissions = grants.map((grant) => grant.permission);
  switch (GRANT_POLICY[role]) {
    case 'FULL':
      return [{ code: 'ADMIN_PRESET_IS_FULL', detail: { permissions } }];
    case 'SELF_SCOPE_ONLY':
      return [{ code: 'DRIVER_PRESET_IS_SELF_SCOPE_ONLY', detail: { permissions } }];
    case 'CUSTOMISABLE':
      break;
  }

  const triage = triageGrants(role, grants);
  const violations = [
    ...triage.violations,
    ...separationOfDutyConflicts(role, triage.allows, triage.denies),
  ];
  const escalated = triage.allows.filter((action) => ESCALATION.has(action));
  if (escalated.length > 0 && !confirmEscalation) {
    violations.push({ code: 'ESCALATION_CONFIRMATION_REQUIRED', detail: { actions: escalated } });
  }
  return violations;
}

/**
 * Cac quyen ALLOW trong bo nay la LEO THANG — de ghi dong `auth.user.access.escalate` ke ten tung
 * ma. Theo thu tu cua tu vung, khong lap.
 */
export function escalatedActions(
  role: UserRole,
  grants: readonly PermissionGrant[],
): readonly TransportAction[] {
  if (!roleAcceptsGrants(role)) return [];
  const allowed = new Set(
    grants.filter((grant) => grant.effect === 'ALLOW').map((grant) => grant.permission),
  );
  return TRANSPORT_ACTIONS.filter((action) => ESCALATION.has(action) && allowed.has(action));
}
