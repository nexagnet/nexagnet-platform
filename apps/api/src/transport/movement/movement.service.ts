import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { assertBusinessDate, toBusinessDate } from '../business-date.js';
import { FleetRepository } from '../fleet/fleet.repository.js';
import { isWithinRoadNetworkBoundingBox, parseGeoPoint, type GeoPoint } from '../geo/geo-point.js';
import { MoneyError, nonNegativeMoney } from '../money.js';
import { TRANSPORT_CORE_POLICY, type TransportCorePolicy } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import { TripRepository } from '../trips/trip.repository.js';
import {
  TRANSPORT_MOVEMENT_DECISIONS,
  type TransportMovementDecisionReason,
} from './movement-decisions.js';
import type { LegFieldTruthSource } from './leg-field-truth.port.js';
import {
  evaluateLegCancel,
  evaluateLegCompletionEvidence,
  evaluateLegTransition,
  evaluateOrderCancel,
  evaluateOrderTransition,
  evaluateRunCancel,
  evaluateRunTransition,
  evaluateSystemRunClose,
  isTerminalRunStatus,
  type TransitionDecision,
} from './movement-lifecycle.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import {
  MovementRepository,
  RUN_CODE,
  RunClosedForNewWorkError,
  type CreateOrderInput,
  type CreateRunInput,
  type RunCloseAttempt,
  type RunClosureCandidateQuery,
  type SerializedRunCloseVerdict,
  type SerializedRunSnapshot,
  type TripOrderProjection,
  type TripProjection,
  type UpdateOrderInput,
} from './movement.repository.js';

/**
 * PHAN XU LAI, chay tren su that doc DUOI KHOA hang vong chay.
 *
 * `MovementService` khong biet gi ve chinh sach dong: no chi bao dam rang cau tra loi cuoi cung
 * duoc lay tren mot su that khong ai doi duoc nua. Chu the biet chinh sach la `PlanningService`, va
 * no truyen phep phan xu cua no vao day.
 */
export type SystemRunCloseRevalidation = (
  snapshot: SerializedRunSnapshot,
) => Promise<SerializedRunCloseVerdict>;
import type {
  Order,
  OrderStatus,
  RunAssignment,
  RunLeg,
  RunLegKind,
  RunLegStatus,
  VehicleRun,
  VehicleRunDetail,
  VehicleRunStatus,
} from './movement.types.js';
import { planOrderProjection, planTripProjection } from './trip-run-projection.js';

/**
 * TAC NHAN cua nhung lan ghi do CHINH HE THONG quyet, khong mot nguoi nao bam.
 *
 * Mot chuoi rieng chu khong muon ten cua nguoi vua goi API: `#276` L4 doi dong vong chay la viec
 * cua he thong, va dau vet kiem toan phai noi dung dieu do. Ghi ten ke toan vao mot lan dong ma ho
 * khong quyet se lam so kiem toan noi doi ngay o cho quan trong nhat.
 */
export const SYSTEM_ACTOR = 'system:transport-planning';

/**
 * LENH cua tang tren. Khac DTO ghi cua repository o dung mot cho: `businessDate` la TUY CHON.
 *
 * Co y tach lam hai kieu. Ngay nghiep vu duoc CHOT MOT LAN, boi service, theo mui gio tenant
 * (`INV-25`) -- neu DTO ghi cung cho no vang mat thi mot repository nao do se co co suy no lai
 * tu `createdAt`, va hai cach tinh se lech nhau dung vao ngay ai do doi cau hinh.
 */
export type CreateOrderCommand = Omit<CreateOrderInput, 'businessDate'> & {
  readonly businessDate?: string;
};

export type CreateRunCommand = Omit<CreateRunInput, 'businessDate'> & {
  readonly businessDate?: string;
};

/** Them mot chang -- `orderId` chi co nghia khi `kind === 'LOADED'`. */
export interface AddLegCommand {
  readonly sequence: number;
  readonly kind: RunLegKind;
  readonly orderId?: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly businessDate?: string;
  readonly distanceKm?: number | null;
  /** #276 L6 — km DU KIEN. Khong bao gio ghi de len `distanceKm`. */
  readonly plannedDistanceKm?: number | null;
  readonly note?: string | null;
}

export interface AssignRunCommand {
  readonly driverId: string;
}

/**
 * Cai nguoi goi MANG THEO khi doi trang thai mot chang — `#332`.
 *
 * `fieldTruth` den tu tang ghep (`RunsController`, noi `app-composition.ts` noi san ban hien thuc
 * cua `transport-checkpoint`), khong tiem vao service nay: `MovementService` song trong
 * `TransportModule`, noi cong do khong nhin thay. Cung khuon `closeRunAsSystem(..., revalidate)`.
 * Vang mat = khong co so ghi hien truong de doi chieu, dung nhu mot khach chi bat `transport-core`.
 */
export interface LegTransitionOptions {
  readonly fieldTruth?: LegFieldTruthSource;
  /** Ghi de TUONG MINH khi hien truong chua ghi giao xong. Chi co hieu luc khi that su ghi de. */
  readonly overrideReason?: string;
}

type DecisionPoint = (typeof TRANSPORT_MOVEMENT_DECISIONS)['points'][number];

/**
 * MIEN VAN CHUYEN v2 -- hai truc doc lap (#232 `D-01`, #234 A1).
 *
 * Service nay so huu DUNG hai thu: nghia vu thuong mai (`Order`) va vong chay vat ly
 * (`VehicleRun` + `RunLeg`). No KHONG so huu chuyen v1: `TripRepository` chi duoc doc, va chi
 * boi mot duong duy nhat -- `projectTrip()`.
 *
 * Moi duong tu choi mang mot MA RIENG. Mot cong nghiep vu co N duong tu choi ma tra ve `false`
 * thi nguoi doc trace phai mo source doc lai N dieu kien roi doan xem cai nao da dong.
 */
