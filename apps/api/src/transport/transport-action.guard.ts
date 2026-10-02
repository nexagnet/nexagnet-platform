import {
  applyDecorators,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isInternalServiceRequest } from '../auth/internal-service.guard.js';
import { DOMAIN_ACTION_GATE_KEY } from '../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/session.types.js';
import { loadFoundationEnv } from '../config/foundation-env.js';
import {
  ACTION_NOT_PERMITTED_MESSAGE,
  type TransportAccessErrorReason,
} from './permissions/transport-access-errors.js';
import { canPerformTransportAction } from './permissions/transport-permission-rules.js';
import { isStakeholderScopeAction, type TransportAction } from './transport-actions.js';
import {
  TransportDomainError,
  type TransportErrorKind,
  type TransportErrorReason,
} from './transport.errors.js';

export const TRANSPORT_ACTION_KEY = 'netviet.transport.action';

/**
 * Cong hanh dong cua mien van tai.
 *
 * Dang ky o CAP CONTROLLER (`@UseGuards`), khong phai `APP_GUARD` toan cuc: mot cong chi phuc vu
 * mot mien ma cam vao chuoi guard cua ca ung dung se chay cho ca nhung khach khong bat van tai —
 * va do la cach mot vertical lang le tro thanh nen tang.
 */
@Injectable()
export class TransportActionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Cung dieu kien voi `RolesGuard`: o che do khong-phien thi khong co danh tinh de kiem, va
    // toan bo ung dung von da khong xac thuc. Lech dieu kien voi `RolesGuard` se tao ra mot che do
    // chay ma mot nua so cong mo mot nua dong — trang thai kho suy luan nhat.
    if (loadFoundationEnv().AUTH_MODE !== 'session') return true;

    const action = this.reflector.getAllAndOverride<TransportAction | undefined>(
      TRANSPORT_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!action) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (isInternalServiceRequest(request)) return true;

    const user = request.authUser;
    if (!user) throw actionNotPermitted(action);

    /**
     * PHAM VI BEN HUU QUAN di qua tang vai — va do KHONG phai mot lo hong.
     *
     * Tang nay tra loi dung mot cau hoi: "vai cua nguoi nay co noi gi ve hanh dong do khong". Voi
     * `TX-08` cau tra loi la KHONG, va no la khong that: khong vai nen tang nao mang nghia "co
     * dong" (xem khoi `STAKEHOLDER_SCOPE_ACTIONS`). Bat mot cau hoi khong co cau tra loi phai tra
     * loi bang cach nhet nghia co dong vao `SALE` hay `MANAGER` la cach te nhat de dong cong nay.
     *
     * Cong THAT o duoi, va no chat hon mot vai: `AssetOwnershipScopeService.resolve()` doi mot hang
     * `TransportAssetStakeholder.authUserId` khop DUNG phien nay, con hieu luc, va no loc tung
     * `vehicleId` theo tap cua chinh nguoi do. Mot nguoi da dang nhap nhung khong phai ben huu quan
     * nhan `403` o do — khong doc duoc mot dong nao.
     *
     * Dieu kien de quy uoc nay dung: KHONG ma nao trong `STAKEHOLDER_SCOPE_ACTIONS` mo mot duong
     * ghi. `transport-actions.spec.ts` khoa dieu do bang mot bai doc chinh danh sach.
     */
    if (isStakeholderScopeAction(action)) return true;

    // Vai khoi diem + quyen rieng cua CHINH tai khoan nay, doc lai tu DB o moi yeu cau
    // (`validateSession`) — doi quyen co hieu luc ngay yeu cau ke tiep, khong phai dang nhap lai.
    if (!canPerformTransportAction(user, action)) throw actionNotPermitted(action);
    return true;
  }
}

