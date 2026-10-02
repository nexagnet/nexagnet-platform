import { BadRequestException, RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ROLES_KEY } from '../../auth/roles.decorator.js';
import { presetIncludes } from '../transport-actions.js';
import { TRANSPORT_ACTION_KEY } from '../transport-action.guard.js';
import { TransportPlaceService } from './place.service.js';
import { TransportPlaceSearchPort } from './place-search.port.js';
import {
  OPENSTREETMAP_ATTRIBUTION,
  type PlaceCandidate,
  type PlaceLookupOutcome,
  type PlaceSearchAvailability,
} from './place-search.types.js';
import { TransportPlacesController } from './places.controller.js';
import { PLACE_QUERY_MAX_LENGTH, placeReverseSchema, placeSearchSchema } from './places.schemas.js';

const CANDIDATE: PlaceCandidate = {
  label: 'Khu công nghiệp Đình Vũ',
  address: null,
  point: { latitude: 20.8264, longitude: 106.7752 },
};

class RecordingProvider extends TransportPlaceSearchPort {
  readonly providerId = 'nominatim';
  readonly queries: string[] = [];
  constructor(private readonly outcome: PlaceLookupOutcome<readonly PlaceCandidate[]>) {
    super();
  }
  describe(): PlaceSearchAvailability {
    return { available: true, providerId: this.providerId, attribution: OPENSTREETMAP_ATTRIBUTION };
  }
  async search(query: string): Promise<PlaceLookupOutcome<readonly PlaceCandidate[]>> {
    this.queries.push(query);
    return this.outcome;
  }
  async reverse(): Promise<PlaceLookupOutcome<PlaceCandidate | null>> {
    return { status: 'OK', value: CANDIDATE, fromCache: false };
  }
}

function controllerWith(
  outcome: PlaceLookupOutcome<readonly PlaceCandidate[]> = {
    status: 'OK',
    value: [CANDIDATE],
    fromCache: false,
  },
) {
  const provider = new RecordingProvider(outcome);
  return {
    provider,
    controller: new TransportPlacesController(new TransportPlaceService(provider)),
  };
}

describe('than yeu cau tim dia diem', () => {
  it('cat khoang trang roi kiem do dai 2..200', () => {
    expect(placeSearchSchema.safeParse({ query: '  Đình Vũ  ' })).toMatchObject({
      success: true,
      data: { query: 'Đình Vũ' },
    });
    expect(placeSearchSchema.safeParse({ query: ' a ' }).success).toBe(false);
    expect(placeSearchSchema.safeParse({ query: 'ab' }).success).toBe(true);
    expect(placeSearchSchema.safeParse({ query: 'x'.repeat(PLACE_QUERY_MAX_LENGTH) }).success).toBe(
      true,
    );
    expect(
      placeSearchSchema.safeParse({ query: 'x'.repeat(PLACE_QUERY_MAX_LENGTH + 1) }).success,
    ).toBe(false);
    expect(placeSearchSchema.safeParse({}).success).toBe(false);
    expect(placeSearchSchema.safeParse({ query: 42 }).success).toBe(false);
  });

  /** Khoa la bi TU CHOI, khong bi bo qua: khong cho nao de ma khach/ma don lot ra ngoai. */
  it('khoa la bi tu choi', () => {
    expect(placeSearchSchema.safeParse({ query: 'Dinh Vu', customerId: 'KH02' }).success).toBe(
      false,
    );
    expect(
      placeReverseSchema.safeParse({ latitude: 21, longitude: 105, orderId: 'o-1' }).success,
    ).toBe(false);
  });

  it('tim nguoc: hai so, khong nguong o zod', () => {
    expect(placeReverseSchema.safeParse({ latitude: 91, longitude: 0 }).success).toBe(true);
    expect(placeReverseSchema.safeParse({ latitude: '21', longitude: 105 }).success).toBe(false);
    expect(placeReverseSchema.safeParse({ latitude: 21 }).success).toBe(false);
  });
});

