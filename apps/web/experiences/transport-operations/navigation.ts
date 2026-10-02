import type { CapabilityId } from '@netviet/tenant';
import type { AuthRole } from '../../lib/auth';
import {
  canPerform,
  canPerformAll,
  hasOperationsScope,
  hasPlatformPermission,
  STAKEHOLDER_SCOPE_ACTIONS,
  type PlatformPermission,
  type TransportAction,
  type TransportViewer,
} from './transport-actions';

/**
 * KIEN TRUC THONG TIN cua be mat van hanh van tai — mot HOP DONG kiem tra duoc bang ham thuan.
 *
 * Tep nay CO Y khong chua JSX, dung khuon `b2b-sales-operations/navigation.ts:6-11`: co bao nhieu
 * muc, muc nao thuoc nhom nao, muc nao doi nang luc gi, vai nao thay muc nao — do la kien truc, cho
 * khong phai chi tiet trinh bay rai trong component. Nho vay mot thay doi IA lam do test TRUOC khi
 * no kip lam do man hinh cua khach.
 *
 * HAI truc long nhau, va chung KHONG the gop lam mot:
 *
 *   1. `requiredCapabilities` — khach co MUA nghiep vu nay khong (`CapabilityId`, dong kin).
 *   2. `requiredActions`      — nguoi nay doc duoc DU LIEU CHINH cua muc khong (`GD-22`, theo hanh
 *      dong; `#395`: mot BO ma, khong phai mot ma — xem `TransportSection.requiredActions`).
 *
 * Va mot truc VI TRI tach han khoi hai truc quyen: `supersededBy` (#339) — muc da co duong thay the
 * rut khoi danh muc chinh nhung dia chi cu van mo duoc. No khong bao gio cap hay tuoc quyen.
 *
 * TRUOC DAY co mot truc thu tu — `pendingCapability` — so bang CHUOI voi danh sach nang luc luc
 * chay, vi `TX-06`/`TX-07` chua co ma trong `CapabilityId` khi T7A duoc viet. T6 da vao `main`
 * (PR #152, #88 dong), va `CAPABILITY_IDS` nay da co `transport-asset-compliance` +
 * `transport-workforce` (`packages/tenant/src/tenant.schema.ts:189,197`). Nen cho tam do da duoc
 * GO HAN: hai muc do gio dung `requiredCapabilities` co kieu nhu moi muc khac, va `tsc` kiem duoc
 * chung — dung §4.2 cua #180.
 */

/* ------------------------------------------------------------------ *
 * Muc va nhom
 * ------------------------------------------------------------------ */

export type TransportSectionId =
  | 'overview'
  | 'control-tower'
  | 'trips'
  | 'movement'
  | 'fleet'
  | 'driver-fund'
  | 'expense-claims'
  | 'order-completion'
  | 'fuel'
  | 'toll'
  | 'settlement'
  | 'maintenance'
  | 'payroll'
  | 'driver-settlement'
  | 'asset-ownership'
  | 'my-vehicles'
  | 'finance'
  | 'margin'
  | 'ar-ap'
  | 'dispatch'
  | 'journey'
  | 'routes'
  | 'fleet-dashboard'
  | 'executive'
  | 'exports'
  | 'admin-accounts'
  | 'admin-places';

export type TransportSectionGroupId =
  'root' | 'dispatch' | 'receivable' | 'payable' | 'driver-money' | 'reports' | 'assets' | 'admin';

export interface TransportSectionGroup {
  readonly id: TransportSectionGroupId;
  readonly label: string;
}

/**
 * NHOM TIEN LA CAU HOI NGHIEP VU, khong phai ten phan he (#341).
 *
 * Truoc day tien nam rai trong ba nhom tron lan (`CHI PHÍ & ĐỐI SOÁT`, `TÀI SẢN & NHÂN SỰ`,
 * `BÁO CÁO`), va bon nhan — `Công nợ & quyết toán`, `AR/AP`, `Bảng tài chính`, `Quyết toán lái xe`
 * — cung doc len nhu "cong no". Ke toan phai hieu ten phan he moi biet bam vao dau.
 *
 * Gio bon nhom tien la bon cau ke toan hoi moi ngay, va moi cau chi co MOT cho tra loi:
 *
 *   · `receivable`   — thu tien khach o dau (ket thuc don → phai thu khach hang);
 *   · `payable`      — cong ty con no ai: doi tac, nha xe, cay xang, phi duong bo;
 *   · `driver-money` — tien dang o tay lai xe, va cong ty con no lai xe bao nhieu;
 *   · `reports`      — ca cong ty dang o dau ve tien, chuyen/xe/tuyen nao hieu qua.
 *
 * Bon nhom tien dung LIEN mot mach ngay sau `dispatch`, theo dong tien (thu → tra → lai xe → tong
 * hop), va `assets` xuong CUOI. Do bang anh 1440×900 cua bo E2E: danh muc cuon trong thanh ben, va
 * khi `assets` con chen giua thi `Tổng hợp tài chính` lan `Hiệu quả từng chuyến` roi xuong duoi
 * mep cuon — ke toan phai cuon moi thay cau tra loi. Hai muc tai san la so dang ky it mo; canh bao
 * bao duong/giay to van dan thang vao muc cua no tu hang viec cua `Bảng điều hành`.
 *
 * Doi nhom KHONG doi quyen — nhom chi la VI TRI tren thanh ben. Hai truc quyen cua tung muc giu
 * nguyen, va `__tests__/navigation.spec.ts` khoa ban do cong quyen cua ca danh muc.
 */
export const TRANSPORT_SECTION_GROUPS = [
  { id: 'root', label: '' },
  { id: 'dispatch', label: 'ĐIỀU HÀNH' },
  { id: 'receivable', label: 'PHẢI THU' },
  { id: 'payable', label: 'PHẢI TRẢ' },
  { id: 'driver-money', label: 'QUỸ & LƯƠNG LÁI XE' },
  { id: 'reports', label: 'TỔNG HỢP & HIỆU QUẢ' },
  { id: 'assets', label: 'TÀI SẢN' },
  /*
   * `#395` — QUAN TRI o CUOI CUNG: tai khoan, quyen va dia diem van hanh la viec Giam doc lam it khi,
   * khong phai viec hang ngay; no khong duoc chen giua cac nhom tien ke toan doc moi sang.
   */
  { id: 'admin', label: 'QUẢN TRỊ' },
] as const satisfies readonly TransportSectionGroup[];

