import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOOT_SPAWN_TIMEOUT_MS, BOOT_TEST_TIMEOUT_MS } from './boot-spec-timeout.js';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/**
 * GOI KHACH THAT, khong phai mot fixture.
 *
 * Moi boot spec khac tro vao mot fixture rieng trong `packages/tenant/src/__tests__/fixtures/`, va
 * do la dung cho cau hoi cua chung: *"mot khach chi bat DUNG capability nay co boot khong"*.
 *
 * Bai nay hoi mot cau khac, va no la cau ma CI da khong hoi bao gio: *"cai stack ma chung ta THUC
 * SU deploy co boot khong"*. Cau tra loi phai doc tu CHINH goi se duoc upload len VM — mot fixture
 * chep tay se troi khoi goi that dung vao ngay ai do them mot capability vao goi ma quen fixture.
 */
const previewTenantDir = resolve(apiDir, '../../tenants/transport-preview');

/**
 * STACK XEM TRUOC VAN TAI PHAI BOOT DUOC — luoi an toan cua CA doi hinh capability van tai.
 *
 * ============================================================================================
 * VI SAO BAI NAY TON TAI: MOT LAN HONG DA DI QUA MOI CONG ROI CHET O DEPLOY
 * ============================================================================================
 *
 * `#268` (Lane I) them `transport-acceptance`, trong do `AcceptanceCounterpartyFactsAdapter` tiem
 * `CounterpartyRepository`. Nhung `TransportModule` khong EXPORT token do, nen Nest khong giai
 * duoc phu thuoc va tien trinh api chet ngay khi khoi dong.
 *
 * Khong mot cong nao bat duoc:
 *
 *   · `tsc`                   — kieu dung het, DI khong phai chuyen cua trinh bien dich;
 *   · bo test don vi          — dung lop truc tiep, khong qua injector cua Nest;
 *   · `*.composition.spec.ts` — chi hoi "provider/controller co TRONG DANH SACH khong", khong hoi
 *                               "Nest co RESOLVE duoc chung khong";
 *   · cac boot spec dang co   — khong cai nao bat `transport-acceptance`.
 *
 * No lo ra o lan deploy dau tien SAU khi #268 vao `main`: `ROLLOUT` PASS (image len dung), roi
 * `HEALTH` FAIL vi container api crash-loop. Do la mot vong deploy 12 phut de biet mot dieu ma
 * mot lan `NestFactory.createApplicationContext()` biet trong 30 giay.
 *
 * ============================================================================================
 * BAI NAY CHAY MOT TIEN TRINH THAT, VA DO LA CA DIEM
 * ============================================================================================
 *
 * Ba loai loi chi lo ra o lan boot that: mot token thieu provider (dung cai vua ke tren), mot phu
 * thuoc vong, va mot module doi bien moi truong ma goi khach nay khong khai. Khong loai nao trong
 * ba nhin thay duoc tu `buildAppComposition()`.
 */
