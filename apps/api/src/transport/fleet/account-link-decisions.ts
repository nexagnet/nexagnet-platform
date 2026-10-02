import { defineDecisionVocabulary } from '../../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH cua NOI TAI KHOAN (`#395`) — tai khoan dang nhap <-> ho so lai xe / ho so ben
 * gop von. Thuoc `transport-core`: ca hai lien ket la hang cua mien van tai
 * (`TransportDriver.authUserId`, `TransportAssetStakeholder.authUserId`), nen tang chi biet tai khoan.
 *
 * Hai diem, vi hai lien ket mo hai pham vi khac nhau va bi tu choi vi nhung ly do khac nhau:
 *
 *   · `driver.account_link`      — noi / go tai khoan voi ho so lai xe (pham vi "viec cua chinh
 *                                  lai xe"). Chi tai khoan vai Lai xe (`SALE`), dang hoat dong,
 *                                  chua noi ho so khac, va ho so lai xe dang hoat dong;
 *   · `stakeholder.account_link` — noi / go tai khoan voi ho so ben gop von (pham vi "xe minh co co
 *                                  phan"). Moi vai deu noi duoc, nhung tai khoan phai CO THAT va
 *                                  dang hoat dong.
 *
 * Moi ma o day VUA la ly do quyet dinh VUA la `reason` cua loi tra ra HTTP — man hinh doi ra mot cau
 * tieng Viet, nguoi truc loc trace theo cung ma. `detail` chi mang ma ho so / ma tai khoan / vai —
 * KHONG ten, KHONG so dien thoai.
 *
 * Ma ly do phai DUY NHAT tren moi bo tu vung: `defineDecisionVocabulary` ghi de nhan im lang.
 */
export const ACCOUNT_LINK_REASONS = [
  /** Da noi tai khoan voi ho so (moi noi, hoac doi sang tai khoan khac). */
  'ACCOUNT_LINKED',
  /** Da go tai khoan khoi ho so. */
  'ACCOUNT_UNLINKED',
  /** Yeu cau trung trang thai hien tai — khong ghi, khong dong dau vet. */
  'ACCOUNT_LINK_UNCHANGED',
  /** Ma tai khoan khong ton tai o nen tang. */
  'ACCOUNT_LINK_USER_NOT_FOUND',
  /** Tai khoan dang bi khoa — noi vao se mo mot pham vi cho mot nguoi khong dang nhap duoc. */
  'ACCOUNT_LINK_USER_DISABLED',
  /** Ho so lai xe chi nhan tai khoan vai Lai xe (`SALE`). */
  'ACCOUNT_LINK_ROLE_MISMATCH',
  /** Tai khoan da noi voi MOT ho so lai xe khac (ke ca khi DB chan bang unique). */
  'DRIVER_ACCOUNT_TAKEN',
  /** Ho so lai xe da ngung hoat dong — khong noi tai khoan moi vao. */
  'ACCOUNT_LINK_DRIVER_INACTIVE',
  /** Tai khoan da noi voi MOT ho so ben gop von khac. */
  'ASSET_STAKEHOLDER_ACCOUNT_TAKEN',
] as const;
export type AccountLinkReason = (typeof ACCOUNT_LINK_REASONS)[number];

/** Cac ma TU CHOI — tap con di ra HTTP qua `TransportDomainError`. */
export type AccountLinkErrorReason = Exclude<
  AccountLinkReason,
  'ACCOUNT_LINKED' | 'ACCOUNT_UNLINKED' | 'ACCOUNT_LINK_UNCHANGED'
>;

export const TRANSPORT_ACCOUNT_LINK_DECISIONS = defineDecisionVocabulary({
  owner: 'transport-core',
  points: ['driver.account_link', 'stakeholder.account_link'],
  labels: {
    ACCOUNT_LINKED: 'Đã nối tài khoản với hồ sơ',
    ACCOUNT_UNLINKED: 'Đã gỡ tài khoản khỏi hồ sơ',
    ACCOUNT_LINK_UNCHANGED: 'Liên kết tài khoản không đổi',
    ACCOUNT_LINK_USER_NOT_FOUND: 'Không tìm thấy tài khoản cần nối',
    ACCOUNT_LINK_USER_DISABLED: 'Tài khoản đang bị khoá — không nối được',
    ACCOUNT_LINK_ROLE_MISMATCH: 'Hồ sơ lái xe chỉ nối được với tài khoản vai Lái xe',
    DRIVER_ACCOUNT_TAKEN: 'Tài khoản đã nối với một hồ sơ lái xe khác',
    ACCOUNT_LINK_DRIVER_INACTIVE: 'Hồ sơ lái xe đã ngừng hoạt động',
    ASSET_STAKEHOLDER_ACCOUNT_TAKEN: 'Tài khoản đã nối với một hồ sơ bên góp vốn khác',
  } satisfies Record<AccountLinkReason, string>,
});