export interface TransportSection {
  readonly id: TransportSectionId;
  readonly label: string;
  readonly group: TransportSectionGroupId;
  readonly summary: string;
  readonly requiredCapabilities: readonly CapabilityId[];
  /**
   * TRUC QUYEN — DUNG MOT trong hai (`#395`; bai spec khoa dieu do):
   *
   *   · `requiredActions` — MOI hanh dong van tai ma DU LIEU CHINH cua muc can (`GD-22`). Muc chi
   *     hien khi nguoi xem giu DU ca bo: mot muc hien ra ma du lieu chinh bi `403` la mot man trang
   *     (hoac mot cau "chua co du lieu" sai). Bo nay KHONG go tay theo cam tinh — no la dung cac ma
   *     ma route cua cac query chinh doi o may chu, va `section-access.spec.ts` doc ma nguon (API
   *     controller → ham client → hook → component) de khoa dieu do;
   *   · `requiredPlatformPermission` — mot quyen cua NEN TANG (vd quan tri tai khoan), thu khong
   *     thuoc mien nao nen khong the la mot `TransportAction`.
   *
   * Ca hai cung luat voi `canPerform(null)`: chua biet nguoi xem la ai thi HIEN.
   */
  readonly requiredActions?: readonly TransportAction[];
  readonly requiredPlatformPermission?: PlatformPermission;
  /**
   * PHAN PHU cua muc — khoi, cot ten, bang phu can THEM mot quyen ngoai bo chinh (`#395`).
   *
   * Khong giu thi muc van hien, nhung phan do KHONG hoi may chu va noi mot cau nghiep vu
   * ("Bạn chưa được cấp quyền xem …", `components/PermissionGate.tsx`) thay vi mot o trong. Bai
   * `section-access.spec.ts` khoa hai chieu: moi query cua muc co ma nam trong `requiredActions`
   * hoac o day, va moi ma o day duoc phan VE hoi (`canPerform` / `PermissionGate`).
   */
  readonly optionalActions?: readonly TransportAction[];
  /**
   * MUC DA CO DUONG THAY THE — truc thu BA, va no KHONG phai mot truc quyen (#339).
   *
   * Hai truc tren tra loi "nguoi nay CO DUOC mo muc nay khong". Truc nay tra loi mot cau khac:
   * "muc nay co nen DUNG TREN DANH MUC CHINH khong". Mot muc khai `supersededBy` van mo duoc bang
   * dia chi cu (`canNavigateTo` khong doc truc nay), chi rut khoi danh muc chinh xuong mot loi phu
   * noi ro viec moi bat dau o dau.
   *
   * VA CHI RUT KHI MUC THAY THE CUNG MO DUOC cho CHINH nguoi do. Neu mot vai/goi khach mo duoc muc
   * cu ma khong mo duoc muc moi, muc cu van la duong duy nhat cua ho vao nghiep vu — giau no di la
   * cat duong, khong phai don danh muc. Nen day la mot quy tac tren HAI muc, khong phai mot cau
   * `if role === ...`.
   */
  readonly supersededBy?: TransportSectionId;
  /**
   * TEN CU cua muc da doi ten (#341) — CHI de o loc danh muc tim ra muc bang chu nguoi dung da quen
   * go. Khong bao gio hien ra man hinh, va khong phai mot truc quyen.
   *
   * Day la ban tuong ung cho CHU cua dieu ma `id` on dinh lam cho DIA CHI: doi nhan khong duoc bien
   * mot thoi quen cu thanh mot o loc rong. Go "cong no" truoc day ra `Công nợ & quyết toán`; gio no
   * phai ra dung man do duoi ten moi, chu khong phai "Không có mục nào khớp".
   */
  readonly formerLabels?: readonly string[];
}

