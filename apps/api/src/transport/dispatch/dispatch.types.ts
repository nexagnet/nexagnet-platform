import type { GeoPoint } from '../geo/geo-point.js';
import type { AccuracyGrade } from '../geo/location-quality.js';
import type { LocationSource } from '../proof/tracking.types.js';
import type {
  DispatchCandidateFilterReason,
  DispatchPickupResolutionReason,
  DispatchRouteEstimateReason,
} from './dispatch-decisions.js';
import type { DispatchOrderingKey } from './dispatch-policy.js';
import type { RouteEstimateQuality, TruckProfile } from './routing/routing.types.js';

/**
 * KIEU CUA MIEN DIEU XE — tang thuan: khong `@nestjs`, khong Prisma, khong I/O, khong dong ho.
 *
 * ===========================================================================
 * BA SU THAT KHAC NHAU, BA KIEU KHAC NHAU — va chung khong doi cho cho nhau duoc (`#277 M10`):
 *
 *   `VehicleCurrentState`  BANG CHUNG QUAN SAT DUOC. Mot ban dinh vi that, do may chu nhan, co
 *                          tuoi va co sai so. KHONG BAO GIO bi ghi de boi ket qua dinh tuyen.
 *   `VehicleNextFree`      PHEP CHIEU tu viec da nhan. Suy ra, khong luu, khong phai su that thu
 *                          hai ve chiec xe.
 *   `RouteEstimate`        UOC LUONG cua nha cung cap. Mot du bao, khong phai mot lan do.
 */

/* ------------------------------------------------------------------ *
 * DIA DIEM
 * ------------------------------------------------------------------ */

export type DispatchPlaceSource =
  | 'EXPLICIT_REQUEST_POINT'
  | 'EXPLICIT_REQUEST_SITE'
  | 'EXPLICIT_REQUEST_GEOFENCE'
  /**
   * Toa do diem LAY luu tren chinh don (`Order.originPoint`, #379). La su that nghiep vu do nguoi
   * nhap don chon tren ban do — khong phai vi tri cua ai, nen khong bao gio bi che.
   */
  | 'ORDER_PICKUP_POINT'
  /** Toa do diem GIAO luu tren don (`Order.destinationPoint`) — dung lam diem den cua chang co tai. */
  | 'ORDER_DELIVERY_POINT'
  /**
   * Hai nguon theo NHAN duoi day chi con song o chang (chang chua mang toa do) va o chang cua don
   * cu. Diem lay hang cua don KHONG BAO GIO di qua chung nua.
   */
  | 'GEOFENCE_LABEL_EXACT'
  | 'COUNTERPARTY_SITE_GEOFENCE'
  /** Diem den tu mot ban dinh vi cua chinh chiec xe — chi dung cho diem xuat phat `CURRENT_NEAR`. */
  | 'VEHICLE_OBSERVATION';

/**
 * MOT CHO da co toa do, KEM chuoi noi ve toa do do o dau ra.
 *
 * `source` khong phai trang tri: mot diem lay hang giai duoc tu ten hang rao va mot diem do nguoi
 * dieu xe go tay tren ban do la hai muc do tin cay khac nhau, va nguoi doc ket qua phai phan biet
 * duoc — nhat la khi ho sap dieu mot chiec xe 200 km theo no.
 */
export interface ResolvedPlace {
  readonly point: GeoPoint;
  readonly source: DispatchPlaceSource;
  /** Nhan NGUOI doc duoc. Voi hang rao/dia diem la ten cua no; voi toa do go tay la mo ta ngan. */
  readonly label: string;
  readonly geofenceId: string | null;
  readonly siteId: string | null;
}

/**
 * MOT CHO DANG HIEN RA — giong `ResolvedPlace` tru mot diem: TOA DO CO THE VANG MAT.
 *
 * Chi mot nguon can den kieu nay: diem xuat phat `CURRENT_NEAR` LA vi tri cua chiec xe, tuc vi tri
 * cua nguoi dang lai no. Neu `VehicleCurrentLocationView.point` bi che ma truong nay khong, thi
 * phep che kia vo nghia — du lieu bi giau o mot o roi lo nguyen ven o o ben canh.
 *
 * `point: null` chu KHONG phai mot toa do thay the: `parseGeoPoint()` tu choi (0,0) dung vi mot
 * toa do gia se di tiep qua moi phep tinh nhu that.
 */
