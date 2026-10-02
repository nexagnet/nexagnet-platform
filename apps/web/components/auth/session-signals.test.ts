import { describe, expect, it, vi } from 'vitest';
import { VIETNAM_DATE_TIME } from '../../lib/account-format';
import {
  cacheBelongsToAnotherIdentity,
  createRefreshGate,
  FORBIDDEN_IS_ANSWER_META,
  isForbiddenAnswer,
  passwordChangeIssues,
  passwordChangeProblems,
  passwordExpiryLabel,
  permissionsKey,
  reactToFailure,
  runSignOut,
  SESSION_ENDED_NOTICE,
  sessionSignalOf,
  type FailureContext,
} from './session-signals';

describe('tin hieu phien tu mot loi API (#395)', () => {
  it('401 = phien da chet; 403 = quyen da doi; loi khac khong noi gi ve phien', () => {
    expect(sessionSignalOf({ status: 401 })).toBe('SESSION_ENDED');
    expect(sessionSignalOf({ status: 403, reason: 'PASSWORD_CHANGE_REQUIRED' })).toBe(
      'ACCESS_CHANGED',
    );
    expect(sessionSignalOf({ status: 403, reason: null })).toBe('ACCESS_CHANGED');
    for (const status of [400, 404, 409, 500]) expect(sessionSignalOf({ status })).toBeNull();
    expect(sessionSignalOf(new Error('mang'))).toBeNull();
    expect(sessionSignalOf(null)).toBeNull();
  });

  it('muoi 403 trong mot nhip chi doc lai /auth/me MOT lan', () => {
    let clock = 1_000;
    const gate = createRefreshGate(5_000, () => clock);
    const allowed = Array.from({ length: 10 }, () => gate()).filter(Boolean);
    expect(allowed).toHaveLength(1);
    clock += 4_999;
    expect(gate()).toBe(false);
    clock += 1;
    expect(gate()).toBe(true);
  });

  it('cung noi dung quyen, khac thu tu → cung mot khoa; thieu truong → null (ban guong theo vai)', () => {
    expect(permissionsKey(['b', 'a'])).toBe(permissionsKey(['a', 'b']));
    expect(permissionsKey([])).toBe('');
    expect(permissionsKey(undefined)).toBeNull();
  });
});

describe('mot loi API → man hinh lam gi (#395)', () => {
  const working: FailureContext = { isSession: true, hasUser: true, isSigningOut: false };

  it('401 khi dang lam viec: noi VI SAO va ve dang nhap ngay', () => {
    expect(reactToFailure({ status: 401 }, working)).toEqual({
      notice: SESSION_ENDED_NOTICE,
      refresh: 'NOW',
    });
    // Chua co ai tren man hinh (vd trang dang nhap): ve dang nhap, khong noi "phien da ket thuc".
    expect(reactToFailure({ status: 401 }, { ...working, hasUser: false })).toEqual({
      notice: null,
      refresh: 'NOW',
    });
  });

  it('TU DANG XUAT: mot query bay ve 401 truoc khi nguoi dung duoc go KHONG bao gio noi "bi khoa"', () => {
    const signingOut = { ...working, isSigningOut: true };
    for (const status of [401, 403, 500]) {
      expect(reactToFailure({ status }, signingOut)).toEqual({ notice: null, refresh: 'NONE' });
    }
  });

  it('403 → doc lai /auth/me qua cong chan; 403 cua mot lan DO thi im lang, 401 cua no van la phien chet', () => {
    expect(reactToFailure({ status: 403 }, working)).toEqual({ notice: null, refresh: 'GATED' });
    const probe = { ...working, meta: FORBIDDEN_IS_ANSWER_META };
    expect(reactToFailure({ status: 403 }, probe)).toEqual({ notice: null, refresh: 'NONE' });
    expect(reactToFailure({ status: 401 }, probe).notice).toBe(SESSION_ENDED_NOTICE);
    expect(isForbiddenAnswer({ forbiddenIsAnswer: true })).toBe(true);
    expect(isForbiddenAnswer({ forbiddenIsAnswer: 'yes' })).toBe(false);
    expect(isForbiddenAnswer(undefined)).toBe(false);
  });

  it('ngoai che do phien, hay loi khong noi gi ve phien: khong lam gi', () => {
    expect(reactToFailure({ status: 401 }, { ...working, isSession: false })).toEqual({
      notice: null,
      refresh: 'NONE',
    });
    for (const status of [400, 409, 500]) {
      expect(reactToFailure({ status }, working)).toEqual({ notice: null, refresh: 'NONE' });
    }
    expect(reactToFailure(new Error('mang'), working)).toEqual({ notice: null, refresh: 'NONE' });
  });
});

