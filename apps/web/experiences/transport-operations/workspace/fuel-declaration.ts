import type { DriverFuelSubmitInput } from '../transport-api';
import type { BusinessDate, DriverFuelRunView, FuelPaymentMethod } from '../transport-types';

/**
 * TO KHAI NHIEN LIEU cua lai xe — phan THUAN cua bieu mau (`#313`).
 *
 * ================================================================================================
 * `occurredAt` DUOC GIU TRONG FORM, KHONG SINH LUC BAM
 * ================================================================================================
 *
 * May chu chong ghi trung bang `correlationKey` + mot dinh danh 11 truong co `occurredAtMs`
 * (`fuel-entry-identity.ts`). Ban tren `main` gui `new Date().toISOString()` ngay luc bam, nen mot
 * lan bam lai sau khi mat mang — CUNG khoa — mang mot `occurredAt` khac va bi `409
 * FUEL_CORRELATION_KEY_REUSED` thay vi duoc phat lai phieu da ghi. Gio thoi diem la mot o CUA FORM
 * (mac dinh la luc mo form, lai xe sua duoc), va than yeu cau la mot ham thuan cua form: cung form +
 * cung khoa -> cung than.
 *
 * ================================================================================================
 * NGAY NGHIEP VU THEO MUI GIO KHACH (`INV-25`)
 * ================================================================================================
 *
 * O `datetime-local` hien gio theo dien thoai cua lai xe. Khoanh khac suy ra tu do la tuyet doi
 * (ISO co `Z`), va `businessDate` duoc tinh tu khoanh khac do theo `policies.transportCore.timeZone`
 * — gui TUONG MINH, vi may chu khong suy ngay tu `occurredAt` ma lay "hom nay" khi thieu. Do dau luc
 * 23:00 roi khai luc 00:30 hom sau se khong con roi sang nham ngay.
 */

export interface DriverFuelForm {
  readonly supplierId: string;
  /** `#317` G1 — tram/diem do. `''` = khong khai (nha cung cap chua co danh muc tram). */
  readonly stationId: string;
  readonly liters: string;
  readonly amount: string;
  readonly odometerKm: string;
  readonly invoiceNo: string;
  /** Gia tri cua `<input type="datetime-local">` — `YYYY-MM-DDTHH:mm` theo gio dien thoai. */
  readonly occurredAtLocal: string;
  readonly paymentMethod: FuelPaymentMethod;
}

/**
 * MAC DINH LA GHI NO CAY XANG (`SUPPLIER_ACCOUNT`) — `OWNER_DECISIONS_2026_09_17`, `#317`.
 *
 * Luong chuan cua `#295` la cay xang HOP DONG: lai xe do dau va KHONG tra tien mat. `DRIVER_CASH`
 * (-> quy lai xe khi duyet) chi khi lai xe CHU DONG chon vi that su ung tien. Guong cua
 * `DEFAULT_FUEL_PAYMENT_METHOD` o may chu.
 *
 * Mac dinh nay KHONG sinh cong no luc khai: to khai van chi la mot su that van hanh; cong no nha
 * cung cap chi xuat hien sau doi soat bang ke + dong ky.
 */
export const DEFAULT_DRIVER_PAYMENT_METHOD: FuelPaymentMethod = 'SUPPLIER_ACCOUNT';

/** Dong ho dien thoai lech vai phut la chuyen thuong; mot phieu cua ngay mai thi khong. */
export const OCCURRED_AT_CLOCK_SKEW_MS = 5 * 60_000;

const pad = (value: number): string => String(value).padStart(2, '0');

export const toDateTimeLocalValue = (instant: Date): string =>
  `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}` +
  `T${pad(instant.getHours())}:${pad(instant.getMinutes())}`;

