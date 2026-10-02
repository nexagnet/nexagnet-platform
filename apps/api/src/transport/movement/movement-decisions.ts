import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/* ------------------------------------------------------------------ *
 * order.lifecycle_transition -- MovementService.transitionOrder()
 * ------------------------------------------------------------------ */
export const ORDER_TRANSITION_REASONS = [
  'ORDER_TRANSITION_APPLIED',
  'ORDER_ALREADY_TERMINAL',
  'ORDER_ALREADY_IN_STATE',
  'ORDER_TRANSITION_NOT_PERMITTED',
  'ORDER_CANCEL_REQUIRES_DEDICATED_PATH',
] as const;
export type OrderTransitionReason = (typeof ORDER_TRANSITION_REASONS)[number];

/* ------------------------------------------------------------------ *
 * order.cancel -- MovementService.cancelOrder()
 * ------------------------------------------------------------------ */
export const ORDER_CANCEL_REASONS = [
  'ORDER_CANCEL_RECORDED',
  'ORDER_CANCEL_ALREADY_CANCELLED',
  /**
   * Mot nghia vu DA HOAN THANH khong huy nguoc duoc o day. Dieu chinh mot viec da giao la mot
   * chung tu dieu chinh cong no, khong phai mot lan doi trang thai am tham tren don goc.
   */
  'ORDER_CANCEL_ALREADY_FULFILLED',
] as const;
export type OrderCancelReason = (typeof ORDER_CANCEL_REASONS)[number];

/* ------------------------------------------------------------------ *
 * run.lifecycle_transition -- MovementService.transitionRun()
 * ------------------------------------------------------------------ */
export const RUN_TRANSITION_REASONS = [
  'RUN_TRANSITION_APPLIED',
  'RUN_ALREADY_TERMINAL',
  /**
   * Phan xu lai TREN DUONG DA KHOA da doi y — `#293` R2.
   *
   * Su that doc truoc khi khoa noi "dong duoc"; su that doc SAU khi khoa noi khong. Giua hai luc do
   * mot nguoi lap ke hoach da them viec moi. Day la lop bao ve lam viec dung nhu thiet ke, khong
   * phai mot loi: ly do nghiep vu that nam trong so quyet dinh cua `planning.run_closure`.
   */
  'RUN_CLOSE_REVALIDATION_HELD',
  'RUN_ALREADY_IN_STATE',
  'RUN_TRANSITION_NOT_PERMITTED',
  'RUN_CANCEL_REQUIRES_DEDICATED_PATH',
  /**
   * DONG vong chay cung phai di duong rieng — va duong do la duong CUA HE THONG, khong phai mot
   * tham so cua nguoi goi. `#293` R1: sep/ke toan lam viec theo DON, va mot vong chay chi duoc
   * dong khi `evaluateRunClosure()` da cho phep. Xem `evaluateSystemRunClose()`.
   */
  'RUN_COMPLETE_REQUIRES_SYSTEM_PATH',
  /** Mot vong chay khong co chang nao thi khong co gi de chay. */
  'RUN_HAS_NO_LEG',
] as const;
export type RunTransitionReason = (typeof RUN_TRANSITION_REASONS)[number];

/* ------------------------------------------------------------------ *
 * run.cancel -- MovementService.cancelRun()
 * ------------------------------------------------------------------ */
export const RUN_CANCEL_REASONS = [
  'RUN_CANCEL_RECORDED',
  'RUN_CANCEL_ALREADY_CANCELLED',
  'RUN_CANCEL_ALREADY_COMPLETED',
] as const;
export type RunCancelReason = (typeof RUN_CANCEL_REASONS)[number];

/* ------------------------------------------------------------------ *
 * run.assignment_change -- MovementService.assignRun()
 * ------------------------------------------------------------------ */
export const RUN_ASSIGNMENT_REASONS = [
  'RUN_ASSIGNMENT_CREATED',
  'RUN_ASSIGNMENT_REPLACED',
  /** Phan cong lai dung nguoi dang cam lai: khong ghi ban thu hai, va noi ro vi sao. */
  'RUN_ASSIGNMENT_UNCHANGED',
  'RUN_ASSIGNMENT_RUN_TERMINAL',
] as const;
export type RunAssignmentReason = (typeof RUN_ASSIGNMENT_REASONS)[number];

/* ------------------------------------------------------------------ *
 * run.leg_change -- MovementService.addLeg()
 * ------------------------------------------------------------------ */
