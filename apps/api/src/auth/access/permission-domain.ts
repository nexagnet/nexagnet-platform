import type { UserRole } from '../auth.types.js';

/**
 * HOP DONG PHAN QUYEN giua NEN TANG va MOT MIEN nghiep vu (`#395`).
 *
 * ============================================================================================
 * AI SO HUU CAI GI
 * ============================================================================================
 *
 * NEN TANG (`auth/`) so huu: tai khoan, vai khoi diem (`User.role`), cac dong quyen rieng
 * (`UserPermissionGrant`), va CHO LUU chung. Nen tang KHONG biet mot ma quyen nghiep vu nao nghia
 * la gi — no khong duoc nhac ten mot mien.
 *
 * MIEN (vd van tai) so huu: tu vung ma quyen, bang vai khoi diem → ma quyen, quy tac ma nao cap
 * duoc / ma nao cam / cap nao xung dot tach nhiem, va nhan tieng Viet cho man hinh. Mien tu DANG KY
 * vao `PermissionDomainRegistry` — chieu phu thuoc bi dao, dung khuon `FileDomainAuthorizerRegistry`.
 *
 * ============================================================================================
 * QUY UOC MA QUYEN
 * ============================================================================================
 *
 * Moi ma quyen mang TIEN TO la `id` cua mien so huu no: `transport.vehicle.manage` thuoc mien
 * `transport`. Nen tang chia cac dong quyen rieng theo tien to truoc khi hoi mot mien (xem
 * `PermissionDomainRegistry.owning`), nen `validate`/`effective`/`escalated` cua mot mien chi nhan
 * cac dong cua chinh no. Mot dong khong mien nao nhan la `UNKNOWN_PERMISSION` o tang nen tang.
 * Tien to `platform.` thuoc rieng nen tang (`platform-permissions.ts`).
 */

export const PERMISSION_EFFECTS = ['ALLOW', 'DENY'] as const;
export type PermissionEffect = (typeof PERMISSION_EFFECTS)[number];

/** Mot dong quyen rieng: THEM (`ALLOW`) mot quyen ngoai vai khoi diem, hoac BOT (`DENY`) mot quyen. */
export interface PermissionGrant {
  readonly permission: string;
  readonly effect: PermissionEffect;
}

/**
 * Nguoi duoc hoi quyen.
 *
 * `permissionGrants` TUY CHON va THIEU = `[]`: moi `authUser` dung truoc `#395` (va moi fixture spec
 * cu) khong co truong nay, va chung phai duoc tra loi DUNG NHU HOM NAY — khong phai mot `TypeError`
 * bien thanh 500.
 */
export interface AccessSubject {
  readonly role: UserRole;
  readonly permissionGrants?: readonly PermissionGrant[] | null;
}

/** Cac dong quyen rieng cua mot nguoi — thieu hoac `null` deu la "khong co dong nao". */
export function grantsOf(subject: AccessSubject): readonly PermissionGrant[] {
  return subject.permissionGrants ?? [];
}

/**
 * Mot ly do TU CHOI mot thay doi quyen. `code` la ma CO KIEU cua mien (man hinh doi ra cau tieng
 * Viet); `permission` la ma quyen gay ra no neu co; `detail` chi mang ma quyen va con so — KHONG
 * mang du lieu ca nhan.
 */
