import { Injectable } from '@nestjs/common';
import type { TransactionTrail } from '../../audit/audit-trail.js';
import type { PrismaService } from '../../config/prisma.service.js';
import { ACTIVE_VEHICLE_ASSIGNMENT, isActiveAssignmentConflict } from '../storage-conflict.js';
import { TransportDomainError } from '../transport.errors.js';
import type {
  Driver,
  PartnerRoleKind,
  TransportCustomer,
  TransportPartner,
  Vehicle,
  VehicleDriverAssignment,
} from '../transport.types.js';
import {
  FleetRepository,
  type CreateCustomerInput,
  type CreateDriverInput,
  type CreatePartnerInput,
  type CreateVehicleInput,
  type UpdateCustomerInput,
  type UpdateDriverInput,
  type UpdatePartnerInput,
  type UpdateVehicleInput,
} from './fleet.repository.js';

/** Kieu tho tu Prisma — chi lay nhung cot ma mien nay doc. */
interface VehicleRow {
  id: string;
  registrationPlate: string;
  vehicleClass: string;
  allowedPayloadKg: number | null;
  currentOdoKm: number;
  status: string;
  operationalControl: string;
  ownershipRegisterComplete: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface DriverRow {
  id: string;
  fullName: string;
  phone: string;
  licenceClass: string;
  licenceExpiry: string;
  status: string;
  authUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AssignmentRow {
  id: string;
  vehicleId: string;
  driverId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
}

interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  taxCode: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface PartnerRow {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  roles: { role: string }[];
}

const iso = (value: Date): string => value.toISOString();

const toVehicle = (row: VehicleRow): Vehicle => ({
  id: row.id,
  registrationPlate: row.registrationPlate,
  vehicleClass: row.vehicleClass,
  allowedPayloadKg: row.allowedPayloadKg,
  currentOdoKm: row.currentOdoKm,
  status: row.status as Vehicle['status'],
  operationalControl: row.operationalControl as Vehicle['operationalControl'],
  ownershipRegisterComplete: row.ownershipRegisterComplete,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const toDriver = (row: DriverRow): Driver => ({
  id: row.id,
  fullName: row.fullName,
  phone: row.phone,
  licenceClass: row.licenceClass,
  licenceExpiry: row.licenceExpiry,
  status: row.status as Driver['status'],
  authUserId: row.authUserId,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const toVehicleAssignment = (row: AssignmentRow): VehicleDriverAssignment => ({
  id: row.id,
  vehicleId: row.vehicleId,
  driverId: row.driverId,
  effectiveFrom: iso(row.effectiveFrom),
  effectiveTo: row.effectiveTo ? iso(row.effectiveTo) : null,
  createdAt: iso(row.createdAt),
});

const toCustomer = (row: CustomerRow): TransportCustomer => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  address: row.address,
  taxCode: row.taxCode,
  status: row.status as TransportCustomer['status'],
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const toPartner = (row: PartnerRow): TransportPartner => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  roles: row.roles.map((entry) => entry.role as PartnerRoleKind),
  status: row.status as TransportPartner['status'],
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

function prune<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

const uniqueRoles = (roles: readonly PartnerRoleKind[]): PartnerRoleKind[] => [...new Set(roles)];

/*
 * Prisma sinh kieu delegate theo tung ban client; goi qua mot ham tra `any` de tang nay khong vo
 * khi ai do chua chay `prisma generate`. Bu lai, moi hang tu DB deu di qua mot ham `to*` CO KIEU
 * ben tren — nen ranh gioi kieu that su nam o do, khong bien mat.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const model = (prisma: PrismaService, name: string): any =>
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (prisma as unknown as Record<string, any>)[name];

@Injectable()
export class PrismaFleetRepository extends FleetRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async createVehicle(input: CreateVehicleInput): Promise<Vehicle> {
    return toVehicle(
      await model(this.prisma, 'transportVehicle').create({
        data: {
          registrationPlate: input.registrationPlate,
          vehicleClass: input.vehicleClass,
          allowedPayloadKg: input.allowedPayloadKg ?? null,
          currentOdoKm: input.currentOdoKm ?? 0,
          status: input.status ?? 'IDLE',
        },
      }),
    );
  }

  async updateVehicle(id: string, patch: UpdateVehicleInput): Promise<Vehicle | null> {
    const row = await model(this.prisma, 'transportVehicle').update({
      where: { id },
      data: prune(patch),
    });
    return row ? toVehicle(row) : null;
  }

  async findVehicle(id: string): Promise<Vehicle | null> {
    const row = await model(this.prisma, 'transportVehicle').findUnique({ where: { id } });
    return row ? toVehicle(row) : null;
  }

  async findVehicleByPlate(plate: string): Promise<Vehicle | null> {
    const row = await model(this.prisma, 'transportVehicle').findUnique({
      where: { registrationPlate: plate },
    });
    return row ? toVehicle(row) : null;
  }

  async listVehicles(): Promise<Vehicle[]> {
    const rows: VehicleRow[] = await model(this.prisma, 'transportVehicle').findMany({
      orderBy: { registrationPlate: 'asc' },
    });
    return rows.map(toVehicle);
  }

  async createDriver(input: CreateDriverInput): Promise<Driver> {
    return toDriver(
      await model(this.prisma, 'transportDriver').create({
        data: {
          fullName: input.fullName,
          phone: input.phone,
          licenceClass: input.licenceClass,
          licenceExpiry: input.licenceExpiry,
          status: input.status ?? 'ACTIVE',
          authUserId: input.authUserId ?? null,
        },
      }),
    );
  }

  async updateDriver(
    id: string,
    patch: UpdateDriverInput,
    trail?: TransactionTrail<Driver>,
  ): Promise<Driver | null> {
    if (!trail) return this.writeDriver(this.prisma, id, patch);
    // Dau vet trong CUNG giao dich: hong thi lan noi / go tai khoan lui theo.
    return this.prisma.$transaction(async (tx) => {
      const driver = await this.writeDriver(tx as unknown as PrismaService, id, patch);
      if (driver) await trail(driver, tx);
      return driver;
    });
  }

  private async writeDriver(
    client: PrismaService,
    id: string,
    patch: UpdateDriverInput,
  ): Promise<Driver | null> {
    const row = await model(client, 'transportDriver').update({
      where: { id },
      data: prune(patch),
    });
    return row ? toDriver(row) : null;
  }

  async findDriver(id: string): Promise<Driver | null> {
    const row = await model(this.prisma, 'transportDriver').findUnique({ where: { id } });
    return row ? toDriver(row) : null;
  }

  async findDriverByAuthUserId(authUserId: string): Promise<Driver | null> {
    const row = await model(this.prisma, 'transportDriver').findUnique({ where: { authUserId } });
    return row ? toDriver(row) : null;
  }

  async listDrivers(): Promise<Driver[]> {
    const rows: DriverRow[] = await model(this.prisma, 'transportDriver').findMany({
      orderBy: { fullName: 'asc' },
    });
    return rows.map(toDriver);
  }

  /**
   * DONG ban dang hieu luc roi MO ban moi, trong MOT giao dich.
   *
   * Neu tach lam hai lan ghi, mot lan hong giua chung se de lai hoac hai ban cung hieu luc (khong
   * biet ai dang phu trach xe), hoac khong ban nao (xe bong nhien khong co ai). Ca hai deu la
   * trang thai ma bat bien "khong chong lap thoi gian cho cung mot xe" cam.
   *
   * Giao dich chi lo duoc cho MOT nguoi ghi (T2.1/F2). Bat bien "mot ban hieu luc moi xe" do unique
   * MOT PHAN `TransportVehicleAssignment_activeVehicle_key` giu; doan `catch` chi dich loi cua no.
   */
  async assignDriverToVehicle(
    vehicleId: string,
    driverId: string,
    at: Date,
  ): Promise<VehicleDriverAssignment> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const scoped = tx as unknown as PrismaService;
        await model(scoped, 'transportVehicleAssignment').updateMany({
          where: { vehicleId, effectiveTo: null },
          data: { effectiveTo: at },
        });
        const row = await model(scoped, 'transportVehicleAssignment').create({
          data: { vehicleId, driverId, effectiveFrom: at, effectiveTo: null },
        });
        return toVehicleAssignment(row);
      });
    } catch (error) {
      if (isActiveAssignmentConflict(error, ACTIVE_VEHICLE_ASSIGNMENT)) {
        throw TransportDomainError.conflict(
          'VEHICLE_ACTIVE_ASSIGNMENT_CONFLICT',
          `Xe ${vehicleId} vua duoc nguoi khac gan lai xe phu trach — tai lai roi thu lai`,
        );
      }
      throw error;
    }
  }

  async listVehicleDriverAssignments(vehicleId?: string): Promise<VehicleDriverAssignment[]> {
    const rows: AssignmentRow[] = await model(this.prisma, 'transportVehicleAssignment').findMany({
      where: vehicleId === undefined ? {} : { vehicleId },
      orderBy: { effectiveFrom: 'asc' },
    });
    return rows.map(toVehicleAssignment);
  }

  async activeDriverAssignmentsForVehicle(
    vehicleId: string,
  ): Promise<readonly VehicleDriverAssignment[]> {
    // `@@index([vehicleId, effectiveTo])` phuc vu dung truy van nay — khong quet lich su cua xe.
    //
    // `take: 2` chu khong phai `findFirst`: mot hang la du de tra loi "ai dang cam xe nay", nhung
    // KHONG du de tra loi "co dung mot nguoi khong". Hai hang la so nho nhat phan biet duoc ba
    // tinh huong (khong ai / dung mot / nhieu hon mot) ma van khong bao gio doc ca bang.
    const rows: AssignmentRow[] = await model(this.prisma, 'transportVehicleAssignment').findMany({
      where: { vehicleId, effectiveTo: null },
      orderBy: { effectiveFrom: 'asc' },
      take: 2,
    });
    return rows.map(toVehicleAssignment);
  }

  async activeVehicleForDriver(driverId: string): Promise<string | null> {
    // `@@index([driverId])` tren `TransportVehicleAssignment` phuc vu dung truy van nay.
    const row: AssignmentRow | null = await model(
      this.prisma,
      'transportVehicleAssignment',
    ).findFirst({
      where: { driverId, effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
    });
    return row?.vehicleId ?? null;
  }

  async createCustomer(input: CreateCustomerInput): Promise<TransportCustomer> {
    return toCustomer(
      await model(this.prisma, 'transportCustomer').create({
        data: {
          name: input.name,
          phone: input.phone ?? null,
          address: input.address ?? null,
          taxCode: input.taxCode ?? null,
          status: input.status ?? 'ACTIVE',
        },
      }),
    );
  }

  async updateCustomer(id: string, patch: UpdateCustomerInput): Promise<TransportCustomer | null> {
    const row = await model(this.prisma, 'transportCustomer').update({
      where: { id },
      data: prune(patch),
    });
    return row ? toCustomer(row) : null;
  }

  async findCustomer(id: string): Promise<TransportCustomer | null> {
    const row = await model(this.prisma, 'transportCustomer').findUnique({ where: { id } });
    return row ? toCustomer(row) : null;
  }

  async listCustomers(): Promise<TransportCustomer[]> {
    const rows: CustomerRow[] = await model(this.prisma, 'transportCustomer').findMany({
      orderBy: { name: 'asc' },
    });
    return rows.map(toCustomer);
  }

  async createPartner(input: CreatePartnerInput): Promise<TransportPartner> {
    return toPartner(
      await model(this.prisma, 'transportPartner').create({
        data: {
          name: input.name,
          phone: input.phone ?? null,
          status: input.status ?? 'ACTIVE',
          roles: { create: uniqueRoles(input.roles).map((role) => ({ role })) },
        },
        include: { roles: true },
      }),
    );
  }

  /**
   * Doi VAI = thay ca tap, trong mot giao dich.
   *
   * Xoa roi tao lai chu khong `upsert` tung dong: nguoi goi gui MOT TAP vai mong muon, va mot lan
   * ghi phai dua he thong ve dung tap do. `upsert` tung dong chi them ma khong bao gio bo, nen mot
   * doi tac bi rut vai se giu vai cu mai mai.
   */
  async updatePartner(id: string, patch: UpdatePartnerInput): Promise<TransportPartner | null> {
    const { roles, ...rest } = patch;
    return this.prisma.$transaction(async (tx) => {
      const scoped = tx as unknown as PrismaService;
      if (roles !== undefined) {
        await model(scoped, 'transportPartnerRole').deleteMany({ where: { partnerId: id } });
        await model(scoped, 'transportPartnerRole').createMany({
          data: uniqueRoles(roles).map((role) => ({ partnerId: id, role })),
        });
      }
      const row = await model(scoped, 'transportPartner').update({
        where: { id },
        data: prune(rest),
        include: { roles: true },
      });
      return row ? toPartner(row) : null;
    });
  }

  async findPartner(id: string): Promise<TransportPartner | null> {
    const row = await model(this.prisma, 'transportPartner').findUnique({
      where: { id },
      include: { roles: true },
    });
    return row ? toPartner(row) : null;
  }

  async listPartners(): Promise<TransportPartner[]> {
    const rows: PartnerRow[] = await model(this.prisma, 'transportPartner').findMany({
      include: { roles: true },
      orderBy: { name: 'asc' },
    });
    return rows.map(toPartner);
  }
}
