import { beforeEach, describe, expect, it } from 'vitest';
import {
  AuditLogRepository,
  InMemoryAuditLogRepository,
} from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { InMemoryFleetRepository } from '../fleet/fleet.repository.js';
import { driverFuelSubmitSchema } from '../fuel/fuel.schemas.js';
import { FleetService } from '../fleet/fleet.service.js';
import { TransportDomainError } from '../transport.errors.js';
import { InMemoryTripRepository } from './trip.repository.js';
import { TripService } from './trip.service.js';

const ACTOR = 'nguoi-van-hanh';
const POLICY = { timeZone: 'Asia/Ho_Chi_Minh' } as const;

/** Moi khoa trong mot payload, ke ca khoa long nhau — de soi ro ri theo CHIEU SAU. */
function deepKeys(value: unknown, seen = new Set<unknown>()): string[] {
  if (value === null || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((entry) => deepKeys(entry, seen));
  return Object.entries(value).flatMap(([key, nested]) => [key, ...deepKeys(nested, seen)]);
}

const MONEY_SHAPED = /freight|revenue|amount|price|currency|cost|tariff|cuoc|gia/i;

describe('TripService', () => {
  let trips: InMemoryTripRepository;
  let fleetRepository: InMemoryFleetRepository;
  let fleet: FleetService;
  let auditRepository: AuditLogRepository;
  let audit: AuditLogService;
  let service: TripService;

  const registerVehicle = (plate: string) =>
    fleet.registerVehicle({ registrationPlate: plate, vehicleClass: 'Xe tai' }, ACTOR);

  // `#395`: dich vu doi xe khong con nhan `authUserId` (noi tai khoan co route + luat rieng) —
  // fixture noi thang qua KHO, dung cho ma kho van giu truong nay.
  const registerDriver = async (name: string, phone: string, authUserId?: string) => {
    const driver = await fleet.registerDriver(
      { fullName: name, phone, licenceClass: 'C', licenceExpiry: '2029-01-01' },
      ACTOR,
    );
    if (!authUserId) return driver;
    return (await fleetRepository.updateDriver(driver.id, { authUserId })) ?? driver;
  };

  const planOwnTrip = (code = 'CH-0001') =>
    service.planTrip(
      {
        code,
        kind: 'OWN_DIRECT',
        originLabel: 'Ha Noi',
        destinationLabel: 'Thai Nguyen',
        freightAmount: 4_500_000,
      },
      ACTOR,
    );

  beforeEach(() => {
    trips = new InMemoryTripRepository();
    fleetRepository = new InMemoryFleetRepository();
    auditRepository = new InMemoryAuditLogRepository();
    audit = new AuditLogService(auditRepository);
    fleet = new FleetService(fleetRepository, audit);
    service = new TripService(trips, fleetRepository, audit, POLICY);
  });

  // TRIP-CORE-001
  describe('TRIP-CORE-001: tao chuyen tu chay', () => {
    it('chuyen moi o trang thai PLANNED', async () => {
      const trip = await planOwnTrip();
      expect(trip.status).toBe('PLANNED');
      expect(trip.kind).toBe('OWN_DIRECT');
    });

    it('tien la SO NGUYEN DONG kem currencyCode VND', async () => {
      const trip = await planOwnTrip();
      expect(trip.freightAmount).toBe(4_500_000);
      expect(Number.isInteger(trip.freightAmount)).toBe(true);
      expect(trip.currencyCode).toBe('VND');
    });

    it('gia cuoc le hon mot dong bi TU CHOI', async () => {
      await expect(
        service.planTrip(
          {
            code: 'CH-LE',
            kind: 'OWN_DIRECT',
            originLabel: 'A',
            destinationLabel: 'B',
            freightAmount: 4_500_000.5,
          },
          ACTOR,
        ),
      ).rejects.toThrow(TransportDomainError);
    });

    it('gia cuoc AM bi TU CHOI — doanh thu khong am', async () => {
      await expect(
        service.planTrip(
          {
            code: 'CH-AM',
            kind: 'OWN_DIRECT',
            originLabel: 'A',
            destinationLabel: 'B',
            freightAmount: -1,
          },
          ACTOR,
        ),
      ).rejects.toThrow(TransportDomainError);
    });

    it('ma chuyen trung bi TU CHOI', async () => {
      await planOwnTrip('CH-TRUNG');
      await expect(planOwnTrip('CH-TRUNG')).rejects.toThrow(TransportDomainError);
    });

    // BUSINESS-DATE-001 o tang nghiep vu
    it('BUSINESS-DATE-001: ngay nghiep vu tinh theo mui gio tenant, khong theo UTC', async () => {
      const nearMidnightUtc = new Date('2026-07-31T23:30:00Z');
      const scoped = new TripService(
        new InMemoryTripRepository(() => nearMidnightUtc),
        fleetRepository,
        audit,
        POLICY,
        undefined,
        () => nearMidnightUtc,
      );

      const trip = await scoped.planTrip(
        { code: 'CH-NUA-DEM', kind: 'OWN_DIRECT', originLabel: 'A', destinationLabel: 'B' },
        ACTOR,
      );

      expect(trip.businessDate).toBe('2026-08-01');
      expect(trip.createdAt.slice(0, 10)).toBe('2026-07-31');
    });

    it('ngay nghiep vu nhap tay duoc chap nhan khi dung dang', async () => {
      const trip = await service.planTrip(
        {
          code: 'CH-NGAY-TAY',
          kind: 'OWN_DIRECT',
          originLabel: 'A',
          destinationLabel: 'B',
          businessDate: '2026-08-15',
        },
        ACTOR,
      );
      expect(trip.businessDate).toBe('2026-08-15');
    });

    it('chuyen thue xe ngoai doi mot doi tac CO VAI nha xe', async () => {
      const referrerOnly = await fleet.createPartner(
        { name: 'Chi Mang Don', roles: ['ORDER_REFERRER'] },
        ACTOR,
      );
      await expect(
        service.planTrip(
          {
            code: 'CH-NGOAI-SAI',
            kind: 'EXTERNAL_CARRIER',
            originLabel: 'A',
            destinationLabel: 'B',
            carrierPartnerId: referrerOnly.id,
          },
          ACTOR,
        ),
      ).rejects.toThrow(TransportDomainError);
    });

    it('doi tac MANG HAI VAI dung duoc o ca hai cho', async () => {
      const both = await fleet.createPartner(
        { name: 'Vua Cho Thue Vua Mang Don', roles: ['CARRIER', 'ORDER_REFERRER'] },
        ACTOR,
      );

      const hired = await service.planTrip(
        {
          code: 'CH-NGOAI',
          kind: 'EXTERNAL_CARRIER',
          originLabel: 'A',
          destinationLabel: 'B',
          carrierPartnerId: both.id,
        },
        ACTOR,
      );
      const referred = await service.planTrip(
        {
          code: 'CH-CHAY-HO',
          kind: 'PARTNER_REFERRED_INTERNAL_RUN',
          originLabel: 'A',
          destinationLabel: 'B',
          referrerPartnerId: both.id,
        },
        ACTOR,
      );

      expect(hired.carrierPartnerId).toBe(both.id);
      expect(referred.referrerPartnerId).toBe(both.id);
    });
  });

  // TRIP-CORE-002 / TRIP-CORE-003
  describe('vong doi', () => {
    it('TRIP-CORE-002: PLANNED -> IN_TRANSIT -> DELIVERED -> RECONCILED', async () => {
      const trip = await planOwnTrip();
      const vehicle = await registerVehicle('29H-100.10');
      const driver = await registerDriver('Lai Xe A', '0900000101');
      await service.assign(trip.id, { vehicleId: vehicle.id, driverId: driver.id }, ACTOR);

      expect((await service.transition(trip.id, 'IN_TRANSIT', ACTOR)).status).toBe('IN_TRANSIT');
      expect((await service.transition(trip.id, 'DELIVERED', ACTOR)).status).toBe('DELIVERED');
      expect((await service.transition(trip.id, 'RECONCILED', ACTOR)).status).toBe('RECONCILED');
    });

    it('TRIP-CORE-003: PLANNED -> DELIVERED bi TU CHOI', async () => {
      const trip = await planOwnTrip();
      await expect(service.transition(trip.id, 'DELIVERED', ACTOR)).rejects.toThrow(
        TransportDomainError,
      );
      expect((await service.getTrip(trip.id)).status).toBe('PLANNED');
    });

    it('chua phan cong thi khong lan banh duoc, va ly do phan biet duoc', async () => {
      const trip = await planOwnTrip();
      await expect(service.transition(trip.id, 'IN_TRANSIT', ACTOR)).rejects.toMatchObject({
        reason: 'TRIP_RESOURCES_MISSING',
      });
    });

    it('chuyen thue xe ngoai lan banh duoc MA KHONG can xe/lai xe cong ty', async () => {
      const carrier = await fleet.createPartner({ name: 'Nha Xe', roles: ['CARRIER'] }, ACTOR);
      const trip = await service.planTrip(
        {
          code: 'CH-NGOAI-2',
          kind: 'EXTERNAL_CARRIER',
          originLabel: 'A',
          destinationLabel: 'B',
          carrierPartnerId: carrier.id,
        },
        ACTOR,
      );
      expect((await service.transition(trip.id, 'IN_TRANSIT', ACTOR)).status).toBe('IN_TRANSIT');
    });

    it('ghi audit cho moi lan chuyen trang thai', async () => {
      const trip = await planOwnTrip();
      const vehicle = await registerVehicle('29H-100.11');
      const driver = await registerDriver('Lai Xe A', '0900000102');
      await service.assign(trip.id, { vehicleId: vehicle.id, driverId: driver.id }, ACTOR);
      await service.transition(trip.id, 'IN_TRANSIT', ACTOR);

      const actions = (await auditRepository.list({})).map((entry) => entry.action);
      expect(actions).toContain('transport.trip.create');
      expect(actions).toContain('transport.trip.assign');
      expect(actions).toContain('transport.trip.transition');
    });
  });

  // TRIP-CORE-004
  describe('TRIP-CORE-004: huy thay cho xoa', () => {
    it('chuyen bi huy VAN doc duoc, mang trang thai CANCELLED va ly do', async () => {
      const trip = await planOwnTrip();
      const cancelled = await service.cancel(trip.id, 'Khach bao huy', ACTOR);

      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.cancellationReason).toBe('Khach bao huy');
      expect(cancelled.cancelledAt).not.toBeNull();

      const readBack = await service.getTrip(trip.id);
      expect(readBack.id).toBe(trip.id);
      expect((await service.listTrips()).map((entry) => entry.id)).toContain(trip.id);
    });

    it('kho KHONG cung cap duong xoa cung nao', () => {
      const surface = [
        ...Object.getOwnPropertyNames(Object.getPrototypeOf(trips)),
        ...Object.getOwnPropertyNames(Object.getPrototypeOf(service)),
      ];
      for (const forbidden of ['delete', 'remove', 'destroy', 'hardDelete', 'purge']) {
        expect(surface, forbidden).not.toContain(forbidden);
      }
    });

    it('huy lan hai khong ghi de ly do cu — no la mot lan bam thua', async () => {
      const trip = await planOwnTrip();
      await service.cancel(trip.id, 'Ly do that', ACTOR);
      await expect(service.cancel(trip.id, 'Ly do khac', ACTOR)).rejects.toMatchObject({
        reason: 'CANCEL_ALREADY_CANCELLED',
      });
      expect((await service.getTrip(trip.id)).cancellationReason).toBe('Ly do that');
    });

    it('chuyen DA DOI SOAT thi khong huy — phai dung chung tu dieu chinh', async () => {
      const trip = await planOwnTrip();
      const vehicle = await registerVehicle('29H-100.12');
      const driver = await registerDriver('Lai Xe A', '0900000103');
      await service.assign(trip.id, { vehicleId: vehicle.id, driverId: driver.id }, ACTOR);
      await service.transition(trip.id, 'IN_TRANSIT', ACTOR);
      await service.transition(trip.id, 'DELIVERED', ACTOR);
      await service.transition(trip.id, 'RECONCILED', ACTOR);

      await expect(service.cancel(trip.id, 'Doi y', ACTOR)).rejects.toMatchObject({
        reason: 'CANCEL_TRIP_RECONCILED',
      });
    });

    /**
     * `#168 B6` — DUONG VONG bi dong o tang MIEN, khong chi o schema HTTP.
     *
     * Truoc task nay `service.transition(id, 'CANCELLED')` chay tron: no goi `setStatus()`, ma
     * `setStatus()` KHONG ghi `cancelledAt` lan `cancellationReason`. Ket qua la mot chuyen mang
     * trang thai `CANCELLED` MA KHONG CO LY DO va khong co moc thoi gian — mot ban ghi ma `GD-02`
     * ("huy thay cho xoa") sinh ra de ngan.
     *
     * Bai nay do o tang service chu khong o controller vi mot cong dat o controller chi bao ve dung
     * mot route.
     */
    it('#168 B6: chuyen trang thai chung KHONG huy duoc chuyen', async () => {
      const trip = await planOwnTrip();

      await expect(service.transition(trip.id, 'CANCELLED', ACTOR)).rejects.toMatchObject({
        reason: 'TRIP_CANCEL_REQUIRES_DEDICATED_PATH',
      });

      // Va quan trong hon ca ma loi: chuyen KHONG bi doi trang thai.
      const after = await service.getTrip(trip.id);
      expect(after.status).toBe('PLANNED');
      expect(after.cancelledAt).toBeNull();
      expect(after.cancellationReason).toBeNull();
    });

    it('#168 B6: duong huy RIENG van chay, va van ghi day du ly do + moc', async () => {
      const trip = await planOwnTrip();
      const cancelled = await service.cancel(trip.id, 'Khach bao huy', ACTOR);

      expect(cancelled.status).toBe('CANCELLED');
      expect(cancelled.cancellationReason).toBe('Khach bao huy');
      expect(cancelled.cancelledAt).not.toBeNull();
    });

    it('#168 B6: cong huy khong chan cac canh vong doi binh thuong', async () => {
      const trip = await planOwnTrip();
      const vehicle = await registerVehicle('29H-100.13');
      const driver = await registerDriver('Lai Xe B', '0900000104');
      await service.assign(trip.id, { vehicleId: vehicle.id, driverId: driver.id }, ACTOR);

      expect((await service.transition(trip.id, 'IN_TRANSIT', ACTOR)).status).toBe('IN_TRANSIT');
      expect((await service.transition(trip.id, 'DELIVERED', ACTOR)).status).toBe('DELIVERED');
      expect((await service.transition(trip.id, 'RECONCILED', ACTOR)).status).toBe('RECONCILED');
    });
  });

  // ASSIGNMENT-002
  describe('ASSIGNMENT-002: doi lai xe GIUA CHUYEN', () => {
    it('ban phan cong cu duoc GIU va dong lai; ban moi dang hieu luc', async () => {
      const trip = await planOwnTrip();
      const vehicle = await registerVehicle('29H-200.20');
      const driverA = await registerDriver('Lai Xe A', '0900000201');
      const driverB = await registerDriver('Lai Xe B', '0900000202');

      await service.assign(trip.id, { vehicleId: vehicle.id, driverId: driverA.id }, ACTOR);
      await service.transition(trip.id, 'IN_TRANSIT', ACTOR);
      await service.assign(trip.id, { vehicleId: vehicle.id, driverId: driverB.id }, ACTOR);

      const history = await service.assignmentHistory(trip.id);
      expect(history).toHaveLength(2);

      const closed = history.filter((entry) => entry.effectiveTo !== null);
      const active = history.filter((entry) => entry.effectiveTo === null);
      expect(closed).toHaveLength(1);
      expect(closed[0]?.driverId).toBe(driverA.id);
      expect(active).toHaveLength(1);
      expect(active[0]?.driverId).toBe(driverB.id);
    });

    it('chuyen VAN o IN_TRANSIT sau khi doi lai xe — doi nguoi khong lam lui trang thai', async () => {
      const trip = await planOwnTrip();
      const vehicle = await registerVehicle('29H-200.21');
      const driverA = await registerDriver('Lai Xe A', '0900000211');
      const driverB = await registerDriver('Lai Xe B', '0900000212');

      await service.assign(trip.id, { vehicleId: vehicle.id, driverId: driverA.id }, ACTOR);
      await service.transition(trip.id, 'IN_TRANSIT', ACTOR);
      await service.assign(trip.id, { vehicleId: vehicle.id, driverId: driverB.id }, ACTOR);

      expect((await service.getTrip(trip.id)).status).toBe('IN_TRANSIT');
    });

    it('phan cong Y HET ban dang hieu luc thi KHONG sinh ban ghi moi', async () => {
      const trip = await planOwnTrip();
      const vehicle = await registerVehicle('29H-200.22');
      const driver = await registerDriver('Lai Xe A', '0900000221');

      await service.assign(trip.id, { vehicleId: vehicle.id, driverId: driver.id }, ACTOR);
      await service.assign(trip.id, { vehicleId: vehicle.id, driverId: driver.id }, ACTOR);

      expect(await service.assignmentHistory(trip.id)).toHaveLength(1);
    });

    it('chuyen da o diem cuoi thi khong phan cong lai duoc', async () => {
      const trip = await planOwnTrip();
      const vehicle = await registerVehicle('29H-200.23');
      const driver = await registerDriver('Lai Xe A', '0900000231');
      await service.cancel(trip.id, 'Huy', ACTOR);

      await expect(
        service.assign(trip.id, { vehicleId: vehicle.id, driverId: driver.id }, ACTOR),
      ).rejects.toMatchObject({ reason: 'ASSIGNMENT_TRIP_TERMINAL' });
    });
  });

  // DRIVER-VIEW-001 / DRIVER-VIEW-002
  describe('be mat lai xe', () => {
    const DRIVER_A_USER = 'user-lai-xe-a';
    const DRIVER_B_USER = 'user-lai-xe-b';

    async function twoDriversOneTripEach() {
      const vehicle = await registerVehicle('29H-300.30');
      const driverA = await registerDriver('Lai Xe A', '0900000301', DRIVER_A_USER);
      const driverB = await registerDriver('Lai Xe B', '0900000302', DRIVER_B_USER);

      const tripA = await planOwnTrip('CH-A');
      const tripB = await planOwnTrip('CH-B');
      await service.assign(tripA.id, { vehicleId: vehicle.id, driverId: driverA.id }, ACTOR);
      await service.assign(tripB.id, { vehicleId: vehicle.id, driverId: driverB.id }, ACTOR);

      return { tripA, tripB, driverA, driverB, vehicle };
    }

    it('DRIVER-VIEW-001: khong payload nao cua lai xe chua truong doanh thu', async () => {
      const { tripA } = await twoDriversOneTripEach();

      const list = await service.listDriverTrips(DRIVER_A_USER);
      const detail = await service.getDriverTrip(DRIVER_A_USER, tripA.id);

      for (const payload of [list, detail]) {
        for (const key of deepKeys(payload)) {
          expect(MONEY_SHAPED.test(key), `ro ri truong tien: ${key}`).toBe(false);
        }
      }
      expect(JSON.stringify(list)).not.toContain('4500000');
      expect(JSON.stringify(detail)).not.toContain('4500000');
    });

    it('DRIVER-VIEW-001: van co du thong tin de lam viec', async () => {
      const { tripA } = await twoDriversOneTripEach();
      const detail = await service.getDriverTrip(DRIVER_A_USER, tripA.id);

      expect(detail.id).toBe(tripA.id);
      expect(detail.code).toBe('CH-A');
      expect(detail.status).toBe('PLANNED');
      expect(detail.originLabel).toBe('Ha Noi');
      expect(detail.destinationLabel).toBe('Thai Nguyen');
      expect(detail.vehicleRegistrationPlate).toBe('29H-300.30');
    });

    /**
     * `#168 B2` — mot lai xe phai NOP DUOC PHIEU DAU DAU TIEN cua minh chi bang khung nhin nay.
     *
     * `POST /transport/me/fuel/slips` doi `vehicleId`. Vai `SALE` khong co `transport.vehicle.read`
     * nen `/transport/vehicles` tra 403, va `DriverFuelSlipView` chi mang `vehicleId` tren phieu DA
     * nop. Neu truong nay khong o day thi mot lai xe chua tung nop phieu se khong bao gio nop duoc
     * phieu dau tien — mot ngo cut ma khong loi nao chi ra.
     */
    it('#168 B2: khung nhin mang vehicleId cua CHINH ban phan cong nay', async () => {
      const { tripA, vehicle } = await twoDriversOneTripEach();
      const detail = await service.getDriverTrip(DRIVER_A_USER, tripA.id);

      expect(detail.vehicleId).toBe(vehicle.id);
    });

    /**
     * `#168` acceptance 3 — noi hai dau lai voi nhau.
     *
     * Bai tren chung minh khung nhin CO truong do. Bai nay chung minh truong do DUNG LA thu ma
     * `POST /transport/me/fuel/slips` doi: neu mot ben doi `vehicleId` khong rong con ben kia tra
     * `null`, hai bai rieng le van xanh trong khi lai xe van khong nop duoc phieu dau tien.
     */
    it('#168 B2: vehicleId lay tu khung nhin qua duoc schema nop phieu dau', async () => {
      const { tripA } = await twoDriversOneTripEach();
      const detail = await service.getDriverTrip(DRIVER_A_USER, tripA.id);

      const parsed = driverFuelSubmitSchema.safeParse({
        tripId: detail.id,
        vehicleId: detail.vehicleId,
        businessDate: detail.businessDate,
        litersUnits: 200_000,
        unitPrice: 21_000,
        totalAmount: 4_200_000,
        odometerKm: 120_000,
        correlationKey: 'IT-B2-phieu-dau-tien',
      });

      // Neu schema doi them truong, bai nay do voi thong bao noi ro truong nao — chu khong lang le
      // xanh nhu mot phep `expect(true)`.
      expect(parsed.error?.issues.map((issue) => issue.path.join('.')) ?? []).not.toContain(
        'vehicleId',
      );
    });

    it('#168 B2: them vehicleId KHONG keo mot truong tien nao vao be mat lai xe', async () => {
      const { tripA } = await twoDriversOneTripEach();

      const list = await service.listDriverTrips(DRIVER_A_USER);
      const detail = await service.getDriverTrip(DRIVER_A_USER, tripA.id);

      for (const payload of [list, detail]) {
        for (const key of deepKeys(payload)) {
          expect(MONEY_SHAPED.test(key), `ro ri truong tien: ${key}`).toBe(false);
        }
      }
    });

    it('#168 B2: lai xe A khong hoc duoc vehicleId qua chuyen cua lai xe B', async () => {
      const { tripB } = await twoDriversOneTripEach();

      // Cung mot chiec xe duoc gan cho ca hai chuyen trong fixture nay — nen phep thu that khong
      // phai "id co khac nhau khong", ma la "duong doc co mo ra khong".
      await expect(service.getDriverTrip(DRIVER_A_USER, tripB.id)).rejects.toMatchObject({
        reason: 'SELF_SCOPE_NOT_ASSIGNED',
      });
    });

    it('DRIVER-VIEW-002: lai xe A doi chuyen cua lai xe B thi bi TU CHOI', async () => {
      const { tripB } = await twoDriversOneTripEach();

      await expect(service.getDriverTrip(DRIVER_A_USER, tripB.id)).rejects.toMatchObject({
        reason: 'SELF_SCOPE_NOT_ASSIGNED',
      });
    });

    it('DRIVER-VIEW-002: danh sach cua lai xe A KHONG chua chuyen cua B', async () => {
      const { tripA, tripB } = await twoDriversOneTripEach();
      const ids = (await service.listDriverTrips(DRIVER_A_USER)).map((entry) => entry.id);
      expect(ids).toContain(tripA.id);
      expect(ids).not.toContain(tripB.id);
    });

    it('tai khoan chua noi voi ho so lai xe nao thi co ma ly do RIENG', async () => {
      await twoDriversOneTripEach();
      await expect(service.listDriverTrips('user-khong-phai-lai-xe')).rejects.toMatchObject({
        reason: 'SELF_SCOPE_NO_DRIVER_BINDING',
      });
    });

    it('lai xe doi trang thai chuyen CUA MINH duoc, va van khong thay tien', async () => {
      const { tripA } = await twoDriversOneTripEach();
      const updated = await service.updateDriverTripStatus(DRIVER_A_USER, tripA.id, 'IN_TRANSIT');

      expect(updated.status).toBe('IN_TRANSIT');
      for (const key of deepKeys(updated)) {
        expect(MONEY_SHAPED.test(key), key).toBe(false);
      }
    });

    it('lai xe KHONG doi duoc trang thai chuyen cua nguoi khac', async () => {
      const { tripB } = await twoDriversOneTripEach();
      await expect(
        service.updateDriverTripStatus(DRIVER_A_USER, tripB.id, 'IN_TRANSIT'),
      ).rejects.toMatchObject({ reason: 'SELF_SCOPE_NOT_ASSIGNED' });
    });

    it('lai xe KHONG doi duoc trang thai chuyen ma minh da bi thay the', async () => {
      const vehicle = await registerVehicle('29H-300.31');
      const driverA = await registerDriver('Lai Xe A', '0900000311', DRIVER_A_USER);
      const driverB = await registerDriver('Lai Xe B', '0900000312', DRIVER_B_USER);
      const trip = await planOwnTrip('CH-DOI-NGUOI');

      await service.assign(trip.id, { vehicleId: vehicle.id, driverId: driverA.id }, ACTOR);
      await service.assign(trip.id, { vehicleId: vehicle.id, driverId: driverB.id }, ACTOR);

      // A van DOC duoc chuyen minh da lai — do la lich su cua chinh minh...
      await expect(service.getDriverTrip(DRIVER_A_USER, trip.id)).resolves.toMatchObject({
        id: trip.id,
      });
      // ...nhung khong con quyen DOI trang thai no.
      await expect(
        service.updateDriverTripStatus(DRIVER_A_USER, trip.id, 'IN_TRANSIT'),
      ).rejects.toMatchObject({ reason: 'SELF_SCOPE_NOT_ASSIGNED' });
    });

    it('lai xe khong duoc nhay thang sang RECONCILED — do la cong cua ke toan', async () => {
      const { tripA } = await twoDriversOneTripEach();
      await service.updateDriverTripStatus(DRIVER_A_USER, tripA.id, 'IN_TRANSIT');
      await service.updateDriverTripStatus(DRIVER_A_USER, tripA.id, 'DELIVERED');

      await expect(
        service.updateDriverTripStatus(DRIVER_A_USER, tripA.id, 'RECONCILED'),
      ).rejects.toThrow(TransportDomainError);
    });
  });
});
