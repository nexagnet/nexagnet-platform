import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessBreakdown, AccountView } from './account.types.js';
import {
  KHO_GROUPS,
  accountHarness,
  errorBodyOf,
  grant,
  reasonOf,
  userRecord,
} from './__tests__/account-fixtures.js';

/**
 * QUY TAC QUAN TRI TAI KHOAN (`#395`) — moi duong tu choi mot MA ly do, moi thay doi mot dong kiem
 * toan co `before` + `after`, moi quyet dinh mot ban ghi `account.access`.
 *
 * Chay tren kho bo nho THAT (`InMemoryUserRepository`) va mot mien gia (`kho`): nen tang phai dung
 * voi moi mien theo hop dong `PermissionDomain`, khong chi voi van tai.
 */

const DIRECTOR = userRecord('gd-1', 'giam.doc', 'ADMIN');
const DIRECTOR_2 = userRecord('gd-2', 'giam.doc.hai', 'ADMIN');
const MANAGER = userRecord('dh-1', 'dieu.hanh', 'MANAGER');
const ACCOUNTANT = userRecord('kt-1', 'ke.toan', 'ACCOUNTING');
const DRIVER = userRecord('lx-1', 'lx.an', 'SALE');
const OPS = userRecord('ops-1', 'ops.bot', 'ADMIN');

