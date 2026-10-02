import { describe, expect, it } from 'vitest';
import {
  FUEL_PAYMENT_METHODS,
  type DriverFuelRunView,
  type FuelEntryCostAttributionView,
} from '../../transport-types';
import { fuelContextLabel, verifyConsequence } from '../fuel';
import { toFuelCostAttributionModel } from '../fuel-cost-attribution';
import {
  DRIVER_PAYMENT_METHOD_HINT,
  driverFuelContextOptions,
  toDriverFuelContext,
  toDriverFuelSubmission,
  type DriverFuelForm,
} from '../fuel-declaration';

/**
 * `#364` — FUEL EVENT RUN-FIRST o phia man hinh: o khai phieu cua lai xe va panel gia thanh cua ke
 * toan. Ham THUAN, nen moi quyet dinh "hien gi / gui gi" do duoc ma khong dung mot trinh duyet.
 */

const FORM: DriverFuelForm = {
  supplierId: 'cay-xang-1',
  stationId: '',
  liters: '100',
  amount: '2100000',
  odometerKm: '120000',
  invoiceNo: '',
  occurredAtLocal: '2026-09-22T11:30',
  paymentMethod: 'SUPPLIER_ACCOUNT',
};

const run = (over: Partial<DriverFuelRunView> = {}): DriverFuelRunView => ({
  runId: 'vong-1',
  runCode: 'RUN-A',
  runStatus: 'ACTIVE',
  vehicleId: 'xe-1',
  vehiclePlate: '29H-152.44',
  legs: [
    {
      legId: 'chang-1',
      sequence: 1,
      kind: 'EMPTY',
      status: 'COMPLETED',
      originLabel: 'Bai xe',
      destinationLabel: 'Kho A',
    },
    {
      legId: 'chang-2',
      sequence: 2,
      kind: 'LOADED',
      status: 'IN_TRANSIT',
      originLabel: 'Kho A',
      destinationLabel: 'Kho B',
    },
    {
      legId: 'chang-huy',
      sequence: 3,
      kind: 'EMPTY',
      status: 'CANCELLED',
      originLabel: 'Kho B',
      destinationLabel: 'Bai xe',
    },
  ],
  ...over,
});

