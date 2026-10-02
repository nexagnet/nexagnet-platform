import { randomInt } from 'node:crypto';
import { loadFoundationEnv } from '../config/foundation-env.js';

/**
 * CHINH SACH TAI KHOAN cua nen tang (`#395`) — ham THUAN (tru doc env), khong DI, khong I/O.
 */

export function normalizeUsername(username: string): string {
  return username.trim().toLocaleLowerCase('en-US');
}

/* ------------------------------------------------------------------ *
 * TEN DANH CHO HE THONG
 * ------------------------------------------------------------------ */

/**
 * Ten dang nhap ma NEN TANG dung lam danh tinh he thong trong so kiem toan (`AuditLog.actor`):
 * mot nguoi that mang mot ten nay se lam so kiem toan noi nham, va phep so tach nhiem theo ten
 * nguoi goi (vd duyet de nghi chi) se nhan nham nguoi.
 *
 * CHI KIEM LUC TAO tai khoan moi (`AuthService.createUser`), tren ten da chuan hoa. KHONG BAO GIO o
 * dang nhap, phien, sua thong tin hay doi quyen: `operator` la tai khoan ADMIN THAT tren gd1-test va
 * moi lan smoke deu dang nhap bang no.
 *
 * Mien them ten cua rieng no qua `PermissionDomain.reservedUsernames()` (vd `demo-seed`) — nen tang
 * khong nhac ten mien nao.
 */
export const FOUNDATION_RESERVED_USERNAMES = [
  'operator',
  'internal-service',
  'system',
  'import',
  'mcp-agent',
  'marketing-form',
] as const;

export function isReservedUsername(username: string, extra: readonly string[] = []): boolean {
  const normalized = normalizeUsername(username);
  return [...FOUNDATION_RESERVED_USERNAMES, ...extra].some(
    (reserved) => normalizeUsername(reserved) === normalized,
  );
}

/* ------------------------------------------------------------------ *
 * TAI KHOAN HE THONG DUOC BAO VE
 * ------------------------------------------------------------------ */

/**
 * `PROTECTED_ACCOUNT_USERNAMES` — tai khoan van hanh luc trien khai (vd nguoi van hanh ma
 * `bootstrap-auth-user.mjs` tao va moi lan smoke dang nhap). Khoa / ha vai / doi quyen / dat lai
 * mat khau tai khoan nay tu man hinh quan tri se lam lan trien khai SAU chet o buoc bootstrap —
 * nen bi tu choi voi `PROTECTED_SERVICE_ACCOUNT`.
 *
 * Doc env LUC GOI (khong chup luc khoi dong): cung khuon moi guard cua nen tang.
 */
export function protectedAccountUsernames(): readonly string[] {
  return loadFoundationEnv().PROTECTED_ACCOUNT_USERNAMES;
}

export function isProtectedAccount(username: string): boolean {
  const normalized = normalizeUsername(username);
  return protectedAccountUsernames().some((name) => normalizeUsername(name) === normalized);
}

/* ------------------------------------------------------------------ *
 * MAT KHAU TAM
 * ------------------------------------------------------------------ */

/** Mat khau tam song 72 gio — du mot cuoi tuan, khong du de thanh mat khau thuong. */
export const TEMPORARY_PASSWORD_TTL_HOURS = 72;

/**
 * Bang chu KHONG GAY NHAM khi doc qua dien thoai hay chep tay: bo `i l o 0 1`. 31 ky tu × 16 vi tri
 * ≈ 79 bit — du cho mot mat khau song 72 gio va chi dung mot lan.
 */
export const TEMPORARY_PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const TEMPORARY_PASSWORD_LENGTH = 16;
const TEMPORARY_PASSWORD_GROUP = 4;

/** `xxxx-xxxx-xxxx-xxxx`, sinh bang `crypto.randomInt` (khong phai `Math.random`). */
export function generateTemporaryPassword(): string {
  const chars = Array.from(
    { length: TEMPORARY_PASSWORD_LENGTH },
    () => TEMPORARY_PASSWORD_ALPHABET[randomInt(TEMPORARY_PASSWORD_ALPHABET.length)]!,
  );
  const groups: string[] = [];
  for (let index = 0; index < chars.length; index += TEMPORARY_PASSWORD_GROUP) {
    groups.push(chars.slice(index, index + TEMPORARY_PASSWORD_GROUP).join(''));
  }
  return groups.join('-');
}

export function temporaryPasswordExpiry(now: Date): Date {
  return new Date(now.getTime() + TEMPORARY_PASSWORD_TTL_HOURS * 60 * 60 * 1_000);
}

/** Tai khoan dang dung mat khau tam DA qua han. */
export function isTemporaryPasswordExpired(
  record: {
    readonly mustChangePassword?: boolean;
    readonly temporaryPasswordExpiresAt?: Date | null;
  },
  now: Date,
): boolean {
  if (record.mustChangePassword !== true) return false;
  const expiresAt = record.temporaryPasswordExpiresAt;
  // CHECK trong DB khong cho `mustChangePassword` ma thieu han; thieu o day = du lieu hong → coi
  // nhu da het han (fail-closed), khong phai mot mat khau tam song mai mai.
  return !expiresAt || expiresAt.getTime() <= now.getTime();
}

/* ------------------------------------------------------------------ *
 * GOI Y TEN DANG NHAP
 * ------------------------------------------------------------------ */

const USERNAME_MIN = 3;
const USERNAME_MAX = 64;

/**
 * Ten nguoi → goc ten dang nhap ASCII: bo dau tieng Viet (`đ` → `d`), chu thuong, cac tu noi bang
 * dau cham. "Nguyễn Văn Đức" + `lx.` → `lx.nguyen.van.duc`. Rong sau khi bo dau → `tai-khoan`.
 */
export function usernameBase(name: string, prefix = ''): string {
  const ascii = name
    .normalize('NFD')
    // Bo moi dau ghep (thanh dieu, mu) sau khi tach — "ễ" → "e".
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLocaleLowerCase('en-US');
  const words = ascii.split(/[^a-z0-9]+/).filter((word) => word.length > 0);
  const slug = words.length > 0 ? words.join('.') : 'tai-khoan';
  const base = `${prefix}${slug}`.slice(0, USERNAME_MAX - 4).replace(/[._-]+$/, '');
  // `usernameSchema` doi toi thieu 3 ky tu: "An" → `tk.an`, khong phai mot ten khong tao duoc.
  return base.length >= USERNAME_MIN ? base : `tk.${base}`;
}

/** Ung vien thu `n` cho mot goc: `goc`, `goc.2`, `goc.3`… */
export function usernameCandidate(base: string, attempt: number): string {
  return attempt <= 1 ? base : `${base}.${attempt}`;
}
