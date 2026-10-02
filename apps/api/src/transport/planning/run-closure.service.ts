import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { MovementService } from '../movement/movement.service.js';
import type { VehicleRun } from '../movement/movement.types.js';
import { TRANSPORT_CLOCK } from '../transport-policy.js';
import {
  TRANSPORT_PLANNING_DECISIONS,
  type TransportPlanningDecisionReason,
} from './planning-decisions.js';
import {
  DepotDirectoryHub,
  readDepots,
  type DepotDirectory,
  type DepotEntry,
} from './depot-directory.js';
import {
  TRANSPORT_PLANNING_POLICY,
  RUN_CLOSURE_EVENT_BACKSTOP_MS,
  resolveDepotFrom,
  usableDepot,
} from './planning-policy.js';
import { PlanningService, type RunClosureOutcome } from './planning.service.js';
import type { RunClosureCause, TransportPlanningPolicy } from './planning.types.js';
import { RunClosureBlockerSource, collectBlockers } from './run-closure-blocker.source.js';

type DecisionPoint = (typeof TRANSPORT_PLANNING_DECISIONS)['points'][number];

const HOUR_MS = 3_600_000;

export interface RunClosureSweepResult {
  /** So vong chay da hoi trong luot nay. Co tran boi `sweep.batchSize`. */
  readonly scanned: number;
  /** So vong chay THUC SU duoc dong trong luot nay. */
  readonly closed: number;
}

/**
 * DUONG PHAN XU DUY NHAT CUA VONG CHAY — `#293` R2: *"Prefer one application-level orchestration
 * path."*
 *
 * ============================================================================================
 * VI SAO KHONG DE MOI CONTROLLER TU GOI `settleRunClosure()`
 * ============================================================================================
 *
 * Truoc lane nay, hai controller goi thang `PlanningService.settleRunClosure(runId)`. Moi duong
 * goi them sau do se phai tu nho ba thu: hoi nguon su that ben ngoai, chiu fail-closed khi nguon
 * hong, va ghi so quyet dinh. Ba thu do khong the la mot quy uoc mieng — mot duong quen mot trong
 * ba se lam he thong dong mot vong chay ma no chua kiem tra xong.
 *
 * Lop nay gom ba thu do vao MOT cho. Controller chi con noi *"su that vua doi"*, va no khong con
 * phai biet gi ve phien cho, hang tren thung, hay nguong nghi.
 *
 * ============================================================================================
 * GOI LAI DUOC, VA DO LA DIEU KIEN
 * ============================================================================================
 *
 * `attempt()` khong nhan mot y muon nao — khong `force`, khong `trigger`, khong `to`. No hoi lai
 * dung phan xu tat dinh va thi hanh ket qua. Hai lan goi tren cung mot su that cho ra cung mot ket
 * qua, va lan thu hai tra `closed: false` kem ly do chu khong nem. Do la thu lam cho mot su kien
 * bi lap (message at-least-once, nguoi dung bam hai lan, hai worker cung luot quet) khong sinh ra
 * hai lan dong.
 */
@Injectable()
export class RunClosureService {
  private readonly logger = new Logger(RunClosureService.name);

  constructor(
    private readonly planning: PlanningService,
    private readonly movement: MovementService,
    @Inject(TRANSPORT_PLANNING_POLICY) private readonly policy: TransportPlanningPolicy,
    /*
     * `@Optional()` CO CHU DICH. `transport-core` phai boot duoc mot minh: mot khach chi bat
     * `transport-core` khong co `transport-checkpoint` thi khong co nguon su that ben ngoai nao de
     * hoi, va do la mot cau hinh hop le chu khong mot loi boot. Khi do khong co gi chan — nhung
     * KHONG phai vi da hoi va nhan ve `[]`, ma vi khong co cong nao de hoi. Xem `collectBlockers()`.
     */
    @Optional() private readonly blockerSource?: RunClosureBlockerSource,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() @Inject(TRANSPORT_CLOCK) private readonly clock?: () => Date,
    /*
     * DANH BA BAI XE (`#395`) — cuoi va tuy chon, cung ly le voi `PlanningService`: vang mat thi doc
     * cau hinh goi khach. Luot quet doc no MOT lan va truyen cho moi ung vien.
     */
    @Optional() @Inject(DepotDirectoryHub) private readonly depots?: DepotDirectory,
  ) {}