describe('be mat HTTP tim dia diem', () => {
  it('tim: gui DUNG chuoi da cat khoang trang, tra 200 co kieu', async () => {
    const { controller, provider } = controllerWith();

    const response = await controller.search({ query: '  Đình Vũ Hải Phòng ' });

    expect(provider.queries).toEqual(['Đình Vũ Hải Phòng']);
    expect(response).toEqual({
      status: 'OK',
      reason: null,
      results: [CANDIDATE],
      attribution: OPENSTREETMAP_ATTRIBUTION,
      fromCache: false,
    });
  });

  it.each([
    [{ status: 'DISABLED', reason: 'PROVIDER_UNCONFIGURED' }],
    [{ status: 'BUSY', reason: 'PROVIDER_BUSY' }],
    [{ status: 'UNAVAILABLE', reason: 'PROVIDER_UNAVAILABLE' }],
  ] as const)('%o -> van la than 200 voi trang thai, khong nem', async (outcome) => {
    const { controller } = controllerWith(outcome);

    expect(await controller.search({ query: 'Dinh Vu' })).toEqual({
      ...outcome,
      results: [],
      attribution: null,
      fromCache: false,
    });
  });

  it('than sai -> 400, KHONG goi nha cung cap', async () => {
    const { controller, provider } = controllerWith();

    expect(() => controller.search({ query: 'x' })).toThrow(BadRequestException);
    expect(() => controller.search(undefined)).toThrow(BadRequestException);
    expect(() => controller.search({ query: 'Dinh Vu', tenant: 'ultty' })).toThrow(
      BadRequestException,
    );
    expect(provider.queries).toEqual([]);
  });

  it('tim nguoc diem hop le -> 200 + mot ket qua', async () => {
    const { controller } = controllerWith();

    expect(await controller.reverse({ latitude: 20.8264, longitude: 106.7752 })).toMatchObject({
      status: 'OK',
      result: CANDIDATE,
    });
  });

  /** Diem hong qua duoc zod (hai so) nhung truot `parseGeoPoint` -> 400 mang ma co kieu. */
  it('tim nguoc diem hong -> 400 PLACE_POINT_INVALID', async () => {
    const { controller } = controllerWith();

    const error = await controller
      .reverse({ latitude: 0, longitude: 0 })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      statusCode: 400,
      reason: 'PLACE_POINT_INVALID',
    });
  });

  it('dia diem da biet khong co so hang rao -> available false', async () => {
    const { controller } = controllerWith();

    expect(await controller.known()).toEqual({ available: false, places: [] });
  });
});

describe('phan quyen va gioi han cua be mat tim dia diem', () => {
  const handlers = {
    known: TransportPlacesController.prototype.known,
    search: TransportPlacesController.prototype.search,
    reverse: TransportPlacesController.prototype.reverse,
  };

  /** Dung LAI `transport.order.manage` — khong mot ma quyen moi. */
  it('moi route: ADMIN + ACCOUNTING, ma quyen transport.order.manage', () => {
    for (const handler of Object.values(handlers)) {
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(['ACCOUNTING', 'ADMIN']);
      expect(Reflect.getMetadata(TRANSPORT_ACTION_KEY, handler)).toBe('transport.order.manage');
    }
    expect(presetIncludes('ADMIN', 'transport.order.manage')).toBe(true);
    expect(presetIncludes('ACCOUNTING', 'transport.order.manage')).toBe(true);
    expect(presetIncludes('SALE', 'transport.order.manage')).toBe(false);
  });

  it('tim 20/phut, tim nguoc 30/phut', () => {
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handlers.search)).toBe(20);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handlers.search)).toBe(60_000);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handlers.reverse)).toBe(30);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handlers.reverse)).toBe(60_000);
  });

  /** POST: chuoi tim va toa do nam trong THAN, khong nam trong URL cua API minh. */
  it('tim va tim nguoc la POST, doc dia diem da biet la GET', () => {
    expect(Reflect.getMetadata('path', handlers.search)).toBe('search');
    expect(Reflect.getMetadata('method', handlers.search)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata('method', handlers.reverse)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata('method', handlers.known)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata('path', TransportPlacesController)).toBe('transport/places');
  });
});
