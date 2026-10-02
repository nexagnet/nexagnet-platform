import { publicApiBase } from '../../../lib/api-base';
import { authApi, authFetch, readApiJson, type CreateUserInput } from '../../../lib/auth';
import type { AssetStakeholder, Driver, TransportCustomer } from '../transport-types';
import type {
  AccessBreakdown,
  AccessChangeInput,
  AccountHistoryEntry,
  AccountLinks,
  AccountView,
  AccountWithCredential,
  CounterpartyOption,
  CreatePlaceInput,
  PermissionCatalog,
  PlaceAdminView,
  PlaceHistoryEntry,
  ProfilePatch,
  UpdatePlaceInput,
} from './admin-types';

/**
 * CLIENT cua khu QUAN TRI (`#395`).
 *
 * Moi loi di qua `readApiJson` (`lib/auth.ts`): `AuthApiError` giu `status`, `reason` CO KIEU va
 * `detail` co cau truc — man hinh can ca ba de noi "Tên này đã dùng cho Kho Hải Phòng của Công ty Y"
 * thay vi mot ma liet ke, va de tach `409 DEPOT_CHANGE_AFFECTS_OPEN_WORK` (hoi xac nhan) khoi moi loi
 * khac (hien cau).
 *
 * KHONG dung `transportApi` cho duong ghi o day: `TransportApiError` khong giu `detail`.
 */

const BASE = publicApiBase();

const get = async <T>(path: string): Promise<T> =>
  readApiJson<T>(await authFetch(`${BASE}${path}`, { cache: 'no-store' }));

const send = async <T>(method: 'POST' | 'PATCH' | 'PUT', path: string, body: unknown): Promise<T> =>
  readApiJson<T>(
    await authFetch(`${BASE}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

const id = (value: string): string => encodeURIComponent(value);

export const accountsApi = {
  list: (): Promise<readonly AccountView[]> => get('/settings/users'),
  catalog: (): Promise<PermissionCatalog> => get('/settings/users/permission-catalog'),
  create: (input: CreateUserInput): Promise<AccountWithCredential> => authApi.createUser(input),
  suggestUsername: (name: string, prefix?: string): Promise<{ username: string }> =>
    send(
      'POST',
      '/settings/users/suggest-username',
      prefix === undefined ? { name } : { name, prefix },
    ),
  updateProfile: (userId: string, patch: ProfilePatch): Promise<AccountView> =>
    send('PATCH', `/settings/users/${id(userId)}`, patch),
  access: (userId: string): Promise<AccessBreakdown> => get(`/settings/users/${id(userId)}/access`),
  /** Xem truoc — KHONG ghi, KHONG de lai dong nhat ky. Vi pham di ve dang `409 ACCESS_INVALID`. */
  previewAccess: (userId: string, input: AccessChangeInput): Promise<AccessBreakdown> =>
    send('PUT', `/settings/users/${id(userId)}/access`, { ...input, dryRun: true }),
  saveAccess: (
    userId: string,
    input: AccessChangeInput,
  ): Promise<{ account: AccountView; access: AccessBreakdown }> =>
    send('PUT', `/settings/users/${id(userId)}/access`, input),
  disable: (userId: string, reason?: string) => authApi.disableUser(userId, reason),
  enable: (userId: string) => authApi.enableUser(userId),
  resetPassword: (userId: string): Promise<AccountWithCredential> => authApi.resetPassword(userId),
  history: (userId: string, limit = 50): Promise<readonly AccountHistoryEntry[]> =>
    get(`/settings/users/${id(userId)}/history?limit=${limit}`),
};

export const accountLinksApi = {
  of: (authUserId: string): Promise<AccountLinks> =>
    get(`/transport/account-links/${id(authUserId)}`),
  /** `authUserId: null` = GO cau noi. */
  linkDriver: (driverId: string, authUserId: string | null): Promise<Driver> =>
    send('PUT', `/transport/drivers/${id(driverId)}/account`, { authUserId }),
  linkStakeholder: (stakeholderId: string, authUserId: string | null): Promise<AssetStakeholder> =>
    send('PUT', `/transport/asset-ownership/stakeholders/${id(stakeholderId)}/account`, {
      authUserId,
    }),
  drivers: (): Promise<readonly Driver[]> => get('/transport/drivers'),
  stakeholders: (): Promise<readonly AssetStakeholder[]> =>
    get('/transport/asset-ownership/stakeholders'),
};

export const placesAdminApi = {
  list: (): Promise<readonly PlaceAdminView[]> => get('/transport/places/admin?status=all'),
  create: (input: CreatePlaceInput): Promise<PlaceAdminView> =>
    send('POST', '/transport/places/admin', input),
  update: (placeId: string, input: UpdatePlaceInput): Promise<PlaceAdminView> =>
    send('PATCH', `/transport/places/admin/${id(placeId)}`, input),
  deactivate: (
    placeId: string,
    input: { readonly reason: string; readonly acknowledgeOpenWork?: boolean },
  ): Promise<PlaceAdminView> =>
    send('POST', `/transport/places/admin/${id(placeId)}/deactivate`, input),
  activate: (placeId: string): Promise<PlaceAdminView> =>
    send('POST', `/transport/places/admin/${id(placeId)}/activate`, {}),
  makePrimaryDepot: (
    placeId: string,
    input: { readonly acknowledgeOpenWork?: boolean },
  ): Promise<PlaceAdminView> =>
    send('POST', `/transport/places/admin/${id(placeId)}/make-primary-depot`, input),
  history: (placeId: string): Promise<readonly PlaceHistoryEntry[]> =>
    get(`/transport/places/admin/${id(placeId)}/history`),
  customers: (): Promise<readonly TransportCustomer[]> => get('/transport/customers'),
  counterparties: (): Promise<readonly CounterpartyOption[]> => get('/transport/counterparties'),
};

/** Khoa query cua khu quan tri — MOT cho, de moi lenh ghi lam tuoi dung cho. */
export const ADMIN_QUERY_KEYS = {
  accounts: ['admin', 'accounts'],
  catalog: ['admin', 'accounts', 'catalog'],
  access: (userId: string) => ['admin', 'accounts', userId, 'access'] as const,
  history: (userId: string) => ['admin', 'accounts', userId, 'history'] as const,
  links: (userId: string) => ['admin', 'accounts', userId, 'links'] as const,
  drivers: ['admin', 'link-candidates', 'drivers'],
  stakeholders: ['admin', 'link-candidates', 'stakeholders'],
  places: ['transport', 'admin', 'places'],
  placeHistory: (placeId: string) => ['transport', 'admin', 'places', placeId, 'history'] as const,
  customers: ['transport', 'admin', 'places', 'owners', 'customers'],
  counterparties: ['transport', 'admin', 'places', 'owners', 'counterparties'],
} as const;
