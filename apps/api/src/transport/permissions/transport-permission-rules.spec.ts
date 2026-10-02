import { describe, expect, it } from 'vitest';
import { USER_ROLES } from '../../auth/auth.types.js';
import type { PermissionGrant } from '../../auth/access/permission-domain.js';
import {
  ACCOUNTING_DENIED,
  DIRECTOR_ONLY_ACTIONS,
  SELF_SCOPE_ACTIONS,
  STAKEHOLDER_SCOPE_ACTIONS,
  TRANSPORT_ACTIONS,
  actionsForRole,
  presetIncludes,
  type TransportAction,
} from '../transport-actions.js';
import {
  ESCALATION_ACTIONS,
  EVIDENCE_MUTATION_ACTIONS,
  FINANCIAL_DECISION_ACTIONS,
  GRANTABLE_ACTIONS,
  TRANSPORT_GRANT_VIOLATION_CODES,
  canPerformTransportAction,
  effectiveTransportActionList,
  effectiveTransportActions,
  escalatedActions,
  validateTransportGrants,
  type TransportGrantViolationCode,
} from './transport-permission-rules.js';

const allow = (permission: string): PermissionGrant => ({ permission, effect: 'ALLOW' });
const deny = (permission: string): PermissionGrant => ({ permission, effect: 'DENY' });
const codesOf = (violations: readonly { code: string }[]): string[] =>
  violations.map((violation) => violation.code);

describe('quy tac quyen rieng van tai — cac tap co dinh (#395)', () => {
  it('ba quyet dinh tien va bay thao tac sua can cu', () => {
    expect([...FINANCIAL_DECISION_ACTIONS]).toEqual([
      'transport.commercial_acceptance.decide',
      'transport.waiting_allowance.decide',
      'transport.customer_reconciliation.confirm',
    ]);
    expect([...EVIDENCE_MUTATION_ACTIONS]).toEqual([
      'transport.checkpoint.record',
      'transport.waiting.close',
      'transport.operational_document.record',
      'transport.operational_document.withdraw',
      'transport.proof.withdraw',
      'transport.telematics.observation.ingest',
      'transport.geofence.manage',
    ]);
  });

  it('leo thang = Ke toan bi cam TRU chi-Giam-doc (suy ra, khong go tay)', () => {
    expect([...ESCALATION_ACTIONS]).toEqual(
      ACCOUNTING_DENIED.filter((action) => !DIRECTOR_ONLY_ACTIONS.includes(action)),
    );
    expect(ESCALATION_ACTIONS).toContain('transport.trip.cancel');
    expect(ESCALATION_ACTIONS).toContain('transport.location.history.read');
    expect(ESCALATION_ACTIONS).not.toContain('transport.costing.period.reopen');
  });

  /** Cap mot thao tac sua can cu cho vai khac LUON phai xac nhan — khong ma nao lot. */
  it('moi thao tac sua can cu deu la leo thang', () => {
    for (const action of EVIDENCE_MUTATION_ACTIONS)
      expect(ESCALATION_ACTIONS, action).toContain(action);
  });

  it('cap duoc = viec van hanh, KHONG pham vi lai xe / ben huu quan / chi-Giam-doc', () => {
    for (const action of GRANTABLE_ACTIONS) {
      expect(SELF_SCOPE_ACTIONS, action).not.toContain(action);
      expect(STAKEHOLDER_SCOPE_ACTIONS, action).not.toContain(action);
      expect(DIRECTOR_ONLY_ACTIONS, action).not.toContain(action);
    }
    expect(GRANTABLE_ACTIONS.length).toBe(
      TRANSPORT_ACTIONS.length -
        SELF_SCOPE_ACTIONS.length -
        STAKEHOLDER_SCOPE_ACTIONS.length -
        DIRECTOR_ONLY_ACTIONS.length,
    );
  });

  /** Vai khoi diem Ke toan tu no da SACH tach nhiem: co ba quyet dinh, khong mot thao tac sua. */
  it('vai khoi diem Ke toan co moi quyet dinh tien va khong mot thao tac sua can cu', () => {
    for (const action of FINANCIAL_DECISION_ACTIONS) {
      expect(presetIncludes('ACCOUNTING', action), action).toBe(true);
    }
    for (const action of EVIDENCE_MUTATION_ACTIONS) {
      expect(presetIncludes('ACCOUNTING', action), action).toBe(false);
    }
  });

  it('bang ma ly do la dong va khong trung', () => {
    expect(new Set(TRANSPORT_GRANT_VIOLATION_CODES).size).toBe(
      TRANSPORT_GRANT_VIOLATION_CODES.length,
    );
  });
});

