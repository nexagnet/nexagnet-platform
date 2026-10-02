import { resetTenantCache } from '@netviet/tenant';
import { beforeEach, describe, expect, it } from 'vitest';
import { PermissionDomainRegistry } from '../../auth/access/permission-domain.registry.js';
import { InMemoryAssetOwnershipRepository } from '../asset-ownership/asset-ownership.repository.js';
import { loadDemoMonthDataset } from '../demo/demo-dataset.js';
import { DEMO_STAFF_PERSONAS } from '../demo/demo-logins.js';
import { DEMO_SEED_ACTOR } from '../demo/demo-seed.js';
import { TransportAccountLinkDirectory } from '../fleet/account-link-directory.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { actionsForRole } from '../transport-actions.js';
import { transportPermissionCatalog } from './transport-permission-catalog.js';
import {
  TRANSPORT_DRIVER_SCOPE_ID,
  TRANSPORT_RESERVED_USERNAMES,
  TRANSPORT_STAKEHOLDER_SCOPE_ID,
  TransportPermissionDomainRegistrar,
  transportPermissionDomain,
} from './transport-permission-domain.js';

/** Chay `run` duoi mot goi khach, roi tra lai dung moi truong cu (tep khac cung tien trinh can no). */
function withTenant<T>(slug: string, run: () => T): T {
  const previous = { tenant: process.env.TENANT, dir: process.env.TENANT_DIR };
  process.env.TENANT = slug;
  delete process.env.TENANT_DIR;
  resetTenantCache();
  try {
    return run();
  } finally {
    if (previous.tenant === undefined) delete process.env.TENANT;
    else process.env.TENANT = previous.tenant;
    if (previous.dir === undefined) delete process.env.TENANT_DIR;
    else process.env.TENANT_DIR = previous.dir;
    resetTenantCache();
  }
}

describe('mien phan quyen `transport` (#395)', () => {
  it('tu dang ky vao so cua nen tang trong ham dung', () => {
    const registry = new PermissionDomainRegistry();
    new TransportPermissionDomainRegistrar(registry);
    expect(registry.get('transport')?.id).toBe('transport');
    expect(registry.owning('transport.vehicle.read')?.id).toBe('transport');
    // Mot TransportModule thu hai (loi composition) lo ngay, khong am tham ghi de.
    expect(() => new TransportPermissionDomainRegistrar(registry)).toThrow(/da duoc dang ky/);
  });

  it('noi dung quy tac thuan va danh muc', () => {
    const domain = transportPermissionDomain();
    expect(domain.catalog()).toBe(transportPermissionCatalog());
    expect(domain.effective({ role: 'ACCOUNTING' })).toEqual(actionsForRole('ACCOUNTING'));
    expect(
      domain
        .validate({
          role: 'ADMIN',
          grants: [{ permission: 'transport.trip.read', effect: 'DENY' }],
          confirmEscalation: false,
        })
        .map((violation) => violation.code),
    ).toEqual(['ADMIN_PRESET_IS_FULL']);
    expect(
      domain.escalated('MANAGER', [{ permission: 'transport.trip.cancel', effect: 'ALLOW' }]),
    ).toEqual(['transport.trip.cancel']);
  });

  it('danh tinh he thong cua mien: `demo-seed` — dung ten ma may gieo ghi vao nhat ky', () => {
    withTenant('ultty', () => {
      const domain = transportPermissionDomain();
      expect(domain.reservedUsernames?.()).toEqual(['demo-seed']);
    });
    expect(TRANSPORT_RESERVED_USERNAMES).toContain(DEMO_SEED_ACTOR);
  });

  /**
   * May gieo noi tai khoan lai xe mau THEO TEN o moi lan khoi dong, va lenh xoa-gieo-lai xoa tai
   * khoan THEO TEN. Giam doc tao `lx.binh` cho mot nguoi that tren goi mau thi nguoi do se lang le
   * nhan pham vi cua lai xe mau Binh (`#395`). Nen tren goi mau moi ten nhan vat mau bi giu lai.
   */
  it('goi mau: moi ten nhan vat mau (lai xe + van phong) bi giu lai; goi that: khong', () => {
    const reserved = withTenant('transport-preview', () => {
      const logins = loadDemoMonthDataset().drivers.map((driver) => driver.login);
      const names = transportPermissionDomain().reservedUsernames?.() ?? [];
      return { logins, names };
    });
    expect(reserved.logins.length).toBeGreaterThan(0);
    expect(reserved.names).toEqual(
      expect.arrayContaining([
        'demo-seed',
        ...reserved.logins,
        ...DEMO_STAFF_PERSONAS.map((persona) => persona.login),
      ]),
    );
    expect(withTenant('ultty', () => transportPermissionDomain().reservedUsernames?.())).toEqual([
      'demo-seed',
    ]);
  });

  it('khong co danh ba lien ket thi chi co phan thuan', () => {
    const domain = transportPermissionDomain();
    expect(domain.checkAccessChange).toBeUndefined();
    expect(domain.describeScopes).toBeUndefined();
  });

  it('pham vi mang `id` cua nhom KHONG cap duoc trong danh muc ma no mo ra', () => {
    const ungrantable = transportPermissionCatalog()
      .groups.filter((group) => !group.grantable)
      .map((group) => group.id);
    expect(ungrantable).toEqual(
      expect.arrayContaining([TRANSPORT_DRIVER_SCOPE_ID, TRANSPORT_STAKEHOLDER_SCOPE_ID]),
    );
  });
});

