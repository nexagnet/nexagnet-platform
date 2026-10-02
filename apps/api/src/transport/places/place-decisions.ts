import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH cua tang TIM DIA DIEM (#379).
 *
 * MOT diem quyet dinh: `place.lookup` — "lan tim nay lay cau tra loi tu dau, hoac vi sao khong co
 * cau tra loi". Nam ma, moi ma mot cau khac nhau tren man hinh, de mot trace tra loi duoc *"vi sao
 * o tim khong ra gi"* ma khong phai mo source.
 *
 * `detail` cua quyet dinh nay CHI co `operation`, `providerId`, `queryLength`, `resultCount`,
 * `reason`. KHONG BAO GIO chuoi nguoi dung go, KHONG BAO GIO toa do: ca hai la du lieu vi tri, va
 * lop che telemetry khong biet khoa `query` la noi dung (xem `telemetry-redaction.ts`).
 */
export const PLACE_LOOKUP_REASONS = [
  /** Nha cung cap vua tra loi. */
  'PLACE_LOOKUP_FROM_PROVIDER',
  /** Cau tra loi con han trong bo nho dem — khong ton mot lan goi ra ngoai. */
  'PLACE_LOOKUP_FROM_CACHE',
  /** Chua bat nha cung cap, hoac nha cung cap chua duoc duyet cho du lieu khach that. */
  'PLACE_LOOKUP_DISABLED',
  /** Cong gioi han toan ung dung dang day — tu choi TRUOC khi goi ra ngoai. */
  'PLACE_LOOKUP_BUSY',
  /** Nha cung cap khong tra loi duoc (mang, het gio, 429, 5xx, sai hinh dang). */
  'PLACE_LOOKUP_UNAVAILABLE',
] as const;
export type PlaceLookupReason = (typeof PLACE_LOOKUP_REASONS)[number];

export const TRANSPORT_PLACE_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-places',
  points: ['place.lookup'],
  labels: {
    PLACE_LOOKUP_FROM_PROVIDER: 'Ket qua tim dia diem lay tu nha cung cap',
    PLACE_LOOKUP_FROM_CACHE: 'Dung lai ket qua tim dia diem con han trong bo nho dem',
    PLACE_LOOKUP_DISABLED: 'Tim dia diem chua duoc bat cho doanh nghiep nay',
    PLACE_LOOKUP_BUSY: 'Dang co nhieu luot tim cung luc — tu choi truoc khi goi ra ngoai',
    PLACE_LOOKUP_UNAVAILABLE: 'Nha cung cap tim dia diem tam thoi khong tra loi',
  } satisfies Record<PlaceLookupReason, string>,
});
