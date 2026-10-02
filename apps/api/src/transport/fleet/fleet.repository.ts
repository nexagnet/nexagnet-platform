import { randomUUID } from 'node:crypto';
import type { TransactionTrail } from '../../audit/audit-trail.js';
import type { VehicleOperationalControl } from '../asset-ownership/asset-ownership.types.js';
import type {
  Driver,
  DriverStatus,
  PartnerRoleKind,
  PartyStatus,
  TransportCustomer,
  TransportPartner,
  Vehicle,
  VehicleDriverAssignment,
  VehicleStatus,
} from '../transport.types.js';

export interface CreateVehicleInput {
  readonly registrationPlate: string;
  readonly vehicleClass: string;
  readonly allowedPayloadKg?: number | null;
  readonly currentOdoKm?: number;
  readonly status?: VehicleStatus;
}

/**
 * Hai truong `TX-08` co mat o day va KHONG co o `updateVehicleSchema`.
 *
 * Do la ranh gioi co chu dich: tang LUU TRU phai ghi duoc hai cot nay (chung nam tren bang xe),
 * nhung be mat HTTP cua doi xe khong duoc mo chung ra. Duong ghi duy nhat di qua
 * `AssetOwnershipService`, vi doi quyen dieu hanh va khai so dang ky day du la hai quyet dinh phai
 * duoc kiem cung bat bien tong so huu — `asset-ownership.service.spec.ts` khoa dieu do.
 */
export interface UpdateVehicleInput {
  readonly vehicleClass?: string;
  readonly allowedPayloadKg?: number | null;
  readonly currentOdoKm?: number;
  readonly status?: VehicleStatus;
  readonly operationalControl?: VehicleOperationalControl;
  readonly ownershipRegisterComplete?: boolean;
}

export interface CreateDriverInput {
  readonly fullName: string;
  readonly phone: string;
  readonly licenceClass: string;
  readonly licenceExpiry: string;
  readonly status?: DriverStatus;
  readonly authUserId?: string | null;
}

export interface UpdateDriverInput {
  readonly fullName?: string;
  readonly phone?: string;
  readonly licenceClass?: string;
  readonly licenceExpiry?: string;
  readonly status?: DriverStatus;
  readonly authUserId?: string | null;
}

export interface CreateCustomerInput {
  readonly name: string;
  readonly phone?: string | null;
  readonly address?: string | null;
  readonly taxCode?: string | null;
  readonly status?: PartyStatus;
}

export interface UpdateCustomerInput {
  readonly name?: string;
  readonly phone?: string | null;
  readonly address?: string | null;
  readonly taxCode?: string | null;
  readonly status?: PartyStatus;
}

export interface CreatePartnerInput {
  readonly name: string;
  readonly phone?: string | null;
  readonly roles: readonly PartnerRoleKind[];
  readonly status?: PartyStatus;
}

export interface UpdatePartnerInput {
  readonly name?: string;
  readonly phone?: string | null;
  readonly roles?: readonly PartnerRoleKind[];
  readonly status?: PartyStatus;
}

/**
 * Kho cua `TX-01 Fleet` — xe, lai xe, gan lai xe phu trach xe, va hai danh muc doi tuong ma mot
 * chuyen tro toi (khach hang van tai, doi tac).
 *
 * TACH KHOI `TripRepository` theo dung bounded context cua T1 §4. Guardrail
 * `NO_CROSS_CONTEXT_REPOSITORY_WRITE` hom nay chua cuong che duoc bang CI (T1 §16 ghi ro la "can
 * quy uoc thu muc"), nen quy uoc thu muc chinh la cach cuong che dau tien: service cua chuyen
 * khong ghi duoc vao bang cua doi xe vi no khong duoc tiem kho nay de ghi.
 */
export abstract class FleetRepository {
  abstract createVehicle(input: CreateVehicleInput): Promise<Vehicle>;
  abstract updateVehicle(id: string, patch: UpdateVehicleInput): Promise<Vehicle | null>;
  abstract findVehicle(id: string): Promise<Vehicle | null>;
  abstract findVehicleByPlate(plate: string): Promise<Vehicle | null>;
  abstract listVehicles(): Promise<Vehicle[]>;

