import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { toBusinessDate } from '../business-date.js';
import { FleetRepository } from '../fleet/fleet.repository.js';
import { isTerminalRunStatus } from '../movement/movement-lifecycle.js';
import { MovementService } from '../movement/movement.service.js';
import type { Order, RunLeg, VehicleRun } from '../movement/movement.types.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import {
  TRANSPORT_CLOCK,
  TRANSPORT_CORE_POLICY,
  type TransportCorePolicy,
} from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  TRANSPORT_PLANNING_DECISIONS,
  type TransportPlanningDecisionReason,
} from './planning-decisions.js';
import {
  DepotDirectoryHub,
  depotSourceOf,
  readDepots,
  type DepotDirectory,
  type DepotEntry,
  type DepotSource,
} from './depot-directory.js';
import {
  TRANSPORT_PLANNING_POLICY,
  resolveDepotFrom,
  usableDepot,
  type DepotResolution,
} from './planning-policy.js';
import {
  ORDER_RUN_PLAN_ACTIVE_ORDER,
  ORDER_RUN_PLAN_IDEMPOTENCY,
  ORDER_RUN_PLAN_ONE_PER_RUN,
  RunPlanRepository,
} from './planning.repository.js';
import type {
  OrderRunPlan,
  RunClosureBlocker,
  RunClosureCause,
  RunClosureVerdict,
  RunPlanProposal,
  TransportPlanningPolicy,
  VehicleRunProjection,
} from './planning.types.js';
import { evaluateRunClosure, type ClosureLegFacts } from './run-closure.js';
import {
  planOrderAssignment,
  planRunCode,
  type PlannedDistanceHint,
  type PlannerRunFacts,
} from './run-plan.js';

type DecisionPoint = (typeof TRANSPORT_PLANNING_DECISIONS)['points'][number];

export interface PlanOrderCommand {
  readonly vehicleId: string;
  readonly distanceHint?: PlannedDistanceHint;
}

export interface CommitPlanCommand extends PlanOrderCommand {
  /** Khoa chong lap do nguoi goi dat. Cung khoa = cung mot hieu qua nghiep vu. */
  readonly idempotencyKey: string;
}

export interface RunPlanCommitResult {
  readonly plan: OrderRunPlan;
  readonly run: VehicleRun;
  readonly legs: readonly RunLeg[];
  /** `true` khi lan goi nay chi doc lai ket qua cua mot lan truoc cung khoa. */
  readonly replayed: boolean;
}

export interface RunClosureOutcome {
  readonly runId: string;
  readonly verdict: RunClosureVerdict;
  /** `true` khi CHINH lan goi nay dong vong chay. Goi lai lan hai tra `false`. */
  readonly closed: boolean;
  readonly run: VehicleRun;
}

/**
 * SU THAT DI KEM mot lan phan xu — su that ma lop nay KHONG tu co.
 *
 * `blockers` den tu `RunClosureBlockerSource` (hang tren thung, phien cho nguoi nhan): chung khong
 * song trong `transport-core`, va day la duong duy nhat de chung di vao phan xu.
 *
 * `cause` la vi sao lan phan xu nay chay. No khong doi ket qua — no de nguoi doc so quyet dinh biet
 * duoc lan danh thuc nay den tu mot su kien chang, tu mot lan go ke hoach, hay tu mot luot quet.
 */
export interface RunClosureAttempt {
  readonly blockers?: readonly RunClosureBlocker[];
  readonly cause?: RunClosureCause;
  /**
   * HOI LAI nguon su that ben ngoai, TREN duong da khoa hang vong chay.
   *
   * `blockers` la anh chup truoc khi khoa — du de cat phan lon truong hop, khong du de ghi. Phep
   * hoi lai nay chay ben trong giao dich dong, nen no phai NGAN va CHI DOC.
   *
   * Vang mat thi `blockers` duoc dung lai cho lan phan xu thu hai. Do la hanh vi dung cho nhung
   * duong goi khong co nguon ngoai nao (`transport-core` chay mot minh), khong phai mot loi tat.
   */
  readonly recheckBlockers?: () => Promise<readonly RunClosureBlocker[]>;
  /**
   * DANH BA BAI XE da doc san cho thao tac nay (`#395`). Luot quet doc MOT lan roi truyen cho moi
   * ung vien; vang mat thi `settleRunClosure()` tu doc — van MOT lan, truoc khoa hang vong chay.
   */
  readonly depots?: readonly DepotEntry[];
}

