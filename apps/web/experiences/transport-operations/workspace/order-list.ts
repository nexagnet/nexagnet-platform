import type { GeoPoint, TransportOrder, TransportOrderStatus } from '../transport-types';
import { ENDPOINT_BADGE, ENDPOINT_MARKER_KEY } from './order-draft';
import type { PickerMarker } from './place-lookup';
import { normalise } from './trips';

/**
 * DANH SACH DON — tim va loc PHIA MAY KHACH (`#379`, F-14 cua ban kiem giao dien).
 *
 * Bang don co hon 40 dong ma khong mot o tim nao. Loc o day chu khong goi lai may chu: danh sach
 * da nam het trong bo nho, va mot lan goi lai chi de bo bot dong la mot lan cho khong can. URL KHONG
 * doi — bo loc la mot tien ich xem, khong phai mot dia chi de gui cho nhau.
 */

export type OrderStatusFilter = 'ALL' | TransportOrderStatus;

export const ORDER_STATUS_FILTERS: readonly OrderStatusFilter[] = [
  'ALL',
  'OPEN',
  'FULFILLED',
  'CANCELLED',
];

export const ORDER_STATUS_FILTER_LABEL: Readonly<Record<OrderStatusFilter, string>> = {
  ALL: 'Tất cả',
  OPEN: 'Đang mở',
  FULFILLED: 'Đã giao xong',
  CANCELLED: 'Đã huỷ',
};

export interface OrderListFilter {
  readonly search: string;
  readonly status: OrderStatusFilter;
}

export const EMPTY_ORDER_FILTER: OrderListFilter = { search: '', status: 'ALL' };

/**
 * Tim theo ma don, TEN khach va hai dau tuyen — BO DAU truoc khi so, nen go "dinh vu" ra "Đình Vũ".
 * Ten khach di qua `customerNameOf` cua man hinh: tim bang `customerId` la tim bang mot ma nguoi
 * dung khong bao gio thay.
 */
export function filterOrders(
  orders: readonly TransportOrder[],
  filter: OrderListFilter,
  customerNameOf: (customerId: string | null) => string,
): readonly TransportOrder[] {
  const needle = normalise(filter.search);
  return orders.filter((order) => {
    if (filter.status !== 'ALL' && order.status !== filter.status) return false;
    if (needle.length === 0) return true;
    const haystack = normalise(
      `${order.code} ${customerNameOf(order.customerId)} ${order.originLabel} ${order.destinationLabel}`,
    );
    return haystack.includes(needle);
  });
}

/**
 * DON DANG MO va BO LOC (`#379`).
 *
 * Chi tiet (khoi Tuyến, lap ke hoach, giao xong) la cua MOT don. Neu bo loc vua giau don do khoi
 * bang ma chi tiet van nam duoi bang, nguoi dung thay ke hoach cua mot don ho khong con thay trong
 * danh sach — va de doc nham no la cua dong dang hien. Nen: giau chi tiet, NOI RA vi sao, va cho mot
 * nut bo loc de lay lai. Khong tu dong dong don: nguoi dung co the chi dang go tim thu khac.
 */
export type OpenOrderFilterState =
  | { readonly kind: 'NONE' }
  | { readonly kind: 'SHOWN' }
  | { readonly kind: 'HIDDEN_BY_FILTER'; readonly code: string };

export function openOrderFilterState(
  orders: readonly TransportOrder[],
  visibleOrders: readonly TransportOrder[],
  openOrderId: string | null,
): OpenOrderFilterState {
  if (openOrderId === null) return { kind: 'NONE' };
  const open = orders.find((order) => order.id === openOrderId);
  if (open === undefined) return { kind: 'NONE' };
  return visibleOrders.some((order) => order.id === openOrderId)
    ? { kind: 'SHOWN' }
    : { kind: 'HIDDEN_BY_FILTER', code: open.code };
}

export const hiddenOpenOrderNote = (code: string): string =>
  `Đơn đang mở ${code} không khớp bộ lọc, nên chi tiết của nó đang ẩn.`;

const isCoordinate = (value: unknown, limit: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;

/**
 * Toa do cua mot dau tuyen, hoac `null`.
 *
 * `undefined` (mock cu, phan hoi truoc `#379`) va `null` (don cu) doc RA GIONG NHAU: khong co toa
 * do. Mot diem hong hinh dang cung la `null` — man hinh noi "khong co toa do", khong ve mot ghim
 * o cho khong ai chon.
 */
export function orderPointOf(
  order: TransportOrder,
  endpoint: 'ORIGIN' | 'DESTINATION',
): GeoPoint | null {
  const point = endpoint === 'ORIGIN' ? order.originPoint : order.destinationPoint;
  if (point === null || point === undefined) return null;
  return isCoordinate(point.latitude, 90) && isCoordinate(point.longitude, 180)
    ? { latitude: point.latitude, longitude: point.longitude }
    : null;
}

export interface OrderRoute {
  readonly origin: GeoPoint | null;
  readonly destination: GeoPoint | null;
  /** Ca hai dau deu co toa do — chi khi do moi ve ban do va duong chim bay. */
  readonly isComplete: boolean;
}

export function orderRouteOf(order: TransportOrder): OrderRoute {
  const origin = orderPointOf(order, 'ORIGIN');
  const destination = orderPointOf(order, 'DESTINATION');
  return { origin, destination, isComplete: origin !== null && destination !== null };
}

export const LEGACY_ROUTE_NOTE =
  'Đơn này được tạo trước khi hệ thống lưu toạ độ — chỉ có tên hiển thị.';

/**
 * Hai ghim CHI DOC cho khoi "Tuyến" cua don dang chon — rong khi don khong du hai toa do: ban do cua
 * mot don cu khong duoc ve voi mot diem bia.
 */
export function orderRouteMarkers(order: TransportOrder): readonly PickerMarker[] {
  const route = orderRouteOf(order);
  if (route.origin === null || route.destination === null) return [];
  const pin = (
    kind: 'ORIGIN' | 'DESTINATION',
    point: GeoPoint,
    noun: string,
    label: string,
  ): PickerMarker => ({
    key: ENDPOINT_MARKER_KEY[kind],
    kind,
    point,
    label: `${noun}: ${label}`,
    badge: ENDPOINT_BADGE[kind],
    isHighlighted: false,
    isDraggable: false,
  });
  return [
    pin('ORIGIN', route.origin, 'Điểm lấy hàng', order.originLabel),
    pin('DESTINATION', route.destination, 'Điểm giao hàng', order.destinationLabel),
  ];
}
