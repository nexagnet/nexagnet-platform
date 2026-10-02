import { EMPTY_VALUE, formatInstant } from '../customer-view';
import type {
  DispatchCandidateMode,
  DispatchSuggestionView,
  LocationFreshness,
} from '../transport-types';
import type { JourneyMapModel, JourneyMarker } from './journey';

/**
 * BAN DO DIEU XE — tang doc cua man hinh, HAM THUAN (#278 N3).
 *
 * ===========================================================================
 * MOT BANG XEP HANG KHONG PHAI MOT LAN PHAN CONG.
 *
 * `#278` N3: *"Boss chooses; map does not auto-assign."* Nen tang nay KHONG danh dau mot ung vien
 * la "nen chon", khong to dam dong dau, va khong tra ve mot `recommendedVehicleId`. No giu dung thu
 * tu may chu tra ve, va de con nguoi doc LY DO.
 *
 * ===========================================================================
 * `null` CO HAI NGHIA, VA CHUNG PHAI DOC RA KHAC NHAU.
 *
 * `point === null` + `pointRedacted === true` nghia la CO toa do nhung nguoi dang xem khong duoc
 * thay. `point === null` + `pointRedacted === false` nghia la he thong khong biet xe o dau. Gop hai
 * cai thanh mot dau gach se lam mot nguoi di xin quyen trong khi van de la chiec xe chua bam vi
 * tri lan nao.
 */

const MODE_LABEL: Readonly<Record<DispatchCandidateMode, string>> = {
  CURRENT_NEAR: 'Đang ở gần điểm lấy hàng',
  NEXT_FREE_NEAR: 'Sẽ rảnh gần điểm lấy hàng',
};

const FRESHNESS_LABEL: Readonly<Record<LocationFreshness, string>> = {
  FRESH: 'vị trí mới',
  AGEING: 'vị trí hơi cũ',
  STALE: 'vị trí đã cũ',
};

const REDACTED_NOTE =
  'Toạ độ xe bị ẩn với tài khoản này. Đây KHÔNG phải là thiếu dữ liệu — thứ thiếu là quyền xem ' +
  'lịch sử vị trí.';

const km = (metres: number): string =>
  `${(metres / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} km`;

