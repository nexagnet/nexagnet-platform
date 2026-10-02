import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BASEMAP_FALLBACK_REASONS,
  BASEMAP_UNAVAILABLE_NOTICE,
  GOOGLE_BASEMAP_UNAVAILABLE_NOTICE,
  LOCAL_BASEMAP_NOTICE,
  MAP_BASEMAP_SOURCES,
  MAP_PROVIDERS,
  MAPLIBRE_FAILURES,
  OPENFREEMAP_LIBERTY_STYLE_URL,
  effectiveBasemap,
  isExternalStyle,
  pickerBasemap,
  readBasemapEnv,
  resolveBasemap,
  type TransportBasemap,
} from '../map-style';

/*
 * `#374` OWNER_DECISION_UPDATE_2026_09_23 §9 (provider resolution) — nen nao, va vi sao, TAT DINH
 * theo cau hinh. OpenFreeMap la MAC DINH; Google chi khi khai tuong minh; cuc bo la luoi cuoi.
 *
 * Khong bai nao o day goi mang: `resolveBasemap` va `effectiveBasemap` la ham thuan. Nen that (va
 * hong that) do o `maplibre-basemap-watch.spec.ts`, `google-maps-session.spec.ts` va tren trinh duyet.
 */

/* Khong mang dang `AIza…`: day khong phai khoa, va bo quet bi mat khong nen phai doan dieu do. */
const KEY = 'khoa-thu-khong-phai-khoa-that';
const STYLE = 'https://tiles.noi-bo.example/style.json';

const reasonOf = (basemap: TransportBasemap): string | null =>
  basemap.source === 'LOCAL_FALLBACK' ? basemap.reason : null;

const OPENFREEMAP = { source: 'OPENFREEMAP', style: OPENFREEMAP_LIBERTY_STYLE_URL, notice: null };

describe('phan quyet nha cung cap nen — tam truong hop cua #374 §9', () => {
  it('1. khong khai gi → OPENFREEMAP, khong cau thong bao nao', () => {
    expect(resolveBasemap({})).toEqual(OPENFREEMAP);
    expect(resolveBasemap({ provider: undefined, googleMapsApiKey: null, styleUrl: null })).toEqual(
      OPENFREEMAP,
    );
  });

  it('2. provider=openfreemap → style Liberty chinh thuc cua OpenFreeMap', () => {
    const basemap = resolveBasemap({ provider: 'openfreemap' });

    expect(basemap).toEqual(OPENFREEMAP);
    expect(OPENFREEMAP_LIBERTY_STYLE_URL).toBe('https://tiles.openfreemap.org/styles/liberty');
  });

  it('3. provider=maplibre + style tu khai → dung style do', () => {
    const basemap = resolveBasemap({ provider: 'maplibre', styleUrl: `  ${STYLE}  ` });

    expect(basemap).toEqual({ source: 'CONFIGURED_STYLE_URL', style: STYLE, notice: null });
  });

  it('4. provider=maplibre THIEU style → nen cuc bo kem cau noi ro, khong doan OpenFreeMap', () => {
    const basemap = resolveBasemap({ provider: 'maplibre' });

    expect(basemap.source).toBe('LOCAL_FALLBACK');
    expect(reasonOf(basemap)).toBe('MAPLIBRE_STYLE_MISSING');
    expect(basemap.notice).toBe(LOCAL_BASEMAP_NOTICE);
  });

  it('5. provider=google + khoa → GOOGLE_MAPS (Map ID tuy chon)', () => {
    expect(resolveBasemap({ provider: 'google', googleMapsApiKey: `  ${KEY}  ` })).toEqual({
      source: 'GOOGLE_MAPS',
      apiKey: KEY,
      mapId: null,
      notice: null,
    });
    expect(
      resolveBasemap({ provider: 'google', googleMapsApiKey: KEY, googleMapsMapId: ' map-id ' }),
    ).toEqual({ source: 'GOOGLE_MAPS', apiKey: KEY, mapId: 'map-id', notice: null });
  });

  it('6. provider=google THIEU khoa → nen cuc bo, noi ro nen Google chua kha dung', () => {
    const basemap = resolveBasemap({ provider: 'google' });

    expect(basemap.source).toBe('LOCAL_FALLBACK');
    expect(reasonOf(basemap)).toBe('GOOGLE_KEY_MISSING');
    expect(basemap.notice).toBe(GOOGLE_BASEMAP_UNAVAILABLE_NOTICE);
  });

  it('7. provider=local → nen cuc bo, KE CA khi khoa Google va style URL deu co san', () => {
    const basemap = resolveBasemap({ provider: 'local', googleMapsApiKey: KEY, styleUrl: STYLE });

    expect(basemap.source).toBe('LOCAL_FALLBACK');
    expect(reasonOf(basemap)).toBe('LOCAL_SELECTED');
    expect(basemap.notice).toBe(LOCAL_BASEMAP_NOTICE);
  });

  /*
   * Mot bien moi truong dat thanh chuoi rong la chuyen thuong gap trong `docker compose`. No phai
   * doc ra giong het "khong dat" — chu khong nap Google voi mot khoa rong hay tai mot style rong.
   */
  it('8. chuoi rong hay chi co khoang trang deu la CHUA KHAI', () => {
    expect(resolveBasemap({ provider: '   ', googleMapsApiKey: KEY })).toEqual(OPENFREEMAP);
    expect(resolveBasemap({ provider: '', styleUrl: ' \t ' })).toEqual(OPENFREEMAP);
    expect(reasonOf(resolveBasemap({ provider: 'google', googleMapsApiKey: '  \t ' }))).toBe(
      'GOOGLE_KEY_MISSING',
    );
    expect(reasonOf(resolveBasemap({ provider: 'maplibre', styleUrl: '   ' }))).toBe(
      'MAPLIBRE_STYLE_MISSING',
    );
    expect(
      resolveBasemap({ provider: 'google', googleMapsApiKey: KEY, googleMapsMapId: '   ' }),
    ).toMatchObject({ source: 'GOOGLE_MAPS', mapId: null });
  });
});