export interface ResolvedPlaceView {
  readonly point: GeoPoint | null;
  readonly pointRedacted: boolean;
  readonly source: DispatchPlaceSource;
  readonly label: string;
  readonly geofenceId: string | null;
  readonly siteId: string | null;
}

export type PlaceResolution =
  | {
      readonly ok: true;
      readonly place: ResolvedPlace;
      readonly reason: DispatchPickupResolutionReason;
    }
  | { readonly ok: false; readonly reason: DispatchPickupResolutionReason };

/* ------------------------------------------------------------------ *
 * TRANG THAI HIEN TAI cua mot chiec xe
 * ------------------------------------------------------------------ */

/**
 * BA MUC TUOI, khong phai hai.
 *
 * `AGEING` ton tai vi mot ban dinh vi 45 phut tuoi VAN dung duoc de xep hang mot doi xe (chiec xe
 * khong the di xa hon 45 phut duong), nhung nguoi doc phai thay no khac mot ban vua nhan xong.
 * Gop `AGEING` vao `FRESH` se lam mot vi tri cu trong y het mot vi tri song; gop no vao `STALE` se
 * vut bo phan lon du lieu that cua mot doi xe co song chap chon.
 */
export type LocationFreshness = 'FRESH' | 'AGEING' | 'STALE';

export interface VehicleCurrentLocation {
  readonly point: GeoPoint;
  /** Dong ho MAY CHU (`receivedAt`), ISO. Khong bao gio la dong ho may khach — xem `#235`. */
  readonly observedAt: string;
  readonly ageSeconds: number;
  readonly freshness: LocationFreshness;
  readonly accuracyGrade: AccuracyGrade;
  readonly source: LocationSource;
  /**
   * `null` khi ban dinh vi den tu PHAN CUNG TREN XE — no khong thuoc ca lam viec cua ai (`#297` T4).
   *
   * Giu truong nay thay vi bo di: `source` noi ban nay den tu dau, con `sessionId` noi no den tu
   * CA LAM VIEC NAO — va khi co, do la duong lan ra lai xe dang cam may. Mot `null` o day la mot
   * cau tra loi that ("khong ca nao ca"), khong phai mot khoang thieu.
   */
  readonly sessionId: string | null;
}

export type VehicleCurrentUnknownReason =
  /** Khach nay khong bat `transport-proof` — khong co tang bam vi tri nao ca. */
  | 'LOCATION_CAPABILITY_ABSENT'
  /** Chiec xe nay chua bao gio co mot phien bam vi tri nao. */
  | 'NO_TRACKING_SESSION'
  /** Co phien, nhung chua mot ban dinh vi nao duoc gui len. */
  | 'NO_OBSERVATION';

export type VehicleCurrentState =
  | { readonly known: true; readonly location: VehicleCurrentLocation }
  | { readonly known: false; readonly reason: VehicleCurrentUnknownReason };

/* ------------------------------------------------------------------ *
 * NOI/LUC XE SE RANH TIEP THEO — mot PHEP CHIEU
 * ------------------------------------------------------------------ */

/**
 * `COMPLETE`  moi chang con lai deu giai duoc ra toa do va deu duoc dinh tuyen.
 * `PARTIAL`   biet CHO se ranh nhung khong biet BAO GIO (hoac nguoc lai). Van dung duoc, co dieu
 *             kien, va DTO phai noi ra dieu kien do.
 * `UNKNOWN`   khong noi duoc gi. `#277 M1`: *"never invent depot/zero ETA."*
 */
export type NextFreeCompleteness = 'COMPLETE' | 'PARTIAL' | 'UNKNOWN';

export type NextFreeGapReason =
  /** Chang cuoi cung tro toi mot nhan dia diem khong giai duoc ra toa do. */
  | 'FINAL_DESTINATION_UNRESOLVED'
  /** Mot chang o giua khong giai duoc, nen tong thoi gian con lai bi thieu mot doan. */
  | 'INTERMEDIATE_LEG_UNRESOLVED'
  /** Khong biet xe dang o dau, nen khong tinh duoc thoi gian cua doan dang di do. */
  | 'CURRENT_POSITION_UNKNOWN'
  /** Nha cung cap dinh tuyen khong tra loi cho mot trong cac doan con lai. */
  | 'ROUTING_UNAVAILABLE_FOR_REMAINING_LEG';