const LOCAL_VALUE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** `null` cho gia tri khong co that (thang 13, 99 gio) — khong de `Date` am tham tran sang ngay khac. */
export const fromDateTimeLocalValue = (value: string): Date | null => {
  const parts = LOCAL_VALUE.exec(value);
  if (parts === null) return null;
  const [year, month, day, hour, minute] = parts.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const instant = new Date(year, month - 1, day, hour, minute, 0, 0);
  const isSame =
    instant.getFullYear() === year &&
    instant.getMonth() === month - 1 &&
    instant.getDate() === day &&
    instant.getHours() === hour &&
    instant.getMinutes() === minute;
  return isSame ? instant : null;
};

/** Ngay nghiep vu cua mot khoanh khac theo mui gio khach; mui gio hong thi roi ve mui gio may. */
export const businessDateOf = (instant: Date, timeZone: string | undefined): BusinessDate => {
  const parts = { year: 'numeric', month: '2-digit', day: '2-digit' } as const;
  try {
    return new Intl.DateTimeFormat('en-CA', { ...parts, timeZone }).format(instant);
  } catch {
    return new Intl.DateTimeFormat('en-CA', parts).format(instant);
  }
};

export const occurredAtProblem = (value: string, now: Date): string | null => {
  const instant = fromDateTimeLocalValue(value);
  if (instant === null) return 'Chọn thời điểm đổ.';
  if (instant.getTime() > now.getTime() + OCCURRED_AT_CLOCK_SKEW_MS) {
    return 'Thời điểm đổ không được ở tương lai.';
  }
  return null;
};

/**
 * NGU CANH cua phieu lai xe dang khai — `#364`.
 *
 * `RUN`: viec duoc dieu (vong xe, chang tuy chon) — KHONG gui `vehicleId`: xe LA xe cua vong xe, may
 * chu tu lay. `LEGACY_TRIP`: chuyen v1 cua cach lam cu — gui ca `vehicleId` nhu truoc.
 */
export type DriverFuelContext =
  | { readonly kind: 'RUN'; readonly runId: string; readonly legId: string | null }
  | { readonly kind: 'LEGACY_TRIP'; readonly tripId: string; readonly vehicleId: string };

/** Mot lua chon ngu canh tren o khai phieu. */
export interface DriverFuelContextOption {
  readonly key: string;
  readonly label: string;
  readonly vehicleLabel: string;
  readonly kind: DriverFuelContext['kind'];
  /** Chang CHON DUOC (khong gom chang da huy) — rong voi chuyen v1. */
  readonly legs: readonly { readonly legId: string; readonly label: string }[];
  readonly runId: string | null;
  readonly tripId: string | null;
  readonly vehicleId: string | null;
}

/**
 * CAC NGU CANH khai duoc, theo thu tu uu tien — `#364`.
 *
 * Viec DUOC DIEU (vong xe) di truoc: vong xe DANG CHAY truoc vong xe moi len ke hoach, roi theo ma.
 * Chuyen v1 dang mo chi la LOI PHU cho cach lam cu, xep cuoi. Khong co gi thi danh sach RONG — va man
 * hinh phai noi "chua khai duoc" chu khong bia mot ngu canh (may chu cung se tu choi).
 */
export const driverFuelContextOptions = (input: {
  readonly runs: readonly DriverFuelRunView[];
  readonly legacyTrip: {
    readonly id: string;
    readonly code: string;
    readonly vehicleId: string | null;
    readonly vehiclePlate: string | null;
  } | null;
}): DriverFuelContextOption[] => {
  const rank = (status: string): number => (status === 'ACTIVE' ? 0 : 1);
  const runs = [...input.runs].sort(
    (left, right) =>
      rank(left.runStatus) - rank(right.runStatus) || left.runCode.localeCompare(right.runCode),
  );
  const options: DriverFuelContextOption[] = runs.map((run) => ({
    key: `run:${run.runId}`,
    label: `Vòng xe ${run.runCode}`,
    vehicleLabel: run.vehiclePlate ?? 'Xe của vòng xe',
    kind: 'RUN',
    legs: run.legs
      .filter((leg) => leg.status !== 'CANCELLED')
      .map((leg) => ({
        legId: leg.legId,
        label: `Chặng ${leg.sequence}: ${leg.originLabel} → ${leg.destinationLabel}`,
      })),
    runId: run.runId,
    tripId: null,
    vehicleId: run.vehicleId,
  }));
  const trip = input.legacyTrip;
  if (trip !== null && trip.vehicleId !== null) {
    options.push({
      key: `trip:${trip.id}`,
      label: `Chuyến cũ ${trip.code}`,
      vehicleLabel: trip.vehiclePlate ?? 'Xe của chuyến',
      kind: 'LEGACY_TRIP',
      legs: [],
      runId: null,
      tripId: trip.id,
      vehicleId: trip.vehicleId,
    });
  }
  return options;
};

