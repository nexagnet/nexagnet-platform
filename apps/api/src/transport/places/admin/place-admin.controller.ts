import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { z } from 'zod';
import { Roles } from '../../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../../auth/session.types.js';
import { RequiresTransportAction, TransportActionGuard } from '../../transport-action.guard.js';
import { firstIssue } from '../../transport.schemas.js';
import { placeAdminErrorToHttp } from './place-admin-error.js';
import {
  activatePlaceSchema,
  createPlaceSchema,
  deactivatePlaceSchema,
  listPlacesQuerySchema,
  makePrimaryDepotSchema,
  updatePlaceSchema,
} from './place-admin.schemas.js';
import { PlaceAdminService } from './place-admin.service.js';
import type { PlaceAdminView, PlaceHistoryEntry, PlaceWriteCaller } from './place-admin.types.js';
import { placeWriteCallerOf } from './place-write-caller.js';

/**
 * DIA DIEM VAN HANH qua HTTP (`#395`) — bai xe, kho khach hang, nha may doi tac: MOT so, la so hang
 * rao (`TransportGeofence`).
 *
 * Dang ky o GOC, thuoc `transport-proof` (so hang rao la cua capability do): controller chi tiem
 * `PlaceAdminService`, ma `TransportProofModule` EXPORT — mot provider noi bo tiem vao day se lam
 * tien trinh chet luc khoi dong (da xay ra that o `ProofReviewController`).
 *
 * HAI tang quyen:
 *   · route — `transport.geofence.read` de doc, `transport.geofence.manage` de ghi (ke toan KHONG co
 *     quyen ghi: hang rao cham chung cu LUC DOC, sua no doi ket luan cua ca nhung lan giao da xong);
 *   · trong ma — dia diem cua don vi khac la mot mat cua ho so phap nhan, nen tao / doi ten / bat /
 *     tat no doi THEM `transport.counterparty.manage` (hoi `canPerformTransportAction` tren chinh
 *     nguoi dang goi, cung vai khoi diem + quyen rieng voi cong route).
 */
@Controller('transport/places/admin')
@UseGuards(TransportActionGuard)
export class PlaceAdminController {
  constructor(private readonly places: PlaceAdminService) {}

  @Get()
  @RequiresTransportAction('transport.geofence.read')
  list(@Query() query: unknown): Promise<readonly PlaceAdminView[]> {
    const input = this.parse(listPlacesQuerySchema, query);
    return this.guard(() =>
      this.places.list({
        ...(input.kind === undefined ? {} : { kind: input.kind }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.q === undefined ? {} : { q: input.q }),
      }),
    );
  }

  @Post()
  @Roles('ADMIN')
  @RequiresTransportAction('transport.geofence.manage')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest): Promise<PlaceAdminView> {
    const input = this.parse(createPlaceSchema, body);
    return this.guard(() =>
      this.places.create(
        {
          kind: input.kind,
          name: input.name,
          point: input.point,
          radiusMetres: input.radiusMetres,
          ...(input.address === undefined ? {} : { address: input.address }),
          ...(input.note === undefined ? {} : { note: input.note }),
          ...(input.owner === undefined ? {} : { owner: input.owner }),
          ...(input.siteId === undefined ? {} : { siteId: input.siteId }),
        },
        this.callerOf(request),
      ),
    );
  }

  @Patch(':id')
  @Roles('ADMIN')
  @RequiresTransportAction('transport.geofence.manage')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<PlaceAdminView> {
    const input = this.parse(updatePlaceSchema, body);
    return this.guard(() =>
      this.places.update(
        id,
        {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.address === undefined ? {} : { address: input.address }),
          ...(input.point === undefined ? {} : { point: input.point }),
          ...(input.radiusMetres === undefined ? {} : { radiusMetres: input.radiusMetres }),
          ...(input.note === undefined ? {} : { note: input.note }),
          ...(input.acknowledgeOpenWork === undefined
            ? {}
            : { acknowledgeOpenWork: input.acknowledgeOpenWork }),
        },
        this.callerOf(request),
      ),
    );
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @Roles('ADMIN')
  @RequiresTransportAction('transport.geofence.manage')
  deactivate(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<PlaceAdminView> {
    const input = this.parse(deactivatePlaceSchema, body);
    return this.guard(() =>
      this.places.deactivate(
        id,
        {
          reason: input.reason,
          ...(input.acknowledgeOpenWork === undefined
            ? {}
            : { acknowledgeOpenWork: input.acknowledgeOpenWork }),
        },
        this.callerOf(request),
      ),
    );
  }

  @Post(':id/activate')
  @HttpCode(200)
  @Roles('ADMIN')
  @RequiresTransportAction('transport.geofence.manage')
  activate(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<PlaceAdminView> {
    this.parse(activatePlaceSchema, body ?? {});
    return this.guard(() => this.places.activate(id, this.callerOf(request)));
  }

  @Post(':id/make-primary-depot')
  @HttpCode(200)
  @Roles('ADMIN')
  @RequiresTransportAction('transport.geofence.manage')
  makePrimaryDepot(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<PlaceAdminView> {
    const input = this.parse(makePrimaryDepotSchema, body ?? {});
    return this.guard(() =>
      this.places.makePrimaryDepot(
        id,
        input.acknowledgeOpenWork === undefined
          ? {}
          : { acknowledgeOpenWork: input.acknowledgeOpenWork },
        this.callerOf(request),
      ),
    );
  }

  @Get(':id/history')
  @RequiresTransportAction('transport.geofence.read')
  history(@Param('id') id: string): Promise<readonly PlaceHistoryEntry[]> {
    return this.guard(() => this.places.history(id));
  }

  /* --------------------------- Noi bo --------------------------- */

  /** Quyen THU HAI hoi tren CHINH nguoi dang goi — xem `placeWriteCallerOf`. */
  private callerOf(request: AuthenticatedRequest): PlaceWriteCaller {
    return placeWriteCallerOf(request);
  }

  private parse<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
    return parsed.data as z.infer<S>;
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return placeAdminErrorToHttp(error);
    }
  }
}
