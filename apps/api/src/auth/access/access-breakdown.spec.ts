import { describe, expect, it } from 'vitest';
import type { AccessBreakdown } from '../account.types.js';
import { toAccountView } from '../account-view.js';
import type { UserRole } from '../auth.types.js';
import { transportPermissionDomain } from '../../transport/permissions/transport-permission-domain.js';
import { KHO_GROUPS, fakeKhoDomain, grant, userRecord } from '../__tests__/account-fixtures.js';
import { buildAccessBreakdown } from './access-breakdown.js';
import type { AccessScopeNote, PermissionGrant } from './permission-domain.js';

/**
 * "NGUOI NAY LAM DUOC GI?" (`#395`) — trang thai tung viec va cau tra loi tieng Viet, tu danh muc
 * cua mien + tap hieu luc + pham vi lien ket. Mien gia `kho` (xem `account-fixtures.ts`), cung quy
 * uoc voi mien van tai: pham vi `id` = nhom lien ket no mo; mien chi mo ta lien ket DANG TON TAI.
 */

function breakdown(
  role: UserRole,
  grants: readonly PermissionGrant[] = [],
  notes: readonly AccessScopeNote[] = [],
): AccessBreakdown {
  return buildAccessBreakdown({
    account: toAccountView(userRecord('u-1', 'nguoi.a', role, { permissionGrants: grants })),
    domains: [fakeKhoDomain()],
    scopes: [{ domain: 'kho', notes }],
  });
}

const stateOf = (result: AccessBreakdown, code: string): string | undefined =>
  result.groups.flatMap((group) => group.actions).find((action) => action.code === code)?.state;

const LINKED: AccessScopeNote = {
  id: 'kho-rieng',
  label: 'Hồ sơ thủ kho',
  active: true,
  sentence: 'Nối với hồ sơ thủ kho A — làm được việc của chính mình.',
  subject: { id: 'ho-so-1', name: 'Thủ kho A' },
};

