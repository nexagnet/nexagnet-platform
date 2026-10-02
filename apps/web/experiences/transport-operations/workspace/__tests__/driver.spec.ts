import { describe, expect, it } from 'vitest';
import type {
  DriverFieldLeg,
  DriverFieldRun,
  DriverFieldWork,
  DriverFuelSlipView,
  DriverTripView,
} from '../../transport-types';
import {
  currentDriverTrip,
  driverTripActions,
  REVENUE_FIELD_NAMES,
  revenueFieldsIn,
  toDriverFuelSlipRows,
  toDriverHome,
  toDriverTripCard,
  type DriverHomeInput,
  type DriverHomeModel,
  type DriverHomeRead,
} from '../driver';
import { toFieldScreen } from '../driver-field';
import { driverFuelSlip, driverTrip, fundStatement, trip } from './fixtures';

/**
 * `INV-09` — be mat lai xe khong bao gio thay doanh thu/gia cuoc.
 *
 * #161 §8 doi mot bang chung cu the: *"payload cua lai xe khong chua doanh thu, chu khong phai chi
 * bi CSS che di"*. Bo test nay la bang chung do o tang du lieu.
 */
describe('cach ly doanh thu khoi be mat lai xe', () => {
  it('khung nhin chuyen cua lai xe khong chua mot khoa mui tien nao', () => {
    expect(revenueFieldsIn(driverTrip())).toEqual([]);
  });

  it('phieu dau cua lai xe khong chua khoa doanh thu', () => {
    expect(revenueFieldsIn(driverFuelSlip())).toEqual([]);
  });

  it('luoi bao dong THAT SU keu khi mot truong doanh thu ro sang', () => {
    // Neu khong co bai nay thi `revenueFieldsIn` co the luon tra ve rong ma khong ai biet.
    // `Trip` cua be mat van hanh CO `freightAmount`, va do la dung cai khong duoc phep sang day.
    expect(revenueFieldsIn(trip())).toContain('freightAmount');
    expect(revenueFieldsIn([driverTrip(), trip()])).toContain('freightAmount');
  });

  it('lai xe VAN duoc thay so tien cua chinh phieu dau minh nop', () => {
    // `INV-09` cam doanh thu, khong cam moi con so tien. Lai xe tra tien mat va can doi soat lai.
    const row = toDriverFuelSlipRows([driverFuelSlip()])[0]!;
    expect(row.amountLabel).not.toBe('—');
    expect((REVENUE_FIELD_NAMES as readonly string[]).includes('amount')).toBe(false);
  });

  it('the chuyen dung cho lai xe chi mang thong tin an toan', () => {
    const card = toDriverTripCard(driverTrip());
    expect(card.customerLabel).toBe('Công ty Đông Anh');
    expect(revenueFieldsIn(card)).toEqual([]);
    expect(Object.keys(card)).not.toContain('freightAmount');
  });
});

describe('chuyen dang lam', () => {
  const mine = (over: Partial<DriverTripView>): DriverTripView =>
    driverTrip({ isCurrentAssignee: true, ...over });

  it('chuyen dang chay duoc uu tien hon chuyen da len ke hoach', () => {
    const trips = [mine({ id: 'a', status: 'PLANNED' }), mine({ id: 'b', status: 'IN_TRANSIT' })];
    expect(currentDriverTrip(trips)?.id).toBe('b');
  });

  it('khong co chuyen dang chay thi lay chuyen ke tiep da len ke hoach', () => {
    expect(currentDriverTrip([mine({ id: 'a', status: 'PLANNED' })])?.id).toBe('a');
  });

  it('chuyen KHONG phai cua minh thi khong bao gio duoc coi la chuyen dang lam', () => {
    const others = [driverTrip({ id: 'x', status: 'IN_TRANSIT', isCurrentAssignee: false })];
    expect(currentDriverTrip(others)).toBeNull();
  });

  it('chuyen da giao hoac da huy khong phai viec dang lam', () => {
    const done = [mine({ id: 'a', status: 'DELIVERED' }), mine({ id: 'b', status: 'CANCELLED' })];
    expect(currentDriverTrip(done)).toBeNull();
  });
});