  abstract createDriver(input: CreateDriverInput): Promise<Driver>;
  /**
   * `trail` (`#395`): dau vet cua lan ghi — kho Prisma goi no TRONG cung giao dich (noi / go tai
   * khoan dang nhap la cap / thu pham vi cua mot con nguoi). Kho bo nho khong goi.
   */
  abstract updateDriver(
    id: string,
    patch: UpdateDriverInput,
    trail?: TransactionTrail<Driver>,
  ): Promise<Driver | null>;
  abstract findDriver(id: string): Promise<Driver | null>;
  abstract findDriverByAuthUserId(authUserId: string): Promise<Driver | null>;
  abstract listDrivers(): Promise<Driver[]>;

  /**
   * Gan lai xe phu trach mot xe. Ban dang hieu luc cua CUNG XE DO phai duoc dong lai truoc —
   * "khong chong lap thoi gian cho cung mot xe" (T1 §5).
   */
  abstract assignDriverToVehicle(
    vehicleId: string,
    driverId: string,
    at: Date,
  ): Promise<VehicleDriverAssignment>;
  abstract listVehicleDriverAssignments(vehicleId?: string): Promise<VehicleDriverAssignment[]>;
  /**
   * XE ma lai xe nay DANG cam — `null` khi khong co ban phan cong nao con hieu luc.
   *
   * MOT truy van, khong phai mot lan doc ca bang roi loc: `#267` H4 doi xe phai duoc SUY tu trang
   * thai phan cong chu khong tu than yeu cau, nen duong nay nam tren duong chay cua moi lan lai xe
   * bam `Tao chuyen`. Loc trong bo nho se quet ca lich su phan cong cua toan doi xe cho mot cau
   * hoi ve mot nguoi.
   *
   * "DANG", khong phai "TUNG" — va o day khac han `wasDriverEverAssignedToRun` cua `#243`. Cau
   * hoi kia la mot cau ve QUYEN doc/ghi lich su; cau nay la mot cau ve HIEN TAI: chiec xe nao se
   * duoc ghi vao vong chay sap tao. Mot ban phan cong da dong khong tra loi duoc cau do.
   */
  abstract activeVehicleForDriver(driverId: string): Promise<string | null>;
  /**
   * LAI XE dang phu trach mot xe — chieu nguoc cua `activeVehicleForDriver`.
   *
   * Tra ve MOT MANG chu khong phai mot ban ghi, va do khong phai su thieu dut khoat: lap ke hoach
   * phai PHAN BIET duoc "xe khong co ai cam" voi "xe dang co hai ban phan cong hieu luc". Hai tinh
   * huong do dan toi hai cau tra loi khac nhau cho nguoi dieu hanh, nen gop ca hai vao `null` se
   * lam mat dung cai ho can biet. Cung ly le voi `DEPOT_AMBIGUOUS`.
   *
   * Unique mot phan `TransportVehicleAssignment_activeVehicle_key` khien truong hop hai ban hieu
   * luc KHONG xay ra duoc tren Postgres. Duong doc nay van dem, vi kho trong bo nho khong co rang
   * buoc do, va vi mot bat bien chi thuc su duoc bao ve khi co nguoi doc no.
   */
  abstract activeDriverAssignmentsForVehicle(
    vehicleId: string,
  ): Promise<readonly VehicleDriverAssignment[]>;

  abstract createCustomer(input: CreateCustomerInput): Promise<TransportCustomer>;
  abstract updateCustomer(
    id: string,
    patch: UpdateCustomerInput,
  ): Promise<TransportCustomer | null>;
  abstract findCustomer(id: string): Promise<TransportCustomer | null>;
  abstract listCustomers(): Promise<TransportCustomer[]>;

