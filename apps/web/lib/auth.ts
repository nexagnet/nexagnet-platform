import { publicApiBase } from './api-base';

const API_BASE = publicApiBase();
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export type AuthRole = 'SALE' | 'MANAGER' | 'ACCOUNTING' | 'ADMIN';

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: AuthRole;
  disabledAt?: string | null;
  /*
   * `#395` — TUY CHON, co y: mot may chu cu (va moi mock e2e cu) khong tra cac truong nay, va man
   * hinh phai hien DUNG nhu hom nay. Thieu `mustChangePassword` = khong bi ep doi mat khau.
   */
  createdAt?: string;
  lastLoginAt?: string | null;
  mustChangePassword?: boolean;
  temporaryPasswordExpiresAt?: string | null;
  jobTitle?: string | null;
  /**
   * Quyen RIENG cua tai khoan (them/bot so voi vai khoi diem) — may chu tra tren moi `AccountView`.
   * `/settings` doc no de canh bao: doi vai bang duong cu XOA het cac dong nay.
   */
  permissionGrants?: readonly { readonly permission: string; readonly effect: 'ALLOW' | 'DENY' }[];
}

/**
 * `/auth/me` — `permissions` la tap quyen HIEU LUC do may chu tinh (nen tang + moi mien). Thieu
 * truong (may chu cu, mock cu) = man hinh roi ve ban guong theo vai; KHONG phai "khong co quyen".
 */
export interface AuthMe {
  user: AuthUser;
  roles: readonly AuthRole[];
  permissions?: readonly string[];
}

/** Mat khau TAM — chi co trong DUNG mot phan hoi HTTP, khong bao gio duoc luu hay ghi log. */
export interface TemporaryCredential {
  temporaryPassword: string;
  expiresAt: string;
}

/** Tai khoan vua tao / vua dat lai mat khau: cac truong tai khoan o goc + the mat khau tam. */
export type AuthUserWithCredential = AuthUser & { credential?: TemporaryCredential };

export interface CreateUserInput {
  username: string;
  name: string;
  role: AuthRole;
  phone?: string | null;
  email?: string | null;
  jobTitle?: string | null;
  /** Bo trong = may chu tu tao mat khau tam. Co hay khong, lan dang nhap dau deu phai doi. */
  password?: string;
  grants?: readonly { permission: string; effect: 'ALLOW' | 'DENY' }[];
  confirmEscalation?: boolean;
}

/**
 * LOI CUA MAY CHU, GIU DU BA THU man hinh can: `status` (401 ≠ 403 ≠ 409), `reason` co kieu (de
 * chon cau tieng Viet va cach xu ly) va `detail` co cau truc (de goi TEN tai khoan / dia diem dang
 * xung dot). Truoc `#395` ham doc chi giu `message`, nen man hinh khong phan biet duoc "tu khoa
 * chinh minh" voi "Giam doc cuoi cung".
 */
export class AuthApiError extends Error {
  readonly status: number;
  readonly reason: string | null;
  readonly detail: Readonly<Record<string, unknown>> | null;

  constructor(
    message: string,
    status: number,
    reason: string | null = null,
    detail: Readonly<Record<string, unknown>> | null = null,
  ) {
    super(message);
    this.name = 'AuthApiError';
    this.status = status;
    this.reason = reason;
    this.detail = detail;
  }
}

let csrfToken: string | null | undefined;

export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const token = MUTATING_METHODS.has(method) ? await currentCsrfToken(input) : null;
  const headers = new Headers(init.headers);
  if (token) headers.set('x-csrf-token', token);
  return fetch(input, { ...init, headers, credentials: 'include' });
}

