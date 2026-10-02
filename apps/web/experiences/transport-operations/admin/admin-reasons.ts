import type { AccessViolation, OpenWorkDetail } from './admin-types';

/**
 * LY DO CO KIEU → CAU TIENG VIET CO DAU (`#395`).
 *
 * May chu tra `reason` + `detail` co cau truc; man hinh doi ra mot cau NGHIEP VU, goi TEN thu dang
 * xung dot (tai khoan, dia diem, don vi, quyen) tu `detail`. Khong mot ma liet ke nao duoc lot ra
 * man hinh: bai `admin-reasons.spec.ts` doc bo tu vung cua API tu dia va do rang MOI ma deu co cau.
 *
 * Ma khong co trong bang (loi cu, loi zod, loi ha tang) thi giu cau cua may chu NEU no la tieng
 * Viet co dau; cau ky thuat tieng Anh (gioi han toc do, zod, mat mang) doi thanh cau theo ma trang
 * thai — xem `statusMessage`.
 */

type Detail = Readonly<Record<string, unknown>>;
/** Tra nhan tieng Viet cua mot ma quyen — tu danh muc; `undefined` thi dung ma lam duong lui. */
export type PermissionLabelOf = (code: string) => string | undefined;

type Template = string | ((detail: Detail, labelOf: PermissionLabelOf) => string);

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

/** Dem cac muc CO `id` — mot muc hong trong `detail` khong duoc lam sai con so tren man hinh. */
const count = (value: unknown): number =>
  Array.isArray(value)
    ? value.filter(
        (item) =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as { id?: unknown }).id === 'string',
      ).length
    : 0;

const quoted = (value: string): string => `“${value}”`;

const labelOrCode = (labelOf: PermissionLabelOf, code: unknown): string => {
  const raw = text(code);
  if (raw === null) return 'quyền này';
  return quoted(labelOf(raw) ?? raw);
};

const labelList = (labelOf: PermissionLabelOf, codes: unknown): string =>
  Array.isArray(codes) && codes.length > 0
    ? codes.map((code) => labelOrCode(labelOf, code)).join(', ')
    : 'các quyền nhạy cảm đã chọn';

const asDetail = (value: unknown): Detail | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Detail) : null;

const stringsOf = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];

/**
 * Cac dong cua `ESCALATION_CONFIRMATION_REQUIRED`: may chu co the dat `actions` / `role` NGAY tren
 * `detail` (mot dong vi pham), hoac long trong `detail.violations[].detail` (loi cap cao nhat cua
 * lan ghi tai khoan). Doc CA HAI — cau khong duoc roi ve cau chung chi vi hinh dang than loi.
 */
function escalationFacts(detail: Detail): {
  readonly actions: readonly string[];
  readonly promotesToAdmin: boolean;
} {
  const nested = Array.isArray(detail.violations)
    ? detail.violations.flatMap((item) => {
        const inner = asDetail(asDetail(item)?.detail);
        return inner === null ? [] : [inner];
      })
    : [];
  const sources = [detail, ...nested];
  return {
    actions: [...new Set(sources.flatMap((source) => stringsOf(source.actions)))],
    promotesToAdmin: sources.some((source) => source.role === 'ADMIN'),
  };
}

const escalationMessage = (detail: Detail, labelOf: PermissionLabelOf): string => {
  const facts = escalationFacts(detail);
  if (facts.actions.length > 0) {
    return `Cần xác nhận trước khi cấp quyền nhạy cảm: ${labelList(labelOf, facts.actions)}.`;
  }
  return facts.promotesToAdmin
    ? 'Đưa tài khoản lên vai Giám đốc (toàn quyền) cần xác nhận rõ ràng trước khi lưu.'
    : 'Cấp vai hoặc quyền nhạy cảm cần xác nhận rõ ràng trước khi lưu.';
};

/* ------------------------------------------------------------------ *
 * Tai khoan va dang nhap — `apps/api/src/auth/account-decisions.ts` (+ loi dau vao, mat khau tam)
 * ------------------------------------------------------------------ */

