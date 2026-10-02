import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import type { GeoPoint } from '../geo/geo-point.js';
import { greatCircleMetres } from '../geo/geodesy.js';
import { DEFAULT_ACCURACY_POLICY } from '../geo/location-quality.js';
import type { Order } from '../movement/movement.types.js';
import { TRANSPORT_PLANNING_POLICY } from '../planning/planning-policy.js';
import type { TransportPlanningPolicy } from '../planning/planning.types.js';
import { TransportDomainError } from '../transport.errors.js';
import type { Vehicle } from '../transport.types.js';
import {
  TRANSPORT_DISPATCH_DECISIONS,
  type DispatchPickupResolutionReason,
  type DispatchRouteEstimateReason,
} from './dispatch-decisions.js';
import {
  DispatchComplianceFacts,
  DispatchCoreFacts,
  DispatchLocationFacts,
} from './dispatch-facts.port.js';
import { DispatchAssignmentPlanner, type DispatchCommitResult } from './dispatch-planner.port.js';
import {
  DISPATCH_CLOCK,
  TRANSPORT_DISPATCH_POLICY,
  type DispatchClock,
  type TransportDispatchPolicy,
} from './dispatch-policy.js';
import { rankCandidates, type RankableCandidate } from './dispatch-ranking.js';
import { describeCandidate, describeExclusion } from './dispatch-reason.js';
import {
  NO_DISPATCH_REQUIREMENT,
  assessSuitability,
  type DispatchRequirement,
  type SuitabilityVerdict,
} from './dispatch-suitability.js';
import type {
  DispatchCandidate,
  DispatchCandidateMode,
  DispatchExclusion,
  DispatchSuggestionView,
  ResolvedPlace,
  ResolvedPlaceView,
  VehicleCurrentLocationView,
  VehicleCurrentState,
  VehicleNextFree,
} from './dispatch.types.js';
import {
  pickupRejection,
  resolveDispatchPickup,
  type DispatchPickupRef,
} from './pickup-resolution.js';
import type { PlaceIndexEntry } from './place-resolution.js';
import {
  memoizeOrderLookup,
  planRemainingLegs,
  toRemainingLegFact,
  type OrderLookup,
} from './remaining-leg-plan.js';
import { TransportRoutingPort } from './routing/transport-routing.port.js';
import { truckFingerprint } from './routing/routing.types.js';
import type { RouteEstimate, TruckProfile } from './routing/routing.types.js';
import { truckProfileForVehicle } from './truck-profile.js';
import {
  gradeFreshness,
  orderRemainingLegs,
  projectCurrentState,
  projectNextFree,
} from './vehicle-state-projection.js';

/**
 * DIEU XE — tra loi *"xe nao phu hop nhat de nhan don nay"*, va KHONG ghi mot dong nao (`#277`).
 *
 * ===========================================================================
 * MOT DUONG DOC, MOT DUONG GHI, VA CHUNG KHONG CHAM NHAU
 *
 * `suggest()` doc. Moi thu no cham la mot cong chi-doc (`dispatch-facts.port.ts`), nen cau
 * *"xem mot bang de nghi khong doi mot hang du lieu nao"* la mot tinh chat KIEM DUOC LUC BIEN
 * DICH, khong phai mot loi hua trong tai lieu.
 *
 * `commit()` ghi — nhung khong tu quyet dinh gi. No CHAY LAI `suggest()` tren su that hien tai,
 * doi chieu voi chiec xe ma con nguoi da chon, roi chuyen cho `DispatchAssignmentPlanner`. Neu su
 * that da doi ke tu luc bang duoc ve, no tra `DISPATCH_RECOMMENDATION_STALE` chu khong ep lan
 * chon cu di tiep (`#277 M9`).
 *
 * ===========================================================================
 * DON MANG TOA DO; NHAN CHU CHI DE HIEN THI (#379)
 *
 * `TransportOrder` luu toa do diem lay/giao (`originPoint`/`destinationPoint`) do nguoi nhap don
 * chon tren ban do; `originLabel`/`destinationLabel` chi de hien thi. Don van KHONG co han lay hang
 * va khoi luong hang. Ba dieu do quyet dinh hinh dang cua ca be mat nay:
 *
 *   · diem lay hang theo DUNG THU TU: tham chieu tuong minh cua nguoi goi (POINT/SITE/GEOFENCE) >
 *     toa do cua don > tu choi `DISPATCH_ORDER_PICKUP_COORDINATES_MISSING`. KHONG con buoc suy tu
 *     `originLabel`: mot nhan trung ten mot hang rao la mot su trung hop chinh ta, khong phai mot
 *     lan khao sat — va don cu thi phai noi ra rang no chua co toa do;
 *   · diem den cua cac chang con lai (phep chieu "xe se ranh o dau") lay tu toa do DON khi chang
 *     tro toi mot don, va chi giai theo nhan khi chang khong co nguon toa do nao
 *     (`remaining-leg-plan.ts`);
 *   · han lay hang va yeu cau tai trong den tu NGUOI GOI, va khi khong ai khai thi cac buoc xep
 *     hang tuong ung bi BO QUA chu khong chay voi mot gia tri bia.
 */