/**
 * Than `403` cua cong hanh dong — cung hinh voi `transportErrorBody` (`statusCode`, `message`,
 * `error`, `reason`) cong them `detail.action`.
 *
 * `message` la cau cho NGUOI DUNG (co dau, khong ten ma); ma hanh dong nam o `detail.action` cho
 * man hinh va nguoi truc. Truoc `#395` ma hanh dong nam trong chinh cau chu — man hinh phai in
 * nguyen van mot chuoi nua Anh nua Viet khong dau.
 */
export interface TransportActionDeniedBody {
  readonly statusCode: 403;
  readonly message: string;
  readonly error: 'Forbidden';
  readonly reason: TransportAccessErrorReason;
  readonly detail: { readonly action: TransportAction };
}

export function actionNotPermitted(action: TransportAction): ForbiddenException {
  const body: TransportActionDeniedBody = {
    statusCode: 403,
    message: ACTION_NOT_PERMITTED_MESSAGE,
    error: 'Forbidden',
    reason: 'ACTION_NOT_PERMITTED',
    detail: { action },
  };
  return new ForbiddenException(body);
}

/**
 * Nguoi dang goi co lam duoc `action` khong — cho cac cho kiem quyen TRONG MA (khong qua guard),
 * vd che toa do trong mot khung nhin ma route van mo cho nguoi khong co quyen doc duong di.
 *
 * Cung dieu kien mo dau voi `TransportActionGuard`: o che do khong-phien thi khong co danh tinh de
 * hoi va toan bo ung dung von khong xac thuc — lech dieu kien voi cong kia se tao ra mot che do chay
 * ma mot nua so cong mo mot nua dong. Con o che do phien, cau tra loi la CUNG MOT cau tra loi voi
 * guard: `canPerformTransportAction` tren vai khoi diem + quyen rieng cua tai khoan (`#395`).
 */
export function requestCanPerform(request: AuthenticatedRequest, action: TransportAction): boolean {
  if (loadFoundationEnv().AUTH_MODE !== 'session') return true;
  const user = request.authUser;
  return user !== undefined && canPerformTransportAction(user, action);
}

/**
 * Khai HANH DONG MIEN ma mot route doi hoi — va giao CONG cua route cho mien.
 *
 * Truoc `#395` ham nay chi ghi hanh dong, va route qua HAI cong noi tiep: `@Roles` (vai phang cua
 * nen tang) roi `TransportActionGuard`. Chu thich cu da hua: *"khi `PG-02` dong, bang anh xa bi thay
 * bang mot lan tra permission, va KHONG route nao phai sua"*. `#395` giu dung loi hua do:
 *
 *   · `TRANSPORT_ACTION_KEY` — hanh dong cua route, nhu cu;
 *   · `DOMAIN_ACTION_GATE_KEY` — dau cua NEN TANG, gia tri la `TransportActionGuard`. `RolesGuard`
 *     thay dau VA thay guard nay trong chuoi guard cua route thi nhuong: cong duy nhat con lai la
 *     `canPerformTransportAction` (vai khoi diem + quyen rieng cua tung tai khoan).
 *
 * `@Roles` tren route van o nguyen — `roles-coverage.spec.ts` van duyet no, va no van la cong khi
 * route vi mot ly do nao do khong co `TransportActionGuard` (fail-closed, xem `RolesGuard`). Bang
 * vai khoi diem trong `transport-actions.ts` da mang MOI chinh sach truoc day chi song trong `@Roles`
 * (noi tai khoan, dao quyet toan, ghi bu chung tu), va
 * `permissions/transport-behaviour-preservation.spec.ts` chung minh tren TUNG route, TUNG vai rang
 * chuoi cong moi tra loi dung nhu chuoi cu.
 *
 * Khai SAU lop guard vi gia tri cua dau la chinh lop do.
 */
export const RequiresTransportAction = (action: TransportAction): MethodDecorator =>
  applyDecorators(
    SetMetadata(TRANSPORT_ACTION_KEY, action),
    SetMetadata(DOMAIN_ACTION_GATE_KEY, TransportActionGuard),
  );