const ACCOUNT_MESSAGES: Readonly<Record<string, Template>> = {
  ACCOUNT_CHANGE_ALLOWED: 'Đã lưu thay đổi tài khoản.',
  SELF_LOCKOUT:
    'Bạn không thể tự khoá, tự đổi quyền hay tự đặt lại mật khẩu của chính mình ở đây. Muốn đổi mật khẩu, hãy dùng menu tài khoản.',
  LAST_ACTIVE_ADMIN: (detail) => {
    const who = text(detail.name) ?? text(detail.username) ?? 'Đây';
    return `${who} là Giám đốc đang hoạt động cuối cùng — thêm hoặc mở khoá một Giám đốc khác trước khi khoá hay đổi vai tài khoản này.`;
  },
  PROTECTED_SERVICE_ACCOUNT:
    'Tài khoản hệ thống — không sửa được ở đây. Tài khoản này do bộ phận triển khai quản lý.',
  USERNAME_RESERVED: (detail) => {
    const name = text(detail.username);
    return `Tên đăng nhập ${name === null ? 'này' : quoted(name)} dành riêng cho hệ thống — hãy chọn tên khác.`;
  },
  ACCOUNT_LINKED_TO_DRIVER: (detail) => {
    const driver = text(detail.driverName) ?? text(detail.name);
    return `Tài khoản đang nối với hồ sơ lái xe${driver === null ? '' : ` ${driver}`} — gỡ nối ở phần “Hồ sơ đã nối” trước khi đổi vai.`;
  },
  ACCESS_INVALID: 'Bộ quyền chưa hợp lệ — xem các dòng cần sửa bên dưới.',
  ESCALATION_CONFIRMATION_REQUIRED: escalationMessage,
  ACCOUNT_NOT_FOUND: 'Không tìm thấy tài khoản này nữa — tải lại danh sách.',
  ACCOUNT_IDENTITY_TAKEN: (detail) => {
    const field = text(detail.field);
    const what =
      field === 'email'
        ? 'Email'
        : field === 'phone'
          ? 'Số điện thoại'
          : field === 'username'
            ? 'Tên đăng nhập'
            : 'Tên đăng nhập, email hoặc số điện thoại';
    const owner = text(detail.ownerName) ?? text(detail.username);
    return `${what} này đã thuộc ${owner === null ? 'một tài khoản khác' : `tài khoản ${owner}`}.`;
  },
  ACCOUNT_INPUT_INVALID: 'Thông tin chưa đúng dạng — kiểm tra lại các ô vừa nhập.',
  TEMPORARY_PASSWORD_EXPIRED: 'Mật khẩu tạm đã hết hạn. Nhờ Giám đốc cấp mật khẩu mới.',
  PASSWORD_CHANGE_REQUIRED: 'Bạn cần đổi mật khẩu tạm trước khi làm việc.',
};

/* ------------------------------------------------------------------ *
 * Tung dong quyen rieng — `TRANSPORT_GRANT_VIOLATION_CODES`
 * ------------------------------------------------------------------ */

const VIOLATION_MESSAGES: Readonly<Record<string, Template>> = {
  ADMIN_PRESET_IS_FULL:
    'Giám đốc đã có toàn quyền vận hành — không thêm hay bớt quyền riêng cho vai này được.',
  DRIVER_PRESET_IS_SELF_SCOPE_ONLY:
    'Lái xe chỉ làm việc của chính mình qua hồ sơ lái xe — không cấp thêm quyền riêng cho vai này.',
  UNKNOWN_PERMISSION: (detail, labelOf) =>
    `${labelOrCode(labelOf, detail.permission)} không còn trong danh mục quyền — tải lại trang rồi chọn lại.`,
  SCOPE_ACTION_NOT_GRANTABLE: (detail, labelOf) =>
    `${labelOrCode(labelOf, detail.permission)} chỉ có được khi nối hồ sơ (lái xe, bên góp vốn) — không cấp bằng ô đánh dấu.`,
  DIRECTOR_ONLY_ACTION: (detail, labelOf) =>
    `${labelOrCode(labelOf, detail.permission)} chỉ Giám đốc làm được — không cấp cho vai khác.`,
  GRANT_REDUNDANT: (detail, labelOf) =>
    detail.effect === 'DENY'
      ? `${labelOrCode(labelOf, detail.permission)} vốn không có trong vai khởi điểm — không cần bớt.`
      : `${labelOrCode(labelOf, detail.permission)} đã có sẵn theo vai khởi điểm — không cần cấp thêm.`,
  GRANT_DUPLICATED: (detail, labelOf) =>
    `${labelOrCode(labelOf, detail.permission)} bị chọn hai lần.`,
  PLATFORM_PERMISSION_NOT_GRANTABLE: (detail, labelOf) =>
    `${labelOrCode(labelOf, detail.permission)} không cấp riêng được — muốn quản trị tài khoản thì đổi vai sang Giám đốc.`,
  SOD_CONFLICT: (detail, labelOf) =>
    `Một người không được vừa ${labelOrCode(labelOf, detail.decision)} vừa ${labelOrCode(labelOf, detail.evidence)} — người duyệt tiền không được sửa căn cứ của chính khoản tiền đó. Bỏ một trong hai.`,
  ESCALATION_CONFIRMATION_REQUIRED: escalationMessage,
};

