import { formatDateTime } from '../../lib/account-format';

/**
 * TIN HIEU PHIEN (`#395`) — ham THUAN, khong React, de bai kiem giu duoc luat ma khong can DOM.
 *
 * Quyen va mat khau gio doi TRONG KHI nguoi dung dang mo trang: Giam doc cap/bot quyen, dat lai mat
 * khau hay khoa tai khoan. May chu ap thay doi o YEU CAU KE TIEP; man hinh phai theo kip thay vi doi
 * nguoi dung tu tai lai trang:
 *
 *   · `401` — phien da chet (mat khau vua duoc dat lai, tai khoan bi khoa): ve trang dang nhap, kem
 *     mot cau noi VI SAO, thay vi moi muc hien mot o loi;
 *   · `403` — quyen da doi (hoac may chu doi doi mat khau truoc): doc lai `/auth/me` de danh muc va
 *     nut bam khop voi quyen moi.
 *
 * Moi loi khac (409, 422, 500…) la chuyen cua man hinh dang lam, khong phai cua phien.
 */

export type SessionSignal = 'SESSION_ENDED' | 'ACCESS_CHANGED';

export const SESSION_ENDED_NOTICE =
  'Phiên đăng nhập đã kết thúc (mật khẩu vừa được đặt lại hoặc tài khoản bị khoá). Hãy đăng nhập lại.';

/** Ly do may chu gan khi tai khoan phai doi mat khau truoc khi lam bat cu viec gi. */
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

const statusOf = (error: unknown): number | null => {
  if (typeof error !== 'object' || error === null) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
};

/** Mot loi cua lan goi API → tin hieu cho phien, hoac `null` khi loi khong noi gi ve phien. */
export function sessionSignalOf(error: unknown): SessionSignal | null {
  const status = statusOf(error);
  if (status === 401) return 'SESSION_ENDED';
  if (status === 403) return 'ACCESS_CHANGED';
  return null;
}

/**
 * DANH DAU `meta` cua mot query/mutation ma `403` la CAU TRA LOI binh thuong, khong phai tin hieu
 * quyen da doi — vd lan DO "tai khoan nay co phai ben gop von khong" (`GET /transport/me/vehicles`):
 * nguoi khong gop von nhan `403` o MOI lan tai trang, va doc lai `/auth/me` vi no la mot vong vo ich.
 * `401` van LUON la phien da chet, du query co danh dau hay khong.
 */
export const FORBIDDEN_IS_ANSWER_META = { forbiddenIsAnswer: true } as const;

export const isForbiddenAnswer = (meta: unknown): boolean =>
  typeof meta === 'object' &&
  meta !== null &&
  (meta as { forbiddenIsAnswer?: unknown }).forbiddenIsAnswer === true;

export interface FailureContext {
  /** `AuthGate` dang o che do phien (`mode === 'session'`). */
  readonly isSession: boolean;
  /** Dang co mot nguoi dung da dang nhap tren man hinh. */
  readonly hasUser: boolean;
  /** Nguoi dung vua TU bam dang xuat — phien chet la dieu ho muon, khong phai mot su co. */
  readonly isSigningOut: boolean;
  /** `meta` cua query/mutation vua loi (xem `FORBIDDEN_IS_ANSWER_META`). */
  readonly meta?: unknown;
}

export interface FailureReaction {
  /** Cau cho trang dang nhap, hoac `null` — khong noi gi. */
  readonly notice: string | null;
  /** `NOW`: doc lai `/auth/me` ngay; `GATED`: qua cong chan don dap; `NONE`: khong doc lai. */
  readonly refresh: 'NOW' | 'GATED' | 'NONE';
}

const QUIET: FailureReaction = { notice: null, refresh: 'NONE' };

/**
 * MOT loi cua lan goi API → man hinh lam gi. Ham THUAN, de bai kiem giu duoc luat dang xuat:
 *
 *   · TU DANG XUAT thi KHONG BAO GIO noi "Phiên đăng nhập đã kết thúc (mật khẩu vừa được đặt lại
 *     hoặc tài khoản bị khoá)". Mot query dang bay ve `401` sau `POST /auth/logout` la HAU QUA cua
 *     chinh lan bam do; noi voi nguoi dung rang ho bi khoa la mot cau sai lam ho hoang;
 *   · `401` khi dang lam viec → cau noi vi sao + doc lai ngay (ve trang dang nhap);
 *   · `403` → doc lai `/auth/me` qua cong chan; `403` cua mot lan DO thi im lang.
 */
export function reactToFailure(error: unknown, context: FailureContext): FailureReaction {
  if (!context.isSession || context.isSigningOut) return QUIET;
  const signal = sessionSignalOf(error);
  if (signal === 'SESSION_ENDED') {
    return { notice: context.hasUser ? SESSION_ENDED_NOTICE : null, refresh: 'NOW' };
  }
  if (signal === 'ACCESS_CHANGED' && !isForbiddenAnswer(context.meta)) {
    return { notice: null, refresh: 'GATED' };
  }
  return QUIET;
}

