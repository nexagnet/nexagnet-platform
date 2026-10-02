import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { FinanceReadService } from './finance-read.service.js';
import type { FinanceMarginView, FinanceSummaryView } from './finance-summary.js';

/**
 * BANG TAI CHINH qua HTTP — #244 G5. CHI DOC.
 *
 * ===========================================================================
 * KHONG MOT QUYEN MOI NAO.
 *
 * Dung `transport.settlement.report.read` — quyen da co cua bao cao quyet toan. Bang nay khong
 * phoi mot su that nao ma quyen do chua cho xem: no doc chinh `arAging`, `apByCounterparty` va
 * `directMarginRollup` cua `SettlementReportsController`, roi bay chung canh nhau. Them mot ma
 * quyen cho cung mot du lieu se lam ma tran phan quyen dai ra ma khong chan them dieu gi — va se
 * de mot khach cap nham mot trong hai.
 *
 * Khac voi thap dieu hanh: cai kia doc CA doi xe cua `transport-core` — mot tap du lieu ma
 * `transport.settlement.report.read` khong noi gi ve no — nen no can mot ma rieng.
 */
@Controller('transport/finance')
@UseGuards(TransportActionGuard)
export class FinanceController {
  constructor(private readonly read: FinanceReadService) {}

  /**
   * SAU CON SO, MOT LAN GOI, KHONG MOT TONG NAO.
   *
   * `SettlementBuckets` co y khong co truong `total` (`operating-metrics.spec.ts:269-276` khoa
   * dieu do o muc kieu). Route nay khong duoc them mot tham so kieu `?combined=true`: cong sau con
   * so lai cho ra mot con so khong ai no ai ca.
   */
  @Get('summary')
  @RequiresTransportAction('transport.settlement.report.read')
  async summary(): Promise<FinanceSummaryView> {
    try {
      return await this.read.summary();
    } catch (error) {
      throw transportErrorToHttp(error);
    }
  }

  /**
   * `#381`/`#385` — HIEU QUA TUNG VIEC: moi chuyen cu va moi don Run-first mot dong, kem `totals`
   * CUNG ham gop voi `summary`. Tong la cua MAY CHU: man hinh khong goi N lan roi tu cong.
   *
   * Cung quyen `transport.settlement.report.read` — cung mot loai su that voi `summary`, chi chi tiet
   * hon; mot ma quyen moi cho cung du lieu chi lam ma tran dai ra.
   */
  @Get('margin')
  @RequiresTransportAction('transport.settlement.report.read')
  async margin(): Promise<FinanceMarginView> {
    try {
      return await this.read.margin();
    } catch (error) {
      throw transportErrorToHttp(error);
    }
  }
}