const actor = { id: DIRECTOR.id, username: DIRECTOR.username };
const TEMP_FORMAT = /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('tao tai khoan', () => {
  it('khong nhap mat khau → he thong cap mat khau tam 16 ky tu, song 72 gio, bat doi mat khau', async () => {
    const h = accountHarness([DIRECTOR]);
    const before = Date.now();
    const created = await h.service.createUser(actor, {
      username: 'Dieu.Hanh.Moi',
      name: 'Điều hành mới',
      jobTitle: 'Điều hành ca đêm',
      role: 'MANAGER',
      grants: [grant(KHO_GROUPS.xem), grant(KHO_GROUPS.sua)],
    });

    expect(created.credential.temporaryPassword).toMatch(TEMP_FORMAT);
    const expiresAt = new Date(created.credential.expiresAt).getTime();
    expect(expiresAt - before).toBeGreaterThanOrEqual(72 * 3_600_000 - 1_000);
    expect(expiresAt - before).toBeLessThanOrEqual(72 * 3_600_000 + 5_000);
    expect(created).toMatchObject({
      username: 'dieu.hanh.moi',
      mustChangePassword: true,
      jobTitle: 'Điều hành ca đêm',
      isProtected: false,
      permissionGrants: [grant(KHO_GROUPS.sua), grant(KHO_GROUPS.xem)],
    });
    const stored = await h.repository.findByUsername('dieu.hanh.moi');
    expect(stored?.permissionGrants).toEqual([grant(KHO_GROUPS.sua), grant(KHO_GROUPS.xem)]);
    expect(h.passwords.hash).toHaveBeenCalledWith(created.credential.temporaryPassword);
    // Mat khau tam CHI trong phan hoi — khong vao so kiem toan, khong vao telemetry.
    const leaked = JSON.stringify([h.audit.append.mock.calls, h.telemetry.decision.mock.calls]);
    expect(leaked).not.toContain(created.credential.temporaryPassword);
    expect(h.telemetry.step).toHaveBeenCalledWith('account.create', expect.any(Function));
    expect(h.telemetry.decision).toHaveBeenCalledWith(
      expect.objectContaining({
        point: 'account.access',
        outcome: 'allowed',
        reason: 'ACCOUNT_CHANGE_ALLOWED',
      }),
    );
  });

  it('ten danh cho he thong (nen tang + mien) → USERNAME_RESERVED, ghi quyet dinh tu choi', async () => {
    const h = accountHarness([DIRECTOR]);
    for (const username of ['internal-service', 'SYSTEM', 'demo-seed', 'mcp-agent']) {
      expect(
        await reasonOf(h.service.createUser(actor, { username, name: 'X', role: 'SALE' })),
      ).toBe('USERNAME_RESERVED');
    }
    expect(h.telemetry.decision).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'denied', reason: 'USERNAME_RESERVED' }),
    );
  });

  it('tao Giam doc phai xac nhan leo thang; co xac nhan thi ghi them dong escalate', async () => {
    const h = accountHarness([DIRECTOR]);
    const body = await errorBodyOf(
      h.service.createUser(actor, { username: 'gd.moi', name: 'GĐ mới', role: 'ADMIN' }),
    );
    expect(body).toMatchObject({
      statusCode: 409,
      error: 'Conflict',
      reason: 'ESCALATION_CONFIRMATION_REQUIRED',
      detail: {
        violations: [{ code: 'ESCALATION_CONFIRMATION_REQUIRED', detail: { role: 'ADMIN' } }],
        // Doi len Giam doc khong ke quyen nao: man hinh doc `actions` va noi cau chung.
        actions: [],
      },
    });
    expect(await h.repository.findByUsername('gd.moi')).toBeNull();

    await h.service.createUser(actor, {
      username: 'gd.moi',
      name: 'GĐ mới',
      role: 'ADMIN',
      confirmEscalation: true,
    });
    expect(h.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.user.access.escalate',
        after: expect.objectContaining({ role: 'ADMIN', promotedToAdmin: true }),
      }),
    );
  });

  it('bo quyen sai → ACCESS_INVALID kem tung vi pham (nen tang + mien)', async () => {
    const h = accountHarness([DIRECTOR]);
    const body = await errorBodyOf(
      h.service.createUser(actor, {
        username: 'dh.sai',
        name: 'Sai',
        role: 'MANAGER',
        grants: [
          grant('platform.accounts.manage'),
          grant('khong-mien.gi'),
          grant(KHO_GROUPS.xem),
          grant(KHO_GROUPS.xem, 'DENY'),
        ],
      }),
    );
    expect(body.reason).toBe('ACCESS_INVALID');
    expect(
      (body.detail as { violations: { code: string }[] }).violations.map((v) => v.code),
    ).toEqual(['PLATFORM_PERMISSION_NOT_GRANTABLE', 'UNKNOWN_PERMISSION', 'GRANT_DUPLICATED']);
  });

  it('quyen rieng tren vai khong tuy bien duoc (lai xe / Giam doc) → ACCESS_INVALID', async () => {
    const h = accountHarness([DIRECTOR]);
    expect(
      await reasonOf(
        h.service.createUser(actor, {
          username: 'lx.moi',
          name: 'Lái xe',
          role: 'SALE',
          grants: [grant(KHO_GROUPS.xem)],
        }),
      ),
    ).toBe('ACCESS_INVALID');
  });

  it('quyen nhay cam cua mien chua xac nhan → ESCALATION_CONFIRMATION_REQUIRED', async () => {
    const h = accountHarness([DIRECTOR]);
    expect(
      await reasonOf(
        h.service.createUser(actor, {
          username: 'dh.nhay',
          name: 'Nhạy',
          role: 'MANAGER',
          grants: [grant(KHO_GROUPS.nhay)],
        }),
      ),
    ).toBe('ESCALATION_CONFIRMATION_REQUIRED');
  });

  /**
   * Man hinh doc `detail.actions` o CAP CAO NHAT cua than loi. Hai hinh cua hop dong
   * `AccessViolation` deu gop vao do: `permission` (mien gia `kho`) va `detail.actions` (van tai,
   * `transport-permission-rules.ts`) — khong lap, theo thu tu gap.
   */
  it('than loi leo thang mang `detail.actions` = hop cac quyen can xac nhan', async () => {
    const h = accountHarness([DIRECTOR, MANAGER]);
    const created = await errorBodyOf(
      h.service.createUser(actor, {
        username: 'dh.nhay',
        name: 'Nhạy',
        role: 'MANAGER',
        grants: [grant(KHO_GROUPS.nhay)],
      }),
    );
    expect(created.detail).toMatchObject({
      violations: [{ code: 'ESCALATION_CONFIRMATION_REQUIRED', permission: KHO_GROUPS.nhay }],
      actions: [KHO_GROUPS.nhay],
    });

    const changed = await errorBodyOf(
      h.service.setAccess(actor, MANAGER.id, {
        role: 'MANAGER',
        grants: [grant(KHO_GROUPS.nhay)],
        dryRun: true,
      }),
    );
    expect(changed).toMatchObject({
      reason: 'ESCALATION_CONFIRMATION_REQUIRED',
      detail: { actions: [KHO_GROUPS.nhay] },
    });
  });

  it('bo quyen sai (khong chi leo thang) → ACCESS_INVALID, KHONG kem `actions`', async () => {
    const h = accountHarness([DIRECTOR]);
    const body = await errorBodyOf(
      h.service.createUser(actor, {
        username: 'dh.sai.nhay',
        name: 'Sai nhạy',
        role: 'MANAGER',
        grants: [grant(KHO_GROUPS.nhay), grant('khong-mien.gi')],
      }),
    );
    expect(body.reason).toBe('ACCESS_INVALID');
    expect(body.detail).not.toHaveProperty('actions');
  });
});