describe('Google chi khi khai TUONG MINH; khong nha cung cap tra phi nao bat ngam (#278 N1)', () => {
  it('co khoa Google nhung KHONG khai provider → OpenFreeMap, khong goi Google', () => {
    expect(resolveBasemap({ googleMapsApiKey: KEY, googleMapsMapId: 'map-id' })).toEqual(
      OPENFREEMAP,
    );
  });

  it('provider=openfreemap bo qua khoa Google va style tu khai', () => {
    expect(
      resolveBasemap({ provider: 'openfreemap', googleMapsApiKey: KEY, styleUrl: STYLE }),
    ).toEqual(OPENFREEMAP);
  });

  it('google thieu khoa ma co style URL → nen CUC BO, khong nhay sang MapLibre hay OpenFreeMap', () => {
    const basemap = resolveBasemap({ provider: 'google', styleUrl: STYLE });

    expect(basemap.source).toBe('LOCAL_FALLBACK');
    expect(reasonOf(basemap)).toBe('GOOGLE_KEY_MISSING');
  });

  it('ten nha cung cap la (vd `mapbox`) → nen cuc bo, khong doan', () => {
    const basemap = resolveBasemap({ provider: 'mapbox', googleMapsApiKey: KEY, styleUrl: STYLE });

    expect(basemap.source).toBe('LOCAL_FALLBACK');
    expect(reasonOf(basemap)).toBe('UNKNOWN_PROVIDER');
  });

  it('ten provider khong phan biet hoa thuong', () => {
    expect(resolveBasemap({ provider: ' OpenFreeMap ' })).toEqual(OPENFREEMAP);
    expect(resolveBasemap({ provider: ' Google ', googleMapsApiKey: KEY }).source).toBe(
      'GOOGLE_MAPS',
    );
    expect(resolveBasemap({ provider: 'MAPLIBRE', styleUrl: STYLE }).source).toBe(
      'CONFIGURED_STYLE_URL',
    );
  });

  /*
   * Moi truong khai style rieng truoc #374 (chi co `STYLE_URL`) KHONG duoc doi nen sau khi nang cap:
   * style tu khai la mot lua chon tuong minh, OpenFreeMap chi la mac dinh khi khong ai chon gi.
   */
  it('tuong thich nguoc: khong khai provider ma co style URL → style do, khong phai OpenFreeMap', () => {
    expect(resolveBasemap({ styleUrl: STYLE })).toEqual({
      source: 'CONFIGURED_STYLE_URL',
      style: STYLE,
      notice: null,
    });
  });

  it('URL OpenFreeMap la hang so — khong mot tham so truy van nao (ma khach, nguoi dung, vong chay)', () => {
    const url = new URL(OPENFREEMAP_LIBERTY_STYLE_URL);

    expect(url.protocol).toBe('https:');
    expect(url.host).toBe('tiles.openfreemap.org');
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
  });
});