const jsonInit = (method: 'POST' | 'PATCH' | 'PUT', body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const userPath = (id: string, suffix = ''): string =>
  `${API_BASE}/settings/users/${encodeURIComponent(id)}${suffix}`;

export const authApi = {
  config: async (): Promise<{ mode: 'api-key' | 'session' | 'none' }> =>
    readJson(await authFetch(`${API_BASE}/auth/config`)),
  me: async (): Promise<AuthMe> =>
    readJson(await authFetch(`${API_BASE}/auth/me`, { cache: 'no-store' })),
  login: async (
    username: string,
    password: string,
  ): Promise<{ user: AuthUser; csrfToken: string }> => {
    const result = await readJson<{ user: AuthUser; csrfToken: string }>(
      await authFetch(`${API_BASE}/auth/login`, jsonInit('POST', { username, password })),
    );
    csrfToken = result.csrfToken;
    return result;
  },
  /**
   * Doi mat khau cua CHINH MINH. May chu tao lai phien va tra mot `csrfToken` MOI — phai giu lai
   * ngay, neu khong lenh ghi dau tien sau khi doi (thuong la ngay sau man doi bat buoc) bi tu choi
   * CSRF vi token cu da chet cung phien cu.
   */
  changePassword: async (
    currentPassword: string,
    newPassword: string,
  ): Promise<{ user: AuthUser; csrfToken: string }> => {
    const result = await readJson<{ user: AuthUser; csrfToken: string }>(
      await authFetch(
        `${API_BASE}/auth/credentials/change`,
        jsonInit('POST', { currentPassword, newPassword }),
      ),
    );
    csrfToken = result.csrfToken;
    return result;
  },
  logout: async (): Promise<void> => {
    await readJson(await authFetch(`${API_BASE}/auth/logout`, { method: 'POST' }));
    csrfToken = undefined;
  },
  users: async (): Promise<AuthUser[]> =>
    readJson(await authFetch(`${API_BASE}/settings/users`, { cache: 'no-store' })),
  createUser: async (input: CreateUserInput): Promise<AuthUserWithCredential> => {
    // Mat khau rong KHONG duoc gui: may chu doc `""` la mot mat khau (va tu choi vi qua ngan).
    const { password, ...rest } = input;
    const body = password === undefined || password.length === 0 ? rest : { ...rest, password };
    return readJson(await authFetch(`${API_BASE}/settings/users`, jsonInit('POST', body)));
  },
  assignRole: async (id: string, role: AuthRole, confirmEscalation?: boolean): Promise<AuthUser> =>
    readJson(
      await authFetch(
        userPath(id, '/role'),
        jsonInit('PATCH', confirmEscalation === true ? { role, confirmEscalation } : { role }),
      ),
    ),
  disableUser: async (id: string, reason?: string): Promise<AuthUser> => {
    const trimmed = reason?.trim() ?? '';
    return readJson(
      await authFetch(
        userPath(id, '/disable'),
        jsonInit(
          'POST',
          trimmed.length > 0 ? { confirmed: true, reason: trimmed } : { confirmed: true },
        ),
      ),
    );
  },
  /** Mo khoa — KHONG dat lai mat khau. Tai khoan cu can mat khau moi thi dat lai rieng. */
  enableUser: async (id: string): Promise<AuthUser> =>
    readJson(await authFetch(userPath(id, '/enable'), jsonInit('POST', { confirmed: true }))),
  /** `password` bo trong = may chu tao mat khau tam va tra no trong `credential`. */
  resetPassword: async (id: string, password?: string): Promise<AuthUserWithCredential> =>
    readJson(
      await authFetch(
        userPath(id, '/credentials/reset'),
        jsonInit('POST', password === undefined || password.length === 0 ? {} : { password }),
      ),
    ),
};

async function currentCsrfToken(input: RequestInfo | URL): Promise<string | null> {
  if (csrfToken !== undefined) return csrfToken;
  const target = input instanceof Request ? input.url : input.toString();
  const absoluteBase = target.startsWith('http')
    ? target
    : API_BASE.startsWith('http')
      ? API_BASE
      : null;
  const csrfUrl = absoluteBase ? new URL('/auth/csrf', absoluteBase).toString() : '/auth/csrf';
  const response = await fetch(csrfUrl, { credentials: 'include', cache: 'no-store' });
  const result = await readJson<{ csrfToken?: string | null }>(response);
  // `?? null` la co y: khi API khong tra truong nao (AUTH_MODE=none/api-key) ma gan thang
  // `undefined` thi bo nho dem coi nhu CHUA hoi bao gio, nen MOI mutation lai bat them mot
  // vong `/auth/csrf` — im lang va khong bao gio dung lai. `null` = "da hoi, khong co token".
  csrfToken = result.csrfToken ?? null;
  return csrfToken;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Than loi -> `AuthApiError`. Nest tra `message` la chuoi, hoac MOT MANG chuoi khi zod bat nhieu loi
 * cung luc; `reason`/`detail` chi giu khi dung kieu — mot `detail` la chuoi khong phai cau truc.
 */
export function toApiError(status: number, parsed: unknown): AuthApiError {
  const record = isRecord(parsed) ? parsed : {};
  const raw = record.message;
  const message = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join(', ') : '';
  const reason =
    typeof record.reason === 'string' && record.reason.length > 0 ? record.reason : null;
  const detail = isRecord(record.detail) ? record.detail : null;
  return new AuthApiError(
    message.length > 0 ? message : `Yêu cầu thất bại (${status})`,
    status,
    reason,
    detail,
  );
}

/**
 * Doc mot phan hoi JSON. Than khong phai JSON (vd trang HTML 404 cua Next khi route chua gan) KHONG
 * duoc nem `SyntaxError` tran: no thanh mot `AuthApiError` voi ly do `ROUTE_NOT_MOUNTED`.
 */
export async function readApiJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    throw new AuthApiError(
      response.status === 404
        ? 'Chức năng này chưa được bật trên máy chủ.'
        : 'Không đọc được phản hồi của hệ thống. Hãy thử lại.',
      response.status,
      response.status === 404 ? 'ROUTE_NOT_MOUNTED' : null,
    );
  }
  if (!response.ok) throw toApiError(response.status, parsed);
  return parsed as T;
}

function readJson<T>(response: Response): Promise<T> {
  return readApiJson<T>(response);
}

export function resetAuthClientForTests(): void {
  csrfToken = undefined;
}