/** Giu duong nhap cu: kieu nay song o `pickup-resolution.ts` tu #379. */
export type { DispatchPickupRef } from './pickup-resolution.js';

export interface DispatchSuggestionRequest {
  /** `null` = dung toa do diem lay luu tren don. Don cu khong co toa do -> tu choi co kieu. */
  readonly pickup: DispatchPickupRef | null;
  readonly requiredPickupAt: string | null;
  readonly requirement: DispatchRequirement;
  /** So dong toi da tra ve. `null` = theo tran cua chinh sach. */
  readonly limit: number | null;
}

export const EMPTY_DISPATCH_REQUEST: DispatchSuggestionRequest = {
  pickup: null,
  requiredPickupAt: null,
  requirement: NO_DISPATCH_REQUIREMENT,
  limit: null,
};

/**
 * AI DANG HOI — va ho duoc thay den dau.
 *
 * `canReadLocationHistory` la ket qua cua mot phep kiem quyen o tang bien, khong phai mot co ma
 * nguoi goi tu bat. Xem `VehicleCurrentLocationView.point` cho ly do no ton tai.
 */
export interface DispatchCaller {
  readonly actor: string;
  readonly canReadLocationHistory: boolean;
}

export interface DispatchCommitView {
  readonly orderId: string;
  readonly vehicleId: string;
  readonly runId: string;
  readonly legId: string;
  readonly created: boolean;
  readonly committedAt: string;
}

/** Trang thai trung gian cua MOT chiec xe trong mot lan tinh — khong ra ngoai service. */
interface VehicleAssessment {
  readonly vehicle: Vehicle;
  readonly truckProfile: TruckProfile;
  readonly current: VehicleCurrentState;
  readonly currentPlace: ResolvedPlace | null;
  readonly currentUsableAsOrigin: boolean;
  readonly hasCommittedWork: boolean;
  readonly nextFree: VehicleNextFree;
  readonly suitability: SuitabilityVerdict;
}

/**
 * Nhung thu MOT luot `suggest()` dung chung cho moi chiec xe.
 *
 * `budget` va `orders` co trang thai TRONG luot tinh (ngan sach bi tru, don doc roi thi nho): gom
 * chung vao mot cho de khong chiec xe nao lo tay tao ban rieng — mot ban rieng se lam ngan sach
 * dinh tuyen nhan len theo so xe.
 */
interface AssessmentContext {
  readonly requirement: DispatchRequirement;
  readonly index: readonly PlaceIndexEntry[];
  readonly now: Date;
  readonly budget: { remaining: number };
  readonly orders: OrderLookup;
}

/** Mot diem xuat phat ung vien TRUOC khi biet quang duong duong bo. */
interface CandidateOrigin {
  readonly assessment: VehicleAssessment;
  readonly mode: DispatchCandidateMode;
  readonly place: ResolvedPlace;
  readonly availableAt: string | null;
  readonly availableAtIsLowerBound: boolean;
  readonly interruptsCommittedWork: boolean;
  readonly crowMetres: number;
}

/**
 * Ung vien da du dai luong de sap thu tu, VA giu ban day du di kem.
 *
 * Ghep hai thu vao mot doi tuong thay vi tra cuu lai sau khi sap: MOT chiec xe co the sinh HAI
 * dong (di ngay tu cho dang dung ⟂ di sau khi xong viec), nen mot bang tra cuu theo ma xe se nuot
 * mat mot trong hai — va nuot mot cach im lang.
 */
interface RankedCandidate extends RankableCandidate {
  readonly candidate: DispatchCandidate;
}

