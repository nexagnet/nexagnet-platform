import type {
  PermissionActionView,
  PermissionCatalogView,
  PermissionGroupView,
  PermissionKind,
  PermissionPresetView,
  SeparationOfDutySide,
} from '../../auth/access/permission-domain.js';
import {
  DIRECTOR_ONLY_ACTIONS,
  TRANSPORT_ACTIONS,
  type TransportAction,
} from '../transport-actions.js';
import {
  ESCALATION_ACTIONS,
  EVIDENCE_MUTATION_ACTIONS,
  FINANCIAL_DECISION_ACTIONS,
} from './transport-permission-rules.js';

/**
 * DANH MUC QUYEN van tai cho man hinh "Tai khoan & quyen" (`#395`).
 *
 * Moi ma trong `TRANSPORT_ACTIONS` nam trong DUNG MOT nhom (bai spec khoa dieu do: them mot ma ma
 * quen xep nhom thi do). Nhan la tieng Viet CO DAU, theo cong viec — Giam doc doc no de quyet dinh
 * cap cho ai, nen no phai noi "Duyet phu cap cho" chu khong phai `waiting_allowance.decide`.
 *
 * LOAI cua moi ma (`kind`) KHONG go tay: suy tu quy tac trong `transport-permission-rules.ts`, de
 * danh muc khong the noi khac quy tac.
 */

export const TRANSPORT_PERMISSION_GROUP_IDS = [
  'dieu-hanh',
  'hien-truong',
  'doi-xe',
  'khach-hang',
  'ke-toan',
  'nhien-lieu',
  'quy-luong',
  'bao-duong',
  'ban-do',
  'phi-duong',
  'bao-cao',
  'quan-tri',
  'lai-xe',
  'chu-xe',
] as const;
export type TransportPermissionGroupId = (typeof TRANSPORT_PERMISSION_GROUP_IDS)[number];

export interface TransportPermissionGroup {
  readonly id: TransportPermissionGroupId;
  readonly label: string;
  readonly summary: string;
  /** `false` = nhom den tu LIEN KET ho so (lai xe, ben gop von), khong bat tat bang quyen rieng. */
  readonly grantable: boolean;
  /** Ma → nhan, theo thu tu hien tren man hinh. */
  readonly actions: Readonly<Partial<Record<TransportAction, string>>>;
  /**
   * QUYEN KEM THEO DE DUNG DUOC (`#395`) — phep XEM cua NHOM KHAC ma man hinh cua nhom nay can.
   *
   * Bang chung chay that: Giam doc cap nhom "Bảo dưỡng / giấy tờ" cho mot nguoi, may chu cho phep
   * dung, nhung man hinh bao duong chi ghi "Xe chưa đọc được tên" o moi dong; cap "Hiện trường &
   * bằng chứng" thi khong mo duoc man nao — moc hien truong chi hien tren chang cua mot vong chay.
   * Viec cua nhom nay LAM tu man cua nhom khac, nen no can phep XEM cua nhom do.
   *
   * KHONG doi luat "moi ma dung mot nhom": ma kem theo van thuoc nhom cua no, va chi la phep XEM
   * thuong (khong leo thang, khong chi Giam doc, khong tach nhiem — spec khoa). Trinh chinh quyen bat
   * kem khi Giam doc bat nhom (ghi ro "kèm theo để dùng được"); "Người này làm được gì?" noi ra khi
   * mot nhom dang dung ma thieu ma kem theo. `section-access.spec.ts` (web) khoa: moi nhom cap duoc,
   * cong ma kem theo, mo it nhat mot muc cua man hinh van hanh.
   */
  readonly needs: readonly TransportAction[];
}

