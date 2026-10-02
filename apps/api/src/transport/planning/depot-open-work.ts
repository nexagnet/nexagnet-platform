import { Inject, Injectable } from '@nestjs/common';
import { MovementRepository } from '../movement/movement.repository.js';
import type { Order, VehicleRun } from '../movement/movement.types.js';
import { TRANSPORT_PLANNING_POLICY, sameSite } from './planning-policy.js';
import type { TransportPlanningPolicy } from './planning.types.js';

/**
 * VIEC DANG MO TAI MOT BAI XE — cong DOC cua `transport-core` cho man "Dia diem van hanh" (`#395`).
 *
 * Doi ten, tat, hay doi bai chinh deu doi CAU TRA LOI cua khau lap ke hoach va dong vong chay cho
 * nhung viec dang mo: mot vong chay co chang ve bai theo nhan cu se khong con duoc dong vi "xe da ve
 * bai" (chi con dong vi het gio nghi, hoac nam giu mai khi khach khong khai nguong nghi), va mot
 * don con cho lap ke hoach mang nhan cu se bi coi la mot cho KHAC bai. Cong nay dem nhung viec do
 * de man hinh noi ra TRUOC khi ghi — va doi nguoi dung xac nhan.
 *
 * So khop bang `sameSite()` — CHINH luat ma khau lap ke hoach va dong vong chay dung — nen "bi anh
 * huong" o day nghia dung la "cau tra loi cua hai khau do se doi".
 *
 * `transport-proof` (so huu hang rao) doc cong nay; no khong duoc tiem `MovementRepository` de tu
 * doc — cung khuon `NO_CROSS_CONTEXT_REPOSITORY_WRITE`: cong chi co mot phuong thuc DOC.
 */

export interface DepotOpenWorkItem {
  readonly id: string;
  readonly code: string;
}

export interface DepotOpenWork {
  /**
   * Vong chay `PLANNED`/`ACTIVE` co chang chua huy di tu / ve nhan bai nay (`RENAME`: chi chang VE
   * bai — xem `DepotChangeKind`).
   */
  readonly runs: readonly DepotOpenWorkItem[];
  /** Don chua huy, chua hoan thanh co diem lay / giao mang nhan bai nay. */
  readonly orders: readonly DepotOpenWorkItem[];
  /** Nguong nghi cua khach — vong chay bi anh huong chi con dong theo nguong nay (`null` = khong). */
  readonly idleHours: number | null;
}

/**
 * THAY DOI nao cua bai xe — quyet dinh vong chay nao THAT SU bi anh huong (`#395`):
 *
 *   · `RELOCATE` (tat bai / doi bai chinh): xe doi CAN CU that — moi chang di tu HOAC ve bai deu
 *     tinh, va cau "khong tu dong khi xe ve bai" dung cho ca hai;
 *   · `RENAME` (doi ten bai dang dung): dong vong chay chi nhin DIEM DEN cua chang cuoi da xong, va
 *     khau lap ke hoach khong bao gio tao chang ve bai — nen chi vong chay co chang VE nhan cu moi
 *     doi ket cuc. Chang chi DI TU bai (chang rong dau ngay) khong doi gi: dem no la mot canh bao
 *     luon bat, day nguoi dung bam qua.
 */
export type DepotChangeKind = 'RELOCATE' | 'RENAME';

export abstract class DepotOpenWorkReader {
  abstract openWorkAt(depotLabel: string, change?: DepotChangeKind): Promise<DepotOpenWork>;
}

/**
 * Hai nhan cung chi MOT bai theo luat cua khau lap ke hoach va dong vong chay (`sameSite`: bo
 * khoang trang thua, khong phan biet hoa thuong). Doi ten kieu nay khong doi cau tra loi nao.
 */
export const sameDepotLabel = (left: string, right: string): boolean => sameSite(left, right);

const OPEN_RUN_STATUSES: ReadonlySet<VehicleRun['status']> = new Set(['PLANNED', 'ACTIVE']);

const touchesLabel = (label: string, origin: string, destination: string): boolean =>
  sameSite(origin, label) || sameSite(destination, label);

@Injectable()
export class MovementDepotOpenWorkReader extends DepotOpenWorkReader {
  constructor(
    private readonly movement: MovementRepository,
    @Inject(TRANSPORT_PLANNING_POLICY) private readonly policy: TransportPlanningPolicy,
  ) {
    super();
  }

  async openWorkAt(
    depotLabel: string,
    change: DepotChangeKind = 'RELOCATE',
  ): Promise<DepotOpenWork> {
    const [runs, orders] = await Promise.all([
      this.movement.listRuns(),
      this.movement.listOrders(),
    ]);
    const affectedRuns: VehicleRun[] = [];
    // Vong chay dang mo cua mot khach la vai chuc — doc chang cua tung cai la re; thao tac nay la
    // mot lan sua bai xe cua Giam doc, khong nam tren duong nong nao.
    for (const run of runs.filter((entry) => OPEN_RUN_STATUSES.has(entry.status))) {
      const legs = await this.movement.listLegs(run.id);
      const touches = legs.some(
        (leg) =>
          leg.status !== 'CANCELLED' &&
          (change === 'RENAME'
            ? sameSite(leg.destinationLabel, depotLabel)
            : touchesLabel(depotLabel, leg.originLabel, leg.destinationLabel)),
      );
      if (touches) affectedRuns.push(run);
    }
    const affectedOrders = orders.filter(
      (order: Order) =>
        order.status !== 'CANCELLED' &&
        order.status !== 'FULFILLED' &&
        touchesLabel(depotLabel, order.originLabel, order.destinationLabel),
    );
    return {
      runs: affectedRuns.map((run) => ({ id: run.id, code: run.code })),
      orders: affectedOrders.map((order) => ({ id: order.id, code: order.code })),
      idleHours: this.policy.closure.idleHours,
    };
  }
}
