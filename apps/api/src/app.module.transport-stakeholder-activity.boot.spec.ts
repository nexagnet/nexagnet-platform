import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOOT_SPAWN_TIMEOUT_MS, BOOT_TEST_TIMEOUT_MS } from './boot-spec-timeout.js';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = resolve(
  apiDir,
  '../../packages/tenant/src/__tests__/fixtures/transport-asset-compliance',
);

/**
 * BE MAT BEN HUU QUAN DOC DUOC HOAT DONG XE — O MUC TIEN TRINH (`#278` N9).
 *
 * ============================================================================================
 * VI SAO BAI NAY TON TAI
 *
 * `StakeholderMaintenanceFactsAdapter` duoc dang ky o GOC (`app-composition.ts`) va tiem
 * `AssetComplianceReadService`. Mot provider dang ky o goc CHI thay phan `exports` cua
 * `TransportAssetComplianceModule`. Hom nay module do co export dich vu ay — nhung neu mot ngay ai
 * do rut no khoi danh sach `exports`, thi:
 *
 *   - `tsc` van xanh (kieu van dung);
 *   - `stakeholder-activity.spec.ts` van xanh (no tu tay dung du lieu, khong qua DI);
 *   - bai composition van xanh (no chi doi chieu DANH SACH ten);
 *   - va tien trinh CHET LUC KHOI DONG o moi khach co bat `transport-asset-compliance`.
 *
 * Do khong phai mot gia dinh: cung mot lop loi da tung xay ra that voi
 * `ControlTowerClaimFactsAdapter`, va chinh mot bai boot bat duoc.
 *
 * ============================================================================================
 * VA NO KHOA LUON HAI DIEU CAM CUA `#278` N9
 *
 * 1. PHAM VI. Bai dung HAI chiec xe va HAI ho so ben huu quan. Nguoi thu nhat chi so huu xe thu
 *    nhat, va bang cua ho phai KHONG chua chiec thu hai — ke ca khi
 *    `InsightCoreFacts.listVehicles()` o duoi tra ve ca hai. Neu ai do bo phep loc trong
 *    `StakeholderActivityService`, bai nay do.
 *
 * 2. SO NGAY NGHI LA THAT. Khach nay CO bat `transport-asset-compliance`, nen `unavailableSources`
 *    phai RONG va cot so ngay nghi phai mang con so that tu mot lenh sua that — khong phai mot
 *    `null` doc y het "khach chua bat tinh nang".
 */