describe('nen ngoai hong luc chay → nen cuc bo, noi NEN hong, khong noi toa do sai', () => {
  const openfreemap = resolveBasemap({});
  const custom = resolveBasemap({ provider: 'maplibre', styleUrl: STYLE });
  const google = resolveBasemap({ provider: 'google', googleMapsApiKey: KEY });

  it.each(MAPLIBRE_FAILURES)(
    'OpenFreeMap %s → LOCAL_FALLBACK, ma ly do mang ten nguon',
    (failure) => {
      const basemap = effectiveBasemap(openfreemap, { mapLibre: failure });

      expect(basemap.source).toBe('LOCAL_FALLBACK');
      expect(reasonOf(basemap)).toBe(`OPENFREEMAP_${failure}`);
      expect(basemap.notice).toBe(BASEMAP_UNAVAILABLE_NOTICE);
    },
  );

  it.each(MAPLIBRE_FAILURES)('style tu khai %s → LOCAL_FALLBACK voi ma MAPLIBRE_*', (failure) => {
    const basemap = effectiveBasemap(custom, { mapLibre: failure });

    expect(reasonOf(basemap)).toBe(`MAPLIBRE_${failure}`);
    expect(basemap.notice).toBe(BASEMAP_UNAVAILABLE_NOTICE);
  });

  it.each(['GOOGLE_SCRIPT_FAILED', 'GOOGLE_AUTH_FAILED', 'GOOGLE_TIMEOUT'] as const)(
    'Google %s → LOCAL_FALLBACK kem cau rieng cua Google',
    (reason) => {
      const basemap = effectiveBasemap(google, { google: reason });

      expect(reasonOf(basemap)).toBe(reason);
      expect(basemap.notice).toBe(GOOGLE_BASEMAP_UNAVAILABLE_NOTICE);
    },
  );

  it('chua hong thi giu nguyen dung doi tuong nen da cau hinh', () => {
    expect(effectiveBasemap(openfreemap, {})).toBe(openfreemap);
    expect(effectiveBasemap(openfreemap, { google: null, mapLibre: null })).toBe(openfreemap);
    expect(effectiveBasemap(google, { google: null })).toBe(google);
  });

  it('loi cua mot nha cung cap KHONG lam lui nen cua nha cung cap khac', () => {
    expect(effectiveBasemap(openfreemap, { google: 'GOOGLE_AUTH_FAILED' })).toBe(openfreemap);
    expect(effectiveBasemap(google, { mapLibre: 'STYLE_FAILED' })).toBe(google);
    const local = resolveBasemap({ provider: 'local' });
    expect(effectiveBasemap(local, { mapLibre: 'TIMEOUT', google: 'GOOGLE_TIMEOUT' })).toBe(local);
  });

  it('cau thong bao noi tuyen va moc VAN dung, khong goi ten ha tang, va khong lo khoa', () => {
    expect(BASEMAP_UNAVAILABLE_NOTICE).toContain('tuyến và mốc vẫn đang được hiển thị đúng');
    expect(BASEMAP_UNAVAILABLE_NOTICE).not.toMatch(/openfreemap|maplibre|google/i);
    expect(
      JSON.stringify(effectiveBasemap(google, { google: 'GOOGLE_AUTH_FAILED' })),
    ).not.toContain(KEY);
  });
});

