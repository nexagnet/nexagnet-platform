import type { GeoPoint } from '../geo/geo-point.js';
import { gradeAccuracy, type AccuracyPolicy } from '../geo/location-quality.js';
import type { RunLegKind, RunLegStatus, VehicleRunStatus } from '../movement/movement.types.js';
import type { LocationSource } from '../proof/tracking.types.js';
import type {
  LocationFreshness,
  NextFreeGapReason,
  ResolvedPlace,
  VehicleCurrentState,
  VehicleNextFree,
} from './dispatch.types.js';

/**
 * HAI PHEP CHIEU, VA MOT RANH GIOI GIUA CHUNG (`#277 M1`).
 *
 * ===========================================================================
 * `CURRENT` LA BANG CHUNG. `NEXT_FREE` LA MOT SUY LUAN.
 *
 * Ban dinh vi gan nhat cua mot chiec xe la mot su that DA QUAN SAT DUOC: co dong ho may chu, co
 * sai so, co nguon. Tang nay khong duoc phep sua no — khong lam tron, khong khop len duong, khong
 * thay bang diem den cua chang dang chay. `#277 M10`: *"Never replace raw observations with
 * matched coordinates."*
 *
 * "Xe se ranh o dau, luc nao" thi nguoc lai: khong mot ban ghi nao trong he thong noi dieu do. No
 * duoc SUY ra tu cac chang chua xong, va vi the no phai mang theo do khong chac chan cua chinh
 * minh — do la ly do `VehicleNextFree.completeness` va `gaps` ton tai.
 *
 * ===========================================================================
 * TANG NAY KHONG DOC DONG HO. `now` di vao bang tham so (`INV-25`), nen mot bai kiem thu chay luc
 * nao trong ngay cung cho ra mot ket qua.
 */

/* ------------------------------------------------------------------ *
 * CURRENT — vi tri dang co
 * ------------------------------------------------------------------ */

/** Ban dinh vi gan nhat cua mot chiec xe, thu gon con dung phan tang nay dung toi. */
export interface ObservationSample {
  /**
   * `null` khi ban dinh vi den tu PHAN CUNG TREN XE — no khong thuoc ca lam viec cua ai (`#297` T4).
   *
   * Giu truong nay thay vi bo di: `source` noi ban nay den tu dau, con `sessionId` noi no den tu
   * CA LAM VIEC NAO — va khi co, do la duong lan ra lai xe dang cam may. Mot `null` o day la mot
   * cau tra loi that ("khong ca nao ca"), khong phai mot khoang thieu.
   */
  readonly sessionId: string | null;
  readonly point: GeoPoint;
  readonly accuracyMetres: number | null;
  readonly source: LocationSource;
  /** Dong ho MAY CHU. Xem `TransportLocationObservation.receivedAt` — day moi la su that. */
  readonly receivedAt: Date;
}

export interface LocationAgePolicy {
  readonly currentLocationFreshSeconds: number;
  readonly currentLocationUsableSeconds: number;
}

export function gradeFreshness(ageSeconds: number, policy: LocationAgePolicy): LocationFreshness {
  if (ageSeconds <= policy.currentLocationFreshSeconds) return 'FRESH';
  if (ageSeconds <= policy.currentLocationUsableSeconds) return 'AGEING';
  return 'STALE';
}

/**
 * Ban dinh vi -> trang thai hien tai CO NHAN TUOI.
 *
 * Mot ban dinh vi `STALE` VAN duoc tra ve, khong bi vut di — nhung no khong duoc dung lam diem
 * xuat phat (xem `dispatch-suitability.ts`). Hai viec do tach roi co chu y: giau mot vi tri cu se
 * lam nguoi dieu xe tuong chiec xe chua bao gio bat bam vi tri, trong khi su that la no da tat
 * may tu sang. `#277 M1`: *"stale/unusable location must be visible as such."*
 *
 * `ageSeconds` KHONG BAO GIO am. Mot `receivedAt` o tuong lai chi xay ra khi dong ho may chu bi
 * chinh lui; ket qua dung la 0 ("vua nhan xong"), khong phai mot so am chay xuoi qua moi phep so.
 */