describe('doi vai va quyen rieng', () => {
  it('thay TRON bo quyen, kiem toan truoc/sau, escalate chi cho quyen nhay cam MOI', async () => {
    const h = accountHarness([
      DIRECTOR,
      { ...MANAGER, permissionGrants: [grant(KHO_GROUPS.nhay)] },
    ]);
    const result = (await h.service.setAccess(actor, MANAGER.id, {
      role: 'MANAGER',
      grants: [grant(KHO_GROUPS.nhay), grant(KHO_GROUPS.sua)],
      confirmEscalation: true,
    })) as { account: AccountView; access: AccessBreakdown };

    expect(result.account.permissionGrants).toEqual([
      grant(KHO_GROUPS.nhay),
      grant(KHO_GROUPS.sua),
    ]);
    expect(result.access.sentences.length).toBeGreaterThan(0);
    expect(h.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.user.access.change',
        before: { role: 'MANAGER', grants: [grant(KHO_GROUPS.nhay)] },
        after: { role: 'MANAGER', grants: [grant(KHO_GROUPS.nhay), grant(KHO_GROUPS.sua)] },
      }),
    );
    // `kho.lich_su.read` da co tu truoc — khong phai leo thang moi.
    expect(h.audit.append.mock.calls.map(([call]) => call.action)).not.toContain(
      'auth.user.access.escalate',
    );
    expect(h.telemetry.step).toHaveBeenCalledWith('account.access.change', expect.any(Function));
  });

  it('dryRun: bang "lam duoc gi" cua bo DE XUAT, khong ghi, khong kiem toan, khong quyet dinh', async () => {
    const h = accountHarness([DIRECTOR, MANAGER]);
    const preview = (await h.service.setAccess(actor, MANAGER.id, {
      role: 'MANAGER',
      grants: [grant(KHO_GROUPS.xem)],
      dryRun: true,
    })) as AccessBreakdown;

    expect(preview.grants).toEqual([grant(KHO_GROUPS.xem)]);
    expect(preview.sentences).toContain('Chỉ xem: Phiếu kho');
    expect((await h.repository.findById(MANAGER.id))?.permissionGrants).toEqual([]);
    expect(h.audit.append).not.toHaveBeenCalled();
    expect(h.telemetry.decision).not.toHaveBeenCalled();
  });

  it('duong cu PATCH role: doi vai VA xoa moi quyen rieng; len Giam doc phai xac nhan', async () => {
    const h = accountHarness([DIRECTOR, { ...MANAGER, permissionGrants: [grant(KHO_GROUPS.xem)] }]);
    const updated = await h.service.assignRole(actor, MANAGER.id, { role: 'ACCOUNTING' });
    expect(updated).toMatchObject({ role: 'ACCOUNTING', permissionGrants: [] });
    expect(h.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.user.access.change',
        before: { role: 'MANAGER', grants: [grant(KHO_GROUPS.xem)] },
        after: { role: 'ACCOUNTING', grants: [] },
      }),
    );
    expect(await reasonOf(h.service.assignRole(actor, MANAGER.id, { role: 'ADMIN' }))).toBe(
      'ESCALATION_CONFIRMATION_REQUIRED',
    );
    await expect(
      h.service.assignRole(actor, MANAGER.id, { role: 'ADMIN', confirmEscalation: true }),
    ).resolves.toMatchObject({ role: 'ADMIN' });
  });

  it('tai khoan dang noi ho so cua mien: doi vai khoi SALE → ACCOUNT_LINKED_TO_DRIVER', async () => {
    const h = accountHarness([DIRECTOR, DRIVER], { linkedUserIds: new Set([DRIVER.id]) });
    const body = await errorBodyOf(
      h.service.setAccess(actor, DRIVER.id, { role: 'ACCOUNTING', grants: [] }),
    );
    expect(body).toMatchObject({ statusCode: 409, reason: 'ACCOUNT_LINKED_TO_DRIVER' });
    expect((await h.repository.findById(DRIVER.id))?.role).toBe('SALE');
    // Vai giu nguyen SALE: mien khong phan doi.
    await expect(
      h.service.setAccess(actor, DRIVER.id, { role: 'SALE', grants: [] }),
    ).resolves.toBeDefined();
  });

  it('vai KHONG doi van hoi mien: tai khoan van phong con noi ho so (du lieu cu) bi chan', async () => {
    const h = accountHarness([DIRECTOR, MANAGER], { linkedUserIds: new Set([MANAGER.id]) });
    expect(
      await reasonOf(
        h.service.setAccess(actor, MANAGER.id, {
          role: 'MANAGER',
          grants: [grant(KHO_GROUPS.xem)],
        }),
      ),
    ).toBe('ACCOUNT_LINKED_TO_DRIVER');
    expect(h.telemetry.decision).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'denied', reason: 'ACCOUNT_LINKED_TO_DRIVER' }),
    );
  });

  it('tu doi quyen cua chinh minh → SELF_LOCKOUT; tai khoan khong ton tai → ACCOUNT_NOT_FOUND', async () => {
    const h = accountHarness([DIRECTOR]);
    expect(
      await reasonOf(h.service.setAccess(actor, DIRECTOR.id, { role: 'MANAGER', grants: [] })),
    ).toBe('SELF_LOCKOUT');
    const missing = await errorBodyOf(
      h.service.setAccess(actor, 'khong-co', { role: 'MANAGER', grants: [] }),
    );
    expect(missing).toMatchObject({ statusCode: 404, reason: 'ACCOUNT_NOT_FOUND' });
  });
});

