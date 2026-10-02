import { describe, expect, it } from 'vitest';
import { createOrderSchema, updateOrderSchema } from './movement.schemas.js';

/**
 * BIEN HTTP tao don (#379): toa do diem lay / diem giao la BAT BUOC.
 *
 * Nhan chu chi de hien thi; don moi qua HTTP ma thieu toa do thi dieu xe se lai phai doan diem lay
 * tu chu -- dung cai #379 bo di. Khoang/null island KHONG kiem o day (xem bai cuoi): nguong duy
 * nhat nam o `parseGeoPoint`, va `order-location.spec.ts` kiem no o tang mien.
 */

const HAI_PHONG = { latitude: 20.8264, longitude: 106.7752 };
const THAI_NGUYEN = { latitude: 21.617, longitude: 105.817 };

const validBody = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  code: 'ORD-379',
  originLabel: 'Nhà máy thép Đình Vũ',
  destinationLabel: 'Kho Nhựa Tân Phú Hưng',
  originPoint: HAI_PHONG,
  destinationPoint: THAI_NGUYEN,
  ...patch,
});

const without = (key: string): Record<string, unknown> => {
  const { [key]: _omitted, ...rest } = validBody();
  return rest;
};

describe('createOrderSchema — toa do la bat buoc (#379)', () => {
  it('nhan mot than hop le va giu nguyen hai diem', () => {
    const parsed = createOrderSchema.safeParse(validBody());

    expect(parsed.success).toBe(true);
    expect(parsed.data?.originPoint).toEqual(HAI_PHONG);
    expect(parsed.data?.destinationPoint).toEqual(THAI_NGUYEN);
  });

  it.each(['originPoint', 'destinationPoint'])('tu choi than thieu `%s`', (key) => {
    const parsed = createOrderSchema.safeParse(without(key));

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join('.'))).toContain(key);
  });

  it.each(['originPoint', 'destinationPoint'])(
    'tu choi `%s: null` — null chi danh cho duong noi bo',
    (key) => {
      expect(createOrderSchema.safeParse(validBody({ [key]: null })).success).toBe(false);
    },
  );

  it.each([
    ['khoa la ben trong diem', { ...HAI_PHONG, accuracy: 12 }],
    ['ten khoa viet tat', { lat: 20.8264, lng: 106.7752 }],
    ['thieu kinh do', { latitude: 20.8264 }],
    ['vi do la chuoi', { latitude: '20.8264', longitude: 106.7752 }],
    ['NaN', { latitude: Number.NaN, longitude: 106.7752 }],
  ])('tu choi diem lay co %s', (_name, point) => {
    expect(createOrderSchema.safeParse(validBody({ originPoint: point })).success).toBe(false);
  });

  it('tu choi khoa la ben trong diem giao', () => {
    const parsed = createOrderSchema.safeParse(
      validBody({ destinationPoint: { ...THAI_NGUYEN, source: 'gps' } }),
    );

    expect(parsed.success).toBe(false);
  });

  /**
   * CO Y: zod KHONG chan khoang. Bai nay khoa quy uoc "mot nguong" -- neu ai do them `.min/.max`
   * vao zod thi co hai bo nguong co the lech nhau, va loi tra ve se khong con la ma
   * `ORDER_ORIGIN_POINT_INVALID` co ten ma la mot loi hinh dang chung chung.
   */
  it('KHONG kiem khoang o zod — de `parseGeoPoint` tra ma loi co ten', () => {
    const parsed = createOrderSchema.safeParse(
      validBody({ originPoint: { latitude: 91, longitude: 0 } }),
    );

    expect(parsed.success).toBe(true);
  });
});

describe('updateOrderSchema — toa do KHONG sua qua PATCH trong #379', () => {
  it.each(['originPoint', 'destinationPoint'])('tu choi `%s` trong than PATCH', (key) => {
    expect(updateOrderSchema.safeParse({ [key]: HAI_PHONG }).success).toBe(false);
  });
});
