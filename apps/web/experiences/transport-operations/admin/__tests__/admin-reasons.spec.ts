import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AuthApiError } from '../../../../lib/auth';
import {
  ADMIN_REASON_MESSAGES,
  adminErrorMessage,
  openWorkOf,
  reasonMessage,
  violationMessage,
  violationsOf,
} from '../admin-reasons';

/**
 * MOI MA LY DO CUA API QUAN TRI DEU CO MOT CAU TIENG VIET (`#395`).
 *
 * Web khong import duoc `apps/api`, nen bai nay DOC tep nguon cua API tu dia (cung khuon bai drift
 * `transport-actions.spec.ts`) va lay tung ma trong cac mang tu vung. Mot ma moi phia API ma quen
 * cau phia web lam DO bai nay — thay vi lot ra man hinh cua Giam doc duoi dang `SOD_CONFLICT`.
 *
 * Moi tep deu BAT BUOC: ca bon lat cat da gop, nen mot tep/mang doi ten ma bai nay im lang bo qua
 * la mot lo hong — khong con muc "tuy chon".
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const API = resolve(HERE, '../../../../../api/src');

const literalsInArray = (source: string, name: string): readonly string[] | null => {
  const declaration = new RegExp(`\\b${name}\\b(?:\\s*:[^=\\n]*)?\\s*=\\s*\\[`);
  const found = declaration.exec(source);
  if (found === null) return null;
  const start = found.index + found[0].length;
  const end = source.indexOf('\n]', start);
  if (end < 0) return null;
  const body = source
    .slice(start, end)
    // Bo chu thich — ten ma trong chu thich khong phai mot ma.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  return [...body.matchAll(/'([A-Z][A-Z0-9_]+)'/g)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
};

const REQUIRED: readonly (readonly [string, string])[] = [
  ['auth/account-decisions.ts', 'ACCOUNT_ACCESS_REASONS'],
  ['auth/account-errors.ts', 'NON_DECISION_REASONS'],
  ['auth/access/account-access.ts', 'PLATFORM_ACCESS_VIOLATIONS'],
  ['transport/places/place-admin-decisions.ts', 'PLACE_WRITE_REASONS'],
  ['transport/permissions/transport-permission-rules.ts', 'TRANSPORT_GRANT_VIOLATION_CODES'],
  ['transport/fleet/account-link-decisions.ts', 'ACCOUNT_LINK_REASONS'],
  ['transport/permissions/transport-access-errors.ts', 'TRANSPORT_ACCESS_ERROR_REASONS'],
  ['transport/places/place-errors.ts', 'TRANSPORT_PLACE_ERROR_REASONS'],
  ['transport/places/place-errors.ts', 'PLACE_ADMIN_ERROR_REASONS'],
];

/**
 * Ma ma cac duong ghi cua "Địa điểm vận hành" nem ra ngoai cac mang tren (vd trung ten trong CUNG
 * mot phap nhan, tu `counterparty-errors.ts`) — man hinh gap chung that, nen cung phai co cau.
 */
const PLACE_WRITE_EXTRA_CODES = [
  'COUNTERPARTY_SITE_NAME_TAKEN',
  'PLACE_OWNER_INACTIVE',
  'PLACE_OWNER_REQUIRED',
  'PLACE_SITE_ALREADY_FENCED',
] as const;

describe('bang cau cho moi ly do cua API quan tri', () => {
  it.each(REQUIRED)('%s › %s: tep ton tai, va MOI ma co cau', (file, array) => {
    const source = readFileSync(resolve(API, file), 'utf8');
    const codes = literalsInArray(source, array);
    expect(codes, `${array} trong ${file}`).not.toBeNull();
    expect(codes?.length).toBeGreaterThan(0);
    const missing = (codes ?? []).filter((code) => ADMIN_REASON_MESSAGES[code] === undefined);
    expect(missing).toEqual([]);
  });

  it('ma ngoai tu vung ma duong ghi dia diem nem ra cung co cau', () => {
    const missing = PLACE_WRITE_EXTRA_CODES.filter(
      (code) => ADMIN_REASON_MESSAGES[code] === undefined,
    );
    expect(missing).toEqual([]);
  });

  it('bai doc tu vung khong xanh gia: rut dung ma tu mot mang mau', () => {
    const sample =
      "export const X = [\n  /** 'NOT_A_CODE' */\n  'ALPHA_ONE',\n  'BETA',\n] as const;";
    expect(literalsInArray(sample, 'X')).toEqual(['ALPHA_ONE', 'BETA']);
  });

  it('moi cau deu la tieng Viet co dau, khong lo ma liet ke', () => {
    for (const code of Object.keys(ADMIN_REASON_MESSAGES)) {
      const message = reasonMessage(code, {}) ?? '';
      expect(message.length, code).toBeGreaterThan(10);
      expect(message, code).not.toMatch(/\b[A-Z]+_[A-Z_]+\b/);
      expect(message, code).toMatch(
        /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i,
      );
    }
  });
});

