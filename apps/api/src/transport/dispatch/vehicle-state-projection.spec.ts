import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCURACY_POLICY } from '../geo/location-quality.js';
import { DEFAULT_TRANSPORT_DISPATCH_POLICY } from './dispatch-policy.js';
import type { ResolvedPlace } from './dispatch.types.js';
import {
  gradeFreshness,
  orderRemainingLegs,
  projectCurrentState,
  projectNextFree,
  type ObservationSample,
  type RemainingLegFact,
} from './vehicle-state-projection.js';

const POLICY = DEFAULT_TRANSPORT_DISPATCH_POLICY;
const NOW = new Date('2026-09-08T10:00:00.000Z');

const place = (label: string): ResolvedPlace => ({
  point: { latitude: 20.86, longitude: 106.68 },
  source: 'GEOFENCE_LABEL_EXACT',
  label,
  geofenceId: `gf-${label}`,
  siteId: null,
});

const sampleAt = (agedSeconds: number): ObservationSample => ({
  sessionId: 'ses-1',
  point: { latitude: 21.02, longitude: 105.84 },
  accuracyMetres: 12,
  source: 'DEVICE_GNSS',
  receivedAt: new Date(NOW.getTime() - agedSeconds * 1000),
});

const leg = (over: Partial<RemainingLegFact> & { legId: string }): RemainingLegFact => ({
  runId: 'run-1',
  orderId: null,
  sequence: 1,
  kind: 'LOADED',
  status: 'PLANNED',
  originLabel: 'A',
  destinationLabel: 'B',
  runStatus: 'ACTIVE',
  runBusinessDate: '2026-09-08',
  runCreatedAt: '2026-09-08T08:00:00.000Z',
  ...over,
});

describe('vi tri HIEN TAI cua mot chiec xe', () => {
  it('khong co ban dinh vi nao -> NO_OBSERVATION, khong phai mot toa do mac dinh', () => {
    const state = projectCurrentState(null, NOW, POLICY, DEFAULT_ACCURACY_POLICY);
    expect(state).toEqual({ known: false, reason: 'NO_OBSERVATION' });
  });

  it('ban dinh vi vua nhan la FRESH va giu nguyen toa do goc', () => {
    const state = projectCurrentState(sampleAt(60), NOW, POLICY, DEFAULT_ACCURACY_POLICY);
    expect(state.known).toBe(true);
    if (!state.known) return;
    expect(state.location.freshness).toBe('FRESH');
    expect(state.location.ageSeconds).toBe(60);
    expect(state.location.point).toEqual({ latitude: 21.02, longitude: 105.84 });
    expect(state.location.accuracyGrade).toBe('FINE');
  });

  /**
   * `M14` muc 4 — mot vi tri cu KHONG duoc lang le tro thanh "xe dang o day".
   *
   * No van duoc TRA VE (giau di se lam nguoi xem tuong chiec xe chua bao gio bat bam vi tri), va
   * `dispatch-suitability.ts` moi la cho quyet dinh no co dung lam diem xuat phat duoc khong.
   */
  it('ban dinh vi qua han van hien ra, nhung mang nhan STALE', () => {
    const state = projectCurrentState(
      sampleAt(POLICY.currentLocationUsableSeconds + 1),
      NOW,
      POLICY,
      DEFAULT_ACCURACY_POLICY,
    );
    expect(state.known).toBe(true);
    if (!state.known) return;
    expect(state.location.freshness).toBe('STALE');
  });

  it('dong ho may chu bi chinh lui -> tuoi bang 0, khong phai mot so am', () => {
    const state = projectCurrentState(sampleAt(-600), NOW, POLICY, DEFAULT_ACCURACY_POLICY);
    expect(state.known).toBe(true);
    if (!state.known) return;
    expect(state.location.ageSeconds).toBe(0);
  });

  it('ba muc tuoi, khong phai hai', () => {
    expect(gradeFreshness(0, POLICY)).toBe('FRESH');
    expect(gradeFreshness(POLICY.currentLocationFreshSeconds + 1, POLICY)).toBe('AGEING');
    expect(gradeFreshness(POLICY.currentLocationUsableSeconds + 1, POLICY)).toBe('STALE');
  });
});

describe('sap thu tu cac chang con lai', () => {
  it('bo chang da xong/da huy va chang cua vong chay da dong', () => {
    const remaining = orderRemainingLegs([
      leg({ legId: 'da-xong', status: 'COMPLETED' }),
      leg({ legId: 'da-huy', status: 'CANCELLED' }),
      leg({ legId: 'vong-chay-dong', runStatus: 'COMPLETED' }),
      leg({ legId: 'con-phai-lam' }),
    ]);
    expect(remaining.map((entry) => entry.legId)).toEqual(['con-phai-lam']);
  });

  /** Hai vong chay MO CUNG NGAY la binh thuong o che do gom don — thu tu phai lap lai duoc. */
  it('phan dinh hai vong chay cung ngay bang thoi diem tao', () => {
    const remaining = orderRemainingLegs([
      leg({ legId: 'sau', runId: 'run-2', runCreatedAt: '2026-09-08T09:00:00.000Z' }),
      leg({ legId: 'truoc', runId: 'run-1', runCreatedAt: '2026-09-08T08:00:00.000Z' }),
    ]);
    expect(remaining.map((entry) => entry.legId)).toEqual(['truoc', 'sau']);
  });
});

