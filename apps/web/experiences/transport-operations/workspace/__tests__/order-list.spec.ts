import { describe, expect, it } from 'vitest';
import type { TransportOrder } from '../../transport-types';
import { dispatchErrorMessage, DISPATCH_PICKUP_MISSING_MESSAGE } from '../dispatch';
import {
  EMPTY_ORDER_FILTER,
  filterOrders,
  hiddenOpenOrderNote,
  LEGACY_ROUTE_NOTE,
  openOrderFilterState,
  orderPointOf,
  orderRouteMarkers,
  orderRouteOf,
} from '../order-list';
import { order } from './fixtures';

/*
 * `#379` — danh sach don: tim/loc PHIA MAY KHACH, va doc toa do cua don ma KHONG BAO GIO bia.
 */

const NAMES: Readonly<Record<string, string>> = {
  'cus-1': 'Công ty CP Thép Đông Á',
  'cus-2': 'Hải Hà Logistics',
};
const nameOf = (customerId: string | null): string =>
  customerId === null ? '—' : (NAMES[customerId] ?? '');

const ORDERS: readonly TransportOrder[] = [
  order({ id: 'o1', code: 'DH-01', originLabel: 'Nhà máy thép Đình Vũ', status: 'OPEN' }),
  order({
    id: 'o2',
    code: 'DH-02',
    customerId: 'cus-2',
    destinationLabel: 'Thái Nguyên',
    status: 'FULFILLED',
  }),
  order({ id: 'o3', code: 'DH-03', status: 'CANCELLED' }),
];

describe('tim va loc don', () => {
  it('bo loc rong giu moi don, dung thu tu', () => {
    expect(filterOrders(ORDERS, EMPTY_ORDER_FILTER, nameOf).map((entry) => entry.id)).toEqual([
      'o1',
      'o2',
      'o3',
    ]);
  });

  it('go khong dau van tim ra tuyen co dau', () => {
    expect(
      filterOrders(ORDERS, { search: 'dinh vu', status: 'ALL' }, nameOf).map((entry) => entry.id),
    ).toEqual(['o1']);
  });

  it('tim theo TEN khach, khong theo ma khach', () => {
    expect(
      filterOrders(ORDERS, { search: 'hai ha', status: 'ALL' }, nameOf).map((entry) => entry.id),
    ).toEqual(['o2']);
    expect(filterOrders(ORDERS, { search: 'cus-2', status: 'ALL' }, nameOf)).toEqual([]);
  });

  it('loc trang thai ket hop voi tim', () => {
    expect(
      filterOrders(ORDERS, { search: '', status: 'OPEN' }, nameOf).map((entry) => entry.id),
    ).toEqual(['o1']);
    expect(filterOrders(ORDERS, { search: 'DH-02', status: 'OPEN' }, nameOf)).toEqual([]);
  });
});

describe('don dang mo va bo loc', () => {
  const visible = (search: string) => filterOrders(ORDERS, { search, status: 'ALL' }, nameOf);

  it('khong mo don nao -> khong co gi de noi', () => {
    expect(openOrderFilterState(ORDERS, visible('dinh vu'), null)).toEqual({ kind: 'NONE' });
  });

  it('don dang mo con trong ket qua loc -> hien chi tiet nhu thuong', () => {
    expect(openOrderFilterState(ORDERS, visible('dinh vu'), 'o1')).toEqual({ kind: 'SHOWN' });
  });

  it('bo loc giau don dang mo -> noi ro, KHONG lang le giu chi tiet cua mot don khong thay', () => {
    const state = openOrderFilterState(ORDERS, visible('hai ha'), 'o1');
    expect(state).toEqual({ kind: 'HIDDEN_BY_FILTER', code: 'DH-01' });
    expect(hiddenOpenOrderNote('DH-01')).toBe(
      'Đơn đang mở DH-01 không khớp bộ lọc, nên chi tiết của nó đang ẩn.',
    );
  });

  it('don dang mo khong con trong danh sach (da go) -> khong co gi de hien', () => {
    expect(openOrderFilterState(ORDERS, visible(''), 'o-da-go')).toEqual({ kind: 'NONE' });
  });
});

describe('toa do cua don — undefined, null va hong deu la "khong co"', () => {
  it('mock cu (khong co truong) doc ra khong toa do', () => {
    const legacy = { ...order() } as Record<string, unknown>;
    delete legacy.originPoint;
    delete legacy.destinationPoint;
    const route = orderRouteOf(legacy as unknown as TransportOrder);
    expect(route).toEqual({ origin: null, destination: null, isComplete: false });
  });

  it('don cu (null) doc ra khong toa do, KHONG bia diem', () => {
    expect(orderRouteOf(order())).toEqual({ origin: null, destination: null, isComplete: false });
    expect(LEGACY_ROUTE_NOTE).toContain('chỉ có tên hiển thị');
  });

  it('don moi co du hai dau', () => {
    const route = orderRouteOf(
      order({
        originPoint: { latitude: 20.8264, longitude: 106.7752 },
        destinationPoint: { latitude: 21.617, longitude: 105.817 },
      }),
    );
    expect(route.isComplete).toBe(true);
    expect(route.origin).toEqual({ latitude: 20.8264, longitude: 106.7752 });
  });

  it('diem hong hinh dang la khong co', () => {
    const broken = order({
      originPoint: { latitude: 200, longitude: 105 },
      destinationPoint: { latitude: Number.NaN, longitude: 105 },
    });
    expect(orderPointOf(broken, 'ORIGIN')).toBeNull();
    expect(orderPointOf(broken, 'DESTINATION')).toBeNull();
  });
});

describe('dieu xe cho don cu khong co toa do diem lay', () => {
  it('ma ly do co kieu -> cau cho nguoi dieu hanh', () => {
    expect(
      dispatchErrorMessage({
        message: 'Don nay tao truoc khi co toa do...',
        reason: 'DISPATCH_ORDER_PICKUP_COORDINATES_MISSING',
      }),
    ).toBe(DISPATCH_PICKUP_MISSING_MESSAGE);
  });

  it('loi khac giu nguyen van cau cua may chu', () => {
    expect(dispatchErrorMessage({ message: 'Không có quyền', reason: null })).toBe(
      'Không có quyền',
    );
    expect(dispatchErrorMessage(new Error('Mạng hỏng'))).toBe('Mạng hỏng');
  });
});

describe('ghim chi doc cua khoi Tuyen', () => {
  it('don co du toa do -> hai ghim Lay/Giao, khong keo duoc', () => {
    const markers = orderRouteMarkers(
      order({
        originLabel: 'Nhà máy thép Đình Vũ',
        originPoint: { latitude: 20.8264, longitude: 106.7752 },
        destinationPoint: { latitude: 21.617, longitude: 105.817 },
      }),
    );
    expect(markers.map((marker) => [marker.kind, marker.badge, marker.isDraggable])).toEqual([
      ['ORIGIN', 'Lấy', false],
      ['DESTINATION', 'Giao', false],
    ]);
    expect(markers[0]?.label).toBe('Điểm lấy hàng: Nhà máy thép Đình Vũ');
  });

  it('don cu hoac thieu mot dau -> khong ghim nao', () => {
    expect(orderRouteMarkers(order())).toEqual([]);
    expect(orderRouteMarkers(order({ originPoint: { latitude: 20.8, longitude: 106.7 } }))).toEqual(
      [],
    );
  });
});
