import { describe, expect, it } from 'vitest';
import type { GeoPoint } from '../geo/geo-point.js';
import { GatedPlaceSearchAdapter } from './gated-place-search.adapter.js';
import {
  PLACE_CACHE_MAX_ENTRIES,
  PLACE_CACHE_TTL_MS,
  PlaceLookupCache,
  normalizePlaceQuery,
  reverseCacheKey,
  searchCacheKey,
} from './place-lookup-cache.js';
import { TransportPlaceSearchPort } from './place-search.port.js';
import {
  OPENSTREETMAP_ATTRIBUTION,
  type PlaceCandidate,
  type PlaceLookupOutcome,
  type PlaceSearchAvailability,
} from './place-search.types.js';
import { ProviderCallGate } from './provider-call-gate.js';

const CANDIDATE: PlaceCandidate = {
  label: 'Khu công nghiệp Đình Vũ',
  address: 'Hải An, Hải Phòng',
  point: { latitude: 20.8264, longitude: 106.7752 },
};

/** Nha cung cap GIA: dem lan goi, tra ket qua da dat san. */
class ScriptedProvider extends TransportPlaceSearchPort {
  readonly providerId = 'scripted';
  readonly searched: string[] = [];
  readonly reversed: GeoPoint[] = [];
  searchOutcome: PlaceLookupOutcome<readonly PlaceCandidate[]> = {
    status: 'OK',
    value: [CANDIDATE],
    fromCache: false,
  };
  reverseOutcome: PlaceLookupOutcome<PlaceCandidate | null> = {
    status: 'OK',
    value: CANDIDATE,
    fromCache: false,
  };

  describe(): PlaceSearchAvailability {
    return { available: true, providerId: this.providerId, attribution: OPENSTREETMAP_ATTRIBUTION };
  }

  async search(query: string): Promise<PlaceLookupOutcome<readonly PlaceCandidate[]>> {
    this.searched.push(query);
    return this.searchOutcome;
  }

  async reverse(point: GeoPoint): Promise<PlaceLookupOutcome<PlaceCandidate | null>> {
    this.reversed.push(point);
    return this.reverseOutcome;
  }
}

function build(options: { maxWaiting?: number; maxEntries?: number } = {}) {
  const clock = { nowMs: 0 };
  const now = () => clock.nowMs;
  const gate = new ProviderCallGate({
    minSpacingMs: 1100,
    maxWaiting: options.maxWaiting ?? 3,
    now,
    sleep: async (ms) => {
      clock.nowMs += ms;
    },
  });
  const inner = new ScriptedProvider();
  const adapter = new GatedPlaceSearchAdapter(inner, gate, {
    now,
    ...(options.maxEntries === undefined ? {} : { maxEntries: options.maxEntries }),
  });
  return { clock, inner, adapter, gate };
}

describe('khoa bo nho dem', () => {
  it('chuan hoa: NFC, bo khoang trang dau/cuoi, gom khoang trang, chu thuong', () => {
    const decomposed = 'Đình Vũ'.normalize('NFD');

    expect(normalizePlaceQuery(`  ${decomposed}   HẢI  Phòng `)).toBe('đình vũ hải phòng');
    expect(searchCacheKey('  Dinh   VU ')).toBe(searchCacheKey('dinh vu'));
    expect(searchCacheKey('dinh vu')).toBe('search|dinh vu');
  });

  it('khoa tim nguoc lam tron 5 chu so', () => {
    expect(reverseCacheKey({ latitude: 20.826401, longitude: 106.775204 })).toBe(
      'reverse|20.82640,106.77520',
    );
  });
});