export const TRANSPORT_PERMISSION_GROUPS: readonly TransportPermissionGroup[] = [
  {
    id: 'dieu-hanh',
    label: 'Điều hành đơn / vòng xe / chặng',
    summary: 'Đơn vận chuyển, chuyến xe, vòng xe, chặng, điều xe và bảng điều hành.',
    grantable: true,
    actions: {
      'transport.order.read': 'Xem đơn vận chuyển',
      'transport.order.manage': 'Tạo và sửa đơn vận chuyển',
      'transport.run.read': 'Xem vòng xe và chặng',
      'transport.run.manage': 'Lập kế hoạch, gán xe và cập nhật vòng xe, chặng',
      'transport.dispatch.suggest.read': 'Xem gợi ý xe cho một đơn',
      'transport.control_tower.read': 'Xem bảng điều hành',
      'transport.trip.read': 'Xem chuyến xe',
      'transport.trip.create': 'Tạo chuyến xe',
      'transport.trip.update': 'Sửa thông tin chuyến xe',
      'transport.trip.assign': 'Phân công xe và lái xe cho chuyến',
      'transport.trip.transition': 'Chuyển trạng thái chuyến (xuất phát, hoàn thành…)',
      'transport.trip.cancel': 'Huỷ chuyến xe',
    },
    /** Ten khach cua don va bien so xe tren bang don, vong chay, chuyen. */
    needs: ['transport.customer.read', 'transport.vehicle.read'],
  },
  {
    id: 'hien-truong',
    label: 'Hiện trường & bằng chứng',
    summary: 'Mốc hiện trường, chờ người nhận, chứng từ và chứng cứ giao hàng.',
    grantable: true,
    actions: {
      'transport.checkpoint.read': 'Xem dòng thời gian mốc hiện trường',
      'transport.checkpoint.record': 'Ghi bù mốc hiện trường từ văn phòng',
      'transport.waiting.read': 'Xem phiên chờ người nhận',
      'transport.waiting.close': 'Đóng phiên chờ bị bỏ quên',
      'transport.operational_document.read': 'Xem chứng từ vận hành (biên nhận, phiếu giao)',
      'transport.operational_document.record': 'Ghi bù chứng từ vận hành thay lái xe',
      'transport.operational_document.withdraw': 'Gỡ chứng từ vận hành khỏi hồ sơ',
      'transport.receipt_handover.record': 'Ghi nhận biên nhận giấy đã về văn phòng',
      'transport.proof.read': 'Xem chứng cứ giao hàng',
      'transport.proof.withdraw': 'Rút một chứng cứ khỏi hồ sơ',
    },
    /** Moc, chung tu va chung cu hien tren CHANG cua mot vong chay, trong mot don. */
    needs: ['transport.order.read', 'transport.run.read'],
  },
  {
    id: 'doi-xe',
    label: 'Đội xe & lái xe',
    summary: 'Hồ sơ xe, hồ sơ lái xe và sở hữu xe.',
    grantable: true,
    actions: {
      'transport.vehicle.read': 'Xem danh sách xe',
      'transport.vehicle.manage': 'Thêm và sửa hồ sơ xe',
      'transport.driver.read': 'Xem hồ sơ lái xe',
      'transport.driver.manage': 'Thêm và sửa hồ sơ lái xe',
      'transport.asset_ownership.read': 'Xem sở hữu xe và bên góp vốn',
      'transport.asset_ownership.manage': 'Cập nhật sở hữu xe và bên góp vốn',
    },
    needs: [],
  },
  {
    id: 'khach-hang',
    label: 'Khách hàng / đối tác',
    summary: 'Khách hàng, nhà xe đối tác và pháp nhân, kể cả nhà máy, kho của đối tác.',
    grantable: true,
    actions: {
      'transport.customer.read': 'Xem khách hàng',
      'transport.customer.manage': 'Thêm và sửa khách hàng',
      'transport.partner.read': 'Xem đối tác (nhà xe thuê ngoài, người giới thiệu)',
      'transport.partner.manage': 'Thêm và sửa đối tác',
      'transport.counterparty.read': 'Xem pháp nhân của khách hàng, đối tác',
      'transport.counterparty.manage': 'Thêm, sửa pháp nhân và nhà máy, kho của họ',
    },
    /** Khong co man danh muc khach rieng: khach hien ra tren don hang. */
    needs: ['transport.order.read'],
  },
  {
    id: 'ke-toan',
    label: 'Kế toán & công nợ',
    summary: 'Chi phí chuyến, kỳ kế toán, đối soát và thu tiền khách, nghiệm thu chứng từ.',
    grantable: true,
    actions: {
      'transport.costing.expense.read': 'Xem chi phí chuyến',
      'transport.costing.expense.record': 'Ghi chi phí chuyến',
      'transport.costing.reversal.post': 'Đảo một khoản chi đã ghi',
      'transport.costing.period.read': 'Xem kỳ kế toán',
      'transport.costing.period.manage': 'Mở và đóng kỳ kế toán',
      'transport.costing.period.reopen': 'Mở lại kỳ kế toán đã đóng',
      'transport.commercial_acceptance.read': 'Xem hồ sơ chờ nghiệm thu',
      'transport.commercial_acceptance.decide': 'Duyệt nghiệm thu chứng từ',
      'transport.customer_reconciliation.read': 'Xem đối soát với khách hàng',
      'transport.customer_reconciliation.confirm': 'Xác nhận đối soát thành công nợ phải thu',
      'transport.customer_payment.read': 'Xem tiền khách đã trả',
      'transport.customer_payment.record': 'Ghi nhận tiền khách trả',
      'transport.customer_payment.allocate': 'Phân bổ tiền khách trả vào công nợ',
      'transport.customer_payment.correct': 'Sửa phân bổ tiền khách trả',
      'transport.settlement.document.read': 'Xem chuỗi chứng từ gốc và các lần điều chỉnh',
    },
    /**
     * Ten khach va ma don trong so phai thu, lo doi soat; chung tu so cua don trong hop quyet dinh
     * "Kết thúc đơn" (ke toan xac nhan chung tu — can THAY chung tu do).
     */
    needs: [
      'transport.customer.read',
      'transport.order.read',
      'transport.operational_document.read',
    ],
  },
  {
    id: 'nhien-lieu',
    label: 'Nhiên liệu',
    summary: 'Phiếu đổ dầu, cây xăng, hoá đơn và đối soát nhiên liệu.',
    grantable: true,
    actions: {
      'transport.fuel.entry.read': 'Xem phiếu đổ dầu',
      'transport.fuel.entry.submit_for_driver': 'Nộp phiếu đổ dầu thay lái xe',
      'transport.fuel.entry.verify': 'Duyệt phiếu đổ dầu',
      'transport.fuel.cost_attribution.record': 'Phân bổ chi phí nhiên liệu vào vòng xe, chặng',
      'transport.fuel.station.read': 'Xem danh mục cây xăng',
      'transport.fuel.station.manage': 'Quản lý danh mục cây xăng',
      'transport.fuel.document.read': 'Xem hoá đơn, chứng từ nhiên liệu',
      'transport.fuel.document.ingest': 'Nhập hoá đơn nhiên liệu',
      'transport.fuel.statement.import': 'Nhập bảng kê của cây xăng',
      'transport.fuel.reconciliation.read': 'Xem đối soát nhiên liệu',
      'transport.fuel.reconciliation.match': 'Khớp phiếu đổ dầu với bảng kê',
      'transport.fuel.reconciliation.resolve': 'Xử lý chênh lệch đối soát nhiên liệu',
      'transport.fuel.reconciliation.close': 'Đóng kỳ đối soát nhiên liệu',
      'transport.fuel.reconciliation.reopen': 'Mở lại kỳ đối soát nhiên liệu đã đóng',
    },
    /** O chon xe cua bang tieu hao nhien lieu (L/100km theo xe). */
    needs: ['transport.vehicle.read'],
  },
  {
    id: 'quy-luong',
    label: 'Quỹ lái xe / lương',
    summary: 'Tạm ứng, đề nghị chi, phụ cấp chờ, lương và quyết toán lái xe.',
    grantable: true,
    actions: {
      'transport.costing.driver_fund.read': 'Xem quỹ tạm ứng của lái xe',
      'transport.costing.driver_fund.advance': 'Tạm ứng tiền cho lái xe',
      'transport.costing.driver_fund.return': 'Ghi lái xe hoàn tạm ứng',
      'transport.costing.driver_fund.adjust': 'Điều chỉnh quỹ lái xe',
      'transport.expense.claim.read': 'Xem đề nghị chi của lái xe',
      'transport.expense.claim.submit': 'Nhập đề nghị chi thay lái xe',
      'transport.expense.claim.review': 'Duyệt hoặc từ chối đề nghị chi',
      'transport.waiting_allowance.propose': 'Đề nghị phụ cấp chờ cho lái xe',
      'transport.waiting_allowance.decide': 'Duyệt phụ cấp chờ',
      'transport.payroll.period.read': 'Xem kỳ lương',
      'transport.payroll.period.manage': 'Mở và đóng kỳ lương',
      'transport.payroll.run': 'Tính lương cho kỳ',
      'transport.payslip.approve': 'Duyệt phiếu lương',
      'transport.payslip.pay': 'Ghi đã trả lương',
      'transport.payslip.correct': 'Sửa phiếu lương đã chốt bằng phiếu bổ sung',
      'transport.driver_settlement.read': 'Xem quyết toán lái xe',
      'transport.driver_settlement.cashout': 'Chi tiền quyết toán cho lái xe',
      'transport.driver_settlement.reverse': 'Đảo một lần chi quyết toán',
    },
    /** Chon lai xe de xem quy, luong, quyet toan. */
    needs: ['transport.driver.read'],
  },
  {
    id: 'bao-duong',
    label: 'Bảo dưỡng / giấy tờ',
    summary: 'Kế hoạch bảo dưỡng, lệnh sửa xe, giấy tờ xe, tình trạng đội xe và cảnh báo.',
    grantable: true,
    actions: {
      'transport.maintenance.plan.read': 'Xem kế hoạch bảo dưỡng',
      'transport.maintenance.plan.manage': 'Lập kế hoạch bảo dưỡng',
      'transport.maintenance.work_order.open': 'Mở lệnh sửa xe',
      'transport.maintenance.work_order.close': 'Đóng lệnh sửa xe',
      'transport.compliance.document.read': 'Xem giấy tờ xe (đăng kiểm, bảo hiểm…)',
      'transport.compliance.document.manage': 'Cập nhật giấy tờ xe',
      'transport.fleet_status.read': 'Xem tình trạng sẵn sàng của đội xe',
      'transport.alerts.read': 'Xem cảnh báo vận hành',
    },
    /** Bien so xe va ten lai xe tren lich bao duong, giay to. */
    needs: ['transport.vehicle.read', 'transport.driver.read'],
  },
  {
    id: 'ban-do',
    label: 'Bản đồ, vị trí & địa điểm',
    summary: 'Vị trí xe, đường đi chi tiết và địa điểm vận hành trên bản đồ.',
    grantable: true,
    actions: {
      'transport.tracking.read': 'Xem tóm tắt vị trí của chuyến (không có toạ độ)',
      'transport.location.history.read': 'Xem đường đi chi tiết của xe và lái xe',
      'transport.telematics.observation.ingest': 'Nhập vị trí từ thiết bị định vị trên xe',
      'transport.geofence.read': 'Xem địa điểm vận hành',
      'transport.geofence.manage': 'Thêm, sửa, tắt địa điểm vận hành',
    },
    /** Suc khoe vi tri hien o ho so xe; duong di hien tren ban do vong chay. */
    needs: ['transport.vehicle.read', 'transport.run.read'],
  },
  {
    id: 'phi-duong',
    label: 'Phí đường bộ (ETC)',
    summary: 'Tài khoản thu phí, dữ liệu ETC và đối soát phí đường bộ.',
    grantable: true,
    actions: {
      'transport.toll.account.read': 'Xem tài khoản thu phí và xe gắn vào',
      'transport.toll.account.manage': 'Quản lý tài khoản thu phí, gắn xe',
      'transport.toll.import': 'Nhập dữ liệu phí đường bộ',
      'transport.toll.review.read': 'Xem các dòng phí cần đối soát',
      'transport.toll.review.resolve': 'Xử lý dòng phí cần đối soát',
    },
    /** Bien so xe gan voi tai khoan thu phi. */
    needs: ['transport.vehicle.read'],
  },
  {
    id: 'bao-cao',
    label: 'Báo cáo',
    summary: 'Báo cáo công nợ, quyết toán và chỉ số vận hành của đội xe.',
    grantable: true,
    actions: {
      'transport.settlement.report.read': 'Xem báo cáo công nợ và quyết toán',
      'transport.analytics.read': 'Xem chỉ số vận hành (km rỗng, hiệu quả chuyến)',
    },
    /** Ten doi tac, khach tren bang phai tra va vi the doi tac. */
    needs: ['transport.customer.read', 'transport.partner.read'],
  },
  {
    id: 'quan-tri',
    label: 'Quản trị',
    summary: 'Nối tài khoản đăng nhập với hồ sơ lái xe, bên góp vốn.',
    grantable: true,
    actions: {
      'transport.account_link.manage': 'Nối tài khoản đăng nhập với hồ sơ lái xe, bên góp vốn',
    },
    needs: [],
  },
  {
    id: 'lai-xe',
    label: 'Việc của chính lái xe',
    summary: 'Có khi tài khoản được nối với một hồ sơ lái xe — không cấp bằng quyền riêng.',
    grantable: false,
    actions: {
      'transport.driver.self.trip.read': 'Xem chuyến của mình',
      'transport.driver.self.trip.update': 'Cập nhật chuyến của mình',
      'transport.driver.self.fund.read': 'Xem quỹ tạm ứng của mình',
      'transport.driver.self.fuel.read': 'Xem phiếu đổ dầu của mình',
      'transport.driver.self.fuel.submit': 'Nộp phiếu đổ dầu của mình',
      'transport.driver.self.expense.record': 'Ghi khoản chi từ tiền tạm ứng của mình',
      'transport.driver.self.expense.claim.submit': 'Nộp đề nghị chi của mình',
      'transport.driver.self.payslip.read': 'Xem phiếu lương của mình',
      'transport.driver.self.settlement.read': 'Xem quyết toán của mình',
      'transport.driver.self.tracking.start': 'Bật chia sẻ vị trí',
      'transport.driver.self.tracking.report': 'Gửi vị trí trong chuyến',
      'transport.driver.self.tracking.stop': 'Tắt chia sẻ vị trí',
      'transport.driver.self.proof.record': 'Chụp chứng cứ bắt đầu và giao hàng',
      'transport.driver.self.checkpoint.record':
        'Ghi mốc hiện trường (đến nơi, bốc hàng, giao xong…)',
      'transport.driver.self.site_intake.propose': 'Xem gợi ý nhận việc tại chỗ',
      'transport.driver.self.site_intake.confirm': 'Nhận việc tại chỗ',
      'transport.driver.self.waiting.start': 'Bắt đầu tính giờ chờ người nhận',
      'transport.driver.self.document.record': 'Ghi chứng từ vận hành của mình',
      'transport.driver.self.receipt_handover.record': 'Báo đang giữ biên nhận giấy',
    },
    needs: [],
  },
  {
    id: 'chu-xe',
    label: 'Xe mình có cổ phần',
    summary: 'Có khi tài khoản được nối với một hồ sơ bên góp vốn — không cấp bằng quyền riêng.',
    grantable: false,
    actions: {
      'transport.stakeholder.self.vehicle.read': 'Xem xe mình có cổ phần',
    },
    needs: [],
  },
];

