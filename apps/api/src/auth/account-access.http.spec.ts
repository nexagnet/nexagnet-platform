import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { getStorageToken, type ThrottlerStorageService } from '@nestjs/throttler';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * QUYEN TUNG TAI KHOAN, DO QUA HTTP THAT VA PHIEN THAT (`#395`).
 *
 * Khong mot khang dinh nao o day dung doi tuong nguoi dung dung tay: Nest THAT (`AppModule` cua goi
 * khach fixture `transport-core`), `AUTH_MODE=session`, `configureSession` nhu `main.ts`, cookie
 * that, `x-csrf-token` that, `Origin`. Chi noi chuyen bang `fetch`. Nhung dieu chi bai nay chung
 * minh duoc:
 *   · `RolesGuard` NHUONG cho cong van tai tren route mang `@RequiresTransportAction` — mot `MANAGER`
 *     duoc cap quyen doi xe ghi duoc xe du route ghi `@Roles('ACCOUNTING','ADMIN')`;
 *   · doi quyen co hieu luc o YEU CAU KE TIEP cua CUNG cookie, khong can dang nhap lai;
 *   · dat lai mat khau lam cookie cu chet (401);
 *   · cong MAT KHAU TAM chan moi route ngoai `me` / doi mat khau / dang xuat;
 *   · khong quyen rieng nao mo duoc `/settings/users*` hay viec chi-Giam-doc;
 *   · noi ho so lai xe (`PUT /transport/drivers/:id/account`, mien `transport` THAT): bang "lam
 *     duoc gi" doi theo, tai khoan dang noi khong doi vai duoc, mot tai khoan chi noi mot ho so.
 *
 * `PERSISTENCE=memory` O MOI JOB: tep IT DUY NHAT ghi `User` tren Postgres la
 * `account-admin.int.spec.ts` (phep dem "Giam doc dang hoat dong" la toan cuc).
 *
 * `timeout` cua `describe` ap cho MOI buoc: mot buoc onboarding la bon lan Argon2 + chuc lan goi
 * HTTP, va mac dinh 5 s cua vitest se lam bai nay do chap chon tren may CI dang tai.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, '../../../../packages/tenant/src/__tests__/fixtures/transport-core');

/** Moi bi mat SINH MOI moi lan chay — khong chuoi mat khau / khoa nao nam trong ma nguon. */
const SESSION_KEY = randomBytes(32).toString('hex');
const DIRECTOR_PW = `gd-${randomBytes(9).toString('hex')}`;
const NEXT_PW = (): string => `doi-${randomBytes(9).toString('hex')}`;

interface Reply<T = Record<string, unknown>> {
  readonly status: number;
  readonly body: T;
}

type Json = Record<string, unknown>;

/** Mot trinh duyet: cookie rieng, token CSRF rieng. */
class Browser {
  private cookie = '';
  private csrf = '';

  constructor(private readonly base: string) {}

  async send<T = Json>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    path: string,
    payload?: unknown,
  ): Promise<Reply<T>> {
    const response = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        origin: this.base,
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(method === 'GET' ? {} : { 'x-csrf-token': this.csrf }),
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const setCookie = response.headers.getSetCookie();
    for (const line of setCookie) {
      const pair = line.split(';')[0] ?? '';
      if (pair.startsWith('netviet.sid=')) this.cookie = pair;
    }
    const text = await response.text();
    const body = (text === '' ? null : JSON.parse(text)) as T;
    const token = (body as { csrfToken?: unknown } | null)?.csrfToken;
    if (typeof token === 'string') this.csrf = token;
    return { status: response.status, body };
  }

  async login(username: string, password: string): Promise<Reply> {
    await this.send('GET', '/auth/csrf');
    return this.send('POST', '/auth/login', { username, password });
  }
}

interface Account {
  readonly id: string;
  readonly username: string;
  readonly mustChangePassword: boolean;
  readonly credential: { readonly temporaryPassword: string; readonly expiresAt: string };
}

interface CatalogBody {
  readonly domains: readonly {
    readonly id: string;
    readonly groups: readonly {
      readonly id: string;
      readonly grantable: boolean;
      readonly actions: readonly {
        readonly code: string;
        readonly directorOnly: boolean;
        readonly escalation: boolean;
        readonly sod: string | null;
      }[];
    }[];
  }[];
}