describe('transport-preview process boot contract', () => {
  it(
    'goi xem truoc van tai boot duoc voi TOAN BO doi hinh capability cua no',
    () => {
      const script = `
      import { NestFactory } from '@nestjs/core';
      const { AppModule } = await import('./src/app.module.ts');
      const { loadTenantConfig } = await import('@netviet/tenant');
      const { CommercialAcceptanceService } = await import('./src/transport/acceptance/acceptance.service.ts');
      const { PlanningService } = await import('./src/transport/planning/planning.service.ts');
      const { MovementService } = await import('./src/transport/movement/movement.service.ts');
      const { FuelConsumptionController } = await import('./src/transport/fuel/fuel-consumption.controller.ts');
      const { TransportPlacesController } = await import('./src/transport/places/places.controller.ts');
      const { TransportPlaceSearchPort } = await import('./src/transport/places/place-search.port.ts');
      const { TransportPlaceService } = await import('./src/transport/places/place.service.ts');
      const { KnownPlacesFacts } = await import('./src/transport/places/known-places.port.ts');
      const { DriverAccountLinkService } = await import('./src/transport/fleet/driver-account-link.service.ts');
      const { PermissionDomainRegistry } = await import('./src/auth/access/permission-domain.registry.ts');
      const { GeofenceService } = await import('./src/transport/proof/geofence.service.ts');
      const { PlaceAdminController } = await import('./src/transport/places/admin/place-admin.controller.ts');
      const { PlaceAdminService } = await import('./src/transport/places/admin/place-admin.service.ts');

      const capabilities = loadTenantConfig().capabilities;
      const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });
      const has = (token) => { try { context.get(token, { strict: false }); return true; } catch { return false; } };
      // Doc dia diem da biet QUA injector that: adapter o goc tiem hai token cua hai module khac
      // (GeofenceRepository, CounterpartySiteService) — dung kieu tiem chi boot that bat duoc.
      const knownPlaces = await context.get(TransportPlaceService, { strict: false }).known();

      // #395: goi xem truoc KHONG con khai bai xe trong cau hinh. Bai xe la hang rao DEPOT: truoc khi
      // khai, khau lap ke hoach noi NOT_CONFIGURED tu cau hinh; khai mot bai (qua route cu, cung
      // duong ghi voi man Dia diem van hanh) thi CHINH khau lap ke hoach doc no — nguon MANAGED. Dong
      // nay chung minh transport-proof da dang ky nguon quan ly vao cho noi cua transport-core qua
      // injector that (dang ky trong ham dung — khong bai composition nao thay duoc).
      const planningService = context.get(PlanningService, { strict: false });
      const depotBefore = (await planningService.describePolicy()).depot;
      await context.get(GeofenceService, { strict: false }).register({
        label: 'Boot bai xe', subjectKind: 'DEPOT', subjectId: 'DEPOT-BOOT',
        latitude: 20.9652, longitude: 105.8468, radiusMetres: 250, note: null, recordedBy: 'boot',
      });
      const depotAfter = (await planningService.describePolicy()).depot;
      const adminPlaces = await context.get(PlaceAdminService, { strict: false }).list();
      // #395 §2.1: Tao don doc NHAN LOAI tu may chu — adapter o goc tiem them CounterpartyRepository
      // (export cua TransportModule) de biet dia diem nao la cua khach hang.
      const knownAfter = (await context.get(TransportPlaceService, { strict: false }).known()).places;

      const proof = {
        capabilityCount: capabilities.length,
        // Ba dich vu nay la ba tang phu thuoc khac nhau cua cay van tai: mien loi (Lane A),
        // lop lap ke hoach doc mien loi (Lane L), va mot capability RIENG doc nguoc vao mien loi
        // qua mot cong (Lane I). Cai thu ba la cai da hong.
        movement: has(MovementService),
        planning: has(PlanningService),
        acceptance: has(CommercialAcceptanceService),
        // Controller dang ky o GOC doc mot service cua \`TransportFuelModule\` — dung kieu hong ma
        // chi mot lan boot that bat duoc (#313).
        fuelConsumption: has(FuelConsumptionController),
        // Tim dia diem (#379): controller o goc + cong tim kiem (transport-core) + so hang rao
        // (transport-proof, goi nay co bat).
        placesController: has(TransportPlacesController),
        placeSearchPort: has(TransportPlaceSearchPort),
        knownPlacesFacts: has(KnownPlacesFacts),
        knownPlacesAvailable: knownPlaces.available,
        // #395 S2: route noi tai khoan lai xe (controller o goc tiem dich vu nay) va mien phan quyen
        // \`transport\` doc duoc lien ket tai khoan tren CHINH doi hinh se deploy.
        accountLinkService: has(DriverAccountLinkService),
        transportDomainReadsLinks:
          typeof context.get(PermissionDomainRegistry, { strict: false }).get('transport')?.describeScopes ===
          'function',
        depotBefore: depotBefore.kind + '/' + depotBefore.source,
        depotAfter: depotAfter.kind + '/' + depotAfter.source,
        depotCodeAfter: depotAfter.kind === 'RESOLVED' ? depotAfter.depot.code : null,
        placeAdminController: has(PlaceAdminController),
        adminDepotStatus: adminPlaces.map((place) => place.kindLabel + '/' + (place.depot ? place.depot.plannerStatus : '-')),
        knownPlacesAfter: knownAfter.map((place) => place.kindLabel + '/' + place.name),
      };
      await context.close();
      process.stdout.write('<<PREVIEW_BOOT_PROOF>>' + JSON.stringify(proof));
    `;

      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;
      delete env.DEEPSEEK_API_KEY;
      delete env.ZALO_BOT_TOKEN;
      delete env.TENANT;
      env.TENANT_DIR = previewTenantDir;
      env.PERSISTENCE = 'memory';
      env.NODE_ENV = 'test';

      const child = spawnSync(
        process.execPath,
        ['--import', '@swc-node/register/esm-register', '--input-type=module', '--eval', script],
        { cwd: apiDir, env, encoding: 'utf8', timeout: BOOT_SPAWN_TIMEOUT_MS },
      );

      expect(child.status, `${child.stderr}\n${child.stdout}`).toBe(0);
      const proof = child.stdout.split('<<PREVIEW_BOOT_PROOF>>')[1];
      expect(proof, `khong tim thay dau moc trong stdout:\n${child.stdout}`).toBeDefined();

      const parsed = JSON.parse(proof ?? '{}');
      expect(parsed.movement).toBe(true);
      expect(parsed.planning).toBe(true);
      // Dong nay la ly do bai test ton tai. Xem khoi chu thich dau tep.
      expect(parsed.acceptance).toBe(true);
      expect(parsed.fuelConsumption).toBe(true);
      expect(parsed.placesController).toBe(true);
      expect(parsed.placeSearchPort).toBe(true);
      expect(parsed.knownPlacesFacts).toBe(true);
      expect(parsed.knownPlacesAvailable).toBe(true);
      expect(parsed.accountLinkService).toBe(true);
      expect(parsed.transportDomainReadsLinks).toBe(true);
      // #395: mot nguon bai xe — man Dia diem van hanh. Xem khoi chu thich trong script.
      expect(parsed.depotBefore).toBe('NOT_CONFIGURED/TENANT_CONFIG');
      expect(parsed.depotAfter).toBe('RESOLVED/MANAGED');
      expect(parsed.depotCodeAfter).toBe('DEPOT-BOOT');
      expect(parsed.placeAdminController).toBe(true);
      expect(parsed.adminDepotStatus).toEqual(['Bãi xe/IN_USE']);
      expect(parsed.knownPlacesAfter).toEqual(['Bãi xe/Boot bai xe']);
      // Goi that co 11 capability; con so chi de bai noi ra rang no dang boot MOT DOI HINH DAY DU,
      // khong phai mot goi rong tinh co xanh.
      expect(parsed.capabilityCount).toBeGreaterThanOrEqual(10);
    },
    BOOT_TEST_TIMEOUT_MS,
  );
});