export interface VehicleNextFree {
  readonly completeness: NextFreeCompleteness;
  /** Cho xe se ranh. `null` khi `UNKNOWN`. */
  readonly place: ResolvedPlace | null;
  /** Luc xe se ranh, ISO. `null` khi khong tinh duoc. */
  readonly availableAt: string | null;
  /**
   * `true` nghia la "KHONG SOM HON luc nay" chu khong phai "dung luc nay".
   *
   * Hom nay LUON `true` khi co gio, vi `stopServiceSeconds` mac dinh la 0 — xem khoi chu thich cua
   * no trong `dispatch-policy.ts`. Giu lai mot truong thay vi mot hang so de ngay B chot dinh muc
   * thoi gian tai diem dung, DTO khong phai doi hinh dang.
   */
  readonly availableAtIsLowerBound: boolean;
  /** Cac chang CHUA xong da duoc dung de suy ra ket qua nay — nguon truy nguoc duoc. */
  readonly remainingLegIds: readonly string[];
  /** Cac nghia vu thuong mai dang nam tren nhung chang do. */
  readonly remainingOrderIds: readonly string[];
  readonly gaps: readonly NextFreeGapReason[];
}

/* ------------------------------------------------------------------ *
 * UNG VIEN
 * ------------------------------------------------------------------ */

/**
 * `CURRENT_NEAR`   diem xuat phat la CHO XE DANG DUNG.
 * `NEXT_FREE_NEAR` diem xuat phat la CHO XE SE RANH sau khi lam xong viec da nhan.
 *
 * Voi mot chiec xe ranh, hai gia tri nay tro ve cung mot cho va he thong chi phat `CURRENT_NEAR`:
 * phat ca hai se lam bang de nghi dai gap doi ma khong them mot su that nao.
 */
export type DispatchCandidateMode = 'CURRENT_NEAR' | 'NEXT_FREE_NEAR';

export type DispatchSuitabilityFlag =
  /**
   * NHAN NAY SE CAT NGANG MOT VIEC DANG LAM. Xem khoa `NO_WORK_INTERRUPTION`.
   *
   * Mot canh bao, KHONG phai mot cong chan: co truong hop cat ngang la dung (don gap, hang dang
   * cho o dung tuyen). Nguoi quyet la boss, khong phai bang xep hang.
   */
  | 'WOULD_INTERRUPT_COMMITTED_WORK'
  /** Ban dinh vi dung lam diem xuat phat da cu (`AGEING`). Van dung, nhung noi ra. */
  | 'CURRENT_LOCATION_AGEING'
  /** Sai so ban dinh vi kem (`POOR`) hoac khong duoc bao (`UNKNOWN`). */
  | 'CURRENT_LOCATION_ACCURACY_LOW'
  /** Phep chieu "se ranh" con khuyet — con so gio la mot chan duoi long leo hon binh thuong. */
  | 'NEXT_FREE_PROJECTION_PARTIAL'
  /** Ho so kich thuoc/tai trong cua xe con trong, nen dinh tuyen chay theo mac dinh nha cung cap. */
  | 'TRUCK_PROFILE_INCOMPLETE'
  /** Xe dang co lenh sua MO. Canh bao van hanh (#237), khong phai cong chan. */
  | 'VEHICLE_HAS_OPEN_WORK_ORDER'
  /** Cot trang thai luu tren xe da troi khoi trang thai hieu luc. Viec cua nguoi dong bo du lieu. */
  | 'VEHICLE_RECORDED_STATUS_STALE'
  /** Xe vua dang sua vua dang chay — mau thuan van hanh can nguoi xu ly. */
  | 'VEHICLE_MAINTENANCE_WHILE_IN_TRANSIT'
  /** Khong biet tai trong cho phep cua xe, nen khong doi chieu duoc voi yeu cau cua don. */
  | 'VEHICLE_PAYLOAD_UNKNOWN';