  /**
   * PHAN XU LAI mot vong chay va thi hanh neu du dieu kien.
   *
   * Tra ve ket qua y nguyen cua `PlanningService` — lop nay khong tu quyet dinh gi, no gom su that
   * lai roi chuyen tiep.
   */
  async attempt(runId: string, cause: RunClosureCause): Promise<RunClosureOutcome> {
    return this.attemptWith(runId, cause, undefined);
  }

  /**
   * `attempt()` voi danh ba bai xe DA DOC (luot quet). `undefined` = de `PlanningService` tu doc —
   * van mot lan, truoc khoa hang vong chay.
   */
  private async attemptWith(
    runId: string,
    cause: RunClosureCause,
    depots: readonly DepotEntry[] | undefined,
  ): Promise<RunClosureOutcome> {
    const blockers = await collectBlockers(this.blockerSource, runId);
    return this.planning.settleRunClosure(runId, {
      blockers,
      cause,
      ...(depots === undefined ? {} : { depots }),
      /*
       * HOI LAI tren duong da khoa — `#293` R2.
       *
       * Anh chup o tren duoc chup TRUOC khi hang vong chay bi khoa, nen mot phien cho vua mo hay
       * mot moc "con hang tren thung" vua ghi se khong co trong do. Phep hoi lai chay ben trong
       * giao dich dong, sat nhat co the voi luc buoc chuyen duoc ghi.
       *
       * PHEP HOI LAI NAY MOT MINH VAN CHUA DU, va phan con lai KHONG nam o day.
       *
       * Anh chup thu hai duoc doc duoi khoa, nhung cac bang ma no doc — phien cho, moc hien truong
       * — khong bi khoa cua vong chay cham toi. Nen truoc `#290` van con dung mot cua so: mot lai
       * xe mo phien cho hoac bam moc `LOADING` ngay SAU lan hoi nay va ngay TRUOC luc buoc chuyen
       * commit, va ket qua la mot vong chay o diem cuoi nam canh mot dieu kien chan dang mo.
       *
       * Cua so do dong bang cach bat chinh NHUNG NGUOI GHI KIA xep hang sau cung mot khoa — xem
       * `RunWriteGuard` (`movement/run-write-guard.port.ts`). Khong phai bang cach hoi lai nhieu
       * lan hon o day: mot lan hoi thu ba van se co mot cua so thu ba.
       *
       * Bang chung: `run-closure-concurrency.int.spec.ts` R-IT-10 (phien cho) va R-IT-11 (hang tren
       * thung), tren Postgres that.
       */
      recheckBlockers: () => collectBlockers(this.blockerSource, runId),
    });
  }

  /**
   * PHAN XU DE DOC — cung bo su that voi `attempt()`, nhung khong ghi mot hang nao.
   *
   * Hai duong nay phai nhin cung mot bang chan. Mot be mat chan doan bao "dong duoc" trong khi
   * duong thi hanh tu choi dong se lam nguoi truc tin vao mot cau tra loi sai — va do la ly do
   * `inspect()` ton tai chu khong de ve mot buc tranh dep hon.
   */
  async inspect(runId: string) {
    const blockers = await collectBlockers(this.blockerSource, runId);
    return this.planning.inspectClosure(runId, blockers);
  }