  abstract createPartner(input: CreatePartnerInput): Promise<TransportPartner>;
  abstract updatePartner(id: string, patch: UpdatePartnerInput): Promise<TransportPartner | null>;
  abstract findPartner(id: string): Promise<TransportPartner | null>;
  abstract listPartners(): Promise<TransportPartner[]>;
}

const iso = (at: Date): string => at.toISOString();

/** Bo trung lap va giu thu tu khai bao — vai doi tac la mot TAP, khong phai mot danh sach. */
const normalizeRoles = (roles: readonly PartnerRoleKind[]): readonly PartnerRoleKind[] => [
  ...new Set(roles),
];

/**
 * Bo cac khoa `undefined` truoc khi trai len ban ghi cu.
 *
 * `{ ...current, ...patch }` voi `patch.phone === undefined` se ghi de `phone` thanh `undefined` —
 * tuc mot lan sua ten se lang le xoa so dien thoai. Day la cach mot PATCH bien thanh mot PUT ma
 * khong ai co y.
 */
function prune<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export class InMemoryFleetRepository extends FleetRepository {
  private readonly vehicles = new Map<string, Vehicle>();
  private readonly drivers = new Map<string, Driver>();
  private readonly vehicleDriverAssignments: VehicleDriverAssignment[] = [];
  private readonly customers = new Map<string, TransportCustomer>();
  private readonly partners = new Map<string, TransportPartner>();

  constructor(private readonly now: () => Date = () => new Date()) {
    super();
  }

  async createVehicle(input: CreateVehicleInput): Promise<Vehicle> {
    const at = iso(this.now());
    const vehicle: Vehicle = {
      id: randomUUID(),
      registrationPlate: input.registrationPlate,
      vehicleClass: input.vehicleClass,
      allowedPayloadKg: input.allowedPayloadKg ?? null,
      currentOdoKm: input.currentOdoKm ?? 0,
      status: input.status ?? 'IDLE',
      // `TX-08`: mot xe moi la xe B dieu hanh cho toi khi co nguoi noi khac, va so dang ky so huu
      // cua no chua duoc khai la day du. Ca hai mac dinh trung voi `DEFAULT` cua Postgres.
      operationalControl: 'INTERNAL_OPERATED',
      ownershipRegisterComplete: false,
      createdAt: at,
      updatedAt: at,
    };
    this.vehicles.set(vehicle.id, vehicle);
    return vehicle;
  }

  async updateVehicle(id: string, patch: UpdateVehicleInput): Promise<Vehicle | null> {
    const current = this.vehicles.get(id);
    if (!current) return null;
    const next: Vehicle = { ...current, ...prune(patch), updatedAt: iso(this.now()) };
    this.vehicles.set(id, next);
    return next;
  }

  async findVehicle(id: string): Promise<Vehicle | null> {
    return this.vehicles.get(id) ?? null;
  }

  async findVehicleByPlate(plate: string): Promise<Vehicle | null> {
    return [...this.vehicles.values()].find((entry) => entry.registrationPlate === plate) ?? null;
  }

  async listVehicles(): Promise<Vehicle[]> {
    return [...this.vehicles.values()];
  }

  async createDriver(input: CreateDriverInput): Promise<Driver> {
    const at = iso(this.now());
    const driver: Driver = {
      id: randomUUID(),
      fullName: input.fullName,
      phone: input.phone,
      licenceClass: input.licenceClass,
      licenceExpiry: input.licenceExpiry,
      status: input.status ?? 'ACTIVE',
      authUserId: input.authUserId ?? null,
      createdAt: at,
      updatedAt: at,
    };
    this.drivers.set(driver.id, driver);
    return driver;
  }

  async updateDriver(id: string, patch: UpdateDriverInput): Promise<Driver | null> {
    const current = this.drivers.get(id);
    if (!current) return null;
    const next: Driver = { ...current, ...prune(patch), updatedAt: iso(this.now()) };
    this.drivers.set(id, next);
    return next;
  }

  async findDriver(id: string): Promise<Driver | null> {
    return this.drivers.get(id) ?? null;
  }

  async findDriverByAuthUserId(authUserId: string): Promise<Driver | null> {
    return [...this.drivers.values()].find((entry) => entry.authUserId === authUserId) ?? null;
  }

  async listDrivers(): Promise<Driver[]> {
    return [...this.drivers.values()];
  }

  async assignDriverToVehicle(
    vehicleId: string,
    driverId: string,
    at: Date,
  ): Promise<VehicleDriverAssignment> {
    const stamp = iso(at);
    for (const [index, entry] of this.vehicleDriverAssignments.entries()) {
      if (entry.vehicleId === vehicleId && entry.effectiveTo === null) {
        this.vehicleDriverAssignments[index] = { ...entry, effectiveTo: stamp };
      }
    }
    const assignment: VehicleDriverAssignment = {
      id: randomUUID(),
      vehicleId,
      driverId,
      effectiveFrom: stamp,
      effectiveTo: null,
      createdAt: stamp,
    };
    this.vehicleDriverAssignments.push(assignment);
    return assignment;
  }

  async listVehicleDriverAssignments(vehicleId?: string): Promise<VehicleDriverAssignment[]> {
    return this.vehicleDriverAssignments.filter(
      (entry) => vehicleId === undefined || entry.vehicleId === vehicleId,
    );
  }

  async activeVehicleForDriver(driverId: string): Promise<string | null> {
    const active = this.vehicleDriverAssignments.find(
      (entry) => entry.driverId === driverId && entry.effectiveTo === null,
    );
    return active?.vehicleId ?? null;
  }

  async activeDriverAssignmentsForVehicle(
    vehicleId: string,
  ): Promise<readonly VehicleDriverAssignment[]> {
    return this.vehicleDriverAssignments.filter(
      (entry) => entry.vehicleId === vehicleId && entry.effectiveTo === null,
    );
  }

  async createCustomer(input: CreateCustomerInput): Promise<TransportCustomer> {
    const at = iso(this.now());
    const customer: TransportCustomer = {
      id: randomUUID(),
      name: input.name,
      phone: input.phone ?? null,
      address: input.address ?? null,
      taxCode: input.taxCode ?? null,
      status: input.status ?? 'ACTIVE',
      createdAt: at,
      updatedAt: at,
    };
    this.customers.set(customer.id, customer);
    return customer;
  }

  async updateCustomer(id: string, patch: UpdateCustomerInput): Promise<TransportCustomer | null> {
    const current = this.customers.get(id);
    if (!current) return null;
    const next: TransportCustomer = { ...current, ...prune(patch), updatedAt: iso(this.now()) };
    this.customers.set(id, next);
    return next;
  }

  async findCustomer(id: string): Promise<TransportCustomer | null> {
    return this.customers.get(id) ?? null;
  }

  async listCustomers(): Promise<TransportCustomer[]> {
    return [...this.customers.values()];
  }

  async createPartner(input: CreatePartnerInput): Promise<TransportPartner> {
    const at = iso(this.now());
    const partner: TransportPartner = {
      id: randomUUID(),
      name: input.name,
      phone: input.phone ?? null,
      roles: normalizeRoles(input.roles),
      status: input.status ?? 'ACTIVE',
      createdAt: at,
      updatedAt: at,
    };
    this.partners.set(partner.id, partner);
    return partner;
  }

  async updatePartner(id: string, patch: UpdatePartnerInput): Promise<TransportPartner | null> {
    const current = this.partners.get(id);
    if (!current) return null;
    const next: TransportPartner = {
      ...current,
      ...prune(patch),
      roles: patch.roles ? normalizeRoles(patch.roles) : current.roles,
      updatedAt: iso(this.now()),
    };
    this.partners.set(id, next);
    return next;
  }

  async findPartner(id: string): Promise<TransportPartner | null> {
    return this.partners.get(id) ?? null;
  }

  async listPartners(): Promise<TransportPartner[]> {
    return [...this.partners.values()];
  }
}
