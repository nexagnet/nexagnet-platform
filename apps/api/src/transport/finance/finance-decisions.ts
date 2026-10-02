import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH cua BANG TAI CHINH.
 *
 * `owner: 'transport-settlement'` — cung capability so huu bao cao hop nhat. Xem khoi chu thich
 * dau `finance-summary.ts`: quyet dinh "capability nao so huu" von bi hoan lai, va Lane G tra loi
 * no o day.
 *
 * KHONG MOT SO TIEN NAO di vao `detail`. Mot bo trace mang so cong no cua khach la mot duong ro ri
 * khong ai kiem soat duoc pham vi — chi ma tien, so dem va ma nguon.
 */

export const FINANCE_SUMMARY_REASONS = [
  'FINANCE_SUMMARY_COMPILED',
  /** `#385` — bang hieu qua tung viec (chuyen cu + don Run-first) da dung tu ban ghi nguon. */
  'FINANCE_MARGIN_COMPILED',
  /** Mot nguon vang mat vi capability so huu no dang tat. */
  'FINANCE_SOURCE_UNAVAILABLE',
  /** Nguon co bat nhung doc loi — bang mat dung o do, khong hong ca lan doc. */
  'FINANCE_SOURCE_FAILED',
  /**
   * DU LIEU CO NHIEU HON MOT MA TIEN.
   *
   * Moi phep gop tien trong mien nay lay `currencyCode` cua hang dau tien roi hy vong. Khi du lieu
   * that su co hai dong tien, MOI tong deu sai — nen day la mot quyet dinh `degraded` duoc ghi
   * lai, khong phai mot ghi chu hien thi.
   */
  'FINANCE_CURRENCY_MIXED',
] as const;
export type FinanceSummaryReason = (typeof FINANCE_SUMMARY_REASONS)[number];

export const FINANCE_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-settlement',
  points: ['finance.summary', 'finance.margin'],
  labels: {
    FINANCE_SUMMARY_COMPILED: 'Đã dựng bảng tài chính từ bản ghi nguồn',
    FINANCE_MARGIN_COMPILED:
      'Đã dựng bảng hiệu quả từng việc — chuyến cũ cộng đơn giao theo vòng xe, không đếm trùng',
    FINANCE_SOURCE_UNAVAILABLE: 'Một nguồn của bảng vắng mặt vì capability sở hữu nó đang tắt',
    FINANCE_SOURCE_FAILED: 'Một nguồn của bảng có bật nhưng đọc lỗi — bảng thiếu mục đó',
    FINANCE_CURRENCY_MIXED:
      'Dữ liệu có nhiều hơn một mã tiền — các tổng trên bảng không đọc thẳng được',
  } satisfies Record<FinanceSummaryReason, string>,
});