export const TRANSPORT_SECTIONS = [
  {
    id: 'overview',
    label: 'Tổng quan',
    group: 'root',
    summary: 'Đơn hàng, vòng chạy đang chạy, đội xe, và những việc đang chờ người xử lý.',
    requiredCapabilities: [],
    /**
     * Du lieu CHINH cua Tong quan la thap dieu hanh (`#348`/`#351`: vong chay, doi xe, hang viec).
     * Truoc `#395` cong la `transport.trip.read` — ma cua dong thong tin PHU ve chuyen lap tay —
     * nen mot nguoi chi doc duoc chuyen cu thay mot Tong quan trong. Don, chuyen cu va ky doi soat
     * la the PHU: thieu quyen thi the do noi mot cau, ca trang van dung.
     */
    requiredActions: ['transport.control_tower.read'],
    optionalActions: [
      'transport.order.read',
      'transport.trip.read',
      'transport.fuel.reconciliation.read',
    ],
  },
  /*
   * NHOM DIEU HANH doc theo THU TU MOT NGAY LAM VIEC (#339): nhan don → nhin toan canh → chon xe →
   * ho so xe va nguoi. Thu tu mang la thu tu tren thanh ben, nen day la mot quyet dinh kien truc
   * thong tin chu khong phai cach sap tep.
   */
  {
    id: 'movement',
    /**
     * DON dung truoc VONG CHAY trong ca ten man hinh — `#274`: sep/ke toan lam viec voi don, con
     * vong chay la su that van hanh he thong tu lap va tu dong.
     *
     * Va muc nay dung DAU nhom (#339): don hang la doi tuong nghiep vu chinh, nen day la noi mot
     * ngay lam viec bat dau.
     */
    label: 'Đơn hàng & vòng chạy',
    group: 'dispatch',
    summary:
      'Nơi việc hằng ngày bắt đầu: đơn hàng là đối tượng chính; vòng chạy và chặng chạy rỗng là phần vận hành, do hệ thống lập và tự đóng theo sự thật vận hành.',
    requiredCapabilities: ['transport-core'],
    /**
     * DON la du lieu chinh (`#274`: man hinh di tu don) — `useTransportOrders` chan ca trang khi
     * khong doc duoc don. Truoc `#395` cong la `transport.run.read` de mot nguoi khong duoc xem vong
     * chay khong thay bang vong chay o nua duoi; gio dieu do duoc giu O CHINH PHAN DO: khong co
     * `transport.run.read` thi query vong chay khong chay va khoi vong chay noi mot cau thay vi
     * hien bang. Ten khach, bien so va danh sach dia diem cua man tao don la phan phu cung luat.
     */
    requiredActions: ['transport.order.read'],
    optionalActions: [
      'transport.run.read',
      'transport.customer.read',
      'transport.vehicle.read',
      'transport.order.manage',
    ],
  },
  {
    /**
     * `TransportTrip` — chuyen LAP TAY cua the he truoc (#339).
     *
     * KHONG xoa, va dia chi `?section=trips&selected=…` van mo dung man nay cho nguoi du hai truc
     * quyen: du lieu chuyen cu va bo loc tren dia chi (#222 P2) van song. Tong quan chi con tro vao day
     * tu MOT dong thong tin phu ve chuyen chua khep (#348) — the so va hang viec cua no da doc tu vong
     * chay.
     * Nhung no khong con dung tren danh muc chinh canh `Đơn hàng & vòng chạy`: hai muc cung noi
     * "xe chay hang" dung canh nhau la cach nguoi dung First-UAT da bat dau sai luong.
     */
    id: 'trips',
    label: 'Chuyến xe',
    group: 'dispatch',
    summary:
      'Chuyến lập tay theo cách làm trước đây — vẫn mở được để xem và xử lý chuyến đã có; việc mới bắt đầu từ Đơn hàng & vòng chạy.',
    requiredCapabilities: ['transport-core'],
    requiredActions: ['transport.trip.read'],
    /** Danh ba ten (khach, doi tac, xe, lai xe) va hai khoi tien cua chi tiet chuyen. */
    optionalActions: [
      'transport.customer.read',
      'transport.partner.read',
      'transport.vehicle.read',
      'transport.driver.read',
      'transport.costing.expense.read',
      'transport.fuel.entry.read',
    ],
    supersededBy: 'movement',
  },
  {
    id: 'control-tower',
    label: 'Bảng điều hành',
    group: 'dispatch',
    summary:
      'Vòng chạy theo bảy cột của quy trình, đội xe đang ở đâu, và hàng việc đang chờ người xử lý.',
    /**
     * CHI `transport-core`. Ba nguồn còn lại (duyệt chi, nhiên liệu, cảnh báo) là TUỲ CHỌN ở tầng
     * đọc: khách tắt thì bảng công bố `unavailableSources` chứ không biến mất. Khai thêm capability
     * ở đây sẽ giấu cả bảng khỏi một khách vẫn dùng được phần lớn nó.
     */
    requiredCapabilities: ['transport-core'],
    requiredActions: ['transport.control_tower.read'],
  },
  {
    id: 'dispatch',
    label: 'Điều xe',
    group: 'dispatch',
    summary: 'Xe nào gần điểm lấy hàng, sẽ rảnh lúc nào, chạy rỗng thêm bao nhiêu — người chọn.',
    /**
     * `transport.dispatch.suggest.read` — ma cua Lane M (#277), khong phai mot ma moi cua Lane N.
     *
     * Muc nam o nhom DIEU HANH chu khong o nhom BAO CAO: day la mot man hinh nguoi truc dung de
     * LAM VIEC, khong phai mot bao cao de doc. Lenh gan xe di sau `transport.run.manage` va duoc
     * kiem lai o may chu.
     *
     * `#395`: man hinh doc DON de chon va CHE DO VAN HANH (`GET /transport/planning/policy`,
     * `transport.run.read`) truoc khi moi bam "Tìm xe". Chi co ma de nghi thi man treo o "Đang đọc
     * chế độ vận hành…" mai mai — nen ca ba deu la du lieu chinh.
     */
    requiredCapabilities: ['transport-core'],
    requiredActions: [
      'transport.dispatch.suggest.read',
      'transport.order.read',
      'transport.run.read',
    ],
  },
  {
    id: 'fleet',
    label: 'Đội xe & lái xe',
    group: 'dispatch',
    summary: 'Hồ sơ xe, hồ sơ lái xe, lịch sử phụ trách và số km đồng hồ.',
    requiredCapabilities: ['transport-core'],
    requiredActions: ['transport.vehicle.read'],
    /** Bang lai xe va suc khoe vi tri cua mot xe la phan phu, moi phan mot ma. */
    optionalActions: ['transport.driver.read', 'transport.tracking.read'],
  },
  /*
   * THU TU MANG VAN LA THU TU TREN THANH BEN (#341): moi nhom dung LIEN mot khoi, theo dung thu tu
   * cua `TRANSPORT_SECTION_GROUPS`. `__tests__/navigation.spec.ts` khoa dieu do, nen doc tep nay tu
   * tren xuong la doc thanh ben tu tren xuong.
   */
  {
    /**
     * BUOC DAU cua viec thu tien khach, nen dung dau nhom PHẢI THU (#341): doi soat voi khach chi
     * nhan don da `Đã kết thúc` (`customer-ar` doi `completion.state === 'APPROVED'`).
     */
    id: 'order-completion',
    label: 'Kết thúc đơn',
    group: 'receivable',
    summary:
      'Đơn đã giao xong, chờ kế toán xác nhận chứng từ. Chỉ đơn đã kết thúc mới vào kỳ đối soát mới.',
    requiredCapabilities: ['transport-acceptance'],
    requiredActions: ['transport.commercial_acceptance.read'],
    /** Chung tu van hanh cua don, doc khi mo hop quyet dinh. */
    optionalActions: ['transport.operational_document.read'],
  },
  {
    id: 'settlement',
    /**
     * `Phải thu khách hàng`, KHONG con `Công nợ & quyết toán` (#341).
     *
     * Tu #337 man nay giu DUNG MOT dong tien — cuoc khach hang: tuoi no, so phai thu, doi soat,
     * ghi nhan va phan bo tien ve. Nhan cu hua "nam dong tien" va dung chu `quyết toán` cua man lai
     * xe; ke toan doc len tuong ca cong no nha xe, cay xang, lai xe deu o day.
     *
     * `id` giu nguyen: `?section=settlement` la dia chi da nam trong dau trang va trong bai E2E
     * cong no khach — doi nhan khong duoc lam chet dia chi.
     */
    label: 'Phải thu khách hàng',
    group: 'receivable',
    summary:
      'Tiền khách hàng nợ công ty: ai nợ, nợ bao nhiêu, quá hạn bao lâu — và việc kế toán phải làm để thu về.',
    requiredCapabilities: ['transport-settlement'],
    /**
     * SO CONG NO KHACH (`customer-ar`: cho doi soat, lo doi soat, so theo tien te) la du lieu chinh.
     * Truoc `#395` cong la `transport.costing.period.read` — mot ma KHONG route nao cua man nay doi:
     * nguoi chi co ma do thay trang nay va nhan `403` o ca ba lan doc. Bang tuoi no
     * (`transport.settlement.report.read`) va danh ba ten la phan phu.
     */
    requiredActions: ['transport.customer_reconciliation.read'],
    optionalActions: [
      'transport.settlement.report.read',
      'transport.customer.read',
      'transport.partner.read',
      'transport.order.read',
    ],
    formerLabels: ['Công nợ & quyết toán'],
  },
  {
    id: 'ar-ap',
    /**
     * `AR/AP` la ten phan he, khong phai cau hoi (#341). Man nay KHONG co tuoi no phai thu cua
     * khach — no la ba dong PHAI TRA (cay xang, nha xe, hoa hong nguon don) va vi the hai chieu
     * cua MOT doi tac. Nen nhan noi thang: tra cho ai.
     */
    label: 'Phải trả đối tác & cây xăng',
    group: 'payable',
    summary:
      'Công ty còn nợ ai — cây xăng, nhà xe, hoa hồng nguồn đơn — theo từng đối tác, cùng vị thế hai chiều của một đối tác.',
    requiredCapabilities: ['transport-settlement'],
    /**
     * Ba dong phai tra va vi the doi tac deu la bao cao quyet toan (`GET /transport/settlement/ap`,
     * `.../partners/:id/position`). Truoc `#395` cong la `transport.costing.period.read` va man hien
     * ra khong mot lan doc nao cho nguoi chi co ma do.
     */
    requiredActions: ['transport.settlement.report.read'],
    optionalActions: ['transport.partner.read', 'transport.customer.read'],
    formerLabels: ['AR/AP'],
  },
  {
    /**
     * Nam o PHẢI TRẢ (#341): dong ky doi soat bang ke o day la cho sinh ra khoan cong ty no cay
     * xang (`FUEL_SUPPLIER`, qua vong quet ban giao cua `transport-settlement`).
     */
    id: 'fuel',
    label: 'Nhiên liệu',
    group: 'payable',
    summary: 'Phiếu đổ dầu, xác thực phiếu, nhập bảng kê cây xăng và đối soát.',
    requiredCapabilities: ['transport-fuel'],
    requiredActions: ['transport.fuel.entry.read'],
    /** Ky doi soat bang ke, hang soat chung tu may doc va o chon xe cua bang tieu hao. */
    optionalActions: [
      'transport.fuel.reconciliation.read',
      'transport.fuel.document.read',
      'transport.vehicle.read',
    ],
  },
  {
    /** Canh Nhien lieu: cung mot viec — nap bang ke cua nha cung cap roi doi soat tung dong. */
    id: 'toll',
    label: 'Phí đường bộ (ETC)',
    group: 'payable',
    summary:
      'Tài khoản VETC/ePass, sổ xe nhận chi trả, nạp bảng kê và hàng chờ đối soát từng dòng.',
    requiredCapabilities: ['transport-toll'],
    requiredActions: ['transport.toll.account.read'],
    /** Nap bang ke, hang cho doi soat, bao cao chi phi va bien so xe. */
    optionalActions: ['transport.toll.review.read', 'transport.vehicle.read'],
  },
  {
    id: 'driver-fund',
    /**
     * `Quỹ lái xe`, khong con `/ Chi phí` (#341). Man nay la SO QUY: so du, tam ung, hoan quy, ky
     * quy. Chu `Chi phí` dung mot minh doc nhu "moi chi phi cua cong ty o day", trong khi nhien lieu
     * va ETC la chi phi cong ty va KHONG BAO GIO tru vao quy lai xe.
     */
    label: 'Quỹ lái xe',
    group: 'driver-money',
    summary: 'Số dư quỹ từng lái xe, tạm ứng, hoàn quỹ, chi phí chuyến và kỳ quỹ.',
    requiredCapabilities: ['transport-costing'],
    /**
     * So quy doc THEO TUNG LAI XE, chon tu danh sach ho so lai xe (`GET /transport/drivers`). Khong
     * doc duoc danh sach do thi man nay noi "Chưa có hồ sơ lái xe nào" — mot cau sai (`#395`).
     */
    requiredActions: ['transport.costing.driver_fund.read', 'transport.driver.read'],
    /** Ky quy da dong cua lai xe dang chon. */
    optionalActions: ['transport.costing.period.read'],
    formerLabels: ['Quỹ lái xe / Chi phí'],
  },
  {
    id: 'expense-claims',
    label: 'Duyệt chi lái xe',
    group: 'driver-money',
    summary: 'Đề nghị chi lái xe gửi lên — chỉ khoản được duyệt mới vào giá thành và sổ quỹ.',
    requiredCapabilities: ['transport-costing'],
    requiredActions: ['transport.expense.claim.read'],
    optionalActions: ['transport.driver.read'],
  },
  {
    id: 'payroll',
    label: 'Lương',
    group: 'driver-money',
    summary: 'Kỳ lương, bảng tính thử, phiếu lương và các khoản cấu thành.',
    requiredCapabilities: ['transport-costing', 'transport-workforce'],
    /**
     * `transport.payroll.period.read` — ma cua MOI route luong. Truoc `#395` cong la
     * `transport.costing.period.read` (ky KE TOAN), va nguoi chi co ma do thay "Chưa có kỳ lương
     * nào được mở." trong khi may chu co ky luong: mot cau sai, khong phai mot man trong.
     */
    requiredActions: ['transport.payroll.period.read'],
    optionalActions: ['transport.driver.read', 'transport.vehicle.read'],
  },
  {
    id: 'driver-settlement',
    label: 'Quyết toán lái xe',
    group: 'driver-money',
    summary: 'Lương đã ghi nhận theo tháng, các lần chi và phân bổ, hoàn ứng công ty còn nợ.',
    /**
     * HAI capability, cung bo voi man Luong: nguon cua moi khoan da ghi nhan la phieu luong
     * (`transport-workforce`), va hoan ung doc tu so quy (`transport-costing`).
     *
     * Cong la ma DOC rieng cua `TX-07b`, khong phai `transport.payroll.period.read`: bang nay noi
     * tien da RA KHOI cong ty luc nao va bang duong nao, va do la mot cau hoi khac voi "thang nay
     * lai xe duoc bao nhieu".
     */
    requiredCapabilities: ['transport-costing', 'transport-workforce'],
    requiredActions: ['transport.driver_settlement.read'],
    optionalActions: ['transport.driver.read', 'transport.vehicle.read'],
  },
  {
    id: 'finance',
    /**
     * `Tổng hợp tài chính`, khong con `Bảng tài chính` (#341) — va day la muc DUY NHAT dat sau dong
     * tien canh nhau. Hai muc `Phải thu …`/`Phải trả …` moi dong mot chieu; muc nay tra loi "ca cong
     * ty dang o dau ve tien", roi dan tung dong sang dung muc chi tiet cua no (`workspace/finance.ts`).
     *
     * Khac `executive`: man do ghep xe + tien + viec de doc trong 5 phut; man nay CHI co tien, du sau
     * dong va phan qua han.
     */
    label: 'Tổng hợp tài chính',
    group: 'reports',
    summary:
      'Chỉ phần tiền, cho cả công ty: doanh thu, biên trực tiếp và sáu dòng phải thu/phải trả đặt cạnh nhau — không cộng chung, mỗi dòng mở sang mục chi tiết.',
    /**
     * KHONG mot ma quyen moi: bang doc chinh `arAging`/`apByCounterparty`/`directMarginRollup` cua
     * bao cao quyet toan, roi bay chung canh nhau. Xem `FinanceController`.
     *
     * Cong `TX-07b` la TUY CHON o tang doc, nen o day chi khai `transport-settlement`: mot khach
     * khong tinh luong van co bang, chi thieu hai o cuoi va bang noi ra dieu do.
     */
    requiredCapabilities: ['transport-settlement'],
    requiredActions: ['transport.settlement.report.read'],
    formerLabels: ['Bảng tài chính'],
  },
  {
    id: 'margin',
    /**
     * `Hiệu quả từng chuyến`, khong con `Biên trực tiếp` (#341), va dung NGAY SAU tong hop tai
     * chinh: tong hop noi bien cua CA cong ty, muc nay tach ra tung chuyen de biet chuyen nao lam ra
     * tien. Chu `biên trực tiếp` van o tom tat va tren tung the so — `#244` G5 cam goi no la lai.
     */
    label: 'Hiệu quả từng chuyến',
    group: 'reports',
    summary:
      'Chuyến nào làm ra tiền: biên trực tiếp của từng chuyến — doanh thu trừ chi phí trực tiếp, chưa gồm chi phí cố định.',
    requiredCapabilities: ['transport-settlement'],
    /**
     * Du lieu duy nhat la `GET /transport/finance/margin` — ma `transport.settlement.report.read`.
     * Truoc `#395` cong la `transport.trip.read` (con lai tu khi man doc tung chuyen), va nguoi co
     * quyen Dieu hanh thay mot trang TRANG: khong so, khong cau nao.
     */
    requiredActions: ['transport.settlement.report.read'],
    formerLabels: ['Biên trực tiếp'],
  },
  {
    id: 'executive',
    /**
     * KHONG duoc trung nhan voi `control-tower`.
     *
     * Ca hai muc TUNG cung mang nhan `Bảng điều hành`, va chung nam trong cung mot thanh ben: nguoi
     * dung thay hai dong chu giong het nhau o hai nhom khac nhau va khong co cach nao doan duoc
     * bam cai nao. Do la mot loi KIEN TRUC THONG TIN, khong phai mot lan dat ten khong dep.
     *
     * Hai muc tra loi hai cau hoi that su khac nhau, va ten phai noi ra dieu do:
     *
     *   · `control-tower` — *hom nay xe dang o dau, viec nao dang cho ai* (nguoi truc dung de LAM);
     *   · `executive`     — *ca cong ty dang the nao* (ghep ba read model de DOC trong 5 phut).
     *
     * Co mot bai E2E neo vao `<h1>` cua man nay; doi nhan thi doi ca bai do, vi chinh bai do la
     * cho ghi lai rang hai man khong con trung ten.
     */
    label: 'Tổng hợp giám đốc',
    group: 'reports',
    summary: 'Xe đang chạy thế nào, tiền đang ở đâu, việc gì cần người xử lý — trong 5 phút.',
    /**
     * `transport.control_tower.read` chu KHONG mot ma moi.
     *
     * Man nay khong co lan goi API rieng nao: no ghep ba read model da nghiem thu. Ma quyen o day
     * la ma cua PHAN LOI (thap dieu hanh); hai phan con lai — tien va doi xe — tu tat o may chu neu
     * nguoi dung khong co quyen doc chung, va man hinh chi thieu mot khoi thay vi tu choi ca trang.
     * `#395`: khoi thieu NOI mot cau "Bạn chưa được cấp quyền xem …" thay vi bien mat.
     */
    requiredCapabilities: ['transport-core'],
    requiredActions: ['transport.control_tower.read'],
    optionalActions: ['transport.settlement.report.read', 'transport.analytics.read'],
  },
  {
    id: 'fleet-dashboard',
    label: 'Bảng đội xe',
    group: 'reports',
    summary: 'Km có hàng, km rỗng, tỷ lệ sử dụng và xe chạy rỗng nhiều nhất.',
    requiredCapabilities: ['transport-core'],
    requiredActions: ['transport.analytics.read'],
  },
  {
    id: 'routes',
    label: 'Báo cáo tuyến',
    group: 'reports',
    summary: 'Mỗi tuyến chạy bao nhiêu chuyến, dài bao nhiêu, kéo theo bao nhiêu km rỗng.',
    requiredCapabilities: ['transport-core'],
    requiredActions: ['transport.analytics.read'],
  },
  {
    id: 'journey',
    label: 'Bản đồ vòng chạy',
    group: 'reports',
    summary: 'Chặng có hàng và chặng rỗng của một vòng chạy, trên bản đồ và trên dòng thời gian.',
    /**
     * CHI `transport-core`, va do la co y — cung khuon thap dieu hanh.
     *
     * Ban do can toa do cua `transport-proof` va moc cua `transport-checkpoint`, nhung mot khach
     * chua bat hai capability do VAN doc duoc bao cao: chang, km co hang/rong, ma don. Khai ca ba o
     * day se lam muc bien mat khoi menu thay vi hien ra kem mot cau noi ro thieu gi.
     *
     * Cong la `transport.run.read` — quyen cua BAO CAO. Toa do di sau mot ma khac
     * (`transport.location.history.read`) va duoc kiem o may chu, khong o menu: ke toan van mo duoc
     * muc nay, chi khong thay ban do. Xem `JourneyController`.
     */
    requiredCapabilities: ['transport-core'],
    requiredActions: ['transport.run.read'],
    optionalActions: ['transport.location.history.read'],
  },
  {
    id: 'exports',
    label: 'Xuất dữ liệu',
    group: 'reports',
    summary: 'Kết xuất sổ sách để đối chiếu ngoài hệ thống.',
    requiredCapabilities: ['transport-core'],
    /**
     * Ban xuat chuyen xe la ban xuat CHINH (va cong truoc `#395`); moi ban xuat con lai la mot khoi
     * rieng voi ma cua no — thieu quyen thi khoi do noi mot cau, khong con mot nut xam khong ly do.
     */
    requiredActions: ['transport.trip.read'],
    optionalActions: [
      'transport.customer.read',
      'transport.partner.read',
      'transport.vehicle.read',
      'transport.driver.read',
      'transport.settlement.report.read',
      'transport.costing.driver_fund.read',
      'transport.fuel.entry.read',
      'transport.payroll.period.read',
    ],
  },
  /* TAI SAN o CUOI danh muc (#341) — xem ghi chu cua `TRANSPORT_SECTION_GROUPS`. */
  {
    id: 'maintenance',
    label: 'Bảo dưỡng & giấy tờ',
    group: 'assets',
    summary: 'Lịch bảo dưỡng đến hạn, lệnh sửa chữa, giấy tờ sắp hết hạn.',
    requiredCapabilities: ['transport-core', 'transport-asset-compliance'],
    /**
     * Lich bao duong den han va lenh sua chua (`transport.maintenance.plan.read`) la du lieu chinh.
     * Truoc `#395` cong la `transport.vehicle.read`: nguoi co quyen Doi xe thay ba cau "chưa có …"
     * sai, con nguoi co dung nhom Bao duong khong thay muc nao. Giay to, canh bao, tinh trang doi
     * xe va danh ba ten xe/lai xe la phan phu.
     */
    requiredActions: ['transport.maintenance.plan.read'],
    optionalActions: [
      'transport.compliance.document.read',
      'transport.fleet_status.read',
      'transport.alerts.read',
      'transport.vehicle.read',
      'transport.driver.read',
    ],
  },
  {
    /**
     * `TX-08` — so dang ky so huu. MUC RIENG, khong phai mot tab trong "Doi xe & lai xe".
     *
     * Hai man tra loi hai cau hoi khac nhau cho hai nguoi khac nhau: "Doi xe" tra loi *xe nay chay
     * duoc khong* (dieu do vien), con man nay tra loi *ai la chu chiec xe nay* (giam doc/ke toan).
     * Va chung co hai ma quyen rieng, nen gop lam mot tab se lam mot nguoi chi duoc xem ho so xe
     * nhin thay ca so dang ky so huu.
     */
    id: 'asset-ownership',
    label: 'Sở hữu tài sản',
    group: 'assets',
    summary: 'Quyền điều hành, sổ đăng ký sở hữu từng xe, hồ sơ bên hữu quan và lịch sử.',
    requiredCapabilities: ['transport-core'],
    requiredActions: ['transport.asset_ownership.read'],
    /** So dang ky doc THEO XE — o chon xe can danh sach xe. */
    optionalActions: ['transport.vehicle.read'],
  },
  {
    /**
     * `#395` — "Xe toi co co phan" cho nguoi VUA co viec van hanh VUA la ben gop von.
     *
     * Truoc `#395` ben gop von la tai khoan KHONG co quyen van hanh nao, va man cua ho hien THANG
     * khi danh muc rong (`TransportOperations`). Gio Giam doc cap duoc quyen rieng cho mot `MANAGER`
     * da noi ho so ben gop von — danh muc cua nguoi do khong con rong, va khong co muc nay thi ho
     * mat duong vao xe cua chinh minh.
     *
     * Chi hien khi may chu DA xac nhan pham vi (`stakeholderLinked`) VA nguoi do co viec van hanh
     * (`sectionPermitted`). Ben gop von thuan tuy (khong quyen nao) giu nguyen man hien thang, khong
     * mot thanh ben chi co mot muc.
     */
    id: 'my-vehicles',
    label: 'Xe tôi có cổ phần',
    group: 'assets',
    summary: 'Những xe bạn góp vốn: tỷ lệ của bạn, tình trạng xe và hoạt động gần đây.',
    requiredCapabilities: ['transport-core'],
    requiredActions: ['transport.stakeholder.self.vehicle.read'],
  },
  /*
   * `#395` — QUAN TRI. Hai muc, hai truc quyen KHAC NHAU va do la co y:
   *
   *   · `admin-accounts` doi quyen NEN TANG `platform.accounts.manage` — chi Giam doc co, khong cap
   *     duoc bang quyen rieng (nguoi cap duoc quyen thi tu cap duoc moi quyen cho minh);
   *   · `admin-places` doi `transport.geofence.read` (danh sach dia diem) VA `transport.geofence
   *     .manage` — hanh dong SUA hang rao, thu Ke toan KHONG co (hang rao cham LUC DOC, sua no doi
   *     phan quyet cua chung cu cu). Nen danh muc Ke toan van bang dung danh muc Giam doc TRU hai
   *     muc quan tri. Truoc `#395` cong chi co ma sua, va nguoi chi duoc sua nhan `403` o chinh lan
   *     doc danh sach.
   */
  {
    id: 'admin-accounts',
    label: 'Tài khoản & quyền',
    group: 'admin',
    summary: 'Ai đăng nhập được, mỗi người làm được gì, mật khẩu tạm và khoá tài khoản.',
    requiredCapabilities: ['transport-core'],
    requiredPlatformPermission: 'platform.accounts.manage',
    /** Noi tai khoan voi ho so lai xe / ben gop von. */
    optionalActions: [
      'transport.account_link.manage',
      'transport.driver.read',
      'transport.asset_ownership.read',
    ],
  },
  {
    id: 'admin-places',
    label: 'Địa điểm vận hành',
    group: 'admin',
    summary:
      'Bãi xe, kho khách hàng và nhà máy đối tác — một nguồn cho tạo đơn, lập kế hoạch và hiện trường.',
    requiredCapabilities: ['transport-core', 'transport-proof'],
    requiredActions: ['transport.geofence.read', 'transport.geofence.manage'],
    /** Chon chu dia diem (khach hang / don vi) va tim dia diem theo ten. */
    optionalActions: [
      'transport.customer.read',
      'transport.counterparty.read',
      'transport.order.manage',
    ],
  },
] as const satisfies readonly TransportSection[];