export function projectCurrentState(
  sample: ObservationSample | null,
  now: Date,
  policy: LocationAgePolicy,
  accuracy: AccuracyPolicy,
): VehicleCurrentState {
  if (sample === null) return { known: false, reason: 'NO_OBSERVATION' };

  const ageSeconds = Math.max(0, Math.floor((now.getTime() - sample.receivedAt.getTime()) / 1000));

  return {
    known: true,
    location: {
      point: sample.point,
      observedAt: sample.receivedAt.toISOString(),
      ageSeconds,
      freshness: gradeFreshness(ageSeconds, policy),
      accuracyGrade: gradeAccuracy(sample.accuracyMetres, accuracy),
      source: sample.source,
      sessionId: sample.sessionId,
    },
  };
}

/* ------------------------------------------------------------------ *
 * NEXT_FREE — viec con lai cua chiec xe
 * ------------------------------------------------------------------ */

/** Trang thai chang KHONG con la viec phai lam. `PLANNED`/`IN_TRANSIT` thi con. */
const SETTLED_LEG_STATUSES: ReadonlySet<RunLegStatus> = new Set(['COMPLETED', 'CANCELLED']);
/** Vong chay o hai trang thai nay khong con sinh ra viec tuong lai nao. */
const SETTLED_RUN_STATUSES: ReadonlySet<VehicleRunStatus> = new Set(['COMPLETED', 'CANCELLED']);

/**
 * MOT CHANG CHUA XONG, kem du day dinh danh de sap thu tu TAT DINH.
 *
 * Ba khoa sap xep, theo dung thu tu: ngay nghiep vu cua vong chay, roi thoi diem tao vong chay,
 * roi so thu tu chang. Khoa thu hai la thu phan dinh duoc hai vong chay MO CUNG MOT NGAY — mot
 * tinh huong binh thuong o che do `MULTI_ORDER_RUN` cua Lane L — ma neu bo qua thi thu tu se phu
 * thuoc vao thu tu tra ve cua co so du lieu, tuc khong lap lai duoc.
 */
export interface RemainingLegFact {
  readonly legId: string;
  readonly runId: string;
  readonly orderId: string | null;
  readonly sequence: number;
  /**
   * `LOADED`/`EMPTY` — can de biet diem den cua chang lay tu DAU (#379): chang co tai di toi diem
   * GIAO cua don no cho, chang rong dung ngay truoc mot chang co tai di toi diem LAY cua don ke.
   */
  readonly kind: RunLegKind;
  readonly status: RunLegStatus;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly runStatus: VehicleRunStatus;
  readonly runBusinessDate: string;
  /** ISO. Thu tu tao vong chay — khoa phan dinh giua hai vong chay cung ngay. */
  readonly runCreatedAt: string;
}

/** Loc va SAP THU TU cac chang con phai lam. Ham thuan; khong doi mang dau vao. */
export function orderRemainingLegs(legs: readonly RemainingLegFact[]): readonly RemainingLegFact[] {
  return [...legs]
    .filter(
      (leg) => !SETTLED_RUN_STATUSES.has(leg.runStatus) && !SETTLED_LEG_STATUSES.has(leg.status),
    )
    .sort(
      (left, right) =>
        left.runBusinessDate.localeCompare(right.runBusinessDate) ||
        left.runCreatedAt.localeCompare(right.runCreatedAt) ||
        left.runId.localeCompare(right.runId) ||
        left.sequence - right.sequence,
    );
}

/**
 * MOT CHANG CON LAI da duoc giai dia diem va da duoc uoc thoi gian di.
 *
 * `travelSeconds === null` la mot ket qua HOP LE, khong phai mot loi: nha cung cap dinh tuyen co
 * the khong tra loi cho dung doan do, hoac mot dau doan khong giai duoc ra toa do. Thay no bang 0
 * se lam gio xe ranh nhay len som hon that — va do dung la huong sai nguy hiem: he thong se de
 * nghi mot chiec xe dang ban.
 */
