import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { PrismaFleetRepository } from '../fleet/prisma-fleet.repository.js';
import { describeStorageError, isUniqueViolationOn } from '../storage-conflict.js';
import { TransportDomainError } from '../transport.errors.js';
import { PrismaTripRepository } from '../trips/prisma-trip.repository.js';
import { MovementService } from './movement.service.js';
import { ACTIVE_RUN_ASSIGNMENT, PrismaMovementRepository } from './prisma-movement.repository.js';
import { summariseRunDistance } from './run-distance.js';

/**
 * MO HINH VAN CHUYEN v2 tren POSTGRES THAT (R1-B).
 *
 * Ban trong bo nho khong chung minh duoc cai ma tranche nay thuc su dua vao: `CHECK` cua DB, unique
 * mot phan, va tinh TAT DINH cua phep chieu khi chay lai. Bo test nay chung minh nhung thu do.
 *
 * Chay bang `RUN_PRISMA_IT=1`; khong co bien do thi ca khoi khong chay (khong co duong lui trong
 * bo nho -- mot ban trong bo nho khong the phu nhan mot rang buoc cua Postgres).
 */

const CODE_PREFIX = 'IT-MV';
const PLATE_PREFIX = 'IT-MV-XE';
const PHONE_PREFIX = '0955MV';
const CUSTOMER_PREFIX = 'IT-MV Khach';

const ACTOR = 'it-movement';
const POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
const BUSINESS_DATE = '2026-09-07';