describe('tap quyen hieu luc', () => {
  /** Moi `authUser` dung truoc #395 khong co `permissionGrants` — va phai duoc tra loi nhu hom nay. */
  it.each(USER_ROLES)('%s: thieu / null / rong quyen rieng = dung vai khoi diem', (role) => {
    const preset = actionsForRole(role);
    for (const permissionGrants of [undefined, null, []] as const) {
      expect(effectiveTransportActionList({ role, permissionGrants })).toEqual(preset);
    }
    for (const action of TRANSPORT_ACTIONS) {
      expect(canPerformTransportAction({ role }, action), `${role} ${action}`).toBe(
        presetIncludes(role, action),
      );
    }
  });

  it('Giam doc va Lai xe BO QUA quyen rieng lot vao DB', () => {
    const grants = [deny('transport.trip.read'), allow('transport.vehicle.read')];
    expect(effectiveTransportActionList({ role: 'ADMIN', permissionGrants: grants })).toEqual(
      actionsForRole('ADMIN'),
    );
    expect(effectiveTransportActionList({ role: 'SALE', permissionGrants: grants })).toEqual(
      actionsForRole('SALE'),
    );
  });

  it('Ke toan: DENY bot mot quyen vai khoi diem', () => {
    const subject = {
      role: 'ACCOUNTING' as const,
      permissionGrants: [deny('transport.customer_payment.record')],
    };
    expect(canPerformTransportAction(subject, 'transport.customer_payment.record')).toBe(false);
    expect(canPerformTransportAction(subject, 'transport.customer_payment.read')).toBe(true);
  });

  it('Dieu hanh (MANAGER): ALLOW them mot quyen cap duoc', () => {
    const subject = {
      role: 'MANAGER' as const,
      permissionGrants: [allow('transport.vehicle.read'), allow('transport.vehicle.manage')],
    };
    expect(effectiveTransportActionList(subject)).toEqual([
      'transport.vehicle.read',
      'transport.vehicle.manage',
    ]);
  });

  it('ma la, pham vi, chi-Giam-doc va DENY ngoai vai khoi diem deu bi bo qua', () => {
    const subject = {
      role: 'MANAGER' as const,
      permissionGrants: [
        allow('transport.nope'),
        allow('transport.driver.self.trip.read'),
        allow('transport.stakeholder.self.vehicle.read'),
        allow('transport.account_link.manage'),
        allow('transport.driver_settlement.reverse'),
        deny('transport.trip.read'),
      ],
    };
    expect(effectiveTransportActionList(subject)).toEqual([]);
  });

  /**
   * PHONG THU THEM TANG — ca hai chieu. Bo quyen nay bi `validateTransportGrants` tu choi luc ghi;
   * neu no van nam trong DB (ghi tay), tap hieu luc KHONG mo cap cam.
   */
  it('Ke toan giu quyet dinh tien + ALLOW sua can cu: thao tac sua bi go', () => {
    const subject = {
      role: 'ACCOUNTING' as const,
      permissionGrants: [allow('transport.checkpoint.record'), allow('transport.trip.cancel')],
    };
    expect(canPerformTransportAction(subject, 'transport.checkpoint.record')).toBe(false);
    expect(canPerformTransportAction(subject, 'transport.commercial_acceptance.decide')).toBe(true);
    // Leo thang KHONG phai sua can cu — no van co hieu luc.
    expect(canPerformTransportAction(subject, 'transport.trip.cancel')).toBe(true);
  });

  it('Dieu hanh ALLOW sua can cu roi ALLOW quyet dinh tien: giu quyet dinh, go thao tac sua', () => {
    const subject = {
      role: 'MANAGER' as const,
      permissionGrants: [
        allow('transport.geofence.manage'),
        allow('transport.waiting_allowance.decide'),
      ],
    };
    expect(canPerformTransportAction(subject, 'transport.waiting_allowance.decide')).toBe(true);
    expect(canPerformTransportAction(subject, 'transport.geofence.manage')).toBe(false);
  });

  it('Ke toan BO ca ba quyet dinh tien thi duoc giu thao tac sua can cu', () => {
    const subject = {
      role: 'ACCOUNTING' as const,
      permissionGrants: [
        ...FINANCIAL_DECISION_ACTIONS.map(deny),
        allow('transport.checkpoint.record'),
      ],
    };
    expect(canPerformTransportAction(subject, 'transport.checkpoint.record')).toBe(true);
    expect(canPerformTransportAction(subject, 'transport.commercial_acceptance.decide')).toBe(
      false,
    );
  });
});

