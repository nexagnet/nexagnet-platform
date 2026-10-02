import { z } from 'zod';
import { MONEY_MAX_AMOUNT } from './money.js';
import {
  DRIVER_STATUSES,
  PARTNER_ROLE_KINDS,
  PARTY_STATUSES,
  VEHICLE_STATUSES,
} from './transport.types.js';
import { TRIP_KINDS, TRIP_STATUSES } from './trips/trip-lifecycle.js';

/**
 * Kiem dau vao tai BIEN GIOI HTTP.
 *
 * Dat trong thu muc cua mien (nhu `auth/auth.schemas.ts` da lam) chu khong o `packages/shared`:
 * hom nay khong client nao dung chung nhung kieu nay, va dua chung len goi dung chung se buoc moi
 * khach — ke ca khach khong van tai — phai build lai khi mot truong cua van tai doi.
 */

const nonEmpty = z.string().trim().min(1);
const optionalText = z.string().trim().min(1).nullable().optional();

/**
 * Tien: SO NGUYEN DONG (`GD-03`). `z.number().int()` chan luon so thuc ngay tai bien gioi.
 *
 * `.max(MONEY_MAX_AMOUNT)` la du thua ve HANH VI — zod 4 da bo `.int()` ve dung khoang nguyen an
 * toan — nhung KHONG du thua ve HOP DONG: no lam bien gioi HTTP dan ve cung mot hang so ma `money()`
 * va `CHECK` cua cot dung, nen ba tang khong the troi ra khoi nhau ma khong ai thay (T2.1/F1).
 */
const vndAmount = z.number().int().nonnegative().max(MONEY_MAX_AMOUNT);

/**
 * SO DEM van la `INTEGER` o DB — km, kg, so cong-to-met deu khong co ly do gi de la `BIGINT`.
 *
 * Nhung khoang cua `z.number().int()` la `+-(2^53-1)`, rong hon `INTEGER` gap ~4 trieu lan, nen
 * mot `distanceKm = 9e15` qua duoc kiem HTTP roi chet o `INSERT` bang loi tran kieu cua Postgres —
 * y HET lech ma F1 vá cho cot tien, chi khac la cot nay khong dang doi sang `BIGINT`. Vay thi
 * siet o bien gioi: sai dau vao phai ra 400, khong ra 500.
 */
const PG_INT32_MAX = 2_147_483_647;
const countedInt = z.number().int().nonnegative().max(PG_INT32_MAX);

const businessDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'ngay nghiep vu phai co dang YYYY-MM-DD');

/**
 * XUAT ra cho `settlement/settlement.schemas.ts` — `#168 B1`.
 *
 * Go lai cung mot bieu thuc o tep khac se cho ra hai dinh nghia cua "ngay nghiep vu", va chung se
 * lech nhau dung vao lan dau tien ai do noi long mot ben.
 */
export const businessDateSchema = businessDate;

export const createVehicleSchema = z
  .object({
    registrationPlate: nonEmpty.max(20),
    vehicleClass: nonEmpty.max(120),
    allowedPayloadKg: countedInt.positive().nullable().optional(),
    currentOdoKm: countedInt.optional(),
    status: z.enum(VEHICLE_STATUSES).optional(),
  })
  .strict();

export const updateVehicleSchema = createVehicleSchema
  .omit({ registrationPlate: true })
  .partial()
  .strict();

/**
 * Ho so lai xe — KHONG co `authUserId` (`#395` §1.8).
 *
 * Truoc day truong nay nam o day: ai co `transport.driver.manage` (ca Ke toan) go mot ma tai khoan
 * bat ky vao la noi duoc, khong kiem vai, khong kiem tai khoan co that hay dang bi khoa. Noi tai
 * khoan la mot thao tac PHAN QUYEN, nen no co route rieng (`PUT /transport/drivers/:driverId/account`,
 * chi Giam doc) va luat rieng (`DriverAccountLinkService`). `strict` bien mot client cu con gui
 * truong nay thanh `400` ro rang, khong am tham bo qua.
 */
export const createDriverSchema = z
  .object({
    fullName: nonEmpty.max(120),
    phone: nonEmpty.max(20),
    licenceClass: nonEmpty.max(10),
    licenceExpiry: businessDate,
    status: z.enum(DRIVER_STATUSES).optional(),
  })
  .strict();

