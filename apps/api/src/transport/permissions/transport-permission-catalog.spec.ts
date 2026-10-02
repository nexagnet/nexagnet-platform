import { describe, expect, it } from 'vitest';
import { USER_ROLES } from '../../auth/auth.types.js';
import {
  DIRECTOR_ONLY_ACTIONS,
  SELF_SCOPE_ACTIONS,
  STAKEHOLDER_SCOPE_ACTIONS,
  TRANSPORT_ACTIONS,
  type TransportAction,
} from '../transport-actions.js';
import {
  TRANSPORT_PERMISSION_GROUP_IDS,
  TRANSPORT_PERMISSION_GROUPS,
  TRANSPORT_PRESETS,
  transportActionKind,
  transportPermissionCatalog,
  transportPermissionGroupOf,
} from './transport-permission-catalog.js';
import {
  ESCALATION_ACTIONS,
  EVIDENCE_MUTATION_ACTIONS,
  FINANCIAL_DECISION_ACTIONS,
} from './transport-permission-rules.js';

const SCOPE_ACTIONS = new Set<TransportAction>([
  ...SELF_SCOPE_ACTIONS,
  ...STAKEHOLDER_SCOPE_ACTIONS,
]);
const codesIn = (group: (typeof TRANSPORT_PERMISSION_GROUPS)[number]): TransportAction[] =>
  Object.keys(group.actions) as TransportAction[];