/**
 * LAP KE HOACH VONG CHAY DO HE THONG QUAN — #276 (Lane L).
 *
 * ============================================================================================
 * DICH VU NAY GHI QUA `MovementService`, KHONG QUA `MovementRepository`
 * ============================================================================================
 *
 * Cung ly le da ghi o `SiteIntakeService`: di qua dich vu thi duoc may trang thai, dau vet kiem
 * toan va quy uoc ngay nghiep vu; ghi thang vao kho thi bo qua ca ba. `RunPlanRepository` la kho
 * DUY NHAT ma lop nay so huu, va no chi giu lich su lap ke hoach.
 *
 * ============================================================================================
 * BON DUONG, VA CHI MOT DUONG DOC
 * ============================================================================================
 *
 *   `preview()`          DOC. Khong mot hang nao duoc ghi — `#276` L7 doi *"The preview must be
 *                        side-effect free."* Lane M goi duong nay bao nhieu lan cung duoc.
 *   `commit()`           GHI. Chi chay khi co mot khoa chong lap va mot chiec xe do NGUOI chon.
 *   `cancelPlan()`       GHI. Go mot ke hoach chua chay, giai phong don cho lan lap moi.
 *   `settleRunClosure()` GHI, nhung khong nhan mot y muon nao — no thi hanh mot phan xu tat dinh.
 *
 * ============================================================================================
 * KHONG MOT DONG NAO O DAY DUNG TOI `TransportOrder.status`
 * ============================================================================================
 *
 * Dong mot vong chay khong hoan thanh mot nghia vu thuong mai, va nguoc lai. `#274` chot do la
 * quyet dinh CUA NGUOI, thuoc Lane K. Neu mot ngay lop nay goi `transitionOrder()`, hai truc da
 * bi tron lai va cong ke toan da bi di vong.
 */
@Injectable()
export class PlanningService {
  constructor(
    private readonly movement: MovementService,
    private readonly plans: RunPlanRepository,
    private readonly fleet: FleetRepository,
    private readonly audit: AuditLogService,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Inject(TRANSPORT_PLANNING_POLICY) private readonly policy: TransportPlanningPolicy,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
    /*
     * DANH BA BAI XE (`#395`) — cuoi va tuy chon: 13 spec dung dich vu nay theo vi tri. Vang mat thi
     * doc cau hinh goi khach, dung nhu truoc #395. Trong ung dung that day la `DepotDirectoryHub`
     * cua `transport-core`, noi `transport-proof` dang ky bai xe duoc quan ly.
     */
    @Optional() @Inject(DepotDirectoryHub) private readonly depots?: DepotDirectory,
  ) {}

  /* ------------------------------------------------------------------ *
   * DOC — khong ghi mot hang nao
   * ------------------------------------------------------------------ */

  /**
   * Chinh sach dang ap dung. Be mat CHAN DOAN — `#276` L1: khong phai mot nut cho lai xe.
   *
   * `depot.source` (`#395`) noi bai xe den tu dau: `MANAGED` = man "Dia diem van hanh",
   * `TENANT_CONFIG` = cau hinh goi khach. Bat dong bo vi danh ba bai xe la mot lan doc kho.
   */
  async describePolicy(): Promise<{
    readonly grouping: TransportPlanningPolicy['grouping'];
    readonly depot: DepotResolution & { readonly source: DepotSource };
    readonly closure: TransportPlanningPolicy['closure'];
  }> {
    const depots = await this.depotList();
    return {
      grouping: this.policy.grouping,
      depot: { ...resolveDepotFrom(depots), source: depotSourceOf(depots) },
      closure: this.policy.closure,
    };
  }

  async preview(orderId: string, command: PlanOrderCommand): Promise<RunPlanProposal> {
    const order = await this.requirePlannableOrder(orderId);
    await this.requireVehicle(command.vehicleId);

    const decision = await this.buildProposal(order, command);
    this.decide(
      'planning.preview',
      'allowed',
      decision.proposal.outcome === 'NEW_RUN' ? 'PLAN_PREVIEW_NEW_RUN' : 'PLAN_PREVIEW_APPEND',
      {
        orderId,
        vehicleId: command.vehicleId,
        grouping: decision.proposal.grouping,
        emptyLegRequired: decision.proposal.emptyLegRequired,
        startSource: decision.proposal.startSource,
      },
    );
    return decision.proposal;
  }

  plansOfOrder(orderId: string): Promise<OrderRunPlan[]> {
    return this.plans.listForOrder(orderId);
  }

  activePlanOfOrder(orderId: string): Promise<OrderRunPlan | null> {
    return this.plans.findActiveForOrder(orderId);
  }