/**
 * VAI KHOI DIEM cua mien van tai, bang ten nghiep vu. Vai `MANAGER` bat dau TRONG: Giam doc chon
 * nhom quyen cho tung nguoi. Chu xe / ben gop von cung dung vai nay, khong them quyen nao, roi noi
 * ho so ben gop von — pham vi cua ho den tu lien ket, khong tu vai.
 */
export const TRANSPORT_PRESETS: readonly PermissionPresetView[] = [
  {
    role: 'ADMIN',
    label: 'Giám đốc',
    summary: 'Toàn quyền vận hành, duyệt tiền và quản trị tài khoản.',
  },
  {
    role: 'ACCOUNTING',
    label: 'Kế toán',
    summary:
      'Sổ sách, công nợ, quỹ và lương. Không sửa bằng chứng hiện trường, không mở lại kỳ đã đóng.',
  },
  {
    role: 'MANAGER',
    label: 'Điều hành / Quản lý',
    summary:
      'Bắt đầu trống — chọn nhóm quyền cần dùng. Chủ xe, bên góp vốn cũng dùng vai này rồi nối hồ sơ bên góp vốn.',
  },
  {
    role: 'SALE',
    label: 'Lái xe',
    summary: 'Chỉ việc của chính mình; cần nối với một hồ sơ lái xe.',
  },
];