const DEFAULT_SECTION: TransportSectionId = 'overview';

/* ------------------------------------------------------------------ *
 * Be mat LAI XE — `GD-23`
 * ------------------------------------------------------------------ */

/**
 * Be mat lai xe la mot ROUTE RIENG CO GUARD TRONG CUNG EXPERIENCE, dung nhu `GD-23` chot cho
 * `PG-01`. Khong duoc bien no thanh mot nhanh theo vai o tang dinh tuyen — hop dong mien cam dieu
 * do o §12. No la mot dia chi rieng (`?surface=driver`), va moi payload cua no di qua kieu khung
 * nhin rieng khong co truong doanh thu (`DriverTripView`, `DriverFuelSlipView` — `INV-09`).
 *
 * Man "Chi phi" CO tu T7B: `#168 B3` mo `POST /transport/me/expenses`, va `#169` acceptance 4
 * cho phep dinh anh chung tu ngay trong cung lan goi do.
 */
export type DriverScreenId =
  'home' | 'site-intake' | 'field' | 'trip' | 'fuel' | 'expense' | 'fund' | 'history' | 'payslip';

export interface DriverScreen {
  readonly id: DriverScreenId;
  readonly label: string;
  readonly requiredCapabilities: readonly CapabilityId[];
  readonly requiredAction: TransportAction;
}