  /**
   * XE NAY SE KET THUC O DAU — nguon cho Lane M (`#276` L7).
   *
   * Doc, khong ghi, va khong xep hang ung vien: xep hang la viec cua Lane M. Lop nay chi tra ve
   * mot su that cua ke hoach hien tai.
   */
  async projectVehicle(vehicleId: string): Promise<VehicleRunProjection> {
    await this.requireVehicle(vehicleId);
    const run = await this.movement.latestRunForVehicle(vehicleId);
    const depot = usableDepot(resolveDepotFrom(await this.depotList()));

    if (run === null || isTerminalRunStatus(run.status)) {
      return {
        vehicleId,
        runId: run?.id ?? null,
        runCode: run?.code ?? null,
        runStatus: run?.status ?? null,
        endpointLabel: depot?.label ?? null,
        endpointSource: depot === null ? 'UNKNOWN' : 'DEPOT',
        // Vong chay da dong: xe ranh tu luc do. Chua co vong chay nao: ranh tu bao gio thi khong
        // ai biet, va `null` noi dung dieu do.
        freeFrom: run?.completedAt ?? null,
        openLegCount: 0,
      };
    }

    const legs = await this.movement.legsOfRun(run.id);
    const open = legs.filter((leg) => leg.status === 'PLANNED' || leg.status === 'IN_TRANSIT');

    if (open.length > 0) {
      const last = open.reduce((best, leg) => (leg.sequence > best.sequence ? leg : best));
      return {
        vehicleId,
        runId: run.id,
        runCode: run.code,
        runStatus: run.status,
        endpointLabel: last.destinationLabel,
        endpointSource: 'PLANNED_LEG_DESTINATION',
        // Con viec dang chay: gio ranh doi mot phep tinh duong di ma lane nay khong co nguon.
        freeFrom: null,
        openLegCount: open.length,
      };
    }

    const completed = legs.filter((leg) => leg.status === 'COMPLETED');
    if (completed.length === 0) {
      return {
        vehicleId,
        runId: run.id,
        runCode: run.code,
        runStatus: run.status,
        endpointLabel: depot?.label ?? null,
        endpointSource: depot === null ? 'UNKNOWN' : 'DEPOT',
        freeFrom: null,
        openLegCount: 0,
      };
    }

    // `completedAt` truoc, roi `sequence` de PHA HOA — cung quy tac voi `lastCompleted()` cua
    // `run-closure.ts`, va cung ly do: hai chang dong trong cung mot mili giay khong duoc de thu
    // tu doc cua kho quyet dinh xe dang o dau.
    const last = completed.reduce((best, leg) => {
      const at = leg.completedAt ?? '';
      const bestAt = best.completedAt ?? '';
      return at > bestAt || (at === bestAt && leg.sequence > best.sequence) ? leg : best;
    });
    return {
      vehicleId,
      runId: run.id,
      runCode: run.code,
      runStatus: run.status,
      endpointLabel: last.destinationLabel,
      endpointSource: 'COMPLETED_LEG_DESTINATION',
      freeFrom: last.completedAt,
      openLegCount: 0,
    };
  }

  /**
   * Phan xu dong vong chay, KHONG thi hanh. Be mat chan doan cua bang dieu hanh.
   *
   * `additionalBlockers` la su that den tu BEN NGOAI `transport-core` (hang tren thung, phien cho
   * nguoi nhan). Nguon cua chung la `RunClosureBlockerSource`, va nguoi goi chuan la
   * `RunClosureService` — xem `run-closure-blocker.source.ts`.
   */
  async inspectClosure(
    runId: string,
    blockers: readonly RunClosureBlocker[] = [],
  ): Promise<RunClosureVerdict> {
    const detail = await this.movement.getRun(runId);
    const depots = await this.depotList();
    return evaluateRunClosure(await this.closureFacts(detail.run, detail.legs, blockers, depots));
  }

  /* ------------------------------------------------------------------ *
   * GHI
   * ------------------------------------------------------------------ */