/** Lua chon + chang dang chon -> ngu canh gui len may chu. */
export const toDriverFuelContext = (
  option: DriverFuelContextOption,
  legId: string | null,
): DriverFuelContext =>
  option.kind === 'RUN'
    ? { kind: 'RUN', runId: option.runId as string, legId }
    : {
        kind: 'LEGACY_TRIP',
        tripId: option.tripId as string,
        vehicleId: option.vehicleId as string,
      };

/**
 * CAU GIAI THICH duoi o "Thanh toán" — noi tien DI DAU, theo dung hop dong may chu.
 *
 * `#369` R-4 da go `FUEL_ENTRY_DRIVER_CASH_REQUIRES_LEGACY_TRIP`: ca chuyen cu lan vong xe deu nhan
 * `DRIVER_CASH`. Phieu vong xe tra tien mat vao Quy lai xe bang MOT but toan `RUN_EXPENSE` luc ke toan
 * duyet, va KHONG BAO GIO vao cong no cay xang — nen o chon khong con khoa theo ngu canh nua. Cau nay
 * noi dieu do cho lai xe truoc khi bam, thay vi de ho doan tien cua minh co duoc hoan hay khong.
 */
export const DRIVER_PAYMENT_METHOD_HINT = {
  DRIVER_CASH:
    'Bạn tự trả tiền mặt: khi kế toán duyệt, khoản này trừ vào quỹ lái xe của bạn để công ty ' +
    'hoàn lại — không ghi nợ cây xăng.',
  SUPPLIER_ACCOUNT:
    'Cây xăng ghi nợ công ty: khoản này vào công nợ cây xăng sau khi đối chiếu bảng kê, không ' +
    'đụng tới quỹ của bạn.',
} as const satisfies Record<FuelPaymentMethod, string>;

/** Than `POST /transport/me/fuel/slips`. Ham THUAN: cung dau vao, cung than — dieu kien de gui lai. */
export const toDriverFuelSubmission = (input: {
  readonly form: DriverFuelForm;
  readonly context: DriverFuelContext;
  readonly correlationKey: string;
  readonly timeZone: string | undefined;
}): DriverFuelSubmitInput => {
  const occurredAt = fromDateTimeLocalValue(input.form.occurredAtLocal);
  if (occurredAt === null) throw new Error('Chọn thời điểm đổ.');
  const invoiceNo = input.form.invoiceNo.trim();
  const context =
    input.context.kind === 'RUN'
      ? // Khong `vehicleId`, khong `tripId`, khong `driverId`: xe LA xe cua vong xe, lai xe tu phien.
        { runId: input.context.runId, legId: input.context.legId }
      : { tripId: input.context.tripId, vehicleId: input.context.vehicleId };
  return {
    ...context,
    supplierId: input.form.supplierId,
    // `null` tuong minh chu khong bo truong: than yeu cau la ham thuan cua form, gui lai phai giong het.
    stationId: input.form.stationId === '' ? null : input.form.stationId,
    liters: input.form.liters.trim(),
    amount: Number(input.form.amount),
    odometerKm: Number(input.form.odometerKm),
    occurredAt: occurredAt.toISOString(),
    businessDate: businessDateOf(occurredAt, input.timeZone),
    paymentMethod: input.form.paymentMethod,
    invoiceNo: invoiceNo === '' ? null : invoiceNo,
    correlationKey: input.correlationKey,
  };
};