describe('Giam doc dang hoat dong cuoi cung', () => {
  it('ha vai hoac khoa Giam doc cuoi cung → LAST_ACTIVE_ADMIN (ca xem truoc)', async () => {
    const h = accountHarness([DIRECTOR_2]);
    const someone = { id: 'nguoi-khac', username: 'nguoi.khac' };
    expect(
      await reasonOf(h.service.setAccess(someone, DIRECTOR_2.id, { role: 'MANAGER', grants: [] })),
    ).toBe('LAST_ACTIVE_ADMIN');
    expect(
      await reasonOf(
        h.service.setAccess(someone, DIRECTOR_2.id, { role: 'MANAGER', grants: [], dryRun: true }),
      ),
    ).toBe('LAST_ACTIVE_ADMIN');
    expect(await reasonOf(h.service.disableUser(someone, DIRECTOR_2.id, { confirmed: true }))).toBe(
      'LAST_ACTIVE_ADMIN',
    );
    expect((await h.repository.findById(DIRECTOR_2.id))?.role).toBe('ADMIN');
  });

  it('hai Giam doc ha vai NHAU cung luc → dung mot lan thanh cong, van con mot Giam doc', async () => {
    const h = accountHarness([DIRECTOR, DIRECTOR_2]);
    const results = await Promise.allSettled([
      h.service.setAccess(actor, DIRECTOR_2.id, { role: 'MANAGER', grants: [] }),
      h.service.setAccess({ id: DIRECTOR_2.id, username: DIRECTOR_2.username }, DIRECTOR.id, {
        role: 'MANAGER',
        grants: [],
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(await reasonOf(Promise.reject(rejected?.reason))).toBe('LAST_ACTIVE_ADMIN');
    expect(await h.repository.countActiveAdmins()).toBe(1);
  });
});

describe('tai khoan he thong (PROTECTED_ACCOUNT_USERNAMES)', () => {
  it('khoa / doi quyen / doi vai / dat lai → PROTECTED_SERVICE_ACCOUNT; sua ten van duoc', async () => {
    vi.stubEnv('PROTECTED_ACCOUNT_USERNAMES', 'ops.bot');
    const h = accountHarness([DIRECTOR, OPS]);
    const attempts = [
      () => h.service.disableUser(actor, OPS.id, { confirmed: true }),
      () => h.service.setAccess(actor, OPS.id, { role: 'MANAGER', grants: [] }),
      () => h.service.assignRole(actor, OPS.id, { role: 'MANAGER' }),
      () => h.service.resetPassword(actor, OPS.id, {}),
    ];
    for (const attempt of attempts) {
      expect(await reasonOf(attempt())).toBe('PROTECTED_SERVICE_ACCOUNT');
    }
    const [listed] = await h.service.listUsers({ q: 'ops' });
    expect(listed).toMatchObject({ username: 'ops.bot', isProtected: true });
    await expect(
      h.service.updateProfile(actor, OPS.id, { name: 'Tài khoản vận hành' }),
    ).resolves.toMatchObject({ name: 'Tài khoản vận hành' });
  });
});

describe('khoa / mo khoa', () => {
  it('khoa: ghi ly do, phien chet; mo khoa: KHONG doi mat khau; lap lai la khong-lam-gi', async () => {
    const h = accountHarness([DIRECTOR, ACCOUNTANT]);
    const disabled = await h.service.disableUser(actor, ACCOUNTANT.id, {
      confirmed: true,
      reason: 'Nghỉ việc',
    });
    expect(disabled.disabledAt).not.toBeNull();
    expect(disabled.credentialVersion).toBe(2);
    expect(h.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.user.disable',
        before: { disabledAt: null },
        after: { disabledAt: disabled.disabledAt, reason: 'Nghỉ việc' },
      }),
    );

    await h.service.disableUser(actor, ACCOUNTANT.id, { confirmed: true });
    expect(h.audit.append).toHaveBeenCalledTimes(1);

    const enabled = await h.service.enableUser(actor, ACCOUNTANT.id, { confirmed: true });
    expect(enabled).toMatchObject({ disabledAt: null, credentialVersion: 2 });
    expect((await h.repository.findById(ACCOUNTANT.id))?.passwordHash).toBe(
      ACCOUNTANT.passwordHash,
    );
    expect(h.audit.append).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'auth.user.enable', after: { disabledAt: null } }),
    );
    expect(h.telemetry.step).toHaveBeenCalledWith('account.status.change', expect.any(Function));
    // Buoc chuyen trang thai vao trace — DUNG hai lan (lan khoa lap lai khong doi gi).
    expect(h.telemetry.stateChange.mock.calls).toEqual([
      [{ entity: 'User', entityId: ACCOUNTANT.id, from: 'ACTIVE', to: 'DISABLED' }],
      [{ entity: 'User', entityId: ACCOUNTANT.id, from: 'DISABLED', to: 'ACTIVE' }],
    ]);
  });

  it('tai khoan khong ton tai: quyet dinh tu choi ghi DUNG ma tai khoan da tim', async () => {
    const h = accountHarness([DIRECTOR]);
    const attempts = [
      () => h.service.disableUser(actor, 'khong-co', { confirmed: true }),
      () => h.service.enableUser(actor, 'khong-co', { confirmed: true }),
      () => h.service.resetPassword(actor, 'khong-co', {}),
      () => h.service.updateProfile(actor, 'khong-co', { name: 'Ai đó' }),
    ];
    for (const attempt of attempts) {
      expect(await reasonOf(attempt())).toBe('ACCOUNT_NOT_FOUND');
    }
    const denials = h.telemetry.decision.mock.calls.map(([call]) => call);
    expect(denials).toHaveLength(attempts.length);
    for (const denial of denials) {
      expect(denial).toMatchObject({
        reason: 'ACCOUNT_NOT_FOUND',
        detail: { userId: 'khong-co' },
      });
    }
  });

  it('dat lai mat khau tai khoan dang khoa KHONG mo khoa (khoi phuc = mo khoa + dat lai)', async () => {
    const h = accountHarness([DIRECTOR, { ...ACCOUNTANT, disabledAt: new Date('2026-09-02') }]);
    const reset = await h.service.resetPassword(actor, ACCOUNTANT.id, {});
    expect(reset.disabledAt).not.toBeNull();
    expect(h.telemetry.step).toHaveBeenCalledWith(
      'account.credentials.reset',
      expect.any(Function),
    );
  });

  it('than yeu cau sai → 400 ACCOUNT_INPUT_INVALID', async () => {
    const h = accountHarness([DIRECTOR, ACCOUNTANT]);
    const body = await errorBodyOf(
      h.service.disableUser(actor, ACCOUNTANT.id, { confirmed: false } as never),
    );
    expect(body).toMatchObject({ statusCode: 400, reason: 'ACCOUNT_INPUT_INVALID' });
  });
});