  async commit(
    orderId: string,
    command: CommitPlanCommand,
    actor: string,
  ): Promise<RunPlanCommitResult> {
    // GUI LAI TRUOC MOI PHEP KIEM KHAC — cung ly le voi `SiteIntakeService.confirm()`. Mot lenh
    // da thanh cong roi mat song tren duong ve phai tra dung ket qua cu, ke ca khi chinh no da
    // lam moi phep kiem ben duoi thanh "khong con dung nua" (don BAY GIO da co ke hoach).
    const replayed = await this.plans.findByIdempotencyKey(command.idempotencyKey);
    if (replayed) return await this.replay(replayed);

    const order = await this.requirePlannableOrder(orderId);
    await this.requireVehicle(command.vehicleId);

    /*
     * AI SE CAM VO LANG — hoi TRUOC khi ghi bat cu thu gi.
     *
     * Vi tri cua dong nay la mot lua chon, khong phai thoi quen. Neu hoi sau khi `resolveTargetRun()`
     * da mo vong chay thi mot chiec xe chua co lai xe se de lai dung cai da phai di lan mot buoi:
     * mot vong chay CO THAT, hien tren Bang dieu hanh, nhung `listOpenRunsForDriver()` khong tra no
     * ve cho ai — khong ai mo duoc chang cua no, va man hinh van bao "Da giao don" mot cach sai su
     * that. Tu choi o day thi chua co hang nao duoc ghi, nen khong co gi phai don.
     *
     * "Co mot `driverId`" CHUA du. Man Hien truong khong tim nguoi bang `driverId` ma bang PHIEN
     * dang nhap, nen nguoi cam xe con phai ton tai, con hoat dong, va co tai khoan — xem
     * `requireFieldReachableDriver()`. Ca hai phep hoi nam SAU phep doc lai khoa chong lap o dau
     * ham: mot lan gui lai van nhan dung ket qua cu, ke ca khi lai xe da bi khoa tu do toi nay.
     *
     * Day moi la nguoi cam CHIEC XE. Neu don duoc noi vao mot vong chay DA CO nguoi cam, nguoi do
     * phai trung voi nguoi nay — `joinOpenRun()` doi chieu, cung truoc chang dau tien.
     */
    const driverId = await this.requireFieldReachableDriver(
      await this.requireVehicleDriver(command.vehicleId, orderId),
      { orderId, vehicleId: command.vehicleId },
    );

    const active = await this.plans.findActiveForOrder(orderId);
    if (active) throw this.conflict('planning.commit', 'PLAN_ORDER_ALREADY_PLANNED', { orderId });

    const { proposal } = await this.buildProposal(order, command);
    const businessDate = toBusinessDate(this.now(), this.corePolicy.timeZone);

    const run = await this.resolveTargetRun(proposal, command, businessDate, driverId, actor);
    if (run === null) {
      // Ban kia da chiem ma vong chay nhung chua ghi xong ke hoach. Doan la sai, nen noi that.
      throw this.conflict('planning.commit', 'PLAN_COMMIT_IN_FLIGHT', {
        orderId,
        idempotencyKey: command.idempotencyKey,
      });
    }

    const created: RunLeg[] = [];
    for (const planned of proposal.legs) {
      created.push(
        await this.movement.addLeg(
          run.id,
          {
            sequence: planned.sequence,
            kind: planned.kind,
            orderId: planned.orderId,
            originLabel: planned.originLabel,
            destinationLabel: planned.destinationLabel,
            businessDate,
            distanceKm: null,
            plannedDistanceKm: planned.plannedDistanceKm,
            note: null,
          },
          actor,
        ),
      );
    }

    const loadedLeg = created.find((leg) => leg.kind === 'LOADED');
    const emptyLeg = created.find((leg) => leg.kind === 'EMPTY') ?? null;
    if (!loadedLeg) {
      // Khong the xay ra: `planOrderAssignment()` luon sinh dung mot chang co hang. Neu no xay ra
      // thi mot thay doi o bo lap ke hoach da pha hop dong, va im lang o day se de lai mot vong
      // chay khong mang don nao.
      throw TransportDomainError.invalid(
        'PLAN_LOADED_LEG_MISSING',
        'Ke hoach khong sinh ra chang co hang nao.',
      );
    }

    // Vong chay MOI chua co su that rieng ve nguoi cam: lay cua doi xe. Vong chay DA CO thi
    // `joinOpenRun()` da chot nguoi cam no — va da tu choi neu lech — truoc khi noi chang nao.
    if (proposal.outcome === 'NEW_RUN') await this.movement.assignRun(run.id, { driverId }, actor);

    const plan = await this.plans
      .create({
        orderId,
        runId: run.id,
        vehicleId: command.vehicleId,
        loadedLegId: loadedLeg.id,
        emptyLegId: emptyLeg?.id ?? null,
        grouping: proposal.grouping,
        outcome: proposal.outcome,
        idempotencyKey: command.idempotencyKey,
        plannedBy: actor,
        businessDate,
      })
      .catch(async (error: unknown) => {
        // HAI YEU CAU SONG SONG. Phep doc o tren khong thay ban kia vi no chua commit; unique cua
        // kho thi thay. Dich tung ten index ra dung mot ma nghiep vu thay vi de `P2002` tho di len.
        if (isUniqueViolationOn(error, ORDER_RUN_PLAN_IDEMPOTENCY)) {
          const already = await this.plans.findByIdempotencyKey(command.idempotencyKey);
          if (already) return already;
        }
        if (isUniqueViolationOn(error, ORDER_RUN_PLAN_ACTIVE_ORDER)) {
          throw this.conflict('planning.commit', 'PLAN_ORDER_ALREADY_PLANNED', { orderId });
        }
        if (isUniqueViolationOn(error, ORDER_RUN_PLAN_ONE_PER_RUN)) {
          throw this.conflict('planning.commit', 'PLAN_COMMIT_IN_FLIGHT', { orderId });
        }
        throw error;
      });

    this.decide(
      'planning.commit',
      'allowed',
      proposal.outcome === 'NEW_RUN' ? 'PLAN_COMMITTED_NEW_RUN' : 'PLAN_COMMITTED_APPENDED',
      {
        orderId,
        runId: run.id,
        vehicleId: command.vehicleId,
        grouping: proposal.grouping,
        emptyLegId: emptyLeg?.id ?? null,
        loadedLegId: loadedLeg.id,
      },
    );
    await this.audit.append({
      actor,
      action: 'transport.planning.commit',
      entityType: 'TransportOrderRunPlan',
      entityId: plan.id,
      before: null,
      after: plan,
    });

    return { plan, run, legs: created, replayed: false };
  }

  /**
   * GO MOT KE HOACH CHUA CHAY — `#276` L9 bai 5 (*"future planned leg can be replanned with
   * audit where allowed"*).
   *
   * Huy ke hoach keo theo huy CAC CHANG CHUA CHAY cua chinh no, va chi the: chang da lan banh
   * hoac da xong o lai nguyen ven. Do la ranh gioi giua "doi ke hoach" va "viet lai lich su".
   */
  async cancelPlan(planId: string, reason: string, actor: string): Promise<OrderRunPlan> {
    const before = await this.plans.find(planId);
    if (!before) {
      throw TransportDomainError.notFound('PLAN_NOT_FOUND', 'Khong tim thay ke hoach.');
    }
    if (before.cancelledAt !== null) {
      throw this.deny('planning.cancel', 'PLAN_CANCEL_ALREADY_CANCELLED', { planId });
    }

    const loaded = await this.movement.getLeg(before.loadedLegId);
    if (loaded.status === 'COMPLETED') {
      throw this.deny('planning.cancel', 'PLAN_CANCEL_LEG_COMPLETED', {
        planId,
        legId: loaded.id,
      });
    }

    for (const legId of [before.emptyLegId, before.loadedLegId]) {
      if (legId === null) continue;
      const leg = await this.movement.getLeg(legId);
      if (leg.status !== 'PLANNED') continue;
      await this.movement.cancelLeg(legId, reason, actor);
    }

    const after = await this.plans.cancel(planId, {
      cancelledAt: this.now(),
      cancellationReason: reason,
    });
    if (!after) throw TransportDomainError.notFound('PLAN_NOT_FOUND', 'Khong tim thay ke hoach.');

    this.decide('planning.cancel', 'allowed', 'PLAN_CANCELLED', { planId, runId: before.runId });
    await this.audit.append({
      actor,
      action: 'transport.planning.cancel',
      entityType: 'TransportOrderRunPlan',
      entityId: planId,
      before,
      after,
    });
    return after;
  }

