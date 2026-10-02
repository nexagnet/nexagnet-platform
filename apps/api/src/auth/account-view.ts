import type { AccountView } from './account.types.js';
import { isProtectedAccount } from './account-policy.js';
import type { AuthenticatedUser } from './auth.types.js';
import { sortGrants, type AuthUserRecord } from './user.repository.js';

/**
 * Ban ghi → nguoi dung tren day. KHONG BAO GIO mang `passwordHash`.
 *
 * Cac truong `#395` luon co mat (ban ghi thieu = gia tri "nhu hom nay"): `request.authUser` mang
 * `permissionGrants` de cong van tai tra loi theo tung tai khoan, va `/auth/login` / `/auth/me`
 * mang `mustChangePassword` de man hinh dua nguoi dung sang doi mat khau.
 */
export function toAuthenticatedUser(user: AuthUserRecord): AuthenticatedUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    credentialVersion: user.credentialVersion,
    disabledAt: user.disabledAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
    permissionGrants: sortGrants(user.permissionGrants ?? []),
    mustChangePassword: user.mustChangePassword === true,
    temporaryPasswordExpiresAt: user.temporaryPasswordExpiresAt?.toISOString() ?? null,
    jobTitle: user.jobTitle ?? null,
  };
}

/** Tai khoan nhu man hinh quan tri thay. */
export function toAccountView(user: AuthUserRecord): AccountView {
  return {
    ...toAuthenticatedUser(user),
    mustChangePassword: user.mustChangePassword === true,
    temporaryPasswordExpiresAt: user.temporaryPasswordExpiresAt?.toISOString() ?? null,
    jobTitle: user.jobTitle ?? null,
    permissionGrants: sortGrants(user.permissionGrants ?? []),
    isProtected: isProtectedAccount(user.username),
  };
}