describe('buildAccessBreakdown', () => {
  it('vai chi co viec lien ket, CHUA noi ho so: "Chưa nối hồ sơ <vai> — chưa làm được gì"', () => {
    const result = breakdown('SALE');
    expect(result.sentences).toEqual(['Chưa nối hồ sơ thủ kho — chưa làm được gì']);
    expect(stateOf(result, KHO_GROUPS.rieng)).toBe('SCOPE_INACTIVE');
    expect(result.groups.find((group) => group.id === 'kho-rieng')?.summary).toBe('NONE');
    expect(result.preset).toEqual({ role: 'SALE', label: 'Thủ kho' });
    expect(result.scopes).toEqual([]);
  });

  it('DA noi ho so: viec cua minh SCOPE_ACTIVE, nhom FULL, cau cua mien, khong duyet duoc tien', () => {
    const result = breakdown('SALE', [], [LINKED]);
    expect(stateOf(result, KHO_GROUPS.rieng)).toBe('SCOPE_ACTIVE');
    expect(result.groups.find((group) => group.id === 'kho-rieng')?.summary).toBe('FULL');
    expect(result.sentences).toEqual([LINKED.sentence, 'Không duyệt được tiền']);
    expect(result.scopes).toEqual([LINKED]);
  });

  it('ho so da noi nhung dang ngung: SCOPE_INACTIVE, chi cau cua mien (khong them "chua noi")', () => {
    const paused = { ...LINKED, active: false, sentence: 'Hồ sơ thủ kho A đang ngừng hoạt động.' };
    const result = breakdown('SALE', [], [paused]);
    expect(stateOf(result, KHO_GROUPS.rieng)).toBe('SCOPE_INACTIVE');
    expect(result.sentences).toEqual(['Hồ sơ thủ kho A đang ngừng hoạt động.']);
  });

  it('pham vi cua MIEN KHAC trung id nhom khong mo nhom cua mien nay', () => {
    const result = buildAccessBreakdown({
      account: toAccountView(userRecord('u-1', 'nguoi.a', 'SALE')),
      domains: [fakeKhoDomain()],
      scopes: [{ domain: 'mien-khac', notes: [LINKED] }],
    });
    expect(stateOf(result, KHO_GROUPS.rieng)).toBe('SCOPE_INACTIVE');
  });

  it('Dieu hanh trong: chua lam duoc gi', () => {
    expect(breakdown('MANAGER').sentences).toEqual([
      'Chưa làm được gì — chưa được cấp nhóm quyền nào',
    ]);
  });

  it('Dieu hanh trong + noi ho so gop von: viec CHI den tu lien ket thanh SCOPE_ACTIVE', () => {
    const investor: AccessScopeNote = {
      id: 'kho-gop-von',
      label: 'Hồ sơ góp vốn',
      active: true,
      sentence: 'Nối với hồ sơ góp vốn B — xem được kho mình góp vốn.',
    };
    const result = breakdown('MANAGER', [], [investor]);
    expect(stateOf(result, KHO_GROUPS.gopVon)).toBe('SCOPE_ACTIVE');
    expect(result.sentences).toEqual([investor.sentence, 'Không duyệt được tiền']);
    // Khong noi: viec chi-lien-ket la NONE, khong phai "chua noi ho so".
    expect(stateOf(breakdown('MANAGER'), KHO_GROUPS.gopVon)).toBe('NONE');
  });

  it('viec ma mot VAI co san can ca vai do: Dieu hanh noi ho so thu kho van khong lam duoc', () => {
    const result = breakdown('MANAGER', [], [LINKED]);
    expect(stateOf(result, KHO_GROUPS.rieng)).toBe('NONE');
  });

  it('Dieu hanh chi duoc xem: "Chỉ xem", GRANTED, khong duyet duoc tien', () => {
    const result = breakdown('MANAGER', [grant(KHO_GROUPS.xem)]);
    expect(stateOf(result, KHO_GROUPS.xem)).toBe('GRANTED');
    expect(stateOf(result, KHO_GROUPS.sua)).toBe('NONE');
    expect(stateOf(result, KHO_GROUPS.giamDoc)).toBe('DIRECTOR_ONLY');
    expect(result.sentences).toEqual(['Chỉ xem: Phiếu kho', 'Không duyệt được tiền']);
  });

  it('Ke toan bi bo bot mot quyen: DENIED va cau "Đã bỏ bớt"', () => {
    const result = breakdown('ACCOUNTING', [grant(KHO_GROUPS.xem, 'DENY')]);
    expect(stateOf(result, KHO_GROUPS.xem)).toBe('DENIED');
    expect(stateOf(result, KHO_GROUPS.duyet)).toBe('PRESET');
    expect(result.sentences).toContain('Đã bỏ bớt: Xem phiếu kho');
    expect(result.sentences).not.toContain('Không duyệt được tiền');
  });

  it('Giam doc: quyen nen tang + moi nhom cap duoc FULL', () => {
    const result = breakdown('ADMIN');
    expect(result.platform).toEqual([
      {
        code: 'platform.accounts.manage',
        label: 'Quản trị tài khoản & phân quyền',
        state: 'PRESET',
      },
    ]);
    expect(result.sentences[0]).toBe('Quản trị tài khoản & phân quyền');
    expect(result.sentences[1]).toBe('Làm được mọi việc: Phiếu kho; Tiền kho');
    expect(stateOf(result, KHO_GROUPS.giamDoc)).toBe('PRESET');
  });

  it('xem truoc mot bo khac voi bo dang luu (dryRun)', () => {
    const result = buildAccessBreakdown({
      account: toAccountView(userRecord('u-1', 'nguoi.a', 'MANAGER')),
      domains: [fakeKhoDomain()],
      scopes: [],
      role: 'ACCOUNTING',
      grants: [grant(KHO_GROUPS.sua)],
    });
    expect(result.preset.role).toBe('ACCOUNTING');
    expect(stateOf(result, KHO_GROUPS.sua)).toBe('GRANTED');
    expect(result.groups.find((group) => group.id === 'kho-phieu')?.summary).toBe('FULL');
  });
});

/**
 * MIEN VAN TAI THAT: cau tra loi cho tai khoan Lai xe dung nhu thiet ke (`#395` §1.7). Pham vi
 * `lai-xe` / `chu-xe` la quy uoc cua mien van tai (`id` pham vi = `id` nhom lien ket trong danh muc).
 */