export const DRIVER_SCREENS = [
  {
    id: 'home',
    label: 'Trang chủ',
    requiredCapabilities: ['transport-core'],
    requiredAction: 'transport.driver.self.trip.read',
  },
  {
    /**
     * NHAN VIEC TAI DIA DIEM A (`#267` H6). Dung SAU `home`, va do la thu tu cua mot ngay lam viec:
     * lai xe mo app o cong nha may, truoc khi co chuyen nao de mo.
     *
     * `requiredAction` la ma DOC (`.propose`), khong phai ma tao. Man hinh phai hien ra duoc ca voi
     * mot khach chi cap quyen xem de nghi — luc do nut `Tao chuyen` khong hien, va do la mot cau
     * hinh hop le chu khong phai mot man hinh hong.
     */
    id: 'site-intake',
    label: 'Nhận việc',
    requiredCapabilities: ['transport-site-intake'],
    requiredAction: 'transport.driver.self.site_intake.propose',
  },
  {
    /**
     * HIEN TRUONG (`#279` O9) — dung SAU `site-intake` va TRUOC `trip`, va do la thu tu cua mot ngay
     * lam viec: nhan viec o cong nha may, roi bam tung buoc hien truong, roi moi den man hinh
     * chuyen (v1) de doi trang thai.
     *
     * `requiredAction` la ma GHI MOC chu khong mot ma doc rieng: man hinh nay CHI co nghia voi
     * nguoi thuc su ghi duoc moc. Che them mot ma `.field.read` se la mot ma khong ai dung mot
     * minh, va moi khach van tai sau deu phai mang no.
     */
    id: 'field',
    label: 'Hiện trường',
    requiredCapabilities: ['transport-checkpoint'],
    requiredAction: 'transport.driver.self.checkpoint.record',
  },
  {
    id: 'trip',
    label: 'Chuyến',
    requiredCapabilities: ['transport-core'],
    requiredAction: 'transport.driver.self.trip.read',
  },
  {
    id: 'fuel',
    label: 'Nhiên liệu',
    requiredCapabilities: ['transport-fuel'],
    requiredAction: 'transport.driver.self.fuel.read',
  },
  {
    id: 'expense',
    label: 'Chi phí',
    requiredCapabilities: ['transport-costing'],
    requiredAction: 'transport.driver.self.expense.record',
  },
  {
    id: 'fund',
    label: 'Quỹ',
    requiredCapabilities: ['transport-costing'],
    requiredAction: 'transport.driver.self.fund.read',
  },
  {
    id: 'history',
    label: 'Lịch sử',
    requiredCapabilities: ['transport-core'],
    requiredAction: 'transport.driver.self.trip.read',
  },
  {
    id: 'payslip',
    label: 'Phiếu lương',
    requiredCapabilities: ['transport-workforce'],
    requiredAction: 'transport.driver.self.payslip.read',
  },
] as const satisfies readonly DriverScreen[];