describe('cau khong co ten trong `detail` van la tieng Viet tron cau', () => {
  it('Giam doc cuoi cung: co ten thi goi ten, khong thi "Đây là"', () => {
    expect(reasonMessage('LAST_ACTIVE_ADMIN', {})).toBe(
      'Đây là Giám đốc đang hoạt động cuối cùng — thêm hoặc mở khoá một Giám đốc khác trước khi khoá hay đổi vai tài khoản này.',
    );
    expect(reasonMessage('LAST_ACTIVE_ADMIN', { name: 'Nguyễn Văn An' })).toMatch(
      /^Nguyễn Văn An là Giám đốc đang hoạt động cuối cùng — /,
    );
  });

  it('trung ten trong cung don vi: goi ten don vi va dia diem khi co', () => {
    expect(
      reasonMessage('COUNTERPARTY_SITE_NAME_TAKEN', {
        counterpartyName: 'Công ty Y',
        siteName: 'Kho Hải Phòng',
      }),
    ).toBe(
      'Công ty Y đã có địa điểm “Kho Hải Phòng” — chọn địa điểm đó để gắn vị trí, hoặc đặt tên khác.',
    );
    expect(reasonMessage('COUNTERPARTY_SITE_NAME_TAKEN', {})).toMatch(/^Đơn vị này đã có/);
  });

  it('thieu quyen doi tac: noi DUNG o nao doi quyen khi may chu ke ra', () => {
    expect(
      reasonMessage('PLACE_SITE_REQUIRES_COUNTERPARTY_MANAGE', { fields: ['name', 'address'] }),
    ).toBe(
      'Đổi tên và địa chỉ của địa điểm thuộc đơn vị khác cần thêm quyền quản lý khách hàng, đối tác. Nhờ Giám đốc cấp quyền.',
    );
    expect(
      reasonMessage('PLACE_SITE_REQUIRES_COUNTERPARTY_MANAGE', { fields: ['address'] }),
    ).toMatch(/^Đổi địa chỉ của địa điểm/);
    expect(reasonMessage('PLACE_SITE_REQUIRES_COUNTERPARTY_MANAGE', {})).toMatch(
      /^Thêm, đổi tên, đổi địa chỉ, tắt hay bật lại/,
    );
  });
});

describe('xac nhan leo thang: doc CA `detail.actions` lan `detail.violations[].detail.actions`', () => {
  const labels: Record<string, string> = {
    'transport.checkpoint.record': 'Ghi bù mốc hiện trường từ văn phòng',
    'transport.costing.expense.post': 'Ghi sổ khoản chi',
  };
  const labelOf = (code: string) => labels[code];
  const expected =
    'Cần xác nhận trước khi cấp quyền nhạy cảm: “Ghi bù mốc hiện trường từ văn phòng”, “Ghi sổ khoản chi”.';

  it('than loi cap cao nhat mang `actions` ngay tren `detail`', () => {
    const error = new AuthApiError('x', 409, 'ESCALATION_CONFIRMATION_REQUIRED', {
      actions: ['transport.checkpoint.record', 'transport.costing.expense.post'],
    });
    expect(adminErrorMessage(error, labelOf)).toBe(expected);
  });

  it('than loi cap cao nhat chi mang `violations` (hinh dang cua lan ghi tai khoan)', () => {
    const error = new AuthApiError('x', 409, 'ESCALATION_CONFIRMATION_REQUIRED', {
      violations: [
        {
          code: 'ESCALATION_CONFIRMATION_REQUIRED',
          detail: { actions: ['transport.checkpoint.record'] },
        },
        {
          code: 'ESCALATION_CONFIRMATION_REQUIRED',
          detail: { actions: ['transport.costing.expense.post', 'transport.checkpoint.record'] },
        },
      ],
    });
    expect(adminErrorMessage(error, labelOf)).toBe(expected);
  });

  it('dua len Giam doc: noi ro vai, khong roi ve cau chung', () => {
    const error = new AuthApiError('x', 409, 'ESCALATION_CONFIRMATION_REQUIRED', {
      violations: [{ code: 'ESCALATION_CONFIRMATION_REQUIRED', detail: { role: 'ADMIN' } }],
    });
    expect(adminErrorMessage(error)).toBe(
      'Đưa tài khoản lên vai Giám đốc (toàn quyền) cần xác nhận rõ ràng trước khi lưu.',
    );
    expect(reasonMessage('ESCALATION_CONFIRMATION_REQUIRED', {})).toBe(
      'Cấp vai hoặc quyền nhạy cảm cần xác nhận rõ ràng trước khi lưu.',
    );
  });

  it('mot DONG vi pham leo thang dung cung cau', () => {
    expect(
      violationMessage(
        {
          code: 'ESCALATION_CONFIRMATION_REQUIRED',
          detail: { actions: ['transport.checkpoint.record'] },
        },
        labelOf,
      ),
    ).toBe('Cần xác nhận trước khi cấp quyền nhạy cảm: “Ghi bù mốc hiện trường từ văn phòng”.');
  });
});