describe('han mat khau tam — gio Viet Nam, cung bo dinh dang voi the mat khau tam', () => {
  it('doc theo Asia/Ho_Chi_Minh du trinh duyet de mui gio nao', () => {
    // 17:30 UTC = 00:30 ngay hom sau o Viet Nam (UTC+7).
    const label = passwordExpiryLabel('2026-09-25T17:30:00.000Z');
    expect(label).toContain('00:30');
    expect(label).toContain('26/09/2026');
    // Chuoi gio o tren KHONG do duoc gi tren may chay o UTC+7 (bo `timeZone` van ra cung chuoi):
    // mui gio phai doc tu CHINH bo dinh dang. ICU co the doi ten chuan (`Asia/Saigon`), nen so voi
    // ten ICU tra cho `Asia/Ho_Chi_Minh` — khac mui gio mac dinh cua may (vd `Asia/Bangkok`, `UTC`).
    const vietnam = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh' });
    expect(VIETNAM_DATE_TIME.resolvedOptions().timeZone).toBe(vietnam.resolvedOptions().timeZone);
    expect(label).toBe(VIETNAM_DATE_TIME.format(new Date('2026-09-25T17:30:00.000Z')));
  });

  it('khong co han, hoac han hong: khong hien dong do', () => {
    expect(passwordExpiryLabel(null)).toBeNull();
    expect(passwordExpiryLabel(undefined)).toBeNull();
    expect(passwordExpiryLabel('khong-phai-ngay')).toBeNull();
  });
});

describe('man doi mat khau bat buoc', () => {
  const current = ['tam', '0001'].join('-');
  const strong = ['duong', 've', 'ba', 'vi'].join('-');

  it('du dieu kien thi khong con gi sai', () => {
    expect(passwordChangeProblems({ current, next: strong, confirm: strong })).toEqual([]);
  });

  it('noi dung tung dieu sai, theo thu tu o nhap', () => {
    expect(passwordChangeProblems({ current: '', next: 'ngan', confirm: 'khac' })).toEqual([
      'Nhập mật khẩu tạm đang dùng.',
      'Mật khẩu mới cần ít nhất 12 ký tự.',
      'Hai lần nhập mật khẩu mới chưa khớp nhau.',
    ]);
    const same = current.repeat(2);
    expect(passwordChangeProblems({ current: same, next: same, confirm: same })).toEqual([
      'Mật khẩu mới phải khác mật khẩu tạm.',
    ]);
  });

  it('moi dieu sai noi RO o nhap cua no — de danh dau `aria-invalid` dung o', () => {
    expect(
      passwordChangeIssues({ current: '', next: 'ngan', confirm: 'khac' }).map(
        (issue) => issue.field,
      ),
    ).toEqual(['current', 'next', 'confirm']);
    const same = current.repeat(2);
    expect(passwordChangeIssues({ current: same, next: same, confirm: same })).toEqual([
      { field: 'next', message: 'Mật khẩu mới phải khác mật khẩu tạm.' },
    ]);
  });
});

describe('o nho query thuoc ve MOT danh tinh (#395)', () => {
  it('phien het (401) hay nguoi KHAC dang nhap tren cung tab → xoa; cung nguoi → giu', () => {
    expect(cacheBelongsToAnotherIdentity('u-an', null)).toBe(true);
    expect(cacheBelongsToAnotherIdentity('u-an', 'u-binh')).toBe(true);
    expect(cacheBelongsToAnotherIdentity('u-an', 'u-an')).toBe(false);
    // Chua ai so huu (lan dau tai trang) → khong co gi de xoa.
    expect(cacheBelongsToAnotherIdentity(null, 'u-an')).toBe(false);
    expect(cacheBelongsToAnotherIdentity(null, null)).toBe(false);
  });
});

describe('trinh tu dang xuat cua AuthGate', () => {
  const recorder = (logout: () => Promise<void>) => {
    const calls: string[] = [];
    let signingOutWhenCalled: boolean | null = null;
    let signingOut = false;
    const steps = {
      begin: () => {
        calls.push('begin');
        signingOut = true;
      },
      logout: () => {
        calls.push('logout');
        signingOutWhenCalled = signingOut;
        return logout();
      },
      abort: () => {
        calls.push('abort');
        signingOut = false;
      },
      finish: () => calls.push('finish'),
    };
    return {
      steps,
      calls,
      signingOut: () => signingOut,
      signingOutWhenCalled: () => signingOutWhenCalled,
    };
  };

  it('danh dau "đang đăng xuất" TRUOC khi goi may chu — moi 401 sau do la cua chinh lan nay', async () => {
    const run = recorder(() => Promise.resolve());
    await runSignOut(run.steps);
    expect(run.signingOutWhenCalled()).toBe(true);
    expect(run.calls).toEqual(['begin', 'logout', 'finish']);
  });

  it('may chu tu choi: go dau "đang đăng xuất", KHONG ve dang nhap, va nem loi len nguoi goi', async () => {
    const failure = new Error('Mất mạng');
    const run = recorder(() => Promise.reject(failure));
    await expect(runSignOut(run.steps)).rejects.toBe(failure);
    expect(run.calls).toEqual(['begin', 'logout', 'abort']);
    expect(run.signingOut()).toBe(false);
  });

  it('khong goi `finish` truoc khi may chu tra loi', async () => {
    let release: () => void = () => undefined;
    const run = recorder(
      () =>
        new Promise<void>((resolveLogout) => {
          release = resolveLogout;
        }),
    );
    const pending = runSignOut(run.steps);
    await vi.waitFor(() => expect(run.calls).toEqual(['begin', 'logout']));
    release();
    await pending;
    expect(run.calls).toEqual(['begin', 'logout', 'finish']);
  });
});
