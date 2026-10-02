import { canPerform, type TransportAction, type TransportViewerInput } from './transport-actions';

/**
 * CAU "CHUA DUOC CAP QUYEN" cua PHAN PHU trong mot muc (`#395`) — ham THUAN, khong React.
 *
 * Tu `#395` Giam doc cap quyen theo nhom cho tung nguoi, nen mot muc hien ra van co the thieu mot
 * khoi phu (ten khach, bang lai xe, ban do…). Khoi do KHONG duoc hoi may chu (query da chan o
 * `enabled`) va KHONG duoc noi "chưa có dữ liệu": mot o trong o cho khong duoc xem doc ra y het mot
 * so lieu sai. No noi mot cau nghiep vu — cau do o day, MOT cho, de moi man noi cung mot kieu.
 *
 * Chi co ma DOC (`.read`) moi co cau o day: thieu mot ma GHI thi nut bam khong hien, khong phai mot
 * khoi trong can giai thich. `permission-notes.spec.ts` khoa: moi ma DOC la phan phu cua mot muc
 * (`TransportSection.optionalActions`) deu co ten viec.
 */
export const READ_SUBJECT: Readonly<Partial<Record<TransportAction, string>>> = {
  'transport.order.read': 'đơn hàng',
  'transport.run.read': 'vòng chạy',
  'transport.trip.read': 'chuyến lập tay',
  'transport.customer.read': 'danh sách khách hàng',
  'transport.partner.read': 'danh sách đối tác',
  'transport.counterparty.read': 'danh sách đơn vị đối tác',
  'transport.vehicle.read': 'danh sách xe',
  'transport.driver.read': 'hồ sơ lái xe',
  'transport.tracking.read': 'sức khoẻ vị trí xe',
  'transport.location.history.read': 'đường đi chi tiết trên bản đồ',
  'transport.fuel.entry.read': 'phiếu đổ dầu',
  'transport.fuel.reconciliation.read': 'đối soát nhiên liệu',
  'transport.fuel.document.read': 'chứng từ nhiên liệu do máy đọc',
  'transport.costing.expense.read': 'chi phí chuyến',
  'transport.costing.period.read': 'kỳ kế toán và kỳ quỹ',
  'transport.costing.driver_fund.read': 'sổ quỹ lái xe',
  'transport.payroll.period.read': 'bảng lương',
  'transport.settlement.report.read': 'báo cáo công nợ và quyết toán',
  'transport.analytics.read': 'chỉ số vận hành đội xe',
  'transport.operational_document.read': 'chứng từ vận hành của đơn',
  'transport.compliance.document.read': 'giấy tờ xe',
  'transport.fleet_status.read': 'tình trạng sẵn sàng của đội xe',
  'transport.alerts.read': 'cảnh báo vận hành',
  'transport.toll.review.read': 'hàng chờ đối soát phí đường bộ',
  'transport.asset_ownership.read': 'hồ sơ bên góp vốn',
};

const subjectOf = (action: TransportAction): string => READ_SUBJECT[action] ?? 'phần này';

/** "a" · "a và b" · "a, b và c" — cach liet ke cua mot cau tieng Viet. */
const joinVi = (parts: readonly string[]): string =>
  parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} và ${parts[parts.length - 1]}`;

/** Nhung ma trong bo ma nguoi xem CHUA giu, theo dung thu tu truyen vao. */
export const missingActions = (
  viewer: TransportViewerInput,
  actions: readonly TransportAction[],
): readonly TransportAction[] => actions.filter((action) => !canPerform(viewer, action));

/** Mot cau cho cac ma con thieu; `null` khi khong thieu gi (khong ve gi ca). */
export const notPermittedSentence = (actions: readonly TransportAction[]): string | null =>
  actions.length === 0
    ? null
    : `Bạn chưa được cấp quyền xem ${joinVi([...new Set(actions.map(subjectOf))])}.`;

/**
 * `403` CUA CONG HANH DONG (`ACTION_NOT_PERMITTED`, `transport-action.guard.ts`) — khac `403` cua
 * mot cong nghiep vu (vd `FUND_PERIOD_*`) hay cau tra loi "khong phai ben gop von".
 */
export const isActionNotPermitted = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const { status, reason } = error as { status?: unknown; reason?: unknown };
  return status === 403 && reason === 'ACTION_NOT_PERMITTED';
};

/**
 * Cau khi CHINH may chu tu choi mot lan doc cua muc dang mo. Hook da chan moi query ma nguoi xem
 * khong giu quyen, nen dieu nay chi xay ra khi quyen VUA doi (Giam doc bot quyen luc nguoi do dang
 * mo trang) — `AuthGate` doc lai `/auth/me` va danh muc theo quyen moi.
 */
export const SECTION_ACCESS_REVOKED =
  'Bạn chưa được cấp quyền xem phần này — quyền của bạn có thể vừa được thay đổi. Danh mục bên trái đã cập nhật theo quyền mới.';
