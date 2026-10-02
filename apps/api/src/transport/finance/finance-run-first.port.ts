import { Injectable } from '@nestjs/common';
import { OperatingMetricsReadService } from '../analytics/operating-metrics-read.service.js';
import type { RunMargin } from '../analytics/operating-metrics.js';
import { attributedTotal } from '../fuel/fuel-cost-attribution.js';
import { FuelCostAttributionRepository } from '../fuel/fuel-cost-attribution.repository.js';
import { FuelRepository } from '../fuel/fuel.repository.js';
import { MovementRepository } from '../movement/movement.repository.js';
import type { Order, RunLeg, VehicleRun } from '../movement/movement.types.js';
import type {
  PendingFuelCost,
  RunFirstOrderMarginInput,
  RunFirstRunFacts,
  UnassignedRunFirstCost,
} from './company-margin.js';

/**
 * CUA SO THU BA cua bang tai chinh — viec Run-first (`#381`, `#385`). CHI DOC.
 *
 * Cung khuon `finance-facts.port.ts`: cong khong co mot ham ghi nao, va adapter chi tiem nhung thu
 * cac module da `exports` (`MovementRepository`, `OperatingMetricsReadService`, hai kho nhien lieu).
 * `transport-settlement` phu thuoc CA `transport-core`, `transport-costing` lan `transport-fuel`
 * (`tenant.schema.ts`), nen ca bon luon co mat khi bang nay co mat — khong can `@Optional()`.
 *
 * ===========================================================================
 * CHI PHI Run-first LAY TU `runMargin`, KHONG TINH LAI
 *
 * `OperatingMetricsReadService.runMargin()` (`#369` R-1) da la cho DUY NHAT cong so phan bo nhien
 * lieu Run-first theo vong xe. Tep nay chi quyet MOT dieu no khong quyet: chi phi cua vong xe thuoc
 * VIEC NAO — mot don Run-first, mot chuyen cu da chieu, hay khong ai (va khi do noi ra).
 */

export interface RunFirstMarginFacts {
  /** Don Run-first con hieu luc (khong chieu, khong huy), kem vong xe chay chung. */
  readonly orders: readonly RunFirstOrderMarginInput[];
  readonly projectedOrderCount: number;
  /** Phan bo Run-first tren vong xe CHIEU cua dung MOT chuyen cu — theo `tripId`. */
  readonly legacyTripFuelCost: ReadonlyMap<string, number>;
  readonly unassigned: UnassignedRunFirstCost;
}

export abstract class FinanceRunFirstFacts {
  abstract runFirstMargins(): Promise<RunFirstMarginFacts>;
}

/** Ai so huu chi phi cua MOT vong xe. */
type RunOwner =
  | { readonly kind: 'ORDER'; readonly orderId: string }
  | { readonly kind: 'TRIP'; readonly tripId: string }
  | { readonly kind: 'SHARED' }
  | { readonly kind: 'NONE' };

/** VIEC ma mot vong xe chay — doc tu chang CHUA HUY, khong tu so tien. */
export interface RunWork {
  /** Don tren cac chang chua huy (ke ca don chieu va don da huy — loc o `ownerOfRun`). */
  readonly orderIds: readonly string[];
  /** Chuyen cu noi voi cac chang chua huy qua `TransportTripRunLegLink`. */
  readonly tripIds: readonly string[];
}

/**
 * Chi phi vong xe thuoc MOT viec khi va chi khi vong xe chay DUNG mot viec. Hai viec tro len (nhieu
 * don, hoac don lan chuyen cu) la `SHARED`: `MULTI_ORDER_RUN` ngoai pham vi, nen KHONG bia luat chia.
 *
 * Doc tu CHANG + LIEN KET, khong tu `RunMargin.tripIds`: cai do chi ke chuyen CO khoan chi `TX-03`
 * (no la duong doi soat cua tien), nen mot vong chieu tu chuyen chua co khoan chi nao se trong nhu
 * "khong ai chay" — va phan bo tren no se rot khoi ca hai nhanh. Postgres that da bat dung loi nay.
 */
export const ownerOfRun = (work: RunWork, runFirstOrderIds: ReadonlySet<string>): RunOwner => {
  const orders = [...new Set(work.orderIds)].filter((id) => runFirstOrderIds.has(id));
  const trips = [...new Set(work.tripIds)];
  if (orders.length === 1 && trips.length === 0) return { kind: 'ORDER', orderId: orders[0]! };
  if (orders.length === 0 && trips.length === 1) return { kind: 'TRIP', tripId: trips[0]! };
  if (orders.length + trips.length > 1) return { kind: 'SHARED' };
  return { kind: 'NONE' };
};

const counts = (leg: RunLeg): boolean => leg.status !== 'CANCELLED';

interface RunRead {
  readonly run: VehicleRun | null;
  readonly margin: RunMargin | null;
  readonly work: RunWork;
}

@Injectable()
export class FinanceRunFirstFactsAdapter extends FinanceRunFirstFacts {
  constructor(
    private readonly movement: MovementRepository,
    private readonly metrics: OperatingMetricsReadService,
    private readonly fuel: FuelRepository,
    private readonly attributions: FuelCostAttributionRepository,
  ) {
    super();
  }