@Injectable()
export class DispatchService {
  constructor(
    private readonly core: DispatchCoreFacts,
    private readonly routing: TransportRoutingPort,
    private readonly planner: DispatchAssignmentPlanner,
    @Inject(TRANSPORT_DISPATCH_POLICY) private readonly policy: TransportDispatchPolicy,
    /**
     * CHINH SACH LAP KE HOACH — va no BAT BUOC, khac han moi thu co `@Optional()` ben duoi.
     *
     * `#294 S-OWNER-03` doi cong chan nam o tang API/mien va phai FAIL-CLOSED. Mot phu thuoc
     * `@Optional()` se lam dieu nguoc lai: o mot cach lap module nao do quen dang ky token, `policy`
     * thanh `undefined`, va mot cai `?.` o giua duong se lang le cho MOI khach di qua cong. Nen no
     * la phu thuoc bat buoc — thieu thi tien trinh khong khoi dong duoc, va do la kieu hong DUNG.
     *
     * Token nay do `TransportModule` cung cap (`transport.module.ts:175`) va EXPORT (`:221`), con
     * `DispatchService` lai duoc dang ky o `app-composition.ts`. Canh phu thuoc do that su ton tai,
     * nhung `tsc`, test don vi va `*.composition.spec.ts` deu KHONG kiem duoc no — chi mot bai boot
     * that moi kiem duoc. Xem `app.module.transport-core.boot.spec.ts`.
     *
     * Doc lai o MOI lan goi chu khong chup lay mot `boolean` trong ham dung: gia tri nay la mot
     * anh chup luc khoi dong theo dung quy uoc chinh sach tenant hien hanh (`PlanningService` dung
     * y het), nhung `suggest()` va `commit()` la HAI lan goi khac nhau, va `#294 S5` doi lan thu
     * hai phai DOC LAI chu khong duoc tin vao ket qua cua lan thu nhat.
     */
    @Inject(TRANSPORT_PLANNING_POLICY) private readonly planning: TransportPlanningPolicy,
    @Optional() private readonly location?: DispatchLocationFacts,
    @Optional() private readonly compliance?: DispatchComplianceFacts,
    @Optional() private readonly telemetry?: TelemetryService,
    /**
     * DONG HO TIEM VAO — mot token, khong phai mot tham so co gia tri mac dinh.
     *
     * Nest giai tham so ham dung theo KIEU luc bien dich. Kieu cua mot ham la `Function`, va khong
     * ai dang ky mot provider ten `Function` — nen mot tham so `now: () => Date = ...` se chet luc
     * khoi dong du no co ve nhu co mac dinh. Mot token co `@Optional()` thi khong.
     */
    @Optional() @Inject(DISPATCH_CLOCK) private readonly clock?: DispatchClock,
  ) {}

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }

  /**
   * CONG CHINH SACH — chay TRUOC moi thu khac, ke ca truoc khi hoi don co ton tai khong.
   *
   * ===========================================================================
   * VI SAO DAT TRUOC `requireOpenOrder()`
   *
   * Neu hoi don truoc, thi mot khach `ONE_ORDER_PER_RUN` go bua mot ma don se phan biet duoc
   * "don nay khong co" (404) voi "don nay co" (403) — tuc mot be mat nghiep vu khach KHONG bat
   * van tra loi duoc cau hoi don nao co that. Dat cong chinh sach len truoc thi ca hai truong hop
   * ra cung mot cau tra loi, va do la nghia cua fail-closed.
   *
   * ===========================================================================
   * VI SAO NEM chu khong tra ve mot danh sach rong
   *
   * Mot bang de nghi RONG va mot be mat KHONG TON TAI trong y het nhau tren man hinh, nhung la hai
   * cau tra loi khac han: cai dau noi "khong chiec xe nao hop", cai sau noi "khach nay khong dung
   * bai toan nay". `#294 S1` doi *"explicit disabled semantics"*, va mot mang rong thi khong ro
   * rang chut nao — no se lam nguoi dieu xe ngoi doi mot chiec xe khong bao gio hien ra.
   */
  private requireMultiOrderRun(orderId: string): void {
    const grouping = this.planning.grouping;
    if (grouping === 'MULTI_ORDER_RUN') {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_DISPATCH_DECISIONS,
        point: 'dispatch.run_grouping',
        outcome: 'allowed',
        reason: 'RUN_GROUPING_MULTI_ORDER_RUN',
        detail: { orderId, grouping },
      });
      return;
    }

    this.telemetry?.decision({
      vocabulary: TRANSPORT_DISPATCH_DECISIONS,
      point: 'dispatch.run_grouping',
      outcome: 'denied',
      reason: 'RUN_GROUPING_ONE_ORDER_PER_RUN',
      detail: { orderId, grouping },
    });
    throw TransportDomainError.denied(
      'DISPATCH_MULTI_ORDER_DISABLED',
      'Khach nay dang o che do moi don mot vong chay, nen khong co bang de nghi dieu xe.',
    );
  }

  /* ------------------------------------------------------------------ *
   * DOC — khong mot lan ghi nao
   * ------------------------------------------------------------------ */

  async suggest(
    orderId: string,
    request: DispatchSuggestionRequest,
    caller: DispatchCaller,
  ): Promise<DispatchSuggestionView> {
    this.requireMultiOrderRun(orderId);
    const order = await this.requireOpenOrder(orderId);
    const placeIndex = (await this.location?.placeIndex()) ?? [];
    const pickup = this.resolvePickup(order, request.pickup, placeIndex);
    const requiredPickupAtMs = this.parseRequiredPickupAt(request.requiredPickupAt);

    const now = this.now();
    const vehicles = await this.core.listVehicles();
    const context: AssessmentContext = {
      requirement: request.requirement,
      index: placeIndex,
      now,
      budget: { remaining: this.policy.maxProjectionRouteCalls },
      // Don dang dieu da doc roi — dua vao bo dem de chang nao tro toi no khong doc lan hai.
      orders: memoizeOrderLookup((id) => this.core.findOrder(id), [order]),
    };

    const assessments: VehicleAssessment[] = [];
    for (const vehicle of vehicles) {
      assessments.push(await this.assess(vehicle, context));
    }

    const excluded: DispatchExclusion[] = assessments
      .filter((assessment) => assessment.suitability.exclusions.length > 0)
      .map((assessment) => ({
        vehicleId: assessment.vehicle.id,
        registrationPlate: assessment.vehicle.registrationPlate,
        reasons: assessment.suitability.exclusions,
        reasonSummary: describeExclusion(assessment.suitability.exclusions),
      }));

    for (const entry of excluded) {
      for (const reason of entry.reasons) {
        this.telemetry?.decision({
          vocabulary: TRANSPORT_DISPATCH_DECISIONS,
          point: 'dispatch.candidate_filter',
          outcome: 'denied',
          reason,
          detail: { vehicleId: entry.vehicleId, orderId },
        });
      }
    }

    const origins = this.buildCandidateOrigins(
      assessments.filter((assessment) => assessment.suitability.exclusions.length === 0),
      pickup.place.point,
    );

    /*
     * DUONG CHIM BAY XUAT HIEN O DAY, VA CHET O DAY.
     *
     * `#277 M3`: *"straight-line distance may prefilter only; it must not be the final ranking
     * metric."* No duoc dung dung mot lan — cat danh sach xuong con `maxRoutedCandidates` de mot
     * doi xe lon khong bien mot lan mo bang thanh mot ma tran khong lo — roi moi con so di vao
     * bang xep hang deu la con so DUONG BO.
     */
    const routed = [...origins]
      .sort((left, right) => left.crowMetres - right.crowMetres)
      .slice(0, this.policy.maxRoutedCandidates);

    const estimates = await this.routeToPickup(routed, pickup.place.point);

    const rankable: RankedCandidate[] = [];
    routed.forEach((origin, index) => {
      const estimate = estimates[index];
      if (!estimate) return;
      const candidate = this.toCandidate(
        origin,
        estimate,
        requiredPickupAtMs,
        caller.canReadLocationHistory,
      );
      rankable.push({ ...this.toRankable(candidate), candidate });
    });

    const ordered = rankCandidates(rankable, this.policy.orderingKeys).map(
      (entry) => entry.candidate,
    );
    const limit = request.limit ?? this.policy.maxRoutedCandidates;

    return {
      orderId: order.id,
      orderCode: order.code,
      pickup: { place: pickup.place, resolution: pickup.reason },
      requiredPickupAt: request.requiredPickupAt,
      generatedAt: now.toISOString(),
      orderingKeys: this.policy.orderingKeys,
      candidates: ordered.slice(0, Math.max(0, limit)),
      excluded,
      assignmentCreated: false,
    };
  }

  /* ------------------------------------------------------------------ *
   * GHI — chi sau khi mot con nguoi da chon
   * ------------------------------------------------------------------ */

  /**
   * BOSS XAC NHAN. Ba viec, theo dung thu tu, va khong viec nao bo duoc.
   *
   *   1. TINH LAI bang de nghi tren su that HIEN TAI. Ket qua ma nguoi dung nhin co the da vai
   *      phut tuoi; trong vai phut do mot chiec xe co the nhan viec khac, hong, hoac ra khoi vung.
   *   2. DOI CHIEU lua chon cua con nguoi voi ket qua vua tinh. Khong con trong danh sach nghia la
   *      su that da doi — tra `DISPATCH_RECOMMENDATION_STALE` de nguoi dung nhin lai, chu khong ep
   *      mot quyet dinh cu di tiep.
   *   3. CHUYEN cho bo lap ke hoach. Lane M khong ghi vong chay/chang bang tay o day.
   */
  async commit(
    orderId: string,
    vehicleId: string,
    request: DispatchSuggestionRequest,
    caller: DispatchCaller,
  ): Promise<DispatchCommitView> {
    /*
     * DOC LAI CHINH SACH, va day KHONG phai mot lan kiem thua.
     *
     * `#294 S5` buoc 2 doi dung dieu nay: giua luc mot nguoi nhin bang de nghi va luc ho bam xac
     * nhan, che do gom nhom cua khach co the da doi. `suggest()` ben duoi cung se chan lan nua khi
     * duoc goi de tinh lai — nhung dat cong o day cho ra ma tu choi DUNG (`DISPATCH_MULTI_ORDER_
     * DISABLED`) thay vi mot ma di lac (`DISPATCH_VEHICLE_NOT_FOUND` cua dong ngay ben duoi, hoac
     * `DISPATCH_RECOMMENDATION_STALE` cua vong tinh lai).
     */
    this.requireMultiOrderRun(orderId);

    const vehicle = await this.core.findVehicle(vehicleId);
    if (!vehicle) {
      throw TransportDomainError.notFound('DISPATCH_VEHICLE_NOT_FOUND', 'Khong tim thay xe.');
    }

    const revalidated = await this.suggest(orderId, request, caller);
    const stillRecommended = revalidated.candidates.some(
      (candidate) => candidate.vehicleId === vehicleId,
    );
    if (!stillRecommended) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_DISPATCH_DECISIONS,
        point: 'dispatch.commit',
        outcome: 'denied',
        reason: 'COMMIT_REVALIDATION_FAILED',
        detail: { orderId, vehicleId },
      });
      throw TransportDomainError.conflict(
        'DISPATCH_RECOMMENDATION_STALE',
        'Chiec xe nay khong con trong danh sach de nghi. Hay xem lai bang truoc khi giao viec.',
      );
    }

    const result: DispatchCommitResult = await this.planner.commit({
      orderId,
      vehicleId,
      actor: caller.actor,
    });

    this.telemetry?.decision({
      vocabulary: TRANSPORT_DISPATCH_DECISIONS,
      point: 'dispatch.commit',
      outcome: 'allowed',
      reason: result.reason,
      detail: { orderId, vehicleId, runId: result.runId, created: result.created },
    });

    return {
      orderId,
      vehicleId,
      runId: result.runId,
      legId: result.legId,
      created: result.created,
      committedAt: this.now().toISOString(),
    };
  }

  /* ------------------------------------------------------------------ *
   * NOI BO
   * ------------------------------------------------------------------ */

  private async requireOpenOrder(orderId: string): Promise<Order> {
    const order = await this.core.findOrder(orderId);
    if (!order) {
      throw TransportDomainError.notFound(
        'DISPATCH_ORDER_NOT_FOUND',
        'Khong tim thay nghia vu thuong mai.',
      );
    }
    if (order.status === 'CANCELLED') {
      throw TransportDomainError.conflict(
        'DISPATCH_ORDER_CANCELLED',
        'Nghia vu thuong mai da huy.',
      );
    }
    return order;
  }

  private parseRequiredPickupAt(raw: string | null): number | null {
    if (raw === null) return null;
    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) {
      throw TransportDomainError.invalid(
        'DISPATCH_REQUIRED_PICKUP_AT_INVALID',
        'Moc gio yeu cau lay hang khong doc duoc.',
      );
    }
    return parsed;
  }

  private resolvePickup(
    order: Order,
    ref: DispatchPickupRef | null,
    index: readonly PlaceIndexEntry[],
  ): { place: ResolvedPlace; reason: DispatchPickupResolutionReason } {
    // KHONG con buoc suy tu `originLabel` (#379) — thu tu nam o `pickup-resolution.ts`.
    const resolution = resolveDispatchPickup(order, ref, index);

    this.telemetry?.decision({
      vocabulary: TRANSPORT_DISPATCH_DECISIONS,
      point: 'dispatch.pickup_resolution',
      outcome: resolution.ok ? 'allowed' : 'denied',
      reason: resolution.reason,
      detail: { orderId: order.id },
    });

    if (!resolution.ok) throw pickupRejection(resolution.reason);
    return { place: resolution.place, reason: resolution.reason };
  }

  private async assess(vehicle: Vehicle, context: AssessmentContext): Promise<VehicleAssessment> {
    const { requirement, now } = context;
    const truckProfile = truckProfileForVehicle(vehicle);
    const sample = (await this.location?.latestObservationForVehicle(vehicle.id)) ?? null;

    const current: VehicleCurrentState = this.location
      ? projectCurrentState(sample, now, this.policy, DEFAULT_ACCURACY_POLICY)
      : { known: false, reason: 'LOCATION_CAPABILITY_ABSENT' };

    const currentUsableAsOrigin =
      current.known && gradeFreshness(current.location.ageSeconds, this.policy) !== 'STALE';

    const currentPlace: ResolvedPlace | null = current.known
      ? {
          point: current.location.point,
          source: 'VEHICLE_OBSERVATION',
          label: vehicle.registrationPlate,
          geofenceId: null,
          siteId: null,
        }
      : null;

    const openLegs = await this.core.listOpenLegsForVehicle(vehicle.id);
    const plans = await planRemainingLegs({
      remaining: orderRemainingLegs(openLegs.map(toRemainingLegFact)),
      currentPlace,
      truck: truckProfile,
      index: context.index,
      orders: context.orders,
      routing: this.routing,
      budget: context.budget,
    });

    const projected = projectNextFree({
      currentPlace: currentUsableAsOrigin ? currentPlace : null,
      remaining: plans,
      now,
      stopServiceSeconds: this.policy.stopServiceSeconds,
    });
    const nextFree: VehicleNextFree =
      currentPlace === null &&
      plans.length > 0 &&
      !projected.gaps.includes('CURRENT_POSITION_UNKNOWN')
        ? { ...projected, gaps: [...projected.gaps, 'CURRENT_POSITION_UNKNOWN'] }
        : projected;

    const readiness = this.compliance ? await this.compliance.readinessForVehicle(vehicle) : null;

    return {
      vehicle,
      truckProfile,
      current,
      currentPlace,
      currentUsableAsOrigin,
      hasCommittedWork: plans.length > 0,
      nextFree,
      suitability: assessSuitability({
        vehicle,
        requirement,
        readiness,
        current,
        nextFree,
        truckProfile,
        currentUsableAsOrigin,
      }),
    };
  }

  /**
   * Sinh cac diem xuat phat ung vien cho MOT chiec xe.
   *
   * Xe RANH -> mot dong duy nhat (`CURRENT_NEAR`): cho dang dung va cho se ranh la MOT, nen phat
   * hai dong se lam bang dai gap doi ma khong them mot su that nao.
   *
   * Xe DANG CO VIEC -> hai dong, va day la dung cho `#277 M6` doi (*"evaluate at least two
   * candidate origins per vehicle where meaningful"*):
   *
   *   `NEXT_FREE_NEAR`  duong binh thuong — nhan viec sau khi lam xong viec dang co;
   *   `CURRENT_NEAR`    duong CAT NGANG — mang co `WOULD_INTERRUPT_COMMITTED_WORK`, va khoa
   *                     `NO_WORK_INTERRUPTION` bao dam no khong bao gio dung tren mot lua chon
   *                     khong cat ngang. No van duoc hien vi nguoi dieu xe co quyen biet rang
   *                     chiec xe gan nhat dang ban — quyet dinh la cua ho, khong phai cua bang.
   */
  private buildCandidateOrigins(
    assessments: readonly VehicleAssessment[],
    pickup: GeoPoint,
  ): readonly CandidateOrigin[] {
    const origins: CandidateOrigin[] = [];

    for (const assessment of assessments) {
      if (!assessment.hasCommittedWork) {
        if (assessment.currentUsableAsOrigin && assessment.currentPlace) {
          origins.push({
            assessment,
            mode: 'CURRENT_NEAR',
            place: assessment.currentPlace,
            availableAt: assessment.nextFree.availableAt,
            availableAtIsLowerBound: assessment.nextFree.availableAtIsLowerBound,
            interruptsCommittedWork: false,
            crowMetres: greatCircleMetres(assessment.currentPlace.point, pickup),
          });
        }
        continue;
      }

      if (assessment.nextFree.place) {
        origins.push({
          assessment,
          mode: 'NEXT_FREE_NEAR',
          place: assessment.nextFree.place,
          availableAt: assessment.nextFree.availableAt,
          availableAtIsLowerBound: assessment.nextFree.availableAtIsLowerBound,
          interruptsCommittedWork: false,
          crowMetres: greatCircleMetres(assessment.nextFree.place.point, pickup),
        });
      }

      if (
        this.policy.includeInterruptingCandidates &&
        assessment.currentUsableAsOrigin &&
        assessment.currentPlace
      ) {
        origins.push({
          assessment,
          mode: 'CURRENT_NEAR',
          place: assessment.currentPlace,
          availableAt: null,
          availableAtIsLowerBound: false,
          interruptsCommittedWork: true,
          crowMetres: greatCircleMetres(assessment.currentPlace.point, pickup),
        });
      }
    }

    return origins;
  }

  /**
   * MOT lan goi ma tran cho ca danh sach — khong phai N lan goi le. Xem `#277 M3`.
   *
   * "Mot lan cho MOT HO SO XE", chinh xac hon: `MatrixRequest` mang DUNG MOT `TruckProfile`, nen
   * gop nhung diem xuat phat co ho so KHAC NHAU vao mot lan goi se dinh tuyen ca nhom theo ho so
   * cua chiec dau tien — mot con so trong hoan toan binh thuong nhung thuoc ve mot chiec xe khac.
   *
   * Hom nay moi ho so deu rong nhu nhau (`truckProfileForVehicle()` chua co cot nao de doc), nen
   * phep gom luon cho ra DUNG MOT nhom va dung mot lan goi. No ton tai de ngay `TransportVehicle`
   * co cot kich thuoc, tang nay tu chia nhom — khong ai phai nho quay lai sua cho nay.
   */
  private async routeToPickup(
    origins: readonly CandidateOrigin[],
    pickup: GeoPoint,
  ): Promise<readonly (RouteEstimate | null)[]> {
    if (origins.length === 0) return [];

    const groups = new Map<string, number[]>();
    origins.forEach((origin, index) => {
      const key = truckFingerprint(origin.assessment.truckProfile);
      const bucket = groups.get(key);
      if (bucket) bucket.push(index);
      else groups.set(key, [index]);
    });

    const estimates: (RouteEstimate | null)[] = origins.map(() => null);
    for (const indexes of groups.values()) {
      await this.routeGroupToPickup(origins, indexes, pickup, estimates);
    }
    return estimates;
  }

  private async routeGroupToPickup(
    origins: readonly CandidateOrigin[],
    indexes: readonly number[],
    pickup: GeoPoint,
    estimates: (RouteEstimate | null)[],
  ): Promise<void> {
    const outcome = await this.routing.matrix({
      origins: indexes.map((index) => origins[index]!.place.point),
      destinations: [pickup],
      truck: origins[indexes[0]!]!.assessment.truckProfile,
      departAt: null,
    });

    if (!outcome.ok) {
      const reason: DispatchRouteEstimateReason =
        outcome.failure.reason === 'REQUEST_BOUND_EXCEEDED'
          ? 'ROUTE_REQUEST_BOUND_EXCEEDED'
          : outcome.failure.reason === 'PROVIDER_RATE_LIMITED'
            ? 'ROUTE_PROVIDER_RATE_LIMITED'
            : 'ROUTE_PROVIDER_UNAVAILABLE';
      this.telemetry?.decision({
        vocabulary: TRANSPORT_DISPATCH_DECISIONS,
        point: 'dispatch.route_estimate',
        outcome: 'denied',
        reason,
        detail: { providerId: outcome.failure.providerId, candidates: origins.length },
      });
      /*
       * NHA CUNG CAP HONG -> TU CHOI CO KIEU, KHONG PHAI MOT BANG XEP HANG CHIM BAY.
       *
       * `#277 M13`: *"routing provider failure degrades to typed `ROUTING_UNAVAILABLE`, not
       * auto-select by straight-line fallback unless owner explicitly configures that fallback."*
       * Khong co cau hinh nao nhu the ton tai, nen khong co duong du phong nao ca.
       */
      throw TransportDomainError.conflict(
        outcome.failure.reason === 'REQUEST_BOUND_EXCEEDED'
          ? 'DISPATCH_MATRIX_BOUND_EXCEEDED'
          : 'DISPATCH_ROUTING_UNAVAILABLE',
        'Chua tinh duoc quang duong den diem lay hang. Hay thu lai sau.',
      );
    }

    for (const cell of outcome.cells) {
      if (cell.destinationIndex !== 0) continue;
      const originIndex = indexes[cell.originIndex];
      if (originIndex !== undefined) estimates[originIndex] = cell.estimate;
    }
  }

  private toCandidate(
    origin: CandidateOrigin,
    estimate: RouteEstimate,
    requiredPickupAtMs: number | null,
    canReadLocation: boolean,
  ): DispatchCandidate {
    const flags = origin.interruptsCommittedWork
      ? ([...origin.assessment.suitability.flags, 'WOULD_INTERRUPT_COMMITTED_WORK'] as const)
      : origin.assessment.suitability.flags;

    const availableAtMs = origin.availableAt ? Date.parse(origin.availableAt) : null;
    const pickupEtaMs =
      availableAtMs === null ? null : availableAtMs + estimate.durationSeconds * 1000;

    const routeReason: DispatchRouteEstimateReason = estimate.fromCache
      ? 'ROUTE_FROM_CACHE'
      : estimate.quality === 'SYNTHETIC'
        ? 'ROUTE_SYNTHETIC_ESTIMATE'
        : 'ROUTE_FROM_PROVIDER';

    const currentLocation: VehicleCurrentLocationView | null = origin.assessment.current.known
      ? {
          observedAt: origin.assessment.current.location.observedAt,
          ageSeconds: origin.assessment.current.location.ageSeconds,
          freshness: origin.assessment.current.location.freshness,
          accuracyGrade: origin.assessment.current.location.accuracyGrade,
          source: origin.assessment.current.location.source,
          point: canReadLocation ? origin.assessment.current.location.point : null,
          pointRedacted: !canReadLocation,
        }
      : null;

    return {
      vehicleId: origin.assessment.vehicle.id,
      registrationPlate: origin.assessment.vehicle.registrationPlate,
      mode: origin.mode,
      /*
       * Diem xuat phat `CURRENT_NEAR` LA vi tri cua chiec xe, nen toa do cua no chiu dung mot phep
       * che voi `VehicleCurrentLocationView.point`. Bo qua cho nay se lam ca phep che kia vo
       * nghia — du lieu bi che o mot truong roi lo nguyen ven o truong ben canh.
       */
      origin: this.redactOriginIfNeeded(origin.place, canReadLocation),
      availableAt: origin.availableAt,
      availableAtIsLowerBound: origin.availableAtIsLowerBound,
      emptyRoadMetresToPickup: estimate.roadDistanceMetres,
      roadSecondsToPickup: estimate.durationSeconds,
      pickupEtaAt: pickupEtaMs === null ? null : new Date(pickupEtaMs).toISOString(),
      meetsRequiredPickupAt:
        requiredPickupAtMs === null || pickupEtaMs === null
          ? null
          : pickupEtaMs <= requiredPickupAtMs,
      suitability: flags,
      currentLocation,
      nextFree: origin.assessment.nextFree,
      truckProfile: origin.assessment.truckProfile,
      route: {
        providerId: estimate.providerId,
        quality: estimate.quality,
        estimated: true,
        fromCache: estimate.fromCache,
        computedAt: estimate.computedAt,
        reason: routeReason,
      },
      reasonSummary: describeCandidate({
        mode: origin.mode,
        originLabel: origin.place.label,
        emptyRoadMetresToPickup: estimate.roadDistanceMetres,
        roadSecondsToPickup: estimate.durationSeconds,
        availableAt: origin.availableAt,
        availableAtIsLowerBound: origin.availableAtIsLowerBound,
        nextFree: origin.assessment.nextFree,
        flags,
        synthetic: estimate.quality === 'SYNTHETIC',
      }),
    };
  }

  /**
   * Toa do cua mot ban dinh vi XE bi bo di khi nguoi goi khong co quyen doc duong di.
   *
   * KHONG thay bang mot toa do khac (0,0 hay tam thanh pho): `parseGeoPoint()` tu choi Null Island
   * dung vi mot toa do gia se di tiep qua moi phep tinh nhu that. Cho nay bo HAN truong toa do —
   * ket qua la mot cho khong co toa do, va do la su that ma nguoi goi duoc phep biet.
   */
  private redactOriginIfNeeded(place: ResolvedPlace, canReadLocation: boolean): ResolvedPlaceView {
    if (place.source !== 'VEHICLE_OBSERVATION' || canReadLocation) {
      return { ...place, pointRedacted: false };
    }
    return {
      point: null,
      pointRedacted: true,
      source: place.source,
      label: 'Vi tri xe (khong du quyen xem toa do)',
      geofenceId: null,
      siteId: null,
    };
  }

  private toRankable(candidate: DispatchCandidate): RankableCandidate {
    return {
      vehicleId: candidate.vehicleId,
      registrationPlate: candidate.registrationPlate,
      meetsRequiredPickupAt: candidate.meetsRequiredPickupAt,
      interruptsCommittedWork: candidate.suitability.includes('WOULD_INTERRUPT_COMMITTED_WORK'),
      emptyRoadMetresToPickup: candidate.emptyRoadMetresToPickup,
      pickupEtaEpochMs: candidate.pickupEtaAt === null ? null : Date.parse(candidate.pickupEtaAt),
    };
  }
}
