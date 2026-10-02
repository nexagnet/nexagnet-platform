import { isInternalServiceRequest } from '../../../auth/internal-service.guard.js';
import type { AuthenticatedRequest } from '../../../auth/session.types.js';
import { loadFoundationEnv } from '../../../config/foundation-env.js';
import { canPerformTransportAction } from '../../permissions/transport-permission-rules.js';
import { transportActorOf } from '../../transport-actor.js';
import type { PlaceWriteCaller } from './place-admin.types.js';

/** Cau cho nguoi dung khi thieu quyen THU HAI — dung chung cho man moi va route cu. */
export const COUNTERPARTY_MANAGE_REQUIRED_MESSAGE =
  'Địa điểm của khách hàng hoặc đơn vị khác cần thêm quyền quản lý khách hàng, đối tác.';

/**
 * Nguoi dang goi co sua duoc HO SO PHAP NHAN (khach hang, doi tac) khong — quyen THU HAI cua moi
 * lan ghi dia diem thuoc don vi khac (`#395`), hoi o CA man "Dia diem van hanh" LAN route cu
 * `POST /transport/geofences`: cap rieng `transport.geofence.manage` khong du de khai hang rao len
 * dia diem cua mot cong ty khac.
 *
 * Cung dieu kien mo dau voi `TransportActionGuard`: o che do khong-phien (`AUTH_MODE` khac
 * `session`) khong co danh tinh nao de hoi va toan bo ung dung von khong xac thuc; tien trinh noi
 * bo da qua `InternalServiceGuard`. Con lai: hoi CHINH luat quyen van tai tren nguoi dang goi.
 */
export function canManageCounterpartiesOf(request: AuthenticatedRequest): boolean {
  if (loadFoundationEnv().AUTH_MODE !== 'session' || isInternalServiceRequest(request)) return true;
  const user = request.authUser;
  return user !== undefined && canPerformTransportAction(user, 'transport.counterparty.manage');
}

export function placeWriteCallerOf(request: AuthenticatedRequest): PlaceWriteCaller {
  return {
    actor: transportActorOf(request),
    canManageCounterparties: canManageCounterpartiesOf(request),
  };
}
