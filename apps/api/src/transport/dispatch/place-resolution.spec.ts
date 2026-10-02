import { describe, expect, it } from 'vitest';
import {
  normalizePlaceLabel,
  orderPickupPlace,
  orderPointPlace,
  resolvePlaceByGeofenceId,
  resolvePlaceByLabel,
  resolvePlaceBySiteId,
  type PlaceIndexEntry,
} from './place-resolution.js';

const entry = (over: Partial<PlaceIndexEntry> & { geofenceId: string }): PlaceIndexEntry => ({
  label: over.geofenceId,
  point: { latitude: 20.86, longitude: 106.68 },
  siteId: null,
  siteName: null,
  ...over,
});

describe('chuan hoa nhan dia diem', () => {
  it('bo dau va khong nuot dau phan cach', () => {
    expect(normalizePlaceLabel('Kho Hải Phòng')).toBe('KHO HAI PHONG');
    expect(normalizePlaceLabel('Kho-số 5')).toBe('KHO SO 5');
  });

  /** `đ` la mot chu cai rieng — `NFD` khong tach no ra, nen phai doi tay truoc. */
  it('xu ly duoc chu d gach ngang', () => {
    expect(normalizePlaceLabel('Kho Đông Anh')).toBe('KHO DONG ANH');
  });

  it('`Kho 5` va `Kho5` KHONG duoc gap nhau', () => {
    expect(normalizePlaceLabel('Kho 5')).not.toBe(normalizePlaceLabel('Kho5'));
  });
});

describe('giai nhan dia diem thanh toa do', () => {
  const index = [
    entry({ geofenceId: 'gf-hp', label: 'Kho Hải Phòng' }),
    entry({ geofenceId: 'gf-nb', label: 'Bãi Ninh Bình' }),
    entry({
      geofenceId: 'gf-site',
      label: 'Hàng rào kho Quế Võ',
      siteId: 'site-qv',
      siteName: 'Nhà máy Quế Võ 2',
    }),
  ];

  it('khop KHIT ten hang rao, khong phan biet dau', () => {
    const result = resolvePlaceByLabel('kho hai phong', index);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reason).toBe('PICKUP_FROM_GEOFENCE_LABEL');
    expect(result.place.geofenceId).toBe('gf-hp');
  });

  it('khop ten DIA DIEM PHAP NHAN khi hang rao mang mot ten khac', () => {
    const result = resolvePlaceByLabel('Nha may Que Vo 2', index);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reason).toBe('PICKUP_FROM_COUNTERPARTY_SITE');
    expect(result.place.siteId).toBe('site-qv');
  });

  /** Khong "gan giong", khong Levenshtein, khong diem so — xem dau `place-resolution.ts`. */
  it('khong khop thi NOI LA KHONG KHOP, khong lay cho gan nhat', () => {
    const result = resolvePlaceByLabel('Kho Hai Phong 2', index);
    expect(result).toEqual({ ok: false, reason: 'PICKUP_LABEL_NO_MATCH' });
  });

  it('nhan rong khong khop bat cu cai gi', () => {
    expect(resolvePlaceByLabel('   ', index)).toEqual({
      ok: false,
      reason: 'PICKUP_LABEL_NO_MATCH',
    });
  });

  it('HAI cho cung ten -> tra ve cho nguoi dung chon, khong tu chon', () => {
    const ambiguous = [
      entry({ geofenceId: 'gf-a', label: 'Kho Trung Chuyen' }),
      entry({ geofenceId: 'gf-b', label: 'Kho Trung Chuyển' }),
    ];
    expect(resolvePlaceByLabel('kho trung chuyen', ambiguous)).toEqual({
      ok: false,
      reason: 'PICKUP_LABEL_AMBIGUOUS',
    });
  });

  /** Cung MOT hang rao duoc goi bang hai ten khong phai nhap nhang. */
  it('hai muc cung tro ve MOT hang rao thi van giai duoc', () => {
    const sameFence = [
      entry({ geofenceId: 'gf-x', label: 'Kho X', siteId: 's1', siteName: 'Kho X' }),
      entry({ geofenceId: 'gf-x', label: 'Kho X', siteId: 's1', siteName: 'Kho X' }),
    ];
    expect(resolvePlaceByLabel('Kho X', sameFence).ok).toBe(true);
  });

  it('tra cuu theo ma hang rao khong di qua phep so khop chuoi nao', () => {
    const result = resolvePlaceByGeofenceId('gf-nb', index);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.place.source).toBe('EXPLICIT_REQUEST_GEOFENCE');
  });

  it('ma hang rao khong ton tai -> ma ly do rieng, khong phai NO_MATCH', () => {
    expect(resolvePlaceByGeofenceId('gf-khong-co', index)).toEqual({
      ok: false,
      reason: 'PICKUP_REQUEST_REF_NOT_FOUND',
    });
  });

  it('tra cuu theo ma dia diem phap nhan', () => {
    const result = resolvePlaceBySiteId('site-qv', index);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.place.source).toBe('EXPLICIT_REQUEST_SITE');
    expect(result.place.label).toBe('Nhà máy Quế Võ 2');
  });

  it('dia diem chua khai hang rao -> khong co toa do de tra', () => {
    expect(resolvePlaceBySiteId('site-chua-khai', index)).toEqual({
      ok: false,
      reason: 'PICKUP_REQUEST_REF_NOT_FOUND',
    });
  });
});

