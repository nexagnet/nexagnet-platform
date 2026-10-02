import { describe, expect, it, vi } from 'vitest';
import {
  NOMINATIM_TIMEOUT_MS,
  NominatimPlaceSearchAdapter,
} from './nominatim-place-search.adapter.js';
import type { NominatimConfig } from './nominatim.js';
import { OPENSTREETMAP_ATTRIBUTION } from './place-search.types.js';

/*
 * KHONG mot lan goi mang that: `fetch` duoc tiem qua constructor. Bai nay kiem phan CO NOI MANG
 * cua adapter — tieu de, het gio, doi ma trang thai thanh ma co kieu.
 */

const CONFIG: NominatimConfig = {
  baseUrl: 'https://nominatim.example.test',
  userAgent: 'NexagnetTransport/1.0 (+https://example.test)',
  contactEmail: null,
};

const QUERY = 'Kho Tân Phú Hưng Thái Nguyên';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function fakeFetch(respond: () => Promise<Response> | Response) {
  return vi.fn<typeof fetch>(async () => respond());
}

describe('adapter Nominatim', () => {
  it('gui User-Agent DINH DANH ung dung va mot tin hieu het gio', async () => {
    const fetchImpl = fakeFetch(() => jsonResponse([]));
    const adapter = new NominatimPlaceSearchAdapter(CONFIG, fetchImpl);

    await adapter.search(QUERY);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toMatch(/^https:\/\/nominatim\.example\.test\/search\?/u);
    expect((init?.headers as Record<string, string>)['User-Agent']).toBe(CONFIG.userAgent);
    expect(init?.method).toBe('GET');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(NOMINATIM_TIMEOUT_MS).toBe(8000);
  });

  it('200 + mang hop le -> OK, khong phai tu bo nho dem', async () => {
    const adapter = new NominatimPlaceSearchAdapter(
      CONFIG,
      fakeFetch(() => jsonResponse([{ lat: '21.617', lon: '105.817', name: 'Kho A' }])),
    );

    expect(await adapter.search(QUERY)).toEqual({
      status: 'OK',
      value: [{ label: 'Kho A', address: null, point: { latitude: 21.617, longitude: 105.817 } }],
      fromCache: false,
    });
  });

  it('429 -> UNAVAILABLE / PROVIDER_RATE_LIMITED', async () => {
    const adapter = new NominatimPlaceSearchAdapter(
      CONFIG,
      fakeFetch(() => jsonResponse({}, 429)),
    );

    expect(await adapter.search(QUERY)).toEqual({
      status: 'UNAVAILABLE',
      reason: 'PROVIDER_RATE_LIMITED',
    });
  });

  it('500 -> UNAVAILABLE / PROVIDER_UNAVAILABLE', async () => {
    const adapter = new NominatimPlaceSearchAdapter(
      CONFIG,
      fakeFetch(() => jsonResponse({}, 500)),
    );

    expect(await adapter.search(QUERY)).toEqual({
      status: 'UNAVAILABLE',
      reason: 'PROVIDER_UNAVAILABLE',
    });
  });

  /**
   * Loi mang cua `fetch` mang nguyen URL — tuc `q=<chuoi nguoi dung go>`. Ket qua tra ra chi co
   * MA, khong mot manh nao cua loi hay cua chuoi tim.
   */
  it('loi mang -> PROVIDER_UNAVAILABLE, va ket qua khong mang chuoi tim', async () => {
    const adapter = new NominatimPlaceSearchAdapter(
      CONFIG,
      fakeFetch(() => {
        throw new TypeError(`fetch failed: https://nominatim.example.test/search?q=${QUERY}`);
      }),
    );

    const outcome = await adapter.search(QUERY);

    expect(outcome).toEqual({ status: 'UNAVAILABLE', reason: 'PROVIDER_UNAVAILABLE' });
    expect(JSON.stringify(outcome)).not.toContain('Phú');
  });

  it('than khong phai JSON -> PROVIDER_UNAVAILABLE', async () => {
    const adapter = new NominatimPlaceSearchAdapter(
      CONFIG,
      fakeFetch(() => new Response('<html>bao tri</html>', { status: 200 })),
    );

    expect(await adapter.search(QUERY)).toEqual({
      status: 'UNAVAILABLE',
      reason: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('than sai hinh dang (object thay vi mang) -> PROVIDER_UNAVAILABLE, khong phai rong', async () => {
    const adapter = new NominatimPlaceSearchAdapter(
      CONFIG,
      fakeFetch(() => jsonResponse({ unexpected: true })),
    );

    expect(await adapter.search(QUERY)).toEqual({
      status: 'UNAVAILABLE',
      reason: 'PROVIDER_UNAVAILABLE',
    });
  });

  /** Het gio that (10 ms) — nha cung cap treo khong duoc giu man hinh vo han. */
  it('het gio -> PROVIDER_UNAVAILABLE', async () => {
    const hanging = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const adapter = new NominatimPlaceSearchAdapter(CONFIG, hanging, 10);

    expect(await adapter.search(QUERY)).toEqual({
      status: 'UNAVAILABLE',
      reason: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('tim nguoc: goi /reverse va doc mot goi y', async () => {
    const fetchImpl = fakeFetch(() =>
      jsonResponse({ lat: '20.8264', lon: '106.7752', display_name: 'Đình Vũ, Hải Phòng' }),
    );
    const adapter = new NominatimPlaceSearchAdapter(CONFIG, fetchImpl);

    const outcome = await adapter.reverse({ latitude: 20.8264, longitude: 106.7752 });

    expect(String(fetchImpl.mock.calls[0]![0])).toMatch(/\/reverse\?lat=20\.82640&lon=106\.77520/u);
    expect(outcome).toEqual({
      status: 'OK',
      value: {
        label: 'Đình Vũ',
        address: 'Đình Vũ, Hải Phòng',
        point: { latitude: 20.8264, longitude: 106.7752 },
      },
      fromCache: false,
    });
  });

  it('tim nguoc giua bien (`{ error }`) -> OK voi `null`', async () => {
    const adapter = new NominatimPlaceSearchAdapter(
      CONFIG,
      fakeFetch(() => jsonResponse({ error: 'Unable to geocode' })),
    );

    expect(await adapter.reverse({ latitude: 17, longitude: 110 })).toEqual({
      status: 'OK',
      value: null,
      fromCache: false,
    });
  });

  it('mo ta: san sang, kem dong ghi nguon OpenStreetMap', () => {
    expect(
      new NominatimPlaceSearchAdapter(
        CONFIG,
        fakeFetch(() => jsonResponse([])),
      ).describe(),
    ).toEqual({
      available: true,
      providerId: 'nominatim',
      attribution: OPENSTREETMAP_ATTRIBUTION,
    });
  });
});