const DEFAULT_DRIVER_SCREEN: DriverScreenId = 'home';

/* ------------------------------------------------------------------ *
 * Loc
 * ------------------------------------------------------------------ */

/**
 * `role: null` nghia la CHUA BIET vai — `AuthGate` con dang doi `/auth/me`, hoac tenant chay che do
 * khong phien. Xem `transport-actions.canPerform`: khi do khong duoc an bot gi.
 */
export interface NavigationInput extends TransportViewer {
  readonly capabilities: readonly CapabilityId[];
  readonly role: AuthRole | null;
  /**
   * Tap quyen HIEU LUC tu `/auth/me` (`#395`). Co thi MOI cong quyen cua man hinh doc no; thieu
   * (may chu cu, bai test cu) thi roi ve ban guong theo vai. Xem `transport-actions.TransportViewer`.
   */
  readonly permissions?: ReadonlySet<string> | null;
  readonly blockedCapabilityKeys?: readonly string[];
}

const capabilitiesSatisfied = (
  required: readonly CapabilityId[],
  capabilities: readonly CapabilityId[],
): boolean => {
  const enabled = new Set<CapabilityId>(capabilities);
  return required.every((capability) => enabled.has(capability));
};

export const isSectionEnabled = (section: TransportSection, input: NavigationInput): boolean =>
  capabilitiesSatisfied(section.requiredCapabilities, input.capabilities) &&
  !section.requiredCapabilities.some((capability) =>
    input.blockedCapabilityKeys?.includes(capability),
  ) &&
  sectionPermitted(section, input);

/**
 * Truc quyen cua mot muc — DUNG MOT trong hai (xem `TransportSection.requiredActions`). Muc khai
 * thieu ca hai (hoac mot bo ma RONG) la muc SAI, va o day no bi DONG (fail-closed); bai spec bat no
 * truoc khi toi day.
 */
export function sectionPermitted(section: TransportSection, viewer: TransportViewer): boolean {
  const actions = section.requiredActions ?? [];
  if (actions.length > 0) {
    // Muc cua ben gop von CHI nam tren thanh ben cua nguoi CO viec van hanh; ben gop von thuan tuy
    // co man hien thang khi danh muc rong (xem muc `my-vehicles`).
    const permitted = canPerformAll(viewer, actions);
    return actions.some(isStakeholderScoped) ? permitted && hasOperationsScope(viewer) : permitted;
  }
  if (section.requiredPlatformPermission !== undefined) {
    return hasPlatformPermission(viewer, section.requiredPlatformPermission);
  }
  return false;
}

const isStakeholderScoped = (action: TransportAction): boolean =>
  STAKEHOLDER_SCOPE_ACTIONS.includes(action);

/**
 * CO NEN HOI may chu "nguoi nay co phai ben gop von khong" (`GET /transport/me/vehicles`) de dat muc
 * `my-vehicles` len thanh ben. Chi khi: khach bat `transport-core`, may chu DA tra tap quyen (tuc
 * che do phien, may chu `#395`), va nguoi do co viec van hanh — ben gop von thuan tuy da co man hien
 * thang, con khi chua biet ai thi chua co gi de hoi.
 */
export const shouldProbeStakeholderScope = (input: NavigationInput): boolean =>
  (input.capabilities as readonly string[]).includes('transport-core') &&
  input.permissions !== undefined &&
  input.permissions !== null &&
  hasOperationsScope(input);

export const findSection = (id: string): TransportSection | undefined =>
  TRANSPORT_SECTIONS.find((section) => section.id === id);

/**
 * DIA CHI mo duoc muc nay khong — CHI hai truc quyen. `supersededBy` co y KHONG duoc doc o day:
 * rut mot muc khoi danh muc chinh khong bao gio duoc lam mot dau trang cu cua nguoi co quyen chet.
 */
export const canNavigateTo = (section: string, input: NavigationInput): boolean => {
  const found = findSection(section);
  return found !== undefined && isSectionEnabled(found, input);
};

/**
 * Muc nay da co duong thay the MA CHINH nguoi nay mo duoc. Hai dieu kien, va thieu dieu kien sau
 * la cat duong: xem ghi chu cua `TransportSection.supersededBy`.
 */
const isSupersededFor = (section: TransportSection, input: NavigationInput): boolean =>
  section.supersededBy !== undefined && canNavigateTo(section.supersededBy, input);

/** DANH MUC CHINH — muc mo duoc, tru muc da co duong thay the mo duoc. */
export const visibleSections = (input: NavigationInput): readonly TransportSection[] =>
  TRANSPORT_SECTIONS.filter(
    (section) => isSectionEnabled(section, input) && !isSupersededFor(section, input),
  );

/**
 * MOT muc cu cung duong thay the cua no — de vo noi duoc "viec moi bat dau o dau" bang chinh nhan
 * cua muc moi, thay vi chep tay mot cau chu co the lech voi danh muc.
 */
export interface SupersededEntry {
  readonly section: TransportSection;
  readonly successor: TransportSection;
}

/**
 * LOI PHU cho muc da co duong thay the — van mo duoc, nhung khong dung chung hang voi viec hang ngay.
 *
 * Hop cua `visibleSections` va ham nay bang DUNG tap muc mo duoc: menu doi nhom khong lam ai thay
 * THEM mot muc ho khong co quyen, va cung khong lam ai MAT mot muc ho von co.
 */
