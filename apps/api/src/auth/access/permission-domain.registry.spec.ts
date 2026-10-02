import { describe, expect, it } from 'vitest';
import { USER_ROLES } from '../auth.types.js';
import { grantsOf, type PermissionDomain } from './permission-domain.js';
import { PermissionDomainRegistry } from './permission-domain.registry.js';
import {
  isPlatformPermission,
  PLATFORM_ACCOUNTS_MANAGE,
  platformPermissionCatalog,
  platformPermissionsFor,
} from './platform-permissions.js';

const domain = (id: string): PermissionDomain => ({
  id,
  catalog: () => ({ groups: [], presets: [] }),
  effective: () => [],
  validate: () => [],
  escalated: () => [],
});

describe('PermissionDomainRegistry — mien tu dang ky, nen tang khong biet ten mien', () => {
  it('dang ky roi tra lai dung mien, theo thu tu dang ky', () => {
    const registry = new PermissionDomainRegistry();
    const alpha = domain('alpha');
    const beta = domain('beta');
    registry.register(alpha);
    registry.register(beta);

    expect(registry.all()).toEqual([alpha, beta]);
    expect(registry.get('beta')).toBe(beta);
    expect(registry.get('gamma')).toBeNull();
  });

  it('mot ma mien khai hai lan thi NEM — hai cau tra loi cho mot cau hoi', () => {
    const registry = new PermissionDomainRegistry();
    registry.register(domain('alpha'));
    expect(() => registry.register(domain('alpha'))).toThrow(/da duoc dang ky/);
  });

  it('tien to `platform.` thuoc rieng nen tang', () => {
    expect(() => new PermissionDomainRegistry().register(domain('platform'))).toThrow(/nen tang/);
  });

  it.each(['', 'Alpha', 'a.b', '9x'])('ma mien sai hinh "%s" bi tu choi', (id) => {
    expect(() => new PermissionDomainRegistry().register(domain(id))).toThrow(/khong hop le/);
  });

  it('ma quyen thuoc mien theo tien to — ma la khong thuoc mien nao', () => {
    const registry = new PermissionDomainRegistry();
    const alpha = domain('alpha');
    registry.register(alpha);

    expect(registry.owning('alpha.thing.read')).toBe(alpha);
    expect(registry.owning('beta.thing.read')).toBeNull();
    expect(registry.owning('alpha')).toBeNull();
    expect(registry.owning('.alpha')).toBeNull();
    expect(registry.owning(PLATFORM_ACCOUNTS_MANAGE)).toBeNull();
  });

  it('thieu dong quyen rieng (tai khoan truoc #395) nghia la mang rong', () => {
    expect(grantsOf({ role: 'ACCOUNTING' })).toEqual([]);
    expect(grantsOf({ role: 'ACCOUNTING', permissionGrants: null })).toEqual([]);
  });
});

describe('quyen nen tang', () => {
  it('chi Giam doc (ADMIN) quan tri tai khoan', () => {
    for (const role of USER_ROLES) {
      expect(platformPermissionsFor(role).includes(PLATFORM_ACCOUNTS_MANAGE), role).toBe(
        role === 'ADMIN',
      );
    }
  });

  it('danh muc mang nhan nghiep vu tieng Viet co dau', () => {
    expect(platformPermissionCatalog()).toEqual([
      { code: 'platform.accounts.manage', label: 'Quản trị tài khoản & phân quyền' },
    ]);
    expect(isPlatformPermission(PLATFORM_ACCOUNTS_MANAGE)).toBe(true);
    expect(isPlatformPermission('transport.vehicle.read')).toBe(false);
  });
});