/**
 * Danh tinh nguoi dang goi, dung cho be mat lai xe.
 *
 * NEM khi khong co phien thay vi roi ve mot gia tri mac dinh: pham vi "chuyen cua chinh toi" khong
 * co nghia gi neu khong biet "toi" la ai, va mot mac dinh im lang o day se mo toan bo be mat lai
 * xe cho bat ky ai o che do khong-phien.
 */
export function requireAuthUserId(request: AuthenticatedRequest): string {
  const id = request.authUser?.id;
  if (!id) {
    throw new UnauthorizedException('Be mat lai xe doi mot phien dang nhap');
  }
  return id;
}

/**
 * Mot cho DUY NHAT doi loi mien -> ma HTTP.
 *
 * Rai `try/catch` tung route se dan toi cung mot tinh huong nghiep vu tra 404 o route nay va 500 o
 * route kia, tuy ai viet route do va viet luc nao.
 */
export function transportErrorToHttp(error: unknown): never {
  if (!(error instanceof TransportDomainError)) throw error;
  switch (error.kind) {
    case 'NOT_FOUND':
      throw new NotFoundException(transportErrorBody(error));
    case 'CONFLICT':
      throw new ConflictException(transportErrorBody(error));
    case 'INVALID':
      throw new BadRequestException(transportErrorBody(error));
    case 'DENIED':
      // 403 chu khong phai 409: day la mot cong tu choi, khong phai mot va cham du lieu.
      throw new ForbiddenException(transportErrorBody(error));
  }
}

/**
 * Ba truong CHUAN cua Nest theo tung loai loi mien.
 *
 * Go tay ra day chu khong de Nest tu sinh, vi truyen mot OBJECT vao `NotFoundException` se lam Nest
 * dung nguyen object do lam than phan hoi — tuc `statusCode` va `error` khong con tu dong xuat hien.
 * Bang nay giu chung nguyen van dung gia tri cu.
 */
const HTTP_SHAPE: Readonly<Record<TransportErrorKind, { status: number; error: string }>> = {
  NOT_FOUND: { status: 404, error: 'Not Found' },
  CONFLICT: { status: 409, error: 'Conflict' },
  INVALID: { status: 400, error: 'Bad Request' },
  DENIED: { status: 403, error: 'Forbidden' },
};

export interface TransportErrorBody {
  readonly statusCode: number;
  readonly message: string;
  readonly error: string;
  /** Ly do CO KIEU cua mien — xem khoi chu thich cua ham. */
  readonly reason: TransportErrorReason;
}

/**
 * THAN LOI tren day — `#168 B7`.
 *
 * Truoc day chi `error.message` di qua bien, nen `reason` CO KIEU cua mien bi bo lai o may chu. Hau
 * qua do duoc: mot ma **403 mang bon nghia khac nhau**, va giao dien khong phan biet noi
 * `FUND_PERIOD_STATUS_RACE` (nguoi dung phai TAI LAI) voi `FUND_PERIOD_OVERLAP` (nguoi dung phai
 * SUA NGAY) — dung cai phan biet ma `costing-errors.ts` duoc viet ra de giu. Man hinh vi vay chi
 * con cach hien nguyen van cau tieng Viet cua may chu.
 *
 * THEM MOT TRUONG, khong doi truong nao: `statusCode`, `message` va `error` giu nguyen ten, nguyen
 * kieu va nguyen gia tri cu, nen moi client dang doc chung khong phai sua mot dong nao.
 *
 * KHONG RO RI: `reason` la mot union DONG cac hang so cua mien (`TransportErrorReason`) — khong
 * phai `error.stack`, khong phai ma loi Prisma/SQL, khong phai doi tuong ngoai le, va khong mang
 * mot manh du lieu nghiep vu nao. Dieu duy nhat no noi la DUONG TU CHOI nao da dong, va do chinh
 * la thu giao dien can de chon cach xu ly.
 */
export function transportErrorBody(error: TransportDomainError): TransportErrorBody {
  const shape = HTTP_SHAPE[error.kind];
  return {
    statusCode: shape.status,
    message: error.message,
    error: shape.error,
    reason: error.reason,
  };
}
