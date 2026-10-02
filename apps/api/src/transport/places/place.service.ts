import { Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { parseGeoPoint } from '../geo/geo-point.js';
import { TransportDomainError } from '../transport.errors.js';
import { KnownPlacesFacts } from './known-places.port.js';
import { TRANSPORT_PLACE_DECISIONS, type PlaceLookupReason } from './place-decisions.js';
import { TransportPlaceSearchPort } from './place-search.port.js';
import type {
  KnownPlacesResponse,
  PlaceCandidate,
  PlaceLookupOutcome,
  PlaceReverseResponse,
  PlaceSearchResponse,
} from './place-search.types.js';

type LookupOperation = 'search' | 'reverse';

/** Khoa DUY NHAT duoc phep vao `detail` cua quyet dinh — xem `place-decisions.ts`. */
interface LookupDetail {
  readonly operation: LookupOperation;
  readonly providerId: string;
  readonly queryLength?: number;
  readonly resultCount: number;
  readonly reason: string | null;
}

/**
 * TIM DIA DIEM + DIA DIEM DA BIET cho man tao don (#379).
 *
 * Dich vu nay khong ghi mot dong nao. No chuyen mot cau hoi cua nguoi dung sang cong tim kiem,
 * ghi lai VI SAO co (hoac khong co) cau tra loi, va doi ket qua co kieu thanh mot than phan hoi
 * 200 ma man hinh doc duoc ngay.
 *
 * Telemetry TUY CHON va fail-open: thieu no thi tim kiem van chay y het.
 */
@Injectable()
export class TransportPlaceService {
  constructor(
    private readonly places: TransportPlaceSearchPort,
    @Optional() private readonly knownPlaces?: KnownPlacesFacts,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  search(query: string): Promise<PlaceSearchResponse> {
    const run = async (): Promise<PlaceSearchResponse> => {
      const outcome = await this.places.search(query);
      const results = outcome.status === 'OK' ? outcome.value : [];
      this.recordLookup(outcome, {
        operation: 'search',
        providerId: this.places.providerId,
        queryLength: query.length,
        resultCount: results.length,
        reason: outcome.status === 'OK' ? null : outcome.reason,
      });
      return { ...this.envelope(outcome), results };
    };
    return this.telemetry ? this.telemetry.step('place.search', run) : run();
  }

  /**
   * Tim nguoc tu hai so THO cua than yeu cau. Nguong duy nhat la `parseGeoPoint`; hong thi 400
   * `PLACE_POINT_INVALID` — mot loi cua nguoi goi, khong phai mot trang thai cua nha cung cap.
   */
  reverse(latitude: number, longitude: number): Promise<PlaceReverseResponse> {
    const parsed = parseGeoPoint(latitude, longitude);
    if (!parsed.ok) {
      return Promise.reject(
        TransportDomainError.invalid(
          'PLACE_POINT_INVALID',
          'Diem tren ban do khong hop le (ngoai pham vi toa do hoac la diem 0,0)',
        ),
      );
    }
    const run = async (): Promise<PlaceReverseResponse> => {
      const outcome = await this.places.reverse(parsed.point);
      const result: PlaceCandidate | null = outcome.status === 'OK' ? outcome.value : null;
      this.recordLookup(outcome, {
        operation: 'reverse',
        providerId: this.places.providerId,
        resultCount: result === null ? 0 : 1,
        reason: outcome.status === 'OK' ? null : outcome.reason,
      });
      return { ...this.envelope(outcome), result };
    };
    return this.telemetry ? this.telemetry.step('place.reverse', run) : run();
  }

  async known(): Promise<KnownPlacesResponse> {
    if (!this.knownPlaces) return { available: false, places: [] };
    return { available: true, places: await this.knownPlaces.listKnownPlaces() };
  }

  /** Phan chung cua hai than phan hoi. Ghi nguon CHI khi co ket qua cua nha cung cap. */
  private envelope<T>(outcome: PlaceLookupOutcome<T>) {
    if (outcome.status !== 'OK') {
      return {
        status: outcome.status,
        reason: outcome.reason,
        attribution: null,
        fromCache: false,
      };
    }
    const availability = this.places.describe();
    return {
      status: outcome.status,
      reason: null,
      attribution: availability.available ? availability.attribution : null,
      fromCache: outcome.fromCache,
    };
  }

  private recordLookup<T>(outcome: PlaceLookupOutcome<T>, detail: LookupDetail): void {
    const { reason, decision } = lookupDecisionOf(outcome);
    this.telemetry?.decision({
      vocabulary: TRANSPORT_PLACE_DECISIONS,
      point: 'place.lookup',
      outcome: decision,
      reason,
      detail: { ...detail },
    });
  }
}

/**
 * Ket qua -> ma quyet dinh. Tat va ban la cong DONG CO CHU Y (`denied`); nha cung cap sap la he
 * thong van chay nhung o duong du phong (`degraded`) — nguoi dung chon tren ban do thay vi tim.
 */
function lookupDecisionOf<T>(outcome: PlaceLookupOutcome<T>): {
  readonly reason: PlaceLookupReason;
  readonly decision: 'allowed' | 'denied' | 'degraded';
} {
  switch (outcome.status) {
    case 'OK':
      return {
        reason: outcome.fromCache ? 'PLACE_LOOKUP_FROM_CACHE' : 'PLACE_LOOKUP_FROM_PROVIDER',
        decision: 'allowed',
      };
    case 'DISABLED':
      return { reason: 'PLACE_LOOKUP_DISABLED', decision: 'denied' };
    case 'BUSY':
      return { reason: 'PLACE_LOOKUP_BUSY', decision: 'denied' };
    case 'UNAVAILABLE':
      return { reason: 'PLACE_LOOKUP_UNAVAILABLE', decision: 'degraded' };
  }
}
