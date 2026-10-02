import type { GeoPoint } from '../geo/geo-point.js';
import {
  buildNominatimReverseUrl,
  buildNominatimSearchUrl,
  parseNominatimReverse,
  parseNominatimSearch,
  type NominatimConfig,
} from './nominatim.js';
import { TransportPlaceSearchPort } from './place-search.port.js';
import {
  OPENSTREETMAP_ATTRIBUTION,
  type PlaceCandidate,
  type PlaceLookupFailureReason,
  type PlaceLookupOutcome,
  type PlaceSearchAvailability,
} from './place-search.types.js';

/**
 * Het gio moi lan goi Nominatim. Nguoi dung dang cho mot danh sach goi y; qua 8 giay thi cau tra
 * loi dung la "tim kiem dang tam ngung — chon tren ban do", khong phai mot vong quay vo han.
 */
export const NOMINATIM_TIMEOUT_MS = 8000;

/**
 * ADAPTER NOMINATIM — phan CO NOI MANG. Chi duoc gan khi nguoi van hanh bat tuong minh.
 *
 * ===========================================================================
 * MOI LAN GOI DO NGUOI DUNG KICH HOAT, VA DI QUA CONG GIOI HAN
 *
 * Lop nay KHONG tu gioi han toc do: no luon duoc boc trong `GatedPlaceSearchAdapter` (xem
 * `place-search-provider.factory.ts`). Tach ra de lop nay chi con dung mot viec — mot lan goi, mot
 * ket qua co kieu — va de cong gioi han kiem thu duoc bang dong ho gia.
 *
 * ===========================================================================
 * CHUOI TIM KIEM KHONG DUOC RO RI QUA DUONG LOI
 *
 * URL mang `q=` — tuc chinh chuoi nguoi dung go. Moi duong that bai o day tra ve mot MA co kieu;
 * than loi cua `fetch`, URL va than phan hoi cua nha cung cap khong co duong nao ra ngoai.
 */
export class NominatimPlaceSearchAdapter extends TransportPlaceSearchPort {
  readonly providerId = 'nominatim';

  constructor(
    private readonly config: NominatimConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs: number = NOMINATIM_TIMEOUT_MS,
  ) {
    super();
  }

  describe(): PlaceSearchAvailability {
    return { available: true, providerId: this.providerId, attribution: OPENSTREETMAP_ATTRIBUTION };
  }

  async search(query: string): Promise<PlaceLookupOutcome<readonly PlaceCandidate[]>> {
    const payload = await this.readJson(buildNominatimSearchUrl(this.config, query));
    if ('failure' in payload) return unavailable(payload.failure);

    const candidates = parseNominatimSearch(payload.body);
    if (candidates === null) return unavailable('PROVIDER_UNAVAILABLE');
    return { status: 'OK', value: candidates, fromCache: false };
  }

  async reverse(point: GeoPoint): Promise<PlaceLookupOutcome<PlaceCandidate | null>> {
    const payload = await this.readJson(buildNominatimReverseUrl(this.config, point));
    if ('failure' in payload) return unavailable(payload.failure);

    const parsed = parseNominatimReverse(payload.body);
    if (!parsed.ok) return unavailable('PROVIDER_UNAVAILABLE');
    return { status: 'OK', value: parsed.candidate, fromCache: false };
  }

  /**
   * Mot lan goi -> than JSON, hoac mot MA that bai.
   *
   * `429` tach khoi cac ma khac vi hai truong hop dan toi hai hanh dong khac nhau: bi gioi han thi
   * cho, con lai thi bao nguoi van hanh. Khong thu lai: chinh sach Nominatim doi it lan goi hon,
   * khong phai nhieu hon.
   */
  private async readJson(
    url: string,
  ): Promise<{ readonly body: unknown } | { readonly failure: PlaceLookupFailureReason }> {
    try {
      const response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { 'User-Agent': this.config.userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (response.status === 429) return { failure: 'PROVIDER_RATE_LIMITED' };
      if (!response.ok) return { failure: 'PROVIDER_UNAVAILABLE' };
      return { body: (await response.json()) as unknown };
    } catch {
      /*
       * `catch` KHONG buoc doi tuong loi, va do la co y: than loi mang cua `fetch` chua nguyen URL
       * da goi — tuc chua `q=<chuoi nguoi dung go>`. Cai duy nhat dang giu la SU KIEN "khong goi
       * duoc", va do la thu duy nhat nguoi doc can.
       */
      return { failure: 'PROVIDER_UNAVAILABLE' };
    }
  }
}

function unavailable<T>(reason: PlaceLookupFailureReason): PlaceLookupOutcome<T> {
  return { status: 'UNAVAILABLE', reason };
}