describe('danh sach, goi y ten, lich su', () => {
  it('loc theo tu khoa / trang thai / vai', async () => {
    const h = accountHarness([
      DIRECTOR,
      ACCOUNTANT,
      { ...MANAGER, mustChangePassword: true, temporaryPasswordExpiresAt: new Date('2099-01-01') },
      { ...DRIVER, disabledAt: new Date('2026-09-02') },
    ]);
    expect((await h.service.listUsers({ status: 'pending' })).map((u) => u.id)).toEqual([
      MANAGER.id,
    ]);
    expect((await h.service.listUsers({ status: 'disabled' })).map((u) => u.id)).toEqual([
      DRIVER.id,
    ]);
    expect((await h.service.listUsers({ status: 'active' })).map((u) => u.id).sort()).toEqual(
      [ACCOUNTANT.id, DIRECTOR.id].sort(),
    );
    expect((await h.service.listUsers({ role: 'ACCOUNTING' })).map((u) => u.id)).toEqual([
      ACCOUNTANT.id,
    ]);
    expect((await h.service.listUsers({ q: 'KE.TO' })).map((u) => u.id)).toEqual([ACCOUNTANT.id]);
  });

  it('goi y ten: bo dau, tien to, tranh trung va tranh ten he thong', async () => {
    const h = accountHarness([DIRECTOR, userRecord('x', 'lx.nguyen.van.duc', 'SALE')]);
    expect(await h.service.suggestUsername({ name: 'Nguyễn Văn Đức', prefix: 'lx.' })).toEqual({
      username: 'lx.nguyen.van.duc.2',
    });
    expect(await h.service.suggestUsername({ name: 'Trần Thị Ánh' })).toEqual({
      username: 'tran.thi.anh',
    });
    expect(await h.service.suggestUsername({ name: 'System' })).toEqual({ username: 'system.2' });
  });

  it('lich su: dong kiem toan cua tai khoan, co tom tat tieng Viet', async () => {
    const h = accountHarness([DIRECTOR, ACCOUNTANT], {
      auditRows: [
        {
          id: 'a1',
          actor: 'giam.doc',
          action: 'auth.user.disable',
          entityType: 'User',
          entityId: ACCOUNTANT.id,
          before: { disabledAt: null },
          after: { disabledAt: '2026-09-02T00:00:00.000Z', reason: null },
          requestId: null,
          createdAt: '2026-09-02T00:00:00.000Z',
        },
      ],
    });
    const history = await h.service.history(ACCOUNTANT.id, { limit: 20 });
    expect(history).toEqual([
      expect.objectContaining({ action: 'auth.user.disable', summary: 'Khoá tài khoản' }),
    ]);
    expect(h.audit.list).toHaveBeenCalledWith({
      entityType: 'User',
      entityId: ACCOUNTANT.id,
      limit: 20,
    });
    expect(await reasonOf(h.service.history('khong-co'))).toBe('ACCOUNT_NOT_FOUND');
  });

  it('danh muc quyen: moi mien + quyen nen tang', () => {
    const h = accountHarness([DIRECTOR]);
    const catalog = h.service.permissionCatalog();
    expect(catalog.domains.map((domain) => domain.id)).toEqual(['kho']);
    expect(catalog.platform).toEqual([
      { code: 'platform.accounts.manage', label: 'Quản trị tài khoản & phân quyền' },
    ]);
  });
});