const DIRECTOR_ONLY: ReadonlySet<TransportAction> = new Set(DIRECTOR_ONLY_ACTIONS);
const ESCALATION: ReadonlySet<TransportAction> = new Set(ESCALATION_ACTIONS);
const DECISION: ReadonlySet<TransportAction> = new Set(FINANCIAL_DECISION_ACTIONS);
const EVIDENCE: ReadonlySet<TransportAction> = new Set(EVIDENCE_MUTATION_ACTIONS);

/**
 * LOAI cua mot ma, suy tu quy tac. `NHAY_CAM` dung TRUOC `XEM`: doc duong di tung phut cua mot con
 * nguoi (`transport.location.history.read`) la mot phep doc, nhung cap no phai xac nhan leo thang —
 * nhan "Xem" se noi nhe hon su that.
 */
export function transportActionKind(action: TransportAction): PermissionKind {
  if (DIRECTOR_ONLY.has(action) || ESCALATION.has(action)) return 'NHAY_CAM';
  if (DECISION.has(action)) return 'DUYET';
  if (action.endsWith('.read')) return 'XEM';
  return 'THAO_TAC';
}

export function transportActionSod(action: TransportAction): SeparationOfDutySide | null {
  if (DECISION.has(action)) return 'DECISION';
  if (EVIDENCE.has(action)) return 'EVIDENCE';
  return null;
}

