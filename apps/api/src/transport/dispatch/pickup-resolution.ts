import { parseGeoPoint } from '../geo/geo-point.js';
import type { Order } from '../movement/movement.types.js';
import { TransportDomainError } from '../transport.errors.js';
import type { DispatchPickupResolutionReason } from './dispatch-decisions.js';
import type { PlaceResolution } from './dispatch.types.js';
import {
  explicitPointPlace,
  orderPickupPlace,
  resolvePlaceByGeofenceId,
  resolvePlaceBySiteId,
  type PlaceIndexEntry,
} from './place-resolution.js';

/**
 * DIEM LAY HANG CUA MOT LAN DIEU XE — ham THUAN, tach khoi `DispatchService` (#379).
 *
 * ===========================================================================
 * THU TU, VA VI SAO KHONG CON BUOC THU TU
 *
 *   1. Nguoi goi CHI DINH tuong minh (toa do / dia diem phap nhan / hang rao) -> dung dung cai do.
 *      No THANG toa do cua don: nguoi dieu xe co the biet hom nay hang nam o mot kho khac.
 *   2. Khong ai chi dinh -> toa do diem lay LUU TREN DON (`Order.originPoint`).
 *   3. Don khong co toa do (don cu) -> TU CHOI CO KIEU.
 *
 * Truoc #379 con mot buoc giua 2 va 3: noi `originLabel` voi ten mot hang rao. Buoc do da bi go
 * co y — mot nhan trung ten mot hang rao la mot su trung hop chinh ta, khong phai mot toa do, va
 * mot bang xep hang dua tren no trong y het mot bang xep hang that.
 *
 * Telemetry KHONG o day: diem quyet dinh `dispatch.pickup_resolution` thuoc ve service, noi biet
 * ma don va noi fail-open cua telemetry duoc bao dam.
 */

/** Cach nguoi goi chi dinh diem lay hang — ba duong, deu tuong minh. */
export type DispatchPickupRef =
  | { readonly kind: 'POINT'; readonly latitude: unknown; readonly longitude: unknown }
  | { readonly kind: 'SITE'; readonly siteId: string }
  | { readonly kind: 'GEOFENCE'; readonly geofenceId: string };

/** Giai diem lay theo thu tu o dau tep. `index` chi dung cho tham chieu tuong minh. */
export function resolveDispatchPickup(
  order: Pick<Order, 'originPoint' | 'originLabel'>,
  ref: DispatchPickupRef | null,
  index: readonly PlaceIndexEntry[],
): PlaceResolution {
  if (ref === null) return orderPickupPlace(order);
  if (ref.kind === 'GEOFENCE') return resolvePlaceByGeofenceId(ref.geofenceId, index);
  if (ref.kind === 'SITE') return resolvePlaceBySiteId(ref.siteId, index);

  const parsed = parseGeoPoint(ref.latitude, ref.longitude);
  if (!parsed.ok) return { ok: false, reason: 'PICKUP_REQUEST_POINT_REJECTED' };
  return {
    ok: true,
    reason: 'PICKUP_FROM_EXPLICIT_REQUEST',
    place: explicitPointPlace(parsed.point, order.originLabel),
  };
}

const EXPLICIT_PICKUP_HINT =
  'Hay chi dinh diem lay hang tuong minh (toa do, dia diem hoac hang rao) khi dieu xe.';

const GENERIC_PICKUP_MESSAGE =
  'Chua xac dinh duoc diem lay hang cua don. Hay chon mot dia diem da khai hang rao.';

/**
 * Ly do KHONG giai duoc diem lay -> loi cho nguoi bam nut.
 *
 * Don cu (khong co toa do) co ma RIENG va cau RIENG: viec can lam la chi dinh diem lay tuong minh
 * khi dieu xe, khong phai "chon mot dia diem da khai hang rao". Toa do hong tren don dung chung ma
 * do vi viec can lam y het — chi cau chu noi dung nguyen nhan.
 */
export function pickupRejection(reason: DispatchPickupResolutionReason): TransportDomainError {
  switch (reason) {
    case 'PICKUP_ORDER_COORDINATES_MISSING':
      return TransportDomainError.invalid(
        'DISPATCH_ORDER_PICKUP_COORDINATES_MISSING',
        `Don nay tao truoc khi co toa do diem lay hang, nen he thong khong tu suy ra duoc diem lay. ${EXPLICIT_PICKUP_HINT}`,
      );
    case 'PICKUP_ORDER_COORDINATES_REJECTED':
      return TransportDomainError.invalid(
        'DISPATCH_ORDER_PICKUP_COORDINATES_MISSING',
        `Toa do diem lay hang luu tren don khong hop le, nen he thong khong dung no. ${EXPLICIT_PICKUP_HINT}`,
      );
    case 'PICKUP_REQUEST_POINT_REJECTED':
      return TransportDomainError.invalid('DISPATCH_POINT_INVALID', GENERIC_PICKUP_MESSAGE);
    case 'PICKUP_REQUEST_REF_NOT_FOUND':
      return TransportDomainError.invalid('DISPATCH_PLACE_REF_NOT_FOUND', GENERIC_PICKUP_MESSAGE);
    default:
      return TransportDomainError.invalid(
        'DISPATCH_PICKUP_LOCATION_UNRESOLVED',
        GENERIC_PICKUP_MESSAGE,
      );
  }
}