export const RUN_LEG_REASONS = [
  'LEG_ADDED',
  /**
   * BAT BIEN TRUNG TAM cua tranche. Mot chang chay rong khong mang nghia vu thuong mai -- neu no
   * mang duoc thi moi con so km rong sau do deu sai ma khong ai biet.
   */
  'LEG_EMPTY_CANNOT_CARRY_ORDER',
  'LEG_ORDER_NOT_FOUND',
  'LEG_ORDER_CANCELLED',
  'LEG_RUN_TERMINAL',
] as const;
export type RunLegReason = (typeof RUN_LEG_REASONS)[number];

/* ------------------------------------------------------------------ *
 * run.leg_transition -- MovementService.transitionLeg() / cancelLeg() (#276 Lane L)
 * ------------------------------------------------------------------ */
export const RUN_LEG_TRANSITION_REASONS = [
  'LEG_TRANSITION_APPLIED',
  /**
   * Chang da `COMPLETED`/`CANCELLED`. Voi `COMPLETED` day la lop chan THU NHAT; lop thu hai la
   * trigger `transport_run_leg_completed_is_immutable` duoi Postgres, chan ca `UPDATE` viet tay.
   */
  'LEG_ALREADY_TERMINAL',
  'LEG_ALREADY_IN_STATE',
  'LEG_TRANSITION_NOT_PERMITTED',
  'LEG_CANCEL_REQUIRES_DEDICATED_PATH',
  /**
   * Hoan tat chang CO HANG khi so ghi hien truong chua noi nguoi nhan da nhan hang — `#332`.
   *
   * Runtime 19/09/2026: chang `LOADED` thanh `COMPLETED` voi 0 moc, qua duong API dieu hanh. Ma nay
   * la cho hai truc su that gap nhau: trang thai chang khong duoc noi "xong" khi hien truong noi
   * "chua giao", tru khi nguoi goi GHI DE tuong minh.
   */
  'LEG_FIELD_DELIVERY_NOT_RECORDED',
  /**
   * Hoan tat chang CO HANG bang GHI DE tuong minh, co ly do — `#332`.
   *
   * Cho phep, nhung la mot ma RIENG chu khong phai `LEG_TRANSITION_APPLIED`: so quyet dinh phai dem
   * rieng duoc bao nhieu chang da dong trai voi hien truong, va dau vet kiem toan cua no la mot
   * hanh dong rieng (`transport.run.leg.complete.override`) mang ly do + giai doan hien truong.
   */
  'LEG_COMPLETED_BY_OVERRIDE',
] as const;
export type RunLegTransitionReason = (typeof RUN_LEG_TRANSITION_REASONS)[number];

export const RUN_LEG_CANCEL_REASONS = [
  'LEG_CANCEL_RECORDED',
  'LEG_CANCEL_ALREADY_CANCELLED',
  'LEG_CANCEL_ALREADY_COMPLETED',
  /**
   * Chang DA LAN BANH. Huy no la xoa mot quang duong co that khoi moi bao cao — xem khoi chu
   * thich cua `LEG_EDGES` trong `movement-lifecycle.ts`.
   */
  'LEG_CANCEL_ALREADY_STARTED',
] as const;
export type RunLegCancelReason = (typeof RUN_LEG_CANCEL_REASONS)[number];

/* ------------------------------------------------------------------ *
 * run.trip_projection -- MovementService.projectTrip()
 * ------------------------------------------------------------------ */
export const TRIP_PROJECTION_REASONS = [
  'PROJECTION_CREATED',
  /** Chay lai phep chieu tren cung mot chuyen: TAT DINH, khong sinh ban thu hai. */
  'PROJECTION_UNCHANGED',
  /**
   * Chuyen thue xe ngoai KHONG co vong chay cua xe minh. Chieu no ra mot `VehicleRun` la bia ra
   * mot vong chay vat ly chua bao gio ton tai, va lam km cua doi xe phong len.
   */
  'PROJECTION_TRIP_OUTSOURCED',
  /** Chua phan cong xe thi chua biet vong chay do la cua chiec nao. */
  'PROJECTION_TRIP_HAS_NO_VEHICLE',
] as const;
export type TripProjectionReason = (typeof TRIP_PROJECTION_REASONS)[number];

/* ------------------------------------------------------------------ *
 * order.trip_projection -- MovementService.projectTripOrder()
 * ------------------------------------------------------------------ */

/**
 * PHEP CHIEU THUONG MAI -- chuyen v1 -> NGHIA VU v2. Doc lap voi phep chieu dieu hanh o tren.
 *
 * `#275` K5 dat cong ket thuc len DON, nen cau hoi "don cua chuyen nay la don nao" phai tra loi
 * duoc CA cho mot chuyen thue nha xe ngoai -- thu ma `run.trip_projection` tu choi bang
 * `PROJECTION_TRIP_OUTSOURCED`. Hai phep chieu, hai bo dieu kien, hai bo ma ly do.
 */
