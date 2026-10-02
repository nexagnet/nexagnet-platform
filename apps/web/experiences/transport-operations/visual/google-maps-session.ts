import { useEffect, useState } from 'react';
import type { GoogleFailureReason } from './map-style';
import type { GoogleMapsLibraries } from './google-maps-loader';

/**
 * VONG DOI NEN GOOGLE cua MOT ban do — ba trang thai, va hai trong so do la cuoi (#374 §6).
 *
 *   LOADING ──tai xong──▶ READY ──gm_authFailure──▶ FAILED
 *      │                                               ▲
 *      └──── script loi / qua han / gm_authFailure ────┘
 *
 * `FAILED` la trang thai CUOI cua lan gan nay: script den muon sau khi da qua han thi bi bo qua,
 * vi man hinh da lui ve nen cuc bo va da noi ra dieu do — doi nen lan nua giua chung la mot ban do
 * nhay qua nhay lai truoc mat nguoi dang doc.
 *
 * Tach khoi React de do duoc trong moi truong `node` cua vitest bang dong ho gia va trinh nap gia;
 * `useGoogleMapsSession` ben duoi chi noi ham nay vao `useState`.
 */

export type GoogleMapsSessionState =
  | { readonly status: 'LOADING' }
  | { readonly status: 'READY'; readonly libraries: GoogleMapsLibraries }
  | { readonly status: 'FAILED'; readonly reason: GoogleFailureReason };

/** Du rong cho mang 3G cham; qua muc nay nguoi dieu hanh dang nhin mot khung trong. */
export const GOOGLE_LOAD_TIMEOUT_MS = 15_000;

export interface GoogleMapsSessionDeps {
  readonly load: () => Promise<GoogleMapsLibraries>;
  readonly subscribeAuthFailure: (listener: () => void) => () => void;
  readonly timeoutMs: number;
}

/** Bat dau mot phien. Tra ve ham huy — goi khi component go ra; sau do khong con callback nao. */
export function startGoogleMapsSession(
  deps: GoogleMapsSessionDeps,
  onState: (state: GoogleMapsSessionState) => void,
): () => void {
  let done = false;
  let cancelled = false;
  let loaded = false;
  let unsubscribe: () => void = () => undefined;

  const fail = (reason: GoogleFailureReason): void => {
    if (cancelled || done) return;
    done = true;
    clearTimeout(timer);
    unsubscribe();
    onState({ status: 'FAILED', reason });
  };

  const timer = setTimeout(() => {
    if (!loaded) fail('GOOGLE_TIMEOUT');
  }, deps.timeoutMs);

  unsubscribe = deps.subscribeAuthFailure(() => fail('GOOGLE_AUTH_FAILED'));
  /* Nguoi dang ky co the goi lai NGAY trong luc dang ky; khi do `unsubscribe` o tren con la no-op. */
  if (done) unsubscribe();

  deps.load().then(
    (libraries) => {
      if (cancelled || done) return;
      loaded = true;
      clearTimeout(timer);
      onState({ status: 'READY', libraries });
    },
    () => fail('GOOGLE_SCRIPT_FAILED'),
  );

  return () => {
    cancelled = true;
    clearTimeout(timer);
    unsubscribe();
  };
}

const LOADING: GoogleMapsSessionState = { status: 'LOADING' };

/**
 * Trinh nap Google la ma TAI LUOI: trang dung OpenFreeMap mac dinh khong tai no.
 *
 * Dang ky nghe `gm_authFailure` vi the cung di sau mot lan `import()`. Thu tu khong quan trong:
 * `gm_authFailure` chi co the den SAU khi script Google chay, va `onGoogleMapsAuthFailure` van bao
 * mot nguoi nghe dang ky muon — khoa da hong thi nguoi nghe duoc goi ngay (`google-maps-loader.ts`).
 */
const importLoader = () => import('./google-maps-loader');

function subscribeAuthFailureLazily(listener: () => void): () => void {
  let active = true;
  let unsubscribe: () => void = () => undefined;
  importLoader().then(
    (loader) => {
      if (active) unsubscribe = loader.onGoogleMapsAuthFailure(listener);
    },
    /* Chunk trinh nap khong tai duoc: `load` cung hong va phien ra GOOGLE_SCRIPT_FAILED o do. */
    () => undefined,
  );
  return () => {
    active = false;
    unsubscribe();
  };
}

/**
 * `apiKey === null` nghia la nen nay KHONG phai Google — hook khong nap gi va tra `null`.
 *
 * Hook luon duoc goi (quy tac cua hook), nen "khong dung Google" phai la mot gia tri vao, khong
 * phai mot nhanh `if` quanh loi goi hook.
 */
export function useGoogleMapsSession(apiKey: string | null): GoogleMapsSessionState | null {
  const [state, setState] = useState<GoogleMapsSessionState>(LOADING);

  useEffect(() => {
    if (apiKey === null) return undefined;
    setState(LOADING);
    return startGoogleMapsSession(
      {
        load: () => importLoader().then((loader) => loader.loadGoogleMapsLibraries(apiKey)),
        subscribeAuthFailure: subscribeAuthFailureLazily,
        timeoutMs: GOOGLE_LOAD_TIMEOUT_MS,
      },
      setState,
    );
  }, [apiKey]);

  return apiKey === null ? null : state;
}
