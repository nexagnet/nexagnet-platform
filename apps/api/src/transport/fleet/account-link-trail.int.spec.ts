import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLogService, type AppendAuditLogCommand } from '../../audit/audit-log.service.js';
import { PrismaAuditLogRepository } from '../../audit/prisma-audit-log.repository.js';
import { PrismaUserRepository } from '../../auth/prisma-user.repository.js';
import { PrismaService } from '../../config/prisma.service.js';
import { AssetOwnershipService } from '../asset-ownership/asset-ownership.service.js';
import { FleetVehicleOwnershipAdapter } from '../asset-ownership/fleet-vehicle-ownership.adapter.js';
import { PrismaAssetOwnershipRepository } from '../asset-ownership/prisma-asset-ownership.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import { DriverAccountLinkService } from './driver-account-link.service.js';
import { PrismaFleetRepository } from './prisma-fleet.repository.js';

/**
 * NOI TAI KHOAN tren POSTGRES THAT (`#395`) — hai dieu kho bo nho khong chung minh duoc:
 *
 *   · dau vet `account_link` / `account_unlink` nam trong CUNG giao dich voi lan noi: so kiem toan
 *     hong thi lan noi lui theo (truoc day: da noi ma khong dong nao noi ai noi);
 *   · hai lan noi CUNG mot tai khoan vao hai ho so ben gop von dua nhau: unique cua Postgres thanh
 *     `ASSET_STAKEHOLDER_ACCOUNT_TAKEN` (409), khong phai mot P2002 tho thanh 500.
 *
 * Moi fixture mang tien to `it395link` va duoc xoa CUNG o `afterAll` (ca dong kiem toan cua chung).
 */