/* ------------------------------------------------------------------ *
 * Noi tai khoan voi ho so — `transport/fleet/account-link-decisions.ts`
 * ------------------------------------------------------------------ */

const LINK_MESSAGES: Readonly<Record<string, Template>> = {
  ACCOUNT_LINKED: 'Đã nối tài khoản với hồ sơ.',
  ACCOUNT_UNLINKED: 'Đã gỡ tài khoản khỏi hồ sơ.',
  ACCOUNT_LINK_UNCHANGED: 'Liên kết không đổi — hồ sơ đã nối đúng tài khoản này.',
  ACCOUNT_LINK_USER_NOT_FOUND: 'Không tìm thấy tài khoản cần nối — tải lại danh sách.',
  ACCOUNT_LINK_USER_DISABLED: 'Tài khoản đang bị khoá — mở khoá trước rồi nối hồ sơ.',
  ACCOUNT_LINK_ROLE_MISMATCH:
    'Hồ sơ lái xe chỉ nối được với tài khoản vai Lái xe. Đổi vai tài khoản trước, hoặc chọn tài khoản khác.',
  DRIVER_ACCOUNT_TAKEN: (detail) => {
    const other = text(detail.driverName) ?? text(detail.name);
    return `Tài khoản này đã nối với ${other === null ? 'một hồ sơ lái xe khác' : `hồ sơ lái xe ${other}`} — gỡ nối cũ trước.`;
  },
  ACCOUNT_LINK_DRIVER_INACTIVE:
    'Hồ sơ lái xe đã ngừng hoạt động — mở lại hồ sơ ở Đội xe & lái xe trước.',
  ASSET_STAKEHOLDER_ACCOUNT_TAKEN: (detail) => {
    const other = text(detail.stakeholderName) ?? text(detail.name);
    return `Tài khoản này đã nối với ${other === null ? 'một hồ sơ bên góp vốn khác' : `hồ sơ bên góp vốn ${other}`} — gỡ nối cũ trước.`;
  },
  // `asset-ownership` — noi mot tai khoan voi ho so ben gop von da bi xoa/khong con.
  ASSET_STAKEHOLDER_NOT_FOUND:
    'Không tìm thấy hồ sơ bên góp vốn đã chọn — tải lại danh sách rồi chọn lại.',
  ACTION_NOT_PERMITTED: 'Bạn không có quyền thực hiện thao tác này.',
};

/* ------------------------------------------------------------------ *
 * Dia diem van hanh — `transport/places/place-admin-decisions.ts` + `place-errors.ts`
 * ------------------------------------------------------------------ */

const openWorkSentence = (detail: Detail): string => {
  const runs = count(detail.runs);
  const orders = count(detail.orders);
  const parts = [runs > 0 ? `${runs} vòng xe` : null, orders > 0 ? `${orders} đơn` : null].filter(
    (part): part is string => part !== null,
  );
  return parts.length === 0 ? 'việc đang mở' : parts.join(' và ');
};

