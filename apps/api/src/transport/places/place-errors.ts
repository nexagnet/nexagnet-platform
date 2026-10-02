import type { PlaceWriteReason } from './place-admin-decisions.js';

/**
 * MA TU CHOI DAU VAO cua tang TIM DIA DIEM (#379) va QUAN TRI DIA DIEM VAN HANH (#395).
 *
 * Tach khoi `place-decisions.ts` theo quy uoc cua mien van tai: tep kia tra loi "he thong quyet
 * dinh gi" (nguoi doc trace), tep nay tra loi "nguoi goi API gui cai gi sai" (nguoi bam nut).
 *
 * Tim kiem that bai (tat, ban, nha cung cap sap) KHONG nam o day: do la ket qua co kieu tra ve voi
 * ma 200, khong phai loi cua nguoi goi. Tep nay chi import KIEU (khong mot dong ma chay nao).
 */
export const TRANSPORT_PLACE_ERROR_REASONS = [
  /** Diem gui len de tim nguoc khong qua duoc `parseGeoPoint` (ngoai bien, NaN, Null Island). */
  'PLACE_POINT_INVALID',
] as const;

/**
 * Ma cua man "Dia diem van hanh" (`#395`) KHONG phai mot quyet dinh `place.write`. MOI tu choi co
 * kieu cua mot lan ghi (trung ten, bai xe dang bat, viec dang mo, luat chu cua dia diem...) nam o
 * `place-admin-decisions.ts` — `PLACE_WRITE_REASONS` — va duoc ghi quyet dinh; o day chi con ma
 * "chinh dia diem nay khong ton tai".
 */
export const PLACE_ADMIN_ERROR_REASONS = [
  /** Khong co dia diem van hanh nao mang ma do (hoac do la mot hang rao khong quan ly o day). */
  'PLACE_NOT_FOUND',
] as const;

export type TransportPlaceErrorReason =
  | (typeof TRANSPORT_PLACE_ERROR_REASONS)[number]
  | (typeof PLACE_ADMIN_ERROR_REASONS)[number]
  | PlaceWriteReason;
