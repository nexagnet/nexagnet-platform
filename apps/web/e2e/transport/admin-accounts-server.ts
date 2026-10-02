import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page, Route } from '@playwright/test';
import { localUsernameSuggestion } from '../../experiences/transport-operations/admin/accounts-model';
import { actionsForRole } from '../../experiences/transport-operations/transport-actions';

/**
 * `#395` — MAY CHU GIA CO TRANG THAI cho "Tài khoản & quyền" va cong quyen cua man hinh.
 *
 * Moi yeu cau `/auth/*`, `/settings/*`, `/transport/*` di qua MOT `page.route`: khong yeu cau nao ra
 * Internet, moi than yeu cau duoc ghi lai de bai kiem khang dinh DUNG cai da gui. Danh muc quyen la
 * ban chup cua `transport-permission-catalog.ts` (`fixtures/permission-catalog.json`).
 *
 * May chu gia KHONG tinh quyen thay may chu that — no chi du that de man hinh co cau tra loi: bo
 * quyen hieu luc = vai khoi diem (ban guong web) − BOT + THEM, va MOT luat tach nhiem (Ke toan duyet
 * tien khong duoc them quyen sua can cu) de bai kiem thay duong `409 ACCESS_INVALID`.
 *
 * Mat khau tam SINH LUC CHAY: khong mot chuoi mat khau nao nam trong ma nguon (quet bi mat).
 */

type Role = 'SALE' | 'MANAGER' | 'ACCOUNTING' | 'ADMIN';
type Effect = 'ALLOW' | 'DENY';

export interface Grant {
  readonly permission: string;
  readonly effect: Effect;
}

export interface Account {
  id: string;
  username: string;
  name: string;
  role: Role;
  phone: string | null;
  email: string | null;
  jobTitle: string | null;
  disabledAt: string | null;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  temporaryPasswordExpiresAt: string | null;
  permissionGrants: Grant[];
  isProtected: boolean;
  createdAt: string;
}

interface CatalogAction {
  readonly code: string;
  readonly label: string;
  readonly kind: string;
  readonly directorOnly: boolean;
  readonly escalation: boolean;
  readonly sod: 'DECISION' | 'EVIDENCE' | null;
}

interface CatalogGroup {
  readonly id: string;
  readonly label: string;
  readonly grantable: boolean;
  readonly actions: readonly CatalogAction[];
  /** Quyen "kèm theo để dùng được" cua nhom (`#395`). */
  readonly needs?: readonly string[];
}

export const CATALOG = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/permission-catalog.json'), 'utf8'),
) as { domains: [{ id: string; groups: CatalogGroup[] }] };

export const GROUPS: readonly CatalogGroup[] = CATALOG.domains[0].groups;

export const groupCodes = (id: string): string[] =>
  (GROUPS.find((group) => group.id === id)?.actions ?? []).map((action) => action.code);

/** Quyen "kèm theo để dùng được" cua mot nhom, tu ban chup danh muc (`#395`). */
export const groupNeeds = (id: string): string[] => [
  ...(GROUPS.find((group) => group.id === id)?.needs ?? []),
];

const ACTION_BY_CODE = new Map(GROUPS.flatMap((group) => group.actions.map((a) => [a.code, a])));