@Injectable()
export class MovementService {
  constructor(
    private readonly repository: MovementRepository,
    private readonly fleet: FleetRepository,
    private readonly audit: AuditLogService,
    @Inject(TRANSPORT_CORE_POLICY) private readonly policy: TransportCorePolicy,
    @Optional() private readonly trips?: TripRepository,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  /* ------------------------------------------------------------------ *
   * NGHIA VU THUONG MAI
   * ------------------------------------------------------------------ */

  async createOrder(input: CreateOrderCommand, actor: string): Promise<Order> {
    // Kiem toa do TRUOC moi lan doc DB: day la loi hinh dang dau vao (400), khong phu thuoc du lieu.
    const location = this.parseOrderLocation(input);
    if (await this.repository.findOrderByCode(input.code)) {
      throw TransportDomainError.conflict(
        'ORDER_CODE_TAKEN',
        `Ma nghia vu "${input.code}" da duoc dung.`,
      );
    }
    await this.requireCustomer(input.customerId ?? null);

    const order = await this.repository.createOrder({
      ...input,
      ...location,
      businessDate: this.resolveBusinessDate(input.businessDate),
      freightAmount: this.checkMoney(input.freightAmount ?? null),
    });
    this.recordOrderLocation(order);

    await this.audit.append({
      actor,
      action: 'transport.order.create',
      entityType: 'TransportOrder',
      entityId: order.id,
      before: null,
      after: order,
    });
    return order;
  }

  async updateOrder(id: string, patch: UpdateOrderInput, actor: string): Promise<Order> {
    const before = await this.requireOrder(id);
    if (patch.customerId !== undefined) await this.requireCustomer(patch.customerId);

    const after = await this.repository.updateOrder(id, {
      ...patch,
      ...(patch.freightAmount === undefined
        ? {}
        : { freightAmount: this.checkMoney(patch.freightAmount) }),
    });
    if (!after) throw TransportDomainError.notFound('ORDER_NOT_FOUND', 'Khong tim thay nghia vu.');

    await this.audit.append({
      actor,
      action: 'transport.order.update',
      entityType: 'TransportOrder',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  listOrders(): Promise<Order[]> {
    return this.repository.listOrders();
  }

  getOrder(id: string): Promise<Order> {
    return this.requireOrder(id);
  }

  /** Chang dang phuc vu mot nghia vu -- cach doc "don nay dang di den dau". */
  legsOfOrder(orderId: string): Promise<RunLeg[]> {
    return this.repository.listLegsByOrder(orderId);
  }

  async transitionOrder(id: string, to: OrderStatus, actor: string): Promise<Order> {
    const before = await this.requireOrder(id);
    const decision = evaluateOrderTransition(before.status, to);
    if (!decision.allowed) {
      throw this.deny('order.lifecycle_transition', decision.reason, { orderId: id, to });
    }

    const after = await this.repository.setOrderStatus(id, to, new Date());
    if (!after) throw TransportDomainError.notFound('ORDER_NOT_FOUND', 'Khong tim thay nghia vu.');

    this.allow('order.lifecycle_transition', decision.reason, {
      orderId: id,
      from: before.status,
      to,
    });
    await this.audit.append({
      actor,
      action: 'transport.order.transition',
      entityType: 'TransportOrder',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async cancelOrder(id: string, reason: string, actor: string): Promise<Order> {
    const before = await this.requireOrder(id);
    const decision = evaluateOrderCancel(before.status);
    if (!decision.allowed) {
      throw this.deny('order.cancel', decision.reason, { orderId: id });
    }

    const after = await this.repository.cancelOrder(id, {
      cancelledAt: new Date(),
      cancellationReason: reason,
    });
    if (!after) throw TransportDomainError.notFound('ORDER_NOT_FOUND', 'Khong tim thay nghia vu.');

    this.allow('order.cancel', decision.reason, { orderId: id });
    await this.audit.append({
      actor,
      action: 'transport.order.cancel',
      entityType: 'TransportOrder',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  /* ------------------------------------------------------------------ *
   * VONG CHAY VAT LY
   * ------------------------------------------------------------------ */

  async createRun(input: CreateRunCommand, actor: string): Promise<VehicleRun> {
    if (await this.repository.findRunByCode(input.code)) {
      throw TransportDomainError.conflict(
        'RUN_CODE_TAKEN',
        `Ma vong chay "${input.code}" da duoc dung.`,
      );
    }
    if (!(await this.fleet.findVehicle(input.vehicleId))) {
      throw TransportDomainError.notFound('RUN_VEHICLE_NOT_FOUND', 'Khong tim thay xe.');
    }

    const run = await this.repository
      .createRun({
        ...input,
        businessDate: this.resolveBusinessDate(input.businessDate),
      })
      .catch((error: unknown) => {
        // HAI YEU CAU DEN CUNG LUC. Phep doc `findRunByCode` o tren khong thay ban kia vi no chua
        // commit; unique cua kho thi thay. Dich ra DUNG ma ma duong tuan tu da tra ve, thay vi de mot
        // `P2002` tho di len thanh `500` — nguoi goi khong phan biet duoc hai tinh huong, va ca hai
        // deu co cung mot cau tra loi dung: "ma nay da co roi".
        if (isUniqueViolationOn(error, RUN_CODE)) {
          throw TransportDomainError.conflict(
            'RUN_CODE_TAKEN',
            `Ma vong chay "${input.code}" da duoc dung.`,
          );
        }
        throw error;
      });

    await this.audit.append({
      actor,
      action: 'transport.run.create',
      entityType: 'TransportVehicleRun',
      entityId: run.id,
      before: null,
      after: run,
    });
    return run;
  }

  listRuns(): Promise<VehicleRun[]> {
    return this.repository.listRuns();
  }

  /**
   * UNG VIEN cho luot quet dong vong chay — `#293` R3. Xem `MovementRepository` de biet vi sao tap
   * nay la ung vien chu khong phai ket luan.
   *
   * Di qua dich vu chu khong qua kho: `PlanningService` va `RunClosureService` chi duoc nhin thay
   * `MovementService`, va mot phuong thuc doc o day giu dung chieu phu thuoc do. Quy uoc cua lane
   * L la *ghi* phai di qua dich vu; o day cung vay — lop tren khong cam vao kho.
   */
  listRunClosureCandidates(query: RunClosureCandidateQuery): Promise<VehicleRun[]> {
    return this.repository.listRunClosureCandidates(query);
  }

  async getRun(id: string): Promise<VehicleRunDetail> {
    const run = await this.requireRun(id);
    return {
      run,
      legs: await this.repository.listLegs(id),
      activeAssignment: await this.repository.activeRunAssignment(id),
    };
  }

  async transitionRun(id: string, to: VehicleRunStatus, actor: string): Promise<VehicleRun> {
    const before = await this.requireRun(id);
    const legs = await this.repository.listLegs(id);
    const decision = evaluateRunTransition(before.status, to, { legCount: legs.length });
    if (!decision.allowed) {
      throw this.deny('run.lifecycle_transition', decision.reason, { runId: id, to });
    }

    const after = await this.repository.setRunStatus(id, to, new Date());
    if (!after) throw TransportDomainError.notFound('RUN_NOT_FOUND', 'Khong tim thay vong chay.');

    this.allow('run.lifecycle_transition', decision.reason, { runId: id, from: before.status, to });
    await this.audit.append({
      actor,
      action: 'transport.run.transition',
      entityType: 'TransportVehicleRun',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async cancelRun(id: string, reason: string, actor: string): Promise<VehicleRun> {
    const before = await this.requireRun(id);
    const decision = evaluateRunCancel(before.status);
    if (!decision.allowed) throw this.deny('run.cancel', decision.reason, { runId: id });

    const after = await this.repository.cancelRun(id, {
      cancelledAt: new Date(),
      cancellationReason: reason,
    });
    if (!after) throw TransportDomainError.notFound('RUN_NOT_FOUND', 'Khong tim thay vong chay.');

    this.allow('run.cancel', decision.reason, { runId: id });
    await this.audit.append({
      actor,
      action: 'transport.run.cancel',
      entityType: 'TransportVehicleRun',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  /* ------------------------------------------------------------------ *
   * CHANG
   * ------------------------------------------------------------------ */

  async addLeg(runId: string, command: AddLegCommand, actor: string): Promise<RunLeg> {
    const run = await this.requireRun(runId);
    if (run.status === 'COMPLETED' || run.status === 'CANCELLED') {
      throw this.deny('run.leg_change', 'LEG_RUN_TERMINAL', { runId, status: run.status });
    }

    const orderId = await this.resolveLegOrder(runId, command);

    const leg = await this.repository
      .createLeg({
        runId,
        sequence: command.sequence,
        kind: command.kind,
        orderId,
        originLabel: command.originLabel,
        destinationLabel: command.destinationLabel,
        businessDate: this.resolveBusinessDate(command.businessDate ?? run.businessDate),
        distanceKm: command.distanceKm ?? null,
        plannedDistanceKm: command.plannedDistanceKm ?? null,
        note: command.note ?? null,
      })
      .catch((error: unknown) => {
        /*
         * VONG CHAY DA DONG GIUA HAI BUOC. Phep kiem o dau ham doc truoc khi co khoa nao, nen no
         * khong nhin thay mot lan dong dang chay; kho — noi gianh cung khoa hang voi duong dong —
         * thi nhin thay. Dich ve DUNG ma ma phep kiem kia se tra: nguoi dung khong duoc nhan hai
         * cau tra loi khac nhau cho cung mot su that chi vi ho cham hon mot phan nghin giay.
         */
        if (error instanceof RunClosedForNewWorkError) {
          throw this.deny('run.leg_change', 'LEG_RUN_TERMINAL', {
            runId,
            status: error.status,
            by: 'ANOTHER_WRITER',
          });
        }
        throw this.legSequenceConflict(error, runId, command.sequence);
      });

    this.allow('run.leg_change', 'LEG_ADDED', { runId, sequence: leg.sequence, kind: leg.kind });
    await this.audit.append({
      actor,
      action: 'transport.run.leg.add',
      entityType: 'TransportRunLeg',
      entityId: leg.id,
      before: null,
      after: leg,
    });
    return leg;
  }

  /**
   * Duong DUY NHAT quyet dinh `orderId` cua mot chang.
   *
   * THU TU KIEM la mot phan hop dong: bat bien "chang rong khong mang don" duoc kiem TRUOC khi hoi
   * kho ve don. Neu doi thu tu, mot chang `EMPTY` gan mot `orderId` khong ton tai se bao
   * `LEG_ORDER_NOT_FOUND` -- dung ve ket qua, sai ve nguyen nhan, va nguoi doc di sua nham cho.
   */
  private async resolveLegOrder(runId: string, command: AddLegCommand): Promise<string | null> {
    const requested = command.orderId ?? null;

    if (command.kind === 'EMPTY') {
      if (requested !== null) {
        throw this.deny('run.leg_change', 'LEG_EMPTY_CANNOT_CARRY_ORDER', { runId });
      }
      return null;
    }

    if (requested === null) return null;

    const order = await this.repository.findOrder(requested);
    if (!order) {
      throw this.deny('run.leg_change', 'LEG_ORDER_NOT_FOUND', { runId, orderId: requested });
    }
    if (order.status === 'CANCELLED') {
      throw this.deny('run.leg_change', 'LEG_ORDER_CANCELLED', { runId, orderId: requested });
    }
    return order.id;
  }

  getLeg(id: string): Promise<RunLeg> {
    return this.requireLeg(id);
  }

  legsOfRun(runId: string): Promise<RunLeg[]> {
    return this.repository.listLegs(runId);
  }

  /** Vong chay GAN NHAT cua mot chiec xe — ke ca khi no da ket thuc (`#276` L3). */
  latestRunForVehicle(vehicleId: string): Promise<VehicleRun | null> {
    return this.repository.findLatestRunForVehicle(vehicleId);
  }

  /**
   * DOI TRANG THAI MOT CHANG — `#276` Lane L.
   *
   * Truoc lane nay `setLegStatus()` khong co nguoi goi nao: mot chang duoc tao ra roi nam mai o
   * `PLANNED`. Cai thieu do lam ca `#276` L4 khong the co — mot vong chay khong bao gio "het viec"
   * thi khong bao gio dong duoc, va "he thong tu dong" se chi la mot cau trong tai lieu.
   *
   * ============================================================================================
   * CHANG DAU LAN BANH THI VONG CHAY TU DONG SANG `ACTIVE`
   * ============================================================================================
   *
   * `#274` chot sep/ke toan lam viec voi DON. Bat ho bam "bat dau vong chay" truoc khi lai xe
   * chay chinh la thao tac quan ly vong chay ma ca phase nay di bo. Chang chuyen sang
   * `IN_TRANSIT` LA su that "vong chay nay dang chay" — nen he thong doc su that do thay vi hoi
   * lai nguoi dung.
   *
   * Buoc tu dong nay im lang khi that bai CO CHU DICH: neu vong chay vi ly do nao do khong sang
   * `ACTIVE` duoc, chang van duoc ghi la dang chay. Mot chang khong ghi duoc vi mot cot trang thai
   * o cap tren la kieu hong lam lai xe bo luon buoc ghi.
   *
   * ============================================================================================
   * CHANG CO HANG KHONG "XONG" TRAI HIEN TRUONG — `#332`
   * ============================================================================================
   *
   * `LOADED` -> `COMPLETED` hoi `options.fieldTruth` truoc: hien truong chua ghi nguoi nhan da nhan
   * hang thi tu choi (`LEG_FIELD_DELIVERY_NOT_RECORDED`), tru khi nguoi goi GHI DE tuong minh bang
   * `overrideReason` — khi do lan hoan tat mang hanh dong kiem toan rieng. Xem
   * `evaluateLegCompletionEvidence()`.
   */
  async transitionLeg(
    legId: string,
    to: RunLegStatus,
    actor: string,
    options: LegTransitionOptions = {},
  ): Promise<RunLeg> {
    const before = await this.requireLeg(legId);
    const run = await this.requireRun(before.runId);
    if (run.status === 'COMPLETED' || run.status === 'CANCELLED') {
      throw this.deny('run.leg_transition', 'LEG_RUN_TERMINAL', { legId, runId: run.id });
    }

    const decision = evaluateLegTransition(before.status, to);
    if (!decision.allowed) {
      throw this.deny('run.leg_transition', decision.reason, { legId, from: before.status, to });
    }

    /*
     * HIEN TRUONG CHAN CHANG CO HANG — `#332`. Chi hoi khi THAT SU can (`LOADED` -> `COMPLETED`):
     * moi lan hoi la mot lan doc kho moc, va chang rong/lan lan banh khong co gi de doi chieu.
     *
     * Nguon hong thi loi di THANG ra — that bai dong. Nuot no se bien "khong doc duoc hien truong"
     * thanh "hien truong khong phan doi", dung kieu hong ma `collectBlockers()` cua lan dong cam.
     */
    const needsFieldTruth = to === 'COMPLETED' && before.kind === 'LOADED';
    const field =
      needsFieldTruth && options.fieldTruth ? await options.fieldTruth.deliveryOf(legId) : null;
    const overrideReason = options.overrideReason ?? null;
    const evidence = evaluateLegCompletionEvidence({
      kind: before.kind,
      to,
      field,
      overrideReason,
    });
    if (!evidence.allowed) {
      throw this.deny('run.leg_transition', evidence.reason, {
        legId,
        kind: before.kind,
        to,
        fieldPhase: field?.phase ?? null,
      });
    }
    const fieldOverride =
      evidence.reason === 'LEG_COMPLETED_BY_OVERRIDE' && overrideReason !== null
        ? { reason: overrideReason, fieldPhase: field?.phase ?? null }
        : null;

    const at = new Date();
    const written = await this.repository.setLegStatus({ legId, from: before.status, to, at });
    if (!written) throw TransportDomainError.notFound('RUN_LEG_NOT_FOUND', 'Khong tim thay chang.');
    if (!written.applied) {
      throw this.staleLegWrite(
        'run.leg_transition',
        evaluateLegTransition(written.leg.status, to),
        { legId, from: before.status, to, current: written.leg.status },
      );
    }
    const after = written.leg;

    if (to === 'IN_TRANSIT' && run.status === 'PLANNED') {
      await this.repository.setRunStatus(run.id, 'ACTIVE', at);
      this.allow('run.lifecycle_transition', 'RUN_TRANSITION_APPLIED', {
        runId: run.id,
        from: 'PLANNED',
        to: 'ACTIVE',
        because: 'LEG_STARTED',
      });
    }

    this.allow('run.leg_transition', evidence.reason, {
      legId,
      from: before.status,
      to,
      ...(fieldOverride ? { fieldPhase: fieldOverride.fieldPhase } : {}),
    });
    /*
     * Mot lan dong TRAI hien truong co HANH DONG kiem toan rieng — ai, luc nao, VI SAO, va hien truong
     * dang o dau luc do. Cung khuon `cancelLeg`: ly do nam trong `after`, khong thanh mot cot moi.
     */
    await this.audit.append({
      actor,
      action: fieldOverride
        ? 'transport.run.leg.complete.override'
        : 'transport.run.leg.transition',
      entityType: 'TransportRunLeg',
      entityId: legId,
      before,
      after: fieldOverride ? { ...after, fieldOverride } : after,
    });
    return after;
  }

  /**
   * HUY mot chang CHUA CHAY. Duong rieng vi no doi mot ly do bang chu — cung quy uoc voi don va
   * vong chay, va cung ly do: mot lan go ke hoach khong giai trinh duoc la mot lo hong trong so.
   *
   * Ly do di vao DAU VET KIEM TOAN chu khong vao mot cot moi tren `TransportRunLeg`. Bang chang
   * khong co cot `cancellationReason`, va them mot cot chi de phuc vu duong nay se lam moi chang
   * cu mang mot o trong khong ai dien — trong khi `AuditLog` von la noi cau hoi "ai go, luc nao,
   * vi sao" duoc tra loi cho ca mien.
   */
  async cancelLeg(legId: string, reason: string, actor: string): Promise<RunLeg> {
    const before = await this.requireLeg(legId);
    const decision = evaluateLegCancel(before.status);
    if (!decision.allowed) {
      throw this.deny('run.leg_cancel', decision.reason, { legId, status: before.status });
    }

    const written = await this.repository.setLegStatus({
      legId,
      from: before.status,
      to: 'CANCELLED',
      at: new Date(),
    });
    if (!written) throw TransportDomainError.notFound('RUN_LEG_NOT_FOUND', 'Khong tim thay chang.');
    if (!written.applied) {
      throw this.staleLegWrite('run.leg_cancel', evaluateLegCancel(written.leg.status), {
        legId,
        from: before.status,
        current: written.leg.status,
      });
    }
    const after = written.leg;

    this.allow('run.leg_cancel', decision.reason, { legId, reason });
    await this.audit.append({
      actor,
      action: 'transport.run.leg.cancel',
      entityType: 'TransportRunLeg',
      entityId: legId,
      before,
      after: { ...after, cancellationReason: reason },
    });
    return after;
  }

  /**
   * DONG VONG CHAY DO HE THONG QUYET — `#276` L4.
   *
   * KHONG nhan `to` tu ben ngoai va khong co duong nao dat `COMPLETED` theo y nguoi goi: quyet
   * dinh dong da duoc mot ham thuan (`evaluateRunClosure`) chot truoc do, va ham nay chi thi hanh.
   * Do la ly do no khong nam trong `transitionRun()` — duong kia la duong THU CONG, con duong nay
   * la duong TU DONG, va tron hai lai se lam mot lan bam tay trong y het mot lan he thong quyet.
   */
  async closeRunAsSystem(
    runId: string,
    trigger: string,
    revalidate: SystemRunCloseRevalidation = async () => ({ close: true, trigger }),
  ): Promise<RunCloseAttempt> {
    const before = await this.requireRun(runId);

    /*
     * DA O DIEM CUOI — mot ket qua BINH THUONG, khong phai mot loi.
     *
     * Hai worker cung mot luot quet deu doc thay `ACTIVE` va deu quyet dinh duoc dong; den khi
     * vao toi day thi mot ban da thang. Neu cho nay NEM, ke thua cuoc se bien mot lan dong da
     * thanh cong thanh mot loi o tang tren — va `RunClosureService` se tra ve mot ngoai le cho
     * mot trang thai hoan toan dung. Do la ly do `RunCloseAttempt.transitioned` ton tai.
     *
     * Phan biet voi vong chay CHUA CHAY: mot vong chay `PLANNED` khong duoc phep dong, va do la
     * mot lan tu choi that — xem nhanh duoi.
     *
     * Phep kiem nay doc TRUOC khi co khoa nao, nen no la mot loi tat cho truong hop ro rang, khong
     * phai lop bao ve. Lop bao ve nam duoi, tren duong da khoa.
     */
    if (isTerminalRunStatus(before.status)) {
      this.allow('run.lifecycle_transition', 'RUN_ALREADY_TERMINAL', {
        runId,
        status: before.status,
        because: trigger,
        by: 'ANOTHER_WRITER',
      });
      return { run: before, transitioned: false };
    }

    const decision = evaluateSystemRunClose(before.status);
    if (!decision.allowed) {
      throw this.deny('run.lifecycle_transition', decision.reason, { runId, to: 'COMPLETED' });
    }

    /*
     * MOT DON VI CONG VIEC: khoa hang -> doc lai -> phan xu lai -> chuyen trang thai -> dat dau vet.
     *
     * Truoc `#293` R2 o day co hai khoang trong. Thu nhat: phan xu doc su that TRUOC khi khoa, nen
     * mot nguoi lap ke hoach chen duoc mot chang moi vao giua — va vong chay dong lai voi mot viec
     * chua lam. Thu hai: dau vet duoc ghi bang mot lan goi kho RIENG sau khi buoc chuyen da commit,
     * nen mot cu chet o giua de lai mot vong chay `COMPLETED` khong ai giai thich duoc.
     *
     * `revalidate` la cho nguoi goi phan xu LAI tren su that vua doc duoi khoa. Mac dinh la "dong
     * di" — giu nguyen hop dong cu cho nhung duong goi khong mang mot phan xu nao.
     */
    const settled = await this.repository.closeRunAsSystemSerialized({
      runId,
      at: new Date(),
      decide: (snapshot) => revalidate(snapshot),
      trace: (from, to) =>
        this.audit.entryFor({
          actor: SYSTEM_ACTOR,
          action: 'transport.run.close.system',
          entityType: 'TransportVehicleRun',
          entityId: runId,
          before: from,
          after: to,
        }),
    });
    if (!settled) throw TransportDomainError.notFound('RUN_NOT_FOUND', 'Khong tim thay vong chay.');

    if (!settled.verdict.close) {
      /*
       * PHAN XU LAI DA DOI Y. Su that doc duoi khoa khac su that doc truoc do — dung cai cua so ma
       * lane nay dong lai. Khong phai mot loi: nguoi goi da co ly do co ma cua rieng no, va no se
       * ghi ly do do vao so quyet dinh cua chinh no.
       */
      this.allow('run.lifecycle_transition', 'RUN_CLOSE_REVALIDATION_HELD', {
        runId,
        because: trigger,
      });
      return { run: settled.run, transitioned: false };
    }

    if (!settled.transitioned) {
      this.allow('run.lifecycle_transition', 'RUN_ALREADY_TERMINAL', {
        runId,
        because: trigger,
        by: 'ANOTHER_WRITER',
      });
      return { run: settled.run, transitioned: false };
    }

    this.allow('run.lifecycle_transition', decision.reason, {
      runId,
      from: before.status,
      to: 'COMPLETED',
      because: trigger,
    });
    return { run: settled.run, transitioned: true };
  }
  /* ------------------------------------------------------------------ *
   * PHAN CONG LAI XE -- LICH SU
   * ------------------------------------------------------------------ */

  async assignRun(runId: string, command: AssignRunCommand, actor: string): Promise<RunAssignment> {
    const run = await this.requireRun(runId);
    if (run.status === 'COMPLETED' || run.status === 'CANCELLED') {
      throw this.deny('run.assignment_change', 'RUN_ASSIGNMENT_RUN_TERMINAL', {
        runId,
        status: run.status,
      });
    }
    if (!(await this.fleet.findDriver(command.driverId))) {
      throw TransportDomainError.notFound('RUN_DRIVER_NOT_FOUND', 'Khong tim thay lai xe.');
    }

    const active = await this.repository.activeRunAssignment(runId);
    if (active && active.driverId === command.driverId) {
      this.allow('run.assignment_change', 'RUN_ASSIGNMENT_UNCHANGED', { runId });
      return active;
    }

    const change = await this.repository.assignRun(runId, {
      driverId: command.driverId,
      effectiveFrom: new Date(),
      assignedBy: actor,
    });

    this.allow(
      'run.assignment_change',
      change.previous ? 'RUN_ASSIGNMENT_REPLACED' : 'RUN_ASSIGNMENT_CREATED',
      { runId, driverId: command.driverId },
    );
    await this.audit.append({
      actor,
      action: 'transport.run.assign',
      entityType: 'TransportRunAssignment',
      entityId: change.current.id,
      before: change.previous,
      after: change.current,
    });
    return change.current;
  }

  runAssignmentHistory(runId: string): Promise<RunAssignment[]> {
    return this.repository.listRunAssignments(runId);
  }

  /* ------------------------------------------------------------------ *
   * TUONG THICH v1 -- PHEP CHIEU
   * ------------------------------------------------------------------ */

  /**
   * Chieu mot chuyen v1 sang mo hinh v2. TAT DINH va LAP LAI DUOC.
   *
   * Goi lai tren cung mot chuyen KHONG sinh ban thu hai: lien ket `(tripId)` la khoa chinh, nen
   * lan thu hai doc ra ban da co va tra `PROJECTION_UNCHANGED`.
   */
  /**
   * CHIEU THUONG MAI mot chuyen v1 -> NGHIA VU v2 -- `#275` K5.
   *
   * ==========================================================================================
   * VI SAO DUONG NAY TON TAI RIENG, KHONG NAM TRONG `projectTrip`
   * ==========================================================================================
   *
   * `projectTrip` dung mot `TransportVehicleRun`, va mot vong chay BAT BUOC co `vehicleId`. Nen no
   * tu choi chuyen thue nha xe ngoai -- dung, vi bia ra mot vong chay cho mot chiec xe khong phai
   * cua minh se lam km doi xe phong len.
   *
   * Nhung `#275` K5 dat cong doi soat len DON, va mot chuyen thue nha xe ngoai VAN co khach, VAN co
   * bien nhan giao hang phai nghiem thu. Neu duong duy nhat de mot chuyen co don la di qua vong
   * chay, thi nhung chuyen do vinh vien khong co chu the -- va cong hoac chan cung mot duong dang
   * chay, hoac phai mo mot duong vong. `#275` cam ca hai.
   *
   * Nen o day co hai phep chieu doc lap, moi cai voi dieu kien cua chinh no. Ca hai TAT DINH, ca
   * hai dung chung ma don `ORD-<ma chuyen>`, va lien ket la `tripId` khoa chinh -- nen goi lai
   * khong bao gio de ra ban thu hai, du goi qua duong nao.
   */
  async projectTripOrder(tripId: string, actor: string): Promise<TripOrderProjection> {
    const existing = await this.repository.findOrderLink(tripId);
    if (existing) {
      const order = await this.repository.findOrder(existing.orderId);
      if (order) {
        this.allow('order.trip_projection', 'ORDER_PROJECTION_UNCHANGED', { tripId });
        return { link: existing, order };
      }
    }

    if (!this.trips) {
      throw TransportDomainError.notFound(
        'PROJECTION_TRIP_NOT_FOUND',
        'Kho chuyen v1 khong duoc bat, khong chieu duoc.',
      );
    }
    const trip = await this.trips.find(tripId);
    if (!trip) {
      throw TransportDomainError.notFound('PROJECTION_TRIP_NOT_FOUND', 'Khong tim thay chuyen.');
    }

    const outcome = planOrderProjection(trip);
    if (!outcome.ok) throw this.deny('order.trip_projection', outcome.reason, { tripId });

    const projection = await this.repository.projectTripOrder({
      tripId,
      projectedBy: actor,
      order: outcome.order,
    });

    this.allow('order.trip_projection', 'ORDER_PROJECTION_CREATED', {
      tripId,
      orderId: projection.order.id,
    });
    // Don chieu tu chuyen v1 KHONG co toa do (#379) — nhat ky phai noi ra dieu do nhu voi moi don
    // moi, neu khong nguoi doc trace chi thay ORDER_LOCATION_ABSENT tu duong tao tay va tuong moi
    // don thieu diem deu la loi nhap. Chi o nhanh VUA TAO: nhanh `UNCHANGED` phia tren khong tao gi.
    this.recordOrderLocation(projection.order);
    await this.audit.append({
      actor,
      action: 'transport.order.project_trip',
      entityType: 'TransportTripOrderLink',
      entityId: tripId,
      before: null,
      after: projection.link,
    });
    return projection;
  }

  async projectTrip(tripId: string, actor: string): Promise<TripProjection> {
    const existing = await this.repository.findProjection(tripId);
    if (existing) {
      this.allow('run.trip_projection', 'PROJECTION_UNCHANGED', { tripId });
      return existing;
    }

    if (!this.trips) {
      throw TransportDomainError.notFound(
        'PROJECTION_TRIP_NOT_FOUND',
        'Kho chuyen v1 khong duoc bat, khong chieu duoc.',
      );
    }
    const trip = await this.trips.find(tripId);
    if (!trip) {
      throw TransportDomainError.notFound('PROJECTION_TRIP_NOT_FOUND', 'Khong tim thay chuyen.');
    }

    const outcome = planTripProjection(trip, await this.trips.listAssignments(tripId));
    if (!outcome.ok) throw this.deny('run.trip_projection', outcome.reason, { tripId });

    const projection = await this.repository.projectTrip({
      tripId,
      projectedBy: actor,
      ...outcome.plan,
    });

    this.allow('run.trip_projection', 'PROJECTION_CREATED', {
      tripId,
      runId: projection.run.id,
      legId: projection.leg.id,
    });
    // Phep chieu dieu hanh cung co the VUA TAO mot don (chuyen co khach) — cung ly do voi
    // `projectTripOrder`. Chuyen khong khach thi khong co don nao de ghi.
    if (projection.order !== null) this.recordOrderLocation(projection.order);
    await this.audit.append({
      actor,
      action: 'transport.run.project_trip',
      entityType: 'TransportTripRunLegLink',
      entityId: tripId,
      before: null,
      after: projection.link,
    });
    return projection;
  }

  findProjection(tripId: string): Promise<TripProjection | null> {
    return this.repository.findProjection(tripId);
  }

  /** NGHIA VU THUONG MAI cua mot chuyen v1 -- `null` khi chua chieu. Doc lap voi vong chay. */
  async findOrderProjection(tripId: string): Promise<TripOrderProjection | null> {
    const link = await this.repository.findOrderLink(tripId);
    if (!link) return null;
    const order = await this.repository.findOrder(link.orderId);
    return order ? { link, order } : null;
  }

  /* ------------------------------------------------------------------ *
   * Ho tro
   * ------------------------------------------------------------------ */

  private async requireOrder(id: string): Promise<Order> {
    const order = await this.repository.findOrder(id);
    if (!order) throw TransportDomainError.notFound('ORDER_NOT_FOUND', 'Khong tim thay nghia vu.');
    return order;
  }

  private async requireRun(id: string): Promise<VehicleRun> {
    const run = await this.repository.findRun(id);
    if (!run) throw TransportDomainError.notFound('RUN_NOT_FOUND', 'Khong tim thay vong chay.');
    return run;
  }

  private async requireLeg(id: string): Promise<RunLeg> {
    const leg = await this.repository.findLeg(id);
    if (!leg) throw TransportDomainError.notFound('RUN_LEG_NOT_FOUND', 'Khong tim thay chang.');
    return leg;
  }

  private async requireCustomer(customerId: string | null): Promise<void> {
    if (customerId === null) return;
    if (!(await this.fleet.findCustomer(customerId))) {
      throw TransportDomainError.notFound('ORDER_CUSTOMER_NOT_FOUND', 'Khong tim thay khach hang.');
    }
  }

  private checkMoney(amount: number | null): number | null {
    if (amount === null) return null;
    try {
      return nonNegativeMoney(amount).amount;
    } catch (error) {
      if (error instanceof MoneyError) {
        throw TransportDomainError.invalid('MOVEMENT_MONEY_INVALID', error.message);
      }
      throw error;
    }
  }

  private resolveBusinessDate(value: string | undefined): string {
    if (value === undefined) return toBusinessDate(new Date(), this.policy.timeZone);
    try {
      return assertBusinessDate(value);
    } catch (error) {
      throw TransportDomainError.invalid(
        'MOVEMENT_BUSINESS_DATE_INVALID',
        error instanceof Error ? error.message : 'Ngay nghiep vu khong hop le.',
      );
    }
  }

  /**
   * `@@unique([runId, sequence])` la thu duy nhat dung khi HAI nguoi cung them chang mot luc.
   * Doc no thanh mot ma xung dot co ten thay vi de loi Prisma tho lot len HTTP.
   */
  private legSequenceConflict(error: unknown, runId: string, sequence: number): unknown {
    if (error instanceof TransportDomainError) return error;
    const code = (error as { code?: string } | null)?.code;
    if (code === 'P2002') {
      return TransportDomainError.conflict(
        'RUN_LEG_SEQUENCE_TAKEN',
        `Vong chay ${runId} da co chang so ${sequence}.`,
      );
    }
    return error;
  }

  /**
   * CHANG DA DOI GIUA LAN DOC VA LAN KHOA — `#354`.
   *
   * Mot nguoi ghi khac (hoan tat, huy, bat dau chay) da lay khoa vong chay truoc. `decision` la phan
   * xu LAI tren ban doc DUOI khoa, va ma tra ve la dung ma ma duong tuan tu se tra — cung ly le voi
   * `addLeg`: nguoi dung khong duoc nhan hai cau tra loi khac nhau cho cung mot su that chi vi ho
   * cham hon mot phan nghin giay.
   *
   * Phan xu lai LUON tu choi: moi trang thai dich chi co DUNG MOT trang thai nguon (`LEG_EDGES`,
   * huy chi tu `PLANNED`), va lan ghi co dieu kien vua noi chang KHONG con o trang thai do. Nhanh
   * `allowed` duoi day vi the la bat kha — chi xay ra khi trang thai chang DI LUI, mot loi luu tru
   * chu khong phai mot yeu cau sai; no nem thay vi ghi theo mot phan xu da cu.
   */
  private staleLegWrite<Reason extends TransportMovementDecisionReason>(
    point: DecisionPoint,
    decision: TransitionDecision<Reason>,
    detail: Record<string, unknown>,
  ): TransportDomainError {
    if (decision.allowed) {
      throw new Error(`Chang ${String(detail.legId)} doi trang thai nguoc chieu may trang thai`);
    }
    return this.deny(point, decision.reason, { ...detail, by: 'ANOTHER_WRITER' });
  }

  /**
   * TOA DO DIEM LAY / DIEM GIAO (#379) -- nguong DUY NHAT la `parseGeoPoint`, khong dat nguong
   * thu hai o day hay o zod. Tra ve diem da chuan hoa (chi hai so, bo moi khoa la) de repository
   * khong bao gio ghi nguyen doi tuong cua nguoi goi.
   *
   * Vang mat (`undefined`/`null`) la hop le O TANG NAY: chi duong noi bo di toi day ma khong co
   * diem, vi bien HTTP bat buoc ca hai. Nhung vang mat thi ghi `null` -- KHONG BAO GIO doan tu nhan.
   */
  private parseOrderLocation(input: CreateOrderCommand): {
    readonly originPoint: GeoPoint | null;
    readonly destinationPoint: GeoPoint | null;
  } {
    return {
      originPoint: this.requireOrderPoint(input.originPoint, 'ORIGIN'),
      destinationPoint: this.requireOrderPoint(input.destinationPoint, 'DESTINATION'),
    };
  }

  private requireOrderPoint(
    point: GeoPoint | null | undefined,
    role: 'ORIGIN' | 'DESTINATION',
  ): GeoPoint | null {
    if (point === undefined || point === null) return null;
    const parsed = parseGeoPoint(point.latitude, point.longitude);
    if (parsed.ok) return parsed.point;

    const isOrigin = role === 'ORIGIN';
    // `detail` chi mang MA tu choi, khong mang toa do: vi tri lay/giao hang cua khach la du lieu
    // nghiep vu, va mot toa do hong van co the la mot dia chi that bi go lech.
    this.telemetry?.decision({
      vocabulary: TRANSPORT_MOVEMENT_DECISIONS,
      point: 'order.location',
      outcome: 'denied',
      reason: isOrigin ? 'ORDER_ORIGIN_POINT_REJECTED' : 'ORDER_DESTINATION_POINT_REJECTED',
      detail: { role, rejection: parsed.rejection },
    });
    throw TransportDomainError.invalid(
      isOrigin ? 'ORDER_ORIGIN_POINT_INVALID' : 'ORDER_DESTINATION_POINT_INVALID',
      `Toa do diem ${isOrigin ? 'lay' : 'giao'} hang khong hop le (${parsed.rejection}). ` +
        'Hay chon lai diem tren ban do.',
    );
  }

  /**
   * Ghi quyet dinh SAU khi don da luu, de `orderId` tro toi mot don co that. Co "ngoai vung hoat
   * dong" chi GAN CO (`isWithinRoadNetworkBoundingBox` khong tu choi) -- du de nguoi doc trace thay
   * mot diem chon nham sang nuoc khac ma khong phai dua toa do vao nhat ky.
   */
  private recordOrderLocation(order: Order): void {
    const hasOrigin = order.originPoint !== null;
    const hasDestination = order.destinationPoint !== null;
    this.allow(
      'order.location',
      hasOrigin && hasDestination ? 'ORDER_LOCATION_CAPTURED' : 'ORDER_LOCATION_ABSENT',
      {
        orderId: order.id,
        hasOriginPoint: hasOrigin,
        hasDestinationPoint: hasDestination,
        originOutsideOperatingArea:
          order.originPoint !== null && !isWithinRoadNetworkBoundingBox(order.originPoint),
        destinationOutsideOperatingArea:
          order.destinationPoint !== null &&
          !isWithinRoadNetworkBoundingBox(order.destinationPoint),
      },
    );
  }

  private allow(
    point: DecisionPoint,
    reason: TransportMovementDecisionReason,
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_MOVEMENT_DECISIONS,
      point,
      outcome: 'allowed',
      reason,
      detail,
    });
  }

  private deny(
    point: DecisionPoint,
    reason: TransportMovementDecisionReason,
    detail: Record<string, unknown>,
  ): TransportDomainError {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_MOVEMENT_DECISIONS,
      point,
      outcome: 'denied',
      reason,
      detail,
    });
    return TransportDomainError.denied(reason, TRANSPORT_MOVEMENT_DECISIONS.labels[reason]);
  }
}
