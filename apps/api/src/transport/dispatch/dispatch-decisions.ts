import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH cua mien DIEU XE (Lane M, #277).
 *
 * `#277 M6` cam mot dieu rat cu the: *"Do not create one opaque magic score whose meaning cannot
 * be inspected."* Tep nay la nua sau cua loi cam do — nua truoc la `dispatch-ranking.ts`, von xep
 * hang bang mot danh sach KHOA CO TEN thay vi mot con so. O day la cac ma ma mot nguoi doc trace
 * dung de tra loi *"vi sao xe nay khong duoc de nghi"* ma khong phai mo source ra doc lai.
 */

/* ------------------------------------------------------------------ *
 * dispatch.pickup_resolution -- diem lay hang cua don nam o dau
 * ------------------------------------------------------------------ */
/*
 * THU TU GIAI DIEM LAY HANG (#379): tham chieu TUONG MINH cua nguoi goi > toa do luu tren DON >
 * tu choi co kieu. Khong con buoc nao doc `originLabel` de doan toa do — nhan chu chi de hien thi.
 *
 * Bon ma theo NHAN (`PICKUP_FROM_GEOFENCE_LABEL` ... `PICKUP_LABEL_AMBIGUOUS`) van ton tai vi ham
 * giai nhan van phuc vu diem den cua CHANG (chang chua mang toa do) va `resolvePlaceBySiteId` van
 * tra `PICKUP_LABEL_AMBIGUOUS` khi mot dia diem co hai hang rao. Chung khong con xuat hien o diem
 * quyet dinh `dispatch.pickup_resolution` cho duong mac dinh nua.
 */
export const DISPATCH_PICKUP_RESOLUTION_REASONS = [
  /** Nguoi goi gui thang mot toa do / ma dia diem. Khong phai doan gi, va THANG toa do cua don. */
  'PICKUP_FROM_EXPLICIT_REQUEST',
  /** Duong MAC DINH: toa do diem lay do nguoi nhap don chon, luu tren chinh don. */
  'PICKUP_FROM_ORDER_COORDINATES',
  /**
   * DON CU — tao truoc khi don mang toa do. KHONG roi ve nhan chu: mot nhan trung ten mot hang rao
   * chi la mot su trung hop chinh ta, va #379 chot toa do la su that duy nhat cua diem lay.
   */
  'PICKUP_ORDER_COORDINATES_MISSING',
  /**
   * Toa do luu tren don khong qua `parseGeoPoint` (du lieu hong/ghi tay). Rang buoc CHECK cua bang
   * da chan duong nay; ma nay la lop phong thu thu hai, khong phai mot duong nghiep vu.
   */
  'PICKUP_ORDER_COORDINATES_REJECTED',
  /** Nhan chang trung KHIT ten mot hang rao dang hoat dong. */
  'PICKUP_FROM_GEOFENCE_LABEL',
  /** Nhan chang trung KHIT ten mot dia diem phap nhan CO hang rao. */
  'PICKUP_FROM_COUNTERPARTY_SITE',
  /** Khong cho nao trong he thong mang cai ten do. KHONG lay dai mot toa do gan gan. */
  'PICKUP_LABEL_NO_MATCH',
  /**
   * HAI cho tro len mang cung mot ten. Chon bua mot cai la mot lua chon 50/50 doi lot mot ket
   * qua tinh toan — te hon han viec noi "khong biet".
   */
  'PICKUP_LABEL_AMBIGUOUS',
  'PICKUP_REQUEST_POINT_REJECTED',
  'PICKUP_REQUEST_REF_NOT_FOUND',
] as const;
export type DispatchPickupResolutionReason = (typeof DISPATCH_PICKUP_RESOLUTION_REASONS)[number];

/* ------------------------------------------------------------------ *
 * dispatch.candidate_filter -- xe nao KHONG vao bang de nghi, va vi sao
 * ------------------------------------------------------------------ */
export const DISPATCH_CANDIDATE_FILTER_REASONS = [
  'CANDIDATE_ADMITTED',
  /**
   * XE KHONG PHAI DOI XE NOI BO. `M1`: *"external-carrier vehicles must not enter B internal-fleet
   * recommendation."* `TransportVehicle.operationalControl` la truc DIEU HANH, doc lap voi so huu
   * (#242 E1) — mot xe dong so huu ma B van dieu hanh VAN la xe noi bo.
   */
  'VEHICLE_NOT_INTERNALLY_OPERATED',
  /**
   * Xe dang co lenh sua MO nen phep hop thanh (#88 §18.2) xep no `UNDER_MAINTENANCE`.
   *
   * Day la ma DUY NHAT trong tep nay den tu `transport-asset-compliance`, va no CHI loai khi
   * `evaluateDispatchReadiness().blocking` co noi dung. Hom nay danh sach do RONG theo dung #237
   * (`Q-05` chua co nguon), nen ma nay hom nay khong bao gio duoc phat — no ton tai de ngay B tra
   * loi `Q-05` thi thay doi la mot dong cau hinh, khong phai mot cong moi giua duong dieu xe.
   */
  'VEHICLE_DISPATCH_BLOCKED_BY_POLICY',
  /** Tai trong cho phep cua xe nho hon khoi luong nguoi dieu xe khai cho don nay. */
  'VEHICLE_PAYLOAD_BELOW_REQUIREMENT',
  /** Nguoi dieu xe yeu cau mot hang xe cu the va xe nay khong thuoc hang do. */
  'VEHICLE_CLASS_NOT_REQUESTED',
  /**
   * KHONG BIET XE DANG O DAU VA CUNG KHONG BIET NO SE RANH O DAU.
   *
   * Khong phai mot loi. Mot chiec xe chua bao gio bat bam vi tri va chua co viec nao trong ke
   * hoach thi khong co MOT diem nao de do khoang cach tu do — va bia ra bai xe lam diem xuat phat
   * se cho ra mot so km rong hoan toan tuong tuong.
   */
  'VEHICLE_HAS_NO_USABLE_ORIGIN',
] as const;
export type DispatchCandidateFilterReason = (typeof DISPATCH_CANDIDATE_FILTER_REASONS)[number];

/* ------------------------------------------------------------------ *
 * dispatch.route_estimate -- chat luong con so km/ETA
 * ------------------------------------------------------------------ */
export const DISPATCH_ROUTE_ESTIMATE_REASONS = [
  'ROUTE_FROM_PROVIDER',
  'ROUTE_FROM_CACHE',
  /**
   * KHONG co nha cung cap dinh tuyen nao duoc cau hinh, nen con so la mot UOC LUONG TONG HOP.
   *
   * Ket qua VAN duoc tra ve, nhung mang nhan `SYNTHETIC` di suot toi tan DTO. `M5` cho phep dung
   * ho so tong hop cho ban xem truoc/CI voi dung mot dieu kien: *"clearly labeled as synthetic"*.
   */
  'ROUTE_SYNTHETIC_ESTIMATE',
  /** Nha cung cap tra loi nhung khong co duong nao noi hai diem (dao, sai toa do). */
  'ROUTE_NOT_FOUND',
  'ROUTE_PROVIDER_UNAVAILABLE',
  'ROUTE_PROVIDER_RATE_LIMITED',
  'ROUTE_REQUEST_BOUND_EXCEEDED',
] as const;
export type DispatchRouteEstimateReason = (typeof DISPATCH_ROUTE_ESTIMATE_REASONS)[number];

/* ------------------------------------------------------------------ *
 * dispatch.run_grouping -- khach nay CO bai toan dieu xe nhieu don khong
 * ------------------------------------------------------------------ */
/**
 * CONG DAU TIEN cua ca mien, va la cong DUY NHAT khong noi gi ve nhung chiec xe.
 *
 * `#294 S-OWNER-02` chot rang bang de nghi dieu xe la mot TOI UU TUY CHON, khong phai hanh vi mac
 * dinh: no chi ton tai khi khach khai `transportPlanning.runGrouping = MULTI_ORDER_RUN`. O che do
 * mac dinh `ONE_ORDER_PER_RUN`, moi don di mot vong chay rieng, nen cau hoi *"nen noi don nay vao
 * chiec xe nao"* KHONG CO THAT — va mot he thong tra loi mot cau hoi khong co that la mot he thong
 * moi nguoi dung lam sai.
 *
 * Hai ma chu khong phai mot `boolean`: nguoi doc trace phai phan biet duoc *"khach nay tat tinh
 * nang"* voi *"khach nay bat, va day la ket qua"*. `#294 S-OWNER-03` doi dung dieu do khi cam giau
 * cong chan trong React — mot cai nut bien mat khong de lai dau vet nao, mot ma quyet dinh thi co.
 */
export const DISPATCH_RUN_GROUPING_REASONS = [
  /** Khach khai `MULTI_ORDER_RUN`. Bang de nghi duoc phep tinh — va VAN chi la de nghi. */
  'RUN_GROUPING_MULTI_ORDER_RUN',
  /**
   * Khach o che do `ONE_ORDER_PER_RUN` — ke ca khi do la MAC DINH vi khach khong khai gi.
   *
   * Khong tach "khong khai" khoi "khai ONE" thanh hai ma: ve mat nghiep vu chung la MOT cau tra
   * loi ("khach nay khong gom don"), va `planning-policy.ts` da giai hai truong hop do ve cung mot
   * gia tri tu truoc khi mien nay nhin thay no.
   */
  'RUN_GROUPING_ONE_ORDER_PER_RUN',
] as const;
export type DispatchRunGroupingReason = (typeof DISPATCH_RUN_GROUPING_REASONS)[number];

/* ------------------------------------------------------------------ *
 * dispatch.commit -- BOSS bam xac nhan; day la cho DUY NHAT co lan ghi
 * ------------------------------------------------------------------ */
export const DISPATCH_COMMIT_REASONS = [
  'COMMIT_PLANNED',
  /**
   * BAM LAI LAN THU HAI. Don da nam tren dung chiec xe do roi, nen khong ghi them gi va noi ro
   * rang khong ghi. `M15` doi dung dieu nay: *"repeat click does not duplicate Run/Leg."*
   */
  'COMMIT_ALREADY_PLANNED_ON_SAME_VEHICLE',
  'COMMIT_ORDER_ALREADY_ON_OTHER_VEHICLE',
  /** Su that ve chiec xe da doi giua luc nhin bang de nghi va luc bam. Xem `M9`. */
  'COMMIT_REVALIDATION_FAILED',
  'COMMIT_ORDER_CANCELLED',
] as const;
export type DispatchCommitReason = (typeof DISPATCH_COMMIT_REASONS)[number];

export type TransportDispatchDecisionReason =
  | DispatchPickupResolutionReason
  | DispatchCandidateFilterReason
  | DispatchRouteEstimateReason
  | DispatchRunGroupingReason
  | DispatchCommitReason;

export const TRANSPORT_DISPATCH_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-dispatch',
  points: [
    /*
     * DAT DAU TIEN vi no CHAY dau tien: neu khach khong o che do `MULTI_ORDER_RUN` thi khong mot
     * diem quyet dinh nao ben duoi duoc phat ra ca — khong co diem lay hang nao duoc giai, khong
     * chiec xe nao bi loai, khong mot lan goi dinh tuyen nao. Mot trace cua che do ONE la mot
     * trace CHI co dong nay, va do la cach doc nhanh nhat de biet vi sao bang de nghi trong rong.
     */
    'dispatch.run_grouping',
    'dispatch.pickup_resolution',
    'dispatch.candidate_filter',
    'dispatch.route_estimate',
    'dispatch.commit',
  ],
  labels: {
    PICKUP_FROM_EXPLICIT_REQUEST: 'Diem lay hang do nguoi dieu xe chi dinh',
    PICKUP_FROM_ORDER_COORDINATES: 'Diem lay hang lay tu toa do luu tren don',
    PICKUP_ORDER_COORDINATES_MISSING:
      'Don cu chua co toa do diem lay — khong suy tu nhan chu, can chi dinh tuong minh',
    PICKUP_ORDER_COORDINATES_REJECTED: 'Toa do diem lay luu tren don khong hop le',
    PICKUP_FROM_GEOFENCE_LABEL: 'Nhan dia diem khop ten mot hang rao dang hoat dong',
    PICKUP_FROM_COUNTERPARTY_SITE: 'Nhan dia diem khop mot dia diem phap nhan co hang rao',
    PICKUP_LABEL_NO_MATCH: 'Khong cho nao trong he thong mang nhan dia diem nay',
    PICKUP_LABEL_AMBIGUOUS: 'Nhieu cho cung mang ten do — khong chon thay nguoi dung',
    PICKUP_REQUEST_POINT_REJECTED: 'Toa do gui len khong hop le',
    PICKUP_REQUEST_REF_NOT_FOUND: 'Ma dia diem gui len khong ton tai hoac da ngung',
    CANDIDATE_ADMITTED: 'Xe du dieu kien vao bang de nghi',
    VEHICLE_NOT_INTERNALLY_OPERATED: 'Xe khong do minh dieu hanh',
    VEHICLE_DISPATCH_BLOCKED_BY_POLICY: 'Chinh sach hien hanh cam dieu chiec xe nay',
    VEHICLE_PAYLOAD_BELOW_REQUIREMENT: 'Tai trong cho phep thap hon yeu cau cua don',
    VEHICLE_CLASS_NOT_REQUESTED: 'Hang xe khong dung yeu cau cua don',
    VEHICLE_HAS_NO_USABLE_ORIGIN: 'Khong biet xe dang o dau va cung chua biet no se ranh o dau',
    ROUTE_FROM_PROVIDER: 'Quang duong/thoi gian lay tu nha cung cap dinh tuyen',
    ROUTE_FROM_CACHE: 'Dung lai ket qua dinh tuyen con han trong bo nho dem',
    ROUTE_SYNTHETIC_ESTIMATE: 'Uoc luong tong hop — chua noi voi nha cung cap dinh tuyen nao',
    ROUTE_NOT_FOUND: 'Nha cung cap khong tim duoc duong bo noi hai diem',
    ROUTE_PROVIDER_UNAVAILABLE: 'Nha cung cap dinh tuyen khong tra loi',
    ROUTE_PROVIDER_RATE_LIMITED: 'Nha cung cap dinh tuyen dang chan vi vuot han muc',
    ROUTE_REQUEST_BOUND_EXCEEDED: 'So diem yeu cau vuot tran ma tran cua chinh sach',
    RUN_GROUPING_MULTI_ORDER_RUN: 'Khach o che do gom nhieu don mot vong chay — duoc phep de nghi',
    RUN_GROUPING_ONE_ORDER_PER_RUN:
      'Khach o che do moi don mot vong chay — khong co bai toan de nghi dieu xe',
    COMMIT_PLANNED: 'Da ghi ke hoach: don nam tren vong chay cua chiec xe duoc chon',
    COMMIT_ALREADY_PLANNED_ON_SAME_VEHICLE: 'Don da nam tren dung chiec xe do — khong ghi them',
    COMMIT_ORDER_ALREADY_ON_OTHER_VEHICLE: 'Don da duoc gan cho mot chiec xe khac',
    COMMIT_REVALIDATION_FAILED: 'Su that ve chiec xe da doi ke tu luc de nghi duoc tinh',
    COMMIT_ORDER_CANCELLED: 'Nghia vu thuong mai da huy',
  } satisfies Record<TransportDispatchDecisionReason, string>,
});
