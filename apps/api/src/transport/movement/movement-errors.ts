/**
 * MA TU CHOI DAU VAO cua mien van chuyen v2.
 *
 * Tach khoi `movement-decisions.ts` theo dung quy uoc da co: tep kia tra loi "he thong QUYET DINH
 * gi va vi sao" (nguoi doc trace), tep nay tra loi "nguoi goi da gui cai gi sai" (nguoi goi API).
 *
 * Tep nay CO Y khong import gi: giu canh `movement -> transport-core` la mot canh chi ton tai luc
 * bien dich.
 */
export const TRANSPORT_MOVEMENT_ERROR_REASONS = [
  'ORDER_NOT_FOUND',
  'ORDER_CODE_TAKEN',
  'ORDER_CUSTOMER_NOT_FOUND',
  /**
   * #379: toa do diem lay / diem giao bi `parseGeoPoint` tu choi (ngoai khoang, khong huu han, hoac
   * (0, 0) -- dau hieu dinh vi CHUA CO). Hai ma rieng de giao dien chi dung o sai.
   */
  'ORDER_ORIGIN_POINT_INVALID',
  'ORDER_DESTINATION_POINT_INVALID',
  'RUN_NOT_FOUND',
  'RUN_CODE_TAKEN',
  'RUN_VEHICLE_NOT_FOUND',
  'RUN_DRIVER_NOT_FOUND',
  'RUN_LEG_NOT_FOUND',
  /** `@@unique([runId, sequence])` -- hai chang cung so thu tu trong mot vong chay. */
  'RUN_LEG_SEQUENCE_TAKEN',
  /** Hai nguoi cung doi lai xe mot luc; unique mot phan o DB la thu bat duoc. */
  'RUN_ACTIVE_ASSIGNMENT_CONFLICT',
  'MOVEMENT_MONEY_INVALID',
  'MOVEMENT_BUSINESS_DATE_INVALID',
  'PROJECTION_TRIP_NOT_FOUND',
] as const;
export type TransportMovementErrorReason = (typeof TRANSPORT_MOVEMENT_ERROR_REASONS)[number];
