/**
 * Ly do TU CHOI cua CONG HANH DONG van tai (`TransportActionGuard`, `#395`).
 *
 * Truoc `#395` cong nay tra mot `403` chi co cau chu (khong dau, kem ma hanh dong). Man hinh khong
 * phan biet duoc "ban khong co quyen" voi mot `403` cua mot cong nghiep vu (vd `FUND_PERIOD_*`), nen
 * no chi con cach in nguyen van. Tu `#395` than loi mang `reason` CO KIEU giong `transportErrorBody`
 * va `detail.action` — ma hanh dong bi tu choi, KHONG mot manh du lieu nghiep vu nao.
 *
 * Mot tep rieng, khong nhet vao `transport.errors.ts`, cung khuon voi moi capability khac: tu vung
 * thuoc ve cho so huu no, `transport.errors.ts` chi GOP lai.
 */
export const TRANSPORT_ACCESS_ERROR_REASONS = [
  /** Tap quyen HIEU LUC cua tai khoan (vai khoi diem + quyen rieng) khong co hanh dong nay. */
  'ACTION_NOT_PERMITTED',
] as const;
export type TransportAccessErrorReason = (typeof TRANSPORT_ACCESS_ERROR_REASONS)[number];

/** Cau cho nguoi dung — tieng Viet co dau, khong mang ten ma. */
export const ACTION_NOT_PERMITTED_MESSAGE = 'Bạn không có quyền thực hiện thao tác này.';
