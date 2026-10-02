import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * `#374` §8 bai 7 — trinh nap Google chi khoi tao MOT lan, va chi xin thu vien NEN.
 *
 * `@googlemaps/js-api-loader` duoc thay bang mot ban gia: bai nay do lop mong cua ta, khong do
 * mang. Moi bai nap lai module (`vi.resetModules`) de trang thai "da nap" khong ro tu bai truoc.
 */

const loader = vi.hoisted(() => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn(),
}));

vi.mock('@googlemaps/js-api-loader', () => loader);

type Window = { gm_authFailure?: () => void };

const freshModule = async () => {
  vi.resetModules();
  return import('../google-maps-loader');
};

describe('nap Google Maps — mot lan cho ca trang', () => {
  let fakeWindow: Window;

  beforeEach(() => {
    fakeWindow = {};
    vi.stubGlobal('window', fakeWindow);
    loader.setOptions.mockReset();
    loader.importLibrary.mockReset();
    loader.importLibrary.mockImplementation(async (name: string) => ({ library: name }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hai ban do cung cho → MOT lan setOptions, MOT lan xin moi thu vien, CHUNG mot Promise', async () => {
    const { loadGoogleMapsLibraries, GOOGLE_MAPS_API_OPTIONS } = await freshModule();

    const first = loadGoogleMapsLibraries('khoa-thu');
    const second = loadGoogleMapsLibraries('khoa-thu');

    expect(second).toBe(first);
    await expect(first).resolves.toEqual({
      core: { library: 'core' },
      maps: { library: 'maps' },
    });
    expect(loader.setOptions).toHaveBeenCalledTimes(1);
    expect(loader.setOptions).toHaveBeenCalledWith({ key: 'khoa-thu', ...GOOGLE_MAPS_API_OPTIONS });
    expect(loader.importLibrary).toHaveBeenCalledTimes(2);
  });

  /* `#374` §4: basemap only — khong Directions, Places, Geocoding, Street View, geometry. */
  it('chi xin `core` + `maps` — khong mot thu vien dan duong/dia diem/hinh hoc nao', async () => {
    const { loadGoogleMapsLibraries, GOOGLE_MAPS_LIBRARIES } = await freshModule();

    await loadGoogleMapsLibraries('khoa-thu');

    const requested = loader.importLibrary.mock.calls.map(([name]) => name as string);
    expect(requested.sort()).toEqual(['core', 'maps']);
    expect([...GOOGLE_MAPS_LIBRARIES]).toEqual(['core', 'maps']);
    expect(requested).not.toContain('routes');
    expect(requested).not.toContain('places');
    expect(requested).not.toContain('geocoding');
    expect(requested).not.toContain('streetView');
    expect(requested).not.toContain('geometry');
  });

  it('nap THAT BAI thi lan gan sau duoc thu lai — ma setOptions van chi mot lan', async () => {
    const { loadGoogleMapsLibraries } = await freshModule();
    loader.importLibrary.mockRejectedValueOnce(new Error('script bi chan'));

    await expect(loadGoogleMapsLibraries('khoa-thu')).rejects.toThrow('script bi chan');
    await expect(loadGoogleMapsLibraries('khoa-thu')).resolves.toBeDefined();

    expect(loader.setOptions).toHaveBeenCalledTimes(1);
  });

  it('dat tuy chon kenh on dinh, tieng Viet, vung VN', async () => {
    const { GOOGLE_MAPS_API_OPTIONS } = await freshModule();

    expect(GOOGLE_MAPS_API_OPTIONS).toEqual({ v: 'quarterly', language: 'vi', region: 'VN' });
  });
});

describe('loi XAC THUC cua Google (gm_authFailure)', () => {
  let fakeWindow: Window;

  beforeEach(() => {
    fakeWindow = {};
    vi.stubGlobal('window', fakeWindow);
    loader.importLibrary.mockImplementation(async (name: string) => ({ library: name }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('khoa bi tu choi → moi ban do dang nghe deu duoc bao', async () => {
    const { loadGoogleMapsLibraries, onGoogleMapsAuthFailure } = await freshModule();
    const listener = vi.fn();
    onGoogleMapsAuthFailure(listener);
    await loadGoogleMapsLibraries('khoa-sai');

    fakeWindow.gm_authFailure?.();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('khong cuop moc toan cuc: ham ai do dat truoc van duoc goi', async () => {
    const previous = vi.fn();
    fakeWindow.gm_authFailure = previous;
    const { loadGoogleMapsLibraries } = await freshModule();
    await loadGoogleMapsLibraries('khoa-sai');

    fakeWindow.gm_authFailure?.();

    expect(previous).toHaveBeenCalledTimes(1);
  });

  it('ban do gan SAU khi khoa da hong cung duoc bao — de lui ve nen cuc bo ngay', async () => {
    const { loadGoogleMapsLibraries, onGoogleMapsAuthFailure } = await freshModule();
    await loadGoogleMapsLibraries('khoa-sai');
    fakeWindow.gm_authFailure?.();

    const late = vi.fn();
    onGoogleMapsAuthFailure(late);
    await Promise.resolve();

    expect(late).toHaveBeenCalledTimes(1);
  });

  it('da huy dang ky thi khong con duoc goi', async () => {
    const { loadGoogleMapsLibraries, onGoogleMapsAuthFailure } = await freshModule();
    const listener = vi.fn();
    const unsubscribe = onGoogleMapsAuthFailure(listener);
    await loadGoogleMapsLibraries('khoa-sai');

    unsubscribe();
    fakeWindow.gm_authFailure?.();

    expect(listener).not.toHaveBeenCalled();
  });
});