describe('kiem mot bo quyen rieng truoc khi ghi', () => {
  const validate = (
    role: (typeof USER_ROLES)[number],
    grants: readonly PermissionGrant[],
    confirmEscalation = false,
  ) => validateTransportGrants({ role, grants, confirmEscalation });

  it('bo rong luon hop le, voi moi vai', () => {
    for (const role of USER_ROLES) expect(validate(role, [])).toEqual([]);
  });

  it('ADMIN_PRESET_IS_FULL — Giam doc khong nhan quyen rieng nao', () => {
    expect(validate('ADMIN', [deny('transport.trip.read')])).toEqual([
      { code: 'ADMIN_PRESET_IS_FULL', detail: { permissions: ['transport.trip.read'] } },
    ]);
  });

  it('DRIVER_PRESET_IS_SELF_SCOPE_ONLY — Lai xe khong nhan quyen rieng nao', () => {
    expect(codesOf(validate('SALE', [allow('transport.vehicle.read')]))).toEqual([
      'DRIVER_PRESET_IS_SELF_SCOPE_ONLY',
    ]);
  });

  it('UNKNOWN_PERMISSION', () => {
    expect(validate('MANAGER', [allow('transport.nope')])).toEqual([
      { code: 'UNKNOWN_PERMISSION', permission: 'transport.nope' },
    ]);
  });

  it.each([...SELF_SCOPE_ACTIONS, ...STAKEHOLDER_SCOPE_ACTIONS])(
    'SCOPE_ACTION_NOT_GRANTABLE — %s den tu lien ket, khong tu o danh dau',
    (action) => {
      expect(codesOf(validate('MANAGER', [allow(action)]))).toEqual(['SCOPE_ACTION_NOT_GRANTABLE']);
    },
  );

  it.each(DIRECTOR_ONLY_ACTIONS)('DIRECTOR_ONLY_ACTION — %s', (action) => {
    expect(codesOf(validate('ACCOUNTING', [allow(action)], true))).toEqual([
      'DIRECTOR_ONLY_ACTION',
    ]);
  });

  it('GRANT_REDUNDANT — ALLOW da co trong vai khoi diem / DENY khong co trong vai khoi diem', () => {
    expect(validate('ACCOUNTING', [allow('transport.trip.read')])).toEqual([
      { code: 'GRANT_REDUNDANT', permission: 'transport.trip.read', detail: { effect: 'ALLOW' } },
    ]);
    expect(validate('MANAGER', [deny('transport.trip.read')])).toEqual([
      { code: 'GRANT_REDUNDANT', permission: 'transport.trip.read', detail: { effect: 'DENY' } },
    ]);
  });

  it('GRANT_DUPLICATED — mot ma xuat hien hai lan', () => {
    expect(
      codesOf(validate('MANAGER', [allow('transport.trip.read'), deny('transport.trip.read')])),
    ).toEqual(['GRANT_DUPLICATED']);
  });

  it('SOD_CONFLICT — them sua can cu cho nguoi dang giu quyet dinh tien', () => {
    const violations = validate('ACCOUNTING', [allow('transport.checkpoint.record')], true);
    expect(violations).toEqual(
      FINANCIAL_DECISION_ACTIONS.map((decision) => ({
        code: 'SOD_CONFLICT',
        permission: 'transport.checkpoint.record',
        detail: { decision, evidence: 'transport.checkpoint.record' },
      })),
    );
  });

  it('SOD_CONFLICT — them quyet dinh tien cho nguoi duoc cap sua can cu', () => {
    const violations = validate(
      'MANAGER',
      [allow('transport.proof.withdraw'), allow('transport.customer_reconciliation.confirm')],
      true,
    );
    expect(violations).toEqual([
      {
        code: 'SOD_CONFLICT',
        permission: 'transport.proof.withdraw',
        detail: {
          decision: 'transport.customer_reconciliation.confirm',
          evidence: 'transport.proof.withdraw',
        },
      },
    ]);
  });

  it('bo quyet dinh tien roi moi nhan sua can cu thi KHONG xung dot', () => {
    const grants = [...FINANCIAL_DECISION_ACTIONS.map(deny), allow('transport.checkpoint.record')];
    expect(validate('ACCOUNTING', grants, true)).toEqual([]);
  });

  it('ESCALATION_CONFIRMATION_REQUIRED — chua xac nhan thi tu choi, xac nhan roi thi qua', () => {
    const grants = [allow('transport.trip.cancel'), allow('transport.location.history.read')];
    expect(validate('MANAGER', grants)).toEqual([
      {
        code: 'ESCALATION_CONFIRMATION_REQUIRED',
        detail: { actions: ['transport.trip.cancel', 'transport.location.history.read'] },
      },
    ]);
    expect(validate('MANAGER', grants, true)).toEqual([]);
  });

  /** Moi ma cap duoc, cap le cho Dieu hanh (co xac nhan), deu ghi duoc va co hieu luc that. */
  it.each(GRANTABLE_ACTIONS)('cap le %s cho Dieu hanh: hop le va co hieu luc', (action) => {
    expect(validate('MANAGER', [allow(action)], true)).toEqual([]);
    expect(
      canPerformTransportAction({ role: 'MANAGER', permissionGrants: [allow(action)] }, action),
    ).toBe(true);
  });

  it('moi ma ly do deu co mot bai o tren', () => {
    const covered: readonly TransportGrantViolationCode[] = [
      'ADMIN_PRESET_IS_FULL',
      'DRIVER_PRESET_IS_SELF_SCOPE_ONLY',
      'UNKNOWN_PERMISSION',
      'SCOPE_ACTION_NOT_GRANTABLE',
      'DIRECTOR_ONLY_ACTION',
      'GRANT_REDUNDANT',
      'GRANT_DUPLICATED',
      'SOD_CONFLICT',
      'ESCALATION_CONFIRMATION_REQUIRED',
    ];
    expect([...covered].sort()).toEqual([...TRANSPORT_GRANT_VIOLATION_CODES].sort());
  });
});

describe('quyen leo thang cho so kiem toan', () => {
  it('chi cac ALLOW leo thang, theo thu tu tu vung, khong lap', () => {
    const grants: PermissionGrant[] = [
      allow('transport.location.history.read'),
      allow('transport.vehicle.read'),
      allow('transport.trip.cancel'),
      deny('transport.geofence.manage'),
    ];
    const expected: TransportAction[] = [
      'transport.trip.cancel',
      'transport.location.history.read',
    ];
    expect(escalatedActions('MANAGER', grants)).toEqual(expected);
  });

  it('vai khong nhan quyen rieng thi khong co gi leo thang', () => {
    expect(escalatedActions('ADMIN', [allow('transport.trip.cancel')])).toEqual([]);
    expect(escalatedActions('SALE', [allow('transport.trip.cancel')])).toEqual([]);
  });

  it('tap hieu luc la tap chi doc dung chung cho nguoi khong co quyen rieng', () => {
    expect(effectiveTransportActions({ role: 'ADMIN' })).toBe(
      effectiveTransportActions({ role: 'ADMIN' }),
    );
  });
});
