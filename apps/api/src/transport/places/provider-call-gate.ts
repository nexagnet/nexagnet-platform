/**
 * CONG GIOI HAN lan goi nha cung cap ben ngoai — TOAN TIEN TRINH, mot hang doi, co tran.
 *
 * ===========================================================================
 * VI SAO GIOI HAN O DAY, KHONG PHAI O `@Throttle`
 *
 * `@Throttle` dem theo TUNG NGUOI GOI (IP). Muoi nguoi van phong moi nguoi tim hai lan mot phut deu
 * nam trong han cua ho — va cung nhau la hai muoi lan goi ra ngoai trong mot phut, dung thu chinh
 * sach cua Nominatim cong khai cam (toi da MOT lan moi giay cho CA ung dung). Chi mot cong dung
 * chung cho moi yeu cau moi dem dung dai luong do.
 *
 * ===========================================================================
 * MOT LAN GOI DANG CHAY + TOI DA `maxWaiting` NGUOI CHO — KHONG NGU VO HAN
 *
 * Cac lan goi chay NOI TIEP (lan sau doi lan truoc xong) va moi lan bat dau cach lan truoc it nhat
 * `minSpacingMs`. Nen trong cong LUON co toi da MOT yeu cau giu luot (dang goi, hoac dang doi du
 * khoang cach de goi) va toi da `maxWaiting` yeu cau xep sau no. Nguoi cho thu `maxWaiting + 1`
 * nhan ngay `admitted: false` — tuc "ban, thu lai sau" — thay vi xep hang giu mot ket noi HTTP bang
 * mot vong `sleep` khong day (quyet dinh kien truc #9).
 *
 * Voi 3 nguoi cho va het gio 8 giay cua moi lan goi, nguoi cho cuoi co toi da BA lan goi dung truoc
 * no (lan dang chay + hai nguoi cho truoc) — truong hop xau nhat khoang 3 x 8 giay. Mot cai tran do
 * duoc, khong phai "den khi nao xong".
 *
 * ===========================================================================
 * DONG HO DON DIEU, VA THOI GIAN CHO BI KEP
 *
 * Mac dinh do bang `performance.now()` chu KHONG `Date.now()`: dong ho tuong co the NHAY LUI (NTP
 * chinh gio, nguoi van hanh doi gio may). Voi `Date.now()`, mot lan lui mot gio se bien
 * `moc truoc + khoang cach - bay gio` thanh mot gio cho — moi yeu cau sau do treo den het gio HTTP,
 * va cong trong nhu nha cung cap sap. Them mot lop an toan cho moi dong ho tiem vao: thoi gian cho
 * KHONG BAO GIO vuot `minSpacingMs`, vi khong co ly do dung dan nao de cho lau hon mot khoang cach.
 *
 * ===========================================================================
 * MOT TIEN TRINH, MOT CONG
 *
 * Cong nay song trong bo nho cua tien trinh. Stack xem truoc chay MOT tien trinh api; khi nao chay
 * nhieu ban sao thi moi ban mot cong, va luc do can mot kho dung chung (Redis) — mot thay doi co
 * chu dich, khong phai mot thu tu nhien den.
 */

export interface ProviderCallGateOptions {
  /** Khoang cach toi thieu giua HAI LAN BAT DAU goi. Cung la tran cua moi lan cho. */
  readonly minSpacingMs: number;
  /** So yeu cau toi da XEP SAU lan goi dang giu luot. Nguoi cho thu `maxWaiting + 1` -> tu choi. */
  readonly maxWaiting: number;
  /** Dong ho (DON DIEU, mili giay) va ham ngu TIEM duoc — de bai kiem thu khong phai cho that. */
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export type GateOutcome<T> =
  { readonly admitted: true; readonly value: T } | { readonly admitted: false };

/** Cong noi tiep: tai moi thoi diem chi MOT yeu cau giu luot goi nha cung cap. */
const TURN_HOLDERS = 1;

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const monotonicNow = (): number => performance.now();

export class ProviderCallGate {
  private readonly minSpacingMs: number;
  private readonly maxWaiting: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  private pending = 0;
  private tail: Promise<void> = Promise.resolve();
  private lastStartedAtMs: number | null = null;

  constructor(options: ProviderCallGateOptions) {
    this.minSpacingMs = options.minSpacingMs;
    this.maxWaiting = options.maxWaiting;
    this.now = options.now ?? monotonicNow;
    this.sleep = options.sleep ?? realSleep;
  }

  /** So yeu cau dang nam trong cong (giu luot + dang cho) — de chan doan doc, khong de quyet dinh. */
  get pendingCount(): number {
    return this.pending;
  }

  /** So yeu cau dang CHO sau lan giu luot. */
  get waitingCount(): number {
    return Math.max(0, this.pending - TURN_HOLDERS);
  }

  async run<T>(task: () => Promise<T>): Promise<GateOutcome<T>> {
    // Dem tren TONG trong cong chu khong tren "dang cho": mot chum yeu cau den cung mot nhip se
    // chua kip co ai bat dau goi, va dem "dang cho" luc do se tu choi nham nguoi thu tu.
    if (this.pending >= TURN_HOLDERS + this.maxWaiting) return { admitted: false };
    this.pending += 1;

    const turn = this.tail.then(() => this.waitForSlot()).then(task);
    // Hang doi di tiep du lan goi nay hong: mot lan loi khong duoc khoa cong cua moi nguoi sau.
    this.tail = turn.then(
      () => undefined,
      () => undefined,
    );
    try {
      return { admitted: true, value: await turn };
    } finally {
      this.pending -= 1;
    }
  }

  private async waitForSlot(): Promise<void> {
    if (this.lastStartedAtMs !== null) {
      const dueInMs = this.lastStartedAtMs + this.minSpacingMs - this.now();
      // KEP tren `minSpacingMs`: dong ho lui (hay mot dong ho tiem hong) khong duoc bien mot khoang
      // cach 1,1 giay thanh mot lan cho khong day.
      const waitMs = Math.min(dueInMs, this.minSpacingMs);
      if (waitMs > 0) await this.sleep(waitMs);
    }
    // Danh dau SAU khi ngu: moc la luc lan goi THAT SU bat dau, khong phai luc no xep hang.
    this.lastStartedAtMs = this.now();
  }
}
