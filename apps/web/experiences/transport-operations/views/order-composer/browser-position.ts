import type { GeoPoint } from '../../transport-types';
import type { BrowserPositionFailure } from '../../workspace/place-lookup';

/**
 * "VI TRI CUA TOI" cho man tao don (`#379`) — mot GOI Y chon diem, khong phai bang chung.
 *
 * Khac `driver/driver-location.ts` (moc cua lai xe, `maximumAge: 0`, nem loi co cau ve "mốc"): o day
 * mot ban ghi vai chuc giay trong bo dem la du — nguoi dung chi can ban do bay toi gan noi ho dang
 * ngoi de chon. Va that bai la mot KET QUA co kieu, khong phai mot ngoai le: man hinh noi mot cau
 * ro va moi cach chon khac van chay.
 *
 * CHI goi tu mot lan bam cua nguoi dung. Khong mot duong nao hoi quyen vi tri luc mo man hinh.
 */

export type BrowserPositionOutcome =
  | { readonly ok: true; readonly point: GeoPoint; readonly accuracyMetres: number | null }
  | { readonly ok: false; readonly failure: BrowserPositionFailure };

/** 15 giay: may thu GNSS lanh can lau, nhung mot nut quay mai la mot nut hong. */
const TIMEOUT_MS = 15_000;
/** Ban ghi trong bo dem toi 60 giay van dung de CHON diem — day khong phai moc van hanh. */
const MAXIMUM_AGE_MS = 60_000;

export function readOfficePosition(): Promise<BrowserPositionOutcome> {
  if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
    return Promise.resolve({ ok: false, failure: 'UNSUPPORTED' });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          ok: true,
          point: { latitude: position.coords.latitude, longitude: position.coords.longitude },
          accuracyMetres: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null,
        }),
      (error) =>
        resolve({
          ok: false,
          failure:
            error.code === error.PERMISSION_DENIED
              ? 'DENIED'
              : error.code === error.TIMEOUT
                ? 'TIMEOUT'
                : 'UNSUPPORTED',
        }),
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: MAXIMUM_AGE_MS },
    );
  });
}