describe('sua thong tin', () => {
  it('email / so dien thoai trung → ACCOUNT_IDENTITY_TAKEN; kiem toan chi ghi CO/KHONG', async () => {
    const h = accountHarness([DIRECTOR, { ...ACCOUNTANT, phone: '0900000001' }, MANAGER]);
    expect(
      await reasonOf(h.service.updateProfile(actor, MANAGER.id, { phone: '0900000001' })),
    ).toBe('ACCOUNT_IDENTITY_TAKEN');

    await h.service.updateProfile(actor, MANAGER.id, { phone: '0900000002', jobTitle: '' });
    expect(h.audit.append).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'auth.user.profile.update',
        before: {
          profile: { name: MANAGER.name, jobTitle: null, emailOnFile: false, phoneOnFile: false },
        },
        after: {
          profile: { name: MANAGER.name, jobTitle: null, emailOnFile: false, phoneOnFile: true },
          emailChanged: false,
          contactNumberChanged: true,
        },
      }),
    );
    expect(JSON.stringify(h.audit.append.mock.calls)).not.toContain('0900000002');
  });

  it('doi so nay sang so khac / email khac: kiem toan noi CO DOI; gui lai dung gia tri cu: khong ghi', async () => {
    const h = accountHarness([
      DIRECTOR,
      { ...MANAGER, phone: '0900000003', email: 'dh@example.test' },
    ]);
    await h.service.updateProfile(actor, MANAGER.id, {
      phone: '0900000004',
      email: 'dh.moi@example.test',
    });
    const [[row]] = h.audit.append.mock.calls as [[{ before: unknown; after: unknown }]];
    // Chi co/khong thi truoc == sau — co doi moi cho nguoi doc biet lien lac da bi thay.
    expect(row.before).toEqual({
      profile: { name: MANAGER.name, jobTitle: null, emailOnFile: true, phoneOnFile: true },
    });
    expect(row.after).toEqual({
      profile: { name: MANAGER.name, jobTitle: null, emailOnFile: true, phoneOnFile: true },
      emailChanged: true,
      contactNumberChanged: true,
    });
    expect(JSON.stringify(row)).not.toMatch(/0900000004|dh\.moi@example\.test/);
    expect(h.telemetry.decision).toHaveBeenCalledTimes(1);

    // PATCH khong doi gi: khong dong kiem toan rong "Sửa thông tin tài khoản", khong quyet dinh.
    await h.service.updateProfile(actor, MANAGER.id, {
      name: MANAGER.name,
      phone: '0900000004',
      email: 'DH.MOI@example.test',
    });
    expect(h.audit.append).toHaveBeenCalledTimes(1);
    expect(h.telemetry.decision).toHaveBeenCalledTimes(1);
  });
});
