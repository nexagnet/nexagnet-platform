import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { transportActorOf } from '../transport-actor.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  COUNTERPARTY_MANAGE_REQUIRED_MESSAGE,
  canManageCounterpartiesOf,
} from '../places/admin/place-write-caller.js';
import { firstIssue } from '../transport.schemas.js';
import { toCircle, type Geofence, type GeofenceSubjectKind } from './geofence.repository.js';
import { GeofenceService } from './geofence.service.js';
import { OperationalProofService } from './operational-proof.service.js';
import type { OperationalProofView } from './operational-proof.types.js';
import { registerGeofenceSchema, withdrawProofSchema } from './proof.schemas.js';

/**
 * BE MAT NGUOI DUYET cua chung cu van hanh — doc, rut, va khai hang rao.
 *
 * ============================================================================================
 * BA QUYEN, KHONG PHAI MOT
 * ============================================================================================
 *
 *   · `transport.proof.read`     -> doc TOM TAT. Ke toan CO. Khong mot toa do nao di ra.
 *   · `transport.proof.withdraw` -> bia mo mot chung cu. Ke toan KHONG CO.
 *   · `transport.geofence.*`     -> doc/khai hang rao. Khai la quyen van hanh, doc thi rong hon.
 *
 * Vi sao `read` va `withdraw` khong dung chung mot ma: doc chung cu la viec doi soat hang ngay;
 * rut mot chung cu la go bo bang chung cua mot lan giao da xay ra. Va lai xe KHONG BAO GIO co
 * `withdraw`, ke ca voi chung cu cua chinh minh — mot nguoi xoa duoc bang chung cua chinh minh
 * thi cai con lai khong con la bang chung.
 *
 * ============================================================================================
 * HANG RAO DUOC CHAM LUC DOC, KHONG LUU SAN
 * ============================================================================================
 *
 * `viewsForTrip` nhan danh sach hang rao va tinh phan quyet ngay tai lan doc. Nen mot khach sua
 * ban kinh kho hom nay se thay phan quyet doi cho MOI chung cu cu, khong phai chi cho nhung
 * chung cu lap sau do. Do la hanh vi dung — va cung la ly do `transport.geofence.manage` bi tach
 * khoi ke toan: no doi duoc ket luan ve nhung lan giao da xong.
 */
@Controller('transport')
@UseGuards(TransportActionGuard)
export class ProofReviewController {
  /**
   * CHI TIEM NHUNG GI `TransportProofModule` DA EXPORT.
   *
   * Controller nay duoc dang ky o GOC (`app-composition.ts`), nen no chi thay nhung gi `AppModule`
   * thay. Tiem mot provider NOI BO cua module (vi du token chinh sach) se bien dich duoc, qua het
   * test don vi, qua ca bai composition — roi lam tien trinh chet luc khoi dong. Da xay ra that
   * mot lan; xem khoi chu thich dau `geofence.service.ts`.
   */
  constructor(
    private readonly proofs: OperationalProofService,
    private readonly geofences: GeofenceService,
  ) {}

  /**
   * TOM TAT chung cu cua mot chuyen — cau tra loi cho "lan giao nay co bang chung khong".
   *
   * `OperationalProofView` KHONG CO mot truong nao chua duoc toa do; do la mot tinh chat kiem duoc
   * luc bien dich, khong phai mot loi hua o day. Ai can toa do tho di qua
   * `transport.location.history.read`, va de lai mot dong o so quyet dinh.
   */
  @Get('trips/:tripId/proofs')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.proof.read')
  async forTrip(@Param('tripId') tripId: string): Promise<readonly OperationalProofView[]> {
    const fences = await this.geofences.listActive();
    return this.guard(() => this.proofs.viewsForTrip(tripId, fences.map(toCircle)));
  }

  @Post('proofs/:proofId/withdraw')
  @Roles('ADMIN')
  @RequiresTransportAction('transport.proof.withdraw')
  async withdraw(
    @Req() request: AuthenticatedRequest,
    @Param('proofId') proofId: string,
    @Body() body: unknown,
  ): Promise<{ id: string; withdrawnAt: Date | null; withdrawnBy: string | null }> {
    const parsed = withdrawProofSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    // `transportActorOf` la nguon DUY NHAT cua "ai da rut" — no khong bao gio doc mot header.
    const actorId = transportActorOf(request);
    const withdrawn = await this.guard(() =>
      this.proofs.withdraw({ proofId, actorId, reason: parsed.data.reason }),
    );
    return {
      id: withdrawn.id,
      withdrawnAt: withdrawn.withdrawnAt,
      withdrawnBy: withdrawn.withdrawnBy,
    };
  }

  @Get('geofences')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.geofence.read')
  list(): Promise<readonly Geofence[]> {
    return this.guard(() => this.geofences.listActive());
  }

  @Post('geofences')
  @Roles('ADMIN')
  @RequiresTransportAction('transport.geofence.manage')
  async register(@Req() request: AuthenticatedRequest, @Body() body: unknown): Promise<Geofence> {
    const parsed = registerGeofenceSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
    const input = parsed.data;

    // Toa do, khoang ban kinh va hinh dang chu the deu duoc kiem trong `GeofenceService`: chung la
    // LUAT NGHIEP VU, va nguong cua chung den tu chinh sach cua khach.
    return this.guard(async () => {
      requireSiteManageIfOwnedByOthers(request, input.subjectKind);
      return this.geofences.register({
        label: input.label,
        subjectKind: input.subjectKind,
        subjectId: input.subjectId ?? null,
        latitude: input.latitude,
        longitude: input.longitude,
        radiusMetres: input.radiusMetres,
        note: input.note ?? null,
        recordedBy: transportActorOf(request),
      });
    });
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}

/** Chu the la dia diem cua MOT DON VI KHAC (khach hang, doi tac) — khong phai cua chinh cong ty. */
const OWNED_BY_OTHERS: ReadonlySet<GeofenceSubjectKind> = new Set([
  'COUNTERPARTY_SITE',
  'CUSTOMER',
]);

/**
 * Route cu KHONG duoc la cua sau cua man "Dia diem van hanh" (`#395`): khai hang rao len dia diem
 * cua mot don vi khac doi quyen THU HAI `transport.counterparty.manage`, dung luat
 * `PlaceAdminService` ap cho cung ket qua. Bai xe, cay xang, diem tam cua chinh cong ty van chi can
 * `transport.geofence.manage` nhu truoc.
 */
function requireSiteManageIfOwnedByOthers(
  request: AuthenticatedRequest,
  kind: GeofenceSubjectKind,
): void {
  if (!OWNED_BY_OTHERS.has(kind) || canManageCounterpartiesOf(request)) return;
  throw TransportDomainError.denied(
    'PLACE_SITE_REQUIRES_COUNTERPARTY_MANAGE',
    COUNTERPARTY_MANAGE_REQUIRED_MESSAGE,
  );
}
