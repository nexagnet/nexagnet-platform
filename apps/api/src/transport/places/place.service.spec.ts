import { describe, expect, it } from 'vitest';
import type { TelemetryService } from '../../observability/telemetry.service.js';
import type { GeoPoint } from '../geo/geo-point.js';
import { TransportDomainError } from '../transport.errors.js';
import { KnownPlacesFacts } from './known-places.port.js';
import { TransportPlaceService } from './place.service.js';
import { TransportPlaceSearchPort, UnconfiguredPlaceSearchAdapter } from './place-search.port.js';
import {
  OPENSTREETMAP_ATTRIBUTION,
  type KnownPlace,
  type PlaceCandidate,
  type PlaceLookupOutcome,
  type PlaceSearchAvailability,
} from './place-search.types.js';

const QUERY = 'Nhà máy thép Đình Vũ';
const POINT: GeoPoint = { latitude: 20.826401, longitude: 106.775201 };
const CANDIDATE: PlaceCandidate = {
  label: 'Khu công nghiệp Đình Vũ',
  address: 'Hải An, Hải Phòng',
  point: { latitude: 20.8264, longitude: 106.7752 },
};

class FixedProvider extends TransportPlaceSearchPort {
  readonly providerId = 'nominatim';
  constructor(
    private readonly searchOutcome: PlaceLookupOutcome<readonly PlaceCandidate[]>,
    private readonly reverseOutcome: PlaceLookupOutcome<PlaceCandidate | null> = {
      status: 'OK',
      value: CANDIDATE,
      fromCache: false,
    },
  ) {
    super();
  }
  describe(): PlaceSearchAvailability {
    return { available: true, providerId: this.providerId, attribution: OPENSTREETMAP_ATTRIBUTION };
  }
  async search(): Promise<PlaceLookupOutcome<readonly PlaceCandidate[]>> {
    return this.searchOutcome;
  }
  async reverse(): Promise<PlaceLookupOutcome<PlaceCandidate | null>> {
    return this.reverseOutcome;
  }
}

/** Telemetry GHI LAI moi thu no nhan — de khang dinh ca DIEU KHONG duoc co trong do. */
function recordingTelemetry() {
  const steps: string[] = [];
  const decisions: Array<Record<string, unknown>> = [];
  const telemetry = {
    step: async <T>(name: string, fn: () => Promise<T>) => {
      steps.push(name);
      return fn();
    },
    decision: (input: Record<string, unknown>) => {
      decisions.push(input);
    },
  } as unknown as TelemetryService;
  return { telemetry, steps, decisions };
}

describe('dich vu tim dia diem: doi ket qua co kieu thanh than 200', () => {
  it('OK tu nha cung cap -> ket qua + dong ghi nguon OSM', async () => {
    const service = new TransportPlaceService(
      new FixedProvider({ status: 'OK', value: [CANDIDATE], fromCache: false }),
    );

    expect(await service.search(QUERY)).toEqual({
      status: 'OK',
      reason: null,
      results: [CANDIDATE],
      attribution: OPENSTREETMAP_ATTRIBUTION,
      fromCache: false,
    });
  });

  it('OK tu bo nho dem -> fromCache true', async () => {
    const service = new TransportPlaceService(
      new FixedProvider({ status: 'OK', value: [CANDIDATE], fromCache: true }),
    );

    expect(await service.search(QUERY)).toMatchObject({ status: 'OK', fromCache: true });
  });

  it.each([
    ['DISABLED', 'PROVIDER_UNCONFIGURED'],
    ['DISABLED', 'PROVIDER_NOT_APPROVED_FOR_CUSTOMER_DATA'],
    ['BUSY', 'PROVIDER_BUSY'],
    ['UNAVAILABLE', 'PROVIDER_RATE_LIMITED'],
    ['UNAVAILABLE', 'PROVIDER_UNAVAILABLE'],
  ] as const)('%s / %s -> 200 co kieu, khong ket qua, khong ghi nguon', async (status, reason) => {
    const service = new TransportPlaceService(new FixedProvider({ status, reason }));

    expect(await service.search(QUERY)).toEqual({
      status,
      reason,
      results: [],
      attribution: null,
      fromCache: false,
    });
  });

  it('adapter mac dinh (TAT) -> DISABLED / PROVIDER_UNCONFIGURED', async () => {
    const service = new TransportPlaceService(new UnconfiguredPlaceSearchAdapter());

    expect(await service.search(QUERY)).toMatchObject({
      status: 'DISABLED',
      reason: 'PROVIDER_UNCONFIGURED',
    });
    expect(await service.reverse(21, 105.8)).toEqual({
      status: 'DISABLED',
      reason: 'PROVIDER_UNCONFIGURED',
      result: null,
      attribution: null,
      fromCache: false,
    });
  });

  it('tim nguoc OK -> mot ket qua + ghi nguon', async () => {
    const service = new TransportPlaceService(
      new FixedProvider({ status: 'OK', value: [], fromCache: false }),
    );

    expect(await service.reverse(POINT.latitude, POINT.longitude)).toEqual({
      status: 'OK',
      reason: null,
      result: CANDIDATE,
      attribution: OPENSTREETMAP_ATTRIBUTION,
      fromCache: false,
    });
  });

  /** Diem hong la loi cua NGUOI GOI (400), khong phai mot trang thai cua nha cung cap. */
  it.each([
    [0, 0],
    [91, 105],
    [21, 181],
    [Number.NaN, 105],
  ])('tim nguoc diem hong (%s, %s) -> PLACE_POINT_INVALID', async (latitude, longitude) => {
    const service = new TransportPlaceService(
      new FixedProvider({ status: 'OK', value: [], fromCache: false }),
    );

    const error = await service.reverse(latitude, longitude).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TransportDomainError);
    expect(error).toMatchObject({ kind: 'INVALID', reason: 'PLACE_POINT_INVALID' });
  });
});

