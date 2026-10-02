import { Inject, Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { toBusinessDate } from '../business-date.js';
import { TRANSPORT_CORE_POLICY, type TransportCorePolicy } from '../transport-policy.js';
import { buildCompanyMargin, type CompanyMarginView } from './company-margin.js';
import { FINANCE_DECISIONS } from './finance-decisions.js';
import { FinanceDriverBalanceFacts, FinanceSettlementFacts } from './finance-facts.port.js';
import { FinanceRunFirstFacts } from './finance-run-first.port.js';
import {
  coverCurrency,
  foldDriverBalances,
  sumPayable,
  type DriverBalanceRow,
  type FinanceMarginView,
  type FinanceSource,
  type FinanceSummaryView,
} from './finance-summary.js';
import type { SettlementFlow } from '../settlement/settlement-flows.js';

/**
 * BANG TAI CHINH — mot lan doc, sau con so giu rieng (#244 G5).
 *
 * ===========================================================================
 * BON DONG TIEN DOC BANG BON LAN GOI, CO CHU DICH.
 *
 * `settlement-read.service.ts:127-132` cho `apByCounterparty` mot tham so `flow` BAT BUOC va
 * KHONG co bien the "tat ca dong tien" — `GD-15`. Doc bon lan roi giu bon con so canh nhau la
 * cach dung; gop chung o day se dung lai chinh cai cong ma tang duoi da dong.
 *
 * `CUSTOMER_FREIGHT` KHONG di qua duong do: no la mot dong PHAI THU
 * (`SETTLEMENT_FLOW_SHAPES`), nen no doc tu `arAging`. Nhet no vao mot bang "phai tra" se doi dau
 * mot khoan khach no thanh mot khoan cong ty no.
 */
@Injectable()
export class FinanceReadService {
  constructor(
    private readonly settlement: FinanceSettlementFacts,
    /** `#385` — viec Run-first. Bat buoc: `transport-settlement` phu thuoc ca core/costing/fuel. */
    private readonly runFirst: FinanceRunFirstFacts,
    @Inject(TRANSPORT_CORE_POLICY) private readonly corePolicy: TransportCorePolicy,
    @Optional() private readonly driverBalances?: FinanceDriverBalanceFacts,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  async summary(now?: Date): Promise<FinanceSummaryView> {
    const generatedFor = toBusinessDate(now ?? new Date(), this.corePolicy.timeZone);

    const [receivable, receivableCurrencies, margin, fuel, carrier, commission] = await Promise.all(
      [
        this.settlement.receivable(generatedFor),
        this.settlement.receivableCurrencies(generatedFor),
        this.companyMargin(),
        this.settlement.payable('FUEL_SUPPLIER'),
        this.settlement.payable('CARRIER_SERVICE'),
        this.settlement.payable('PARTNER_COMMISSION'),
      ],
    );

    const unavailableSources: FinanceSource[] = [];
    const driverRows = await this.readDriverBalances(unavailableSources);
    const driver = foldDriverBalances(driverRows);

    const flows: Readonly<Record<SettlementFlow, number>> = {
      /* PHAI THU — mot dau khac han ba dong duoi. Xem khoi chu thich tren lop. */
      CUSTOMER_FREIGHT: receivable.outstandingTotal,
      FUEL_SUPPLIER: sumPayable(fuel),
      CARRIER_SERVICE: sumPayable(carrier),
      PARTNER_COMMISSION: sumPayable(commission),
    };

    const currency = coverCurrency([
      ...receivableCurrencies,
      ...fuel.map((row) => row.currencyCode),
      ...carrier.map((row) => row.currencyCode),
      ...commission.map((row) => row.currencyCode),
    ]);

    if (!currency.isSingle) {
      this.telemetry?.decision({
        vocabulary: FINANCE_DECISIONS,
        point: 'finance.summary',
        outcome: 'degraded',
        reason: 'FINANCE_CURRENCY_MIXED',
        detail: { codes: currency.codes.join(','), count: currency.codes.length },
      });
    }

    for (const source of unavailableSources) {
      this.telemetry?.decision({
        vocabulary: FINANCE_DECISIONS,
        point: 'finance.summary',
        outcome: 'degraded',
        reason: 'FINANCE_SOURCE_UNAVAILABLE',
        detail: { source },
      });
    }

    this.telemetry?.decision({
      vocabulary: FINANCE_DECISIONS,
      point: 'finance.summary',
      outcome: 'allowed',
      reason: 'FINANCE_SUMMARY_COMPILED',
      detail: basisDetail(margin),
    });

    return {
      generatedFor,
      buckets: { flows, ...driver },
      directMargin: margin.totals,
      receivable,
      currency,
      unavailableSources,
    };
  }

  /**
   * HIEU QUA TUNG VIEC — `#381`/`#385`. Cung MOT ham gop voi `summary()`, nen tong o hai man khong
   * the lech nhau: man hinh doc `totals`, khong tu cong cac dong.
   */
  async margin(now?: Date): Promise<FinanceMarginView> {
    const generatedFor = toBusinessDate(now ?? new Date(), this.corePolicy.timeZone);
    const view = await this.companyMargin();
    this.telemetry?.decision({
      vocabulary: FINANCE_DECISIONS,
      point: 'finance.margin',
      outcome: 'allowed',
      reason: 'FINANCE_MARGIN_COMPILED',
      detail: basisDetail(view),
    });
    return { generatedFor, ...view };
  }

  /**
   * Chuyen cu + don Run-first. Phan bo Run-first nam tren vong xe CHIEU cua mot chuyen cu di vao
   * DONG CHUYEN DO; neu chuyen khong con trong danh sach (khong the xay ra hom nay) thi no vao
   * `unassigned` chu khong roi mat — mot dong tien khong co cho dung van phai hien ra.
   */
  private async companyMargin(): Promise<CompanyMarginView> {
    const [legacy, runFirst] = await Promise.all([
      this.settlement.tripMargins(),
      this.runFirst.runFirstMargins(),
    ]);
    const tripIds = new Set(legacy.map((row) => row.trip.id));
    const orphaned = [...runFirst.legacyTripFuelCost].filter(([tripId]) => !tripIds.has(tripId));
    return buildCompanyMargin({
      legacy: legacy.map((row) => ({
        ...row,
        runFirstFuelCost: runFirst.legacyTripFuelCost.get(row.trip.id) ?? 0,
      })),
      runFirst: runFirst.orders,
      projectedOrderCount: runFirst.projectedOrderCount,
      unassignedRunFirstCost: {
        amount: orphaned.reduce((total, [, amount]) => total + amount, runFirst.unassigned.amount),
        runCount: runFirst.unassigned.runCount + orphaned.length,
      },
    });
  }

  private async readDriverBalances(
    unavailable: FinanceSource[],
  ): Promise<readonly DriverBalanceRow[]> {
    const port = this.driverBalances;
    if (!port) {
      unavailable.push('DRIVER_SETTLEMENT');
      return [];
    }
    try {
      return await port.balances();
    } catch (error) {
      this.telemetry?.decision({
        vocabulary: FINANCE_DECISIONS,
        point: 'finance.summary',
        outcome: 'degraded',
        reason: 'FINANCE_SOURCE_FAILED',
        detail: {
          source: 'DRIVER_SETTLEMENT',
          error: error instanceof Error ? error.name : 'UNKNOWN',
        },
      });
      return [];
    }
  }
}

/** Chi so dem va ma — KHONG mot so tien nao di vao trace (`finance-decisions.ts`). */
const basisDetail = (view: CompanyMarginView): Record<string, number> => ({
  trips: view.totals.basis.legacyTrips.counted,
  skippedTrips: view.totals.basis.legacyTrips.skipped,
  runFirstOrders: view.totals.basis.runFirstOrders.counted,
  excludedRunFirstOrders: Object.values(view.totals.basis.runFirstOrders.excluded).reduce(
    (total, count) => total + count,
    0,
  ),
  projectedOrders: view.totals.basis.projectedOrderCount,
  pendingFuelEntries: view.totals.basis.pendingFuelCost.entryCount,
  unassignedRuns: view.totals.basis.unassignedRunFirstCost.runCount,
});