export interface AccessViolation {
  readonly code: string;
  readonly permission?: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

/**
 * Mot PHAM VI den tu DU LIEU chu khong tu quyen — vd "tai khoan nay noi voi ho so lai xe X".
 *
 * Pham vi lai xe / ben huu quan khong cap duoc bang mot dong quyen: no la mot LIEN KET. Man hinh
 * "Nguoi nay lam duoc gi?" van phai noi ra no, nen mien mo ta no bang dang nay.
 */
export interface AccessScopeNote {
  /** Ma on dinh cua pham vi, vd `transport.driver_profile`. */
  readonly id: string;
  /** Ten pham vi cho nguoi doc, vd "Hồ sơ lái xe". */
  readonly label: string;
  /** Lien ket co dang hieu luc khong. */
  readonly active: boolean;
  /** Mot cau tieng Viet tra loi "pham vi nay cho nguoi do lam gi" o trang thai hien tai. */
  readonly sentence: string;
  /** Doi tuong duoc noi toi (ho so lai xe, ben huu quan), neu co. */
  readonly subject?: { readonly id: string; readonly name: string } | null;
}

/* ------------------------------------------------------------------ *
 * DANH MUC — thu man hinh dung de ve bang quyen
 * ------------------------------------------------------------------ */

/**
 * LOAI cua mot ma quyen, SUY RA tu quy tac cua mien — khong co bang go tay:
 *   · `XEM`      — chi doc;
 *   · `THAO_TAC` — ghi thong thuong;
 *   · `DUYET`    — bien mot y kien thanh TIEN (ve phia QUYET DINH cua mot cap tach nhiem);
 *   · `NHAY_CAM` — chi Giam doc, hoac cap cho vai khac phai XAC NHAN leo thang.
 */
export const PERMISSION_KINDS = ['XEM', 'THAO_TAC', 'DUYET', 'NHAY_CAM'] as const;
export type PermissionKind = (typeof PERMISSION_KINDS)[number];

/** Phia cua ma quyen trong mot cap TACH NHIEM: nguoi DUYET tien ⟂ nguoi SUA can cu. */
export type SeparationOfDutySide = 'DECISION' | 'EVIDENCE';

export interface PermissionActionView {
  readonly code: string;
  /** Nhan tieng Viet co dau, theo nghiep vu — KHONG phai ten ma. */
  readonly label: string;
  readonly kind: PermissionKind;
  /** Chi Giam doc — khong cap duoc cho ai khac. */
  readonly directorOnly: boolean;
  /** Cap cho vai khac phai xac nhan leo thang. */
  readonly escalation: boolean;
  readonly sod: SeparationOfDutySide | null;
}

export interface PermissionGroupView {
  readonly id: string;
  readonly label: string;
  /** Mot dong mo ta nhom lam gi. */
  readonly summary: string;
  /** `false` = nhom den tu LIEN KET (lai xe, ben huu quan), khong bat tat bang quyen rieng. */
  readonly grantable: boolean;
  readonly actions: readonly PermissionActionView[];
  /**
   * QUYEN KEM THEO DE DUNG DUOC (`#395`) — ma DOC cua NHOM KHAC ma man hinh cua nhom nay can (vd
   * nhom quy lai xe can "Xem hồ sơ lái xe" de chon lai xe). Moi ma van thuoc DUNG MOT nhom; day chi
   * la loi chi duong: trinh chinh quyen bat kem, va "Người này làm được gì?" noi khi con thieu.
   * Thieu = khong kem theo gi (mien khong khai).
   */
  readonly needs?: readonly string[];
}

export interface PermissionPresetView {
  readonly role: UserRole;
  readonly label: string;
  readonly summary: string;
}

export interface PermissionCatalogView {
  readonly groups: readonly PermissionGroupView[];
  readonly presets: readonly PermissionPresetView[];
}

/* ------------------------------------------------------------------ *
 * MIEN
 * ------------------------------------------------------------------ */

export interface AccessValidationInput {
  readonly role: UserRole;
  /** Chi cac dong thuoc mien nay (tien to `<id>.`). */
  readonly grants: readonly PermissionGrant[];
  /** Nguoi cap da xac nhan leo thang cho moi quyen nhay cam trong `grants`. */
  readonly confirmEscalation: boolean;
}

export interface AccessChangeInput {
  readonly userId: string;
  readonly fromRole: UserRole;
  readonly toRole: UserRole;
}

export interface PermissionDomain {
  /** Tien to cua moi ma quyen thuoc mien nay, vd `transport`. */
  readonly id: string;
  /** Nhom quyen, nhan, vai khoi diem — cho man hinh. */
  catalog(): PermissionCatalogView;
  /** Tap ma quyen HIEU LUC cua mot nguoi trong mien nay (vai khoi diem + quyen rieng). */
  effective(subject: AccessSubject): readonly string[];
  /** Ly do tu choi mot bo quyen rieng cho mot vai; mang rong = hop le. */
  validate(input: AccessValidationInput): readonly AccessViolation[];
  /** Cac quyen `ALLOW` trong bo nay la LEO THANG — de ghi `auth.user.access.escalate`. */
  escalated(role: UserRole, grants: readonly PermissionGrant[]): readonly string[];
  /** Doi vai co pha mot LIEN KET cua mien khong (vd tai khoan dang noi ho so lai xe). */
  checkAccessChange?(input: AccessChangeInput): Promise<readonly AccessViolation[]>;
  /** Cac pham vi den tu du lieu cua mot tai khoan — cho "Nguoi nay lam duoc gi?". */
  describeScopes?(userId: string): Promise<readonly AccessScopeNote[]>;
  /** Ten dang nhap mien nay dung lam danh tinh he thong — khong ai tao tai khoan trung duoc. */
  reservedUsernames?(): readonly string[];
}