describe('cau goi TEN thu dang xung dot, lay tu `detail`', () => {
  it('trung ten dia diem: noi ten, loai va chu cua dia diem kia', () => {
    expect(
      reasonMessage('PLACE_NAME_TAKEN', {
        conflictName: 'Kho Hải Phòng',
        conflictKindLabel: 'Nhà máy / kho đối tác',
        ownerName: 'Công ty Y',
      }),
    ).toBe(
      'Tên này đã dùng cho nhà máy / kho đối tác “Kho Hải Phòng” của Công ty Y. Đặt tên khác để lái xe và điều hành không nhầm hai nơi.',
    );
  });

  it('xung dot tach nhiem: noi ten HAI quyen bang nhan cua danh muc', () => {
    const labels: Record<string, string> = {
      'transport.commercial_acceptance.decide': 'Duyệt nghiệm thu chứng từ',
      'transport.checkpoint.record': 'Ghi bù mốc hiện trường từ văn phòng',
    };
    const message = violationMessage(
      {
        code: 'SOD_CONFLICT',
        permission: 'transport.checkpoint.record',
        detail: {
          decision: 'transport.commercial_acceptance.decide',
          evidence: 'transport.checkpoint.record',
        },
      },
      (code) => labels[code],
    );
    expect(message).toContain('“Duyệt nghiệm thu chứng từ”');
    expect(message).toContain('“Ghi bù mốc hiện trường từ văn phòng”');
    expect(message).not.toContain('transport.');
  });

  it('ACCESS_INVALID: mot cau dau + tung dong vi pham', () => {
    const error = new AuthApiError('Bo quyen khong hop le', 409, 'ACCESS_INVALID', {
      violations: [
        { code: 'DIRECTOR_ONLY_ACTION', permission: 'transport.costing.period.reopen' },
        { code: 'nonsense' },
      ],
    });
    expect(violationsOf(error)).toHaveLength(2);
    const message = adminErrorMessage(error, (code) =>
      code === 'transport.costing.period.reopen' ? 'Mở lại kỳ kế toán đã đóng' : undefined,
    );
    expect(message.split('\n')).toEqual([
      'Bộ quyền chưa hợp lệ — xem các dòng cần sửa bên dưới.',
      '• “Mở lại kỳ kế toán đã đóng” chỉ Giám đốc làm được — không cấp cho vai khác.',
      '• Một quyền đã chọn chưa hợp lệ cho vai này.',
    ]);
  });

  it('viec dang mo cua bai xe: tach dung danh sach vong xe va don', () => {
    const error = new AuthApiError('x', 409, 'DEPOT_CHANGE_AFFECTS_OPEN_WORK', {
      runs: [{ id: 'r1', code: 'VX-01' }, { bad: true }],
      orders: [{ id: 'o1' }],
      idleHours: 12,
    });
    expect(openWorkOf(error)).toEqual({
      runs: [{ id: 'r1', code: 'VX-01' }],
      orders: [{ id: 'o1' }],
      idleHours: 12,
    });
    expect(adminErrorMessage(error)).toBe(
      'Còn 1 vòng xe và 1 đơn đang dùng bãi xe này. Xem danh sách và xác nhận trước khi đổi.',
    );
    expect(openWorkOf(new AuthApiError('x', 409, 'PLACE_NAME_TAKEN'))).toBeNull();
  });

  it('loi khong co ly do giu NGUYEN cau cua may chu khi no la tieng Viet co dau', () => {
    expect(adminErrorMessage(new AuthApiError('Máy chủ bận', 503))).toBe('Máy chủ bận');
    expect(adminErrorMessage(new Error('Còn thiếu thông tin.'))).toBe('Còn thiếu thông tin.');
    expect(adminErrorMessage(null)).toBe('Không thực hiện được yêu cầu. Hãy thử lại.');
  });

  it('bai du phong "Bật lại" khi bai khac dang bat: goi TEN bai chinh, chi dung duong', () => {
    const error = new AuthApiError(
      '"Bãi xe Hà Nội" đang là bãi chính.',
      409,
      'DEPOT_ALREADY_ACTIVE',
      {
        activeDepot: { id: 'gf-1', code: 'DEPOT-HN', name: 'Bãi xe Hà Nội' },
      },
    );
    const message = adminErrorMessage(error);
    expect(message).toBe(
      '“Bãi xe Hà Nội” đang là bãi chính — mỗi lúc chỉ bật một bãi. Dùng “Đặt làm bãi chính” để chuyển sang bãi này.',
    );
    // Lan bat lai KHONG luu gi — cau khong duoc noi "bai moi da duoc luu".
    expect(message).not.toMatch(/được lưu/);
    expect(reasonMessage('DEPOT_ALREADY_ACTIVE', {})).toMatch(/^Một bãi xe khác đang là bãi chính/);
  });

  it('hop tai khoan voi ho so ben gop von da mat: cau tieng Viet, khong lo ma', () => {
    expect(adminErrorMessage(new AuthApiError('x', 404, 'ASSET_STAKEHOLDER_NOT_FOUND'))).toBe(
      'Không tìm thấy hồ sơ bên góp vốn đã chọn — tải lại danh sách rồi chọn lại.',
    );
  });
});

