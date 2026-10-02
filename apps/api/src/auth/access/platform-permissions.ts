import type { UserRole } from '../auth.types.js';

/**
 * QUYEN CUA NEN TANG (`#395`) — nhung quyen khong thuoc mien nghiep vu nao.
 *
 * Hom nay chi mot: quan tri tai khoan va phan quyen. Tien to `platform.` thuoc rieng nen tang; khong
 * mien nao duoc dang ky voi `id` `platform` (`PermissionDomainRegistry` tu choi).
 *
 * KHONG CAP DUOC bang quyen rieng, va do la co y: nguoi cap duoc quyen quan tri tai khoan thi tu
 * cap duoc moi quyen khac cho chinh minh — tuc la Giam doc. Muon mot nguoi quan tri tai khoan thi
 * doi vai cua ho thanh `ADMIN` (co xac nhan leo thang), khong phai mot o danh dau.
 */
export const PLATFORM_ACCOUNTS_MANAGE = 'platform.accounts.manage';

export const PLATFORM_PERMISSIONS = [PLATFORM_ACCOUNTS_MANAGE] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export const PLATFORM_PERMISSION_PREFIX = 'platform.';

/** Nhan tieng Viet cho man hinh — nghiep vu, khong phai ten ma. */
export const PLATFORM_PERMISSION_LABELS: Readonly<Record<PlatformPermission, string>> = {
  'platform.accounts.manage': 'Quản trị tài khoản & phân quyền',
};

/**
 * Vai khoi diem → quyen nen tang. Mot BANG, khong phai mot `if (role === ...)`: cung ky luat voi
 * `transport-actions.ts`, de ngay nen tang co them mot quyen chi can them mot cot o day.
 */
const PLATFORM_ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly PlatformPermission[]>> = {
  ADMIN: [PLATFORM_ACCOUNTS_MANAGE],
  ACCOUNTING: [],
  MANAGER: [],
  SALE: [],
};

export function platformPermissionsFor(role: UserRole): readonly PlatformPermission[] {
  return PLATFORM_ROLE_PERMISSIONS[role];
}

export function isPlatformPermission(permission: string): permission is PlatformPermission {
  return (PLATFORM_PERMISSIONS as readonly string[]).includes(permission);
}

/** Dong danh muc cho man hinh quyen: `{ code, label }` cua moi quyen nen tang. */
export function platformPermissionCatalog(): readonly {
  readonly code: PlatformPermission;
  readonly label: string;
}[] {
  return PLATFORM_PERMISSIONS.map((code) => ({ code, label: PLATFORM_PERMISSION_LABELS[code] }));
}