export interface RemainingLegPlan {
  readonly legId: string;
  readonly orderId: string | null;
  readonly destination: ResolvedPlace | null;
  readonly travelSeconds: number | null;
}

export interface NextFreeInput {
  /** Cho xe dang dung — dung lam ket qua khi khong con viec nao. `null` = khong biet. */
  readonly currentPlace: ResolvedPlace | null;
  readonly remaining: readonly RemainingLegPlan[];
  readonly now: Date;
  readonly stopServiceSeconds: number;
}

/**
 * NOI/LUC XE SE RANH — phep chieu.
 *
 * Bon ket cuc, va ba trong so do la "biet mot phan":
 *
 *   khong con viec + biet cho dang dung   -> `COMPLETE`, ranh NGAY, va gio la CHINH XAC
 *   khong con viec + khong biet cho       -> `UNKNOWN`
 *   con viec, giai duoc het               -> `COMPLETE`, gio la CHAN DUOI
 *   con viec, khuyet mot phan             -> `PARTIAL`, va `gaps` noi khuyet o dau
 *
 * `availableAtIsLowerBound` bat len ngay khi con du MOT chang, va no dung theo nghia den:
 * `stopServiceSeconds` mac dinh bang 0 (chua co dinh muc nghiep vu), thoi gian xep do hang khong
 * duoc dem, va thoi gian nghi cua lai xe cung khong. Con so nay tra loi *"khong the som hon"*, va
 * do la cau duy nhat no duoc phep tra loi.
 */
export function projectNextFree(input: NextFreeInput): VehicleNextFree {
  const gaps: NextFreeGapReason[] = [];

  if (input.remaining.length === 0) {
    if (input.currentPlace === null) {
      return {
        completeness: 'UNKNOWN',
        place: null,
        availableAt: null,
        availableAtIsLowerBound: false,
        remainingLegIds: [],
        remainingOrderIds: [],
        gaps: ['CURRENT_POSITION_UNKNOWN'],
      };
    }
    return {
      completeness: 'COMPLETE',
      place: input.currentPlace,
      availableAt: input.now.toISOString(),
      // Xe khong con viec gi: "ranh bay gio" la mot phat bieu chinh xac, khong phai mot chan duoi.
      availableAtIsLowerBound: false,
      remainingLegIds: [],
      remainingOrderIds: [],
      gaps: [],
    };
  }

  let totalSeconds = 0;
  let timeKnown = true;
  const lastIndex = input.remaining.length - 1;

  input.remaining.forEach((leg, index) => {
    if (leg.travelSeconds === null) {
      timeKnown = false;
      const gap: NextFreeGapReason =
        index === lastIndex
          ? 'ROUTING_UNAVAILABLE_FOR_REMAINING_LEG'
          : 'INTERMEDIATE_LEG_UNRESOLVED';
      if (!gaps.includes(gap)) gaps.push(gap);
    } else {
      totalSeconds += leg.travelSeconds;
    }
    if (leg.destination === null && index !== lastIndex) {
      if (!gaps.includes('INTERMEDIATE_LEG_UNRESOLVED')) gaps.push('INTERMEDIATE_LEG_UNRESOLVED');
    }
    totalSeconds += input.stopServiceSeconds;
  });

  const finalPlace = input.remaining[lastIndex]?.destination ?? null;
  if (finalPlace === null) gaps.push('FINAL_DESTINATION_UNRESOLVED');

  const availableAt = timeKnown
    ? new Date(input.now.getTime() + totalSeconds * 1000).toISOString()
    : null;

  const completeness =
    finalPlace !== null && availableAt !== null
      ? 'COMPLETE'
      : finalPlace === null && availableAt === null
        ? 'UNKNOWN'
        : 'PARTIAL';

  return {
    completeness,
    place: finalPlace,
    availableAt,
    availableAtIsLowerBound: availableAt !== null,
    remainingLegIds: input.remaining.map((leg) => leg.legId),
    remainingOrderIds: input.remaining
      .map((leg) => leg.orderId)
      .filter((orderId): orderId is string => orderId !== null),
    gaps,
  };
}