describe.runIf(process.env.RUN_PRISMA_IT === '1')(
  'mo hinh van chuyen v2 tren Postgres that',
  () => {
    const prisma = new PrismaService();
    const movementRepo = new PrismaMovementRepository(prisma);
    const fleet = new PrismaFleetRepository(prisma);
    const trips = new PrismaTripRepository(prisma);
    const service = new MovementService(
      movementRepo,
      fleet,
      new AuditLogService(new InMemoryAuditLogRepository()),
      POLICY,
      trips,
    );

    /**
     * Don dep theo THU TU AN TOAN VE KHOA NGOAI: lien ket -> chang -> phan cong -> vong chay ->
     * don -> chuyen -> xe/lai xe/khach.
     */
    async function cleanup(): Promise<void> {
      // `contains` chu KHONG `startsWith`: phep chieu sinh ma `RUN-<ma chuyen>`, tuc tien to cua
      // bo test nam o GIUA chuoi. Dung `startsWith` thi vong chay duoc chieu ra khong bi don, va
      // lan xoa xe sau do that bai vi khoa ngoai -- mot kieu ro ri chi lo ra o lan chay THU HAI.
      const runs = await prisma.transportVehicleRun.findMany({
        where: { code: { contains: CODE_PREFIX } },
        select: { id: true },
      });
      const runIds = runs.map((run) => run.id);
      const legs = await prisma.transportRunLeg.findMany({
        where: { runId: { in: runIds } },
        select: { id: true },
      });

      await prisma.transportTripRunLegLink.deleteMany({
        where: { legId: { in: legs.map((leg) => leg.id) } },
      });
      await prisma.transportRunLeg.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportRunAssignment.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.transportVehicleRun.deleteMany({ where: { id: { in: runIds } } });
      /*
       * `#275` Lane K: phep chieu cung ghi mot lien ket THUONG MAI, va khoa ngoai cua no la
       * `Restrict` — cung quy uoc voi `TransportTripRunLegLink` ngay tren. Xoa don truoc lien ket se
       * dung vao rang buoc do, dung nhu no duoc thiet ke.
       */
      await prisma.transportTripOrderLink.deleteMany({
        where: { order: { code: { contains: CODE_PREFIX } } },
      });
      await prisma.transportOrder.deleteMany({ where: { code: { contains: CODE_PREFIX } } });

      const tripRows = await prisma.transportTrip.findMany({
        where: { code: { contains: CODE_PREFIX } },
        select: { id: true },
      });
      const tripIds = tripRows.map((trip) => trip.id);
      await prisma.transportTripRunLegLink.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.transportTripAssignment.deleteMany({ where: { tripId: { in: tripIds } } });
      await prisma.transportTrip.deleteMany({ where: { id: { in: tripIds } } });

      await prisma.transportVehicle.deleteMany({
        where: { registrationPlate: { startsWith: PLATE_PREFIX } },
      });
      await prisma.transportDriver.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
      await prisma.transportCustomer.deleteMany({
        where: { name: { startsWith: CUSTOMER_PREFIX } },
      });
    }

    beforeAll(cleanup);
    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });

    const reasonOf = async (run: () => Promise<unknown>): Promise<string> => {
      try {
        await run();
      } catch (error) {
        if (error instanceof TransportDomainError) return error.reason;
        throw new Error(`loi chua duoc dich sang mien: ${describeStorageError(error)}`);
      }
      throw new Error('mong doi mot TransportDomainError, nhung loi goi da thanh cong');
    };

    let suffix = 0;
    const nextCode = (label: string): string => `${CODE_PREFIX}-${label}-${++suffix}`;

    const aVehicle = () =>
      fleet.createVehicle({
        registrationPlate: `${PLATE_PREFIX}-${++suffix}`,
        vehicleClass: 'Dau keo',
      });

    it('MV-IT-01 -- hai kich ban bat buoc chay tron ven tren DB that', async () => {
      const vehicle = await aVehicle();
      const run = await service.createRun(
        { code: nextCode('RUN'), vehicleId: vehicle.id, businessDate: BUSINESS_DATE },
        ACTOR,
      );
      const orderA = await service.createOrder(
        {
          code: nextCode('ORD-A'),
          originLabel: 'Ha Noi',
          destinationLabel: 'Hai Phong',
          businessDate: BUSINESS_DATE,
          freightAmount: 5_000_000,
        },
        ACTOR,
      );

      await service.addLeg(
        run.id,
        {
          sequence: 1,
          kind: 'LOADED',
          orderId: orderA.id,
          originLabel: 'Ha Noi',
          destinationLabel: 'Hai Phong',
          distanceKm: 120,
        },
        ACTOR,
      );
      await service.addLeg(
        run.id,
        {
          sequence: 2,
          kind: 'EMPTY',
          originLabel: 'Hai Phong',
          destinationLabel: 'Ha Noi',
          distanceKm: 120,
        },
        ACTOR,
      );

      const detail = await service.getRun(run.id);
      expect(detail.legs.map((leg) => leg.kind)).toEqual(['LOADED', 'EMPTY']);
      expect(detail.legs[1]?.orderId).toBeNull();
      expect(summariseRunDistance(detail.legs)).toMatchObject({
        loadedKm: 120,
        emptyKm: 120,
        complete: true,
      });
    });

    it('MV-IT-02 -- `CHECK` cua DB tu choi chang rong mang don, ke ca khi qua mat tang mien', async () => {
      const vehicle = await aVehicle();
      const run = await service.createRun(
        { code: nextCode('RUN'), vehicleId: vehicle.id, businessDate: BUSINESS_DATE },
        ACTOR,
      );
      const order = await service.createOrder(
        {
          code: nextCode('ORD'),
          originLabel: 'Ha Noi',
          destinationLabel: 'Hai Phong',
          businessDate: BUSINESS_DATE,
        },
        ACTOR,
      );

      // Ghi THANG qua Prisma, bo qua service: day dung la duong ma `CHECK` ton tai de chan.
      await expect(
        prisma.transportRunLeg.create({
          data: {
            runId: run.id,
            sequence: 9,
            kind: 'EMPTY',
            orderId: order.id,
            originLabel: 'Hai Phong',
            destinationLabel: 'Ha Noi',
            businessDate: BUSINESS_DATE,
          },
        }),
      ).rejects.toThrow(/TransportRunLeg_empty_carries_no_order/);
    });

    it('MV-IT-03 -- so thu tu chang trung bi tu choi CO TEN', async () => {
      const vehicle = await aVehicle();
      const run = await service.createRun(
        { code: nextCode('RUN'), vehicleId: vehicle.id, businessDate: BUSINESS_DATE },
        ACTOR,
      );
      await service.addLeg(
        run.id,
        { sequence: 1, kind: 'EMPTY', originLabel: 'A', destinationLabel: 'B' },
        ACTOR,
      );

      const reason = await reasonOf(() =>
        service.addLeg(
          run.id,
          { sequence: 1, kind: 'EMPTY', originLabel: 'A', destinationLabel: 'B' },
          ACTOR,
        ),
      );
      expect(reason).toBe('RUN_LEG_SEQUENCE_TAKEN');
    });

    it('MV-IT-04 -- unique MOT PHAN giu dung mot ban phan cong dang hieu luc', async () => {
      const vehicle = await aVehicle();
      const run = await service.createRun(
        { code: nextCode('RUN'), vehicleId: vehicle.id, businessDate: BUSINESS_DATE },
        ACTOR,
      );
      const first = await fleet.createDriver({
        fullName: 'IT-MV Lai xe A',
        phone: `${PHONE_PREFIX}01`,
        licenceClass: 'FC',
        licenceExpiry: '2030-01-01',
      });
      const second = await fleet.createDriver({
        fullName: 'IT-MV Lai xe B',
        phone: `${PHONE_PREFIX}02`,
        licenceClass: 'FC',
        licenceExpiry: '2030-01-01',
      });

      await service.assignRun(run.id, { driverId: first.id }, ACTOR);
      await service.assignRun(run.id, { driverId: second.id }, ACTOR);

      const history = await service.runAssignmentHistory(run.id);
      expect(history).toHaveLength(2);
      expect(history.filter((entry) => entry.effectiveTo === null)).toHaveLength(1);

      // Ghi thang mot ban thu hai dang hieu luc: unique mot phan la thu duy nhat chan duoc.
      //
      // Doc bang `isUniqueViolationOn` chu KHONG bang khop chuoi tren `message`: Prisma doi ten rang
      // buoc thanh ten TRUONG (`runId`) thay vi loi ra ten index SQL, nen mot phep khop chuoi se
      // XANH GIA khi rang buoc bien mat.
      let violation: unknown = null;
      try {
        await prisma.transportRunAssignment.create({
          data: {
            runId: run.id,
            driverId: first.id,
            effectiveFrom: new Date(),
            assignedBy: ACTOR,
          },
        });
      } catch (error) {
        violation = error;
      }
      expect(violation, 'ban phan cong thu hai le ra phai bi DB tu choi').not.toBeNull();
      expect(
        isUniqueViolationOn(violation, ACTIVE_RUN_ASSIGNMENT),
        describeStorageError(violation),
      ).toBe(true);
    });

    it('MV-IT-05 -- phep chieu chuyen v1 TAT DINH: chay lai khong sinh ban thu hai', async () => {
      const vehicle = await aVehicle();
      const driver = await fleet.createDriver({
        fullName: 'IT-MV Lai xe C',
        phone: `${PHONE_PREFIX}03`,
        licenceClass: 'FC',
        licenceExpiry: '2030-01-01',
      });
      const customer = await fleet.createCustomer({ name: `${CUSTOMER_PREFIX} A` });
      const trip = await trips.create({
        code: nextCode('CHUYEN'),
        kind: 'OWN_DIRECT',
        businessDate: BUSINESS_DATE,
        originLabel: 'Ha Noi',
        destinationLabel: 'Hai Phong',
        customerId: customer.id,
        freightAmount: 7_000_000,
        distanceKm: 118,
      });
      await trips.assign(trip.id, {
        vehicleId: vehicle.id,
        driverId: driver.id,
        assignedBy: ACTOR,
        at: new Date(),
      });

      const first = await service.projectTrip(trip.id, ACTOR);
      expect(first.run.vehicleId).toBe(vehicle.id);
      expect(first.leg.kind).toBe('LOADED');
      expect(first.leg.distanceKm).toBe(118);
      expect(first.order?.customerId).toBe(customer.id);
      // #379: chuyen v1 khong co toa do -> don chieu ra mang NULL, khong geocode nhan.
      expect(first.order?.originPoint).toBeNull();
      expect(first.order?.destinationPoint).toBeNull();

      const second = await service.projectTrip(trip.id, ACTOR);
      expect(second.run.id).toBe(first.run.id);
      expect(second.leg.id).toBe(first.leg.id);

      expect(await prisma.transportVehicleRun.count({ where: { code: `RUN-${trip.code}` } })).toBe(
        1,
      );

      // CHUYEN CU KHONG DOI. Day la bat bien tuong thich cua ca tranche.
      const reread = await trips.find(trip.id);
      expect(reread).toMatchObject({
        code: trip.code,
        status: trip.status,
        originLabel: trip.originLabel,
        destinationLabel: trip.destinationLabel,
        freightAmount: trip.freightAmount,
        customerId: trip.customerId,
      });
    });

    it('MV-IT-06 -- chuyen thue xe ngoai KHONG chieu ra vong chay cua xe minh', async () => {
      const trip = await trips.create({
        code: nextCode('CHUYEN-NGOAI'),
        kind: 'EXTERNAL_CARRIER',
        businessDate: BUSINESS_DATE,
        originLabel: 'Ha Noi',
        destinationLabel: 'Hai Phong',
      });

      const reason = await reasonOf(() => service.projectTrip(trip.id, ACTOR));
      expect(reason).toBe('PROJECTION_TRIP_OUTSOURCED');
    });

    it('MV-IT-07 -- chuyen chua phan cong xe bi tu choi CO TEN, khong doan bua mot chiec', async () => {
      const trip = await trips.create({
        code: nextCode('CHUYEN-CHUA-XE'),
        kind: 'OWN_DIRECT',
        businessDate: BUSINESS_DATE,
        originLabel: 'Ha Noi',
        destinationLabel: 'Hai Phong',
      });

      const reason = await reasonOf(() => service.projectTrip(trip.id, ACTOR));
      expect(reason).toBe('PROJECTION_TRIP_HAS_NO_VEHICLE');
    });

    /* -------------------------------------------------------------------------------------- *
     * #379 -- TOA DO DIEM LAY / DIEM GIAO cua don
     * -------------------------------------------------------------------------------------- */

    // Nhieu chu so thap phan hon moi thiet bi GPS dua ra: `DOUBLE PRECISION` phai giu NGUYEN, vi
    // mot lan lam tron o tang luu tru se lam diem lay troi khoi hang rao ma khong ai thay.
    const DINH_VU = { latitude: 20.826401234, longitude: 106.775201234 };
    const TAN_PHU_HUNG = { latitude: 21.617000987, longitude: 105.817000456 };

    it('MV-IT-379-01 -- toa do di qua PrismaMovementRepository KHONG mat chu so nao', async () => {
      const created = await service.createOrder(
        {
          code: nextCode('ORD-TOA-DO'),
          originLabel: 'Nhà máy thép Đình Vũ',
          destinationLabel: 'Kho Nhựa Tân Phú Hưng',
          businessDate: BUSINESS_DATE,
          originPoint: DINH_VU,
          destinationPoint: TAN_PHU_HUNG,
        },
        ACTOR,
      );

      expect(created.originPoint).toStrictEqual(DINH_VU);
      expect(created.destinationPoint).toStrictEqual(TAN_PHU_HUNG);

      // Doc lai qua MOI duong doc cua repository -- ca ba deu di qua `toOrder`.
      const byId = await movementRepo.findOrder(created.id);
      const byCode = await movementRepo.findOrderByCode(created.code);
      const listed = (await movementRepo.listOrders()).find((order) => order.id === created.id);
      for (const read of [byId, byCode, listed]) {
        expect(read?.originPoint).toStrictEqual(DINH_VU);
        expect(read?.destinationPoint).toStrictEqual(TAN_PHU_HUNG);
      }

      // Va bon cot THO trong DB dung bang tung bit voi so da gui.
      const row = await prisma.transportOrder.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.originLatitude).toBe(DINH_VU.latitude);
      expect(row.originLongitude).toBe(DINH_VU.longitude);
      expect(row.destinationLatitude).toBe(TAN_PHU_HUNG.latitude);
      expect(row.destinationLongitude).toBe(TAN_PHU_HUNG.longitude);

      // PATCH chi sua nhan: toa do trong DB khong duoc dong toi (#379 khong mo duong sua diem).
      const renamed = await service.updateOrder(
        created.id,
        { originLabel: 'Bãi xe Hà Nội' },
        ACTOR,
      );
      expect(renamed.originLabel).toBe('Bãi xe Hà Nội');
      expect(renamed.originPoint).toStrictEqual(DINH_VU);
      expect(renamed.destinationPoint).toStrictEqual(TAN_PHU_HUNG);
    });

    it('MV-IT-379-02 -- hang CU (khong toa do) doc ra `null`, khong phai mot diem bia', async () => {
      // Ghi thang qua Prisma, dung hinh dang cua moi hang co truoc #379.
      const legacy = await prisma.transportOrder.create({
        data: {
          code: nextCode('ORD-CU'),
          businessDate: BUSINESS_DATE,
          originLabel: 'Bãi xe Hà Nội',
          destinationLabel: 'Hai Phong',
        },
      });
      expect(legacy.originLatitude).toBeNull();

      const read = await movementRepo.findOrder(legacy.id);
      expect(read?.originPoint).toBeNull();
      expect(read?.destinationPoint).toBeNull();
      // Nhan trung ten mot dia diem da biet van KHONG sinh ra toa do.
      expect(read?.originLabel).toBe('Bãi xe Hà Nội');
    });

    it('MV-IT-379-03 -- diem hong bi tang mien tu choi CO TEN va khong ghi hang nao', async () => {
      const code = nextCode('ORD-DAO');

      const reason = await reasonOf(() =>
        service.createOrder(
          {
            code,
            originLabel: 'A',
            destinationLabel: 'B',
            businessDate: BUSINESS_DATE,
            originPoint: DINH_VU,
            destinationPoint: { latitude: 0, longitude: 0 },
          },
          ACTOR,
        ),
      );

      expect(reason).toBe('ORDER_DESTINATION_POINT_INVALID');
      expect(await prisma.transportOrder.count({ where: { code } })).toBe(0);
    });

    /**
     * Ghi THANG qua Prisma, bo qua tang mien -- cung tien le voi MV-IT-02. Moi dong la MOT rang
     * buoc, va bai do ten rang buoc chu khong chi "co nem": neu mot CHECK bi go, bai cua DUNG no do.
     */
    it.each([
      ['TransportOrder_origin_point_paired', { originLatitude: 20.8, originLongitude: null }],
      [
        'TransportOrder_destination_point_paired',
        { destinationLatitude: null, destinationLongitude: 106.7 },
      ],
      ['TransportOrder_origin_latitude_range', { originLatitude: 90.5, originLongitude: 106.7 }],
      ['TransportOrder_origin_longitude_range', { originLatitude: 20.8, originLongitude: 180.5 }],
      [
        'TransportOrder_destination_latitude_range',
        { destinationLatitude: -91, destinationLongitude: 106.7 },
      ],
      [
        'TransportOrder_destination_longitude_range',
        { destinationLatitude: 20.8, destinationLongitude: -181 },
      ],
      ['TransportOrder_origin_not_null_island', { originLatitude: 0, originLongitude: 0 }],
      [
        'TransportOrder_destination_not_null_island',
        { destinationLatitude: 0, destinationLongitude: 0 },
      ],
    ] as const)(
      'MV-IT-379-04 -- `CHECK` %s tu choi lan ghi qua mat tang mien',
      async (constraint, columns) => {
        const code = nextCode('ORD-CHECK');

        await expect(
          prisma.transportOrder.create({
            data: {
              code,
              businessDate: BUSINESS_DATE,
              originLabel: 'A',
              destinationLabel: 'B',
              ...columns,
            },
          }),
        ).rejects.toThrow(new RegExp(constraint));
        expect(await prisma.transportOrder.count({ where: { code } })).toBe(0);
      },
    );

    /**
     * BIEN NULL ISLAND phai TRUNG giua tang mien va DB. `parseGeoPoint` chi tu choi khi CA HAI
     * truc `< 1e-9`, nen (1e-9, 0) hop le. Mot CHECK viet bang `>` se tu choi dung diem nay: tang
     * mien cho qua, DB chan, va nguoi dung nhan mot loi 500 khong ten thay vi mot don da luu.
     */
    it('MV-IT-379-05 -- bien (1e-9, 0) duoc CA tang mien lan DB nhan; (0, 0) bi CA HAI tu choi', async () => {
      const BOUNDARY = { latitude: 1e-9, longitude: 0 };

      // Qua tang mien -> Prisma -> CHECK.
      const viaDomain = await service.createOrder(
        {
          code: nextCode('ORD-BIEN'),
          originLabel: 'A',
          destinationLabel: 'B',
          businessDate: BUSINESS_DATE,
          originPoint: BOUNDARY,
          destinationPoint: { latitude: 0, longitude: 1e-9 },
        },
        ACTOR,
      );
      expect(viaDomain.originPoint).toStrictEqual(BOUNDARY);
      expect(viaDomain.destinationPoint).toStrictEqual({ latitude: 0, longitude: 1e-9 });

      // Ghi THANG, bo qua tang mien: chinh CHECK cung nhan diem bien.
      const direct = await prisma.transportOrder.create({
        data: {
          code: nextCode('ORD-BIEN-THO'),
          businessDate: BUSINESS_DATE,
          originLabel: 'A',
          destinationLabel: 'B',
          originLatitude: 1e-9,
          originLongitude: 0,
          destinationLatitude: 0,
          destinationLongitude: 1e-9,
        },
      });
      expect(direct.originLatitude).toBe(1e-9);

      // (0, 0): tang mien tu choi CO TEN, DB tu choi theo TEN rang buoc.
      const refusedCode = nextCode('ORD-DAO-GOC');
      expect(
        await reasonOf(() =>
          service.createOrder(
            {
              code: refusedCode,
              originLabel: 'A',
              destinationLabel: 'B',
              businessDate: BUSINESS_DATE,
              originPoint: { latitude: 0, longitude: 0 },
              destinationPoint: BOUNDARY,
            },
            ACTOR,
          ),
        ),
      ).toBe('ORDER_ORIGIN_POINT_INVALID');
      await expect(
        prisma.transportOrder.create({
          data: {
            code: refusedCode,
            businessDate: BUSINESS_DATE,
            originLabel: 'A',
            destinationLabel: 'B',
            originLatitude: 0,
            originLongitude: 0,
          },
        }),
      ).rejects.toThrow(/TransportOrder_origin_not_null_island/);
      expect(await prisma.transportOrder.count({ where: { code: refusedCode } })).toBe(0);
    });
  },
);
