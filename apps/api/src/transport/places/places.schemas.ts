import { z } from 'zod';

/**
 * THAN YEU CAU cua be mat tim dia diem. `.strict()`: mot khoa la (vd `customerId`) bi TU CHOI chu
 * khong bi bo qua — tang nay khong duoc co mot cho nao de ma khach/ma don lot vao roi di ra ngoai.
 */

/** 2 ky tu tro len moi dang tim; 200 la du cho mot dia chi day du, va chan mot doan van dan nham. */
export const PLACE_QUERY_MIN_LENGTH = 2;
export const PLACE_QUERY_MAX_LENGTH = 200;

export const placeSearchSchema = z
  .object({
    query: z.string().trim().min(PLACE_QUERY_MIN_LENGTH).max(PLACE_QUERY_MAX_LENGTH),
  })
  .strict();

/**
 * Hai so, khong dat min/max o zod: nguong DUY NHAT la `parseGeoPoint` (cung tien le
 * `dispatch.schemas.ts`), de mot diem hong ra dung MOT ma `PLACE_POINT_INVALID` thay vi hai thong
 * bao khac nhau tuy lop nao bat duoc truoc.
 */
export const placeReverseSchema = z
  .object({
    latitude: z.number(),
    longitude: z.number(),
  })
  .strict();

export type PlaceSearchBody = z.infer<typeof placeSearchSchema>;
export type PlaceReverseBody = z.infer<typeof placeReverseSchema>;