  /**
   * DONG VONG CHAY NEU DU DIEU KIEN — TAT DINH, va khong nhan mot y muon nao.
   *
   * Goi duoc bao nhieu lan cung duoc: lan thu hai thay vong chay da o diem cuoi va tra
   * `closed: false` kem ly do, khong nem.
   *
   * ==========================================================================================
   * PHAN XU HAI LAN, VA LAN THU HAI LA LAN CO GIA TRI
   * ==========================================================================================
   *
   * Lan thu nhat chay TRUOC khi co khoa nao. No tra loi cau hoi re nhat — *"co dang de mo mot
   * giao dich khong"* — va no cat phan lon cong viec: vong chay da dong, con chang mo, chua ve bai.
   *
   * Lan thu hai chay BEN TRONG `closeRunAsSystemSerialized()`, tren su that doc duoi khoa hang. Do
   * la lan duy nhat cau tra loi con dung o thoi diem ghi: tu khi khoa duoc giu den khi `COMMIT`,
   * khong mot nguoi lap ke hoach nao them duoc mot chang moi vao vong chay nay.
   *
   * Neu bo lan thu hai, cua so giua *"doc thay dong duoc"* va *"ghi trang thai"* van con — va
   * `#293` R2 goi ten dung no: *"a concurrent planner must not be able to create/activate future
   * work after the decision snapshot but before terminalization."*
   */
  async settleRunClosure(
    runId: string,
    attempt: RunClosureAttempt = {},
  ): Promise<RunClosureOutcome> {
    const detail = await this.movement.getRun(runId);
    // Danh ba bai xe doc TRUOC khoa hang vong chay va dung cho CA HAI lan phan xu: khoa cua vong
    // chay khong khoa hang rao nao, nen doc lai ben trong chi ton mot ket noi thu hai luc giu khoa.
    const depots = attempt.depots ?? (await this.depotList());
    const verdict = evaluateRunClosure(
      await this.closureFacts(detail.run, detail.legs, attempt.blockers ?? [], depots),
    );
    // `cause` di vao MOI nhanh cua so quyet dinh, ke ca nhanh khong dong duoc: cau hoi "vi sao lan
    // phan xu nay chay" phai tra loi duoc ke ca khi cau tra loi la "chua den luc".
    const detailOf = (extra: Record<string, unknown>): Record<string, unknown> => ({
      runId,
      ...(attempt.cause === undefined ? {} : { cause: attempt.cause }),
      ...extra,
    });

    if (isTerminalRunStatus(detail.run.status)) {
      this.decide(
        'planning.run_closure',
        'allowed',
        'RUN_CLOSURE_ALREADY_TERMINAL',
        detailOf({ status: detail.run.status }),
      );
      return { runId, verdict, closed: false, run: detail.run };
    }

    if (!verdict.closable) {
      this.decide(
        'planning.run_closure',
        verdict.holding ? 'allowed' : 'denied',
        verdict.holding ? 'RUN_CLOSURE_HOLDING' : 'RUN_CLOSURE_BLOCKED',
        detailOf({ blockers: verdict.blockers }),
      );
      return { runId, verdict, closed: false, run: detail.run };
    }

    /*
     * PHAN XU LAI DUOI KHOA. `sealed` la ket qua CO GIA TRI — moi nhanh ben duoi doc no, khong doc
     * `verdict` cua lan doc dau. Hai ban se lech nhau dung khi mot nguoi lap ke hoach vua chen viec
     * moi vao, va do la truong hop bo test dong thoi ton tai de bat.
     */
    let sealed = verdict;
    const outcome = await this.movement.closeRunAsSystem(
      runId,
      verdict.trigger ?? 'DEPOT_RETURN',
      async (snapshot) => {
        sealed = evaluateRunClosure(
          await this.closureFacts(
            snapshot.run,
            snapshot.legs,
            (await attempt.recheckBlockers?.()) ?? attempt.blockers ?? [],
            depots,
          ),
        );
        return sealed.closable
          ? { close: true, trigger: sealed.trigger ?? 'DEPOT_RETURN' }
          : { close: false };
      },
    );

    if (!sealed.closable) {
      this.decide(
        'planning.run_closure',
        sealed.holding ? 'allowed' : 'denied',
        sealed.holding ? 'RUN_CLOSURE_HOLDING' : 'RUN_CLOSURE_BLOCKED',
        // `revalidated` phan biet mot lan giu lai o cong THU HAI voi mot lan giu lai o cong thu
        // nhat. Hai cai giong het nhau khi doc ket qua, va khac han nhau khi doc nguyen nhan: cai
        // nay nghia la mot ai do vua ghi vao vong chay trong luc no dang duoc phan xu.
        detailOf({ blockers: sealed.blockers, revalidated: true }),
      );
      return { runId, verdict: sealed, closed: false, run: outcome.run };
    }

    /*
     * KHONG PHAI MOI LAN `closable` LA MOI LAN DONG DUOC.
     *
     * Hai worker cung mot luot quet deu thay "dong duoc"; chi mot ban ghi duoc trang thai (khoa
     * hang xep hang ho, va ban den sau doc thay `COMPLETED`). Ban thua cuoc khong duoc ghi them mot
     * dong `RUN_CLOSED_ON_*` — neu ghi, so quyet dinh se co hai lan dong cho mot vong chay, va do
     * dung la thu ma `#293` R3 cam: *"no duplicated close under concurrent workers."*
     */
    if (!outcome.transitioned) {
      this.decide(
        'planning.run_closure',
        'allowed',
        'RUN_CLOSURE_ALREADY_TERMINAL',
        detailOf({ status: outcome.run.status, by: 'ANOTHER_WRITER' }),
      );
      return { runId, verdict: sealed, closed: false, run: outcome.run };
    }

    const trigger = sealed.trigger ?? 'DEPOT_RETURN';
    this.decide(
      'planning.run_closure',
      'allowed',
      trigger === 'DEPOT_RETURN' ? 'RUN_CLOSED_ON_DEPOT_RETURN' : 'RUN_CLOSED_ON_IDLE_TIMEOUT',
      detailOf({ trigger }),
    );
    return { runId, verdict: sealed, closed: true, run: outcome.run };
  }