/** VI TRI HIEN TAI dang HIEN RA — toa do CO THE bi che, xem `#277 M13`. */
export interface VehicleCurrentLocationView {
  readonly observedAt: string;
  readonly ageSeconds: number;
  readonly freshness: LocationFreshness;
  readonly accuracyGrade: AccuracyGrade;
  readonly source: LocationSource;
  /**
   * `null` khi nguoi goi KHONG co `transport.location.history.read`.
   *
   * Mot chiec xe khong tu no la mot con nguoi, nhung mot chiec xe co MOT nguoi ngoi trong no, va
   * toa do cua xe LA toa do cua nguoi do. `#277 M13`: *"raw driver location is not leaked to roles
   * lacking permission."* Nen quyen doc TOA DO di theo dung ma quyen da co san cho duong di tho —
   * khong che ra mot ma quyen thu hai cho cung mot su that.
   *
   * Cai KHONG bi che la nhung gi con lai cua ban ghi nay: tuoi, do chinh xac, nguon. Ke toan can
   * biet mot de nghi dua tren mot vi tri 4 tieng truoc — ho khong can biet vi tri do o dau.
   */
  readonly point: GeoPoint | null;
  readonly pointRedacted: boolean;
}

export interface DispatchRouteFacts {
  readonly providerId: string;
  readonly quality: RouteEstimateQuality;
  readonly estimated: true;
  readonly fromCache: boolean;
  readonly computedAt: string;
  readonly reason: DispatchRouteEstimateReason;
}

export interface DispatchCandidate {
  readonly vehicleId: string;
  /** Bien so — dinh danh ma NGUOI dung, va la khoa phan dinh hoa cua bang xep hang. */
  readonly registrationPlate: string;
  readonly mode: DispatchCandidateMode;
  readonly origin: ResolvedPlaceView;
  /** Luc xe co the bat dau di lay hang, ISO. `null` = khong tinh duoc. */
  readonly availableAt: string | null;
  readonly availableAtIsLowerBound: boolean;
  /**
   * KM CHAY RONG THEM VAO neu giao don nay cho xe nay — met, theo DUONG BO.
   *
   * Dinh nghia hep va co chu y: doan tu diem xuat phat cua ung vien den DIEM LAY HANG. Do la doan
   * duy nhat CHAY RONG ma viec nhan don nay them vao — chang cho hang la chang co tai, va doan ve
   * bai sau khi giao thuoc ve ke hoach cua Lane L chu khong phai cua mot lan de nghi.
   */
  readonly emptyRoadMetresToPickup: number;
  readonly roadSecondsToPickup: number;
  /** Du kien co mat tai diem lay hang, ISO. `null` khi khong biet `availableAt`. */
  readonly pickupEtaAt: string | null;
  /**
   * `true`/`false` khi don CO han lay hang; `null` khi KHONG co.
   *
   * `null` khong phai "chua tinh": no la "khong co gi de tinh". `TransportOrder` hom nay khong
   * mang han lay hang, nen day la gia tri binh thuong chu khong phai truong hop bien.
   */
  readonly meetsRequiredPickupAt: boolean | null;
  readonly suitability: readonly DispatchSuitabilityFlag[];
  readonly currentLocation: VehicleCurrentLocationView | null;
  readonly nextFree: VehicleNextFree | null;
  readonly truckProfile: TruckProfile;
  readonly route: DispatchRouteFacts;
  /** Cau tieng Viet do MAY sinh TAT DINH tu cac nhan tren — khong phai van do LLM viet. */
  readonly reasonSummary: string;
}

export interface DispatchExclusion {
  readonly vehicleId: string;
  readonly registrationPlate: string;
  readonly reasons: readonly DispatchCandidateFilterReason[];
  readonly reasonSummary: string;
}

export interface DispatchPickupView {
  readonly place: ResolvedPlace;
  readonly resolution: DispatchPickupResolutionReason;
}

export interface DispatchSuggestionView {
  readonly orderId: string;
  readonly orderCode: string;
  readonly pickup: DispatchPickupView;
  /** Moc gio yeu cau co mat, ISO — do NGUOI GOI dua vao, khong phai mot cot tren don. */
  readonly requiredPickupAt: string | null;
  readonly generatedAt: string;
  readonly orderingKeys: readonly DispatchOrderingKey[];
  readonly candidates: readonly DispatchCandidate[];
  readonly excluded: readonly DispatchExclusion[];
  /**
   * NHAC LAI TRONG CHINH DU LIEU rang day chi la mot de nghi.
   *
   * `#277 M9`: *"recommendation != assignment"*. Mot hang so `false` trong DTO nghe nhu thua cho
   * toi lan dau mot man hinh nao do quen mat dieu do.
   */
  readonly assignmentCreated: false;
}