  async runFirstMargins(): Promise<RunFirstMarginFacts> {
    const orders = await this.movement.listOrders();
    const links = await this.movement.findOrderLinksByOrders(orders.map((order) => order.id));
    const projected = new Set(links.map((link) => link.orderId));
    const live = orders.filter((order) => !projected.has(order.id) && order.status !== 'CANCELLED');
    const liveIds = new Set(live.map((order) => order.id));

    const legs = (await this.movement.listLegsByOrders([...liveIds])).filter(counts);
    const runIds = [
      ...new Set([
        ...legs.map((leg) => leg.runId),
        ...(await this.attributions.listAttributedRunIds()),
      ]),
    ];
    const runs = await this.readRuns(runIds);

    const owners = new Map<string, RunOwner>();
    const legacyTripFuelCost = new Map<string, number>();
    let unassigned: UnassignedRunFirstCost = { amount: 0, runCount: 0 };
    for (const [runId, { margin, work }] of runs) {
      if (margin === null) continue;
      const owner = ownerOfRun(work, liveIds);
      owners.set(runId, owner);
      const fuel = margin.costSources.fuelCostAttribution;
      if (owner.kind === 'TRIP') {
        legacyTripFuelCost.set(owner.tripId, (legacyTripFuelCost.get(owner.tripId) ?? 0) + fuel);
      } else if (owner.kind !== 'ORDER' && fuel !== 0) {
        unassigned = { amount: unassigned.amount + fuel, runCount: unassigned.runCount + 1 };
      }
    }

    const facts = await Promise.all(
      live.map((order) => this.orderFacts(order, legs, runs, owners)),
    );
    return {
      orders: facts,
      projectedOrderCount: projected.size,
      legacyTripFuelCost,
      unassigned,
    };
  }

  private async readRuns(runIds: readonly string[]): Promise<Map<string, RunRead>> {
    const read = await Promise.all(
      runIds.map(async (runId) => {
        const [run, margin, legs] = await Promise.all([
          this.movement.findRun(runId),
          this.metrics.runMargin(runId),
          this.movement.listLegs(runId),
        ]);
        const counted = legs.filter(counts);
        const links = await this.movement.findTripLinksByLegs(counted.map((leg) => leg.id));
        const work: RunWork = {
          orderIds: counted.flatMap((leg) => (leg.orderId === null ? [] : [leg.orderId])),
          tripIds: links.map((link) => link.tripId),
        };
        return [runId, { run, margin, work }] as const;
      }),
    );
    return new Map(read);
  }

  private async orderFacts(
    order: Order,
    legs: readonly RunLeg[],
    runs: ReadonlyMap<string, RunRead>,
    owners: ReadonlyMap<string, RunOwner>,
  ): Promise<RunFirstOrderMarginInput> {
    const own = [
      ...new Set(legs.filter((leg) => leg.orderId === order.id).map((leg) => leg.runId)),
    ];
    const facts = await Promise.all(
      own.map(async (runId): Promise<RunFirstRunFacts> => {
        const read = runs.get(runId);
        const owner = owners.get(runId);
        return {
          runId,
          runCode: read?.run?.code ?? runId,
          fuelCostAttribution: read?.margin?.costSources.fuelCostAttribution ?? 0,
          // Khong co chu (vong xe khong doc lai duoc) KHONG phai "cho viec khac" — ly do dung la
          // `costSourceUnavailable` ngay duoi.
          carriesOtherWork:
            owner !== undefined && (owner.kind !== 'ORDER' || owner.orderId !== order.id),
          // `null` = vong xe khong doc lai duoc: chi phi CHUA BIET, khong phai 0.
          costSourceUnavailable: !read?.margin || read.margin.unavailableSources.length > 0,
          pendingFuel: await this.pendingFuel(runId),
        };
      }),
    );
    return {
      order: {
        id: order.id,
        code: order.code,
        status: order.status,
        businessDate: order.businessDate,
        originLabel: order.originLabel,
        destinationLabel: order.destinationLabel,
        customerId: order.customerId,
        freightAmount: order.freightAmount,
        currencyCode: order.currencyCode,
      },
      runs: facts,
    };
  }

  /**
   * Phieu khai TREN vong xe nay ma tien CHUA phan bo het — ke ca phieu chua duyet (tien co that,
   * chi chua duoc tin). Phieu bi tu choi khong phai chi phi. Phan con treo cua phieu la
   * `amount - tong phan bo dang hieu luc`, doc qua CHINH `attributedTotal` cua lop phan bo.
   */
  private async pendingFuel(runId: string): Promise<PendingFuelCost> {
    const entries = (await this.fuel.listEntriesByRun(runId)).filter(
      (entry) => entry.verificationStatus !== 'REJECTED',
    );
    const remainders = await Promise.all(
      entries.map(
        async (entry) =>
          entry.amount - attributedTotal(await this.attributions.listForEntry(entry.id)),
      ),
    );
    const open = remainders.filter((rest) => rest > 0);
    return { amount: open.reduce((total, rest) => total + rest, 0), entryCount: open.length };
  }
}