  /**
   * LUOT QUET DINH KY — `#293` R3.
   *
   * ============================================================================================
   * KHONG CO NGUONG NGHI THI KHONG DOAN MOT CON SO
   * ============================================================================================
   *
   * Khach khong khai `closure.idleHours` thi nhanh `IDLE_TIMEOUT` khong bao gio bat. Luot quet VAN
   * chay — vi nhanh "ve bai" van can mot duong bao hiem — nhung no khong the dong mot chiec xe dang
   * o xa bai. Do dung la dieu `#293` R3 doi: *"If no idle threshold is configured, do not invent
   * one: stay holding."*
   *
   * ============================================================================================
   * TAT DINH, VA KHOI PHUC DUOC SAU KHI TIEN TRINH CHET
   * ============================================================================================
   *
   * Khong co con tro song nao o day. Tap ung vien duoc suy ra TU SU THAT NGUON moi lan quet, va
   * moc thoi gian lay tu dong ho (tiem duoc). Mot tien trinh chet giua hai luot quet khong lam mat
   * gi: luot quet sau doc lai dung nhung vong chay do va thay chung van qua nguong.
   */
  async sweep(): Promise<RunClosureSweepResult> {
    const now = this.now();
    const idleHours = this.policy.closure.idleHours;

    /*
     * Cua so ung vien = nguong nghi (nho hon), hoac khoang dem bao hiem khi khach khong khai nguong.
     *
     * Lay `min` chu khong lay `idleHours` mot minh: mot vong chay ve bai 5 phut truoc ma phai doi
     * 12 tieng moi duoc nhin lai la mot vong chay bi bo quen trong 12 tieng, va no se duoc dong voi
     * ly do `IDLE_TIMEOUT` thay vi `DEPOT_RETURN` — tuc so quyet dinh noi sai ve ly do.
     */
    const windowMs =
      idleHours === null
        ? RUN_CLOSURE_EVENT_BACKSTOP_MS
        : Math.min(idleHours * HOUR_MS, RUN_CLOSURE_EVENT_BACKSTOP_MS);
    const completedBefore = new Date(now.getTime() - windowMs);

    // MOT lan doc danh ba bai xe cho ca luot quet (`#395`): ung vien va moi lan phan xu nhin CUNG
    // mot bai, va khong lan phan xu nao doc kho hang rao trong luc giu khoa hang vong chay.
    const depots = await readDepots(this.depots, this.policy);
    const candidates = await this.movement.listRunClosureCandidates({
      completedBefore,
      idleHours,
      depotLabel: usableDepot(resolveDepotFrom(depots))?.label ?? null,
      limit: this.policy.sweep.batchSize,
    });

    let closed = 0;
    for (const candidate of candidates) {
      if (await this.settleCandidate(candidate, depots)) closed += 1;
    }

    this.decide(
      'planning.run_closure_sweep',
      'allowed',
      candidates.length === 0 ? 'RUN_CLOSURE_SWEEP_EMPTY' : 'RUN_CLOSURE_SWEEP_RAN',
      { scanned: candidates.length, closed, idleHours, windowMs },
    );
    return { scanned: candidates.length, closed };
  }

  /**
   * MOT ung vien, va mot quy tac: mot vong chay hong KHONG duoc lam hong ca luot quet.
   *
   * `attempt()` da khong nem cho cac truong hop BINH THUONG (chua du dieu kien, da dong — chung
   * tra ve `closed: false` kem ly do). Nhung mot su co that su — CSDL ngat, mot dong du lieu khong
   * doc duoc — se nem, va neu no thoat ra khoi vong lap thi nhung ung vien con lai cua trang khong
   * bao gio duoc hoi.
   *
   * Loi o day KHONG duoc nuot im lang. Loi tu nguon su that ben ngoai thi da co ma chan rieng
   * (`EXTERNAL_BLOCKER_SOURCE_UNAVAILABLE`), nhung loi xay ra TRUOC khi phan xu kip ghi mot dong
   * nao thi khong de lai dau vet nao — va khi do mot luot quet hong hoan toan giong y mot luot
   * quet sach khong co gi de lam. Nen no phai duoc ghi ra log: day la cho duy nhat phan biet duoc.
   */
  private async settleCandidate(
    candidate: VehicleRun,
    depots: readonly DepotEntry[],
  ): Promise<boolean> {
    try {
      const outcome = await this.attemptWith(candidate.id, 'IDLE_SWEEP', depots);
      return outcome.closed;
    } catch (error) {
      this.logger.error(
        `Luot quet khong phan xu duoc vong chay ${candidate.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
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
}
