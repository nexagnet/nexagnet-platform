import { z } from 'zod';
import { MONEY_MAX_AMOUNT } from '../money.js';
import { businessDateSchema } from '../transport.schemas.js';
import { RUN_LEG_KINDS } from './movement.types.js';

/**
 * BIEN HTTP cua mien van chuyen v2. Moi schema deu `.strict()`: mot truong go sai ten phai bi
 * TU CHOI, khong phai bi bo qua im lang -- bo qua im lang la cach mot cuoc "khong hieu vi sao
 * khong luu" ra doi.
 */

const trimmed = z.string().trim();
const label = trimmed.min(1).max(200);
const code = trimmed.min(1).max(60);
const note = trimmed.max(1000);
const reference = trimmed.min(1).max(100);

/** Tien: cung tran voi `money()`, khong tu dat mot bien khac. */
const vndAmount = z.number().int().nonnegative().max(MONEY_MAX_AMOUNT);

/** Km la cot `Int` cua Postgres, nen tran la `int32` chu khong phai tran cua tien. */
const PG_INT32_MAX = 2_147_483_647;
const countedInt = z.number().int().nonnegative().max(PG_INT32_MAX);

/**
 * MOT DIEM tren ban do (#379), WGS84 do thap phan.
 *
 * `z.number()` KHONG chan mien, cung quy uoc voi `dispatchPickupSchema`: khoang va null island chi
 * kiem MOT lan o `parseGeoPoint()` (tang mien). Hai bo nguong o hai tang se co ngay lech nhau.
 * `.strict()` vi mot khoa la (`lat`, `lng`, `accuracy`) la dau hieu client gui sai hinh -- nhan im
 * lang thi toa do that bi bo roi don luu voi mot diem khac y nguoi chon.
 */
const orderPoint = z.object({ latitude: z.number(), longitude: z.number() }).strict();

/**
 * Tao don qua HTTP BAT BUOC co ca hai diem (#379): toa do la su that ve vi tri, nhan chi de hien
 * thi. Duong noi bo (chieu tu chuyen v1) khong di qua schema nay va ghi `null` tuong minh.
 */
export const createOrderSchema = z
  .object({
    code,
    originLabel: label,
    destinationLabel: label,
    originPoint: orderPoint,
    destinationPoint: orderPoint,
    businessDate: businessDateSchema.optional(),
    customerId: reference.nullish(),
    cargoDescription: note.nullish(),
    freightAmount: vndAmount.nullish(),
    note: note.nullish(),
  })
  .strict();

export const updateOrderSchema = z
  .object({
    originLabel: label.optional(),
    destinationLabel: label.optional(),
    customerId: reference.nullish(),
    cargoDescription: note.nullish(),
    freightAmount: vndAmount.nullish(),
    note: note.nullish(),
  })
  .strict();

/**
 * `CANCELLED` CO Y vang mat khoi enum nay: huy di duong rieng vi no doi mot ly do bang chu. Cung
 * ly do da ghi o `transport.schemas.ts` cho chuyen v1.
 */
export const orderTransitionSchema = z.object({ to: z.enum(['FULFILLED']) }).strict();

export const cancelSchema = z.object({ reason: trimmed.min(1).max(500) }).strict();

export const createRunSchema = z
  .object({
    code,
    vehicleId: reference,
    businessDate: businessDateSchema.optional(),
    note: note.nullish(),
  })
  .strict();

/*
 * `COMPLETED` KHONG con o day — `#293` R1.
 *
 * Dong mot vong chay la quyet dinh cua HE THONG, va no di duong rieng (`closeRunAsSystem`), cung
 * khuon voi `CANCELLED`. Mot be mat HTTP van rao `COMPLETED` la mot loi moi: nguoi tich hop doc
 * schema se tin rang ho gui duoc gia tri do, roi nhan mot loi tu choi o tang mien ma le ra ho
 * khong bao gio phai cham toi.
 *
 * Tang mien VAN tu choi (`RUN_COMPLETE_REQUIRES_SYSTEM_PATH`) — hai lop, va lop thu hai moi la
 * lop chan that: mot schema khong chung minh duoc rang khong con duong nao khac.
 */
export const runTransitionSchema = z.object({ to: z.enum(['ACTIVE']) }).strict();

/**
 * `orderId` duoc phep gui kem mot chang `EMPTY` o tang schema, va bi tu choi o tang MIEN voi ma
 * `LEG_EMPTY_CANNOT_CARRY_ORDER`. Co y: mot loi 400 "truong thua" khong noi cho nguoi dung biet
 * QUY TAC NGHIEP VU nao vua chan ho, con ma kia thi co.
 */
export const addLegSchema = z
  .object({
    sequence: z.number().int().min(1).max(999),
    kind: z.enum(RUN_LEG_KINDS),
    orderId: reference.nullish(),
    originLabel: label,
    destinationLabel: label,
    businessDate: businessDateSchema.optional(),
    distanceKm: countedInt.nullish(),
    note: note.nullish(),
  })
  .strict();

export const assignRunSchema = z.object({ driverId: reference }).strict();

export type CreateOrderBody = z.infer<typeof createOrderSchema>;
export type UpdateOrderBody = z.infer<typeof updateOrderSchema>;
export type OrderTransitionBody = z.infer<typeof orderTransitionSchema>;
export type CancelBody = z.infer<typeof cancelSchema>;
export type CreateRunBody = z.infer<typeof createRunSchema>;
export type RunTransitionBody = z.infer<typeof runTransitionSchema>;
export type AddLegBody = z.infer<typeof addLegSchema>;
export type AssignRunBody = z.infer<typeof assignRunSchema>;
