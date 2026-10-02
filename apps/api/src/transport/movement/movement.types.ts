/**
 * MO HINH VAN CHUYEN v2 -- HAI TRUC DOC LAP (#232 `D-01`, #234 A1).
 *
 * Day la tang kieu thuan: khong `@nestjs`, khong Prisma, khong I/O. Moi thu o day doc duoc ma
 * khong can biet du lieu nam o dau.
 *
 *   `Order`      = NGHIA VU THUONG MAI. Ai thue, cho gi, tu dau den dau, bao nhieu tien.
 *   `VehicleRun` = VONG CHAY VAT LY cua MOT xe.
 *   `RunLeg`     = MOT chang cua vong chay do. `LOADED` co the tro toi mot don; `EMPTY` khong.
 *
 * Ngay thang deu la `string` ISO o bien mien, khong phai `Date` -- dung quy uoc da co cua
 * `transport.types.ts`.
 */

import type { GeoPoint } from '../geo/geo-point.js';

export const ORDER_STATUSES = ['OPEN', 'FULFILLED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const VEHICLE_RUN_STATUSES = ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export type VehicleRunStatus = (typeof VEHICLE_RUN_STATUSES)[number];

/**
 * LOAI CHANG -- truc ma toan bo phan tich km rong dua vao.
 *
 * `EMPTY` la chay rong/deadhead. Hai gia tri, khong ba: moi sac thai khac (chay ve bai, di lay vo,
 * dieu xe) van la `EMPTY` cho toi khi co mot nguon nghiep vu doi phan biet chung.
 */
export const RUN_LEG_KINDS = ['LOADED', 'EMPTY'] as const;
export type RunLegKind = (typeof RUN_LEG_KINDS)[number];

export const RUN_LEG_STATUSES = ['PLANNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'] as const;
export type RunLegStatus = (typeof RUN_LEG_STATUSES)[number];

export interface Order {
  readonly id: string;
  readonly code: string;
  readonly status: OrderStatus;
  readonly businessDate: string;
  readonly customerId: string | null;
  /** Nhan de HIEN THI. Khong phai su that ve vi tri -- xem `originPoint`. */
  readonly originLabel: string;
  readonly destinationLabel: string;
  /**
   * DIEM LAY / DIEM GIAO THAT (#379), WGS84. Day moi la su that ve vi tri; nhan o tren chi de
   * nguoi doc. `null` KHI VA CHI KHI don khong duoc tao qua duong co toa do: don cu truoc #379,
   * don chieu tu chuyen v1, don seed mau. He thong KHONG BAO GIO bia hay geocode nhan cu thanh
   * toa do -- mot toa do doan sai con te hon khong co, vi dieu xe se tin no.
   */
  readonly originPoint: GeoPoint | null;
  readonly destinationPoint: GeoPoint | null;
  readonly cargoDescription: string | null;
  /** DOANH THU -- so nguyen dong. `null` = chua bao gia. */
  readonly freightAmount: number | null;
  readonly currencyCode: string;
  readonly note: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly cancelledAt: string | null;
  readonly cancellationReason: string | null;
}

export interface VehicleRun {
  readonly id: string;
  readonly code: string;
  /** BAT BUOC: mot vong chay LA vong chay cua mot chiec xe cu the. */
  readonly vehicleId: string;
  readonly status: VehicleRunStatus;
  readonly businessDate: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly note: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly cancelledAt: string | null;
  readonly cancellationReason: string | null;
}

export interface RunLeg {
  readonly id: string;
  readonly runId: string;
  readonly sequence: number;
  readonly kind: RunLegKind;
  readonly status: RunLegStatus;
  /** BAT BIEN: `null` bat buoc khi `kind === 'EMPTY'`. Duoc phep `null` khi `LOADED`. */
  readonly orderId: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly businessDate: string;
  /**
   * `GD-14` -- nhap tay. `null` nghia la CHUA BIET, khong phai 0.
   *
   * #276 L6 chot them: day la quang duong DA GHI NHAN. Mot con so uoc luong khong bao gio duoc
   * dien vao day — cho cua no la `plannedDistanceKm`.
   */
  readonly distanceKm: number | null;
  /**
   * #276 L6 -- quang duong DU KIEN. Tach khoi `distanceKm` de mot uoc luong khong the tro thanh
   * mot quang duong da di ma khong ai phan biet duoc. `null` = chua biet, khong phai 0.
   */
  readonly plannedDistanceKm: number | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly note: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** PHAN CONG LAI XE cho mot vong chay -- LICH SU, `effectiveTo === null` la ban dang hieu luc. */
export interface RunAssignment {
  readonly id: string;
  readonly runId: string;
  readonly driverId: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly assignedBy: string;
  readonly createdAt: string;
}

/**
 * TUONG UNG mot chuyen v1 voi mot chang v2. KHONG phai quan he cha/con -- xem khoi ghi chu cua
 * `TransportTripRunLegLink` trong `schema.prisma`.
 */
export interface TripRunLegLink {
  readonly tripId: string;
  readonly legId: string;
  readonly projectedBy: string;
  readonly createdAt: string;
}

/**
 * TUONG UNG mot chuyen v1 voi mot DON v2 -- truc THUONG MAI, doc lap voi truc dieu hanh.
 *
 * ==========================================================================================
 * VI SAO CAN MOT LIEN KET THU HAI KHI DA CO `TripRunLegLink`
 * ==========================================================================================
 *
 * `TripRunLegLink` tra loi "chuyen cu nay hien ra o CHANG nao" -- mot cau hoi DIEU HANH. No chi ton
 * tai khi chuyen do chieu duoc sang mot vong chay, va `planTripProjection` TU CHOI chieu chuyen
 * `EXTERNAL_CARRIER`: xe khong phai cua B nen khong co "vong chay cua xe" nao ca.
 *
 * Nhung mot chuyen thue nha xe ngoai VAN co mot nghia vu thuong mai voi khach -- van co bien nhan
 * giao hang, van phai ke toan ket thuc truoc khi ghi nhan cong no. `#275` K5 cam dung viec "khong
 * chieu duoc" lam duong vong cua cong:
 *
 *     *"Order is the grain, so projection absence must not be an authorization bypass."*
 *
 * Nen cau hoi THUONG MAI ("chuyen cu nay la nghia vu nao") phai co duong tra loi RIENG, khong di
 * qua vong chay. Do la bang nay. Chinh khoi chu thich cua `TransportOrder` da noi truoc dieu do:
 * *"mot don ton tai truoc khi biet xe nao chay no, va co the khong bao gio duoc chay bang xe cua
 * minh"*.
 *
 * `tripId` la KHOA CHINH va `orderId` la UNIQUE, y het `TripRunLegLink` -- nen phep chieu thuong
 * mai cung TAT DINH va LAP LAI DUOC: chay lai khong the sinh ban thu hai.
 */
export interface TripOrderLink {
  readonly tripId: string;
  readonly orderId: string;
  readonly projectedBy: string;
  readonly createdAt: string;
}

/** Mot vong chay doc kem chang va phan cong dang hieu luc -- hinh dang ma be mat van hanh can. */
export interface VehicleRunDetail {
  readonly run: VehicleRun;
  readonly legs: readonly RunLeg[];
  readonly activeAssignment: RunAssignment | null;
}
