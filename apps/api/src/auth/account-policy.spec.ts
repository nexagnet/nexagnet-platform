import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FOUNDATION_RESERVED_USERNAMES,
  TEMPORARY_PASSWORD_ALPHABET,
  generateTemporaryPassword,
  isProtectedAccount,
  isReservedUsername,
  isTemporaryPasswordExpired,
  temporaryPasswordExpiry,
  usernameBase,
  usernameCandidate,
} from './account-policy.js';
import { usernameSchema } from './auth.schemas.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('mat khau tam', () => {
  it('16 ky tu tu bang chu khong gay nham, dang xxxx-xxxx-xxxx-xxxx', () => {
    const samples = Array.from({ length: 200 }, () => generateTemporaryPassword());
    for (const sample of samples) {
      expect(sample).toMatch(/^[^-]{4}-[^-]{4}-[^-]{4}-[^-]{4}$/);
      for (const char of sample.replaceAll('-', '')) {
        expect(TEMPORARY_PASSWORD_ALPHABET).toContain(char);
      }
    }
    // Khong co ky tu de nham khi doc qua dien thoai.
    expect(TEMPORARY_PASSWORD_ALPHABET).not.toMatch(/[ilo01]/);
    // Ngau nhien that: 200 lan sinh khong trung nhau.
    expect(new Set(samples).size).toBe(samples.length);
  });

  it('song 72 gio; het han dung luc han (fail-closed khi thieu han)', () => {
    const now = new Date('2026-09-25T00:00:00.000Z');
    const expiresAt = temporaryPasswordExpiry(now);
    expect(expiresAt.toISOString()).toBe('2026-09-28T00:00:00.000Z');
    const pending = { mustChangePassword: true, temporaryPasswordExpiresAt: expiresAt };
    expect(isTemporaryPasswordExpired(pending, new Date('2026-09-27T23:59:59.000Z'))).toBe(false);
    expect(isTemporaryPasswordExpired(pending, expiresAt)).toBe(true);
    expect(
      isTemporaryPasswordExpired(
        { mustChangePassword: true, temporaryPasswordExpiresAt: null },
        now,
      ),
    ).toBe(true);
    expect(isTemporaryPasswordExpired({ mustChangePassword: false }, now)).toBe(false);
  });
});

describe('ten danh cho he thong', () => {
  it('so khop sau khi chuan hoa; ten mien them vao duoc', () => {
    expect(isReservedUsername(' Operator ')).toBe(true);
    expect(isReservedUsername('internal-service')).toBe(true);
    expect(isReservedUsername('demo-seed')).toBe(false);
    expect(isReservedUsername('Demo-Seed', ['demo-seed'])).toBe(true);
    expect(isReservedUsername('operator.2')).toBe(false);
  });

  it('moi ten danh rieng deu la mot ten dang nhap HOP LE (nen moi can chan)', () => {
    for (const name of FOUNDATION_RESERVED_USERNAMES) {
      expect(usernameSchema.safeParse(name).success, name).toBe(true);
    }
  });
});

describe('tai khoan he thong', () => {
  it('doc PROTECTED_ACCOUNT_USERNAMES luc goi, khong phan biet hoa thuong', () => {
    expect(isProtectedAccount('operator')).toBe(false);
    vi.stubEnv('PROTECTED_ACCOUNT_USERNAMES', 'Operator,ops.bot');
    expect(isProtectedAccount('operator')).toBe(true);
    expect(isProtectedAccount('OPS.BOT')).toBe(true);
    expect(isProtectedAccount('giam-doc')).toBe(false);
  });
});

describe('goi y ten dang nhap', () => {
  it.each([
    ['Nguyễn Văn Đức', '', 'nguyen.van.duc'],
    ['Nguyễn Văn Đức', 'lx.', 'lx.nguyen.van.duc'],
    ['  Trần   Thị  Ánh  ', '', 'tran.thi.anh'],
    ['Lê Ngọc Ẩn!!', '', 'le.ngoc.an'],
    ['An', '', 'tk.an'],
    ['@@@', '', 'tai-khoan'],
  ])('%s + "%s" → %s', (name, prefix, expected) => {
    const base = usernameBase(name, prefix);
    expect(base).toBe(expected);
    expect(usernameSchema.safeParse(base).success).toBe(true);
  });

  it('ten rat dai van nam trong gioi han sau khi them hau to', () => {
    const base = usernameBase('Nguyễn '.repeat(40));
    expect(usernameSchema.safeParse(usernameCandidate(base, 49)).success).toBe(true);
    expect(usernameCandidate('a.b', 1)).toBe('a.b');
    expect(usernameCandidate('a.b', 3)).toBe('a.b.3');
  });
});