describe('thao tac lai xe duoc lam', () => {
  it('da len ke hoach thi bat dau chuyen', () => {
    expect(driverTripActions(driverTrip({ status: 'PLANNED' }))).toEqual([
      { to: 'IN_TRANSIT', label: 'Bắt đầu chuyến' },
    ]);
  });

  it('dang chay thi bao da giao', () => {
    expect(driverTripActions(driverTrip({ status: 'IN_TRANSIT' }))).toEqual([
      { to: 'DELIVERED', label: 'Đã giao' },
    ]);
  });

  it('KHONG bao gio co nut chot doi soat — GD-01 doi mot lan chuyen tay co quyen', () => {
    for (const status of ['PLANNED', 'IN_TRANSIT', 'DELIVERED'] as const) {
      const actions = driverTripActions(driverTrip({ status }));
      for (const action of actions) {
        expect(action.to).not.toBe('RECONCILED');
      }
    }
    expect(driverTripActions(driverTrip({ status: 'DELIVERED' }))).toEqual([]);
  });

  it('khong phai nguoi dang phu trach thi khong co thao tac nao', () => {
    expect(driverTripActions(driverTrip({ isCurrentAssignee: false }))).toEqual([]);
  });

  it('khong co chuyen thi khong co thao tac', () => {
    expect(driverTripActions(null)).toEqual([]);
  });
});

