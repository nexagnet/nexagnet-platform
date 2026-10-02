import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';
import { TRANSPORT_PROOF_DECISIONS } from '../proof/proof-decisions.js';

/**
 * TU VUNG QUYET DINH cua QUAN TRI DIA DIEM VAN HANH (`#395`).
 *
 * TACH khoi `TRANSPORT_PLACE_DECISIONS` (`place.lookup`, tim dia diem cho Tao don) co chu dich: tim
 * la mot phep DOC hoi nha cung cap ben ngoai; quan tri la mot phep GHI doi bai xe cua khau lap ke
 * hoach va phan quyet hang rao cua ca lich su. Hai cau hoi, hai bo tu vung, hai chu so huu.
 *
 * MOT diem quyet dinh: `place.write` — "lan tao / sua / tat / bat / doi bai chinh nay co duoc phep
 * khong, va neu khong thi vi sao". `detail` KHONG mang toa do hay dia chi: ca hai la du lieu vi tri.
 *
 * `GEOFENCE_RADIUS_OUT_OF_RANGE` va `GEOFENCE_COORDINATE_REJECTED` la ma DA CO cua `transport-proof`;
 * nhan cua chung lay NGUYEN tu bo do, vi `defineDecisionVocabulary` ghi de nhan im lang — hai cau khac
 * nhau cho mot ma se lam trace noi cau nao tuy thu tu nap module.
 *
 * MOI tu choi co kieu cua mot lan GHI dia diem nam o day — ke ca tu luat CHU cua dia diem
 * (`place-owner.ts`) va tu chi muc DB (`placeStorageConflict`) — de `place.write` ghi DUNG mot quyet
 * dinh `denied` cho moi lan tu choi. `place-admin-decisions.spec.ts` doc ma nguon cua dich vu va khoa
 * dieu do. Ngoai le DUY NHAT: `PLACE_NOT_FOUND` (`place-errors.ts`) — chinh dia diem can ghi khong ton
 * tai thi khong co gi de quyet dinh (cung khuon `DRIVER_NOT_FOUND` cua noi tai khoan); buoc
 * `place.write` van mang loi do.
 */
export const PLACE_WRITE_REASONS = [
  /** Thay doi hop le va da duoc ghi. */
  'PLACE_WRITE_ALLOWED',
  /** Doi/tat bai xe khi con viec dang mo, va nguoi dung DA xac nhan danh sach viec do. */
  'PLACE_WRITE_OPEN_WORK_ACKNOWLEDGED',
  /** Trung ten (da chuan hoa) voi mot dia diem dang hieu luc khac. */
  'PLACE_NAME_TAKEN',
  /** Da co mot bai xe dang bat — DB chan bang `TransportGeofence_one_active_depot`. */
  'DEPOT_ALREADY_ACTIVE',
  /** Ma bai xe da dung — DB chan bang `TransportGeofence_depot_code_key`. */
  'DEPOT_CODE_TAKEN',
  /** Diem nam ngoai vung phuc vu. */
  'PLACE_OUTSIDE_SERVICE_AREA',
  'GEOFENCE_RADIUS_OUT_OF_RANGE',
  /** Ma so thue cua don vi moi da thuoc mot phap nhan khac. */
  'COUNTERPARTY_TAX_CODE_TAKEN',
  /** Doi/tat bai xe khi con vong xe, don dang mo — chua xac nhan. */
  'DEPOT_CHANGE_AFFECTS_OPEN_WORK',
  /** Tao/doi ten dia diem cua don vi khac doi quyen quan ly phap nhan. */
  'PLACE_SITE_REQUIRES_COUNTERPARTY_MANAGE',
  /** Sua ten/trang thai qua duong cu mot dia diem dang duoc quan ly o Dia diem van hanh. */
  'COUNTERPARTY_SITE_MANAGED_AS_PLACE',
  /** Toa do tam khong qua `parseGeoPoint` (ngoai bien, Null Island). */
  'GEOFENCE_COORDINATE_REJECTED',
  /* ---- luat CHU cua dia diem (`place-owner.ts`) ---- */
  /** Dia diem cua don vi khac phai noi ro cua ai: khach hang, don vi co san, hay don vi moi. */
  'PLACE_OWNER_REQUIRED',
  /** Chu cua dia diem khai sai hinh (vd bai xe kem chu, hoac vua chu vua dia diem co san). */
  'PLACE_OWNER_INVALID',
  /** Chu cua dia diem (don vi / khach hang) da ngung hoat dong. */
  'PLACE_OWNER_INACTIVE',
  /** Dia diem co san duoc chon da co hang rao — sua no o chinh dia diem do. */
  'PLACE_SITE_ALREADY_FENCED',
  /** Dia diem co san duoc chon khong thuoc don vi da chon. */
  'PLACE_SITE_OWNER_MISMATCH',
  /** Trung ten voi mot dia diem khac cua CUNG phap nhan (luat + chi muc DB). */
  'COUNTERPARTY_SITE_NAME_TAKEN',
  /** Don vi duoc chon lam chu khong con ton tai. */
  'COUNTERPARTY_NOT_FOUND',
  /** Khach hang duoc chon lam chu khong con ton tai. */
  'CUSTOMER_NOT_FOUND',
  /** Dia diem co san duoc chon de gan vi tri khong con ton tai. */
  'COUNTERPARTY_SITE_NOT_FOUND',
  /** Chi bai xe moi "doi thanh bai chinh" duoc. */
  'PLACE_NOT_A_DEPOT',
] as const;
export type PlaceWriteReason = (typeof PLACE_WRITE_REASONS)[number];

