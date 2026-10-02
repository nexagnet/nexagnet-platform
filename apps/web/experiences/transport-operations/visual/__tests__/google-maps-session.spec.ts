import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GOOGLE_LOAD_TIMEOUT_MS,
  startGoogleMapsSession,
  type GoogleMapsSessionDeps,
  type GoogleMapsSessionState,
} from '../google-maps-session';
import type { GoogleMapsLibraries } from '../google-maps-loader';
import { effectiveBasemap, resolveBasemap, GOOGLE_BASEMAP_UNAVAILABLE_NOTICE } from '../map-style';

/*
 * `#374` §8 bai 11 — Google hong thi ban do LUI VE, khong chet.
 *
 * Vong doi cua mot ban do Google duoc do bang trinh nap gia va dong ho gia: script loi, qua han,
 * khoa bi tu choi TRUOC hay SAU khi ban do da hien — ca bon deu phai ra `FAILED` dung MOT lan, va
 * `effectiveBasemap` bien no thanh nen cuc bo kem cau thong bao.
 */

const LIBRARIES = { core: {}, maps: {} } as unknown as GoogleMapsLibraries;

interface Harness {
  readonly deps: GoogleMapsSessionDeps;
  readonly states: GoogleMapsSessionState[];
  readonly resolveLoad: (libraries: GoogleMapsLibraries) => void;
  readonly rejectLoad: (error: Error) => void;
  readonly authFail: () => void;
  readonly unsubscribe: ReturnType<typeof vi.fn>;
}

function harness(): Harness {
  let resolveLoad: (libraries: GoogleMapsLibraries) => void = () => undefined;
  let rejectLoad: (error: Error) => void = () => undefined;
  let authListener: (() => void) | null = null;
  const unsubscribe = vi.fn(() => {
    authListener = null;
  });
  const load = new Promise<GoogleMapsLibraries>((resolve, reject) => {
    resolveLoad = resolve;
    rejectLoad = reject;
  });

  return {
    deps: {
      load: () => load,
      subscribeAuthFailure: (listener) => {
        authListener = listener;
        return unsubscribe;
      },
      timeoutMs: GOOGLE_LOAD_TIMEOUT_MS,
    },
    states: [],
    resolveLoad: (libraries) => resolveLoad(libraries),
    rejectLoad: (error) => rejectLoad(error),
    authFail: () => authListener?.(),
    unsubscribe,
  };
}

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('vong doi nen Google cua mot ban do', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tai xong → READY, mang theo thu vien da nap', async () => {
    const h = harness();
    startGoogleMapsSession(h.deps, (state) => h.states.push(state));

    h.resolveLoad(LIBRARIES);
    await flush();

    expect(h.states).toEqual([{ status: 'READY', libraries: LIBRARIES }]);
  });

  it('script khong tai duoc → FAILED(GOOGLE_SCRIPT_FAILED), khong nem ra ngoai', async () => {
    const h = harness();
    startGoogleMapsSession(h.deps, (state) => h.states.push(state));

    h.rejectLoad(new Error('The Google Maps JavaScript API could not load.'));
    await flush();

    expect(h.states).toEqual([{ status: 'FAILED', reason: 'GOOGLE_SCRIPT_FAILED' }]);
    expect(h.unsubscribe).toHaveBeenCalled();
  });

  it('qua han → FAILED(GOOGLE_TIMEOUT); script den muon sau do bi bo qua', async () => {
    const h = harness();
    startGoogleMapsSession(h.deps, (state) => h.states.push(state));

    vi.advanceTimersByTime(GOOGLE_LOAD_TIMEOUT_MS);
    h.resolveLoad(LIBRARIES);
    await flush();

    expect(h.states).toEqual([{ status: 'FAILED', reason: 'GOOGLE_TIMEOUT' }]);
  });

  it('tai kip truoc han → khong bao gio ra TIMEOUT', async () => {
    const h = harness();
    startGoogleMapsSession(h.deps, (state) => h.states.push(state));

    h.resolveLoad(LIBRARIES);
    await flush();
    vi.advanceTimersByTime(GOOGLE_LOAD_TIMEOUT_MS * 2);

    expect(h.states.map((state) => state.status)).toEqual(['READY']);
  });

  /*
   * Truong hop THAT pho bien nhat: khoa sai referrer / chua bat API / chua bat thanh toan. Script
   * tai binh thuong (READY), ban do da hien, roi Google moi goi `gm_authFailure`.
   */
  it('khoa bi tu choi SAU khi ban do da hien → FAILED(GOOGLE_AUTH_FAILED)', async () => {
    const h = harness();
    startGoogleMapsSession(h.deps, (state) => h.states.push(state));

    h.resolveLoad(LIBRARIES);
    await flush();
    h.authFail();

    expect(h.states.map((state) => state.status)).toEqual(['READY', 'FAILED']);
    expect(h.states[1]).toEqual({ status: 'FAILED', reason: 'GOOGLE_AUTH_FAILED' });
  });

  it('FAILED la trang thai CUOI — loi thu hai khong lam ban do nhay them lan nua', async () => {
    const h = harness();
    startGoogleMapsSession(h.deps, (state) => h.states.push(state));

    h.authFail();
    h.rejectLoad(new Error('late'));
    vi.advanceTimersByTime(GOOGLE_LOAD_TIMEOUT_MS);
    await flush();

    expect(h.states).toEqual([{ status: 'FAILED', reason: 'GOOGLE_AUTH_FAILED' }]);
  });

  it('khoa da hong tu truoc (bao NGAY trong luc dang ky) → FAILED mot lan, va go dang ky', async () => {
    const h = harness();
    const unsubscribe = vi.fn();
    const deps: GoogleMapsSessionDeps = {
      ...h.deps,
      subscribeAuthFailure: (listener) => {
        listener();
        return unsubscribe;
      },
    };

    startGoogleMapsSession(deps, (state) => h.states.push(state));
    h.resolveLoad(LIBRARIES);
    await flush();

    expect(h.states).toEqual([{ status: 'FAILED', reason: 'GOOGLE_AUTH_FAILED' }]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('component go ra → khong mot callback nao nua, va dong ho duoc don', async () => {
    const h = harness();
    const cancel = startGoogleMapsSession(h.deps, (state) => h.states.push(state));

    cancel();
    h.resolveLoad(LIBRARIES);
    h.authFail();
    vi.advanceTimersByTime(GOOGLE_LOAD_TIMEOUT_MS);
    await flush();

    expect(h.states).toEqual([]);
    expect(h.unsubscribe).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Google hong → man hinh doi sang nen cuc bo (khong crash, noi ro)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('script loi: nen hien thuc la LOCAL_FALLBACK kem cau cua #374', async () => {
    const configured = resolveBasemap({ provider: 'google', googleMapsApiKey: 'khoa-thu' });
    const h = harness();
    startGoogleMapsSession(h.deps, (state) => h.states.push(state));

    h.rejectLoad(new Error('blocked'));
    await flush();
    const latest = h.states.at(-1);
    const shown = effectiveBasemap(configured, {
      google: latest?.status === 'FAILED' ? latest.reason : null,
    });

    expect(shown.source).toBe('LOCAL_FALLBACK');
    expect(shown.notice).toBe(GOOGLE_BASEMAP_UNAVAILABLE_NOTICE);
  });
});
