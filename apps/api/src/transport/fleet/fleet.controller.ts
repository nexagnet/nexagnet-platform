import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { z } from 'zod';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { transportActorOf } from '../transport-actor.js';
import {
  assignVehicleDriverSchema,
  createCustomerSchema,
  createDriverSchema,
  createPartnerSchema,
  createVehicleSchema,
  firstIssue,
  linkDriverAccountSchema,
  updateCustomerSchema,
  updateDriverSchema,
  updatePartnerSchema,
  updateVehicleSchema,
} from '../transport.schemas.js';
import { TransportAccountLinkDirectory, type AccountLinksView } from './account-link-directory.js';
import { DriverAccountLinkService } from './driver-account-link.service.js';
import { FleetService } from './fleet.service.js';

/**
 * `TX-01 Fleet` qua HTTP.
 *
 * Moi route mang HAI khai bao quyen: `@Roles` (cong as-built cua nen tang, va la thu ma
 * `roles-coverage.spec.ts` duyet) va `@RequiresTransportAction` (cong cua mien). Xem
 * `transport-action.guard.ts` de biet vi sao ca hai deu can o giai doan cau bridge `GD-22`.
 */
@Controller('transport')
@UseGuards(TransportActionGuard)
export class FleetController {
  constructor(
    private readonly fleet: FleetService,
    /**
     * Hai provider nay phai nam trong `exports` cua `TransportModule`: controller dang ky o GOC
     * (`app-composition.ts`) chi thay danh sach export — tiem mot provider noi bo qua duoc `tsc` va
     * test don vi roi chet luc boot. `app.module.transport-core.boot.spec.ts` bat dieu do.
     */
    private readonly driverAccountLinks: DriverAccountLinkService,
    private readonly linkDirectory: TransportAccountLinkDirectory,
  ) {}

  /* ----------------------------- Xe ----------------------------- */

  @Get('vehicles')
  @RequiresTransportAction('transport.vehicle.read')
  listVehicles() {
    return this.fleet.listVehicles();
  }

  @Get('vehicles/:id')
  @RequiresTransportAction('transport.vehicle.read')
  getVehicle(@Param('id') id: string) {
    return this.guard(() => this.fleet.getVehicle(id));
  }

  @Post('vehicles')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.vehicle.manage')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createVehicle(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(createVehicleSchema, body);
    return this.guard(() => this.fleet.registerVehicle(input, transportActorOf(request)));
  }

  @Patch('vehicles/:id')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.vehicle.manage')
  updateVehicle(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const patch = this.parse(updateVehicleSchema, body);
    return this.guard(() => this.fleet.updateVehicle(id, patch, transportActorOf(request)));
  }

  @Post('vehicles/:id/driver')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.vehicle.manage')
  assignDriver(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const { driverId } = this.parse(assignVehicleDriverSchema, body);
    return this.guard(() =>
      this.fleet.assignDriverToVehicle(id, driverId, transportActorOf(request)),
    );
  }

  @Get('vehicles/:id/driver-history')
  @RequiresTransportAction('transport.vehicle.read')
  vehicleAssignmentHistory(@Param('id') id: string) {
    return this.guard(() => this.fleet.vehicleAssignmentHistory(id));
  }

  /* --------------------------- Lai xe --------------------------- */

  @Get('drivers')
  @RequiresTransportAction('transport.driver.read')
  listDrivers() {
    return this.fleet.listDrivers();
  }

  @Get('drivers/:id')
  @RequiresTransportAction('transport.driver.read')
  getDriver(@Param('id') id: string) {
    return this.guard(() => this.fleet.getDriver(id));
  }

  @Post('drivers')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.driver.manage')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createDriver(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(createDriverSchema, body);
    return this.guard(() => this.fleet.registerDriver(input, transportActorOf(request)));
  }

  @Patch('drivers/:id')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.driver.manage')
  updateDriver(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const patch = this.parse(updateDriverSchema, body);
    return this.guard(() => this.fleet.updateDriver(id, patch, transportActorOf(request)));
  }

  /* ----------------------- Noi tai khoan (#395) ----------------------- */

  /**
   * NOI / GO tai khoan dang nhap voi ho so lai xe — duong ghi DUY NHAT cua `Driver.authUserId`.
   *
   * Chi Giam doc: `transport.account_link.manage` nam trong `DIRECTOR_ONLY_ACTIONS` — cap pham vi
   * "viec cua chinh lai xe" cho mot con nguoi la mot thao tac phan quyen, khong phai sua ho so.
   * `@Roles('ADMIN')` noi cung mot dieu cho `roles-coverage.spec.ts` va cho truong hop route mat
   * guard mien (fail-closed).
   */
  @Put('drivers/:driverId/account')
  @Roles('ADMIN')
  @RequiresTransportAction('transport.account_link.manage')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  setDriverAccount(
    @Param('driverId') driverId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const { authUserId } = this.parse(linkDriverAccountSchema, body);
    return this.guard(() =>
      this.driverAccountLinks.setDriverAccount(driverId, authUserId, transportActorOf(request)),
    );
  }

  /**
   * Tai khoan nay DANG la ai trong mien van tai: ho so lai xe va/hoac ho so ben gop von.
   *
   * Cung ma quyen voi lan noi — chi nguoi noi duoc moi can biet ai dang noi voi ai. Cung nguon voi
   * mien phan quyen (`describeScopes`), nen man hinh quan tri va cau "Nguoi nay lam duoc gi?" khong
   * lech nhau duoc.
   */
  @Get('account-links/:authUserId')
  @Roles('ADMIN')
  @RequiresTransportAction('transport.account_link.manage')
  accountLinksOf(@Param('authUserId') authUserId: string): Promise<AccountLinksView> {
    return this.guard(() => this.linkDirectory.forUser(authUserId));
  }

  /* ------------------------ Khach hang -------------------------- */

  @Get('customers')
  @RequiresTransportAction('transport.customer.read')
  listCustomers() {
    return this.fleet.listCustomers();
  }

  @Get('customers/:id')
  @RequiresTransportAction('transport.customer.read')
  getCustomer(@Param('id') id: string) {
    return this.guard(() => this.fleet.getCustomer(id));
  }

  @Post('customers')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.customer.manage')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createCustomer(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(createCustomerSchema, body);
    return this.guard(() => this.fleet.createCustomer(input, transportActorOf(request)));
  }

  @Patch('customers/:id')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.customer.manage')
  updateCustomer(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const patch = this.parse(updateCustomerSchema, body);
    return this.guard(() => this.fleet.updateCustomer(id, patch, transportActorOf(request)));
  }

  /* -------------------------- Doi tac --------------------------- */

  @Get('partners')
  @RequiresTransportAction('transport.partner.read')
  listPartners() {
    return this.fleet.listPartners();
  }

  @Get('partners/:id')
  @RequiresTransportAction('transport.partner.read')
  getPartner(@Param('id') id: string) {
    return this.guard(() => this.fleet.getPartner(id));
  }

  @Post('partners')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.partner.manage')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createPartner(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(createPartnerSchema, body);
    return this.guard(() => this.fleet.createPartner(input, transportActorOf(request)));
  }

  @Patch('partners/:id')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.partner.manage')
  updatePartner(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const patch = this.parse(updatePartnerSchema, body);
    return this.guard(() => this.fleet.updatePartner(id, patch, transportActorOf(request)));
  }

  /* --------------------------- Noi bo --------------------------- */

  private parse<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
    return parsed.data as z.infer<S>;
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
