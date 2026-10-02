import { z } from 'zod';
import { PLACE_DISPLAY_KINDS } from './place-admin.types.js';

/**
 * HINH DANG dau vao cua man "Dia diem van hanh" (`#395`).
 *
 * Luat NGHIEP VU (vung phuc vu, ban kinh theo chinh sach khach, trung ten, bai xe) nam o
 * `PlaceAdminService`; o day chi la bien ngoai cung — cung khuon voi `site.schemas.ts` va
 * `registerGeofenceSchema`: ten 1..200, dia chi `NULL` hoac 1..500 (rong bi `CHECK` chan), ban kinh
 * tuyet doi 10..100 000 m (bang cung chan). Than `.strict()`: khong mot khoa la nao lot qua.
 */

const trimmed = z.string().trim();
const name = trimmed.min(1).max(200);
const address = trimmed.min(1).max(500).nullish();
const note = trimmed.max(500).nullish();
const id = trimmed.min(1).max(100);
const radiusMetres = z.number().int().min(10).max(100_000);
const acknowledgeOpenWork = z.boolean().optional();

/** Cung khuon `TransportCounterparty_taxCode_shape` (va `counterparty.schemas.ts`). */
const taxCode = trimmed.regex(/^[0-9]{10}(-[0-9]{3})?$/, 'ma so thue phai la 10 so hoac 10-3 so');

const point = z.object({ latitude: z.number(), longitude: z.number() }).strict();

const owner = z.union([
  z.object({ counterpartyId: id }).strict(),
  z.object({ customerId: id }).strict(),
  z.object({ newCounterparty: z.object({ name, taxCode: taxCode.nullish() }).strict() }).strict(),
]);

export const createPlaceSchema = z
  .object({
    kind: z.enum(['DEPOT', 'COUNTERPARTY_SITE']),
    name,
    address,
    point,
    radiusMetres,
    note,
    owner: owner.optional(),
    siteId: id.optional(),
  })
  .strict();

export const updatePlaceSchema = z
  .object({
    name: name.optional(),
    address,
    point: point.optional(),
    radiusMetres: radiusMetres.optional(),
    note,
    acknowledgeOpenWork,
  })
  .strict();

export const deactivatePlaceSchema = z
  .object({ reason: trimmed.min(1).max(500), acknowledgeOpenWork })
  .strict();

export const activatePlaceSchema = z.object({}).strict();

export const makePrimaryDepotSchema = z.object({ acknowledgeOpenWork }).strict();

/** Chuoi truy van — khong `.strict()`: mot tham so la (vd chong cache) khong phai loi cua ai. */
export const listPlacesQuerySchema = z.object({
  kind: z.enum(PLACE_DISPLAY_KINDS).optional(),
  status: z.enum(['active', 'inactive', 'all']).optional(),
  q: trimmed.max(100).optional(),
});
