import type { GeoPoint } from '../geo/geo-point.js';

/**
 * BO NHO DEM ket qua tim dia diem — trong bo nho, co han, co tran. Cung ba he qua voi
 * `cached-routing.adapter.ts`:
 *
 *   1. NO CHET CUNG TIEN TRINH. Khong bang, khong Redis: mot ket qua tim kiem la mot goi y co han
 *      dung, khong phai du lieu nghiep vu. Luu ben vung se tao mot "so dia chi" ma ai do se tuong
 *      la nguon su that.
 *   2. MUC LAY RA MANG `fromCache: true` — nguoi goi biet cau tra loi nay khong vua hoi.
 *   3. THAT BAI KHONG DUOC DEM (lop boc tu quyet dinh, xem `gated-place-search.adapter.ts`).
 *
 * Tran so muc va duoi muc cu nhat theo thu tu chen cua `Map` (khong phai LRU): o quy mo vai tram
 * muc, khac biet ty le trung khong do duoc, con khac biet so dong code thi co.
 */

export const PLACE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const PLACE_CACHE_MAX_ENTRIES = 500;

/**
 * Chuoi tim GON: NFC (chu co dau go tu hai bo go khac nhau van la MOT chu), bo khoang trang
 * dau/cuoi, gom khoang trang giua. Day la chuoi DUOC GUI di — giu nguyen chu hoa/thuong.
 */
export function compactPlaceQuery(query: string): string {
  return query.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

/** Khoa dem: chuoi gon + chu thuong. "  Dinh  Vu " va "dinh vu" la mot cau hoi. */
export function normalizePlaceQuery(query: string): string {
  return compactPlaceQuery(query).toLowerCase();
}

export const searchCacheKey = (query: string): string => `search|${normalizePlaceQuery(query)}`;

export const reverseCacheKey = (point: GeoPoint): string =>
  `reverse|${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;

interface CacheEntry<V> {
  readonly value: V;
  readonly expiresAtMs: number;
}

export class PlaceLookupCache<V> {
  private readonly entries = new Map<string, CacheEntry<V>>();

  constructor(
    private readonly ttlMs: number = PLACE_CACHE_TTL_MS,
    private readonly maxEntries: number = PLACE_CACHE_MAX_ENTRIES,
    private readonly now: () => number = Date.now,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  read(key: string): { readonly hit: true; readonly value: V } | { readonly hit: false } {
    const entry = this.entries.get(key);
    if (!entry) return { hit: false };
    if (entry.expiresAtMs <= this.now()) {
      this.entries.delete(key);
      return { hit: false };
    }
    return { hit: true, value: entry.value };
  }

  write(key: string, value: V): void {
    if (this.ttlMs <= 0 || this.maxEntries <= 0) return;
    if (!this.entries.has(key) && this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, expiresAtMs: this.now() + this.ttlMs });
  }
}