describe('mien `transport` doc lien ket tai khoan (#395 S2)', () => {
  let fleet: InMemoryFleetRepository;
  let ownership: InMemoryAssetOwnershipRepository;
  let registry: PermissionDomainRegistry;

  const domain = () => {
    const found = registry.get('transport');
    if (!found) throw new Error('mien chua dang ky');
    return found;
  };

  const linkedDriver = async (authUserId: string, status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') =>
    fleet.createDriver({
      fullName: 'Nguyễn Văn An',
      phone: '0900000001',
      licenceClass: 'C',
      licenceExpiry: '2029-01-01',
      status,
      authUserId,
    });

  beforeEach(() => {
    fleet = new InMemoryFleetRepository();
    ownership = new InMemoryAssetOwnershipRepository();
    registry = new PermissionDomainRegistry();
    new TransportPermissionDomainRegistrar(
      registry,
      new TransportAccountLinkDirectory(fleet, ownership),
    );
  });

  it('doi vai mot tai khoan dang noi ho so lai xe sang vai khac: `ACCOUNT_LINKED_TO_DRIVER`', async () => {
    const driver = await linkedDriver('user-lx');
    const check = domain().checkAccessChange;
    expect(check).toBeDefined();

    for (const toRole of ['ACCOUNTING', 'MANAGER', 'ADMIN'] as const) {
      expect(await check?.({ userId: 'user-lx', fromRole: 'SALE', toRole }), toRole).toEqual([
        {
          code: 'ACCOUNT_LINKED_TO_DRIVER',
          detail: { driverId: driver.id, fromRole: 'SALE', toRole },
        },
      ]);
    }
    // Van la Lai xe: khong pha gi.
    expect(await check?.({ userId: 'user-lx', fromRole: 'SALE', toRole: 'SALE' })).toEqual([]);
    // Tai khoan khong noi ho so lai xe nao: doi vai tu do.
    expect(await check?.({ userId: 'user-khac', fromRole: 'SALE', toRole: 'ADMIN' })).toEqual([]);
  });

  it('tai khoan van phong CON noi ho so lai xe (du lieu cu): moi lan sua quyen deu bi chan', async () => {
    await linkedDriver('user-cu');
    const violations = await domain().checkAccessChange?.({
      userId: 'user-cu',
      fromRole: 'MANAGER',
      toRole: 'MANAGER',
    });
    expect(violations?.map((violation) => violation.code)).toEqual(['ACCOUNT_LINKED_TO_DRIVER']);
  });

  it('mo ta pham vi lai xe: ten, so dien thoai, xe dang phu trach', async () => {
    const driver = await linkedDriver('user-lx');
    const vehicle = await fleet.createVehicle({
      registrationPlate: '29C-123.45',
      vehicleClass: 'Xe tai',
    });
    await fleet.assignDriverToVehicle(vehicle.id, driver.id, new Date('2026-09-01T00:00:00Z'));

    expect(await domain().describeScopes?.('user-lx')).toEqual([
      {
        id: TRANSPORT_DRIVER_SCOPE_ID,
        label: 'Hồ sơ lái xe',
        active: true,
        sentence:
          'Nối với hồ sơ lái xe Nguyễn Văn An (0900000001), đang phụ trách xe 29C-123.45 — làm được việc của chính lái xe này.',
        subject: { id: driver.id, name: 'Nguyễn Văn An' },
      },
    ]);
  });

  /**
   * May chu KHONG hoi trang thai ho so tren duong "viec cua chinh lai xe" — chi hoi co noi hay
   * khong. Bang "lam duoc gi" noi "khong lam duoc gi" o day la noi doi Giam doc: tai khoan van gui
   * duoc de nghi thanh toan. Pham vi van hieu luc, va cau canh bao cach dong no.
   */
  it('ho so lai xe da ngung ma con noi: pham vi VAN hieu luc (dung nhu may chu), cau canh bao', async () => {
    await linkedDriver('user-nghi', 'INACTIVE');
    const [scope] = (await domain().describeScopes?.('user-nghi')) ?? [];
    expect(scope?.active).toBe(true);
    expect(scope?.sentence).toContain('đang ngừng hoạt động');
    expect(scope?.sentence).toContain('vẫn làm được việc của chính lái xe này');
    expect(scope?.sentence).toContain('gỡ nối hồ sơ hoặc khoá tài khoản');
  });

  it('mo ta pham vi ben gop von; khong lien ket nao thi mang rong', async () => {
    const holder = await ownership.createStakeholder({
      kind: 'PERSON',
      displayName: 'Chủ xe Bình',
    });
    await ownership.setStakeholderAccount(holder.id, 'user-chu-xe');

    expect(await domain().describeScopes?.('user-chu-xe')).toEqual([
      {
        id: TRANSPORT_STAKEHOLDER_SCOPE_ID,
        label: 'Hồ sơ bên góp vốn',
        active: true,
        sentence: 'Nối với hồ sơ bên góp vốn Chủ xe Bình — xem được các xe mình có cổ phần.',
        subject: { id: holder.id, name: 'Chủ xe Bình' },
      },
    ]);
    expect(await domain().describeScopes?.('user-khong-lien-ket')).toEqual([]);
  });
});