export const supersededEntries = (input: NavigationInput): readonly SupersededEntry[] =>
  TRANSPORT_SECTIONS.flatMap((section: TransportSection): readonly SupersededEntry[] => {
    if (!isSectionEnabled(section, input) || !isSupersededFor(section, input)) return [];
    const successor =
      section.supersededBy === undefined ? undefined : findSection(section.supersededBy);
    return successor === undefined ? [] : [{ section, successor }];
  });

export interface TransportNavigationGroup {
  readonly group: TransportSectionGroup;
  readonly sections: readonly TransportSection[];
}

/** Nhom rong bi BO HAN — khong de lai mot tieu de mo coi tren thanh ben. */
export const navigationGroups = (input: NavigationInput): readonly TransportNavigationGroup[] => {
  const sections = visibleSections(input);
  return TRANSPORT_SECTION_GROUPS.map((group) => ({
    group,
    sections: sections.filter((section) => section.group === group.id),
  })).filter((entry) => entry.sections.length > 0);
};

/* ------------------------------------------------------------------ *
 * Loc danh muc theo chu go vao
 * ------------------------------------------------------------------ */

const COMBINING_MARKS = /[̀-ͯ]/g;
/**
 * `Đ`/`đ` (U+0110/U+0111) la chu RIENG, khong phai `D` co dau, nen `normalize('NFD')` KHONG tach no
 * ra. Cung ly le voi `workspace/trips.ts` — o day la de go "doi xe" tim ra "Đội xe & lái xe".
 */
const D_STROKE = /[Đđ]/g;

/**
 * Bo dau truoc khi so. Nguoi dieu hanh go nhanh va hau nhu khong bo dau.
 *
 * Khong tai su dung ham cung ten trong `workspace/trips.ts`: ham do khong duoc xuat ra, va no
 * thuoc ve mot mien khac (tim CHUYEN theo dia danh). Hai ban sao ba dong cua cung mot phep chuan
 * hoa chuoi la gia re hon mot lan phu thuoc giua kien truc thong tin va mo hinh chuyen xe.
 */
const foldForSearch = (value: string): string =>
  value.normalize('NFD').replace(COMBINING_MARKS, '').replace(D_STROKE, 'd').toLowerCase().trim();

/**
 * LOC DANH MUC — ham thuan, de bai kiem giu duoc hai luat duoi thay vi phai mo trinh duyet.
 *
 * Hai luat, va chung deu la luat AN TOAN chu khong phai luat tien nghi:
 *
 *   1. **Chuoi rong tra ve NGUYEN danh sach.** O loc la mot loi tat, khong phai mot cong. Neu no
 *      an bot khi chua ai go gi, thi mot nguoi khong nhin thay o do se ket luan la minh mat quyen.
 *   2. **Loc theo NHAN, khong theo `id`.** `id` la ma ky thuat (`driver-fund`, `ar-ap`); go "quy"
 *      phai tim ra "Quỹ lái xe", va go "ar-ap" khong bao gio la cach tim ra "Phải trả đối tác & cây
 *      xăng". Nhan la thu nguoi dung doc duoc, nen nhan la thu duoc so — cung voi TEN CU cua muc
 *      da doi ten (`formerLabels`, #341), vi do cung la chu nguoi dung da tung doc tren man hinh.
 *
 * Nhom rong sau khi loc bi bo han — cung luat voi `navigationGroups`: khong de lai mot tieu de
 * nhom khong con muc nao ben duoi.
 */
const matchesQuery = (section: TransportSection, needle: string): boolean =>
  [section.label, ...(section.formerLabels ?? [])].some((text) =>
    foldForSearch(text).includes(needle),
  );

export const filterNavigationGroups = (
  groups: readonly TransportNavigationGroup[],
  query: string,
): readonly TransportNavigationGroup[] => {
  const needle = foldForSearch(query);
  if (needle.length === 0) return groups;
  return groups
    .map((entry) => ({
      group: entry.group,
      sections: entry.sections.filter((section) => matchesQuery(section, needle)),
    }))
    .filter((entry) => entry.sections.length > 0);
};

export const isDriverScreenEnabled = (screen: DriverScreen, input: NavigationInput): boolean =>
  capabilitiesSatisfied(screen.requiredCapabilities, input.capabilities) &&
  canPerform(input, screen.requiredAction);

export const findDriverScreen = (id: string): DriverScreen | undefined =>
  DRIVER_SCREENS.find((screen) => screen.id === id);

export const visibleDriverScreens = (input: NavigationInput): readonly DriverScreen[] =>
  DRIVER_SCREENS.filter((screen) => isDriverScreenEnabled(screen, input));

/* ------------------------------------------------------------------ *
 * Trang thai tren dia chi
 * ------------------------------------------------------------------ */

export type TransportSurface = 'operations' | 'driver';

export const SURFACE_QUERY_PARAM = 'surface';
export const SECTION_QUERY_PARAM = 'section';
export const SCREEN_QUERY_PARAM = 'screen';
/**
 * Gia tri phai la mot DINH DANH NGHIEP VU — ma chuyen, bien so — khong bao gio la `id` ky thuat hay
 * `traceId`. Do la quy uoc da co cua b2b (`navigation.ts:302-307`), va o day no con thuan tien: API
 * khong co duong tra cuu theo ma chuyen, nen man hinh von da phai tu doi ma → id tren danh sach da
 * tai ve.
 */
export const SELECTION_QUERY_PARAM = 'selected';

/* ------------------------------------------------------------------ *
 * BO LOC CHUYEN NAM TREN DIA CHI — #222 P2
 * ------------------------------------------------------------------ */

/**
 * BA THAM SO DOC DUOC, khong phai mot khoi trang thai ma hoa.
 *
 * ==============================================================================================
 * LOI DUOC SUA O DAY
 *
 * Truoc ban nay, `?section=trips&selected=UAT-VIET-01` giu duoc LUA CHON nhung khong giu BO LOC:
 * o tim kiem nam trong `useState` cua `TripsView`. Chu so huu go `UAT-VIET-01`, tai lai trang, va
 * chu vua go bien mat trong khi khoi chi tiet van mo — mot man hinh tu mau thuan voi chinh no.
 *
 * ==============================================================================================
 * `q` chu khong `search`, `status`/`kind` chu khong `s`/`k`
 *
 * Dia chi la thu nguoi ta DAN CHO NHAU. `q` la quy uoc pho quat cua mot o tim kiem; mot chu cai
 * viet tat tiet kiem duoc sau ky tu va tra gia bang viec khong ai doc duoc dia chi do nua.
 *
 * Va KHONG mot `id` ky thuat nao o day: `status`/`kind` la ma nghiep vu dong (`TRIP_STATUSES`,
 * `TRIP_KINDS`), `q` la chu nguoi dung go. Dung quy uoc da co cua `SELECTION_QUERY_PARAM`.
 */
export const SEARCH_QUERY_PARAM = 'q';
export const STATUS_QUERY_PARAM = 'status';
export const KIND_QUERY_PARAM = 'kind';

/**
 * Bo loc chuyen o dang DIA CHI — ba chuoi, khong hon.
 *
 * Tang dieu huong CO Y khong biet `TripStatus`/`TripKind` la nhung gia tri nao: no chi cho chuoi
 * di qua, con viec doi chuoi -> ma hop le do `workspace/trips.ts` lam (`parseTripFilter`). Nho vay
 * mot ma trang thai moi cua mien khong bat tep nay phai sua theo.
 */
export interface TripFilterQuery {
  readonly search: string | null;
  readonly status: string | null;
  readonly kind: string | null;
}

export const EMPTY_TRIP_FILTER_QUERY: TripFilterQuery = {
  search: null,
  status: null,
  kind: null,
};

export const isTripFilterQueryEmpty = (filter: TripFilterQuery): boolean =>
  filter.search === null && filter.status === null && filter.kind === null;

/**
 * Mot dia chi da duoc GIAI QUYET: be mat nao, muc/man nao, dang chon gi.
 * Muc khong hop le luon roi ve mac dinh — mot dau trang cu khong bao gio ra trang trang.
 */