export const ORDER_PROJECTION_REASONS = [
  'ORDER_PROJECTION_CREATED',
  /** Chay lai tren cung mot chuyen: TAT DINH, khong sinh don thu hai. */
  'ORDER_PROJECTION_UNCHANGED',
  /**
   * Chuyen khong gan khach nao. Mot "nghia vu thuong mai" khong co ben thue la mot nghia vu khong
   * ai no -- va mot chuyen dieu xe noi bo dung la khong no ai ca.
   */
  'ORDER_PROJECTION_TRIP_HAS_NO_CUSTOMER',
] as const;
export type OrderProjectionReason = (typeof ORDER_PROJECTION_REASONS)[number];

/* ------------------------------------------------------------------ *
 * order.location -- MovementService.createOrder() (#379)
 * ------------------------------------------------------------------ */

/**
 * TOA DO DIEM LAY / DIEM GIAO cua mot don moi.
 *
 * Bon ma, khong mot `boolean`: nguoi doc trace phai tach duoc "don co toa do" voi "don tao qua
 * duong noi bo khong co toa do" (chieu tu chuyen v1) va voi HAI duong tu choi -- vi dieu xe sau do
 * hanh xu khac nhau voi tung truong hop. `detail` KHONG mang toa do: vi tri lay/giao hang cua khach
 * la du lieu nghiep vu, khong phai du lieu quan sat.
 */
export const ORDER_LOCATION_REASONS = [
  /** Ca hai diem da qua `parseGeoPoint` va duoc ghi. */
  'ORDER_LOCATION_CAPTURED',
  /**
   * Tao don THIEU it nhat mot diem -- chi duong noi bo (fixture, cong cu van hanh) di duoc toi day,
   * vi bien HTTP bat buoc ca hai. Ghi rieng de dem duoc bao nhieu don sinh ra ma dieu xe khong tu
   * giai duoc diem lay/giao. (Phep chieu tu chuyen v1 ghi don qua repository va co quyet dinh rieng
   * `order.trip_projection`; toa do cua no luon `null`.)
   */
  'ORDER_LOCATION_ABSENT',
  'ORDER_ORIGIN_POINT_REJECTED',
  'ORDER_DESTINATION_POINT_REJECTED',
] as const;
export type OrderLocationReason = (typeof ORDER_LOCATION_REASONS)[number];

export type TransportMovementDecisionReason =
  | OrderTransitionReason
  | OrderCancelReason
  | RunTransitionReason
  | RunCancelReason
  | RunAssignmentReason
  | RunLegReason
  | RunLegTransitionReason
  | RunLegCancelReason
  | TripProjectionReason
  | OrderProjectionReason
  | OrderLocationReason;