  /* ------------------------------------------------------------------ *
   * Noi bo
   * ------------------------------------------------------------------ */

  private async buildProposal(order: Order, command: PlanOrderCommand) {
    // MOT lan doc danh ba cho mot de xuat — truoc moi lan ghi, truoc moi khoa.
    const depots = await this.depotList();
    const depotResolution = resolveDepotFrom(depots);
    this.decide(
      'planning.depot',
      depotResolution.kind === 'AMBIGUOUS' ? 'denied' : 'allowed',
      depotResolution.kind === 'RESOLVED'
        ? 'DEPOT_RESOLVED'
        : depotResolution.kind === 'NOT_CONFIGURED'
          ? 'DEPOT_NOT_CONFIGURED'
          : 'DEPOT_AMBIGUOUS',
      {
        // Ba ly do giu nguyen; NGUON va MA bai di trong `detail` de trace noi bai nao, tu dau.
        source: depotSourceOf(depots),
        code: depotResolution.kind === 'RESOLVED' ? depotResolution.depot.code : null,
        ...(depotResolution.kind === 'AMBIGUOUS' ? { codes: depotResolution.codes } : {}),
      },
    );

    const latest = await this.latestRunFacts(command.vehicleId);
    const decision = planOrderAssignment({
      order: {
        id: order.id,
        code: order.code,
        originLabel: order.originLabel,
        destinationLabel: order.destinationLabel,
      },
      vehicleId: command.vehicleId,
      grouping: this.policy.grouping,
      depot: usableDepot(depotResolution),
      latestRun: latest,
      ...(command.distanceHint === undefined ? {} : { distanceHint: command.distanceHint }),
    });

    this.decide('planning.grouping', 'allowed', decision.groupingReason, {
      orderId: order.id,
      vehicleId: command.vehicleId,
      grouping: this.policy.grouping,
      latestRunId: latest?.id ?? null,
    });
    return decision;
  }

  private async latestRunFacts(vehicleId: string): Promise<PlannerRunFacts | null> {
    const run = await this.movement.latestRunForVehicle(vehicleId);
    if (run === null) return null;
    const legs = await this.movement.legsOfRun(run.id);
    return {
      id: run.id,
      code: run.code,
      status: run.status,
      legs: legs.map((leg) => ({
        sequence: leg.sequence,
        kind: leg.kind,
        status: leg.status,
        destinationLabel: leg.destinationLabel,
      })),
    };
  }

  /**
   * Vong chay dich cua lan chot nay — tao moi, hoac dung lai cai dang chay.
   *
   * `null` nghia la MOT BAN SONG SONG da chiem ma vong chay tat dinh nhung chua ghi xong ke hoach.
   * Xem khoi chu thich cua `planRunCode()`.
   */
  private async resolveTargetRun(
    proposal: RunPlanProposal,
    command: CommitPlanCommand,
    businessDate: string,
    vehicleDriverId: string,
    actor: string,
  ): Promise<VehicleRun | null> {
    if (proposal.runId !== null) {
      return await this.joinOpenRun(
        proposal.runId,
        vehicleDriverId,
        { orderId: proposal.orderId, vehicleId: command.vehicleId },
        actor,
      );
    }

    const code = planRunCode(businessDate, this.planDigest(command));
    try {
      return await this.movement.createRun(
        { code, vehicleId: command.vehicleId, businessDate, note: null },
        actor,
      );
    } catch (error) {
      if (!(error instanceof TransportDomainError) || error.reason !== 'RUN_CODE_TAKEN')
        throw error;
      return null;
    }
  }

