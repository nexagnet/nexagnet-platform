import type { GeoPoint } from '../geo/geo-point.js';
import {
  PlaceLookupCache,
  compactPlaceQuery,
  reverseCacheKey,
  searchCacheKey,
} from './place-lookup-cache.js';
import { TransportPlaceSearchPort } from './place-search.port.js';
import type {
  PlaceCandidate,
  PlaceLookupOutcome,
  PlaceSearchAvailability,
} from './place-search.types.js';
import type { GateOutcome, ProviderCallGate } from './provider-call-gate.js';

/** Mot muc dem, mang nhan loai cau hoi — tim va tim nguoc dung chung MOT bo nho dem. */
type CachedLookup =
  | { readonly operation: 'search'; readonly value: readonly PlaceCandidate[] }
  | { readonly operation: 'reverse'; readonly value: PlaceCandidate | null };

type CacheRead<V> = { readonly hit: true; readonly value: V } | { readonly hit: false };

const MISS = { hit: false } as const;

/**
 * LOP BOC cua moi nha cung cap THAT: bo nho dem TRUOC, cong gioi han SAU.
 *
 * Thu tu do la co y. Mot cau hoi da co san cau tra loi khong duoc ton mot cho trong hang doi cua
 * cong — neu khong, mot nguoi bam "tim" lai lan thu hai se lam nguoi thu ba nhan "ban" cho mot
 * cau hoi ma he thong da biet cau tra loi.
 *
 * Chuoi GUI di la chuoi da gom khoang trang va NFC nhung GIU chu hoa/thuong nguoi dung go; khoa
 * dem thi ha chu thuong. Nominatim khong phan biet hoa/thuong, nen hai cau hoi chung mot khoa that
 * su la mot cau hoi.
 *
 * MOT bo nho dem cho CA tim lan tim nguoc, chung mot tran (500 muc). Hai bo rieng moi bo 500 muc
 * se de bo nho phinh toi gap doi con so ma tai lieu van hanh hua; hai tien to khoa `search|` /
 * `reverse|` giu hai loai cau hoi khong bao gio dung nhau. Muc dem mang NHAN loai (`operation`)
 * de doc ra dung kieu ma khong can mot phep ep kieu nao.
 */
export class GatedPlaceSearchAdapter extends TransportPlaceSearchPort {
  readonly providerId: string;

  private readonly cache: PlaceLookupCache<CachedLookup>;

  constructor(
    private readonly inner: TransportPlaceSearchPort,
    private readonly gate: ProviderCallGate,
    cacheOptions: {
      readonly ttlMs?: number;
      readonly maxEntries?: number;
      readonly now?: () => number;
    } = {},
  ) {
    super();
    this.providerId = inner.providerId;
    this.cache = new PlaceLookupCache(
      cacheOptions.ttlMs,
      cacheOptions.maxEntries,
      cacheOptions.now,
    );
  }

  /** So muc dang dem, CA hai loai — de bai kiem chung minh tran dung chung. */
  get cachedEntries(): number {
    return this.cache.size;
  }

  describe(): PlaceSearchAvailability {
    return this.inner.describe();
  }

  search(query: string): Promise<PlaceLookupOutcome<readonly PlaceCandidate[]>> {
    const sent = compactPlaceQuery(query);
    return this.lookup(
      searchCacheKey(query),
      () => this.inner.search(sent),
      (value) => ({ operation: 'search', value }),
      (entry) => (entry.operation === 'search' ? { hit: true, value: entry.value } : MISS),
    );
  }

  reverse(point: GeoPoint): Promise<PlaceLookupOutcome<PlaceCandidate | null>> {
    return this.lookup(
      reverseCacheKey(point),
      () => this.inner.reverse(point),
      (value) => ({ operation: 'reverse', value }),
      (entry) => (entry.operation === 'reverse' ? { hit: true, value: entry.value } : MISS),
    );
  }

  private async lookup<V>(
    key: string,
    call: () => Promise<PlaceLookupOutcome<V>>,
    wrap: (value: V) => CachedLookup,
    unwrap: (entry: CachedLookup) => CacheRead<V>,
  ): Promise<PlaceLookupOutcome<V>> {
    const stored = this.cache.read(key);
    const cached = stored.hit ? unwrap(stored.value) : MISS;
    if (cached.hit) return { status: 'OK', value: cached.value, fromCache: true };

    let gated: GateOutcome<PlaceLookupOutcome<V>>;
    try {
      gated = await this.gate.run(call);
    } catch {
      /*
       * Adapter ben trong da doi moi that bai thanh ma co kieu; nhanh nay la luoi cuoi cho mot
       * adapter tuong lai quen dieu do. Khong buoc doi tuong loi: than loi co the mang URL co `q=`.
       * Man hinh van nhan 200 + "tam ngung" thay vi mot 500 khong giai thich.
       */
      return { status: 'UNAVAILABLE', reason: 'PROVIDER_UNAVAILABLE' };
    }
    if (!gated.admitted) return { status: 'BUSY', reason: 'PROVIDER_BUSY' };

    const outcome = gated.value;
    // THAT BAI KHONG DUOC DEM: mot lan mang chap chon hai giay khong duoc bien thanh 24 gio tu choi.
    if (outcome.status === 'OK') this.cache.write(key, wrap(outcome.value));
    return outcome;
  }
}
