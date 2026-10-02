import { Injectable } from '@nestjs/common';

/**
 * CONG CHAN sua dia diem doi tac qua duong cu khi dia diem do da la mot DIA DIEM VAN HANH (`#395`).
 *
 * Tu #395 mot dia diem co hang rao duoc quan ly o man hinh "Dia diem van hanh": doi ten hay tat no
 * phai di cung hang rao, trong MOT giao dich, duoi cung khoa. Route cu
 * `PATCH /transport/counterparties/:id/sites/:siteId` (`transport-core`) khong biet gi ve hang rao —
 * hang rao thuoc `transport-proof`, va core khong duoc phu thuoc proof.
 *
 * Nen chieu phu thuoc bi dao, dung khuon `DepotDirectoryHub`: core khai CONG + mac dinh KHONG chan
 * (khach khong bat `transport-proof` thi khong co hang rao nao de lech); `transport-proof` dang ky
 * cong that. S0 chi dung cong — dich vu dia diem chua hoi no.
 */

export interface LegacySiteChange {
  readonly siteId: string;
  /** Lan sua nay doi TEN dia diem. */
  readonly changesName: boolean;
  /** Lan sua nay doi TRANG THAI (bat/tat) dia diem. */
  readonly changesStatus: boolean;
}

export type LegacySiteChangeVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: 'COUNTERPARTY_SITE_MANAGED_AS_PLACE' };

export interface CounterpartySitePlaceGuard {
  checkLegacySiteChange(change: LegacySiteChange): Promise<LegacySiteChangeVerdict>;
}

const ALLOWED: LegacySiteChangeVerdict = { allowed: true };

/**
 * CHO DANG KY cong. Chua ai dang ky = khong chan gi — dung nhu truoc #395.
 *
 * `register()` NEM khi da co cong: hai cong tra loi cung mot cau hoi thi cai dang ky sau lang le
 * thang, va do la loi composition phai lo ngay luc khoi dong.
 */
@Injectable()
export class CounterpartySitePlaceGuardHub implements CounterpartySitePlaceGuard {
  private registered: CounterpartySitePlaceGuard | null = null;

  register(guard: CounterpartySitePlaceGuard): void {
    if (this.registered !== null) {
      throw new Error('Da co mot cong dia diem duoc dang ky — hai cau tra loi cho mot cau hoi');
    }
    this.registered = guard;
  }

  checkLegacySiteChange(change: LegacySiteChange): Promise<LegacySiteChangeVerdict> {
    // Chi TEN va TRANG THAI la danh tinh cua mot dia diem van hanh; dia chi, ghi chu sua tu do.
    if (this.registered === null || (!change.changesName && !change.changesStatus)) {
      return Promise.resolve(ALLOWED);
    }
    return this.registered.checkLegacySiteChange(change);
  }
}