describe('phieu dau cua chinh minh', () => {
  it('so lit doc ra dung 200 lit tu 200.000 mililit', () => {
    const row = toDriverFuelSlipRows([driverFuelSlip()])[0]!;
    expect(row.litersLabel).toBe('200,000 L');
    expect(row.consumptionLabel).toBe('40,000 L/100km');
  });

  /**
   * BAI NAY DA BI LAT. Ban truoc khang dinh phieu bi tu choi la mot NGO CUT ("chưa mở đường tự nộp
   * lại") — tuc no ghi lai mot GIOI HAN, va gioi han do da bien mat khi `#168 B5` mo
   * `POST /transport/me/fuel/slips/:id/resubmit`.
   *
   * Giu nguyen bai cu se lam man hinh tiep tuc noi voi lai xe rang ho phai di tim ke toan, trong
   * khi cai nut nop lai dang o ngay tren tay ho.
   */
  it('phieu bi tu choi NOP LAI duoc, va ghi chu cua nguoi duyet duoc giu nguyen van', () => {
    const rejected: DriverFuelSlipView = driverFuelSlip({
      verificationStatus: 'REJECTED',
      reviewNote: 'Ảnh mờ, không đọc được số lít.',
    });
    const row = toDriverFuelSlipRows([rejected])[0]!;
    expect(row.canResubmit).toBe(true);
    expect(row.rejectedNote).toBe('Ảnh mờ, không đọc được số lít.');
  });

  it('bi tu choi ma khong co ghi chu thi van co mot cau viec-can-lam', () => {
    const rejected: DriverFuelSlipView = driverFuelSlip({
      verificationStatus: 'REJECTED',
      reviewNote: null,
    });
    expect(toDriverFuelSlipRows([rejected])[0]!.rejectedNote).toContain('nộp lại');
  });

  it('phieu chua bi tu choi thi KHONG bay nut nop lai', () => {
    expect(toDriverFuelSlipRows([driverFuelSlip()])[0]!.canResubmit).toBe(false);
  });

  /** Lai xe phai hoc duoc `evidenceId` de dung dia chi xem anh — xem `DriverFuelSlipView.evidence`. */
  it('anh cua phieu di kem MA, khong chi mot con so dem', () => {
    const row = toDriverFuelSlipRows([driverFuelSlip()])[0]!;
    expect(row.hasEvidence).toBe(true);
    expect(row.evidence.map((item) => item.id)).toEqual(['ev-1']);
  });

  it('phieu binh thuong khong bay canh bao gi', () => {
    expect(toDriverFuelSlipRows([driverFuelSlip()])[0]!.rejectedNote).toBeNull();
  });

  it('anh chi duoc DEM, va do la gioi han that cua may chu', () => {
    const row = toDriverFuelSlipRows([driverFuelSlip({ evidenceCount: 2 })])[0]!;
    expect(row.evidenceCountLabel).toBe('2');
    expect(row.hasEvidence).toBe(true);
  });

  /**
   * HAI CONG KHAC NHAU, va man hinh phai giu dung khoang cach giua chung.
   *
   * Chu so huu hoi: *"chung tu da xac thuc sao lai van day len duoc file, anh moi?"*. Cau tra loi
   * la CO Y — may chu chan `attachEvidence` CHI khi ky doi soat da chot, con `withdrawEvidence`
   * chan tu luc `VERIFIED`. Chi co THEM sau khi xac thuc, khong co BOT: mot ke toan tim duoc phieu
   * goc sau khi duyet van phai gan duoc no vao, con go mot tam anh sau khi duyet la xoa chinh thu
   * nguoi duyet da nhin.
   *
   * Bo bai nay khoa dung khoang cach do: noi rong cong `dinh them` ra `VERIFIED` se chan mot duong
   * may chu cho phep, con noi long cong `go` se bay mot nut chi de nhan 409.
   */
  it('da XAC THUC: khong go duoc nua, nhung VAN dinh them duoc', () => {
    const row = toDriverFuelSlipRows([driverFuelSlip({ verificationStatus: 'VERIFIED' })])[0]!;
    expect(row.canRemoveEvidence).toBe(false);
    expect(row.canAttachEvidence).toBe(true);
    expect(row.evidenceAttachLockedReason).toBeNull();
    // Cau giai thich phai noi CA hai ve — mot cau chi noi "khong go duoc" ben canh mot o tai anh
    // van dung duoc chinh la thu lam nguoi dung tuong man hinh hong.
    expect(row.evidenceLockedReason).toContain('không gỡ được');
    expect(row.evidenceLockedReason).toContain('vẫn đính thêm được');
  });

  it('ky doi soat DA CHOT: dong ca hai duong', () => {
    const row = toDriverFuelSlipRows([driverFuelSlip({ reconciliationStatus: 'SETTLED' })])[0]!;
    expect(row.canRemoveEvidence).toBe(false);
    expect(row.canAttachEvidence).toBe(false);
    expect(row.evidenceAttachLockedReason).toContain('đã chốt');
  });

  it('DA KHOP nhung ky chua chot: chua go duoc, van dinh them duoc', () => {
    const row = toDriverFuelSlipRows([driverFuelSlip({ reconciliationStatus: 'MATCHED' })])[0]!;
    expect(row.canRemoveEvidence).toBe(false);
    expect(row.canAttachEvidence).toBe(true);
  });

  it('phieu con moi thi ca hai duong deu mo', () => {
    const row = toDriverFuelSlipRows([driverFuelSlip()])[0]!;
    expect(row.canRemoveEvidence).toBe(true);
    expect(row.canAttachEvidence).toBe(true);
    expect(row.evidenceLockedReason).toBeNull();
    expect(row.evidenceAttachLockedReason).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Trang chu — `#340`: viec DUOC DIEU (vong chay) truoc, chuyen cu la loi phu
 * ------------------------------------------------------------------ */

const ready = <T>(data: T): DriverHomeRead<T> => ({
  data,
  isBlocked: false,
  errorMessage: null,
});
const loading = <T>(): DriverHomeRead<T> => ({
  data: undefined,
  isBlocked: false,
  errorMessage: null,
});
const failed = <T>(message: string): DriverHomeRead<T> => ({
  data: undefined,
  isBlocked: false,
  errorMessage: message,
});
/** Query bi chan tu dau — khach/vai khong co man Hien truong. */
const blocked = <T>(): DriverHomeRead<T> => ({
  data: undefined,
  isBlocked: true,
  errorMessage: null,
});

/** Mot chang co hang, CHUA bat dau, may chu chao `Da toi diem lay hang` — dung hinh dang that. */
const fieldLeg = (over: Partial<DriverFieldLeg> = {}): DriverFieldLeg => ({
  legId: 'leg-1',
  sequence: 1,
  kind: 'LOADED',
  originLabel: 'Hà Nội',
  destinationLabel: 'Hải Phòng',
  orderCode: 'ORD-1',
  orderId: 'ord-1',
  phase: 'PLANNED',
  recordedTypes: [],
  arrivalCheckpointId: null,
  waiting: null,
  documents: [],
  missingDocumentTypes: [],
  receiptHandover: null,
  nextActions: [
    {
      kind: 'CHECKPOINT',
      label: 'Đã tới điểm lấy hàng',
      checkpointType: 'PICKUP_ARRIVAL',
      requiresLocation: false,
      required: true,
    },
  ],
  ...over,
});

const fieldRun = (
  legs: readonly DriverFieldLeg[],
  over: Partial<DriverFieldRun> = {},
): DriverFieldRun => ({
  runId: 'run-1',
  runCode: 'VC-001',
  legs,
  ...over,
});

const fieldWork = (runs: readonly DriverFieldRun[]): DriverFieldWork => ({
  serverNow: '2026-09-22T03:00:00.000Z',
  runs,
});

/** Mac dinh: khach co DU hai man (Hien truong, Nhan viec) — dung goi `transport-preview`. */
const home = (over: Partial<DriverHomeInput> = {}): DriverHomeModel =>
  toDriverHome({
    runWork: ready(fieldWork([])),
    trips: ready([]),
    fund: null,
    canOpenField: true,
    canIntakeAtSite: true,
    ...over,
  });

const assignedRun = ready(fieldWork([fieldRun([fieldLeg()])]));

describe('trang chu lai xe — viec DUOC DIEU di truoc (#340)', () => {
  /**
   * DUNG LOI `#340` DOI SUA: lai xe duoc dieu mot vong chay THAT (man Hien truong thay no), nhung
   * trang chu chi doc `TransportTrip` nen noi "Chưa có chuyến nào được phân công cho bạn".
   */
  it('co vong chay that, KHONG co chuyen cu: trang chu noi CO viec va dua vao Hien truong', () => {
    const model = home({ runWork: assignedRun, trips: ready([]) });

    expect(model.source).toBe('RUN');
    expect(model.heading).toBe('Việc được điều từ văn phòng');
    expect(model.primary.kind).toBe('RUN_CURRENT');
    if (model.primary.kind !== 'RUN_CURRENT') return;
    expect(model.primary.card).toEqual({
      runCode: 'VC-001',
      legTitle: 'Chặng 1',
      route: 'Hà Nội → Hải Phòng',
      phaseLabel: 'Chưa bắt đầu',
      orderCode: 'ORD-1',
      nextStepLabel: 'Đã tới điểm lấy hàng',
    });
    // Cau dau tien tra loi "bay gio toi lam gi" — va noi ro lam O DAU.
    expect(model.primary.headline).toBe(
      'Việc kế tiếp: bấm “Đã tới điểm lấy hàng” ở màn Hiện trường.',
    );
    expect(model.openWorkCount).toBe(1);
    expect(JSON.stringify(model)).not.toContain('Chưa có chuyến nào được phân công');
  });

  /**
   * CHANG DANG LAM chon bang `toFieldScreen()` — DUNG luat cua man Hien truong. Trang chu khong
   * suy lai: mot chang da giao nhung chua chup bien nhan van la viec dang lam.
   */
  it('chang dang lam la chang ma man Hien truong cung mo, khong chon theo so thu tu', () => {
    const work = fieldWork([
      fieldRun([
        fieldLeg({ legId: 'leg-1', sequence: 1, nextActions: [] }),
        fieldLeg({
          legId: 'leg-2',
          sequence: 2,
          kind: 'EMPTY',
          orderCode: null,
          orderId: null,
          phase: 'DELIVERED',
          nextActions: [
            {
              kind: 'DOCUMENT',
              label: 'Chụp biên nhận giao hàng',
              documentType: 'DELIVERY_RECEIPT',
              requiresLocation: false,
              required: true,
            },
          ],
        }),
      ]),
    ]);
    const model = home({ runWork: ready(work) });
    const field = toFieldScreen(work);

    if (model.primary.kind !== 'RUN_CURRENT') throw new Error(model.primary.kind);
    expect(model.primary.card.legTitle).toBe(field.current?.title);
    expect(model.primary.card.legTitle).toBe('Chặng 2 — chạy rỗng');
    expect(model.primary.card.phaseLabel).toBe('Đã giao xong');
    expect(model.primary.card.orderCode).toBeNull();
    expect(model.primary.card.nextStepLabel).toBe('Chụp biên nhận giao hàng');
  });

  it('co CA chuyen cu dang chay lan vong chay: vong chay THANG, chuyen cu chi la loi phu', () => {
    const model = home({
      runWork: assignedRun,
      trips: ready([driverTrip({ status: 'IN_TRANSIT' })]),
    });

    expect(model.source).toBe('RUN');
    expect(model.primary.kind).toBe('RUN_CURRENT');
    expect(model.legacyTrip?.code).toBe('VT-2026-0912');
    expect(model.legacyTrip?.statusLabel).toBe('Đang chạy');
    // Nut doi trang thai Trip KHONG len trang chu khi vong chay la viec chinh: `Đã giao` o day se
    // bi doc thanh "da giao xong viec van phong vua dieu".
    expect('actions' in model.primary).toBe(false);
    // Van dem theo nguon dang quyet dinh — mot vong chay, khong cong chuyen cu vao.
    expect(model.openWorkCount).toBe(1);
  });

  it('KHONG co ca hai: trang thai rong THAT, khong bia ra viec nao', () => {
    const model = home({ runWork: ready(fieldWork([])), trips: ready([]) });

    expect(model.primary).toEqual({
      kind: 'NO_WORK',
      headline: 'Hiện chưa có việc nào được điều cho bạn.',
      detail: 'Việc văn phòng giao sẽ hiện ở đây và ở màn Hiện trường.',
    });
    expect(model.legacyTrip).toBeNull();
    expect(model.assignedNote).toBeNull();
    expect(model.openWorkCount).toBe(0);
  });

  /** Yeu cau 3 + 4 cua `#340`: Trip cu KHONG quyet dinh "co viec", va chi hien o loi phu. */
  it('CHI co chuyen cu: the chinh van la viec duoc dieu (chua co), chuyen cu nam o loi phu', () => {
    const model = home({
      runWork: ready(fieldWork([])),
      trips: ready([driverTrip({ status: 'PLANNED' })]),
    });

    expect(model.source).toBe('RUN');
    expect(model.primary.kind).toBe('NO_WORK');
    expect(model.legacyTrip?.code).toBe('VT-2026-0912');
    expect('actions' in model.primary).toBe(false);
  });

  it('doc chuyen cu hong khi viec duoc dieu dang hien: noi ra o loi phu, khong giau di', () => {
    const model = home({ runWork: assignedRun, trips: failed('Máy chủ đang bận') });
    expect(model.primary.kind).toBe('RUN_CURRENT');
    expect(model.legacyNotice).toBe('Chưa đọc được chuyến theo cách làm trước đây.');
  });

  it('doc viec duoc dieu HONG: khong bao gio doc thanh "khong co viec", ke ca khi Trip rong', () => {
    const model = home({ runWork: failed('Mất kết nối tạm thời'), trips: ready([]) });

    expect(model.primary).toEqual({ kind: 'FAILED', message: 'Mất kết nối tạm thời' });
    expect(model.siteIntakeHint).toBeNull();
    expect(model.openWorkCount).toBeNull();
  });

  it('dang doc viec duoc dieu: la "dang doc", khong phai "rong"', () => {
    const model = home({ runWork: loading(), trips: ready([]) });

    expect(model.primary).toEqual({
      kind: 'LOADING',
      label: 'Đang đọc việc được điều cho bạn…',
    });
    expect(model.openWorkCount).toBeNull();
  });

  /** Cung luat voi man Hien truong (`#333`): lam moi hong khong xoa mot lan doc tot. */
  it('lan lam moi hong sau mot lan doc tot: giu lan doc tot', () => {
    const model = home({
      runWork: { data: fieldWork([fieldRun([fieldLeg()])]), isBlocked: false, errorMessage: 'x' },
    });
    expect(model.primary.kind).toBe('RUN_CURRENT');
  });

  it('vong chay dang mo nhung het nut bam ngay: viec VAN con, khong phai "rong"', () => {
    const model = home({ runWork: ready(fieldWork([fieldRun([fieldLeg({ nextActions: [] })])])) });

    expect(model.primary).toEqual({
      kind: 'RUN_IDLE',
      headline: 'Đã làm xong mọi việc hiện trường của các chuyến đang chạy.',
      runCodes: ['VC-001'],
    });
    expect(model.openWorkCount).toBe(1);
  });

  it('hai vong chay dang mo thi dem hai, theo ma vong chay chu khong theo so chang', () => {
    const model = home({
      runWork: ready(
        fieldWork([
          fieldRun([fieldLeg({ legId: 'a1' }), fieldLeg({ legId: 'a2', sequence: 2 })]),
          fieldRun([fieldLeg({ legId: 'b1' })], { runId: 'run-2', runCode: 'VC-002' }),
        ]),
      ),
    });
    expect(model.openWorkCount).toBe(2);
  });

  it('man Hien truong khong mo cho nguoi nay: khong bao gio chi vao no', () => {
    const model = home({ runWork: assignedRun, canOpenField: false });
    expect(model.source).toBe('TRIP');
    expect(model.primary.kind).not.toBe('RUN_CURRENT');
  });
});

/**
 * HAI DUONG NHAN VIEC, va trang chu phai giu chung tach nhau — `#340` yeu cau 5 + 6.
 *
 * `Nhận việc` (tai diem, theo vi tri) la mot quy trinh RIENG. Viec van phong DA dieu thi khong phai
 * "nhan" lai o do; chi khi van phong chua dieu gi, trang chu moi chi toi no.
 */
describe('trang chu lai xe — hai duong nhan viec khong lan vao nhau (#340)', () => {
  it('viec da duoc dieu: noi ro KHONG can vao Nhan viec, va khong chao loi vao do', () => {
    const model = home({ runWork: assignedRun });
    expect(model.assignedNote).toBe(
      'Văn phòng đã giao việc này cho bạn — không cần vào Nhận việc để nhận lại.',
    );
    expect(model.siteIntakeHint).toBeNull();
  });

  it('vong chay het nut bam ngay van la viec da duoc dieu — cung khong day sang Nhan viec', () => {
    const model = home({ runWork: ready(fieldWork([fieldRun([fieldLeg({ nextActions: [] })])])) });
    expect(model.assignedNote).not.toBeNull();
    expect(model.siteIntakeHint).toBeNull();
  });

  it('chua co viec duoc dieu: chi toi Nhan viec tai diem nhu mot duong RIENG', () => {
    const model = home({ runWork: ready(fieldWork([])) });
    expect(model.siteIntakeHint).toBe(
      'Nếu bạn đang ở điểm lấy hàng mà văn phòng chưa giao việc, dùng Nhận việc để báo đã đến.',
    );
    expect(model.assignedNote).toBeNull();
  });

  it('khach khong bat Nhan viec thi khong nhac toi mot man khong ton tai', () => {
    expect(home({ runWork: assignedRun, canIntakeAtSite: false }).assignedNote).toBeNull();
    expect(
      home({ runWork: ready(fieldWork([])), canIntakeAtSite: false }).siteIntakeHint,
    ).toBeNull();
  });
});

/**
 * NHIEN LIEU — `#340` yeu cau 8, doc lai sau `#364`.
 *
 * Truoc `#364` man Nhien lieu lay xe tu chuyen dang mo, nen trang chu canh bao "phieu van ghi theo
 * chuyen" khi viec chi co vong chay. Tu `#364` o khai phieu doc CHINH viec duoc dieu
 * (`/transport/me/fuel/runs`): cau do nay la SAI, nen trang chu khong noi gi ve nhien lieu — va
 * cung khong bia mot chuyen nao.
 */
describe('trang chu lai xe — nhien lieu da khai theo viec duoc dieu (#340 sau #364)', () => {
  it('viec chi co vong chay, khong co chuyen cu: KHONG con bao "phieu van ghi theo chuyen"', () => {
    const model = home({ runWork: assignedRun, trips: ready([]) });

    expect(model.primary.kind).toBe('RUN_CURRENT');
    expect(model.legacyTrip).toBeNull();
    expect(model).not.toHaveProperty('fuelNotice');
    expect(JSON.stringify(model)).not.toContain('nhiên liệu');
  });
});

/**
 * KHACH CHUA CO MAN HIEN TRUONG — chuyen (Trip) la nguon viec DUY NHAT ma lai xe doc duoc.
 *
 * Tuyen `/transport/me/field-work` chi duoc gan khi khach bat `transport-checkpoint`. Khong co no
 * thi trang chu giu dung hop dong cu: the chuyen dang lam kem hai nut cua chinh no.
 */
describe('trang chu lai xe — khach chua co Hien truong (hop dong cu)', () => {
  const tripOnly = (over: Partial<DriverHomeInput> = {}): DriverHomeModel =>
    home({ runWork: blocked(), canOpenField: false, ...over });

  it('mot viec troi nhat kem thao tac cua chinh no', () => {
    const model = tripOnly({ trips: ready([driverTrip({ status: 'IN_TRANSIT' })]) });

    expect(model.source).toBe('TRIP');
    expect(model.heading).toBe('Chuyến hiện tại');
    if (model.primary.kind !== 'TRIP') throw new Error(model.primary.kind);
    expect(model.primary.card.code).toBe('VT-2026-0912');
    expect(model.primary.actions).toEqual([{ to: 'DELIVERED', label: 'Đã giao' }]);
    expect(model.primary.headline).toContain('Hà Nội → Thái Nguyên');
    expect(model.legacyTrip).toBeNull();
  });

  it('khong co chuyen thi noi thang la chua duoc phan cong', () => {
    const model = tripOnly({ trips: ready([]) });
    expect(model.primary).toEqual({
      kind: 'NO_WORK',
      headline: 'Hiện chưa có chuyến nào được phân công cho bạn.',
      detail: null,
    });
    expect(model.openWorkCount).toBe(0);
  });

  it('doc chuyen hong thi bao hong, dang doc thi noi dang doc', () => {
    expect(tripOnly({ trips: failed('Máy chủ đang bận') }).primary).toEqual({
      kind: 'FAILED',
      message: 'Máy chủ đang bận',
    });
    expect(tripOnly({ trips: loading() }).primary).toEqual({
      kind: 'LOADING',
      label: 'Đang đọc chuyến của bạn…',
    });
  });

  it('chi dem chuyen dang mo CUA CHINH MINH', () => {
    const model = tripOnly({
      trips: ready([
        driverTrip({ id: 'a', status: 'PLANNED', isCurrentAssignee: true }),
        driverTrip({ id: 'b', status: 'IN_TRANSIT', isCurrentAssignee: true }),
        driverTrip({ id: 'c', status: 'DELIVERED', isCurrentAssignee: true }),
        driverTrip({ id: 'd', status: 'PLANNED', isCurrentAssignee: false }),
      ]),
    });
    expect(model.openWorkCount).toBe(2);
  });
});

describe('trang chu lai xe — quy', () => {
  it('khach chua bat nghiep vu quy thi KHONG bia so du 0 dong', () => {
    expect(home({ runWork: assignedRun, fund: null }).fund).toBeNull();
  });

  it('so du quy doc theo THE DUNG, khong doc dau cua so', () => {
    const model = home({
      runWork: assignedRun,
      fund: fundStatement({ balance: -500_000, balanceStance: 'COMPANY_OWES_DRIVER' }),
    });
    expect(model.fund?.stanceLabel).toBe('Công ty đang nợ lái xe');
  });
});

/**
 * `INV-09` tren trang chu moi — `#340` yeu cau 7 + bai kiem (d).
 *
 * Do tren CA mo hinh, ke ca khi payload chuyen cu lo mot truong doanh thu: the chuyen chon tung
 * truong an toan, nen mot khoa tien lot vao dau vao van khong di ra man hinh.
 */
describe('trang chu lai xe — khong mot con so doanh thu nao (#340)', () => {
  const leaked = {
    ...driverTrip({ status: 'IN_TRANSIT' }),
    freightAmount: 11_500_000,
    marginAmount: 2_000_000,
  } as DriverTripView;

  it('viec duoc dieu + chuyen cu lo truong doanh thu: mo hinh van sach', () => {
    const model = home({ runWork: assignedRun, trips: ready([leaked]) });
    const text = JSON.stringify(model);

    expect(revenueFieldsIn(model)).toEqual([]);
    expect(revenueFieldsIn(model.primary)).toEqual([]);
    expect(revenueFieldsIn(model.legacyTrip)).toEqual([]);
    for (const money of ['freightAmount', 'marginAmount', '11500000', '2000000']) {
      expect(text, money).not.toContain(money);
    }
  });

  it('khach chua co Hien truong: the chuyen chinh cung sach', () => {
    const model = home({ runWork: blocked(), canOpenField: false, trips: ready([leaked]) });
    if (model.primary.kind !== 'TRIP') throw new Error(model.primary.kind);

    expect(revenueFieldsIn(model.primary.card)).toEqual([]);
    expect(JSON.stringify(model)).not.toContain('11500000');
  });
});

/**
 * `#313` — to khai hien lai DUNG nhung gi lai xe da ghi, va ly do soat noi bang cau.
 *
 * Truoc day ly do soat chi hien o be mat ke toan va o dang MA THO. Lai xe can biet phieu cua minh
 * dang bi hoi dieu gi — noi bang mot cau trung tinh, khong phai mot ma, khong phai mot loi buoc toi.
 */
describe('phieu dau cua chinh minh hien du truong da khai', () => {
  it('so hoa don, cach tra tien va ly do soat bang chu', () => {
    const [row] = toDriverFuelSlipRows([
      driverFuelSlip({
        paymentMethod: 'SUPPLIER_ACCOUNT',
        reviewReasons: ['ODOMETER_NOT_ADVANCED'],
      }),
    ]);

    expect(row).toMatchObject({
      invoiceNo: 'HD-001',
      paymentLabel: 'Ghi nợ cây xăng',
      reviewReasonLabels: ['Số km chưa tăng so với lần đổ trước'],
    });
  });

  it('ma ly do chua co nhan van hien nguyen van thay vi bien mat', () => {
    const [row] = toDriverFuelSlipRows([driverFuelSlip({ reviewReasons: ['MA_MOI_CUA_MAY_CHU'] })]);

    expect(row?.reviewReasonLabels).toEqual(['MA_MOI_CUA_MAY_CHU']);
  });
});