const PLACE_MESSAGES: Readonly<Record<string, Template>> = {
  PLACE_WRITE_ALLOWED: 'Đã lưu địa điểm.',
  PLACE_WRITE_OPEN_WORK_ACKNOWLEDGED: 'Đã lưu — danh sách việc đang mở đã được ghi vào lịch sử.',
  PLACE_NAME_TAKEN: (detail) => {
    const name = text(detail.conflictName);
    const kind = text(detail.conflictKindLabel);
    const owner = text(detail.ownerName);
    if (name === null)
      return 'Tên này đã dùng cho một địa điểm đang hoạt động khác — đặt tên khác.';
    return `Tên này đã dùng cho ${kind === null ? 'địa điểm' : kind.toLowerCase()} ${quoted(name)}${owner === null ? '' : ` của ${owner}`}. Đặt tên khác để lái xe và điều hành không nhầm hai nơi.`;
  },
  /*
   * Duong gap THAT la "Bật lại" mot bai du phong khi bai khac dang la bai chinh (`activate`); tao
   * bai moi khi da co bai chinh thi may chu luu no o dang du phong, khong tu choi. Cau KHONG noi
   * "bai moi da duoc luu" — lan bat lai khong luu gi.
   */
  DEPOT_ALREADY_ACTIVE: (detail) => {
    const active = text(asDetail(detail.activeDepot)?.name);
    return `${active === null ? 'Một bãi xe khác' : quoted(active)} đang là bãi chính — mỗi lúc chỉ bật một bãi. Dùng “Đặt làm bãi chính” để chuyển sang bãi này.`;
  },
  DEPOT_CODE_TAKEN: 'Mã bãi xe sinh từ tên này đã được dùng — đổi tên bãi rồi lưu lại.',
  PLACE_OUTSIDE_SERVICE_AREA:
    'Vị trí này nằm ngoài vùng phục vụ. Kiểm tra lại toạ độ (vĩ độ trước, kinh độ sau).',
  GEOFENCE_RADIUS_OUT_OF_RANGE: (detail) => {
    const min = typeof detail.min === 'number' ? detail.min : null;
    const max = typeof detail.max === 'number' ? detail.max : null;
    return min === null || max === null
      ? 'Bán kính nằm ngoài khoảng cho phép.'
      : `Bán kính phải trong khoảng ${min.toLocaleString('vi-VN')}–${max.toLocaleString('vi-VN')} m.`;
  },
  COUNTERPARTY_TAX_CODE_TAKEN: (detail) => {
    const owner = text(detail.counterpartyName) ?? text(detail.name);
    return `Mã số thuế này đã thuộc ${owner === null ? 'một đơn vị có sẵn' : owner} — chọn đơn vị đó trong danh sách thay vì thêm mới.`;
  },
  DEPOT_CHANGE_AFFECTS_OPEN_WORK: (detail) =>
    `Còn ${openWorkSentence(detail)} đang dùng bãi xe này. Xem danh sách và xác nhận trước khi đổi.`,
  PLACE_SITE_REQUIRES_COUNTERPARTY_MANAGE: (detail) => {
    // May chu noi o nao doi quyen (`detail.fields`: `name` / `address`) khi lan sua cham toi chung.
    const fields = stringsOf(detail.fields).flatMap((field) =>
      field === 'name' ? ['tên'] : field === 'address' ? ['địa chỉ'] : [],
    );
    return fields.length === 0
      ? 'Thêm, đổi tên, đổi địa chỉ, tắt hay bật lại địa điểm của đơn vị khác cần thêm quyền quản lý khách hàng, đối tác. Nhờ Giám đốc cấp quyền.'
      : `Đổi ${fields.join(' và ')} của địa điểm thuộc đơn vị khác cần thêm quyền quản lý khách hàng, đối tác. Nhờ Giám đốc cấp quyền.`;
  },
  COUNTERPARTY_SITE_NAME_TAKEN: (detail) => {
    const owner = text(detail.counterpartyName) ?? 'Đơn vị này';
    const site = text(detail.siteName);
    return site === null
      ? `${owner} đã có một địa điểm khác cùng tên — đặt tên khác, hoặc chọn địa điểm có sẵn đó để gắn vị trí.`
      : `${owner} đã có địa điểm ${quoted(site)} — chọn địa điểm đó để gắn vị trí, hoặc đặt tên khác.`;
  },
  COUNTERPARTY_SITE_MANAGED_AS_PLACE:
    'Điểm này đang được quản lý ở Địa điểm vận hành — sửa tên hay trạng thái ở đó.',
  PLACE_POINT_INVALID: 'Toạ độ không hợp lệ — chọn lại điểm trên bản đồ.',
  GEOFENCE_COORDINATE_REJECTED:
    'Toạ độ này không dùng được (ngoài phạm vi hoặc bằng 0) — chọn lại điểm trên bản đồ.',
  COUNTERPARTY_NOT_FOUND: 'Không tìm thấy đơn vị đã chọn làm chủ — tải lại danh sách rồi chọn lại.',
  CUSTOMER_NOT_FOUND: 'Không tìm thấy khách hàng đã chọn — tải lại danh sách rồi chọn lại.',
  COUNTERPARTY_SITE_NOT_FOUND:
    'Không tìm thấy địa điểm có sẵn đã chọn — tải lại danh sách rồi chọn lại.',
  PLACE_NOT_FOUND: 'Không tìm thấy địa điểm này nữa — tải lại danh sách.',
  PLACE_OWNER_REQUIRED:
    'Hãy cho biết địa điểm này của ai: một khách hàng, một đơn vị có sẵn, hay một đơn vị mới.',
  PLACE_OWNER_INVALID: 'Thông tin chủ của địa điểm chưa đúng — chọn lại “Địa điểm này của ai?”.',
  PLACE_OWNER_INACTIVE: (detail) => {
    const owner = text(detail.ownerName) ?? text(detail.counterpartyName) ?? text(detail.name);
    return `${owner === null ? 'Khách hàng hoặc đơn vị sở hữu địa điểm này' : quoted(owner)} đã ngừng hoạt động — bật lại khách hàng hoặc đơn vị đó trước khi thêm hay bật địa điểm của họ.`;
  },
  PLACE_SITE_ALREADY_FENCED:
    'Địa điểm có sẵn này đã có vị trí trên bản đồ — sửa ở chính địa điểm đó.',
  PLACE_SITE_OWNER_MISMATCH: 'Địa điểm có sẵn đã chọn không thuộc đơn vị này — chọn lại.',
  PLACE_NOT_A_DEPOT: 'Chỉ bãi xe mới đặt làm bãi chính được.',
};