describe('bo nho dem ket qua tim dia diem', () => {
  it('mac dinh 24 gio va 500 muc', () => {
    expect(PLACE_CACHE_TTL_MS).toBe(86_400_000);
    expect(PLACE_CACHE_MAX_ENTRIES).toBe(500);
  });

  it('het han sau TTL', () => {
    let nowMs = 0;
    const cache = new PlaceLookupCache<string>(1000, 10, () => nowMs);
    cache.write('k', 'v');

    nowMs = 999;
    expect(cache.read('k')).toEqual({ hit: true, value: 'v' });
    nowMs = 1000;
    expect(cache.read('k')).toEqual({ hit: false });
    expect(cache.size).toBe(0);
  });

  it('co tran: muc thu 501 day muc cu nhat ra', () => {
    const cache = new PlaceLookupCache<number>();
    for (let index = 0; index <= PLACE_CACHE_MAX_ENTRIES; index += 1) {
      cache.write(`k${index}`, index);
    }

    expect(cache.size).toBe(PLACE_CACHE_MAX_ENTRIES);
    expect(cache.read('k0')).toEqual({ hit: false });
    expect(cache.read(`k${PLACE_CACHE_MAX_ENTRIES}`)).toEqual({
      hit: true,
      value: PLACE_CACHE_MAX_ENTRIES,
    });
  });
});

