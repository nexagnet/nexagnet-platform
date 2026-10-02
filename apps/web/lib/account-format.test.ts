import { describe, expect, it } from 'vitest';
import {
  customGrantCount,
  isNeverLoggedIn,
  relativeLastLogin,
  roleChangeNeedsConfirmation,
} from './account-format';

/**
 * `#395` — cau hoi CO KIEU dung chung cho `/settings` va "Tài khoản & quyền": man hinh khong duoc so
 * chuoi hien thi ("Chưa đăng nhập") de biet mot su that, va doi vai bang duong cu phai hoi truoc khi
 * xoa quyen rieng.
 */

describe('chua dang nhap lan nao', () => {
  it('khong co moc hoac moc hong → dung; co moc → sai (khong phu thuoc cau hien thi)', () => {
    expect(isNeverLoggedIn(null)).toBe(true);
    expect(isNeverLoggedIn(undefined)).toBe(true);
    expect(isNeverLoggedIn('khong-phai-ngay')).toBe(true);
    expect(isNeverLoggedIn('2026-09-24T09:00:00.000Z')).toBe(false);
    // Cau hien thi van nhu cu.
    expect(relativeLastLogin('khong-phai-ngay', new Date())).toBe('Chưa đăng nhập');
  });
});

describe('doi vai o /settings xoa quyen rieng — phai hoi truoc (#395)', () => {
  const grants = [
    { permission: 'transport.fleet.manage', effect: 'ALLOW' as const },
    { permission: 'transport.fuel.review', effect: 'DENY' as const },
  ];

  it('tai khoan CO quyen rieng: doi sang bat ky vai nao cung hoi truoc', () => {
    const manager = { role: 'MANAGER' as const, permissionGrants: grants };
    expect(customGrantCount(manager)).toBe(2);
    expect(roleChangeNeedsConfirmation(manager, 'ACCOUNTING')).toBe(true);
    expect(roleChangeNeedsConfirmation(manager, 'SALE')).toBe(true);
  });

  it('khong quyen rieng (hoac may chu cu khong tra truong): doi thang, tru len Quan tri', () => {
    const plain = { role: 'SALE' as const, permissionGrants: [] };
    expect(roleChangeNeedsConfirmation(plain, 'MANAGER')).toBe(false);
    expect(roleChangeNeedsConfirmation({ role: 'SALE' as const }, 'ACCOUNTING')).toBe(false);
    expect(customGrantCount({})).toBe(0);
    expect(roleChangeNeedsConfirmation(plain, 'ADMIN')).toBe(true);
  });

  it('chon lai CHINH vai dang co thi khong co gi de hoi', () => {
    expect(
      roleChangeNeedsConfirmation(
        { role: 'MANAGER' as const, permissionGrants: grants },
        'MANAGER',
      ),
    ).toBe(false);
  });
});