describe('stakeholder activity process boot contract', () => {
  it(
    'boot Nest that, va be mat ben huu quan chi thay hoat dong cua chinh xe minh so huu',
    () => {
      const script = `
      import { NestFactory } from '@nestjs/core';
      const { AppModule } = await import('./src/app.module.ts');
      const { StakeholderVehiclesController } = await import('./src/transport/asset-ownership/stakeholder-vehicles.controller.ts');
      const { StakeholderActivityService } = await import('./src/transport/asset-ownership/stakeholder-activity.service.ts');
      const { AssetOwnershipService } = await import('./src/transport/asset-ownership/asset-ownership.service.ts');
      const { AssetComplianceService } = await import('./src/transport/asset-compliance/asset-compliance.service.ts');
      const { MovementService } = await import('./src/transport/movement/movement.service.ts');
      const { FleetService } = await import('./src/transport/fleet/fleet.service.ts');
      const { UserRepository } = await import('./src/auth/user.repository.ts');

      const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });
      const has = (token) => { try { context.get(token, { strict: false }); return true; } catch { return false; } };

      const fleet = context.get(FleetService, { strict: false });
      const movement = context.get(MovementService, { strict: false });
      const ownership = context.get(AssetOwnershipService, { strict: false });
      const compliance = context.get(AssetComplianceService, { strict: false });
      const activity = context.get(StakeholderActivityService, { strict: false });

      const mine = await fleet.registerVehicle({ registrationPlate: '29H-11111', vehicleClass: 'Dau keo' }, 'boot');
      const other = await fleet.registerVehicle({ registrationPlate: '29H-22222', vehicleClass: 'Dau keo' }, 'boot');

      // HAI ho so, de phep loc pham vi co cai gi that de loc.
      const me = await ownership.createStakeholder({ kind: 'INDIVIDUAL', displayName: 'Co dong A' }, 'boot');
      const them = await ownership.createStakeholder({ kind: 'INDIVIDUAL', displayName: 'Co dong B' }, 'boot');
      // #395: noi tai khoan doi tai khoan CO THAT va dang hoat dong — tao hai tai khoan that (vai
      // Dieu hanh khong quyen rieng = "Chu xe / ben gop von") thay cho hai ma tu dat.
      const users = context.get(UserRepository, { strict: false });
      const accountA = await users.create({ username: 'boot-stakeholder-a', name: 'Co dong A', email: null, phone: null, passwordHash: 'x', role: 'MANAGER' });
      const accountB = await users.create({ username: 'boot-stakeholder-b', name: 'Co dong B', email: null, phone: null, passwordHash: 'x', role: 'MANAGER' });
      await ownership.setStakeholderAccount(me.id, accountA.id, 'boot');
      await ownership.setStakeholderAccount(them.id, accountB.id, 'boot');
      await ownership.recordInterest(mine.id, { stakeholderId: me.id, ownershipBasisPoints: 3000, effectiveFrom: new Date('2026-01-01T00:00:00.000Z') }, 'boot');
      await ownership.recordInterest(other.id, { stakeholderId: them.id, ownershipBasisPoints: 10000, effectiveFrom: new Date('2026-01-01T00:00:00.000Z') }, 'boot');

      const today = new Date().toISOString().slice(0, 10);

      // Vong chay CUA TOI: mot chang co hang, mot chang rong.
      const runMine = await movement.createRun({ code: 'RUN-MINE', vehicleId: mine.id }, 'boot');
      await movement.addLeg(runMine.id, { kind: 'LOADED', originLabel: 'Ha Noi', destinationLabel: 'Hai Phong', businessDate: today, distanceKm: 105 }, 'boot');
      await movement.addLeg(runMine.id, { kind: 'EMPTY', originLabel: 'Hai Phong', destinationLabel: 'Ha Noi', businessDate: today, distanceKm: 105 }, 'boot');

      // Vong chay CUA NGUOI KHAC — km cua no khong duoc phep xuat hien o bang cua toi.
      const runOther = await movement.createRun({ code: 'RUN-OTHER', vehicleId: other.id }, 'boot');
      await movement.addLeg(runOther.id, { kind: 'LOADED', originLabel: 'Ha Noi', destinationLabel: 'Vinh', businessDate: today, distanceKm: 999 }, 'boot');

      // Mot lenh sua THAT tren xe cua toi — mo va dong trong cung mot ngay = MOT ngay.
      const workOrder = await compliance.openWorkOrder({
        vehicleId: mine.id, planId: null, description: 'Thay dau', openedDate: today, openedOdoKm: 1000, openedBy: 'boot',
      });
      await compliance.completeWorkOrder(workOrder.id, { completedDate: today, completedOdoKm: 1000, completedBy: 'boot', completedAt: new Date() });

      const view = await activity.activity(accountA.id);
      const row = view.vehicles[0];

      const proof = {
        stakeholderController: has(StakeholderVehiclesController),
        activityService: has(StakeholderActivityService),
        plates: view.vehicles.map((entry) => entry.registrationPlate),
        loadedKm: row?.loadedKm ?? null,
        emptyKm: row?.emptyKm ?? null,
        totalKm: row?.totalKm ?? null,
        runCount: row?.runCount ?? null,
        activeBusinessDays: row?.activeBusinessDays ?? null,
        downtime: row?.downtime ?? null,
        unavailableSources: view.unavailableSources,
        moneyKeys: Object.keys(row ?? {}).filter((key) => /amount|price|cost|revenue|vnd|money|fee/i.test(key)),
      };
      await context.close();
      process.stdout.write('<<STAKEHOLDER_ACTIVITY_BOOT_PROOF>>' + JSON.stringify(proof));
    `;

      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;
      delete env.DEEPSEEK_API_KEY;
      delete env.FLOWISE_API_KEY;
      delete env.FLOWISE_BASE_URL;
      delete env.FLOWISE_FLOW_ID;
      delete env.ZALO_BOT_TOKEN;
      delete env.TENANT;
      env.TENANT_DIR = fixtureDir;
      env.PERSISTENCE = 'memory';
      env.NODE_ENV = 'test';

      const child = spawnSync(
        process.execPath,
        ['--import', '@swc-node/register/esm-register', '--input-type=module', '--eval', script],
        { cwd: apiDir, env, encoding: 'utf8', timeout: BOOT_SPAWN_TIMEOUT_MS },
      );

      expect(child.status, `${child.stderr}\n${child.stdout}`).toBe(0);
      const proof = child.stdout.split('<<STAKEHOLDER_ACTIVITY_BOOT_PROOF>>')[1];
      expect(proof, `khong tim thay dau moc trong stdout:\n${child.stdout}`).toBeDefined();
      expect(JSON.parse(proof ?? '{}')).toEqual({
        stakeholderController: true,
        activityService: true,
        /* CHI xe cua chinh nguoi dang xem — `29H-22222` khong duoc co mat. */
        plates: ['29H-11111'],
        loadedKm: 105,
        emptyKm: 105,
        totalKm: 210,
        runCount: 1,
        activeBusinessDays: 1,
        /* Khach CO bat bao duong, nen day la con so that chu khong phai `null`. */
        downtime: { workOrderDays: 1, openWorkOrderCount: 0 },
        unavailableSources: [],
        /* Khong mot khoa tien nao duoc phep lot vao mot dong cua be mat nay. */
        moneyKeys: [],
      });
    },
    BOOT_TEST_TIMEOUT_MS,
  );
});