describe('NOI/LUC xe se ranh tiep theo', () => {
  it('khong con viec + biet cho dang dung -> ranh NGAY, va gio la CHINH XAC', () => {
    const nextFree = projectNextFree({
      currentPlace: place('bai-xe'),
      remaining: [],
      now: NOW,
      stopServiceSeconds: 0,
    });
    expect(nextFree.completeness).toBe('COMPLETE');
    expect(nextFree.availableAt).toBe(NOW.toISOString());
    expect(nextFree.availableAtIsLowerBound).toBe(false);
  });

  /** `M14` muc 5 — khong biet thi noi la khong biet, khong roi ve bai xe hay ETA bang 0. */
  it('khong con viec + khong biet cho dang dung -> UNKNOWN', () => {
    const nextFree = projectNextFree({
      currentPlace: null,
      remaining: [],
      now: NOW,
      stopServiceSeconds: 0,
    });
    expect(nextFree.completeness).toBe('UNKNOWN');
    expect(nextFree.place).toBeNull();
    expect(nextFree.availableAt).toBeNull();
    expect(nextFree.gaps).toContain('CURRENT_POSITION_UNKNOWN');
  });

  it('con viec, giai duoc het -> COMPLETE, va gio la CHAN DUOI', () => {
    const nextFree = projectNextFree({
      currentPlace: place('ha-noi'),
      remaining: [
        { legId: 'l1', orderId: 'o1', destination: place('hai-phong'), travelSeconds: 7_200 },
      ],
      now: NOW,
      stopServiceSeconds: 0,
    });
    expect(nextFree.completeness).toBe('COMPLETE');
    expect(nextFree.place?.label).toBe('hai-phong');
    expect(nextFree.availableAt).toBe(new Date(NOW.getTime() + 7_200_000).toISOString());
    expect(nextFree.availableAtIsLowerBound).toBe(true);
    expect(nextFree.remainingOrderIds).toEqual(['o1']);
  });

  it('chang cuoi khong giai duoc dia diem -> khong noi duoc gi, kem ly do CO TEN', () => {
    const nextFree = projectNextFree({
      currentPlace: place('ha-noi'),
      remaining: [{ legId: 'l1', orderId: null, destination: null, travelSeconds: null }],
      now: NOW,
      stopServiceSeconds: 0,
    });
    expect(nextFree.completeness).toBe('UNKNOWN');
    expect(nextFree.gaps).toContain('FINAL_DESTINATION_UNRESOLVED');
    expect(nextFree.gaps).toContain('ROUTING_UNAVAILABLE_FOR_REMAINING_LEG');
  });

  /**
   * `M14` muc 12 — mot doan khong tinh duoc thoi gian KHONG duoc coi la 0.
   *
   * Coi no la 0 se lam gio xe ranh nhay len SOM hon that, tuc he thong de nghi mot chiec xe dang
   * ban. Day la huong sai nguy hiem, nen bai nay khang dinh `availableAt` bien mat han.
   */
  it('mot doan khong co thoi gian -> gio bien mat, KHONG bi coi la 0', () => {
    const nextFree = projectNextFree({
      currentPlace: place('ha-noi'),
      remaining: [
        { legId: 'l1', orderId: null, destination: place('nam-dinh'), travelSeconds: null },
        { legId: 'l2', orderId: 'o2', destination: place('ninh-binh'), travelSeconds: 3_600 },
      ],
      now: NOW,
      stopServiceSeconds: 0,
    });
    expect(nextFree.availableAt).toBeNull();
    expect(nextFree.completeness).toBe('PARTIAL');
    expect(nextFree.place?.label).toBe('ninh-binh');
    expect(nextFree.gaps).toContain('INTERMEDIATE_LEG_UNRESOLVED');
  });

  it('thoi gian lam viec tai diem dung duoc cong vao khi chinh sach dat khac 0', () => {
    const nextFree = projectNextFree({
      currentPlace: place('ha-noi'),
      remaining: [
        { legId: 'l1', orderId: null, destination: place('hai-phong'), travelSeconds: 3_600 },
      ],
      now: NOW,
      stopServiceSeconds: 900,
    });
    expect(nextFree.availableAt).toBe(new Date(NOW.getTime() + 4_500_000).toISOString());
  });
});