/** Ma chi co o web: than loi khong phai JSON (route chua gan tren may chu). */
const CLIENT_MESSAGES: Readonly<Record<string, Template>> = {
  ROUTE_NOT_MOUNTED:
    'Máy chủ chưa có chức năng này — có thể đang cập nhật phiên bản. Thử lại sau ít phút.',
};

/** MOT bang cho ca khu quan tri — ma ly do la DUY NHAT tren moi bo tu vung phia API. */
export const ADMIN_REASON_MESSAGES: Readonly<Record<string, Template>> = {
  ...ACCOUNT_MESSAGES,
  ...VIOLATION_MESSAGES,
  ...LINK_MESSAGES,
  ...PLACE_MESSAGES,
  ...CLIENT_MESSAGES,
};

const noLabels: PermissionLabelOf = () => undefined;

const render = (template: Template, detail: Detail, labelOf: PermissionLabelOf): string =>
  typeof template === 'string' ? template : template(detail, labelOf);

/** Cau cho MOT ly do. `null` khi ma khong co trong bang — nguoi goi giu cau cua may chu. */
export function reasonMessage(
  reason: string,
  detail: Detail | null = null,
  labelOf: PermissionLabelOf = noLabels,
): string | null {
  const template = ADMIN_REASON_MESSAGES[reason];
  return template === undefined ? null : render(template, detail ?? {}, labelOf);
}

/** Cau cho MOT dong vi pham quyen. */
export function violationMessage(
  violation: AccessViolation,
  labelOf: PermissionLabelOf = noLabels,
): string {
  const detail: Detail = { ...(violation.detail ?? {}), permission: violation.permission };
  const template = VIOLATION_MESSAGES[violation.code];
  if (template !== undefined) return render(template, detail, labelOf);
  return text(violation.permission) === null
    ? 'Một quyền đã chọn chưa hợp lệ cho vai này.'
    : `Quyền ${labelOrCode(labelOf, violation.permission)} chưa hợp lệ cho vai này.`;
}

interface ApiErrorLike {
  readonly message?: unknown;
  readonly status?: unknown;
  readonly reason?: unknown;
  readonly detail?: unknown;
}

const asError = (error: unknown): ApiErrorLike =>
  typeof error === 'object' && error !== null ? (error as ApiErrorLike) : {};

const detailOf = (error: unknown): Detail | null => asDetail(asError(error).detail);

export const reasonOf = (error: unknown): string | null => {
  const reason = asError(error).reason;
  return typeof reason === 'string' && reason.length > 0 ? reason : null;
};

/** Cac dong vi pham cua `409 ACCESS_INVALID` — rong khi loi khong phai loai do. */
export function violationsOf(error: unknown): readonly AccessViolation[] {
  if (reasonOf(error) !== 'ACCESS_INVALID') return [];
  const raw = detailOf(error)?.violations;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is AccessViolation =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as { code?: unknown }).code === 'string',
  );
}

