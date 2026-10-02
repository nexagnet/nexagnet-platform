/**
 * MA TU CHOI DAU VAO cua mien DIEU XE (Lane M, #277).
 *
 * Tach khoi `dispatch-decisions.ts` theo dung quy uoc da co cua mien van tai: tep kia tra loi
 * "he thong QUYET DINH gi va vi sao" (nguoi doc trace), tep NAY tra loi "nguoi goi API da gui cai
 * gi sai" (nguoi bam nut).
 *
 * Tep nay CO Y khong import gi.
 */
export const TRANSPORT_DISPATCH_ERROR_REASONS = [
  /** Ma nghia vu thuong mai khong ton tai — hoac khong thuoc khach nay. Fail-closed nhu nhau. */
  'DISPATCH_ORDER_NOT_FOUND',
  /**
   * Mot nghia vu DA HUY khong con la mot cau hoi dieu xe. Tra ve mot danh sach ung vien cho no
   * se moi nguoi dung dieu mot chiec xe di lam mot viec khong con ton tai.
   */
  'DISPATCH_ORDER_CANCELLED',
  /**
   * KHONG BIET DIEM LAY HANG O DAU — tu mot tham chieu TUONG MINH ma he thong khong giai duoc thanh
   * mot cho duy nhat (vd mot dia diem co hai hang rao).
   *
   * Lay dai mot toa do — kho gan nhat, tam cua tinh, hay bai xe — se cho ra mot bang xep hang
   * trong y het mot bang xep hang that, va khong ai doc duoc no la gia. Nen cau tra loi dung la
   * NOI RA rang khong giai duoc.
   */
  'DISPATCH_PICKUP_LOCATION_UNRESOLVED',
  /**
   * DON CU KHONG MANG TOA DO DIEM LAY — va he thong CO Y khong doan.
   *
   * Tu #379, toa do tren don la su that cua diem lay; `originLabel` chi de hien thi. Mot don tao
   * truoc do co toa do NULL, va duong cu "noi nhan voi ten hang rao" da bi go: mot nhan trung ten
   * mot hang rao la mot su trung hop chinh ta, khong phai mot lan khao sat. Tach ma rieng khoi
   * `DISPATCH_PICKUP_LOCATION_UNRESOLVED` de man hinh biet chinh xac viec can lam: chi dinh diem lay
   * tuong minh khi dieu xe (POINT/SITE/GEOFENCE), chu khong phai "thu lai".
   */
  'DISPATCH_ORDER_PICKUP_COORDINATES_MISSING',
  /** Toa do nguoi goi gui khong qua duoc `parseGeoPoint` (ngoai bien, NaN, hoac Null Island). */
  'DISPATCH_POINT_INVALID',
  /** Ma dia diem/hang rao nguoi goi gui khong ton tai hoac da ngung hoat dong. */
  'DISPATCH_PLACE_REF_NOT_FOUND',
  /** Moc gio lay hang gui len khong phai mot khoanh khac doc duoc. */
  'DISPATCH_REQUIRED_PICKUP_AT_INVALID',
  /** Ma xe khong ton tai — dung khi BOSS xac nhan mot ung vien. */
  'DISPATCH_VEHICLE_NOT_FOUND',
  /**
   * BOSS chon mot chiec xe ma vong tinh lai KHONG con de nghi nua.
   *
   * `M9`: *"Re-check on commit because map results may be stale."* Ma nay la ket qua cua lan kiem
   * lai do — khong phai mot loi ky thuat, ma la mot cau tra loi nghiep vu: su that da doi giua luc
   * nhin va luc bam.
   */
  'DISPATCH_RECOMMENDATION_STALE',
  /**
   * Nghia vu nay DA duoc gan cho mot chiec xe KHAC. `L3` cam mot don nam tren hai chang co tai
   * cung luc, va cong that nam trong mot giao dich co khoa dong.
   */
  'DISPATCH_ORDER_ALREADY_ASSIGNED',
  /**
   * NHA CUNG CAP DINH TUYEN KHONG TRA LOI — va he thong KHONG tu xep hang bang duong chim bay.
   *
   * `M13`: *"routing provider failure degrades to typed `ROUTING_UNAVAILABLE`, not auto-select by
   * straight-line fallback unless owner explicitly configures that fallback."*
   */
  'DISPATCH_ROUTING_UNAVAILABLE',
  /** So diem yeu cau vuot tran ma tri cua chinh sach — chan tren chi phi, xem `M12`. */
  'DISPATCH_MATRIX_BOUND_EXCEEDED',
  /**
   * KHACH NAY KHONG O CHE DO GOM DON, nen ca be mat de nghi dieu xe khong ap dung.
   *
   * `#294 S-OWNER-02`: bang de nghi la mot toi uu CHI bat khi `transportPlanning.runGrouping =
   * MULTI_ORDER_RUN`. O che do mac dinh `ONE_ORDER_PER_RUN` thi moi don di mot vong chay rieng, va
   * cau hoi *"nen noi don nay vao chiec xe nao"* khong ton tai.
   *
   * `DENIED` (403) chu khong phai `NOT_FOUND` (404): hai duong nay CO THAT va van duoc dinh tuyen —
   * cai thieu la quyen cua KHACH doi voi nghiep vu do. Tra 404 se noi rang he thong nay khong co
   * tinh nang dieu xe, va do la mot cau sai: no co, khach nay khong bat.
   *
   * `DENIED` cung KHONG phai mot phan quyen theo vai: mot ADMIN day du quyen van nhan dung ma nay
   * o mot khach `ONE_ORDER_PER_RUN`. Truong `reason` la thu phan biet hai loai tu choi do — mot
   * man hinh doc `reason` se biet nen noi "ban khong co quyen" hay "khach nay khong dung tinh nang
   * nay", thay vi doan tu con so 403.
   */
  'DISPATCH_MULTI_ORDER_DISABLED',
] as const;
export type TransportDispatchErrorReason = (typeof TRANSPORT_DISPATCH_ERROR_REASONS)[number];