describe('telemetry cua tim dia diem', () => {
  it('ghi buoc + quyet dinh voi ma dung cho tung ket qua', async () => {
    const cases = [
      [
        { status: 'OK', value: [CANDIDATE], fromCache: false },
        'PLACE_LOOKUP_FROM_PROVIDER',
        'allowed',
      ],
      [{ status: 'OK', value: [CANDIDATE], fromCache: true }, 'PLACE_LOOKUP_FROM_CACHE', 'allowed'],
      [{ status: 'DISABLED', reason: 'PROVIDER_UNCONFIGURED' }, 'PLACE_LOOKUP_DISABLED', 'denied'],
      [{ status: 'BUSY', reason: 'PROVIDER_BUSY' }, 'PLACE_LOOKUP_BUSY', 'denied'],
      [
        { status: 'UNAVAILABLE', reason: 'PROVIDER_UNAVAILABLE' },
        'PLACE_LOOKUP_UNAVAILABLE',
        'degraded',
      ],
    ] as const;

    for (const [outcome, reason, decision] of cases) {
      const { telemetry, steps, decisions } = recordingTelemetry();
      await new TransportPlaceService(new FixedProvider(outcome), undefined, telemetry).search(
        QUERY,
      );

      expect(steps).toEqual(['place.search']);
      expect(decisions).toHaveLength(1);
      expect(decisions[0]).toMatchObject({ point: 'place.lookup', outcome: decision, reason });
    }
  });

  /**
   * CHUOI TIM va TOA DO la du lieu vi tri — lop che telemetry khong biet khoa `query` la noi dung.
   * `detail` chi duoc co nam khoa da khai; bai nay khang dinh CA tap khoa va quet ca ban ghi.
   */
  it('detail KHONG chua chuoi tim hay toa do, chi nam khoa da khai', async () => {
    const { telemetry, steps, decisions } = recordingTelemetry();
    const service = new TransportPlaceService(
      new FixedProvider({ status: 'OK', value: [CANDIDATE], fromCache: false }),
      undefined,
      telemetry,
    );

    await service.search(QUERY);
    await service.reverse(POINT.latitude, POINT.longitude);

    expect(steps).toEqual(['place.search', 'place.reverse']);
    expect(decisions[0]?.['detail']).toEqual({
      operation: 'search',
      providerId: 'nominatim',
      queryLength: QUERY.length,
      resultCount: 1,
      reason: null,
    });
    expect(decisions[1]?.['detail']).toEqual({
      operation: 'reverse',
      providerId: 'nominatim',
      resultCount: 1,
      reason: null,
    });

    const recorded = JSON.stringify(decisions);
    expect(recorded).not.toContain('Đình Vũ');
    expect(recorded).not.toContain(QUERY);
    expect(recorded).not.toContain('20.82');
    expect(recorded).not.toContain('106.77');
  });

  it('that bai ghi MA ly do vao detail, khong ghi gi khac', async () => {
    const { telemetry, decisions } = recordingTelemetry();

    await new TransportPlaceService(
      new FixedProvider({ status: 'UNAVAILABLE', reason: 'PROVIDER_RATE_LIMITED' }),
      undefined,
      telemetry,
    ).search(QUERY);

    expect(decisions[0]?.['detail']).toEqual({
      operation: 'search',
      providerId: 'nominatim',
      queryLength: QUERY.length,
      resultCount: 0,
      reason: 'PROVIDER_RATE_LIMITED',
    });
  });

  /** Observability KHONG la dependency cua thanh cong nghiep vu. */
  it('khong co telemetry thi tim kiem van chay y het', async () => {
    const service = new TransportPlaceService(
      new FixedProvider({ status: 'OK', value: [CANDIDATE], fromCache: false }),
    );

    expect((await service.search(QUERY)).results).toEqual([CANDIDATE]);
  });
});

describe('dia diem da biet', () => {
  it('khong co so hang rao (khong bat transport-proof) -> available false, danh sach rong', async () => {
    const service = new TransportPlaceService(new UnconfiguredPlaceSearchAdapter());

    expect(await service.known()).toEqual({ available: false, places: [] });
  });

  it('co so hang rao -> available true + danh sach cua cong', async () => {
    const place: KnownPlace = {
      id: 'f1',
      kind: 'DEPOT',
      kindLabel: 'Bãi xe',
      name: 'Bãi xe Hà Nội',
      address: null,
      detail: null,
      point: { latitude: 20.9652, longitude: 105.8468 },
      radiusMetres: 250,
    };
    class Facts extends KnownPlacesFacts {
      async listKnownPlaces() {
        return [place];
      }
    }

    const service = new TransportPlaceService(new UnconfiguredPlaceSearchAdapter(), new Facts());

    expect(await service.known()).toEqual({ available: true, places: [place] });
  });
});
