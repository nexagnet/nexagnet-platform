import type { GeoPoint } from '../geo/geo-point.js';
import type {
  PlaceCandidate,
  PlaceLookupOutcome,
  PlaceSearchAvailability,
} from './place-search.types.js';

/**
 * CONG TIM DIA DIEM phia MAY CHU (#379).
 *
 * ===========================================================================
 * VI SAO TIM KIEM DI QUA MAY CHU, KHONG GOI THANG TU TRINH DUYET
 *
 *   1. Doi nha cung cap la mot dong cau hinh o may chu, khong phai mot ban build web moi.
 *   2. Cong gioi han TOAN UNG DUNG (1 lan / 1100 ms voi Nominatim cong khai) chi cuong che duoc o
 *      mot cho duy nhat — N trinh duyet tu goi thi N lan gioi han.
 *   3. May chu la cho duy nhat biet chac khach nay co duoc gui du lieu ra ben thu ba khong
 *      (`DATA_CLASSIFICATION`), va la cho duy nhat bao dam chi CHUOI NGUOI DUNG GO di ra ngoai —
 *      khong ma khach, khong ma don, khong ma nguoi dung.
 *
 * Abstract class lam token DI (khong `Symbol`) — cung khuon `TransportRoutingPort`.
 */
export abstract class TransportPlaceSearchPort {
  /** Ma nha cung cap — di vao telemetry, KHONG BAO GIO kem khoa hay URL. */
  abstract readonly providerId: string;
  abstract describe(): PlaceSearchAvailability;
  abstract search(query: string): Promise<PlaceLookupOutcome<readonly PlaceCandidate[]>>;
  abstract reverse(point: GeoPoint): Promise<PlaceLookupOutcome<PlaceCandidate | null>>;
}

/**
 * DUONG MAC DINH: chua bat nha cung cap nao — va do la mot cau tra loi dung, khong phai mot loi.
 *
 * Khong mot lan goi mang nao. Mot stack quen dat bien moi truong khong duoc lang le gui chuoi
 * nguoi dung go ra ngoai; cung ly le voi `FUEL_EXTRACTION_MODE=stub` o lop nen tang.
 */
export class UnconfiguredPlaceSearchAdapter extends TransportPlaceSearchPort {
  readonly providerId = 'none';

  constructor(
    private readonly reason:
      'PROVIDER_UNCONFIGURED' | 'PROVIDER_NOT_APPROVED_FOR_CUSTOMER_DATA' = 'PROVIDER_UNCONFIGURED',
  ) {
    super();
  }

  describe(): PlaceSearchAvailability {
    return { available: false, providerId: this.providerId, reason: this.reason };
  }

  async search(): Promise<PlaceLookupOutcome<readonly PlaceCandidate[]>> {
    return { status: 'DISABLED', reason: this.reason };
  }

  async reverse(): Promise<PlaceLookupOutcome<PlaceCandidate | null>> {
    return { status: 'DISABLED', reason: this.reason };
  }
}