describe('buildAccessBreakdown — mien van tai', () => {
  const transport = (role: UserRole, notes: readonly AccessScopeNote[] = []): AccessBreakdown =>
    buildAccessBreakdown({
      account: toAccountView(userRecord('u-1', 'lx.an', role)),
      domains: [transportPermissionDomain()],
      scopes: [{ domain: 'transport', notes }],
    });
  const group = (result: AccessBreakdown, id: string) =>
    result.groups.find((candidate) => candidate.id === id);

  it('Lai xe chua noi ho so: "Chưa nối hồ sơ lái xe — chưa làm được gì"', () => {
    const result = transport('SALE');
    expect(result.preset).toEqual({ role: 'SALE', label: 'Lái xe' });
    expect(result.sentences).toEqual(['Chưa nối hồ sơ lái xe — chưa làm được gì']);
    expect(group(result, 'lai-xe')?.actions.every((a) => a.state === 'SCOPE_INACTIVE')).toBe(true);
  });

  it('Lai xe da noi ho so: nhom viec cua chinh lai xe FULL, khong duyet duoc tien', () => {
    const linked: AccessScopeNote = {
      id: 'lai-xe',
      label: 'Hồ sơ lái xe',
      active: true,
      sentence: 'Nối với hồ sơ lái xe An — làm được việc của chính lái xe này.',
    };
    const result = transport('SALE', [linked]);
    expect(group(result, 'lai-xe')?.summary).toBe('FULL');
    expect(result.sentences).toEqual([linked.sentence, 'Không duyệt được tiền']);
  });

  /**
   * QUYEN KEM THEO (`#395`): Giam doc bat nhom "Quỹ lái xe / lương" thi trinh chinh quyen bat kem
   * "Xem hồ sơ lái xe" (de chon lai xe). Cau tra loi phai noi VI SAO mot phep xem cua nhom Doi xe
   * xuat hien — va khi phep do bi thieu, noi rang nhom chua dung duoc du tren man hinh.
   */
  const groupActions = (id: string): PermissionGrant[] =>
    transportPermissionDomain()
      .catalog()
      .groups.find((entry) => entry.id === id)!
      .actions.filter((action) => !action.directorOnly && !action.escalation)
      .map((action) => grant(action.code));
  const managerWith = (grants: readonly PermissionGrant[]): AccessBreakdown =>
    buildAccessBreakdown({
      account: toAccountView(
        userRecord('u-1', 'dieu.hanh', 'MANAGER', { permissionGrants: grants }),
      ),
      domains: [transportPermissionDomain()],
      scopes: [],
    });

  it('quyen kem theo DUOC CAP: noi "Kèm theo để dùng được …"', () => {
    const result = managerWith([...groupActions('quy-luong'), grant('transport.driver.read')]);
    expect(result.sentences).toContain(
      'Kèm theo để dùng được Quỹ lái xe / lương: Xem hồ sơ lái xe',
    );
    expect(result.sentences.some((line) => line.includes('chưa dùng được đủ'))).toBe(false);
  });

  it('quyen kem theo THIEU: noi nhom chua dung duoc du tren man hinh, va thieu gi', () => {
    const result = managerWith(groupActions('bao-duong'));
    expect(result.sentences).toContain(
      'Bảo dưỡng / giấy tờ: chưa dùng được đủ trên màn hình — cần kèm theo Xem danh sách xe, Xem hồ sơ lái xe',
    );
  });

  it('quyen kem theo KHONG day chuyen: nhom chi dang giu phep xem bi keo theo thi khong bi canh bao', () => {
    const fieldGroup = transportPermissionDomain()
      .catalog()
      .groups.find((entry) => entry.id === 'hien-truong')!;
    const result = managerWith([
      ...groupActions('hien-truong'),
      ...(fieldGroup.needs ?? []).map((code) => grant(code)),
    ]);
    expect(result.sentences.some((line) => line.includes('chưa dùng được đủ'))).toBe(false);
    expect(
      result.sentences.some((line) => line.startsWith('Kèm theo để dùng được Hiện trường')),
    ).toBe(true);
  });

  it('vai khoi diem da co san quyen kem theo: khong them cau nao (Giam doc, Ke toan)', () => {
    for (const role of ['ADMIN', 'ACCOUNTING'] as const) {
      const sentences = transport(role).sentences;
      expect(
        sentences.some((line) => line.startsWith('Kèm theo')),
        role,
      ).toBe(false);
      expect(
        sentences.some((line) => line.includes('chưa dùng được đủ')),
        role,
      ).toBe(false);
    }
  });

  it('Ke toan bi BOT mot quyen kem theo: nhom dung no noi ra dieu do', () => {
    const result = buildAccessBreakdown({
      account: toAccountView(
        userRecord('u-1', 'ke.toan', 'ACCOUNTING', {
          permissionGrants: [grant('transport.vehicle.read', 'DENY')],
        }),
      ),
      domains: [transportPermissionDomain()],
      scopes: [],
    });
    expect(result.sentences).toContain(
      'Bảo dưỡng / giấy tờ: chưa dùng được đủ trên màn hình — cần kèm theo Xem danh sách xe',
    );
  });

  it('Chu xe (Dieu hanh trong + ho so gop von): chi xem xe minh co co phan', () => {
    const investor: AccessScopeNote = {
      id: 'chu-xe',
      label: 'Hồ sơ bên góp vốn',
      active: true,
      sentence: 'Nối với hồ sơ bên góp vốn B — xem được các xe mình có cổ phần.',
    };
    const result = transport('MANAGER', [investor]);
    expect(group(result, 'chu-xe')?.summary).toBe('FULL');
    expect(group(result, 'lai-xe')?.summary).toBe('NONE');
    expect(result.sentences).toContain(investor.sentence);
    expect(transport('MANAGER').sentences).toEqual([
      'Chưa làm được gì — chưa được cấp nhóm quyền nào',
    ]);
  });
});