/**
 * CHAN DOC LAI DON DAP. Mot trang co muoi query cung nhan `403` trong mot nhip se ban muoi lan
 * `/auth/me` neu khong chan — va mot man hinh ma chinh may chu tu choi (vd be mat ben huu quan cua
 * nguoi khong phai ben huu quan) se doc lai lien tuc. Moi khoang `minIntervalMs` chi MOT lan.
 */
export function createRefreshGate(
  minIntervalMs: number,
  now: () => number = () => Date.now(),
): () => boolean {
  let last = Number.NEGATIVE_INFINITY;
  return () => {
    const current = now();
    if (current - last < minIntervalMs) return false;
    last = current;
    return true;
  };
}

/**
 * O NHO QUERY THUOC VE MOT DANH TINH. Ket qua da doc (vd cau tra loi "co phai ben gop von khong", giu
 * `staleTime: Infinity`) chi dung cho nguoi da doc no: phien het (`401`) hay mot nguoi KHAC dang nhap
 * tren cung tab thi phai xoa — khong chi khi tu bam "Đăng xuất". `previous === null` = chua ai.
 */
export const cacheBelongsToAnotherIdentity = (
  previous: string | null,
  next: string | null,
): boolean => previous !== null && previous !== next;

export interface SignOutSteps {
  /** Danh dau DANG XUAT CHU DONG — truoc khi goi may chu, de moi `401` sau do la cua chinh lan nay. */
  readonly begin: () => void;
  readonly logout: () => Promise<void>;
  /** Chua dang xuat duoc: phien van song, nen mot `401` sau day lai la tin hieu THAT. */
  readonly abort: () => void;
  readonly finish: () => void;
}

/** Trinh tu dang xuat cua `AuthGate` — tach ra de khoa THU TU bang bai kiem, khong can dung React. */
export async function runSignOut(steps: SignOutSteps): Promise<void> {
  steps.begin();
  try {
    await steps.logout();
  } catch (error) {
    steps.abort();
    throw error;
  }
  steps.finish();
}

/**
 * Tap quyen tu `/auth/me` → mot khoa on dinh. Hai lan doc cung noi dung phai cho CUNG mot tap (cung
 * danh tinh doi tuong), neu khong moi lan lam tuoi `/auth/me` pha memo cua moi man hinh.
 */
export const permissionsKey = (permissions: readonly string[] | undefined | null): string | null =>
  permissions === undefined || permissions === null ? null : [...permissions].sort().join('\n');

/* ------------------------------------------------------------------ *
 * Man doi mat khau bat buoc
 * ------------------------------------------------------------------ */

/**
 * Han cua mat khau tam, doc theo gio VIET NAM — cung MOT bo dinh dang voi the mat khau tam va man
 * quan tri (`formatDateTime`), de loi nhan Giam doc gui va man doi mat khau noi cung mot gio du dien
 * thoai cua lai xe dang de mui gio nao. `null` khi khong co han (khong hien dong do).
 */
export function passwordExpiryLabel(value: string | null | undefined): string | null {
  if (value == null || Number.isNaN(new Date(value).getTime())) return null;
  return formatDateTime(value);
}

/** Trung voi `passwordSchema` phia may chu (`min(12).max(128)`). */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordChangeDraft {
  readonly current: string;
  readonly next: string;
  readonly confirm: string;
}

export interface PasswordChangeProblem {
  /** O nhap phai danh dau `aria-invalid` — trinh doc man hinh noi o NAO sai, khong chi noi co sai. */
  readonly field: keyof PasswordChangeDraft;
  readonly message: string;
}

/** Nhung dieu con sai KEM o nhap cua no, theo thu tu o nhap tren man hinh. Rong = gui duoc. */
export function passwordChangeIssues(draft: PasswordChangeDraft): readonly PasswordChangeProblem[] {
  const issues: PasswordChangeProblem[] = [];
  if (draft.current.length === 0) {
    issues.push({ field: 'current', message: 'Nhập mật khẩu tạm đang dùng.' });
  }
  if (draft.next.length < PASSWORD_MIN_LENGTH) {
    issues.push({
      field: 'next',
      message: `Mật khẩu mới cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`,
    });
  } else if (draft.next.length > PASSWORD_MAX_LENGTH) {
    issues.push({ field: 'next', message: `Mật khẩu mới dài quá ${PASSWORD_MAX_LENGTH} ký tự.` });
  } else if (draft.next === draft.current) {
    issues.push({ field: 'next', message: 'Mật khẩu mới phải khác mật khẩu tạm.' });
  }
  if (draft.confirm !== draft.next) {
    issues.push({ field: 'confirm', message: 'Hai lần nhập mật khẩu mới chưa khớp nhau.' });
  }
  return issues;
}

/** Nhung dieu con sai, theo thu tu o nhap tren man hinh. Rong = gui duoc. */
export const passwordChangeProblems = (draft: PasswordChangeDraft): readonly string[] =>
  passwordChangeIssues(draft).map((issue) => issue.message);
