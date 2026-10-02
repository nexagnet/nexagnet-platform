import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService, type AppendAuditLogCommand } from '../../audit/audit-log.service.js';
import { PrismaAuditLogRepository } from '../../audit/prisma-audit-log.repository.js';
import { PrismaService } from '../../config/prisma.service.js';
import { CounterpartySitePlaceGuardHub } from '../counterparty/counterparty-site-place-guard.js';
import type { CounterpartyRepository } from '../counterparty/counterparty.repository.js';
import { PrismaCounterpartySiteRepository } from '../counterparty/prisma-counterparty-site.repository.js';
import { PrismaCounterpartyRepository } from '../counterparty/prisma-counterparty.repository.js';
import { CounterpartySiteService } from '../counterparty/site.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { MovementService } from '../movement/movement.service.js';
import { PrismaMovementRepository } from '../movement/prisma-movement.repository.js';
import { DepotDirectoryHub, depotSourceOf } from '../planning/depot-directory.js';
import { MovementDepotOpenWorkReader } from '../planning/depot-open-work.js';
import { resolveDepotFrom } from '../planning/planning-policy.js';
import { PlanningService } from '../planning/planning.service.js';
import type { TransportPlanningPolicy } from '../planning/planning.types.js';
import { PrismaRunPlanRepository } from '../planning/prisma-planning.repository.js';
import { PrismaGeofenceRepository, type GeofenceRepository } from '../proof/geofence.repository.js';
import { PrismaPlaceWriteStore, type PlaceWriteStore } from '../proof/place-write.store.js';
import { DEFAULT_TRANSPORT_PROOF_POLICY } from '../proof/tracking-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { PlaceAdminService } from './admin/place-admin.service.js';
import type { CreatePlaceCommand, PlaceWriteCaller } from './admin/place-admin.types.js';
import { TransportPlacesRegistrar } from './admin/place-registrations.js';
import { KnownPlacesFactsAdapter } from './known-places.port.js';

/**
 * DIA DIEM VAN HANH tren POSTGRES THAT (`#395` S3).
 *
 * Tep DUY NHAT cua bo song song GHI hang rao `DEPOT`: "toi da MOT bai dang bat" va "co hang rao
 * DEPOT nao thi nguon quan ly la su that" la su that CUA CA BANG, nen hai tep cung ghi bai xe se
 * dam nhau. `beforeAll` chup + TAT cac bai dang bat khong phai cua tep nay (vd `DEPOT-HN` cua may gieo
 * mau), `afterAll` XOA CUNG moi thu cua tep (tien to `IT-S3PLC`) roi BAT LAI dung cac bai da tat.
 * Khong bao gio cham `DEPOT-HN` / "Bãi xe Hà Nội" ngoai lan tat-roi-bat-lai do.
 *
 * Nhung dieu CHI Postgres tra loi duoc:
 *   · khoa tu van + `READ COMMITTED`: hai lan tao cung ten DONG THOI -> dung mot `PLACE_NAME_TAKEN`;
 *   · MOT giao dich cho phap nhan + lien ket khach + dia diem + hang rao;
 *   · chi muc "toi da mot bai dang bat": doi bai chinh khong qua mot khoanh hai bai / khong bai nao;
 *   · khau lap ke hoach va dong vong chay doc CHINH bai vua khai.
 */

const PREFIX = 'IT-S3PLC';
const ACTOR = 'it-s3plc';
const PLATE = `${PREFIX}-XE`;
const PHONE = '0939S3';
const CORE_POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const DAY = '2026-09-25';
const DIRECTOR: PlaceWriteCaller = { actor: ACTOR, canManageCounterparties: true };
const HA_NOI = { latitude: 21.02, longitude: 105.85 };

/** Goi khach CO khai bai trong cau hinh — de chung minh nguon quan ly KHONG lui ve cau hinh. */
const POLICY: TransportPlanningPolicy = {
  grouping: 'ONE_ORDER_PER_RUN',
  depots: [{ code: `${PREFIX}-CONFIG`, label: `${PREFIX} Bãi cấu hình` }],
  closure: { idleHours: null },
  sweep: { intervalSeconds: 60, batchSize: 50 },
};