async function bootApi(): Promise<{ readonly app: INestApplication; readonly base: string }> {
  Object.assign(process.env, {
    TENANT_DIR: FIXTURE,
    PERSISTENCE: 'memory',
    NODE_ENV: 'test',
    AUTH_MODE: 'session',
    SESSION_SECRET: SESSION_KEY,
    WORKFLOW_ENGINE: 'off',
    PROTECTED_ACCOUNT_USERNAMES: '',
  });
  delete process.env.TENANT;
  delete process.env.API_KEY;

  const { resetTenantCache } = await import('@netviet/tenant');
  resetTenantCache();
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule, loadAppEnv } = await import('../app.module.js');
  const { PrismaService } = await import('../config/prisma.service.js');
  const { configureSession } = await import('./session-bootstrap.js');
  const app = await NestFactory.create<NestExpressApplication>(await AppModule.forRoot(), {
    logger: ['error'],
    abortOnError: false,
  });
  configureSession(app, loadAppEnv(), app.get(PrismaService));
  await app.listen(0, '127.0.0.1');
  return { app, base: (await app.getUrl()).replace('[::1]', '127.0.0.1') };
}

describe('#395 — quyen tung tai khoan qua HTTP + phien THAT', { timeout: 60_000 }, () => {
  let api: { readonly app: INestApplication; readonly base: string } | undefined;
  let director: Browser;
  let directorId = '';
  let catalog: CatalogBody;
  const saved = { ...process.env };

  const browser = (): Browser => {
    if (!api) throw new Error('API chua khoi dong');
    return new Browser(api.base);
  };

  /** Dang nhap bi gioi han 5 lan/60s/IP — bai chay tu MOT IP nen xoa bo dem truoc moi lan. */
  const clearLoginThrottle = (): void => {
    const storage = api?.app.get(getStorageToken(), { strict: false }) as ThrottlerStorageService;
    storage.storage.clear();
  };

  /** Tao tai khoan qua HTTP, dang nhap bang mat khau tam va doi ngay — tra trinh duyet da san. */
  async function onboard(payload: Json): Promise<{ account: Account; client: Browser }> {
    const created = await director.send<Account>('POST', '/settings/users', payload);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const client = browser();
    clearLoginThrottle();
    expect(
      (await client.login(created.body.username, created.body.credential.temporaryPassword)).status,
    ).toBe(201);
    const changed = await client.send('POST', '/auth/credentials/change', {
      currentPassword: created.body.credential.temporaryPassword,
      newPassword: NEXT_PW(),
    });
    expect(changed.status).toBe(201);
    return { account: created.body, client };
  }

  const groupActions = (groupId: string): string[] =>
    catalog.domains
      .find((domain) => domain.id === 'transport')!
      .groups.find((group) => group.id === groupId)!
      .actions.map((action) => action.code);

  beforeAll(async () => {
    api = await bootApi();
    const { UserRepository } = await import('./user.repository.js');
    const { PasswordService } = await import('./password.service.js');
    const users = api.app.get(UserRepository, { strict: false });
    const passwords = api.app.get(PasswordService, { strict: false });
    // Giam doc dau tien: cung duong ma `bootstrap-auth-user.mjs` di (ghi thang kho, khong mat khau tam).
    const seeded = await users.create({
      username: 'giam.doc.http',
      name: 'Giám đốc HTTP',
      email: null,
      phone: null,
      passwordHash: await passwords.hash(DIRECTOR_PW),
      role: 'ADMIN',
    });
    directorId = seeded.id;
    director = browser();
  }, 180_000);

  afterAll(async () => {
    await api?.app.close();
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  });

  it('1. Giam doc dang nhap; danh muc quyen co mien van tai; goi y ten dang nhap', async () => {
    clearLoginThrottle();
    const login = await director.login('giam.doc.http', DIRECTOR_PW);
    expect(login.status).toBe(201);
    expect(login.body.user).toMatchObject({ role: 'ADMIN', mustChangePassword: false });

    const me = await director.send<{ permissions: string[] }>('GET', '/auth/me');
    expect(me.body.permissions).toContain('platform.accounts.manage');
    expect(me.body.permissions).toContain('transport.vehicle.manage');

    const listed = await director.send<CatalogBody>('GET', '/settings/users/permission-catalog');
    expect(listed.status).toBe(200);
    catalog = listed.body;
    expect(catalog.domains.map((domain) => domain.id)).toContain('transport');

    const suggestion = await director.send('POST', '/settings/users/suggest-username', {
      name: 'Nguyễn Điều Hành',
    });
    expect(suggestion).toEqual({ status: 200, body: { username: 'nguyen.dieu.hanh' } });
  });

  let manager: { account: Account; client: Browser };

  it('2. tao Dieu hanh voi nhom doi xe → mat khau tam → 403 PASSWORD_CHANGE_REQUIRED → doi → dung duoc', async () => {
    const created = await director.send<Account>('POST', '/settings/users', {
      username: 'dieu.hanh.http',
      name: 'Điều hành HTTP',
      role: 'MANAGER',
      grants: groupActions('doi-xe').map((permission) => ({ permission, effect: 'ALLOW' })),
    });
    expect(created.status).toBe(201);
    expect(created.body.credential.temporaryPassword).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);

    const client = browser();
    clearLoginThrottle();
    const login = await client.login(
      created.body.username,
      created.body.credential.temporaryPassword,
    );
    expect(login.status).toBe(201);
    expect(login.body.user).toMatchObject({ mustChangePassword: true });

    const blocked = await client.send('GET', '/transport/vehicles');
    expect(blocked.status).toBe(403);
    expect(blocked.body).toMatchObject({ reason: 'PASSWORD_CHANGE_REQUIRED' });
    const me = await client.send<{ user: Json; permissions: string[] }>('GET', '/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ mustChangePassword: true });
    expect(me.body.permissions).toEqual(expect.arrayContaining(['transport.vehicle.read']));

    const changed = await client.send('POST', '/auth/credentials/change', {
      currentPassword: created.body.credential.temporaryPassword,
      newPassword: NEXT_PW(),
    });
    expect(changed.status).toBe(201);

    expect((await client.send('GET', '/transport/vehicles')).status).toBe(200);
    // `@Roles('ACCOUNTING','ADMIN')` tren route ghi — RolesGuard nhuong cho cong van tai.
    const vehicle = await client.send('POST', '/transport/vehicles', {
      registrationPlate: '29C-395.01',
      vehicleClass: 'TRUCK',
    });
    expect(vehicle.status, JSON.stringify(vehicle.body)).toBe(201);
    manager = { account: created.body, client };
  });

  it('3. Giam doc go nhom doi xe → CUNG cookie bi 403 o yeu cau ke tiep (khong dang nhap lai)', async () => {
    const changed = await director.send<{ account: Json; access: { sentences: string[] } }>(
      'PUT',
      `/settings/users/${manager.account.id}/access`,
      {
        role: 'MANAGER',
        grants: groupActions('dieu-hanh')
          .filter((code) => code.endsWith('.read'))
          .map((permission) => ({ permission, effect: 'ALLOW' })),
      },
    );
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body.access.sentences.length).toBeGreaterThan(0);

    const denied = await manager.client.send('GET', '/transport/vehicles');
    expect(denied.status).toBe(403);
    expect((await manager.client.send('GET', '/transport/trips')).status).toBe(200);
  });

  it('4. Giam doc dat lai mat khau → cookie cu 401', async () => {
    const reset = await director.send<Account>(
      'POST',
      `/settings/users/${manager.account.id}/credentials/reset`,
      {},
    );
    expect(reset.status).toBe(201);
    expect(reset.body).toMatchObject({ mustChangePassword: true, credential: expect.any(Object) });
    expect((await manager.client.send('GET', '/auth/me')).status).toBe(401);
  });

  /** Dieu hanh mang MOI quyen cap duoc — buoc 13 dung lai de chung minh noi ho so van chi-Giam-doc. */
  let allGrantsManager: Browser;

  it('5. Dieu hanh mang MOI quyen cap duoc van 403 o /settings/users* va viec chi-Giam-doc', async () => {
    const grantable = catalog.domains
      .find((domain) => domain.id === 'transport')!
      .groups.filter((group) => group.grantable)
      .flatMap((group) => group.actions)
      // Bo phia sua can cu cua cap tach nhiem — giu ca hai phia la vi pham `SOD_CONFLICT`.
      .filter((action) => !action.directorOnly && action.sod !== 'EVIDENCE');
    const everything = grantable.map((action) => ({ permission: action.code, effect: 'ALLOW' }));

    // Chua xac nhan leo thang: than loi ke TEN tung quyen nhay cam o `detail.actions` (man hinh doc
    // dung truong nay), khong chi `detail.violations`.
    const unconfirmed = await director.send<{ reason: string; detail: { actions: string[] } }>(
      'POST',
      '/settings/users',
      {
        username: 'dieu.hanh.chua.xac.nhan',
        name: 'Chưa xác nhận',
        role: 'MANAGER',
        grants: everything,
      },
    );
    expect(unconfirmed.status).toBe(409);
    expect(unconfirmed.body.reason).toBe('ESCALATION_CONFIRMATION_REQUIRED');
    const escalations = grantable
      .filter((action) => action.escalation)
      .map((action) => action.code);
    expect(escalations.length).toBeGreaterThan(0);
    expect([...unconfirmed.body.detail.actions].sort()).toEqual([...escalations].sort());

    const { client } = await onboard({
      username: 'dieu.hanh.toan.quyen',
      name: 'Điều hành toàn quyền',
      role: 'MANAGER',
      grants: everything,
      confirmEscalation: true,
    });

    expect((await client.send('GET', '/transport/vehicles')).status).toBe(200);
    for (const [method, path] of [
      ['GET', '/settings/users'],
      ['GET', '/settings/users/permission-catalog'],
      ['GET', `/settings/users/${directorId}/access`],
    ] as const) {
      expect((await client.send(method, path)).status, path).toBe(403);
    }
    expect(
      (
        await client.send('POST', '/settings/users', {
          username: 'x.y.z',
          name: 'X',
          role: 'ADMIN',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await client.send('PUT', `/settings/users/${directorId}/access`, {
          role: 'MANAGER',
          grants: [],
        })
      ).status,
    ).toBe(403);
    // Noi tai khoan dang nhap vao ho so = cap quyen cho mot con nguoi → chi Giam doc.
    const link = await client.send(
      'PUT',
      '/transport/asset-ownership/stakeholders/khong-co/account',
      {
        authUserId: null,
      },
    );
    expect(link.status).toBe(403);
    allGrantsManager = client;
  });

  it('6. Ke toan bi bo bot (DENY) mot quyen → mat dung route do', async () => {
    const { account, client } = await onboard({
      username: 'ke.toan.http',
      name: 'Kế toán HTTP',
      role: 'ACCOUNTING',
    });
    expect((await client.send('GET', '/transport/vehicles')).status).toBe(200);
    const denied = await director.send('PUT', `/settings/users/${account.id}/access`, {
      role: 'ACCOUNTING',
      grants: [{ permission: 'transport.vehicle.read', effect: 'DENY' }],
    });
    expect(denied.status).toBe(200);
    expect((await client.send('GET', '/transport/vehicles')).status).toBe(403);
    expect((await client.send('GET', '/transport/drivers')).status).toBe(200);
  });

  it('7. quyen rieng tren Lai xe / Giam doc bi tu choi voi ma co kieu', async () => {
    for (const [role, code] of [
      ['SALE', 'DRIVER_PRESET_IS_SELF_SCOPE_ONLY'],
      ['ADMIN', 'ADMIN_PRESET_IS_FULL'],
    ] as const) {
      const rejected = await director.send<{
        reason: string;
        detail: { violations: { code: string }[] };
      }>('PUT', `/settings/users/${manager.account.id}/access`, {
        role,
        grants: [{ permission: 'transport.vehicle.read', effect: 'ALLOW' }],
        confirmEscalation: true,
        dryRun: true,
      });
      expect(rejected.status).toBe(409);
      expect(rejected.body.reason).toBe('ACCESS_INVALID');
      expect(rejected.body.detail.violations.map((violation) => violation.code)).toContain(code);
    }
  });

  it('8. tu khoa / tu ha vai / tu dat lai qua duong quan tri → 403 SELF_LOCKOUT', async () => {
    for (const [method, path, payload] of [
      ['POST', `/settings/users/${directorId}/disable`, { confirmed: true }],
      ['PATCH', `/settings/users/${directorId}/role`, { role: 'MANAGER' }],
      ['POST', `/settings/users/${directorId}/credentials/reset`, {}],
    ] as const) {
      const reply = await director.send(method, path, payload);
      expect(reply.status, path).toBe(403);
      expect(reply.body).toMatchObject({ reason: 'SELF_LOCKOUT' });
    }
  });

  it('9. hai Giam doc ha vai NHAU cung luc → luon con dung mot Giam doc', async () => {
    const needsConfirm = await director.send('POST', '/settings/users', {
      username: 'giam.doc.hai',
      name: 'Giám đốc hai',
      role: 'ADMIN',
    });
    expect(needsConfirm.body).toMatchObject({ reason: 'ESCALATION_CONFIRMATION_REQUIRED' });
    const second = await onboard({
      username: 'giam.doc.hai',
      name: 'Giám đốc hai',
      role: 'ADMIN',
      confirmEscalation: true,
    });

    const [first, other] = await Promise.all([
      director.send('PATCH', `/settings/users/${second.account.id}/role`, { role: 'MANAGER' }),
      second.client.send('PATCH', `/settings/users/${directorId}/role`, { role: 'MANAGER' }),
    ]);
    const statuses = [first.status, other.status].sort();
    // Ben thua: 409 LAST_ACTIVE_ADMIN (ca hai qua cong vai roi xep hang o kho) HOAC 403 (lan ghi
    // kia xong truoc khi cong vai cua no doc lai tai khoan). Khong bao gio ca hai cung 200.
    expect(statuses[0]).toBe(200);
    expect([403, 409]).toContain(statuses[1]);
    const loser = first.status === 200 ? other : first;
    if (loser.status === 409) expect(loser.body).toMatchObject({ reason: 'LAST_ACTIVE_ADMIN' });

    const survivor = first.status === 200 ? director : second.client;
    const admins = await survivor.send<Json[]>('GET', '/settings/users?role=ADMIN&status=active');
    expect(admins.status).toBe(200);
    expect(admins.body).toHaveLength(1);

    // Tra lai Giam doc cho cac buoc sau neu ben thang la Giam doc thu hai.
    if (survivor !== director) {
      const restored = await survivor.send('PUT', `/settings/users/${directorId}/access`, {
        role: 'ADMIN',
        grants: [],
        confirmEscalation: true,
      });
      expect(restored.status).toBe(200);
    }
  });

  it('10. ten he thong khi TAO → 409 USERNAME_RESERVED; hang `operator` co san van dang nhap duoc', async () => {
    // `Operator` la ten cua NEN TANG; `demo-seed` la ten mien `transport` THAT dang ky
    // (`reservedUsernames()`, nguoi ghi du lieu mau) — ca hai di qua CUNG mot cong.
    for (const username of ['Operator', 'demo-seed', 'Demo-Seed']) {
      const reserved = await director.send('POST', '/settings/users', {
        username,
        name: 'Trùng tên hệ thống',
        role: 'SALE',
      });
      expect(reserved.status, username).toBe(409);
      expect(reserved.body, username).toMatchObject({ reason: 'USERNAME_RESERVED' });
    }

    const { UserRepository } = await import('./user.repository.js');
    const { PasswordService } = await import('./password.service.js');
    const users = api!.app.get(UserRepository, { strict: false });
    const passwords = api!.app.get(PasswordService, { strict: false });
    const operatorPw = `op-${randomBytes(9).toString('hex')}`;
    await users.create({
      username: 'operator',
      name: 'Người vận hành',
      email: null,
      phone: null,
      passwordHash: await passwords.hash(operatorPw),
      role: 'ADMIN',
    });
    clearLoginThrottle();
    expect((await browser().login('operator', operatorPw)).status).toBe(201);
  });

  it('11. khoa → cookie 401; mo khoa khong doi mat khau; lich su co truoc/sau', async () => {
    const target = await onboard({ username: 'khoa.mo.http', name: 'Khoá mở', role: 'ACCOUNTING' });
    const disabled = await director.send('POST', `/settings/users/${target.account.id}/disable`, {
      confirmed: true,
      reason: 'Thử khoá',
    });
    // Khoa / mo khoa la doi TRANG THAI, khong tao tai nguyen: ca hai `200`.
    expect(disabled.status).toBe(200);
    expect(disabled.body).toMatchObject({ disabledAt: expect.any(String) });
    expect((await target.client.send('GET', '/auth/me')).status).toBe(401);
    const enabled = await director.send('POST', `/settings/users/${target.account.id}/enable`, {
      confirmed: true,
    });
    expect(enabled.status).toBe(200);
    expect(enabled.body).toMatchObject({ disabledAt: null });

    const history = await director.send<{ action: string; before: unknown; after: unknown }[]>(
      'GET',
      `/settings/users/${manager.account.id}/history?limit=50`,
    );
    expect(history.status).toBe(200);
    const actions = history.body.map((row) => row.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'auth.user.create',
        'auth.login',
        'auth.user.access.change',
        'auth.credentials.reset',
      ]),
    );
    const change = history.body.find((row) => row.action === 'auth.user.access.change');
    expect(change?.before).toMatchObject({ role: 'MANAGER', grants: expect.any(Array) });
    expect(change?.after).toMatchObject({ role: 'MANAGER', grants: expect.any(Array) });
    const reset = history.body.find((row) => row.action === 'auth.credentials.reset');
    expect(reset?.after).toMatchObject({ onboarding: { passwordChangeRequired: true } });

    const access = await director.send<{ sentences: string[]; groups: unknown[] }>(
      'GET',
      `/settings/users/${manager.account.id}/access`,
    );
    expect(access.status).toBe(200);
    expect(access.body.sentences).toContain('Không duyệt được tiền');
  });

  /** Tai khoan Lai xe cua buoc 12 — buoc 13 noi no vao ho so lai xe THAT cua mien van tai. */
  let driverAccountId = '';

  interface DriverBody {
    readonly id: string;
    readonly authUserId: string | null;
  }

  interface AccessBody {
    readonly sentences: string[];
    readonly scopes: { id: string; active: boolean }[];
    readonly groups: { id: string; summary: string }[];
  }

  const registerDriver = async (fullName: string, phone: string): Promise<DriverBody> => {
    const created = await director.send<DriverBody>('POST', '/transport/drivers', {
      fullName,
      phone,
      licenceClass: 'FC',
      licenceExpiry: '2030-12-31',
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    return created.body;
  };

  it('12. tai khoan Lai xe chua noi ho so: "Người này làm được gì?" noi thang la chua lam duoc gi', async () => {
    const suggested = await director.send<{ username: string }>(
      'POST',
      '/settings/users/suggest-username',
      { name: 'Trần Văn Đức', prefix: 'lx.' },
    );
    expect(suggested.body.username).toBe('lx.tran.van.duc');
    const created = await director.send<Account>('POST', '/settings/users', {
      username: suggested.body.username,
      name: 'Trần Văn Đức',
      role: 'SALE',
    });
    expect(created.status).toBe(201);
    const access = await director.send<{
      preset: { label: string };
      sentences: string[];
      groups: { id: string; summary: string }[];
    }>('GET', `/settings/users/${created.body.id}/access`);
    expect(access.status).toBe(200);
    expect(access.body.preset.label).toBe('Lái xe');
    expect(access.body.sentences).toEqual(['Chưa nối hồ sơ lái xe — chưa làm được gì']);
    expect(access.body.groups.every((group) => group.summary === 'NONE')).toBe(true);

    const listed = await director.send<Json[]>('GET', '/settings/users?status=pending&q=lx.tran');
    expect(listed.body.map((row) => row.username)).toEqual(['lx.tran.van.duc']);
    driverAccountId = created.body.id;
  });

  it('13. noi ho so lai xe: "lam duoc gi" doi theo; dang noi thi khong doi vai; mot tai khoan mot ho so', async () => {
    const driver = await registerDriver('Trần Văn Đức', '0912395013');
    const vehicle = await director.send<{ id: string }>('POST', '/transport/vehicles', {
      registrationPlate: '29C-395.13',
      vehicleClass: 'TRUCK',
    });
    expect(vehicle.status, JSON.stringify(vehicle.body)).toBe(201);
    const assigned = await director.send('POST', `/transport/vehicles/${vehicle.body.id}/driver`, {
      driverId: driver.id,
    });
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(201);

    // Dieu hanh mang MOI quyen cap duoc: noi ho so van la viec chi-Giam-doc.
    for (const [method, path, payload] of [
      ['PUT', `/transport/drivers/${driver.id}/account`, { authUserId: driverAccountId }],
      ['GET', `/transport/account-links/${driverAccountId}`, undefined],
    ] as const) {
      // Ly do CO KIEU cua cong van tai — khong chi ma 403 (mot 403 cua cong khac cung la 403).
      const refused = await allGrantsManager.send(method, path, payload);
      expect(refused.status, path).toBe(403);
      expect(refused.body, path).toMatchObject({
        reason: 'ACTION_NOT_PERMITTED',
        detail: { action: 'transport.account_link.manage' },
      });
    }

    const linked = await director.send<DriverBody>(
      'PUT',
      `/transport/drivers/${driver.id}/account`,
      { authUserId: driverAccountId },
    );
    expect(linked.status, JSON.stringify(linked.body)).toBe(200);
    expect(linked.body.authUserId).toBe(driverAccountId);

    const links = await director.send('GET', `/transport/account-links/${driverAccountId}`);
    expect(links).toEqual({
      status: 200,
      body: {
        driver: {
          id: driver.id,
          name: 'Trần Văn Đức',
          phone: '0912395013',
          status: 'ACTIVE',
          vehicle: { id: vehicle.body.id, registrationPlate: '29C-395.13' },
        },
        stakeholder: null,
      },
    });

    const access = await director.send<AccessBody>(
      'GET',
      `/settings/users/${driverAccountId}/access`,
    );
    expect(access.status).toBe(200);
    expect(access.body.sentences).not.toContain('Chưa nối hồ sơ lái xe — chưa làm được gì');
    expect(access.body.sentences).toContain(
      'Nối với hồ sơ lái xe Trần Văn Đức (0912395013), đang phụ trách xe 29C-395.13 — làm được việc của chính lái xe này.',
    );
    expect(access.body.scopes).toEqual([expect.objectContaining({ id: 'lai-xe', active: true })]);
    expect(access.body.groups.find((group) => group.id === 'lai-xe')?.summary).not.toBe('NONE');

    // Dang noi ho so lai xe → khong doi sang vai van phong (ca duong moi lan duong cu).
    for (const [method, path, payload] of [
      ['PUT', `/settings/users/${driverAccountId}/access`, { role: 'MANAGER', grants: [] }],
      ['PATCH', `/settings/users/${driverAccountId}/role`, { role: 'MANAGER' }],
    ] as const) {
      const refused = await director.send(method, path, payload);
      expect(refused.status, path).toBe(409);
      expect(refused.body, path).toMatchObject({
        reason: 'ACCOUNT_LINKED_TO_DRIVER',
        detail: {
          violations: [{ code: 'ACCOUNT_LINKED_TO_DRIVER', detail: { driverId: driver.id } }],
        },
      });
    }

    // Mot tai khoan chi noi MOT ho so lai xe.
    const second = await registerDriver('Trần Văn Đức (hồ sơ trùng)', '0912395014');
    const taken = await director.send('PUT', `/transport/drivers/${second.id}/account`, {
      authUserId: driverAccountId,
    });
    expect(taken.status).toBe(409);
    expect(taken.body).toMatchObject({ reason: 'DRIVER_ACCOUNT_TAKEN' });

    // Go noi → doi vai duoc, va bang "lam duoc gi" quay ve "chua noi".
    const unlinked = await director.send<DriverBody>(
      'PUT',
      `/transport/drivers/${driver.id}/account`,
      { authUserId: null },
    );
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.authUserId).toBeNull();
    expect(
      (await director.send('GET', `/transport/account-links/${driverAccountId}`)).body,
    ).toEqual({ driver: null, stakeholder: null });
    const moved = await director.send('PUT', `/settings/users/${driverAccountId}/access`, {
      role: 'MANAGER',
      grants: [],
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
  });
});