describe('danh muc quyen van tai (#395)', () => {
  /**
   * DAY DU: them mot ma vao `TRANSPORT_ACTIONS` ma quen xep nhom thi bai nay do — man hinh quyen
   * khong duoc co mot ma "vo hinh" ma Giam doc khong bat tat duoc.
   */
  it('moi hanh dong nam trong DUNG MOT nhom', () => {
    const seen = new Map<string, number>();
    for (const group of TRANSPORT_PERMISSION_GROUPS) {
      for (const code of codesIn(group)) seen.set(code, (seen.get(code) ?? 0) + 1);
    }
    for (const action of TRANSPORT_ACTIONS) expect(seen.get(action), action).toBe(1);
    expect([...seen.keys()].sort()).toEqual([...TRANSPORT_ACTIONS].sort());
  });

  it('nhom dung thu tu va khong trung ma', () => {
    expect(TRANSPORT_PERMISSION_GROUPS.map((group) => group.id)).toEqual([
      ...TRANSPORT_PERMISSION_GROUP_IDS,
    ]);
  });

  /** Viec cua chinh lai xe / xe minh co co phan den tu LIEN KET, khong tu mot o danh dau. */
  it('nhom cap duoc khong chua ma pham vi; nhom pham vi chi chua ma pham vi', () => {
    for (const group of TRANSPORT_PERMISSION_GROUPS) {
      for (const code of codesIn(group)) {
        expect(SCOPE_ACTIONS.has(code), `${group.id} / ${code}`).toBe(!group.grantable);
      }
    }
    const lookup = (id: string) => TRANSPORT_PERMISSION_GROUPS.find((group) => group.id === id)!;
    expect(codesIn(lookup('lai-xe'))).toEqual([...SELF_SCOPE_ACTIONS]);
    expect(codesIn(lookup('chu-xe'))).toEqual([...STAKEHOLDER_SCOPE_ACTIONS]);
    expect(codesIn(lookup('quan-tri'))).toEqual(['transport.account_link.manage']);
  });

  it('loai cua moi ma SUY tu quy tac, khong go tay', () => {
    const views = transportPermissionCatalog().groups.flatMap((group) => group.actions);
    expect(views).toHaveLength(TRANSPORT_ACTIONS.length);
    for (const view of views) {
      const code = view.code as TransportAction;
      const directorOnly = DIRECTOR_ONLY_ACTIONS.includes(code);
      const escalation = ESCALATION_ACTIONS.includes(code);
      expect(view.directorOnly, code).toBe(directorOnly);
      expect(view.escalation, code).toBe(escalation);
      expect(view.kind, code).toBe(transportActionKind(code));
      if (directorOnly || escalation) expect(view.kind, code).toBe('NHAY_CAM');
      else if ((FINANCIAL_DECISION_ACTIONS as readonly string[]).includes(code)) {
        expect(view.kind, code).toBe('DUYET');
      } else if (code.endsWith('.read')) expect(view.kind, code).toBe('XEM');
      else expect(view.kind, code).toBe('THAO_TAC');
      const sod = (FINANCIAL_DECISION_ACTIONS as readonly string[]).includes(code)
        ? 'DECISION'
        : (EVIDENCE_MUTATION_ACTIONS as readonly string[]).includes(code)
          ? 'EVIDENCE'
          : null;
      expect(view.sod, code).toBe(sod);
    }
  });

  it('doc duong di tung phut la NHAY CAM, khong phai mot phep xem thuong', () => {
    expect(transportActionKind('transport.location.history.read')).toBe('NHAY_CAM');
    expect(transportActionKind('transport.tracking.read')).toBe('XEM');
    expect(transportActionKind('transport.commercial_acceptance.decide')).toBe('DUYET');
    expect(transportActionKind('transport.vehicle.manage')).toBe('THAO_TAC');
  });

  /** Nhan la cho Giam doc doc: tieng Viet co dau, theo nghiep vu, khong lo ten ma. */
  it('nhan tieng Viet co dau, khong lo ma, khong trung nhau', () => {
    const labels = transportPermissionCatalog().groups.flatMap((group) => [
      group.label,
      group.summary,
      ...group.actions.map((action) => action.label),
    ]);
    for (const label of labels) {
      expect(label.trim().length, label).toBeGreaterThan(0);
      // Co it nhat mot chu co dau tieng Viet — nhan khong duoc la chu khong dau hay ten ma.
      expect(label, label).toMatch(/[À-ỹ]/);
      expect(label, label).not.toMatch(/transport\.|_/);
    }
    const actionLabels = transportPermissionCatalog().groups.flatMap((group) =>
      group.actions.map((action) => action.label),
    );
    expect(new Set(actionLabels).size).toBe(actionLabels.length);
  });

  it('bon vai khoi diem, moi vai mot lan, co ten nghiep vu', () => {
    expect(TRANSPORT_PRESETS.map((preset) => preset.role).sort()).toEqual([...USER_ROLES].sort());
    expect(TRANSPORT_PRESETS.find((preset) => preset.role === 'ADMIN')?.label).toBe('Giám đốc');
    expect(TRANSPORT_PRESETS.find((preset) => preset.role === 'SALE')?.label).toBe('Lái xe');
    expect(transportPermissionCatalog().presets).toBe(TRANSPORT_PRESETS);
  });

  /**
   * QUYEN KEM THEO (`#395`) chi la loi chi duong toi man hinh cua nhom khac — no KHONG duoc thanh mot
   * duong cap ngam mot quyen nhay cam: chi phep XEM thuong, cap duoc, cua NHOM KHAC, khong trung.
   * (Bai web `section-access.spec.ts` khoa phan con lai: nhom + kem theo mo it nhat mot muc.)
   */
  it('quyen kem theo la phep XEM thuong, cap duoc, cua nhom KHAC', () => {
    const views = new Map(
      transportPermissionCatalog().groups.flatMap((group) =>
        group.actions.map((action) => [action.code, { group: group.id, action }] as const),
      ),
    );
    for (const group of TRANSPORT_PERMISSION_GROUPS) {
      expect(new Set(group.needs).size, group.id).toBe(group.needs.length);
      if (!group.grantable) expect(group.needs, group.id).toEqual([]);
      for (const need of group.needs) {
        const found = views.get(need);
        expect(found?.group, `${group.id} → ${need}`).not.toBe(group.id);
        expect(transportPermissionGroupOf(need)?.grantable, need).toBe(true);
        expect(found?.action.kind, need).toBe('XEM');
        expect(found?.action.escalation, need).toBe(false);
        expect(found?.action.directorOnly, need).toBe(false);
        expect(found?.action.sod, need).toBeNull();
      }
    }
    // Than HTTP cua danh muc mang dung bo do.
    for (const view of transportPermissionCatalog().groups) {
      const source = TRANSPORT_PERMISSION_GROUPS.find((group) => group.id === view.id);
      expect(view.needs, view.id).toEqual(source?.needs);
    }
    expect(TRANSPORT_PERMISSION_GROUPS.find((group) => group.id === 'quy-luong')?.needs).toContain(
      'transport.driver.read',
    );
  });

  it('tra nguoc nhom cua mot ma', () => {
    for (const action of TRANSPORT_ACTIONS) {
      expect(transportPermissionGroupOf(action)?.actions[action], action).toBeDefined();
    }
    expect(transportPermissionGroupOf('transport.geofence.manage')?.id).toBe('ban-do');
  });
});