/** Danh sach viec dang mo cua `409 DEPOT_CHANGE_AFFECTS_OPEN_WORK` — `null` khi khong phai loi do. */
export function openWorkOf(error: unknown): OpenWorkDetail | null {
  if (reasonOf(error) !== 'DEPOT_CHANGE_AFFECTS_OPEN_WORK') return null;
  const detail = detailOf(error) ?? {};
  const list = (value: unknown) =>
    Array.isArray(value)
      ? value.filter(
          (item): item is { id: string; code?: string | null } =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as { id?: unknown }).id === 'string',
        )
      : [];
  return {
    runs: list(detail.runs),
    orders: list(detail.orders),
    idleHours: typeof detail.idleHours === 'number' ? detail.idleHours : null,
  };
}

/** Cau cua may chu la tieng Viet CO DAU — moi du de dua thang len man hinh cua Giam doc. */
const VIETNAMESE_LETTER = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

const vietnameseMessageOf = (error: unknown): string | null => {
  const raw = text(asError(error).message);
  return raw !== null && VIETNAMESE_LETTER.test(raw) ? raw : null;
};

/**
 * Ma ma cau cua bang CAN ten tu `detail`. May chu cu (hoac mot duong nem khong kem `detail`) chi goi
 * ten trong CAU cua no — khi do cau co dau cua may chu noi dung hon cau chung cua bang.
 */
const NAMED_BY_DETAIL: Readonly<Record<string, (detail: Detail) => boolean>> = {
  COUNTERPARTY_SITE_NAME_TAKEN: (detail) =>
    text(detail.siteName) !== null || text(detail.counterpartyName) !== null,
  PLACE_OWNER_INACTIVE: (detail) =>
    text(detail.ownerName) !== null ||
    text(detail.counterpartyName) !== null ||
    text(detail.name) !== null,
};

/*
 * Loi KHONG co ly do co kieu (gioi han toc do cua Nest, loi zod `400`, mat mang, `5xx`) mang cau
 * KY THUAT tieng Anh — "ThrottlerException: Too Many Requests", "reason: Too big: …", "Failed to
 * fetch". Khong mot cau nao nhu vay duoc len man hinh: noi theo MA TRANG THAI.
 */
const STATUS_MESSAGES = {
  THROTTLED: 'Bạn thao tác quá nhanh — chờ khoảng một phút rồi thử lại.',
  INVALID_INPUT: 'Thông tin gửi lên chưa hợp lệ — kiểm tra lại các ô vừa nhập.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  SERVER: 'Máy chủ đang gặp sự cố — thử lại sau ít phút.',
  OFFLINE: 'Không kết nối được máy chủ — kiểm tra mạng rồi thử lại.',
  GENERIC: 'Không thực hiện được yêu cầu. Hãy thử lại.',
} as const;

function statusMessage(error: unknown): string {
  const status = asError(error).status;
  if (status === 429) return STATUS_MESSAGES.THROTTLED;
  const vietnamese = vietnameseMessageOf(error);
  if (vietnamese !== null) return vietnamese;
  if (typeof status !== 'number') {
    // Khong co ma trang thai = yeu cau khong toi duoc may chu (`fetch` nem `TypeError`).
    return error instanceof Error ? STATUS_MESSAGES.OFFLINE : STATUS_MESSAGES.GENERIC;
  }
  if (status === 400 || status === 422) return STATUS_MESSAGES.INVALID_INPUT;
  if (status === 403) return STATUS_MESSAGES.FORBIDDEN;
  if (status >= 500) return STATUS_MESSAGES.SERVER;
  return STATUS_MESSAGES.GENERIC;
}

/**
 * MOT CAU cho mot loi bat ky cua khu quan tri: ly do co kieu → cau cua bang; `ACCESS_INVALID` →
 * cau dau + tung dong vi pham; khong co ly do → cau tieng Viet cua may chu, hoac cau theo ma trang
 * thai — KHONG BAO GIO la cau ky thuat tieng Anh.
 */
export function adminErrorMessage(error: unknown, labelOf: PermissionLabelOf = noLabels): string {
  const reason = reasonOf(error);
  if (reason !== null) {
    const violations = violationsOf(error);
    if (violations.length > 0) {
      return [
        reasonMessage('ACCESS_INVALID') ?? '',
        ...violations.map((violation) => `• ${violationMessage(violation, labelOf)}`),
      ].join('\n');
    }
    const detail = detailOf(error) ?? {};
    const isNamed = NAMED_BY_DETAIL[reason];
    const serverSentence = vietnameseMessageOf(error);
    if (isNamed !== undefined && !isNamed(detail) && serverSentence !== null) {
      return serverSentence;
    }
    const message = reasonMessage(reason, detail, labelOf);
    if (message !== null) return message;
  }
  return statusMessage(error);
}