function actionView(code: TransportAction, label: string): PermissionActionView {
  return {
    code,
    label,
    kind: transportActionKind(code),
    directorOnly: DIRECTOR_ONLY.has(code),
    escalation: ESCALATION.has(code),
    sod: transportActionSod(code),
  };
}

const isTransportActionEntry = (
  entry: [string, string | undefined],
): entry is [TransportAction, string] =>
  entry[1] !== undefined && (TRANSPORT_ACTIONS as readonly string[]).includes(entry[0]);

function groupView(group: TransportPermissionGroup): PermissionGroupView {
  return {
    id: group.id,
    label: group.label,
    summary: group.summary,
    grantable: group.grantable,
    actions: Object.entries(group.actions)
      .filter(isTransportActionEntry)
      .map(([code, label]) => actionView(code, label)),
    needs: group.needs,
  };
}

const CATALOG: PermissionCatalogView = {
  groups: TRANSPORT_PERMISSION_GROUPS.map(groupView),
  presets: TRANSPORT_PRESETS,
};

export function transportPermissionCatalog(): PermissionCatalogView {
  return CATALOG;
}

/** Nhom chua mot ma — `null` chi khi ma chua duoc xep (bai spec khong de dieu do xay ra). */
export function transportPermissionGroupOf(
  action: TransportAction,
): TransportPermissionGroup | null {
  return TRANSPORT_PERMISSION_GROUPS.find((group) => group.actions[action] !== undefined) ?? null;
}