describe('may chu cu / duong nem khong kem `detail`: cau co dau cua may chu goi ten tot hon cau chung', () => {
  it('trung ten trong cung don vi, `detail` rong → cau cua may chu', () => {
    const error = new AuthApiError(
      '"Công ty Y" đã có một địa điểm khác tên "Kho Hải Phòng".',
      409,
      'COUNTERPARTY_SITE_NAME_TAKEN',
    );
    expect(adminErrorMessage(error)).toBe(
      '"Công ty Y" đã có một địa điểm khác tên "Kho Hải Phòng".',
    );
  });

  it('chu da ngung hoat dong, `detail` rong → cau cua may chu; co ten → cau cua bang', () => {
    const bare = new AuthApiError(
      '"Công ty X" đã ngừng hoạt động — bật lại đơn vị hoặc khách hàng này trước.',
      409,
      'PLACE_OWNER_INACTIVE',
    );
    expect(adminErrorMessage(bare)).toMatch(/^"Công ty X" đã ngừng hoạt động/);
    const named = new AuthApiError('x', 409, 'PLACE_OWNER_INACTIVE', { ownerName: 'Công ty X' });
    expect(adminErrorMessage(named)).toMatch(/^“Công ty X” đã ngừng hoạt động — bật lại/);
  });

  it('cau may chu KHONG co dau (loi cu) thi van dung cau cua bang', () => {
    const error = new AuthApiError('Site name taken', 409, 'COUNTERPARTY_SITE_NAME_TAKEN');
    expect(adminErrorMessage(error)).toMatch(/^Đơn vị này đã có một địa điểm khác cùng tên/);
  });
});

describe('loi KHONG co ly do co kieu: khong mot cau ky thuat tieng Anh nao len man hinh', () => {
  it('429 cua ThrottlerGuard → cau "thao tác quá nhanh"', () => {
    const error = new AuthApiError('ThrottlerException: Too Many Requests', 429);
    expect(adminErrorMessage(error)).toBe(
      'Bạn thao tác quá nhanh — chờ khoảng một phút rồi thử lại.',
    );
  });

  it('400 cua zod khong ly do → cau "thông tin chưa hợp lệ"', () => {
    const error = new AuthApiError(
      'reason: Too big: expected string to have <=500 characters',
      400,
    );
    expect(adminErrorMessage(error)).toBe(
      'Thông tin gửi lên chưa hợp lệ — kiểm tra lại các ô vừa nhập.',
    );
  });

  it('mat mang (`fetch` nem TypeError) → cau "không kết nối được"', () => {
    expect(adminErrorMessage(new TypeError('Failed to fetch'))).toBe(
      'Không kết nối được máy chủ — kiểm tra mạng rồi thử lại.',
    );
  });

  it('403 va 5xx tieng Anh → cau theo ma trang thai; ma la khong co trong bang cung vay', () => {
    expect(adminErrorMessage(new AuthApiError('Forbidden resource', 403))).toBe(
      'Bạn không có quyền thực hiện thao tác này.',
    );
    expect(adminErrorMessage(new AuthApiError('Internal server error', 500))).toBe(
      'Máy chủ đang gặp sự cố — thử lại sau ít phút.',
    );
    expect(adminErrorMessage(new AuthApiError('Too Many Requests', 429, 'SOME_NEW_CODE'))).toBe(
      'Bạn thao tác quá nhanh — chờ khoảng một phút rồi thử lại.',
    );
  });
});
