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
import { firstIssue } from '../transport.schemas.js';
import { AssetOwnershipService } from './asset-ownership.service.js';
import {
  closeInterestSchema,
  createStakeholderSchema,
  declareRegisterSchema,
  linkStakeholderAccountSchema,
  recordInterestSchema,
  setOperationalControlSchema,
  updateStakeholderSchema,
} from './asset-ownership.schemas.js';

/**
 * SO DANG KY SO HUU qua HTTP — be mat VAN HANH/QUAN TRI (`TX-08`, #242 E5).
 *
 * Cung khuon hai lop quyen nhu `FleetController`: `@Roles` la cong as-built cua nen tang (thu ma
 * `roles-coverage.spec.ts` duyet), `@RequiresTransportAction` la cong cua mien.
 *
 * KHONG route nao o day tra ve `authUserId` cua ben huu quan — phep doi sang `hasAccount` xay ra
 * ngay tai ranh gioi kho, nen khong route nao co the lo no ra.
 */
@Controller('transport/asset-ownership')
@UseGuards(TransportActionGuard)
export class AssetOwnershipController {
  constructor(private readonly ownership: AssetOwnershipService) {}

  /* ---------------------------- Ben huu quan ---------------------------- */

  @Get('stakeholders')
  @RequiresTransportAction('transport.asset_ownership.read')
  listStakeholders() {
    return this.ownership.listStakeholders();
  }

  @Get('stakeholders/:id')
  @RequiresTransportAction('transport.asset_ownership.read')
  getStakeholder(@Param('id') id: string) {
    return this.guard(() => this.ownership.getStakeholder(id));
  }

  @Post('stakeholders')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.asset_ownership.manage')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createStakeholder(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(createStakeholderSchema, body);
    return this.guard(() => this.ownership.createStakeholder(input, transportActorOf(request)));
  }

  @Patch('stakeholders/:id')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.asset_ownership.manage')
  updateStakeholder(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const patch = this.parse(updateStakeholderSchema, body);
    return this.guard(() => this.ownership.updateStakeholder(id, patch, transportActorOf(request)));
  }

  /**
   * NOI/GO tai khoan dang nhap cho mot ho so ben huu quan.
   *
   * Chi `ADMIN`. Ke toan quan ly duoc ho so va ty le so huu — do la du lieu tai san — nhung CAP
   * QUYEN DOC cho mot con nguoi la mot thao tac phan quyen, va no thuoc ve quan tri he thong.
   *
   * `#395`: hanh dong rieng `transport.account_link.manage` (chi Giam doc, `DIRECTOR_ONLY_ACTIONS`)
   * thay cho `.manage` cua so dang ky. Truoc day chinh sach "chi ADMIN" chi song trong `@Roles`
   * duoi day; nay bang vai cua mien noi cung mot dieu, nen cong cua mien tu no la du.
   */
  @Put('stakeholders/:id/account')
  @Roles('ADMIN')
  @RequiresTransportAction('transport.account_link.manage')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  setAccount(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(linkStakeholderAccountSchema, body);
    return this.guard(() =>
      this.ownership.setStakeholderAccount(id, input.authUserId, transportActorOf(request)),
    );
  }

  /* ----------------------------- So dang ky ----------------------------- */

  @Get('vehicles/:vehicleId')
  @RequiresTransportAction('transport.asset_ownership.read')
  register(@Param('vehicleId') vehicleId: string) {
    return this.guard(() => this.ownership.register(vehicleId));
  }

  @Post('vehicles/:vehicleId/interests')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.asset_ownership.manage')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  recordInterest(
    @Param('vehicleId') vehicleId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = this.parse(recordInterestSchema, body);
    return this.guard(() =>
      this.ownership.recordInterest(
        vehicleId,
        {
          stakeholderId: input.stakeholderId,
          ownershipBasisPoints: input.ownershipBasisPoints,
          effectiveFrom: new Date(input.effectiveFrom),
          note: input.note ?? null,
        },
        transportActorOf(request),
      ),
    );
  }

  /**
   * DONG mot quyen loi. Duong nay KHONG nhan `vehicleId`, va do la co y: khoa la chinh quyen loi,
   * nen khong co cach nao chi nham sang mot chiec xe khac.
   */
  @Post('interests/:interestId/close')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.asset_ownership.manage')
  closeInterest(
    @Param('interestId') interestId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = this.parse(closeInterestSchema, body);
    return this.guard(() =>
      this.ownership.closeInterest(
        interestId,
        { effectiveTo: new Date(input.effectiveTo), note: input.note ?? null },
        transportActorOf(request),
      ),
    );
  }

  @Put('vehicles/:vehicleId/register')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.asset_ownership.manage')
  declareRegister(
    @Param('vehicleId') vehicleId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = this.parse(declareRegisterSchema, body);
    return this.guard(() =>
      this.ownership.declareRegisterComplete(vehicleId, input.complete, transportActorOf(request)),
    );
  }

  @Put('vehicles/:vehicleId/operational-control')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.asset_ownership.manage')
  setOperationalControl(
    @Param('vehicleId') vehicleId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = this.parse(setOperationalControlSchema, body);
    return this.guard(() =>
      this.ownership.setOperationalControl(
        vehicleId,
        input.operationalControl,
        transportActorOf(request),
      ),
    );
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