  /** Bam TAT DINH tu `(vehicleId, idempotencyKey)` — cung mau voi `runCodeFor()` cua site-intake. */
  private planDigest(command: CommitPlanCommand): string {
    return (
      createHash('sha256')
        // DAI TRUOC, ROI NOI DUNG: noi hai chuoi bang mot dau phan cach bat ky van nhap nhang khi
        // chinh chuoi chua dau do; tien to do dai thi khong.
        .update(`${command.vehicleId.length}:${command.vehicleId}:${command.idempotencyKey}`)
        .digest('hex')
    );
  }

  private async replay(plan: OrderRunPlan): Promise<RunPlanCommitResult> {
    const detail = await this.movement.getRun(plan.runId);
    const legs = detail.legs.filter(
      (leg) => leg.id === plan.loadedLegId || leg.id === plan.emptyLegId,
    );
    this.decide('planning.commit', 'allowed', 'PLAN_COMMIT_REPLAYED', {
      planId: plan.id,
      runId: plan.runId,
      orderId: plan.orderId,
    });
    return { plan, run: detail.run, legs, replayed: true };
  }

  private async closureFacts(
    run: VehicleRun,
    legs: readonly RunLeg[],
    additionalBlockers: readonly RunClosureBlocker[],
    depots: readonly DepotEntry[],
  ) {
    const open = await this.plans.listActiveForRun(run.id);
    const openPlanCount = open.filter((plan) => {
      const leg = legs.find((entry) => entry.id === plan.loadedLegId);
      // Chang khong nam trong vong chay nay (khong the xay ra) hoac chua ket thuc: con mo.
      return leg === undefined || (leg.status !== 'COMPLETED' && leg.status !== 'CANCELLED');
    }).length;

    const closureLegs: ClosureLegFacts[] = legs.map((leg) => ({
      id: leg.id,
      sequence: leg.sequence,
      status: leg.status,
      destinationLabel: leg.destinationLabel,
      completedAt: leg.completedAt,
    }));

    return {
      runStatus: run.status,
      legs: closureLegs,
      openPlanCount,
      depot: usableDepot(resolveDepotFrom(depots)),
      policy: this.policy.closure,
      now: this.now(),
      ...(additionalBlockers.length === 0 ? {} : { additionalBlockers }),
    };
  }

  /** Danh ba bai xe cho MOT thao tac — xem `readDepots()`. */
  private depotList(): Promise<readonly DepotEntry[]> {
    return readDepots(this.depots, this.policy);
  }

  private async requirePlannableOrder(orderId: string): Promise<Order> {
    const order = await this.movement.getOrder(orderId);
    if (order.status === 'CANCELLED') {
      throw this.deny('planning.commit', 'PLAN_ORDER_CANCELLED', { orderId });
    }
    if (order.status === 'FULFILLED') {
      throw this.deny('planning.commit', 'PLAN_ORDER_FULFILLED', { orderId });
    }
    return order;
  }

  private async requireVehicle(vehicleId: string): Promise<void> {
    if (!(await this.fleet.findVehicle(vehicleId))) {
      throw TransportDomainError.notFound('RUN_VEHICLE_NOT_FOUND', 'Khong tim thay xe.');
    }
  }

  /**
   * LAI XE dang phu trach chiec xe duoc chon — DUNG MOT nguoi, khong thi tu choi.
   *
   * KHONG co duong "giao xe truoc, gan lai xe sau" o day, va do la co y. Khi doi xe DA biet ai dang
   * cam chiec xe nay thi bat nguoi dieu hanh khai lai mot lan nua chi tao them mot cho de sai; con
   * neu doi xe KHONG biet, thi cai thieu la du lieu nen — va mo mot vong chay len tren du lieu nen
   * thieu chi doi cho hong sang mot man hinh khac.
   *
   * Hai duong tu choi, hai ma rieng: mot cong nghiep vu co N duong tu choi phai phan biet duoc N
   * ly do. "Chua gan ai" va "dang gan nhieu nguoi" doi hai hanh dong sua khac han nhau.
   */
  private async requireVehicleDriver(vehicleId: string, orderId: string): Promise<string> {
    const active = await this.fleet.activeDriverAssignmentsForVehicle(vehicleId);

    const [first] = active;
    if (first === undefined) {
      throw this.conflict('planning.commit', 'PLAN_VEHICLE_DRIVER_MISSING', {
        orderId,
        vehicleId,
      });
    }
    if (active.length > 1) {
      throw this.conflict('planning.commit', 'PLAN_VEHICLE_DRIVER_AMBIGUOUS', {
        orderId,
        vehicleId,
        activeAssignments: active.length,
      });
    }
    return first.driverId;
  }

