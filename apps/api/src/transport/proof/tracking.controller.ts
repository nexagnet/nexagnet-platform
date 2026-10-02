import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  requestCanPerform,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { transportActorOf } from '../transport-actor.js';
import { toLocationHealthView, type VehicleLocationHealthView } from './location-health.js';
import { LocationHealthService } from './location-health.service.js';
import { TrackingService } from './tracking.service.js';
import type { LocationTrackView, TrackingSummaryView } from './tracking.types.js';

/**
 * BE MAT VAN HANH cua bam vi tri — HAI tuyen, va chung co HAI quyen khac nhau.
 *
 * Do la toan bo diem cua controller nay:
 *
 *   · `GET /trips/:tripId/tracking`  -> `transport.tracking.read`
 *     Tra ve `TrackingSummaryView` — dem, quang duong, co rui ro. Kieu do KHONG CO mot truong nao
 *     co the chua mot toa do. Ke toan doi soat duoc bang no.
 *
 *   · `GET /tracking/sessions/:id/track` -> `transport.location.history.read`
 *     Tra ve duong di THO. Ke toan KHONG co ma nay (`ACCOUNTING_DENIED`), va moi lan doc de lai
 *     mot dong o diem quyet dinh `tracking.history_read`.
 *
 * Neu hai tuyen nay dung chung mot quyen, cau "khong lo duong di chi tiet cua mot con nguoi cho
 * vai khong can biet" se chi con la mot loi hua trong tai lieu.
 */
@Controller('transport')
@UseGuards(TransportActionGuard)
export class TrackingController {
  constructor(
    private readonly tracking: TrackingService,
    /**
     * `LocationHealthService` phai nam trong `exports` cua `TransportProofModule`.
     *
     * Controller nay dang ky o GOC (`app-composition.ts`), nen no CHI thay danh sach export cua
     * module — mot provider noi bo tiem vao day se qua `tsc`, qua test don vi, qua
     * `*.composition.spec.ts`, roi chet luc khoi dong that. Da xay ra roi; xem
     * `app.module.transport-proof.boot.spec.ts`.
     */
    private readonly health: LocationHealthService,
  ) {}

  @Get('trips/:tripId/tracking')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.tracking.read')
  summaries(@Param('tripId') tripId: string): Promise<readonly TrackingSummaryView[]> {
    return this.guard(() => this.tracking.summariesForTrip(tripId));
  }

  @Get('tracking/sessions/:sessionId/track')
  @Roles('ADMIN')
  @RequiresTransportAction('transport.location.history.read')
  track(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
  ): Promise<LocationTrackView> {
    // `transportActorOf` la nguon DUY NHAT cua "ai dang lam viec nay" — no khong bao gio doc mot
    // header. Ghi ten nguoi doc vao so quyet dinh la phan con lai cua cau tra loi cho "ai da xem
    // duong di cua ai".
    const actor = transportActorOf(request);
    return this.guard(() => this.tracking.trackForSession(sessionId, actor));
  }

  /**
   * SUC KHOE VI TRI cua mot chiec xe — `#297 T6`.
   *
   * `transport.tracking.read`, y nhu tuyen tom tat o tren, va KHONG mot ma quyen moi nao. Toa do
   * trong `lastKnown` bi che tru khi nguoi goi co `transport.location.history.read` — nen ke toan
   * (khong co ma do) doc duoc trang thai va tuoi ban cuoi ma khong doc duoc chiec xe dang o dau.
   */
  @Get('vehicles/:vehicleId/location-health')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.tracking.read')
  locationHealth(
    @Req() request: AuthenticatedRequest,
    @Param('vehicleId') vehicleId: string,
  ): Promise<VehicleLocationHealthView> {
    const canReadCoordinates = this.canReadCoordinates(request);
    return this.guard(async () =>
      toLocationHealthView(await this.health.forVehicle(vehicleId), { canReadCoordinates }),
    );
  }

  /**
   * Cung dieu kien mo dau voi `TransportActionGuard`: o che do khong-phien thi khong co danh tinh
   * nao de hoi va toan bo ung dung von khong xac thuc. Lech dieu kien voi cong kia se tao ra mot
   * che do chay ma mot nua so cong mo mot nua dong.
   *
   * `#395`: tap quyen HIEU LUC (vai khoi diem + quyen rieng) — xem `requestCanPerform`.
   */
  private canReadCoordinates(request: AuthenticatedRequest): boolean {
    return requestCanPerform(request, 'transport.location.history.read');
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