export interface Driver {
  readonly id: string;
  readonly fullName: string;
  readonly phone: string;
  readonly licenceClass: string;
  readonly licenceExpiry: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
  authUserId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Recorded {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

/** Dong lich su — CUNG hinh dang `toHistoryEntry` cua may chu (`after` mang ly do khoa). */
export interface HistoryRow {
  readonly at: string;
  readonly actor: string;
  readonly action: string;
  readonly summary: string;
  readonly after?: unknown;
}

/** Mot lan tra loi LOI cho yeu cau ke tiep khop — bai kiem dung de dung duong loi THAT. */
export interface Failure {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export interface AccountsWorld {
  readonly accounts: Account[];
  readonly drivers: Driver[];
  readonly requests: Recorded[];
  readonly history: Map<string, HistoryRow[]>;
  /** Tra loi LOI mot lan cho yeu cau ke tiep khop (vd `429` cua ThrottlerGuard) roi tu go. */
  failNext: Failure | null;
  /** Tai khoan dang dang nhap, va tap quyen `/auth/me` tra (`null` = may chu cu, khong tra). */
  me: { accountId: string; permissions: readonly string[] | null };
  /** Tao lai ma CSRF sau lan doi mat khau — man hinh phai giu ma MOI. */
  csrf: string;
  /**
   * Xe cua nguoi dang dang nhap neu ho DA NOI ho so ben gop von (`GET /transport/me/vehicles`);
   * `null` = khong phai ben gop von — may chu that tra `403 ASSET_STAKEHOLDER_NOT_FOUND`.
   */
  readonly myVehicles: readonly Record<string, unknown>[] | null;
}

const NOW = '2026-09-25T02:00:00.000Z';

const account = (
  patch: Partial<Account> & Pick<Account, 'id' | 'username' | 'name' | 'role'>,
): Account => ({
  phone: null,
  email: null,
  jobTitle: null,
  disabledAt: null,
  lastLoginAt: '2026-09-24T09:00:00.000Z',
  mustChangePassword: false,
  temporaryPasswordExpiresAt: null,
  permissionGrants: [],
  isProtected: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...patch,
});

/** Dung mot tai khoan mau cho bai kiem — moi truong khong khai lay mac dinh "dang hoat dong". */
export const makeAccount = account;

export const DIRECTOR = account({
  id: 'u-giam-doc',
  username: 'giam-doc',
  name: 'Giám đốc Hùng',
  role: 'ADMIN',
  jobTitle: 'Giám đốc',
});

export const ACCOUNTANT = account({
  id: 'u-ke-toan',
  username: 'ke-toan',
  name: 'Kế toán Mai',
  role: 'ACCOUNTING',
});

export const DRIVER_ACCOUNT = account({
  id: 'u-lx-binh',
  username: 'lx.binh.nguyen.van',
  name: 'Nguyễn Văn Bình',
  role: 'SALE',
  phone: '0900000001',
});

export const SYSTEM_OPERATOR = account({
  id: 'u-operator',
  username: 'operator',
  name: 'Vận hành hệ thống',
  role: 'ADMIN',
  isProtected: true,
  lastLoginAt: null,
});

const DRIVERS: readonly Driver[] = [
  {
    id: 'drv-binh',
    fullName: 'Nguyễn Văn Bình',
    phone: '0900000001',
    licenceClass: 'FC',
    licenceExpiry: '2027-06-30',
    status: 'ACTIVE',
    authUserId: 'u-lx-binh',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'drv-tuan',
    fullName: 'Phạm Minh Tuấn',
    phone: '0900000004',
    licenceClass: 'FC',
    licenceExpiry: '2028-03-31',
    status: 'ACTIVE',
    authUserId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

/** Mot ke hoach bao duong den han cua xe `veh-1` — de man hinh phai doc TEN xe (bien so). */
const MAINTENANCE_DUE = {
  planId: 'plan-1',
  vehicleId: 'veh-1',
  planName: 'Thay dầu động cơ',
  triggerKind: 'ODOMETER',
  state: 'DUE_SOON',
  dueAtOdoKm: 121_000,
  dueOnDate: null,
  odoRemainingKm: 550,
  daysRemaining: null,
  reachedBy: null,
  currentOdoKm: 120_450,
  lastServicedDate: '2026-06-01',
  lastServicedOdoKm: 111_000,
};

export const VEHICLES = [
  {
    id: 'veh-1',
    registrationPlate: '29H-123.45',
    vehicleClass: 'Xe tải 5 tấn',
    allowedPayloadKg: 5000,
    currentOdoKm: 120_450,
    status: 'IDLE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
];

/** 16 ky tu tu bang chu khong nham lan — SINH o day, khong phai hang so trong ma nguon. */
export const temporaryPasswordOf = (seed: number): string => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(
    { length: 16 },
    (_, index) => alphabet[(seed * 7 + index * 5) % alphabet.length],
  ).join('');
};

const json = (route: Route, body: unknown, status = 200): Promise<void> =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const problem = (
  route: Route,
  status: number,
  reason: string,
  message: string,
  detail?: Record<string, unknown>,
): Promise<void> =>
  json(
    route,
    { statusCode: status, error: 'Error', message, reason, ...(detail ? { detail } : {}) },
    status,
  );

const publicUser = (entry: Account) => ({
  id: entry.id,
  username: entry.username,
  name: entry.name,
  role: entry.role,
  phone: entry.phone,
  email: entry.email,
  disabledAt: entry.disabledAt,
  lastLoginAt: entry.lastLoginAt,
  mustChangePassword: entry.mustChangePassword,
  temporaryPasswordExpiresAt: entry.temporaryPasswordExpiresAt,
  jobTitle: entry.jobTitle,
});

/* ------------------------------------------------------------------ *
 * "Nguoi nay lam duoc gi?" — du that de man hinh co cau cua may chu
 * ------------------------------------------------------------------ */

const presetOf = (role: Role): ReadonlySet<string> => new Set(actionsForRole(role));

const effectiveOf = (role: Role, grants: readonly Grant[]): Set<string> => {
  const set = new Set(presetOf(role));
  if (role !== 'MANAGER' && role !== 'ACCOUNTING') return set;
  for (const grant of grants) {
    if (grant.effect === 'DENY') set.delete(grant.permission);
    else set.add(grant.permission);
  }
  return set;
};

type State =
  'PRESET' | 'GRANTED' | 'DENIED' | 'NONE' | 'DIRECTOR_ONLY' | 'SCOPE_ACTIVE' | 'SCOPE_INACTIVE';

function breakdown(world: AccountsWorld, target: Account, role: Role, grants: readonly Grant[]) {
  const preset = presetOf(role);
  const linked = world.drivers.some((driver) => driver.authUserId === target.id);
  const groups = GROUPS.map((group) => {
    const actions = group.actions.map((action) => {
      const grant = grants.find((entry) => entry.permission === action.code);
      let state: State = 'NONE';
      if (!group.grantable) {
        state = preset.has(action.code) ? (linked ? 'SCOPE_ACTIVE' : 'SCOPE_INACTIVE') : 'NONE';
      } else if (action.directorOnly && role !== 'ADMIN') state = 'DIRECTOR_ONLY';
      else if (grant?.effect === 'ALLOW') state = 'GRANTED';
      else if (grant?.effect === 'DENY') state = 'DENIED';
      else if (preset.has(action.code)) state = 'PRESET';
      return { code: action.code, label: action.label, kind: action.kind, state };
    });
    const usable = actions.filter((a) => ['PRESET', 'GRANTED', 'SCOPE_ACTIVE'].includes(a.state));
    const summary =
      usable.length === 0 ? 'NONE' : usable.length === actions.length ? 'FULL' : 'PARTIAL';
    return {
      domain: 'transport',
      id: group.id,
      label: group.label,
      grantable: group.grantable,
      actions,
      summary,
    };
  });
  const sentences: string[] = [];
  if (role === 'ADMIN') sentences.push('Quản trị tài khoản & phân quyền');
  const full = groups.filter((group) => group.grantable && group.summary === 'FULL');
  if (full.length > 0) sentences.push(`Làm được mọi việc: ${full.map((g) => g.label).join('; ')}`);
  for (const group of groups.filter((g) => g.grantable && g.summary === 'PARTIAL')) {
    const usable = group.actions.filter((a) => a.state === 'PRESET' || a.state === 'GRANTED');
    sentences.push(`${group.label}: ${usable.map((a) => a.label.toLowerCase()).join(', ')}`);
  }
  if (role === 'SALE') {
    sentences.push(
      linked
        ? 'Làm việc của chính mình qua hồ sơ lái xe'
        : 'Chưa nối hồ sơ lái xe — chưa làm được gì',
    );
  }
  const canDecide = [...effectiveOf(role, grants)].some(
    (code) => ACTION_BY_CODE.get(code)?.kind === 'DUYET',
  );
  if (role !== 'ADMIN' && !canDecide) sentences.push('Không duyệt được tiền');
  if (sentences.length === 0) sentences.push('Chưa làm được gì — chọn ít nhất một nhóm việc');
  return {
    account: target,
    preset: {
      role,
      label: (
        {
          ADMIN: 'Giám đốc',
          ACCOUNTING: 'Kế toán',
          MANAGER: 'Điều hành / Quản lý',
          SALE: 'Lái xe',
        } as const
      )[role],
    },
    grants,
    groups,
    scopes: [],
    sentences,
  };
}

/** Luat tach nhiem DUY NHAT cua may chu gia: nguoi DUYET tien khong duoc them quyen SUA can cu. */
function violations(role: Role, grants: readonly Grant[]) {
  const effective = effectiveOf(role, grants);
  const decision = [...effective].find((code) => ACTION_BY_CODE.get(code)?.sod === 'DECISION');
  return grants
    .filter(
      (grant) =>
        grant.effect === 'ALLOW' && ACTION_BY_CODE.get(grant.permission)?.sod === 'EVIDENCE',
    )
    .flatMap((grant) =>
      decision === undefined
        ? []
        : [
            {
              code: 'SOD_CONFLICT',
              permission: grant.permission,
              detail: { decision, evidence: grant.permission },
            },
          ],
    );
}

/*
 * Cau lich su CUA MAY CHU (`HISTORY_SUMMARY` trong `apps/api/src/auth/account-audit.ts`) — may chu
 * gia khong tu dat cau, de bai kiem khang dinh dung cai man hinh that se hien.
 */
const SUMMARY = {
  'auth.user.create': 'Tạo tài khoản',
  'auth.user.access.change': 'Đổi vai trò hoặc quyền',
  'auth.user.disable': 'Khoá tài khoản',
  'auth.user.enable': 'Mở khoá tài khoản',
  'auth.credentials.reset': 'Cấp mật khẩu tạm mới',
} as const;

function remember(
  world: AccountsWorld,
  userId: string,
  action: keyof typeof SUMMARY,
  after?: unknown,
): void {
  const rows = world.history.get(userId) ?? [];
  rows.unshift({ at: NOW, actor: 'giam-doc', action, summary: SUMMARY[action], after });
  world.history.set(userId, rows);
}

let credentialSeed = 1;
const issueCredential = (target: Account) => {
  credentialSeed += 1;
  target.mustChangePassword = true;
  target.temporaryPasswordExpiresAt = '2026-09-28T02:00:00.000Z';
  return {
    temporaryPassword: temporaryPasswordOf(credentialSeed),
    expiresAt: target.temporaryPasswordExpiresAt,
  };
};

async function answerUsers(
  route: Route,
  world: AccountsWorld,
  method: string,
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  if (path === '/settings/users' && method === 'GET') return json(route, world.accounts);
  if (path === '/settings/users/permission-catalog') return json(route, CATALOG);
  if (path === '/settings/users/suggest-username') {
    // CUNG luat voi `usernameBase` cua may chu — ban web do da duoc doi chieu voi bang vi du cua API.
    return json(route, {
      username: localUsernameSuggestion(String(body.name ?? ''), String(body.prefix ?? '')),
    });
  }
  if (path === '/settings/users' && method === 'POST') {
    const role = body.role as Role;
    if (role === 'ADMIN' && body.confirmEscalation !== true) {
      return problem(route, 409, 'ESCALATION_CONFIRMATION_REQUIRED', 'Cần xác nhận');
    }
    if (world.accounts.some((entry) => entry.username === body.username)) {
      // May chu that KHONG kem `detail` cho ly do nay (`auth.service` → `deny(..., {})`).
      return problem(
        route,
        409,
        'ACCOUNT_IDENTITY_TAKEN',
        'Tên đăng nhập, email hoặc số điện thoại đã được dùng',
      );
    }
    const grants = (body.grants as Grant[] | undefined) ?? [];
    const found = violations(role, grants);
    if (found.length > 0)
      return problem(route, 409, 'ACCESS_INVALID', 'Bộ quyền không hợp lệ', { violations: found });
    const created = account({
      id: `u-new-${world.accounts.length + 1}`,
      username: String(body.username),
      name: String(body.name),
      role,
      phone: (body.phone as string | null | undefined) ?? null,
      jobTitle: (body.jobTitle as string | null | undefined) ?? null,
      permissionGrants: grants,
      lastLoginAt: null,
    });
    const credential = issueCredential(created);
    world.accounts.push(created);
    remember(world, created.id, 'auth.user.create');
    return json(route, { ...created, credential }, 201);
  }
  const match = /^\/settings\/users\/([^/]+)(\/.*)?$/.exec(path);
  const target = world.accounts.find((entry) => entry.id === match?.[1]);
  if (match === null || target === undefined)
    return problem(route, 404, 'ACCOUNT_NOT_FOUND', 'Không tìm thấy');
  const suffix = match[2] ?? '';
  const isSelf = target.id === world.me.accountId;
  if (suffix === '/access' && method === 'GET')
    return json(route, breakdown(world, target, target.role, target.permissionGrants));
  if (suffix === '/access' && method === 'PUT') {
    if (isSelf) return problem(route, 403, 'SELF_LOCKOUT', 'Tự khoá');
    const role = body.role as Role;
    const grants = (body.grants as Grant[]) ?? [];
    const found = violations(role, grants);
    if (found.length > 0)
      return problem(route, 409, 'ACCESS_INVALID', 'Bộ quyền không hợp lệ', { violations: found });
    if (body.dryRun === true) return json(route, breakdown(world, target, role, grants));
    target.role = role;
    target.permissionGrants = grants;
    remember(world, target.id, 'auth.user.access.change');
    return json(route, { account: target, access: breakdown(world, target, role, grants) });
  }
  if (suffix === '/history') return json(route, world.history.get(target.id) ?? []);
  if (suffix === '/disable') {
    if (isSelf) return problem(route, 403, 'SELF_LOCKOUT', 'Tự khoá');
    target.disabledAt = NOW;
    remember(world, target.id, 'auth.user.disable', {
      disabledAt: NOW,
      reason: body.reason ?? null,
    });
    return json(route, target);
  }
  if (suffix === '/enable') {
    target.disabledAt = null;
    remember(world, target.id, 'auth.user.enable');
    return json(route, target);
  }
  if (suffix === '/credentials/reset') {
    if (isSelf) return problem(route, 403, 'SELF_LOCKOUT', 'Tự khoá');
    const credential = issueCredential(target);
    remember(world, target.id, 'auth.credentials.reset');
    return json(route, { ...target, credential });
  }
  if (suffix === '' && method === 'PATCH') {
    Object.assign(target, body);
    return json(route, target);
  }
  return problem(route, 404, 'ROUTE_NOT_MOCKED', `khong co mock cho ${method} ${path}`);
}

async function answer(route: Route, world: AccountsWorld): Promise<void> {
  const request = route.request();
  const method = request.method();
  const url = new URL(request.url());
  const path = url.pathname;
  const body = (method === 'GET' ? {} : (request.postDataJSON() ?? {})) as Record<string, unknown>;
  world.requests.push({ method, path, body });
  const failure = world.failNext;
  if (failure !== null && failure.method === method && failure.path === path) {
    world.failNext = null;
    return json(route, failure.body, failure.status);
  }
  const me = world.accounts.find((entry) => entry.id === world.me.accountId) as Account;

  if (path === '/auth/config') return json(route, { mode: 'session' });
  if (path === '/auth/csrf') return json(route, { csrfToken: world.csrf });
  if (path === '/auth/me') {
    return json(route, {
      user: publicUser(me),
      roles: [me.role],
      ...(world.me.permissions === null ? {} : { permissions: world.me.permissions }),
    });
  }
  if (path === '/auth/credentials/change') {
    // Lenh ghi sau doi mat khau phai mang ma CSRF moi — ma cu chet cung phien cu.
    me.mustChangePassword = false;
    me.temporaryPasswordExpiresAt = null;
    world.csrf = 'e2e-csrf-2';
    return json(route, { user: publicUser(me), csrfToken: world.csrf });
  }
  if (path === '/auth/logout') return json(route, {});
  if (path.startsWith('/settings/users')) return answerUsers(route, world, method, path, body);

  const linkMatch = /^\/transport\/account-links\/([^/]+)$/.exec(path);
  if (linkMatch !== null) {
    const driver = world.drivers.find((entry) => entry.authUserId === linkMatch[1]);
    return json(route, {
      driver:
        driver === undefined
          ? null
          : {
              id: driver.id,
              name: driver.fullName,
              phone: driver.phone,
              status: driver.status,
              // Hinh dang cua may chu (`AccountLinksView`): xe DANG phu trach la mot doi tuong.
              vehicle:
                driver.id === 'drv-binh' ? { id: 'veh-1', registrationPlate: '29H-123.45' } : null,
            },
      stakeholder: null,
    });
  }
  const driverLink = /^\/transport\/drivers\/([^/]+)\/account$/.exec(path);
  if (driverLink !== null && method === 'PUT') {
    const driver = world.drivers.find((entry) => entry.id === driverLink[1]);
    if (driver === undefined) return problem(route, 404, 'NOT_FOUND', 'Không tìm thấy');
    driver.authUserId = (body.authUserId as string | null) ?? null;
    return json(route, driver);
  }
  if (path === '/transport/me/vehicles/activity') {
    if (world.myVehicles === null) return notAStakeholder(route);
    return json(route, {
      range: { from: '2026-08-27', to: '2026-09-25', businessDays: 30 },
      utilisationFormula: 'ngayCoChangKhongHuy / ngayLichTrongKhoang',
      vehicles: [],
      unavailableSources: [],
    });
  }
  if (path === '/transport/me/vehicles') {
    return world.myVehicles === null ? notAStakeholder(route) : json(route, world.myVehicles);
  }
  if (path === '/transport/drivers') return json(route, world.drivers);
  // `#395` — man "Bảo dưỡng & giấy tờ" cho Dieu hanh duoc cap DUNG nhom Bao duong.
  if (path === '/transport/maintenance/due') return json(route, { due: [MAINTENANCE_DUE] });
  if (path === '/transport/maintenance/work-orders') return json(route, { workOrders: [] });
  if (path === '/transport/compliance/documents') return json(route, { documents: [] });
  if (path === '/transport/compliance/alerts') return json(route, { alerts: [] });
  if (path === '/transport/fleet-status') return json(route, { vehicles: [] });
  if (path === '/transport/alerts') {
    return json(route, { generatedFor: '2026-09-26', alerts: [], unavailableSources: [] });
  }
  if (path === '/transport/asset-ownership/stakeholders') return json(route, []);
  if (path === '/transport/vehicles') return json(route, VEHICLES);
  return problem(route, 404, 'ROUTE_NOT_MOCKED', `khong co mock cho ${method} ${path}`);
}

/** Cung than `403` voi `AssetOwnershipScopeService` khi tai khoan khong phai ben gop von. */
const notAStakeholder = (route: Route): Promise<void> =>
  problem(
    route,
    403,
    'ASSET_STAKEHOLDER_NOT_FOUND',
    'Tài khoản này không có quyền xem xe đã yêu cầu',
  );

export async function serveAccounts(
  page: Page,
  options: {
    readonly me?: Account;
    readonly permissions?: readonly string[] | null;
    readonly myVehicles?: readonly Record<string, unknown>[] | null;
  } = {},
): Promise<AccountsWorld> {
  const me = options.me ?? DIRECTOR;
  const accounts = [DIRECTOR, ACCOUNTANT, DRIVER_ACCOUNT, SYSTEM_OPERATOR]
    .filter((entry) => entry.id !== me.id)
    .map((entry) => ({ ...entry, permissionGrants: [...entry.permissionGrants] }));
  const world: AccountsWorld = {
    accounts: [{ ...me, permissionGrants: [...me.permissionGrants] }, ...accounts],
    drivers: DRIVERS.map((driver) => ({ ...driver })),
    requests: [],
    history: new Map([
      [
        ACCOUNTANT.id,
        [
          {
            at: '2026-09-20T03:00:00.000Z',
            actor: 'giam-doc',
            action: 'auth.login',
            summary: 'Đăng nhập',
          },
        ],
      ],
    ]),
    me: {
      accountId: me.id,
      permissions:
        options.permissions === undefined
          ? [
              ...actionsForRole(me.role),
              ...(me.role === 'ADMIN' ? ['platform.accounts.manage'] : []),
            ]
          : options.permissions,
    },
    csrf: 'e2e-csrf',
    myVehicles: options.myVehicles ?? null,
    failNext: null,
  };
  await page.route(
    (url) =>
      url.pathname.startsWith('/transport/') ||
      url.pathname.startsWith('/auth/') ||
      url.pathname.startsWith('/settings/'),
    (route) => answer(route, world),
  );
  return world;
}

export const lastRequest = (
  world: AccountsWorld,
  method: string,
  path: string | RegExp,
): Recorded | undefined =>
  [...world.requests]
    .reverse()
    .find(
      (entry) =>
        entry.method === method &&
        (typeof path === 'string' ? entry.path === path : path.test(entry.path)),
    );

const SHOTS_DIR = process.env.SHOTS_DIR?.trim() ?? '';

/** Anh chup: `SHOTS_DIR` (duong dan tuyet doi) neu co, khong thi vao `test-results` cua lan chay. */
export async function shoot(page: Page, name: string, fullPage = true): Promise<void> {
  await page.evaluate(() =>
    document.querySelectorAll('nextjs-portal').forEach((node) => node.remove()),
  );
  const dir =
    SHOTS_DIR.length > 0 ? SHOTS_DIR : resolve(__dirname, '../../test-results/admin-shots');
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage });
}
