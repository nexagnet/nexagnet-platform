import { Injectable } from '@nestjs/common';
import { DriverSettlementReadService } from '../driver-settlement/driver-settlement-read.service.js';
import { SettlementReadService } from '../settlement/settlement-read.service.js';
import { TripRepository } from '../trips/trip.repository.js';
import { TransportDomainError } from '../transport.errors.js';
import type { BusinessDate } from '../business-date.js';
import type { DirectMargin } from '../settlement/direct-margin.js';
import type { SettlementFlow } from '../settlement/settlement-flows.js';
import type { LegacyTripMarginInput } from './company-margin.js';
import type { DriverBalanceRow, PayableRow, ReceivableSummary } from './finance-summary.js';

/**
 * HAI CUA SO cua bang tai chinh. Ca hai CHI DOC.
 *
 * Cung khuon `analytics.ports.ts`: khong mot ham ghi nao, nen cau "bao cao khong bao gio ghi" la
 * mot dieu kien BIEN DICH chu khong phai mot loi hua trong tai lieu. Cong duoi tiem cac SERVICE
 * da duoc module `exports` (`SettlementReadService`, `DriverSettlementReadService`,
 * `TripRepository`) — khong tiem kho khong duoc export cua mien khac.
 */

export abstract class FinanceSettlementFacts {
  abstract receivable(asOf: BusinessDate): Promise<ReceivableSummary>;
  /** Hang phai tra cua MOT dong tien. `GD-15` cam mot bien the "tat ca dong tien". */
  abstract payable(flow: SettlementFlow): Promise<readonly PayableRow[]>;
  /**
   * Bien truc tiep `TX-05` cua TUNG chuyen cu, kem nhan cua chuyen. Phep gop voi viec Run-first nam
   * o `company-margin.ts` — cong nay chi doc (`#385`).
   */
  abstract tripMargins(): Promise<readonly Omit<LegacyTripMarginInput, 'runFirstFuelCost'>[]>;
  /** Ma tien da nhin thay o cac hang phai thu — de phat hien du lieu nhieu dong tien. */
  abstract receivableCurrencies(asOf: BusinessDate): Promise<readonly string[]>;
}

@Injectable()
export class FinanceSettlementFactsAdapter extends FinanceSettlementFacts {
  constructor(
    private readonly settlement: SettlementReadService,
    private readonly trips: TripRepository,
  ) {
    super();
  }

  async receivable(asOf: BusinessDate): Promise<ReceivableSummary> {
    const report = await this.settlement.arAging(asOf);
    return { outstandingTotal: report.outstandingTotal, overdueTotal: report.overdueTotal };
  }

  async receivableCurrencies(asOf: BusinessDate): Promise<readonly string[]> {
    const report = await this.settlement.arAging(asOf);
    return report.rows.map((row) => row.currencyCode);
  }

  async payable(flow: SettlementFlow): Promise<readonly PayableRow[]> {
    const rows = await this.settlement.apByCounterparty(flow);
    return rows.map((row) => ({
      outstandingAmount: row.outstandingAmount,
      currencyCode: row.currencyCode,
    }));
  }

  /**
   * Bien TUNG chuyen dang co — CHUYEN CU thoi. Viec Run-first den qua `FinanceRunFirstFacts` (`#385`).
   *
   * GIOI HAN da biet, ghi ra thay vi giau: day la mot phep doc theo so chuyen. Mien nay chua co
   * duong truy van theo khoang ngay (`DocumentQuery` khong co truong ngay —
   * `settlement.repository.ts:112-119`), nen mot bang "bien truc tiep thang nay" chua dung duoc.
   */
  async tripMargins(): Promise<readonly Omit<LegacyTripMarginInput, 'runFirstFuelCost'>[]> {
    const trips = await this.trips.list();
    const rows: Omit<LegacyTripMarginInput, 'runFirstFuelCost'>[] = [];
    for (const trip of trips) {
      const margin = await this.marginOf(trip.id);
      if (!margin) continue;
      rows.push({
        trip: {
          id: trip.id,
          code: trip.code,
          kind: trip.kind,
          businessDate: trip.businessDate,
          originLabel: trip.originLabel,
          destinationLabel: trip.destinationLabel,
          customerId: trip.customerId,
        },
        margin,
      });
    }
    return rows;
  }

  /**
   * Chuyen BIEN MAT giua luc liet ke va luc doc bien (xoa o moi truong thu, hoac mot lan don du lieu)
   * la chuyen khong con — bo qua no, KHONG lam hong ca bang. Moi loi khac van nem ra nguyen ven.
   */
  private async marginOf(tripId: string): Promise<DirectMargin | null> {
    try {
      return await this.settlement.tripDirectMargin(tripId);
    } catch (error) {
      if (error instanceof TransportDomainError && error.kind === 'NOT_FOUND') return null;
      throw error;
    }
  }
}

/**
 * CUA SO sang `TX-07b` — HAI so cua lai xe, giu rieng.
 *
 * TUY CHON: mot khach van tai bat `transport-settlement` ma khong tinh luong van co bang tai
 * chinh, chi thieu hai o cuoi — va bang noi ra dieu do qua `unavailableSources`.
 */
export abstract class FinanceDriverBalanceFacts {
  abstract balances(): Promise<readonly DriverBalanceRow[]>;
}

@Injectable()
export class FinanceDriverBalanceFactsAdapter extends FinanceDriverBalanceFacts {
  constructor(private readonly driverSettlement: DriverSettlementReadService) {
    super();
  }

  async balances(): Promise<readonly DriverBalanceRow[]> {
    const rows = await this.driverSettlement.fleetBalances();
    return rows.map((row) => ({
      reimbursementOutstanding: row.reimbursementOutstanding,
      wageRemaining: row.wageRemaining,
    }));
  }
}