describe('o khai phieu cua lai xe — viec duoc dieu di truoc, chuyen cu la loi phu', () => {
  it('than yeu cau theo VONG XE: co runId/legId, KHONG tripId, KHONG vehicleId, KHONG driverId', () => {
    const body = toDriverFuelSubmission({
      form: FORM,
      context: { kind: 'RUN', runId: 'vong-1', legId: 'chang-2' },
      correlationKey: 'khoa-run-1',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    expect(body).toMatchObject({ runId: 'vong-1', legId: 'chang-2', supplierId: 'cay-xang-1' });
    for (const forbidden of ['tripId', 'vehicleId', 'driverId']) {
      expect(Object.keys(body)).not.toContain(forbidden);
    }
  });

  it('than yeu cau theo CHUYEN CU giu nguyen hop dong cu (tripId + vehicleId)', () => {
    const body = toDriverFuelSubmission({
      form: FORM,
      context: { kind: 'LEGACY_TRIP', tripId: 'chuyen-1', vehicleId: 'xe-1' },
      correlationKey: 'khoa-trip-1',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    expect(body).toMatchObject({ tripId: 'chuyen-1', vehicleId: 'xe-1' });
    expect(Object.keys(body)).not.toContain('runId');
  });

  it('thu tu: vong xe DANG CHAY -> vong xe ke hoach -> chuyen cu; chang da huy khong chon duoc', () => {
    const options = driverFuelContextOptions({
      runs: [run({ runId: 'vong-2', runCode: 'RUN-B', runStatus: 'PLANNED' }), run()],
      legacyTrip: { id: 'chuyen-1', code: 'CH-01', vehicleId: 'xe-1', vehiclePlate: '29H-152.44' },
    });

    expect(options.map((option) => option.key)).toEqual([
      'run:vong-1',
      'run:vong-2',
      'trip:chuyen-1',
    ]);
    expect(options[0]).toMatchObject({ label: 'Vòng xe RUN-A', vehicleLabel: '29H-152.44' });
    expect(options[0]!.legs.map((leg) => leg.legId)).toEqual(['chang-1', 'chang-2']);
    expect(options[2]).toMatchObject({ kind: 'LEGACY_TRIP', label: 'Chuyến cũ CH-01', legs: [] });
  });

  it('khong co viec nao -> danh sach RONG (man hinh noi "chua khai duoc", khong bia ngu canh)', () => {
    expect(driverFuelContextOptions({ runs: [], legacyTrip: null })).toEqual([]);
    // Chuyen cu CHUA co xe khong la mot ngu canh khai duoc.
    expect(
      driverFuelContextOptions({
        runs: [],
        legacyTrip: { id: 'chuyen-1', code: 'CH-01', vehicleId: null, vehiclePlate: null },
      }),
    ).toEqual([]);
  });

  it('lua chon + chang -> ngu canh cho ca vong xe lan chuyen cu', () => {
    const [runOption, tripOption] = driverFuelContextOptions({
      runs: [run()],
      legacyTrip: { id: 'chuyen-1', code: 'CH-01', vehicleId: 'xe-1', vehiclePlate: null },
    });
    const runContext = toDriverFuelContext(runOption!, 'chang-2');
    expect(runContext).toEqual({ kind: 'RUN', runId: 'vong-1', legId: 'chang-2' });

    const tripContext = toDriverFuelContext(tripOption!, null);
    expect(tripContext).toEqual({ kind: 'LEGACY_TRIP', tripId: 'chuyen-1', vehicleId: 'xe-1' });
  });

  it('#380 — vong xe gui duoc DRIVER_CASH: than mang runId/legId + DRIVER_CASH, khong tripId', () => {
    // `#369` R-4 da go cong `FUEL_ENTRY_DRIVER_CASH_REQUIRES_LEGACY_TRIP`. Ban truoc khoa o chon va
    // chan luc gui; gio than yeu cau di thang len may chu, va may chu vao Quy bang `RUN_EXPENSE`.
    const body = toDriverFuelSubmission({
      form: { ...FORM, paymentMethod: 'DRIVER_CASH' },
      context: { kind: 'RUN', runId: 'vong-1', legId: 'chang-2' },
      correlationKey: 'khoa-cash',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    expect(body).toMatchObject({ runId: 'vong-1', legId: 'chang-2', paymentMethod: 'DRIVER_CASH' });
    for (const forbidden of ['tripId', 'vehicleId', 'driverId']) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });

  it('#380 — moi cach tra co MOT cau noi tien di dau; khong cau nao con noi "chuyen cu"', () => {
    for (const method of FUEL_PAYMENT_METHODS) {
      expect(DRIVER_PAYMENT_METHOD_HINT[method].length).toBeGreaterThan(0);
      expect(DRIVER_PAYMENT_METHOD_HINT[method]).not.toMatch(/chuyến cũ/);
    }
    expect(DRIVER_PAYMENT_METHOD_HINT.DRIVER_CASH).toContain('quỹ lái xe');
    expect(DRIVER_PAYMENT_METHOD_HINT.DRIVER_CASH).toContain('không ghi nợ cây xăng');
  });
});

describe('nhan ngu canh o hop thu va danh sach phieu', () => {
  it.each([
    [{ tripCode: 'UAT-VIET-01', runCode: null, legSequence: null }, 'UAT-VIET-01'],
    [{ tripCode: null, runCode: 'RUN-A', legSequence: null }, 'Vòng xe RUN-A'],
    [{ tripCode: null, runCode: 'RUN-A', legSequence: 2 }, 'Vòng xe RUN-A · Chặng 2'],
    [{ tripCode: null, runCode: null, legSequence: null }, 'Không gắn việc'],
  ])('%o -> %s', (context, expected) => {
    expect(fuelContextLabel(context)).toBe(expected);
  });
});

const nativeView = (
  over: Partial<FuelEntryCostAttributionView> = {},
): FuelEntryCostAttributionView => ({
  fuelEntryId: 'phieu-1',
  amount: 2_100_000,
  currencyCode: 'VND',
  verificationStatus: 'VERIFIED',
  businessDate: '2026-09-22',
  vehicleId: 'xe-1',
  ledger: 'FUEL_COST_ATTRIBUTION',
  legacyTrip: null,
  context: { runId: 'vong-1', runCode: 'RUN-A', legId: 'chang-2', legSequence: 2 },
  attributedAmount: 1_500_000,
  unattributedAmount: 600_000,
  lines: [
    {
      id: 'dong-1',
      kind: 'ALLOCATION',
      targetKind: 'RUN',
      runId: 'vong-1',
      runCode: 'RUN-A',
      legId: null,
      legSequence: null,
      signedAmount: 1_500_000,
      reversalOfId: null,
      reversedById: null,
      note: null,
      recordedBy: 'ke-toan',
      createdAt: '2026-09-22T05:00:00.000Z',
    },
  ],
  ...over,
});

describe('panel gia thanh cua ke toan — lop RIENG, mot phieu mot so cai', () => {
  it('phieu theo vong xe: tong/da phan bo/con lai, dich de xuat tu ngu canh, mac dinh = phan con lai', () => {
    const model = toFuelCostAttributionModel(nativeView(), 'ACCOUNTING');
    expect(model.isLegacyTrip).toBe(false);
    expect(model.canAttribute).toBe(true);
    expect(model.targets.map((target) => target.target)).toEqual([
      { kind: 'RUN', runId: 'vong-1' },
      { kind: 'LEG', legId: 'chang-2' },
    ]);
    expect(model.defaultAmount).toBe(600_000);
    expect(model.lines[0]).toMatchObject({ kindLabel: 'Phân bổ', isActiveAllocation: true });
  });

  it('phieu chuyen cu: chi noi gia thanh da vao chuyen, KHONG cho phan bo lan hai', () => {
    const model = toFuelCostAttributionModel(
      nativeView({
        ledger: 'LEGACY_TRIP_EXPENSE',
        legacyTrip: { tripId: 'chuyen-1', tripCode: 'CH-01', projectedExpenseId: 'chi-phi-1' },
        attributedAmount: null,
        unattributedAmount: null,
        lines: [],
      }),
      'ACCOUNTING',
    );
    expect(model.isLegacyTrip).toBe(true);
    expect(model.canAttribute).toBe(false);
    expect(model.ledgerNote).toContain('CH-01');
  });

  it('chua duyet / da phan bo het / khong co quyen -> khong cho cap phat, co ly do', () => {
    expect(
      toFuelCostAttributionModel(nativeView({ verificationStatus: 'DECLARED' }), 'ACCOUNTING')
        .blockedReason,
    ).toBe('Duyệt phiếu trước khi phân bổ giá thành.');
    expect(
      toFuelCostAttributionModel(
        nativeView({ attributedAmount: 2_100_000, unattributedAmount: 0 }),
        'ACCOUNTING',
      ).canAttribute,
    ).toBe(false);
    const driver = toFuelCostAttributionModel(nativeView(), 'SALE');
    expect(driver.canAttribute).toBe(false);
    expect(driver.canReverse).toBe(false);
  });

  it('dong da bi dao khong con nut dao', () => {
    const model = toFuelCostAttributionModel(
      nativeView({
        lines: [
          { ...nativeView().lines[0]!, reversedById: 'dong-2' },
          {
            ...nativeView().lines[0]!,
            id: 'dong-2',
            kind: 'REVERSAL',
            signedAmount: -1_500_000,
            reversalOfId: 'dong-1',
          },
        ],
      }),
      'ACCOUNTING',
    );
    expect(model.lines.map((line) => line.isActiveAllocation)).toEqual([false, false]);
    expect(model.lines[1]!.kindLabel).toBe('Đảo');
  });
});

describe('#385 — hop xac nhan duyet noi DUNG tien di dau theo cach tra', () => {
  it('tien mat lai xe tren vong xe: tru quy, KHONG vao cong no cay xang, gia thanh phan bo sau', () => {
    const text = verifyConsequence({ paymentMethod: 'DRIVER_CASH', amount: 460_000, tripId: null });
    expect(text).toContain('trừ vào quỹ lái xe');
    expect(text).toContain('không vào công nợ cây xăng');
    expect(text).toContain('phân bổ sau');
    expect(text).not.toContain('kỳ đối soát bảng kê');
  });

  it('tien mat lai xe tren chuyen cu: tru quy va vao chi phi chuyen', () => {
    expect(
      verifyConsequence({ paymentMethod: 'DRIVER_CASH', amount: 1, tripId: 'chuyen-1' }),
    ).toContain('chi phí của chuyến');
  });

  it('ghi no cay xang: van la ky doi soat bang ke', () => {
    expect(
      verifyConsequence({ paymentMethod: 'SUPPLIER_ACCOUNT', amount: 1, tripId: null }),
    ).toContain('kỳ đối soát bảng kê');
  });
});
