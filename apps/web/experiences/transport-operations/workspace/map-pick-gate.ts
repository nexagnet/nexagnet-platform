/**
 * CONG CHON DIEM tren ban do chon diem (`#379`) — THUAN, dong ho duoc tiem vao.
 *
 * ===========================================================================
 * VI SAO PHAI CHO MOT NHIP TRUOC KHI CHON.
 *
 * MapLibre phat `click` cho CA HAI lan bam cua mot cu bam dup (va cu cham dup tren dien thoai), roi
 * moi phat `dblclick` de phong to. Neu moi `click` la mot lan chon, mot cu phong to dat diem LAY vao
 * cho vua phong to, tu chuyen o, roi dat diem GIAO vao dung cho do — nguoi dung chi muon nhin gan
 * hon ma don da mang mot diem ho khong chon. Nen: mot lan bam chi thanh mot lan chon khi KHONG co
 * lan bam thu hai trong `PICK_SETTLE_MS`; co thi ca cu la mot cu phong to, va ban do van phong to.
 *
 * ===========================================================================
 * VI SAO KHONG CHI NHIN `detail`.
 *
 * Cham dup tren mot so trinh duyet di dong bao `detail = 1` cho ca hai lan cham. Lan bam thu hai
 * den trong luc lan thu nhat con cho la du dau hieu — khong can tin vao `detail`.
 */

/** Du dai de bat mot cu bam dup (he dieu hanh mac dinh ~500 ms, tay nguoi ~200–300 ms). */
export const PICK_SETTLE_MS = 300;

export interface PickTimers<H = ReturnType<typeof setTimeout>> {
  readonly set: (run: () => void, delayMs: number) => H;
  readonly clear: (handle: H) => void;
}

export interface PickGate<T> {
  /** `clickCount` = `MouseEvent.detail` cua lan bam (1 = bam don, 2 = lan thu hai cua bam dup…). */
  readonly click: (value: T, clickCount: number) => void;
  /** `dblclick` hoac go ban do: huy lan chon dang cho. */
  readonly cancel: () => void;
}

/* Goi dong ho toan cuc LUC GOI (khong chup luc nap tep) — `vi.useFakeTimers()` thay duoc no. */
const GLOBAL_TIMERS: PickTimers = {
  set: (run, delayMs) => setTimeout(run, delayMs),
  clear: (handle) => clearTimeout(handle),
};

export function createPickGate<T, H = ReturnType<typeof setTimeout>>(
  onPick: (value: T) => void,
  timers: PickTimers<H> = GLOBAL_TIMERS as unknown as PickTimers<H>,
  settleMs: number = PICK_SETTLE_MS,
): PickGate<T> {
  /* Hop giu ma dong ho: ma cua trinh duyet co the la 0, nen khong dung chinh no lam co. */
  let pending: { readonly handle: H } | null = null;

  const cancelPending = (): boolean => {
    if (pending === null) return false;
    timers.clear(pending.handle);
    pending = null;
    return true;
  };

  return {
    click: (value, clickCount) => {
      const wasWaiting = cancelPending();
      if (wasWaiting || clickCount > 1) return;
      pending = {
        handle: timers.set(() => {
          pending = null;
          onPick(value);
        }, settleMs),
      };
    },
    cancel: () => {
      cancelPending();
    },
  };
}