export const TRANSPORT_PLACE_ADMIN_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-places-admin',
  points: ['place.write'],
  labels: {
    PLACE_WRITE_ALLOWED: 'Thay đổi địa điểm vận hành hợp lệ và đã được ghi',
    PLACE_WRITE_OPEN_WORK_ACKNOWLEDGED:
      'Đổi bãi xe khi còn việc đang mở — người dùng đã xác nhận danh sách việc bị ảnh hưởng',
    PLACE_NAME_TAKEN: 'Tên địa điểm trùng với một địa điểm đang hoạt động khác',
    DEPOT_ALREADY_ACTIVE: 'Đã có một bãi xe đang dùng — chỉ một bãi được bật',
    DEPOT_CODE_TAKEN: 'Mã bãi xe đã được dùng',
    PLACE_OUTSIDE_SERVICE_AREA: 'Vị trí nằm ngoài vùng phục vụ',
    GEOFENCE_RADIUS_OUT_OF_RANGE: TRANSPORT_PROOF_DECISIONS.labels.GEOFENCE_RADIUS_OUT_OF_RANGE,
    COUNTERPARTY_TAX_CODE_TAKEN: 'Mã số thuế đã thuộc một đơn vị khác',
    DEPOT_CHANGE_AFFECTS_OPEN_WORK: 'Còn vòng xe hoặc đơn đang mở dùng bãi xe này — cần xác nhận',
    PLACE_SITE_REQUIRES_COUNTERPARTY_MANAGE:
      'Địa điểm của đơn vị khác cần thêm quyền quản lý khách hàng, đối tác',
    COUNTERPARTY_SITE_MANAGED_AS_PLACE: 'Điểm này đang được quản lý ở Địa điểm vận hành — sửa ở đó',
    GEOFENCE_COORDINATE_REJECTED: TRANSPORT_PROOF_DECISIONS.labels.GEOFENCE_COORDINATE_REJECTED,
    PLACE_OWNER_REQUIRED: 'Địa điểm của đơn vị khác chưa nói rõ là của ai',
    PLACE_OWNER_INVALID: 'Thông tin chủ của địa điểm khai sai',
    PLACE_OWNER_INACTIVE: 'Chủ của địa điểm (đơn vị hoặc khách hàng) đã ngừng hoạt động',
    PLACE_SITE_ALREADY_FENCED: 'Địa điểm có sẵn đã có vị trí trên bản đồ',
    PLACE_SITE_OWNER_MISMATCH: 'Địa điểm có sẵn không thuộc đơn vị đã chọn',
    COUNTERPARTY_SITE_NAME_TAKEN: 'Đơn vị này đã có một địa điểm khác cùng tên',
    COUNTERPARTY_NOT_FOUND: 'Không tìm thấy đơn vị được chọn làm chủ',
    CUSTOMER_NOT_FOUND: 'Không tìm thấy khách hàng được chọn làm chủ',
    COUNTERPARTY_SITE_NOT_FOUND: 'Không tìm thấy địa điểm có sẵn được chọn',
    PLACE_NOT_A_DEPOT: 'Chỉ bãi xe mới đổi thành bãi chính được',
  } satisfies Record<PlaceWriteReason, string>,
});
