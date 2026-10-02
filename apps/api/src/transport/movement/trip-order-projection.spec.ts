import { describe, expect, it } from 'vitest';
import type { BusinessDate } from '../business-date.js';
import type { Trip } from '../transport.types.js';
import {
  orderCodeForTrip,
  planOrderProjection,
  planTripProjection,
} from './trip-run-projection.js';

/**
 * CHIEU THUONG MAI — `#275` K5, kiem o muc ham THUAN.
 *
 * ============================================================================================
 * BAI QUAN TRONG NHAT CUA TEP: CHUYEN THUE NHA XE NGOAI VAN CO MOT NGHIA VU
 * ============================================================================================
 *
 * `planTripProjection` (chieu DIEU HANH) tu choi `EXTERNAL_CARRIER`, va no dung: xe khong phai cua
 * B nen khong co "vong chay cua xe" nao de bia ra.
 *
 * Nhung `#275` K5 dat cong doi soat len DON, va mot chuyen thue ngoai VAN co khach, VAN co bien
 * nhan giao hang. Neu phep chieu THUONG MAI cung tu choi no, thi nhung chuyen do vinh vien khong co
 * chu the — va cong hoac chan mot duong dang chay, hoac phai mo lai dung cai duong vong
 * `NOT_PROJECTED => pass` ma `#275` bo di.
 */

const trip = (patch: Partial<Trip> = {}): Trip => ({
  id: 'chuyen-1',
  code: 'CH-001',
  kind: 'OWN_DIRECT',
  status: 'RECONCILED',
  businessDate: '2026-09-08' as BusinessDate,
  originLabel: 'Ha Noi',
  destinationLabel: 'Hai Phong',
  cargoDescription: 'Thep cuon',
  customerId: 'khach-1',
  carrierPartnerId: null,
  referrerPartnerId: null,
  freightAmount: 5_000_000,
  currencyCode: 'VND',
  distanceKm: 120,
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
  cancelledAt: null,
  cancellationReason: null,
  ...patch,
});

describe('planOrderProjection — chieu chuyen v1 sang NGHIA VU v2', () => {
  it('chuyen co khach cho ra mot don mang dung su that cua chuyen', () => {
    const outcome = planOrderProjection(trip());

    expect(outcome).toEqual({
      ok: true,
      order: {
        code: 'ORD-CH-001',
        businessDate: '2026-09-08',
        originLabel: 'Ha Noi',
        destinationLabel: 'Hai Phong',
        // #379: chuyen v1 khong co toa do => `null` TUONG MINH, khong geocode nhan thanh diem.
        originPoint: null,
        destinationPoint: null,
        customerId: 'khach-1',
        cargoDescription: 'Thep cuon',
        freightAmount: 5_000_000,
        note: 'Chieu tu chuyen CH-001',
      },
    });
  });

  it('#379: don chieu tu chuyen v1 mang toa do NULL tuong minh, khong bia tu nhan', () => {
    const outcome = planOrderProjection(trip({ originLabel: 'Bai xe Ha Noi' }));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // `toHaveProperty(..., null)` chu khong phai `toBeFalsy`: `undefined` nghia la "quen ghi",
    // `null` nghia la "da quyet dinh khong co toa do". Chi cai sau la bat bien.
    expect(outcome.order).toHaveProperty('originPoint', null);
    expect(outcome.order).toHaveProperty('destinationPoint', null);
  });

  it.each(['EXTERNAL_CARRIER', 'PARTNER_REFERRED_INTERNAL_RUN', 'OWN_DIRECT'] as const)(
    'chieu duoc chuyen %s — KHONG loai theo loai chuyen',
    (kind) => {
      const outcome = planOrderProjection(trip({ kind }));
      expect(outcome.ok).toBe(true);
    },
  );

  /**
   * DOI XUNG voi bai o tren, va la ly do hai phep chieu phai la HAI ham.
   *
   * Neu mot ngay ai do gop chung lai, bai nay va bai tren se khong the cung xanh.
   */
  it('chieu DIEU HANH van TU CHOI chuyen thue nha xe ngoai', () => {
    expect(planTripProjection(trip({ kind: 'EXTERNAL_CARRIER' }), [])).toEqual({
      ok: false,
      reason: 'PROJECTION_TRIP_OUTSOURCED',
    });
  });

  it('chuyen khong gan khach thi KHONG co nghia vu thuong mai nao', () => {
    expect(planOrderProjection(trip({ customerId: null }))).toEqual({
      ok: false,
      reason: 'ORDER_PROJECTION_TRIP_HAS_NO_CUSTOMER',
    });
  });

  it('MA DON la mot phep tinh TAT DINH, dung chung voi phep chieu dieu hanh', () => {
    const commercial = planOrderProjection(trip());
    const operational = planTripProjection(trip(), [
      {
        id: 'pc-1',
        tripId: 'chuyen-1',
        vehicleId: 'xe-1',
        driverId: null,
        effectiveFrom: '2026-09-08T00:00:00.000Z',
        effectiveTo: null,
        assignedBy: 'nguoi-van-hanh',
        createdAt: '2026-09-08T00:00:00.000Z',
      },
    ]);

    expect(commercial.ok && commercial.order.code).toBe(orderCodeForTrip('CH-001'));
    expect(operational.ok && operational.plan.order?.code).toBe(orderCodeForTrip('CH-001'));
  });

  it('chay lai cho ra DUNG mot ket qua — khong dong ho, khong id ngau nhien', () => {
    expect(planOrderProjection(trip())).toEqual(planOrderProjection(trip()));
  });
});