/**
 * DIEM LAY TU TOA DO CUA DON (#379) — va KHONG co nhanh thu tu "thu nhan chu".
 *
 * Nhan trong cac bai duoi day co y trung ten mot hang rao that (`Kho Hai Phong`) hoac noi mot cho
 * khac han toa do: ket qua KHONG duoc phu thuoc vao nhan.
 */
describe('diem lay hang tu toa do cua don', () => {
  const HAI_PHONG = { latitude: 20.8449, longitude: 106.6881 };

  it('co toa do -> dung toa do; nhan chi di kem de hien thi', () => {
    expect(orderPickupPlace({ originPoint: HAI_PHONG, originLabel: 'Kho Ha Noi' })).toEqual({
      ok: true,
      reason: 'PICKUP_FROM_ORDER_COORDINATES',
      place: {
        point: HAI_PHONG,
        source: 'ORDER_PICKUP_POINT',
        label: 'Kho Ha Noi',
        geofenceId: null,
        siteId: null,
      },
    });
  });

  it('don cu khong co toa do -> MISSING, du nhan trung ten mot hang rao', () => {
    expect(orderPickupPlace({ originPoint: null, originLabel: 'Kho Hai Phong' })).toEqual({
      ok: false,
      reason: 'PICKUP_ORDER_COORDINATES_MISSING',
    });
  });

  it.each([
    ['Null Island', { latitude: 0, longitude: 0 }],
    ['vi do ngoai bien', { latitude: 91, longitude: 105.8 }],
    ['kinh do khong phai so huu han', { latitude: 21, longitude: Number.NaN }],
  ])('toa do hong (%s) -> REJECTED, khong dung lam diem lay', (_name, point) => {
    expect(orderPickupPlace({ originPoint: point, originLabel: 'Kho Hai Phong' })).toEqual({
      ok: false,
      reason: 'PICKUP_ORDER_COORDINATES_REJECTED',
    });
  });

  it('toa do vang mat (undefined tu mot tang cu) duoc coi nhu khong co, khong nem', () => {
    expect(orderPointPlace(undefined, 'Kho X', 'ORDER_DELIVERY_POINT')).toBeNull();
    expect(orderPointPlace(HAI_PHONG, 'Kho X', 'ORDER_DELIVERY_POINT')?.source).toBe(
      'ORDER_DELIVERY_POINT',
    );
  });
});