  /**
   * NGUOI CAM XE co thuc su MO duoc man Hien truong khong — tra ve chinh `driverId` do neu co.
   *
   * Man Hien truong (`DriverFieldReadService.workFor`) di dung mot chuoi:
   *
   *     phien.authUserId -> findDriverByAuthUserId -> driver.id -> listOpenRunsForDriver
   *
   * Ban phan cong vong chay chi noi mat xich cuoi. Neu ho so khong ton tai, da ngung, hoac khong
   * co `authUserId` thi khong phien nao di toi duoc no — va giao viec luc do lai sinh dung cai
   * vong chay mo coi da phai di lan mot buoi, chi la mo coi o mot tang sau hon.
   *
   * KHONG chon thay mot lai xe khac, va KHONG co nut gan tay: doi xe la nguon su that cua cau "ai
   * cam xe", nen du lieu doi xe sai thi sua o doi xe.
   *
   * `authUserId` la `@unique` tren Postgres, nen "khac rong" da du de noi rang MOT phien giai ra
   * dung nguoi nay. Chuoi toan khoang trang cung bi coi la thieu: schema chi doi `min(1)`, va
   * khong mot phien nao mang ma nhu the.
   */
  private async requireFieldReachableDriver(
    driverId: string,
    context: { readonly orderId: string; readonly vehicleId: string },
  ): Promise<string> {
    const detail = { ...context, driverId };
    const driver = await this.fleet.findDriver(driverId);
    if (driver === null) {
      throw this.conflict('planning.commit', 'PLAN_VEHICLE_DRIVER_NOT_FOUND', detail);
    }
    if (driver.status !== 'ACTIVE') {
      throw this.conflict('planning.commit', 'PLAN_VEHICLE_DRIVER_INACTIVE', detail);
    }
    if (driver.authUserId === null || driver.authUserId.trim() === '') {
      throw this.conflict('planning.commit', 'PLAN_VEHICLE_DRIVER_BINDING_MISSING', detail);
    }
    return driver.id;
  }

  /**
   * NOI DON vao vong chay DANG CHAY (`MULTI_ORDER_RUN`) — chi khi nguoi cam vong chay va nguoi cam
   * xe la MOT nguoi. Chay TRUOC chang dau tien: nhanh noi don chua ghi gi truoc diem nay.
   *
   *     doi xe  (`TransportVehicleAssignment`)  ai dang cam CHIEC XE      -> `vehicleDriverId`
   *     vong chay (`TransportRunAssignment`)    ai dang cam VONG CHAY NAY -> `activeAssignment`
   *
   * Ba tinh huong, ba ket cuc — va khong ket cuc nao la "chon mot ben":
   *
   *   CUNG NGUOI  noi don, KHONG ghi phan cong: nguoi cam vong chay da dung.
   *   KHAC NGUOI  `PLAN_RUN_DRIVER_CONFLICT`. Nguoi cam vong chay la su that cua no — ho dang cam
   *               chang cua no tren man Hien truong. Doi xe noi nguoi khac nghia la hai nguon dang
   *               noi hai dieu: noi don vao day la giao don cho nguoi doi xe vua noi KHONG cam xe,
   *               con doi nguoi la doi tai xe giua chuyen. Mot lan them don khong duoc lam ca hai.
   *   CHUA AI     `PLAN_RUN_DRIVER_ADOPTED`: vong chay sinh truoc ban va BUG-01, hoac mo tay qua
   *               `POST /runs`. Khong co su that nao de lech, nen nguoi cam xe — da qua du phep
   *               kiem cua vong chay moi — thanh ban phan cong DAU TIEN, dung quy tac cua vong chay
   *               moi. Ghi TRUOC khi noi chang: hong o lan ghi nay thi don chua nam trong mot vong
   *               chay khong ai mo duoc.
   */
  private async joinOpenRun(
    runId: string,
    vehicleDriverId: string,
    context: { readonly orderId: string; readonly vehicleId: string },
    actor: string,
  ): Promise<VehicleRun> {
    const { run, activeAssignment } = await this.movement.getRun(runId);
    const detail = { ...context, runId, vehicleDriverId };

    if (activeAssignment === null) {
      await this.movement.assignRun(runId, { driverId: vehicleDriverId }, actor);
      this.decide('planning.commit', 'allowed', 'PLAN_RUN_DRIVER_ADOPTED', detail);
      return run;
    }
    if (activeAssignment.driverId !== vehicleDriverId) {
      throw this.conflict('planning.commit', 'PLAN_RUN_DRIVER_CONFLICT', {
        ...detail,
        runDriverId: activeAssignment.driverId,
      });
    }
    return run;
  }

  private now(): Date {
    return this.clock ? this.clock() : new Date();
  }

  private decide(
    point: DecisionPoint,
    outcome: 'allowed' | 'denied',
    reason: TransportPlanningDecisionReason,
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_PLANNING_DECISIONS,
      point,
      outcome,
      reason,
      detail,
    });
  }

  private deny(
    point: DecisionPoint,
    reason: TransportPlanningDecisionReason,
    detail: Record<string, unknown>,
  ): TransportDomainError {
    this.decide(point, 'denied', reason, detail);
    return TransportDomainError.denied(reason, TRANSPORT_PLANNING_DECISIONS.labels[reason]);
  }

  /**
   * `409` chu khong `403`: don da co ke hoach khong phai mot lan thieu quyen, no la mot va cham
   * trang thai — va nguoi goi xu ly hai thu do khac han nhau.
   */
  private conflict(
    point: DecisionPoint,
    reason: TransportPlanningDecisionReason,
    detail: Record<string, unknown>,
  ): TransportDomainError {
    this.decide(point, 'denied', reason, detail);
    return TransportDomainError.conflict(reason, TRANSPORT_PLANNING_DECISIONS.labels[reason]);
  }
}