const depot = (name: string): CreatePlaceCommand => ({
  kind: 'DEPOT',
  name: `${PREFIX} ${name}`,
  point: HA_NOI,
  radiusMetres: 250,
});

/**
 * Diem hen cua hai giao dich: moi ben DUNG o day cho toi khi du `parties` ben toi, hoac het
 * `timeoutMs` — KHONG bao gio treo: khi khoa con do, ben thu hai con dung o khoa va khong toi duoc.
 */
function meetingPoint(parties: number, timeoutMs: number): () => Promise<void> {
  let arrived = 0;
  let releaseAll: () => void = () => undefined;
  const everyone = new Promise<void>((resolve) => {
    releaseAll = resolve;
  });
  return async () => {
    arrived += 1;
    if (arrived >= parties) releaseAll();
    await Promise.race([everyone, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
  };
}

const reasonOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
    return 'KHONG BI TU CHOI';
  } catch (error) {
    if (error instanceof TransportDomainError) return error.reason;
    throw error;
  }
};

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'dia diem van hanh tren Postgres that (#395 S3)',
  () => {
    const prisma = new PrismaService();
    const geofences = new PrismaGeofenceRepository(prisma);
    const sites = new PrismaCounterpartySiteRepository(prisma);
    const counterparties = new PrismaCounterpartyRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const movementRepo = new PrismaMovementRepository(prisma);
    const audit = new AuditLogService(new InMemoryAuditLogRepository());
    const movement = new MovementService(movementRepo, fleet, audit, CORE_POLICY);
    const depots = new DepotDirectoryHub(POLICY);
    const siteGuard = new CounterpartySitePlaceGuardHub();
    // CHINH lop dang ky cua `TransportProofModule` — danh ba bai xe va cong chan sua dia diem cu.
    new TransportPlacesRegistrar(geofences, depots, siteGuard, POLICY);
    const places = new PlaceAdminService(
      new PrismaPlaceWriteStore(prisma),
      geofences,
      sites,
      counterparties,
      fleet,
      depots,
      new MovementDepotOpenWorkReader(movementRepo, POLICY),
      DEFAULT_TRANSPORT_PROOF_POLICY,
      audit,
    );
    const planning = new PlanningService(
      movement,
      new PrismaRunPlanRepository(prisma),
      fleet,
      audit,
      CORE_POLICY,
      POLICY,
      undefined,
      undefined,
      depots,
    );
    const siteService = new CounterpartySiteService(sites, counterparties, audit, siteGuard);
    const known = new KnownPlacesFactsAdapter(geofences, siteService, counterparties, fleet);

    let foreignActiveDepots: string[] = [];
    let suffix = 0;

    async function cleanup(): Promise<void> {
      const vehicles = await prisma.transportVehicle.findMany({
        where: { registrationPlate: { startsWith: PLATE } },
        select: { id: true },
      });
      const vehicleIds = vehicles.map((vehicle) => vehicle.id);
      const runs = await prisma.transportVehicleRun.findMany({
        where: { vehicleId: { in: vehicleIds } },
        select: { id: true },
      });
      const runIds = runs.map((run) => run.id);
      await prisma.transportOrderRunPlan.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });
      await prisma.transportOrder.deleteMany({ where: { code: { startsWith: PREFIX } } });
      await prisma.transportVehicleAssignment.deleteMany({
        where: { vehicleId: { in: vehicleIds } },
      });
      await prisma.transportVehicle.deleteMany({ where: { id: { in: vehicleIds } } });
      await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: PHONE } } });

      const parties = await prisma.transportCounterparty.findMany({
        where: { name: { startsWith: PREFIX } },
        select: { id: true },
      });
      const partyIds = parties.map((party) => party.id);
      const siteRows = await prisma.transportCounterpartySite.findMany({
        where: { counterpartyId: { in: partyIds } },
        select: { id: true },
      });
      await prisma.transportGeofence.deleteMany({
        where: {
          OR: [
            { label: { startsWith: PREFIX } },
            { subjectKind: 'DEPOT', subjectId: { startsWith: `DEPOT-${PREFIX}` } },
            { subjectId: { in: siteRows.map((site) => site.id) } },
          ],
        },
      });
      await prisma.transportCounterpartySite.deleteMany({
        where: { counterpartyId: { in: partyIds } },
      });
      await prisma.transportCounterpartyLink.deleteMany({
        where: { counterpartyId: { in: partyIds } },
      });
      await prisma.transportCounterparty.deleteMany({ where: { id: { in: partyIds } } });
      await prisma.transportCustomer.deleteMany({ where: { name: { startsWith: PREFIX } } });
      // Chi bai "dau vet cung giao dich" ghi so kiem toan THAT, voi actor rieng cua tep nay.
      await prisma.auditLog.deleteMany({ where: { actor: ACTOR } });
    }

    beforeAll(async () => {
      await cleanup();
      const foreign = await prisma.transportGeofence.findMany({
        where: { subjectKind: 'DEPOT', status: 'ACTIVE' },
        select: { id: true },
      });
      foreignActiveDepots = foreign.map((fence) => fence.id);
      await prisma.transportGeofence.updateMany({
        where: { id: { in: foreignActiveDepots } },
        data: { status: 'INACTIVE' },
      });
    }, 60_000);

    afterAll(async () => {
      await cleanup();
      await prisma.transportGeofence.updateMany({
        where: { id: { in: foreignActiveDepots } },
        data: { status: 'ACTIVE' },
      });
      await prisma.$disconnect();
    }, 60_000);

    /** Moi bai bat dau KHONG co bai dang bat nao cua tep nay. */
    const retireOwnDepots = async () => {
      await prisma.transportGeofence.updateMany({
        where: { subjectKind: 'DEPOT', subjectId: { startsWith: `DEPOT-${PREFIX}` } },
        data: { status: 'INACTIVE' },
      });
    };

    const aVehicle = async () => {
      const n = ++suffix;
      const vehicle = await fleet.createVehicle({
        registrationPlate: `${PLATE}-${n}`,
        vehicleClass: 'Dau keo',
      });
      const driver = await fleet.createDriver({
        fullName: `${PREFIX} Lai xe ${n}`,
        phone: `${PHONE}${n}`,
        licenceClass: 'FC',
        licenceExpiry: '2030-01-01',
        authUserId: `${PREFIX}-auth-${n}`,
      });
      await fleet.assignDriverToVehicle(vehicle.id, driver.id, new Date());
      return vehicle;
    };

    const runLeg = async (legId: string) => {
      await movement.transitionLeg(legId, 'IN_TRANSIT', ACTOR);
      await movement.transitionLeg(legId, 'COMPLETED', ACTOR);
    };

    it('tao bai -> chang rong xuat phat tu nhan cua no -> xe ve bai dong DEPOT_RETURN', async () => {
      await retireOwnDepots();
      const main = await places.create(depot('Bãi xe chính'), DIRECTOR);
      expect(main).toMatchObject({
        status: 'ACTIVE',
        depot: { plannerStatus: 'IN_USE', source: 'MANAGED' },
      });
      expect((await planning.describePolicy()).depot).toMatchObject({
        kind: 'RESOLVED',
        source: 'MANAGED',
        depot: { label: main.name },
      });

      const vehicle = await aVehicle();
      const order = await movement.createOrder(
        {
          code: `${PREFIX}-ORD-1`,
          originLabel: `${PREFIX} Kho A`,
          destinationLabel: `${PREFIX} Kho B`,
          businessDate: DAY,
        },
        ACTOR,
      );
      const { run, legs } = await planning.commit(
        order.id,
        { vehicleId: vehicle.id, idempotencyKey: `${PREFIX}-k1` },
        ACTOR,
      );
      expect(legs.map((leg) => [leg.kind, leg.originLabel])).toEqual([
        ['EMPTY', main.name],
        ['LOADED', `${PREFIX} Kho A`],
      ]);
      for (const leg of legs) await runLeg(leg.id);
      const home = await movement.addLeg(
        run.id,
        {
          sequence: 3,
          kind: 'EMPTY',
          orderId: null,
          originLabel: `${PREFIX} Kho B`,
          destinationLabel: main.name,
          businessDate: DAY,
          distanceKm: null,
          plannedDistanceKm: null,
          note: null,
        },
        ACTOR,
      );
      await runLeg(home.id);

      const outcome = await planning.settleRunClosure(run.id);

      expect(outcome).toMatchObject({ closed: true, verdict: { trigger: 'DEPOT_RETURN' } });
    }, 60_000);

    it('bai du phong + doi bai chinh: khong luc nao NOT_CONFIGURED, dung mot bai dang bat', async () => {
      await retireOwnDepots();
      const main = await places.create(depot('Bãi A'), DIRECTOR);
      const standby = await places.create(depot('Bãi B'), DIRECTOR);
      expect(standby).toMatchObject({ status: 'INACTIVE', depot: { plannerStatus: 'STANDBY' } });

      const primary = await places.makePrimaryDepot(standby.id, {}, DIRECTOR);

      expect(primary.depot?.plannerStatus).toBe('IN_USE');
      const activeDepots = await prisma.transportGeofence.findMany({
        where: { subjectKind: 'DEPOT', status: 'ACTIVE' },
        select: { id: true },
      });
      expect(activeDepots.map((fence) => fence.id)).toEqual([standby.id]);
      expect((await geofences.find(main.id))?.status).toBe('INACTIVE');
      expect(resolveDepotFrom(await depots.list())).toMatchObject({
        kind: 'RESOLVED',
        depot: { label: standby.name },
      });
    }, 60_000);

    /** Chi muc DB: mot duong ghi KHONG qua khoa (may gieo, psql) van khong bat duoc bai thu hai. */
    it('chi muc DB chan bai thu hai dang bat — ly do co kieu, khong 500', async () => {
      await retireOwnDepots();
      const main = await places.create(depot('Bãi chỉ mục'), DIRECTOR);
      const standby = await places.create(depot('Bãi chỉ mục 2'), DIRECTOR);

      const raw = await prisma.transportGeofence
        .update({ where: { id: standby.id }, data: { status: 'ACTIVE' } })
        .catch((error: unknown) => error);
      expect((raw as { code?: string }).code).toBe('P2002');
      expect(await reasonOf(() => places.activate(standby.id, DIRECTOR))).toBe(
        'DEPOT_ALREADY_ACTIVE',
      );
      expect(main.status).toBe('ACTIVE');
    }, 60_000);

    it('tat bai cuoi cung -> NOT_CONFIGURED, KHONG lui ve bai cau hinh', async () => {
      await retireOwnDepots();
      const main = await places.create(depot('Bãi tắt'), DIRECTOR);

      await places.deactivate(main.id, { reason: 'dong bai' }, DIRECTOR);

      const list = await depots.list();
      expect(depotSourceOf(list)).toBe('MANAGED');
      expect(resolveDepotFrom(list)).toEqual({ kind: 'NOT_CONFIGURED' });
      expect((await planning.describePolicy()).depot).toEqual({
        kind: 'NOT_CONFIGURED',
        source: 'MANAGED',
      });
    }, 60_000);

    it('bai dang dung con viec mo: doi ten can xac nhan, danh sach viec la that', async () => {
      await retireOwnDepots();
      const main = await places.create(depot('Bãi đang chạy'), DIRECTOR);
      const vehicle = await aVehicle();
      const order = await movement.createOrder(
        {
          code: `${PREFIX}-ORD-OW`,
          originLabel: `${PREFIX} Kho OW`,
          destinationLabel: `${PREFIX} Kho OW2`,
          businessDate: DAY,
        },
        ACTOR,
      );
      const { run } = await planning.commit(
        order.id,
        { vehicleId: vehicle.id, idempotencyKey: `${PREFIX}-kow` },
        ACTOR,
      );

      // Vong chay chi co chang rong DI TU bai: doi ten khong doi gi cho no (dong vong chay chi nhin
      // diem den) — khong hoi, khong canh bao sai (`#395` planning-2).
      const recased = await places.update(main.id, { name: `${PREFIX} Bãi Đổi Tên` }, DIRECTOR);
      expect(recased.name).toBe(`${PREFIX} Bãi Đổi Tên`);

      // Chang VE bai theo nhan hien tai: doi ten LAM vong nay khong con dong khi xe ve bai.
      const legs = await movementRepo.listLegs(run.id);
      await movementRepo.createLeg({
        runId: run.id,
        sequence: legs.length + 1,
        kind: 'EMPTY',
        orderId: null,
        originLabel: `${PREFIX} Kho OW2`,
        destinationLabel: recased.name,
        businessDate: DAY,
      });
      const error = await places
        .update(main.id, { name: `${PREFIX} Bãi đổi tên hẳn` }, DIRECTOR)
        .catch((caught: unknown) => caught);
      expect(error).toMatchObject({ reason: 'DEPOT_CHANGE_AFFECTS_OPEN_WORK' });
      expect((error as { detail: { runs: { id: string }[] } }).detail.runs).toEqual([
        { id: run.id, code: run.code },
      ]);

      const renamed = await places.update(
        main.id,
        { name: `${PREFIX} Bãi đổi tên hẳn`, acknowledgeOpenWork: true },
        DIRECTOR,
      );
      expect(renamed.name).toBe(`${PREFIX} Bãi đổi tên hẳn`);
    }, 60_000);

    /**
     * Khoa tu van + READ COMMITTED: lan thu hai doc thay lan thu nhat vua commit.
     *
     * Hai giao dich phai CHONG LEN NHAU THAT, ke ca khi bai chay MOT MINH tren pool lanh (truoc day
     * bai chi bat duoc mat khoa khi chay ca tep: chay rieng, giao dich thu hai con cho ket noi moi va
     * bat dau SAU khi giao dich dau da commit). Nen: (1) lam nong pool; (2) moi giao dich dung o LAN
     * GHI DAU TIEN cua no — sau moi phep doc cua luat trung ten — cho toi khi ben kia cung toi.
     *   · Co khoa: ben thu hai con dung o `pg_advisory_xact_lock`, ben dau het gio cho, ghi, commit;
     *     ben thu hai doc thay no -> `PLACE_NAME_TAKEN`.
     *   · Mat khoa: CA HAI da doc xong truoc khi mot ai ghi -> ca hai deu qua -> bai DO.
     * Da do (#395 tich hop): go dong khoa trong `place-write.store.ts`, chay rieng bai nay -> DO.
     */
    it('hai lan tao CUNG ten dong thoi -> dung mot PLACE_NAME_TAKEN', async () => {
      await retireOwnDepots();
      await Promise.all(Array.from({ length: 4 }, () => prisma.$queryRaw`SELECT 1`));
      const gate = meetingPoint(2, 3_000);
      const real = new PrismaPlaceWriteStore(prisma);
      const overlapping: PlaceWriteStore = {
        run: (work) =>
          real.run((tx) => {
            let waited = false;
            const firstWrite = async (): Promise<void> => {
              if (waited) return;
              waited = true;
              await gate();
            };
            return work({
              ...tx,
              geofences: Object.assign(Object.create(tx.geofences) as GeofenceRepository, {
                register: async (input: Parameters<GeofenceRepository['register']>[0]) => {
                  await firstWrite();
                  return tx.geofences.register(input);
                },
              }),
              counterparties: Object.assign(
                Object.create(tx.counterparties) as CounterpartyRepository,
                {
                  create: async (input: Parameters<CounterpartyRepository['create']>[0]) => {
                    await firstWrite();
                    return tx.counterparties.create(input);
                  },
                },
              ),
            });
          }),
      };
      const racing = new PlaceAdminService(
        overlapping,
        geofences,
        sites,
        counterparties,
        fleet,
        depots,
        new MovementDepotOpenWorkReader(movementRepo, POLICY),
        DEFAULT_TRANSPORT_PROOF_POLICY,
        audit,
      );
      const results = await Promise.allSettled([
        racing.create(depot('Bãi song song'), DIRECTOR),
        racing.create(
          {
            kind: 'COUNTERPARTY_SITE',
            name: `${PREFIX} BAI SONG SONG`,
            point: HA_NOI,
            radiusMetres: 200,
            owner: { newCounterparty: { name: `${PREFIX} Công ty song song` } },
          },
          DIRECTOR,
        ),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      expect((rejected?.reason as TransportDomainError).reason).toBe('PLACE_NAME_TAKEN');
    }, 60_000);

    it('dia diem khach hang: phap nhan + lien ket + dia diem + hang rao trong MOT giao dich; Tao don thay ten chu', async () => {
      const customer = await fleet.createCustomer({ name: `${PREFIX} Công ty khách` });

      const view = await places.create(
        {
          kind: 'COUNTERPARTY_SITE',
          name: `${PREFIX} Kho khách`,
          point: { latitude: 20.83, longitude: 106.77 },
          radiusMetres: 300,
          address: 'KCN Đình Vũ',
          owner: { customerId: customer.id },
        },
        DIRECTOR,
      );

      expect(view).toMatchObject({
        displayKind: 'CUSTOMER_SITE',
        kindLabel: 'Địa điểm khách hàng',
      });
      const link = await prisma.transportCounterpartyLink.findUnique({
        where: { kind_subjectId: { kind: 'CUSTOMER', subjectId: customer.id } },
      });
      expect(link?.counterpartyId).toBe(view.owner?.counterpartyId);
      const site = await prisma.transportCounterpartySite.findUnique({
        where: { id: view.owner?.siteId ?? '' },
      });
      expect(site).toMatchObject({ name: `${PREFIX} Kho khách`, address: 'KCN Đình Vũ' });
      const fence = await prisma.transportGeofence.findUnique({ where: { id: view.id } });
      expect(fence).toMatchObject({ subjectKind: 'COUNTERPARTY_SITE', subjectId: site?.id });

      // Tao don goi DUNG nhan cua man quan tri: kho cua phap nhan noi voi khach hang (§2.1).
      const knownPlace = (await known.listKnownPlaces()).find((place) => place.id === view.id);
      expect(knownPlace).toMatchObject({
        kind: 'COUNTERPARTY_SITE',
        kindLabel: 'Địa điểm khách hàng',
        name: `${PREFIX} Kho khách`,
        address: 'KCN Đình Vũ',
        detail: `${PREFIX} Công ty khách`,
      });

      // Route cu doi ten dia diem nay -> 409 co ma: no la dia diem van hanh.
      expect(
        await reasonOf(() =>
          siteService.update(site?.id ?? '', { name: `${PREFIX} Kho khác` }, ACTOR),
        ),
      ).toBe('COUNTERPARTY_SITE_MANAGED_AS_PLACE');
    }, 60_000);

    /**
     * MOT giao dich that: lan ghi CUOI (hang rao) hong SAU KHI phap nhan + lien ket khach + dia diem
     * da ghi trong giao dich -> Postgres cuon lai ca ba. Loi duoc gia lap tren CHINH giao dich cua
     * `PrismaPlaceWriteStore` (cac kho con lai la kho Prisma that tren client giao dich).
     */
    it('lan ghi hang rao hong -> phap nhan, lien ket, dia diem cua lan do deu bi cuon lai', async () => {
      const customer = await fleet.createCustomer({ name: `${PREFIX} Khách cuộn lại` });
      const real = new PrismaPlaceWriteStore(prisma);
      const failingAtFence: PlaceWriteStore = {
        run: (work) =>
          real.run((tx) =>
            work({
              ...tx,
              geofences: Object.assign(Object.create(tx.geofences) as GeofenceRepository, {
                register: async () => {
                  throw new Error('gia lap: hong o lan ghi hang rao');
                },
              }),
            }),
          ),
      };
      const fragile = new PlaceAdminService(
        failingAtFence,
        geofences,
        sites,
        counterparties,
        fleet,
        depots,
        new MovementDepotOpenWorkReader(movementRepo, POLICY),
        DEFAULT_TRANSPORT_PROOF_POLICY,
        audit,
      );

      await expect(
        fragile.create(
          {
            kind: 'COUNTERPARTY_SITE',
            name: `${PREFIX} Kho cuộn lại`,
            point: HA_NOI,
            radiusMetres: 200,
            owner: { customerId: customer.id },
          },
          DIRECTOR,
        ),
      ).rejects.toThrow('gia lap');

      expect(
        await prisma.transportCounterpartyLink.count({
          where: { kind: 'CUSTOMER', subjectId: customer.id },
        }),
      ).toBe(0);
      expect(
        await prisma.transportCounterparty.count({ where: { name: `${PREFIX} Khách cuộn lại` } }),
      ).toBe(0);
      expect(
        await prisma.transportCounterpartySite.count({ where: { name: `${PREFIX} Kho cuộn lại` } }),
      ).toBe(0);
    }, 60_000);

    /**
     * DAU VET CUNG GIAO DICH (`#395`): so kiem toan hong o lan ghi dau vet -> CHINH lan sua dia diem
     * lui theo; lan thu lai ghi ca hai. Truoc day dau vet `append` SAU commit: hong o do de lai mot
     * dia diem da doi ma khong dong nao noi ai doi.
     */
    it('so kiem toan hong -> lan sua dia diem lui theo; thu lai thi ca sua lan dau vet cung co', async () => {
      const view = await places.create(
        {
          kind: 'COUNTERPARTY_SITE',
          name: `${PREFIX} Kho dấu vết`,
          point: HA_NOI,
          radiusMetres: 200,
          owner: { newCounterparty: { name: `${PREFIX} Chủ kho dấu vết` } },
        },
        DIRECTOR,
      );
      let failNext = true;
      class FlakyAudit extends AuditLogService {
        override entryFor(command: AppendAuditLogCommand) {
          if (failNext && command.action === 'transport.place.update') {
            failNext = false;
            throw new Error('so kiem toan tam hong');
          }
          return super.entryFor(command);
        }
      }
      const traced = new PlaceAdminService(
        new PrismaPlaceWriteStore(prisma),
        geofences,
        sites,
        counterparties,
        fleet,
        depots,
        new MovementDepotOpenWorkReader(movementRepo, POLICY),
        DEFAULT_TRANSPORT_PROOF_POLICY,
        new FlakyAudit(new PrismaAuditLogRepository(prisma)),
      );
      const radius = async () =>
        (await prisma.transportGeofence.findUnique({ where: { id: view.id } }))?.radiusMetres;
      const rows = () =>
        prisma.auditLog.count({
          where: { entityType: 'TransportGeofence', entityId: view.id, actor: ACTOR },
        });

      await expect(traced.update(view.id, { radiusMetres: 321 }, DIRECTOR)).rejects.toThrow(
        'so kiem toan tam hong',
      );
      expect(await radius()).toBe(200);
      expect(await rows()).toBe(0);

      await traced.update(view.id, { radiusMetres: 321 }, DIRECTOR);
      expect(await radius()).toBe(321);
      expect(await rows()).toBe(1);
    }, 60_000);

    /** Tu choi giua chung KHONG de lai phap nhan / dia diem do dang: tat ca trong MOT giao dich. */
    it('trung ma so thue giua chung -> khong mot hang nao cua lan do con lai', async () => {
      const taxCode = '0395039503';
      await prisma.transportCounterparty.deleteMany({ where: { taxCode } });
      await counterparties.create({ name: `${PREFIX} Chủ mã số thuế`, taxCode });

      expect(
        await reasonOf(() =>
          places.create(
            {
              kind: 'COUNTERPARTY_SITE',
              name: `${PREFIX} Kho trùng mã`,
              point: HA_NOI,
              radiusMetres: 200,
              owner: { newCounterparty: { name: `${PREFIX} Đơn vị mới`, taxCode } },
            },
            DIRECTOR,
          ),
        ),
      ).toBe('COUNTERPARTY_TAX_CODE_TAKEN');
      expect(
        await prisma.transportCounterparty.count({ where: { name: `${PREFIX} Đơn vị mới` } }),
      ).toBe(0);
      expect(
        await prisma.transportGeofence.count({ where: { label: `${PREFIX} Kho trùng mã` } }),
      ).toBe(0);
    }, 60_000);

    it('tat phap nhan qua duong cu -> dia diem cua no bien mat khoi Tao don', async () => {
      const view = await places.create(
        {
          kind: 'COUNTERPARTY_SITE',
          name: `${PREFIX} Nhà máy đối tác`,
          point: HA_NOI,
          radiusMetres: 200,
          owner: { newCounterparty: { name: `${PREFIX} Đối tác nghỉ` } },
        },
        DIRECTOR,
      );
      expect((await known.listKnownPlaces()).find((place) => place.id === view.id)).toMatchObject({
        kindLabel: 'Nhà máy / kho đối tác',
      });

      await counterparties.update(view.owner?.counterpartyId ?? '', { status: 'INACTIVE' });

      expect((await known.listKnownPlaces()).some((place) => place.id === view.id)).toBe(false);
      expect((await places.list({ q: `${PREFIX} Nhà máy đối tác` }))[0]?.effectiveStatus).toBe(
        'OWNER_INACTIVE',
      );
    }, 60_000);
  },
);