export const updateDriverSchema = createDriverSchema.partial().strict();

/** `PUT /transport/drivers/:driverId/account` — `null` la GO noi, mot gia tri MINH THI. */
export const linkDriverAccountSchema = z
  .object({ authUserId: z.string().trim().min(1).max(100).nullable() })
  .strict();

export const assignVehicleDriverSchema = z.object({ driverId: nonEmpty }).strict();

export const createCustomerSchema = z
  .object({
    name: nonEmpty.max(200),
    phone: optionalText,
    address: optionalText,
    taxCode: optionalText,
    status: z.enum(PARTY_STATUSES).optional(),
  })
  .strict();

export const updateCustomerSchema = createCustomerSchema.partial().strict();

export const createPartnerSchema = z
  .object({
    name: nonEmpty.max(200),
    phone: optionalText,
    /** MOT hoac NHIEU vai — VT-054. Khong bao gio la mot gia tri don. */
    roles: z.array(z.enum(PARTNER_ROLE_KINDS)).min(1),
    status: z.enum(PARTY_STATUSES).optional(),
  })
  .strict();

export const updatePartnerSchema = createPartnerSchema.partial().strict();

export const planTripSchema = z
  .object({
    code: nonEmpty.max(40),
    kind: z.enum(TRIP_KINDS),
    originLabel: nonEmpty.max(200),
    destinationLabel: nonEmpty.max(200),
    businessDate: businessDate.optional(),
    cargoDescription: optionalText,
    customerId: z.string().min(1).nullable().optional(),
    carrierPartnerId: z.string().min(1).nullable().optional(),
    referrerPartnerId: z.string().min(1).nullable().optional(),
    freightAmount: vndAmount.nullable().optional(),
    distanceKm: countedInt.nullable().optional(),
  })
  .strict();

export const updateTripSchema = planTripSchema
  .omit({ code: true, kind: true, businessDate: true })
  .partial()
  .strict();

/**
 * Phan cong: ca hai truong deu nullable — chuyen thue xe ngoai khong co xe/lai xe cua cong ty, va
 * ep chung `NOT NULL` se buoc nguoi dung bia ra mot chiec xe khong ton tai.
 */
export const assignTripSchema = z
  .object({
    vehicleId: z.string().min(1).nullable(),
    driverId: z.string().min(1).nullable(),
  })
  .strict();

/**
 * Duong CHUYEN TRANG THAI chung — KHONG nhan `CANCELLED` (`#168 B6`).
 *
 * Tang thu hai, khong phai tang duy nhat: cong that nam o `evaluateTripTransition()`, vi mot cong
 * dat o schema chi bao ve nhung nguoi goi di qua HTTP. Dat ca hai vi chung tra loi hai cau khac
 * nhau — schema noi "truong nay khong nhan gia tri do" (400, doc duoc ngay tren giao dien), con ham
 * mien noi "huy phai di qua duong rieng" (403 kem `reason` co kieu, dung cho MOI nguoi goi).
 *
 * Huy di qua `POST /transport/trips/:id/cancel`: no doi `transport.trip.cancel` va bat buoc mot ly
 * do, roi ghi `cancelledAt`/`cancellationReason`.
 *
 * Loc tu `TRIP_STATUSES` chu khong go tay bon chuoi: them mot trang thai moi vao vong doi ma quen
 * cho vao day se lam route chet lang le, con o dang nay thi no tu co mat.
 */
const TRANSITIONABLE_TRIP_STATUSES = TRIP_STATUSES.filter((status) => status !== 'CANCELLED') as [
  (typeof TRIP_STATUSES)[number],
  ...(typeof TRIP_STATUSES)[number][],
];

export const transitionTripSchema = z.object({ to: z.enum(TRANSITIONABLE_TRIP_STATUSES) }).strict();

export const cancelTripSchema = z.object({ reason: nonEmpty.max(500) }).strict();

/** Lai xe chi dat duoc hai trang thai; `RECONCILED` la cong cua ke toan (`GD-01`). */
export const driverTripStatusSchema = z
  .object({ to: z.enum(['IN_TRANSIT', 'DELIVERED']) })
  .strict();

export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'du lieu khong hop le';
}