export interface ResolvedNavigation {
  readonly surface: TransportSurface;
  readonly section: TransportSectionId;
  readonly screen: DriverScreenId;
  readonly selection: string | null;
  /**
   * BO LOC CHUYEN — di CUNG lua chon, va bien mat cung no khi doi muc (#222 P2 §3).
   *
   * Mot ma trang thai chuyen khong co nghia gi o man Nhien lieu, y het mot ma chuyen. Nen hai thu
   * nay theo cung mot luat: giu khi con o trong muc, bo khi ra khoi.
   */
  readonly tripFilter: TripFilterQuery;
}

/**
 * Muc khong mo duoc roi ve MAC DINH — va neu chinh muc mac dinh cung khong mo duoc (`#395`: mot
 * `MANAGER` chi duoc cap nhom "Đội xe & lái xe" khong co `Tổng quan`), roi ve muc DAU TIEN nguoi do
 * mo duoc. Khong lam vay thi dia chi `/` cua ho la mot man hinh ho khong co quyen.
 */
export const resolveSection = (
  requested: string | null,
  input: NavigationInput,
): TransportSectionId => {
  if (requested !== null && canNavigateTo(requested, input)) {
    return requested as TransportSectionId;
  }
  if (canNavigateTo(DEFAULT_SECTION, input)) return DEFAULT_SECTION;
  return visibleSections(input)[0]?.id ?? DEFAULT_SECTION;
};

export const resolveDriverScreen = (
  requested: string | null,
  input: NavigationInput,
): DriverScreenId => {
  if (requested === null) return DEFAULT_DRIVER_SCREEN;
  const screen = findDriverScreen(requested);
  return screen !== undefined && isDriverScreenEnabled(screen, input)
    ? screen.id
    : DEFAULT_DRIVER_SCREEN;
};

const resolveSurface = (requested: string | null, input: NavigationInput): TransportSurface =>
  requested === 'driver' && visibleDriverScreens(input).length > 0 ? 'driver' : 'operations';

/**
 * MOT duong duy nhat de tra loi "dia chi nay nghia la gi". Ca lien ket trong ung dung lan dau trang
 * dan ve day, vi PR #111 cua b2b da chung minh dieu nguoc lai: khi bam trong ung dung di duong khac
 * voi khi mo tu dau trang, mot cau hoi co hai cau tra loi.
 *
 * Doi muc thi BO lua chon: mot ma chuyen khong con nghia gi o man Nhien lieu.
 */
export const resolveNavigation = (
  requested: {
    readonly surface: string | null;
    readonly section: string | null;
    readonly screen: string | null;
    readonly selection: string | null;
    readonly tripFilter?: TripFilterQuery;
  },
  previous: { readonly section: TransportSectionId; readonly screen: DriverScreenId } | null,
  input: NavigationInput,
): ResolvedNavigation => {
  const surface = resolveSurface(requested.surface, input);
  const section = resolveSection(requested.section, input);
  const screen = resolveDriverScreen(requested.screen, input);
  const movedSection = previous !== null && previous.section !== section;
  const movedScreen = previous !== null && previous.screen !== screen;
  const keepSelection = surface === 'driver' ? !movedScreen : !movedSection;
  /*
   * BO LOC CHUYEN CHI SONG O MUC `trips`, tren BE MAT VAN HANH — #222 P2 §3.
   *
   * Hai cong, khong mot: (a) doi muc thi bo, cung luat voi lua chon; (b) muc dang xem phai DUNG la
   * `trips`. Cong (b) la thu chan mot dia chi go tay kieu `?section=fuel&q=UAT-VIET-01` mang mot bo
   * loc chuyen di lac vao man Nhien lieu roi nam do cho toi khi nguoi dung quay lai muc Chuyen xe.
   */
  const tripFilter =
    keepSelection && surface === 'operations' && section === 'trips'
      ? (requested.tripFilter ?? EMPTY_TRIP_FILTER_QUERY)
      : EMPTY_TRIP_FILTER_QUERY;
  return {
    surface,
    section,
    screen,
    selection: keepSelection ? requested.selection : null,
    tripFilter,
  };
};

const readParam = (search: string, key: string): string | null => {
  const raw = new URLSearchParams(search).get(key);
  const trimmed = raw?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
};

export const parseNavigationFromSearch = (
  search: string,
  input: NavigationInput,
): ResolvedNavigation =>
  resolveNavigation(
    {
      surface: readParam(search, SURFACE_QUERY_PARAM),
      section: readParam(search, SECTION_QUERY_PARAM),
      screen: readParam(search, SCREEN_QUERY_PARAM),
      selection: readParam(search, SELECTION_QUERY_PARAM),
      tripFilter: {
        search: readParam(search, SEARCH_QUERY_PARAM),
        status: readParam(search, STATUS_QUERY_PARAM),
        kind: readParam(search, KIND_QUERY_PARAM),
      },
    },
    null,
    input,
  );

/**
 * Muc mac dinh KHONG mang tham so — `/` van la mot dia chi sach de danh dau.
 *
 * Bo loc CHI di kem khi co gia tri that: mot dia chi `?section=trips&q=&status=&kind=` dai them 24
 * ky tu de noi dung mot dieu — "khong loc gi" — ma mot dia chi khong co chung da noi roi.
 */
export const buildSectionUrl = (
  section: TransportSectionId,
  selection?: string | null,
  tripFilter?: TripFilterQuery,
): string => {
  const params = new URLSearchParams();
  if (section !== DEFAULT_SECTION) params.set(SECTION_QUERY_PARAM, section);
  if (selection) params.set(SELECTION_QUERY_PARAM, selection);
  if (tripFilter && !isTripFilterQueryEmpty(tripFilter)) {
    if (tripFilter.search) params.set(SEARCH_QUERY_PARAM, tripFilter.search);
    if (tripFilter.status) params.set(STATUS_QUERY_PARAM, tripFilter.status);
    if (tripFilter.kind) params.set(KIND_QUERY_PARAM, tripFilter.kind);
  }
  const query = params.toString();
  return query.length > 0 ? `/?${query}` : '/';
};

export const buildDriverUrl = (screen: DriverScreenId, selection?: string | null): string => {
  const params = new URLSearchParams();
  params.set(SURFACE_QUERY_PARAM, 'driver');
  if (screen !== DEFAULT_DRIVER_SCREEN) params.set(SCREEN_QUERY_PARAM, screen);
  if (selection) params.set(SELECTION_QUERY_PARAM, selection);
  return `/?${params.toString()}`;
};

export const buildNavigationUrl = (navigation: ResolvedNavigation): string =>
  navigation.surface === 'driver'
    ? buildDriverUrl(navigation.screen, navigation.selection)
    : buildSectionUrl(navigation.section, navigation.selection, navigation.tripFilter);

/**
 * Cau duoi thanh ben. Noi that ve gioi han cua tang cuong che hom nay thay vi de khach suy ra rang
 * man hinh la hang rao — `RolesGuard` mo hoan toan khi tenant khong chay che do phien dang nhap.
 */
export const NAVIGATION_ENFORCEMENT_NOTE =
  'Danh mục hiển thị theo nghiệp vụ doanh nghiệp đã bật và quyền của tài khoản. Quyền thực thi do ' +
  'máy chủ quyết định, không phải do màn hình ẩn bớt.';

/**
 * Tieu de cua loi phu duoi danh muc (#339). Noi bang chu cua NGUOI VAN HANH — "cach lam truoc
 * day" — chu khong bang chu cua kien truc (`legacy`, `TransportTrip`, `v1`).
 */
export const SUPERSEDED_HEADING = 'Cách làm trước đây';

/**
 * Cau chi duong duoi moi muc cu. Lay NHAN cua muc moi tu chinh danh muc, nen doi ten muc moi thi
 * cau nay doi theo — khong co ban chep tay nao de lech.
 */
export const supersededNote = (entry: SupersededEntry): string =>
  `Việc mới bắt đầu ở “${entry.successor.label}”.`;