describe('lop boc: bo nho dem truoc, cong gioi han sau', () => {
  it('lan hai cung cau hoi (khac hoa/thuong, khoang trang) lay tu bo nho dem', async () => {
    const { adapter, inner } = build();

    const first = await adapter.search('  Đình   Vũ ');
    const second = await adapter.search('đình vũ');

    expect(first).toEqual({ status: 'OK', value: [CANDIDATE], fromCache: false });
    expect(second).toEqual({ status: 'OK', value: [CANDIDATE], fromCache: true });
    expect(inner.searched).toEqual(['Đình Vũ']);
  });

  it('chuoi GUI di da gon nhung giu nguyen chu hoa/thuong', async () => {
    const { adapter, inner } = build();

    await adapter.search(`  ${'Đình Vũ'.normalize('NFD')}\t Hải Phòng `);

    expect(inner.searched).toEqual(['Đình Vũ Hải Phòng']);
  });

  it('het 24 gio thi hoi lai nha cung cap', async () => {
    const { adapter, inner, clock } = build();

    await adapter.search('dinh vu');
    clock.nowMs += PLACE_CACHE_TTL_MS + 1;
    const again = await adapter.search('dinh vu');

    expect(again).toMatchObject({ status: 'OK', fromCache: false });
    expect(inner.searched).toHaveLength(2);
  });

  /** Mot lan mang chap chon KHONG duoc bien thanh 24 gio "tam ngung". */
  it('that bai khong duoc dem', async () => {
    const { adapter, inner } = build();
    inner.searchOutcome = { status: 'UNAVAILABLE', reason: 'PROVIDER_RATE_LIMITED' };

    expect(await adapter.search('dinh vu')).toEqual({
      status: 'UNAVAILABLE',
      reason: 'PROVIDER_RATE_LIMITED',
    });

    inner.searchOutcome = { status: 'OK', value: [CANDIDATE], fromCache: false };
    expect(await adapter.search('dinh vu')).toEqual({
      status: 'OK',
      value: [CANDIDATE],
      fromCache: false,
    });
    expect(inner.searched).toHaveLength(2);
  });

  it('tim nguoc: hai diem lech duoi 5 chu so la mot cau hoi', async () => {
    const { adapter, inner } = build();

    await adapter.reverse({ latitude: 20.826401, longitude: 106.775201 });
    const second = await adapter.reverse({ latitude: 20.826404, longitude: 106.775204 });

    expect(second).toEqual({ status: 'OK', value: CANDIDATE, fromCache: true });
    expect(inner.reversed).toHaveLength(1);
  });

  it('tim nguoc ra "khong co ten" (`null`) cung duoc dem', async () => {
    const { adapter, inner } = build();
    inner.reverseOutcome = { status: 'OK', value: null, fromCache: false };

    await adapter.reverse({ latitude: 17, longitude: 110 });
    const second = await adapter.reverse({ latitude: 17, longitude: 110 });

    expect(second).toEqual({ status: 'OK', value: null, fromCache: true });
    expect(inner.reversed).toHaveLength(1);
  });

  /**
   * Cong DAY (1 dang chay + 3 dang cho) -> nguoi thu nam BUSY ngay, KHONG goi nha cung cap. Va mot
   * cau hoi da co trong bo nho dem van tra loi duoc du cong day — no khong can mot cho trong hang.
   */
  it('cong day -> BUSY / PROVIDER_BUSY; cau da dem van tra loi duoc', async () => {
    const { adapter, inner } = build({ maxWaiting: 3 });
    await adapter.search('da dem');
    inner.searched.length = 0;

    const inFlight = [
      adapter.search('a1'),
      adapter.search('a2'),
      adapter.search('a3'),
      adapter.search('a4'),
    ];
    const refused = await adapter.search('a5');
    const cached = await adapter.search('da dem');
    await Promise.all(inFlight);

    expect(refused).toEqual({ status: 'BUSY', reason: 'PROVIDER_BUSY' });
    expect(cached).toMatchObject({ status: 'OK', fromCache: true });
    expect(inner.searched).toEqual(['a1', 'a2', 'a3', 'a4']);
  });

  /**
   * MOT tran cho CA HAI loai cau hoi: tim va tim nguoc dung chung bo nho dem, nen muc tim nguoc moi
   * co the day muc tim cu nhat ra. Hai bo rieng se giu duoc 2 x tran — gap doi con so da hua.
   */
  it('tim va tim nguoc dung CHUNG mot tran bo nho dem', async () => {
    const { adapter, inner } = build({ maxEntries: 3 });

    await adapter.search('mot');
    await adapter.search('hai');
    await adapter.reverse({ latitude: 20.1, longitude: 105.1 });
    await adapter.reverse({ latitude: 20.2, longitude: 105.2 });

    expect(adapter.cachedEntries).toBe(3);
    // Muc cu nhat ('mot') bi muc tim nguoc thu hai day ra — tran la CUA CHUNG.
    expect(await adapter.search('mot')).toMatchObject({ fromCache: false });
    expect(await adapter.reverse({ latitude: 20.2, longitude: 105.2 })).toMatchObject({
      fromCache: true,
    });
    expect(inner.searched).toEqual(['mot', 'hai', 'mot']);
  });

  it('tran mac dinh 500 la TONG cua tim + tim nguoc', async () => {
    const { adapter } = build();

    for (let index = 0; index < 300; index += 1) {
      await adapter.search(`dia diem ${index}`);
      await adapter.reverse({ latitude: 10 + index / 1000, longitude: 105 });
    }

    expect(adapter.cachedEntries).toBe(PLACE_CACHE_MAX_ENTRIES);
  });

  /** Hai loai dung chung bo nho nhung KHONG dung khoa: moi loai chi doc lai muc cua chinh no. */
  it('tim va tim nguoc khong doc nham muc cua nhau', async () => {
    const { adapter, inner } = build();

    await adapter.search('20.10000,105.10000');
    const reversed = await adapter.reverse({ latitude: 20.1, longitude: 105.1 });

    expect(reversed).toEqual({ status: 'OK', value: CANDIDATE, fromCache: false });
    expect(inner.reversed).toHaveLength(1);
  });

  it('adapter ben trong nem loi -> UNAVAILABLE co kieu, khong nem ra ngoai', async () => {
    const { adapter, inner } = build();
    inner.search = async () => {
      throw new Error('bat ngo');
    };

    expect(await adapter.search('dinh vu')).toEqual({
      status: 'UNAVAILABLE',
      reason: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('mo ta va ma nha cung cap lay tu adapter ben trong', () => {
    const { adapter } = build();

    expect(adapter.providerId).toBe('scripted');
    expect(adapter.describe()).toMatchObject({ available: true, providerId: 'scripted' });
  });
});
