import { Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { BusinessDateError, assertBusinessDate } from '../business-date.js';
import { TransportDomainError } from '../transport.errors.js';
import type {
  Driver,
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

/**
 * Ho so lai xe qua DICH VU DOI XE — KHONG co `authUserId` (`#395` §1.8).
 *
 * Noi tai khoan voi ho so la mot thao tac PHAN QUYEN (mo pham vi "viec cua chinh lai xe"), va no co
 * luat rieng (vai Lai xe, tai khoan dang hoat dong, khong noi hai ho so) — duong ghi duy nhat la
 * `DriverAccountLinkService`. Kho (`CreateDriverInput`) VAN giu truong nay cho may gieo, fixture va
 * chinh dich vu noi.
 *
 * Chan o tang KIEU, khong boc o luc chay: be mat HTTP da chan bang schema `strict` (`400`), con cac
 * kich ban boot chay tu chuoi (khong qua `tsc`) dung duong nay de dung mot lai xe DA noi san.
 */
export type RegisterDriverInput = Omit<CreateDriverInput, 'authUserId'>;
export type UpdateDriverProfileInput = Omit<UpdateDriverInput, 'authUserId'>;

/**
 * `TX-01 Fleet` — xe, lai xe, gan lai xe phu trach xe, va hai danh muc doi tuong ma chuyen tro toi.
 *
 * Service la noi DUY NHAT ghi audit cho cac thay doi cua doi xe. Dat o kho thi moi ban hien thuc
 * (memory, Prisma) phai nho lam, va ban nao quen thi mat dau vet ma khong do o dau.
 */
@Injectable()
export class FleetService {
  constructor(
    private readonly repository: FleetRepository,
    private readonly audit: AuditLogService,
    /**
     * `@Optional()` theo dung bat bien cua nen tang: quan sat KHONG duoc la dieu kien de nghiep vu
     * chay. Thieu telemetry thi trace nhat di, viec van xong.
     */
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  /* ----------------------------- Xe ----------------------------- */

  async registerVehicle(input: CreateVehicleInput, actor: string): Promise<Vehicle> {
    const existing = await this.repository.findVehicleByPlate(input.registrationPlate);
    if (existing) {
      throw TransportDomainError.conflict(
        'VEHICLE_PLATE_TAKEN',
        `Bien so ${input.registrationPlate} da co trong doi xe`,
      );
    }

    const vehicle = await this.repository.createVehicle(input);
    await this.audit.append({
      actor,
      action: 'transport.vehicle.create',
      entityType: 'TransportVehicle',
      entityId: vehicle.id,
      after: vehicle,
    });
    this.telemetry?.stateChange({
      entity: 'TransportVehicle',
      entityId: vehicle.id,
      from: null,
      to: vehicle.status,
    });
    return vehicle;
  }

  async updateVehicle(id: string, patch: UpdateVehicleInput, actor: string): Promise<Vehicle> {
    const before = await this.requireVehicle(id);
    const after = await this.repository.updateVehicle(id, patch);
    if (!after) throw this.vehicleNotFound(id);

    await this.audit.append({
      actor,
      action: 'transport.vehicle.update',
      entityType: 'TransportVehicle',
      entityId: id,
      before,
      after,
    });
    this.telemetry?.stateChange({
      entity: 'TransportVehicle',
      entityId: id,
      from: before.status,
      to: after.status,
    });
    return after;
  }

  listVehicles(): Promise<Vehicle[]> {
    return this.repository.listVehicles();
  }

  getVehicle(id: string): Promise<Vehicle> {
    return this.requireVehicle(id);
  }

  /* --------------------------- Lai xe --------------------------- */

  async registerDriver(input: RegisterDriverInput, actor: string): Promise<Driver> {
    const driver = await this.repository.createDriver({
      ...input,
      licenceExpiry: this.requireLicenceExpiry(input.licenceExpiry),
    });
    await this.audit.append({
      actor,
      action: 'transport.driver.create',
      entityType: 'TransportDriver',
      entityId: driver.id,
      after: driver,
    });
    return driver;
  }

  async updateDriver(id: string, patch: UpdateDriverProfileInput, actor: string): Promise<Driver> {
    const before = await this.requireDriver(id);
    const after = await this.repository.updateDriver(id, {
      ...patch,
      ...(patch.licenceExpiry === undefined
        ? {}
        : { licenceExpiry: this.requireLicenceExpiry(patch.licenceExpiry) }),
    });
    if (!after) throw this.driverNotFound(id);

    await this.audit.append({
      actor,
      action: 'transport.driver.update',
      entityType: 'TransportDriver',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  listDrivers(): Promise<Driver[]> {
    return this.repository.listDrivers();
  }

  getDriver(id: string): Promise<Driver> {
    return this.requireDriver(id);
  }

  /* ------------------- Gan lai xe phu trach xe ------------------- */

  /**
   * Gan lai xe phu trach mot xe — tang DOI XE, khong phai tang chuyen.
   *
   * Ban dang hieu luc bi DONG LAI, khong bi ghi de: cau hoi "thang truoc xe nay ai phu trach" phai
   * tra loi duoc, va no chi tra loi duoc neu ban cu con nam do.
   */
  async assignDriverToVehicle(
    vehicleId: string,
    driverId: string,
    actor: string,
  ): Promise<VehicleDriverAssignment> {
    await this.requireVehicle(vehicleId);
    await this.requireDriver(driverId);

    const assignment = await this.repository.assignDriverToVehicle(vehicleId, driverId, new Date());
    await this.audit.append({
      actor,
      action: 'transport.vehicle.assign_driver',
      entityType: 'TransportVehicleAssignment',
      entityId: assignment.id,
      after: assignment,
    });
    return assignment;
  }

  vehicleAssignmentHistory(vehicleId: string): Promise<VehicleDriverAssignment[]> {
    return this.repository.listVehicleDriverAssignments(vehicleId);
  }

  /* ------------------------ Khach hang -------------------------- */

  async createCustomer(input: CreateCustomerInput, actor: string): Promise<TransportCustomer> {
    const customer = await this.repository.createCustomer(input);
    await this.audit.append({
      actor,
      action: 'transport.customer.create',
      entityType: 'TransportCustomer',
      entityId: customer.id,
      after: customer,
    });
    return customer;
  }

  async updateCustomer(
    id: string,
    patch: UpdateCustomerInput,
    actor: string,
  ): Promise<TransportCustomer> {
    const before = await this.requireCustomer(id);
    const after = await this.repository.updateCustomer(id, patch);
    if (!after) throw this.customerNotFound(id);

    await this.audit.append({
      actor,
      action: 'transport.customer.update',
      entityType: 'TransportCustomer',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  listCustomers(): Promise<TransportCustomer[]> {
    return this.repository.listCustomers();
  }

  getCustomer(id: string): Promise<TransportCustomer> {
    return this.requireCustomer(id);
  }

  /* -------------------------- Doi tac --------------------------- */

  async createPartner(input: CreatePartnerInput, actor: string): Promise<TransportPartner> {
    this.requireRoles(input.roles);
    const partner = await this.repository.createPartner(input);
    await this.audit.append({
      actor,
      action: 'transport.partner.create',
      entityType: 'TransportPartner',
      entityId: partner.id,
      after: partner,
    });
    return partner;
  }

  async updatePartner(
    id: string,
    patch: UpdatePartnerInput,
    actor: string,
  ): Promise<TransportPartner> {
    const before = await this.requirePartner(id);
    if (patch.roles !== undefined) this.requireRoles(patch.roles);

    const after = await this.repository.updatePartner(id, patch);
    if (!after) throw this.partnerNotFound(id);

    await this.audit.append({
      actor,
      action: 'transport.partner.update',
      entityType: 'TransportPartner',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  listPartners(): Promise<TransportPartner[]> {
    return this.repository.listPartners();
  }

  getPartner(id: string): Promise<TransportPartner> {
    return this.requirePartner(id);
  }

  /* ------------------------- Kiem tra --------------------------- */

  private requireLicenceExpiry(value: string): string {
    try {
      return assertBusinessDate(value);
    } catch (error) {
      if (error instanceof BusinessDateError) {
        throw TransportDomainError.invalid('LICENCE_EXPIRY_INVALID', error.message);
      }
      throw error;
    }
  }

  private requireRoles(roles: readonly string[]): void {
    if (roles.length === 0) {
      throw TransportDomainError.invalid(
        'PARTNER_ROLES_EMPTY',
        'Doi tac phai co it nhat mot vai (nha xe cho thue va/hoac nguon mang don)',
      );
    }
  }

  private vehicleNotFound(id: string): TransportDomainError {
    return TransportDomainError.notFound('VEHICLE_NOT_FOUND', `Khong tim thay xe ${id}`);
  }

  private driverNotFound(id: string): TransportDomainError {
    return TransportDomainError.notFound('DRIVER_NOT_FOUND', `Khong tim thay lai xe ${id}`);
  }

  private customerNotFound(id: string): TransportDomainError {
    return TransportDomainError.notFound('CUSTOMER_NOT_FOUND', `Khong tim thay khach hang ${id}`);
  }

  private partnerNotFound(id: string): TransportDomainError {
    return TransportDomainError.notFound('PARTNER_NOT_FOUND', `Khong tim thay doi tac ${id}`);
  }

  private async requireVehicle(id: string): Promise<Vehicle> {
    const vehicle = await this.repository.findVehicle(id);
    if (!vehicle) throw this.vehicleNotFound(id);
    return vehicle;
  }

  private async requireDriver(id: string): Promise<Driver> {
    const driver = await this.repository.findDriver(id);
    if (!driver) throw this.driverNotFound(id);
    return driver;
  }

  private async requireCustomer(id: string): Promise<TransportCustomer> {
    const customer = await this.repository.findCustomer(id);
    if (!customer) throw this.customerNotFound(id);
    return customer;
  }

  private async requirePartner(id: string): Promise<TransportPartner> {
    const partner = await this.repository.findPartner(id);
    if (!partner) throw this.partnerNotFound(id);
    return partner;
  }
}