const duration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours} giờ ${minutes} phút` : `${minutes} phút`;
};

export interface DispatchCandidateRow {
  readonly key: string;
  readonly vehicleId: string;
  /** BIEN SO — dinh danh nghiep vu. */
  readonly plate: string;
  readonly mode: string;
  readonly origin: string;
  readonly availableAt: string;
  readonly emptyKm: string;
  readonly travelTime: string;
  readonly pickupEta: string;
  /** Cau doc duoc ve do tuoi/do tin cua vi tri, hoac `null` khi khong co ban dinh vi nao. */
  readonly locationNote: string | null;
  /** Nhan canh bao — KHONG phai cong chan. Boss van chon duoc. */
  readonly warnings: readonly string[];
}

export interface DispatchModel {
  readonly orderCode: string;
  readonly pickupLabel: string;
  readonly generatedAt: string;
  readonly candidates: readonly DispatchCandidateRow[];
  readonly excluded: readonly {
    readonly key: string;
    readonly plate: string;
    readonly reason: string;
  }[];
  /** `true` khi toa do bi che vi QUYEN — man hinh in mot cau khac han "chua co du lieu". */
  readonly pointRedacted: boolean;
  readonly redactedNote: string | null;
  /**
   * LUON `false`. Giu lai tren mo hinh de man hinh khong bao gio duoc phep suy rang mot lan hoi
   * de nghi da gan xe.
   */
  readonly assignmentCreated: false;
}

export function toDispatch(view: DispatchSuggestionView): DispatchModel {
  const redacted =
    view.pickup.place.pointRedacted ||
    view.candidates.some(
      (candidate) =>
        candidate.origin.pointRedacted || candidate.currentLocation?.pointRedacted === true,
    );

  return {
    orderCode: view.orderCode,
    pickupLabel: view.pickup.place.label,
    generatedAt: formatInstant(view.generatedAt),
    candidates: view.candidates.map((candidate): DispatchCandidateRow => {
      const location = candidate.currentLocation;
      return {
        key: candidate.vehicleId,
        vehicleId: candidate.vehicleId,
        plate: candidate.registrationPlate,
        mode: MODE_LABEL[candidate.mode],
        origin: candidate.origin.label,
        /*
         * `availableAtIsLowerBound` nghia la "khong som hon moc nay" — mot CAN DUOI, khong phai mot
         * lich hen. Bo chu do di se bien mot uoc luong thanh mot loi hua voi khach.
         */
        availableAt:
          candidate.availableAt === null
            ? EMPTY_VALUE
            : `${candidate.availableAtIsLowerBound ? 'không sớm hơn ' : ''}${formatInstant(
                candidate.availableAt,
              )}`,
        emptyKm: km(candidate.emptyRoadMetresToPickup),
        travelTime: duration(candidate.roadSecondsToPickup),
        pickupEta:
          candidate.pickupEtaAt === null ? EMPTY_VALUE : formatInstant(candidate.pickupEtaAt),
        locationNote:
          location === null
            ? null
            : `${FRESHNESS_LABEL[location.freshness]} · ${formatInstant(location.observedAt)}`,
        warnings: candidate.suitability,
      };
    }),
    excluded: view.excluded.map((entry) => ({
      key: entry.vehicleId,
      plate: entry.registrationPlate,
      reason: entry.reasonSummary,
    })),
    pointRedacted: redacted,
    redactedNote: redacted ? REDACTED_NOTE : null,
    assignmentCreated: false,
  };
}

/**
 * UNG VIEN + DIEM LAY HANG thanh mo hinh ma `TransportMap` da biet ve.
 *
 * Dung lai `JourneyMapModel` thay vi de ra mot kieu ban do thu hai: hai kieu se de ra hai component
 * ban do, va lan doi mau chang rong tiep theo se chi vao mot trong hai.
 *
 * KHONG mot doan duong nao: doan tu xe toi diem lay hang la mot con so km cua nha cung cap dinh
 * tuyen, khong phai mot chuoi toa do. Ve mot duong thang thay cho no la bia ra mot loi di.
 */
export function toDispatchMap(view: DispatchSuggestionView): JourneyMapModel {
  const markers: JourneyMarker[] = [];

  if (view.pickup.place.point !== null) {
    markers.push({
      key: 'pickup',
      legSequence: 0,
      role: 'DESTINATION',
      coordinate: [view.pickup.place.point.longitude, view.pickup.place.point.latitude],
      label: `Điểm lấy hàng — ${view.pickup.place.label}`,
    });
  }

  for (const [index, candidate] of view.candidates.entries()) {
    const point = candidate.origin.point;
    if (point === null) continue;
    markers.push({
      key: candidate.vehicleId,
      legSequence: index + 1,
      role: 'ORIGIN',
      coordinate: [point.longitude, point.latitude],
      label: `${candidate.registrationPlate} — ${candidate.origin.label}`,
    });
  }

  return { segments: [], markers, gaps: [], hasGeometry: markers.length > 0, rawSampledFrom: 0 };
}

/**
 * `#379` — don CU (tao truoc khi he thong luu toa do) khong co diem lay hang de xep hang xe.
 *
 * May chu tu choi bang ma `DISPATCH_ORDER_PICKUP_COORDINATES_MISSING` thay vi doan diem lay tu nhan
 * chu. Cau cua may chu noi cho nguoi goi API ("chi dinh tuong minh khi dieu xe"); man hinh noi cho
 * nguoi dieu hanh — ho khong co o nao de "chi dinh", ho can biet VI SAO khong co goi y.
 */
export const DISPATCH_PICKUP_MISSING_MESSAGE =
  'Đơn này được tạo trước khi hệ thống lưu toạ độ điểm lấy hàng, nên chưa gợi ý xe được.';

/** Cau hien khi hoi de nghi dieu xe that bai. Loi khac giu NGUYEN VAN cau cua may chu. */
export function dispatchErrorMessage(error: {
  readonly message: string;
  readonly reason?: string | null;
}): string {
  return error.reason === 'DISPATCH_ORDER_PICKUP_COORDINATES_MISSING'
    ? DISPATCH_PICKUP_MISSING_MESSAGE
    : error.message;
}
