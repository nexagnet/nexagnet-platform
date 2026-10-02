import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

/**
 * NAP GOOGLE MAPS JAVASCRIPT API — mot lan cho ca trang (#374 §3).
 *
 * ===========================================================================
 * TRINH NAP CHINH THUC, KHONG TU CHEN THE `<script>`.
 *
 * `@googlemaps/js-api-loader` la trinh nap cua chinh Google (Dynamic Library Import). No chi chen
 * script MOT lan; `setOptions` goi lai lan hai bi bo qua. Tep nay giu them mot lop mong: nho da
 * goi `setOptions` chua, va giu CHUNG mot `Promise` cho moi ban do dang cho — `reactStrictMode`
 * gan va go component hai lan o dev, va hai lan do khong duoc thanh hai lan nap.
 *
 * ===========================================================================
 * CHI NEN. KHONG DAN DUONG, KHONG DIA DIEM, KHONG STREET VIEW.
 *
 * `#374` §4: task nay KHONG them Directions, Places, Geocoding hay Street View. Nen danh sach thu
 * vien bi khoa o `core` + `maps`; bai kiem `google-maps-loader.spec.ts` do dieu do. Muon them mot
 * thu vien la mot quyet dinh nghiep vu (va mot SKU tinh tien khac), khong phai mot dong code.
 *
 * ===========================================================================
 * KHOA BI TU CHOI KHONG LAM `importLibrary` THAT BAI.
 *
 * Khoa sai, sai referrer, chua bat API hay chua bat thanh toan: script van tai ve binh thuong, roi
 * Google goi ham toan cuc `gm_authFailure` va ve hop thoai loi len ban do. Nen ngoai loi tai script
 * con phai nghe `gm_authFailure` — do la cach DUY NHAT Google cong bo de bat loi xac thuc.
 */

export const GOOGLE_MAPS_LIBRARIES = ['core', 'maps'] as const;

/**
 * Kenh `quarterly`: moi quy doi mot lan, du lau de ban do khong doi hanh vi giua hai lan phat hanh
 * cua chung ta. `language`/`region` = `vi`/`VN`: nhan tieng Viet, va duong bien gioi, ten dao theo
 * goc nhin cua Viet Nam.
 */
export const GOOGLE_MAPS_API_OPTIONS = { v: 'quarterly', language: 'vi', region: 'VN' } as const;

export interface GoogleMapsLibraries {
  readonly core: google.maps.CoreLibrary;
  readonly maps: google.maps.MapsLibrary;
}

declare global {
  interface Window {
    /** https://developers.google.com/maps/documentation/javascript/events#auth-errors */
    gm_authFailure?: () => void;
  }
}

let optionsSet = false;
let pending: Promise<GoogleMapsLibraries> | null = null;
let authFailed = false;
let hookInstalled = false;
const authListeners = new Set<() => void>();

function installAuthFailureHook(): void {
  if (hookInstalled) return;
  hookInstalled = true;
  /* Giu ham cua ai do da dat truoc — khong cuop mot cai moc toan cuc. */
  const previous = window.gm_authFailure;
  window.gm_authFailure = () => {
    authFailed = true;
    previous?.();
    for (const listener of [...authListeners]) listener();
  };
}

/**
 * Nap `core` + `maps`. Goi bao nhieu lan cung chung mot `Promise` dang bay.
 *
 * Lan nap THAT BAI thi quen `Promise` do: lan gan ban do sau (nguoi dung quay lai man hinh) duoc
 * thu lai. `setOptions` van chi chay mot lan — trinh nap cua Google tu cho phep chen lai script
 * sau `onerror`.
 */
export function loadGoogleMapsLibraries(apiKey: string): Promise<GoogleMapsLibraries> {
  if (pending !== null) return pending;

  installAuthFailureHook();
  if (!optionsSet) {
    setOptions({ key: apiKey, ...GOOGLE_MAPS_API_OPTIONS });
    optionsSet = true;
  }

  const request = Promise.all([importLibrary('core'), importLibrary('maps')]).then(
    ([core, maps]): GoogleMapsLibraries => ({ core, maps }),
  );
  pending = request;
  request.catch(() => {
    if (pending === request) pending = null;
  });
  return request;
}

/**
 * Dang ky nghe loi XAC THUC cua Google. Tra ve ham huy dang ky.
 *
 * Loi xac thuc la cua ca TRANG (mot khoa, mot lan tai): da hong mot lan thi moi ban do gan sau
 * cung phai lui ve nen cuc bo ngay — nen nguoi nghe den muon van duoc bao, qua mot vi tac vu.
 */
export function onGoogleMapsAuthFailure(listener: () => void): () => void {
  if (authFailed) {
    queueMicrotask(listener);
    return () => undefined;
  }
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}