describe('nen cuc bo — trung thuc va khong goi mang', () => {
  /*
   * `#278` N1: *"support a deterministic/local/dev style path sufficient for CI"*. Style cuc bo
   * KHONG duoc goi mang: no phai chay duoc trong CI va tren mot may khong co duong ra Internet.
   */
  it('style cuc bo khong tro toi mot nha cung cap tile nao', () => {
    const basemap = resolveBasemap({ provider: 'local' });
    const serialised = JSON.stringify(basemap.source === 'LOCAL_FALLBACK' ? basemap.style : null);

    expect(serialised).not.toContain('http');
    expect(serialised).not.toMatch(/mapbox|maptiler|google|openstreetmap|openfreemap/i);
  });

  it('moi nhanh cuc bo deu co cau thong bao, khong nhanh nao im lang', () => {
    const configs = [
      { provider: 'local' },
      { provider: 'mapbox' },
      { provider: 'maplibre' },
      { provider: 'google' },
    ];

    for (const config of configs) {
      const basemap = resolveBasemap(config);
      expect(basemap.source).toBe('LOCAL_FALLBACK');
      expect(basemap.notice?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('chi hai nen tai style tu may chu ngoai la OpenFreeMap va style tu khai', () => {
    expect(isExternalStyle(resolveBasemap({}))).toBe(true);
    expect(isExternalStyle(resolveBasemap({ provider: 'maplibre', styleUrl: STYLE }))).toBe(true);
    expect(isExternalStyle(resolveBasemap({ provider: 'local' }))).toBe(false);
    expect(isExternalStyle(resolveBasemap({ provider: 'google', googleMapsApiKey: KEY }))).toBe(
      false,
    );
  });

  it('bon nha cung cap, bon nguon nen, muoi ba ly do lui ve — khong them bot lang le', () => {
    expect([...MAP_PROVIDERS]).toEqual(['openfreemap', 'google', 'maplibre', 'local']);
    expect([...MAP_BASEMAP_SOURCES]).toEqual([
      'OPENFREEMAP',
      'GOOGLE_MAPS',
      'CONFIGURED_STYLE_URL',
      'LOCAL_FALLBACK',
    ]);
    expect(BASEMAP_FALLBACK_REASONS).toHaveLength(13);
  });
});

describe('doc cau hinh tu moi truong', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('doc dung bon bien NEXT_PUBLIC_TRANSPORT_*', () => {
    vi.stubEnv('NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER', 'google');
    vi.stubEnv('NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_API_KEY', KEY);
    vi.stubEnv('NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_MAP_ID', 'map-id-thu');
    vi.stubEnv('NEXT_PUBLIC_TRANSPORT_MAP_STYLE_URL', STYLE);

    expect(readBasemapEnv()).toEqual({
      provider: 'google',
      googleMapsApiKey: KEY,
      googleMapsMapId: 'map-id-thu',
      styleUrl: STYLE,
    });
    expect(resolveBasemap(readBasemapEnv())).toEqual({
      source: 'GOOGLE_MAPS',
      apiKey: KEY,
      mapId: 'map-id-thu',
      notice: null,
    });
  });

  it('moi truong KHONG co bien nao (vd image build khong truyen bien) → OpenFreeMap', () => {
    vi.stubEnv('NEXT_PUBLIC_TRANSPORT_MAP_PROVIDER', undefined);
    vi.stubEnv('NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_API_KEY', undefined);
    vi.stubEnv('NEXT_PUBLIC_TRANSPORT_GOOGLE_MAPS_MAP_ID', undefined);
    vi.stubEnv('NEXT_PUBLIC_TRANSPORT_MAP_STYLE_URL', undefined);

    expect(resolveBasemap(readBasemapEnv())).toEqual(OPENFREEMAP);
  });
});

describe('#379 — nen cua BAN DO CHON DIEM', () => {
  it('Google -> OpenFreeMap: nen Google cua ta khong co duong bam-lay-toa-do hay ghim keo', () => {
    const google = resolveBasemap({ provider: 'google', googleMapsApiKey: KEY });
    expect(google.source).toBe('GOOGLE_MAPS');
    expect(pickerBasemap(google)).toEqual(OPENFREEMAP);
  });

  it('moi nen khac giu NGUYEN — ke ca nen cuc bo cua CI', () => {
    const local = resolveBasemap({ provider: 'local' });
    const configured = resolveBasemap({ provider: 'maplibre', styleUrl: STYLE });
    const openFreeMap = resolveBasemap({});
    const googleMissingKey = resolveBasemap({ provider: 'google' });
    expect(pickerBasemap(local)).toBe(local);
    expect(pickerBasemap(configured)).toBe(configured);
    expect(pickerBasemap(openFreeMap)).toBe(openFreeMap);
    expect(pickerBasemap(googleMissingKey)).toBe(googleMissingKey);
  });
});