export const TRANSPORT_MOVEMENT_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-core',
  points: [
    'order.lifecycle_transition',
    'order.cancel',
    'run.lifecycle_transition',
    'run.cancel',
    'run.assignment_change',
    'run.leg_change',
    'run.leg_transition',
    'run.leg_cancel',
    'run.trip_projection',
    'order.trip_projection',
    'order.location',
  ],
  labels: {
    ORDER_TRANSITION_APPLIED: 'Da doi trang thai nghia vu thuong mai',
    ORDER_ALREADY_TERMINAL: 'Nghia vu da o trang thai cuoi',
    ORDER_ALREADY_IN_STATE: 'Nghia vu da o dung trang thai nay',
    ORDER_TRANSITION_NOT_PERMITTED: 'May trang thai khong cho phep buoc chuyen nay',
    ORDER_CANCEL_REQUIRES_DEDICATED_PATH: 'Huy nghia vu phai di duong huy rieng',
    ORDER_CANCEL_RECORDED: 'Da huy nghia vu thuong mai',
    ORDER_CANCEL_ALREADY_CANCELLED: 'Nghia vu da huy tu truoc',
    ORDER_CANCEL_ALREADY_FULFILLED:
      'Nghia vu da hoan thanh: dieu chinh bang chung tu cong no, khong huy nguoc',
    RUN_TRANSITION_APPLIED: 'Da doi trang thai vong chay',
    RUN_ALREADY_TERMINAL: 'Vong chay da o trang thai cuoi',
    RUN_CLOSE_REVALIDATION_HELD: 'Phan xu lai duoi khoa da giu vong chay lai',
    RUN_ALREADY_IN_STATE: 'Vong chay da o dung trang thai nay',
    RUN_TRANSITION_NOT_PERMITTED: 'May trang thai khong cho phep buoc chuyen nay',
    RUN_CANCEL_REQUIRES_DEDICATED_PATH: 'Huy vong chay phai di duong huy rieng',
    RUN_COMPLETE_REQUIRES_SYSTEM_PATH:
      'Dong vong chay la quyet dinh cua he thong: khong co duong nao de nguoi dung tu dong no',
    RUN_HAS_NO_LEG: 'Vong chay chua co chang nao de chay',
    RUN_CANCEL_RECORDED: 'Da huy vong chay',
    RUN_CANCEL_ALREADY_CANCELLED: 'Vong chay da huy tu truoc',
    RUN_CANCEL_ALREADY_COMPLETED: 'Vong chay da hoan thanh, khong huy nguoc',
    RUN_ASSIGNMENT_CREATED: 'Da giao lai xe cam vong chay',
    RUN_ASSIGNMENT_REPLACED: 'Da doi lai xe, ban phan cong cu duoc dong lai',
    RUN_ASSIGNMENT_UNCHANGED: 'Van dung lai xe do, khong ghi them ban phan cong',
    RUN_ASSIGNMENT_RUN_TERMINAL: 'Vong chay da o trang thai cuoi, khong doi lai xe duoc',
    LEG_ADDED: 'Da them chang vao vong chay',
    LEG_EMPTY_CANNOT_CARRY_ORDER: 'Chang chay rong khong duoc mang nghia vu thuong mai',
    LEG_ORDER_NOT_FOUND: 'Khong tim thay nghia vu thuong mai de gan vao chang',
    LEG_ORDER_CANCELLED: 'Nghia vu do da huy, khong gan vao chang duoc',
    LEG_RUN_TERMINAL: 'Vong chay da o trang thai cuoi, khong them chang duoc',
    LEG_TRANSITION_APPLIED: 'Da doi trang thai chang',
    LEG_ALREADY_TERMINAL: 'Chang da o trang thai cuoi',
    LEG_ALREADY_IN_STATE: 'Chang da o dung trang thai nay',
    LEG_TRANSITION_NOT_PERMITTED: 'May trang thai khong cho phep buoc chuyen nay',
    LEG_CANCEL_REQUIRES_DEDICATED_PATH: 'Huy chang phai di duong huy rieng',
    LEG_FIELD_DELIVERY_NOT_RECORDED:
      'Hien truong chua ghi nguoi nhan da nhan hang — chua hoan tat duoc chang co hang',
    LEG_COMPLETED_BY_OVERRIDE:
      'Hoan tat chang co hang bang ghi de tuong minh, trai voi hien truong',
    LEG_CANCEL_RECORDED: 'Da huy chang chua chay',
    LEG_CANCEL_ALREADY_CANCELLED: 'Chang da huy tu truoc',
    LEG_CANCEL_ALREADY_COMPLETED: 'Chang da chay xong, khong huy nguoc',
    LEG_CANCEL_ALREADY_STARTED: 'Chang da lan banh: dong lai voi su that cua no, khong huy',
    PROJECTION_CREATED: 'Da chieu chuyen v1 sang vong chay v2',
    PROJECTION_UNCHANGED: 'Chuyen nay da duoc chieu tu truoc, khong sinh ban thu hai',
    PROJECTION_TRIP_OUTSOURCED: 'Chuyen thue xe ngoai khong co vong chay cua xe minh',
    PROJECTION_TRIP_HAS_NO_VEHICLE: 'Chuyen chua phan cong xe nen chua biet vong chay cua xe nao',
    ORDER_PROJECTION_CREATED: 'Da chieu chuyen v1 sang nghia vu thuong mai v2',
    ORDER_PROJECTION_UNCHANGED: 'Chuyen nay da co nghia vu thuong mai, khong sinh ban thu hai',
    ORDER_PROJECTION_TRIP_HAS_NO_CUSTOMER:
      'Chuyen khong gan khach hang nen khong co nghia vu thuong mai nao',
    ORDER_LOCATION_CAPTURED: 'Da ghi toa do diem lay va diem giao cua don',
    ORDER_LOCATION_ABSENT:
      'Don tao thieu toa do diem lay hoac diem giao: dieu xe khong tu suy ra duoc diem do',
    ORDER_ORIGIN_POINT_REJECTED: 'Toa do diem lay hang khong hop le, tu choi tao don',
    ORDER_DESTINATION_POINT_REJECTED: 'Toa do diem giao hang khong hop le, tu choi tao don',
  } satisfies Record<TransportMovementDecisionReason, string>,
});
