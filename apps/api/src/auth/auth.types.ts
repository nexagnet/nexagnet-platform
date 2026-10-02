import type { PermissionGrant } from './access/permission-domain.js';

export const USER_ROLES = ['SALE', 'MANAGER', 'ACCOUNTING', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface SessionIdentity {
  userId: string;
  credentialVersion: number;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  credentialVersion: number;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  /*
   * `#395` — TUY CHON o tang kieu, co y: moi `authUser` dung truoc #395 (va moi fixture spec cu)
   * khong co cac truong nay, va chung phai duoc tra loi DUNG NHU HOM NAY. Thieu `permissionGrants`
   * = khong co quyen rieng nao (`grantsOf`); thieu `mustChangePassword` = khong bi ep doi mat khau.
   */
  permissionGrants?: readonly PermissionGrant[];
  mustChangePassword?: boolean;
  temporaryPasswordExpiresAt?: string | null;
  jobTitle?: string | null;
}