const PREFIX = 'it395link';
const ACTOR = `${PREFIX}.giam-doc`;
const PHONE = '0395395';
/** Chuoi bam gia — khong mot mat khau nao nam trong ma nguon. */
const UNUSABLE_HASH = `khong-dang-nhap-duoc:${randomBytes(8).toString('hex')}`;

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'noi tai khoan tren Postgres THAT (#395)',
  { timeout: 60_000 },
  () => {
    const prisma = new PrismaService();
    const fleet = new PrismaFleetRepository(prisma);
    const users = new PrismaUserRepository(prisma);
    const ownershipRepo = new PrismaAssetOwnershipRepository(prisma);

    /** Hong DUNG MOT lan o dong dau vet co `action` nay, roi binh thuong. */
    const flakyAudit = (action: string): AuditLogService => {
      let failNext = true;
      class FlakyAudit extends AuditLogService {
        override entryFor(command: AppendAuditLogCommand) {
          if (failNext && command.action === action) {
            failNext = false;
            throw new Error('so kiem toan tam hong');
          }
          return super.entryFor(command);
        }
      }
      return new FlakyAudit(new PrismaAuditLogRepository(prisma));
    };
    const audit = new AuditLogService(new PrismaAuditLogRepository(prisma));

    async function cleanup(): Promise<void> {
      const accounts = await prisma.user.findMany({
        where: { username: { startsWith: PREFIX } },
        select: { id: true },
      });
      const drivers = await prisma.transportDriver.findMany({
        where: { phone: { startsWith: PHONE } },
        select: { id: true },
      });
      const holders = await prisma.transportAssetStakeholder.findMany({
        where: { displayName: { startsWith: PREFIX } },
        select: { id: true },
      });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actor: ACTOR },
            { entityId: { in: [...drivers, ...holders, ...accounts].map((row) => row.id) } },
          ],
        },
      });
      await prisma.transportDriver.deleteMany({ where: { id: { in: drivers.map((d) => d.id) } } });
      await prisma.transportAssetStakeholder.deleteMany({
        where: { id: { in: holders.map((h) => h.id) } },
      });
      await prisma.user.deleteMany({ where: { id: { in: accounts.map((a) => a.id) } } });
    }

    const account = (name: string, role: 'SALE' | 'MANAGER') =>
      prisma.user.create({
        data: { username: `${PREFIX}.${name}`, name, passwordHash: UNUSABLE_HASH, role },
      });
    const auditActions = async (entityId: string): Promise<string[]> =>
      (
        await prisma.auditLog.findMany({
          where: { entityId, actor: ACTOR },
          select: { action: true },
        })
      )
        .map((row) => row.action)
        .sort();

    beforeAll(async () => {
      await cleanup();
    });

    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    it('noi ho so lai xe: so kiem toan hong -> KHONG noi; thu lai thi noi VA co dau vet', async () => {
      const login = await account('lai.xe', 'SALE');
      const driver = await fleet.createDriver({
        fullName: `${PREFIX} Lai xe`,
        phone: `${PHONE}001`,
        licenceClass: 'C',
        licenceExpiry: '2030-01-01',
      });
      const service = new DriverAccountLinkService(
        fleet,
        users,
        flakyAudit('transport.driver.account_link'),
      );

      await expect(service.setDriverAccount(driver.id, login.id, ACTOR)).rejects.toThrow(
        'so kiem toan tam hong',
      );
      expect((await fleet.findDriver(driver.id))?.authUserId).toBeNull();
      expect(await auditActions(driver.id)).toEqual([]);

      await service.setDriverAccount(driver.id, login.id, ACTOR);
      expect((await fleet.findDriver(driver.id))?.authUserId).toBe(login.id);
      expect(await auditActions(driver.id)).toEqual(['transport.driver.account_link']);
    });

    it('ben gop von: doi X -> Y ghi ro ai mat ai duoc; so kiem toan hong -> KHONG doi', async () => {
      const x = await account('chu.x', 'MANAGER');
      const y = await account('chu.y', 'MANAGER');
      const vehicles = new FleetVehicleOwnershipAdapter(fleet);
      const holder = await new AssetOwnershipService(
        ownershipRepo,
        vehicles,
        audit,
        undefined,
        users,
      ).createStakeholder({ kind: 'PERSON', displayName: `${PREFIX} Chu xe` }, ACTOR);
      const flaky = new AssetOwnershipService(
        ownershipRepo,
        vehicles,
        flakyAudit('transport.asset_stakeholder.account_link'),
        undefined,
        users,
      );

      await expect(flaky.setStakeholderAccount(holder.id, x.id, ACTOR)).rejects.toThrow(
        'so kiem toan tam hong',
      );
      expect(await ownershipRepo.linkedAccountOf(holder.id)).toBeNull();

      await flaky.setStakeholderAccount(holder.id, x.id, ACTOR);
      await flaky.setStakeholderAccount(holder.id, y.id, ACTOR);

      const rows = await prisma.auditLog.findMany({
        where: { entityId: holder.id, action: 'transport.asset_stakeholder.account_link' },
        select: { before: true, after: true },
      });
      expect(
        rows.map((row) => [
          (row.before as { authUserId?: unknown }).authUserId,
          (row.after as { authUserId?: unknown }).authUserId,
        ]),
      ).toEqual(
        expect.arrayContaining([
          [null, x.id],
          [x.id, y.id],
        ]),
      );
      expect(rows).toHaveLength(2);
    });

    /** Hai lan noi dua nhau: ca hai qua phep kiem (doc ngoai khoa), lan sau chet o unique THAT. */
    it('hai ho so gop von dua nhau noi CUNG tai khoan -> ASSET_STAKEHOLDER_ACCOUNT_TAKEN, khong 500', async () => {
      const shared = await account('chu.chung', 'MANAGER');
      class StaleOwnership extends PrismaAssetOwnershipRepository {
        override async findStakeholderIdHoldingAccount(): Promise<string | null> {
          return null;
        }
      }
      const service = new AssetOwnershipService(
        new StaleOwnership(prisma),
        new FleetVehicleOwnershipAdapter(fleet),
        audit,
        undefined,
        users,
      );
      const one = await service.createStakeholder(
        { kind: 'PERSON', displayName: `${PREFIX} Chu mot` },
        ACTOR,
      );
      const two = await service.createStakeholder(
        { kind: 'PERSON', displayName: `${PREFIX} Chu hai` },
        ACTOR,
      );
      await service.setStakeholderAccount(one.id, shared.id, ACTOR);

      const error = await service
        .setStakeholderAccount(two.id, shared.id, ACTOR)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(TransportDomainError);
      expect(error).toMatchObject({ kind: 'CONFLICT', reason: 'ASSET_STAKEHOLDER_ACCOUNT_TAKEN' });
      expect(await ownershipRepo.linkedAccountOf(two.id)).toBeNull();
      expect(await auditActions(two.id)).toEqual(['transport.asset_stakeholder.create']);
    });
  },
);
