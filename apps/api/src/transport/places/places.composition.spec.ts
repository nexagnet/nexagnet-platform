import { describe, expect, it } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { CounterpartyRepository } from '../counterparty/counterparty.repository.js';
import { DepotOpenWorkReader } from '../planning/depot-open-work.js';
import { PlaceWriteStore } from '../proof/place-write.store.js';
import { TransportProofModule } from '../proof/transport-proof.module.js';
import { TransportModule } from '../transport.module.js';
import { PlaceAdminService } from './admin/place-admin.service.js';
import { TransportPlacesRegistrar } from './admin/place-registrations.js';
import { KnownPlacesFactsAdapter } from './known-places.port.js';
import { TRANSPORT_PLACE_ADMIN_DECISIONS } from './place-admin-decisions.js';
import { TRANSPORT_PLACE_DECISIONS } from './place-decisions.js';

const controllerNames = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).controllers.map((controller) => controller.name);

const providerTokens = (capabilities: Parameters<typeof buildAppComposition>[0]): string[] =>
  buildAppComposition(capabilities).providers.map((provider) =>
    typeof provider === 'function'
      ? provider.name
      : typeof provider.provide === 'function'
        ? provider.provide.name
        : String(provider.provide),
  );

describe('composition cua be mat tim dia diem', () => {
  /**
   * Den cung `transport-core` — tao don la viec cua capability loi, va tim diem lay/giao la mot
   * phan cua tao don. KHONG mot capability moi (`CapabilityId` la enum dong).
   */
  it('controller, cong tim kiem va dich vu co mat o khach chi bat `transport-core`', () => {
    expect(controllerNames(['transport-core'])).toContain('TransportPlacesController');
    const tokens = providerTokens(['transport-core']);
    expect(tokens).toContain('TransportPlaceSearchPort');
    expect(tokens).toContain('TransportPlaceService');
  });

  it('khong co mat o khach khong dung van tai', () => {
    expect(controllerNames(['knowledge'])).not.toContain('TransportPlacesController');
    expect(providerTokens(['knowledge'])).not.toContain('TransportPlaceSearchPort');
  });

  /**
   * So hang rao thuoc `transport-proof`: cong dia diem da biet den va di CUNG capability do. Neu
   * adapter van dang ky khi `transport-proof` tat, dich vu se khong bao gio nhan `undefined` va
   * man hinh khong phan biet duoc "chua co so" voi "so rong".
   */
  it('cong dia diem da biet chi ton tai khi bat `transport-proof`', () => {
    expect(providerTokens(['transport-core'])).not.toContain('KnownPlacesFacts');
    expect(providerTokens(['transport-core', 'transport-proof'])).toContain('KnownPlacesFacts');
  });

  it('tu vung quyet dinh: mot diem `place.lookup`, chu so huu rieng', () => {
    expect(TRANSPORT_PLACE_DECISIONS.owner).toBe('transport-places');
    expect(TRANSPORT_PLACE_DECISIONS.points).toEqual(['place.lookup']);
    expect(Object.keys(TRANSPORT_PLACE_DECISIONS.labels).sort()).toEqual(
      [
        'PLACE_LOOKUP_BUSY',
        'PLACE_LOOKUP_DISABLED',
        'PLACE_LOOKUP_FROM_CACHE',
        'PLACE_LOOKUP_FROM_PROVIDER',
        'PLACE_LOOKUP_UNAVAILABLE',
      ].sort(),
    );
  });
});

/**
 * MAN "DIA DIEM VAN HANH" (`#395`) — di cung `transport-proof` (so hang rao la cua capability do).
 *
 * Hai cho noi cua `transport-core` (`DepotDirectoryHub`, `CounterpartySitePlaceGuardHub`) duoc dang
 * ky TRONG `TransportProofModule` (ham dung cua `TransportPlacesRegistrar`), khong o danh sach goc —
 * nen bai nay doc metadata cua module. Bai boot `app.module.transport-preview.boot.spec.ts` chung
 * minh lan dang ky do that su chay (`describePolicy().depot.source === 'MANAGED'`).
 */
describe('composition cua man dia diem van hanh (#395)', () => {
  const metadata = (module: object, key: 'providers' | 'exports'): unknown[] =>
    (Reflect.getMetadata(key, module) as unknown[] | undefined) ?? [];
  const tokenOf = (entry: unknown): unknown =>
    typeof entry === 'object' && entry !== null && 'provide' in entry
      ? (entry as { provide: unknown }).provide
      : entry;

  it('controller co mat khi bat `transport-proof`, vang mat o khach chi bat `transport-core`', () => {
    expect(controllerNames(['transport-core', 'transport-proof'])).toContain(
      'PlaceAdminController',
    );
    expect(controllerNames(['transport-core'])).not.toContain('PlaceAdminController');
  });

  it('TransportProofModule cung cap kho ghi, dich vu, va lop dang ky; export dich vu cho controller goc', () => {
    const providers = metadata(TransportProofModule, 'providers').map(tokenOf);
    expect(providers).toEqual(
      expect.arrayContaining([PlaceWriteStore, PlaceAdminService, TransportPlacesRegistrar]),
    );
    expect(metadata(TransportProofModule, 'exports')).toContain(PlaceAdminService);
  });

  it('transport-core export cong doc viec dang mo tai bai xe', () => {
    expect(metadata(TransportModule, 'exports')).toContain(DepotOpenWorkReader);
  });

  /**
   * Adapter "dia diem da biet" dang ky o GOC: moi thu no tiem PHAI la export cua mot module — ke ca
   * `CounterpartyRepository` them o `#395` de gan nhan "Địa điểm khách hàng". Thieu export thi tien
   * trinh api chet luc khoi dong (boot spec transport-preview bat duoc; bai nay chi ro VI SAO).
   */
  it('adapter dia diem da biet chi tiem token duoc export', () => {
    const params = (Reflect.getMetadata('design:paramtypes', KnownPlacesFactsAdapter) ??
      []) as unknown[];
    const exported = [
      ...metadata(TransportModule, 'exports'),
      ...metadata(TransportProofModule, 'exports'),
    ];
    expect(params).toContain(CounterpartyRepository);
    expect(params.filter((token) => !exported.includes(token))).toEqual([]);
  });

  it('tu vung quyet dinh rieng: mot diem `place.write`, chu so huu rieng', () => {
    expect(TRANSPORT_PLACE_ADMIN_DECISIONS.owner).toBe('transport-places-admin');
    expect(TRANSPORT_PLACE_ADMIN_DECISIONS.points).toEqual(['place.write']);
  });
});
