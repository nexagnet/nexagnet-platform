import { describe, expect, it } from 'vitest';
import type { KnownPlace, PlaceCandidate } from '../../transport-types';
import {
  buildCreateOrderInput,
  choiceFromBrowserPosition,
  choiceFromKnownPlace,
  choiceFromSearchResult,
  createdNotice,
  createOrderErrorMessage,
  draftReducer,
  EMPTY_DRAFT,
  emptyDetails,
  ENDPOINT_MARKER_KEY,
  isDraftDirty,
  isNameLocked,
  MAP_POINT_PENDING_NAME,
  MAP_POINT_UNNAMED,
  missingRequirements,
  missingSentence,
  parseFreight,
  pickerMarkers,
  sourceLineOf,
  type DraftAction,
  type OrderDetailsDraft,
  type OrderDraft,
} from '../order-draft';
import { order } from './fixtures';

/*
 * `#379` — BAN NHAP DON MOI. Mot quy tac duy nhat ("moi thu ban chon di vao o dang chon"), mot
 * ngoai le co noi ra (tu chuyen sang dau con trong), va mot ma luot cho moi lan bam ban do.
 */

const DINH_VU: KnownPlace = {
  id: 'geo-dinh-vu',
  kind: 'COUNTERPARTY_SITE',
  name: 'Nhà máy thép Đình Vũ',
  detail: 'Công ty CP Thép Đông Á',
  point: { latitude: 20.8264, longitude: 106.7752 },
  radiusMetres: 300,
};

const DEPOT: KnownPlace = {
  id: 'geo-depot',
  kind: 'DEPOT',
  name: 'Bãi xe Hà Nội',
  detail: null,
  point: { latitude: 20.9652, longitude: 105.8468 },
  radiusMetres: 250,
};

const RESULT: PlaceCandidate = {
  label: 'Khu công nghiệp Đình Vũ',
  address: 'Đông Hải 2, Hải An, Hải Phòng',
  point: { latitude: 20.8301, longitude: 106.7613 },
};

const run = (actions: readonly DraftAction[], start: OrderDraft = EMPTY_DRAFT): OrderDraft =>
  actions.reduce(draftReducer, start);

const DETAILS: OrderDetailsDraft = {
  code: 'DH-379-01',
  customerId: 'cus-1',
  businessDate: '2026-09-23',
  freightAmount: '5000000',
  cargoDescription: '  ',
};

describe('mot quy tac: moi thu ban chon di vao o dang chon', () => {
  it('mo be mat thi o dang chon la Lay hang', () => {
    expect(EMPTY_DRAFT.active).toBe('ORIGIN');
    expect(EMPTY_DRAFT.origin).toBeNull();
    expect(EMPTY_DRAFT.destination).toBeNull();
  });

  it('dat diem LAY khi GIAO con trong -> tu chuyen sang GIAO va NOI ra', () => {
    const draft = run([{ type: 'PLACE_CHOSEN', choice: choiceFromSearchResult(RESULT) }]);
    expect(draft.origin?.point).toEqual(RESULT.point);
    expect(draft.origin?.name).toBe('Khu công nghiệp Đình Vũ');
    expect(draft.active).toBe('DESTINATION');
    expect(draft.announcement).toBe('Đã đặt điểm lấy hàng. Tiếp theo: điểm giao hàng.');
  });

  it('dat diem GIAO khi LAY con trong -> tu chuyen nguoc ve LAY', () => {
    const draft = run([
      { type: 'SELECT_ENDPOINT', endpoint: 'DESTINATION' },
      { type: 'PLACE_CHOSEN', choice: choiceFromKnownPlace(DINH_VU) },
    ]);
    expect(draft.destination?.point).toEqual(DINH_VU.point);
    expect(draft.origin).toBeNull();
    expect(draft.active).toBe('ORIGIN');
    expect(draft.announcement).toBe('Đã đặt điểm giao hàng. Tiếp theo: điểm lấy hàng.');
  });

  it('du hai dau thi dung YEN o dau vua dat — khong doan', () => {
    const draft = run([
      { type: 'PLACE_CHOSEN', choice: choiceFromSearchResult(RESULT) },
      { type: 'PLACE_CHOSEN', choice: choiceFromKnownPlace(DINH_VU) },
      { type: 'SELECT_ENDPOINT', endpoint: 'ORIGIN' },
      { type: 'PLACE_CHOSEN', choice: choiceFromKnownPlace(DEPOT) },
    ]);
    expect(draft.origin?.name).toBe('Bãi xe Hà Nội');
    expect(draft.destination?.name).toBe('Nhà máy thép Đình Vũ');
    expect(draft.active).toBe('ORIGIN');
  });

  it('vi tri cua toi noi RO o dich: "Đặt làm điểm giao hàng" vao GIAO du o dang chon la LAY', () => {
    const draft = run([
      {
        type: 'PLACE_CHOSEN',
        endpoint: 'DESTINATION',
        choice: choiceFromBrowserPosition({ latitude: 21.03, longitude: 105.85 }, 35),
      },
    ]);
    expect(draft.origin).toBeNull();
    expect(draft.destination?.point).toEqual({ latitude: 21.03, longitude: 105.85 });
    expect(draft.active).toBe('ORIGIN');
  });

  it('xoa mot dau thi o dang chon quay ve dau do', () => {
    const draft = run([
      { type: 'PLACE_CHOSEN', choice: choiceFromSearchResult(RESULT) },
      { type: 'PLACE_CHOSEN', choice: choiceFromKnownPlace(DINH_VU) },
      { type: 'CLEARED', endpoint: 'ORIGIN' },
    ]);
    expect(draft.origin).toBeNull();
    expect(draft.destination).not.toBeNull();
    expect(draft.active).toBe('ORIGIN');
    expect(draft.announcement).toBe('Đã xoá điểm lấy hàng.');
  });

  it('khong sua ban nhap cu (bat bien)', () => {
    const before = EMPTY_DRAFT;
    const after = draftReducer(before, {
      type: 'PLACE_CHOSEN',
      choice: choiceFromKnownPlace(DEPOT),
    });
    expect(before.origin).toBeNull();
    expect(after).not.toBe(before);
  });
});

describe('bam ban do: toa do NGAY, ten sau — va ma luot chan ket qua ve muon', () => {
  const picked = { latitude: 21.0, longitude: 105.8 };

  it('bam ban do dat toa do ngay voi ten tam', () => {
    const draft = run([{ type: 'MAP_PICKED', point: picked, token: 1 }]);
    expect(draft.origin?.point).toEqual(picked);
    expect(draft.origin?.name).toBe(MAP_POINT_PENDING_NAME);
    expect(draft.origin?.lookupToken).toBe(1);
    expect(sourceLineOf(draft.origin!).detail).toBe('Đang tìm tên địa điểm…');
  });

  it('tim nguoc tra ten -> thay ten tam, giu dung toa do da bam', () => {
    const draft = run([
      { type: 'MAP_PICKED', point: picked, token: 1 },
      { type: 'REVERSE_SETTLED', token: 1, candidate: RESULT },
    ]);
    expect(draft.origin?.name).toBe('Khu công nghiệp Đình Vũ');
    expect(draft.origin?.point).toEqual(picked);
    expect(draft.origin?.lookupToken).toBeNull();
    expect(sourceLineOf(draft.origin!)).toEqual({
      source: 'Chọn trên bản đồ',
      detail: 'Đông Hải 2, Hải An, Hải Phòng',
    });
  });

  it('tim nguoc tat/hong -> van la mot diem hop le, ten goi y dat ten', () => {
    const draft = run([
      { type: 'MAP_PICKED', point: picked, token: 1 },
      { type: 'REVERSE_SETTLED', token: 1, candidate: null },
    ]);
    expect(draft.origin?.name).toBe(MAP_POINT_UNNAMED);
    expect(sourceLineOf(draft.origin!).detail).toContain('Đặt tên');
  });

  it('ket qua CU ve muon khong ghi de lan bam MOI', () => {
    const draft = run([
      { type: 'MAP_PICKED', point: picked, token: 1 },
      { type: 'CLEARED', endpoint: 'ORIGIN' },
      { type: 'MAP_PICKED', point: { latitude: 20.5, longitude: 106.1 }, token: 2 },
      { type: 'REVERSE_SETTLED', token: 1, candidate: RESULT },
    ]);
    expect(draft.origin?.name).toBe(MAP_POINT_PENDING_NAME);
    expect(draft.origin?.lookupToken).toBe(2);
  });

  it('nguoi dung da tu go ten -> tim nguoc KHONG ghi de', () => {
    const draft = run([
      { type: 'MAP_PICKED', point: picked, token: 1 },
      { type: 'RENAMED', endpoint: 'ORIGIN', name: 'Cổng số 2 kho Đình Vũ' },
      { type: 'REVERSE_SETTLED', token: 1, candidate: RESULT },
    ]);
    expect(draft.origin?.name).toBe('Cổng số 2 kho Đình Vũ');
  });

  it('sua ten khong bao gio cham vao toa do', () => {
    const draft = run([
      { type: 'PLACE_CHOSEN', choice: choiceFromKnownPlace(DINH_VU) },
      { type: 'RENAMED', endpoint: 'ORIGIN', name: 'Kho thép' },
    ]);
    expect(draft.origin?.point).toEqual(DINH_VU.point);
  });

  it('keo ghim = toa do moi, nguon "Chỉnh trên bản đồ", huy lan tim nguoc dang cho', () => {
    const moved = { latitude: 21.001, longitude: 105.801 };
    const draft = run([
      { type: 'MAP_PICKED', point: picked, token: 1 },
      { type: 'POINT_DRAGGED', endpoint: 'ORIGIN', point: moved },
      { type: 'REVERSE_SETTLED', token: 1, candidate: RESULT },
    ]);
    expect(draft.origin?.point).toEqual(moved);
    expect(draft.origin?.name).toBe(MAP_POINT_UNNAMED);
    expect(sourceLineOf(draft.origin!).source).toBe('Chỉnh trên bản đồ');
  });

  it('keo ghim cua mot dia diem da chon giu nguyen ten', () => {
    const draft = run([
      { type: 'PLACE_CHOSEN', choice: choiceFromKnownPlace(DINH_VU) },
      {
        type: 'POINT_DRAGGED',
        endpoint: 'ORIGIN',
        point: { latitude: 20.827, longitude: 106.776 },
      },
    ]);
    expect(draft.origin?.name).toBe('Nhà máy thép Đình Vũ');
    expect(draft.announcement).toBe('Đã chỉnh điểm lấy hàng trên bản đồ.');
  });
});

describe('dong nguon tren phieu tuyen', () => {
  it('nha may noi ten phap nhan so huu', () => {
    const draft = run([{ type: 'PLACE_CHOSEN', choice: choiceFromKnownPlace(DINH_VU) }]);
    expect(sourceLineOf(draft.origin!).source).toBe(
      'Nhà máy / kho đối tác của Công ty CP Thép Đông Á',
    );
  });

  it('kho cua khach hang noi nhan may chu tinh (#395 §2.1)', () => {
    const draft = run([
      {
        type: 'PLACE_CHOSEN',
        choice: choiceFromKnownPlace({ ...DINH_VU, kindLabel: 'Địa điểm khách hàng' }),
      },
    ]);
    expect(sourceLineOf(draft.origin!).source).toBe(
      'Địa điểm khách hàng của Công ty CP Thép Đông Á',
    );
  });

  it('bai xe noi "Bãi xe"', () => {
    const draft = run([{ type: 'PLACE_CHOSEN', choice: choiceFromKnownPlace(DEPOT) }]);
    expect(sourceLineOf(draft.origin!).source).toBe('Bãi xe');
  });

  it('vi tri trinh duyet noi sai so va noi ro no chi la goi y', () => {
    const draft = run([
      {
        type: 'PLACE_CHOSEN',
        choice: choiceFromBrowserPosition({ latitude: 21, longitude: 105 }, 34),
      },
    ]);
    const line = sourceLineOf(draft.origin!);
    expect(line.source).toBe('Vị trí trình duyệt, sai số khoảng ±35 m');
    expect(line.detail).toContain('không phải bằng chứng');
  });
});

describe('con thieu gi — liet ke THAT, theo thu tu tren man hinh', () => {
  it('ban nhap rong thieu du moi thu', () => {
    expect(missingRequirements(EMPTY_DRAFT, emptyDetails(''))).toEqual([
      'điểm lấy hàng',
      'điểm giao hàng',
      'mã đơn',
      'khách hàng',
      'ngày vận hành',
      'cước',
    ]);
  });

  it('chi go chu, chua chon diem nao -> van thieu hai diem', () => {
    const missing = missingRequirements(EMPTY_DRAFT, DETAILS);
    expect(missing).toEqual(['điểm lấy hàng', 'điểm giao hàng']);
    expect(buildCreateOrderInput(EMPTY_DRAFT, DETAILS).ok).toBe(false);
  });

  it('ten tren don bi xoa trang -> thieu ten, du toa do co san', () => {
    const draft = run([
      { type: 'PLACE_CHOSEN', choice: choiceFromKnownPlace(DEPOT) },
      { type: 'PLACE_CHOSEN', choice: choiceFromKnownPlace(DINH_VU) },
      { type: 'RENAMED', endpoint: 'DESTINATION', name: '   ' },
    ]);
    expect(missingRequirements(draft, DETAILS)).toEqual(['tên điểm giao hàng']);
  });

  it('ten dai qua 200 ky tu la thieu', () => {
    const draft = run([
      { type: 'PLACE_CHOSEN', choice: choiceFromKnownPlace(DEPOT) },
      { type: 'PLACE_CHOSEN', choice: choiceFromKnownPlace(DINH_VU) },
      // Diem GIAO (nha may) — ten bai xe o diem lay da khoa tu `#395` §2.3.
      { type: 'RENAMED', endpoint: 'DESTINATION', name: 'x'.repeat(201) },
    ]);
    expect(missingRequirements(draft, DETAILS)).toEqual(['tên điểm giao hàng']);
  });

  it('cau "Còn thiếu" doc len duoc', () => {
    expect(missingSentence(['điểm giao hàng', 'cước'])).toBe('Còn thiếu: điểm giao hàng, cước.');
    expect(missingSentence([])).toBe('Đủ thông tin để tạo đơn.');
  });

  it('cuoc la so nguyen dong >= 1', () => {
    expect(parseFreight('5000000')).toBe(5_000_000);
    expect(parseFreight(' 12 ')).toBe(12);
    expect(parseFreight('0')).toBeNull();
    expect(parseFreight('5.000.000')).toBeNull();
    expect(parseFreight('-3')).toBeNull();
    expect(parseFreight('')).toBeNull();
    expect(parseFreight('9'.repeat(20))).toBeNull();
  });
});

describe('than yeu cau tao don', () => {
  it('toa do di NGUYEN nhu nguoi dung chon; nhan la ten da cat khoang trang', () => {
    const draft = run([
      { type: 'PLACE_CHOSEN', choice: choiceFromSearchResult(RESULT) },
      { type: 'PLACE_CHOSEN', choice: choiceFromKnownPlace(DEPOT) },
      { type: 'RENAMED', endpoint: 'ORIGIN', name: '  KCN Đình Vũ, cổng 3  ' },
    ]);
    const built = buildCreateOrderInput(draft, { ...DETAILS, code: ' DH-379-01 ' });
    expect(built).toEqual({
      ok: true,
      input: {
        code: 'DH-379-01',
        originLabel: 'KCN Đình Vũ, cổng 3',
        destinationLabel: 'Bãi xe Hà Nội',
        originPoint: { latitude: 20.8301, longitude: 106.7613 },
        destinationPoint: { latitude: 20.9652, longitude: 105.8468 },
        businessDate: '2026-09-23',
        customerId: 'cus-1',
        freightAmount: 5_000_000,
        cargoDescription: null,
      },
    });
  });

  it('than khong mang them truong nao ngoai hop dong (may chu `.strict()`)', () => {
    const draft = run([
      { type: 'PLACE_CHOSEN', choice: choiceFromSearchResult(RESULT) },
      { type: 'PLACE_CHOSEN', choice: choiceFromKnownPlace(DEPOT) },
    ]);
    const built = buildCreateOrderInput(draft, { ...DETAILS, cargoDescription: 'Thép cuộn' });
    if (!built.ok) throw new Error('phai du');
    expect(Object.keys(built.input).sort()).toEqual(
      [
        'businessDate',
        'cargoDescription',
        'code',
        'customerId',
        'destinationLabel',
        'destinationPoint',
        'freightAmount',
        'originLabel',
        'originPoint',
      ].sort(),
    );
    expect(Object.keys(built.input.originPoint).sort()).toEqual(['latitude', 'longitude']);
    expect(built.input.cargoDescription).toBe('Thép cuộn');
  });
});

describe('quay lai danh sach + thong bao sau khi tao', () => {
  it('chua nhap gi thi khong hoi; nhap mot thu la hoi', () => {
    expect(isDraftDirty(EMPTY_DRAFT, emptyDetails('2026-09-23'), '2026-09-23')).toBe(false);
    expect(
      isDraftDirty(EMPTY_DRAFT, { ...emptyDetails('2026-09-23'), code: 'A' }, '2026-09-23'),
    ).toBe(true);
    const withPoint = run([{ type: 'PLACE_CHOSEN', choice: choiceFromKnownPlace(DEPOT) }]);
    expect(isDraftDirty(withPoint, emptyDetails('2026-09-23'), '2026-09-23')).toBe(true);
  });

  it('thong bao noi ma don va hai dau tuyen', () => {
    expect(
      createdNotice(
        order({ code: 'DH-9', originLabel: 'Kho Hải Phòng', destinationLabel: 'Ninh Bình' }),
      ),
    ).toBe('Đã tạo đơn DH-9 — lấy tại Kho Hải Phòng, giao tại Ninh Bình.');
  });
});

describe('loi may chu khi tao don', () => {
  it('toa do diem lay bi tu choi -> cau co dau, noi DUNG diem can chon lai', () => {
    expect(
      createOrderErrorMessage({
        message: 'Toa do diem lay hang khong hop le (LATITUDE_OUT_OF_RANGE).',
        reason: 'ORDER_ORIGIN_POINT_INVALID',
      }),
    ).toBe('Toạ độ điểm lấy hàng không hợp lệ — chọn lại điểm trên bản đồ.');
  });

  it('toa do diem giao bi tu choi -> cau cho diem giao', () => {
    expect(
      createOrderErrorMessage({
        message: 'Toa do diem giao hang khong hop le (NULL_ISLAND).',
        reason: 'ORDER_DESTINATION_POINT_INVALID',
      }),
    ).toBe('Toạ độ điểm giao hàng không hợp lệ — chọn lại điểm trên bản đồ.');
  });

  it('loi khac giu NGUYEN VAN cau cua may chu', () => {
    expect(
      createOrderErrorMessage({ message: 'Mã đơn DH-1 đã tồn tại.', reason: 'ORDER_CODE_TAKEN' }),
    ).toBe('Mã đơn DH-1 đã tồn tại.');
    expect(createOrderErrorMessage(new Error('Mạng hỏng'))).toBe('Mạng hỏng');
  });
});

describe('ghim tren ban do chon diem', () => {
  it('ve dia diem da biet duoi cung, hai diem LAY/GIAO tren cung, moi ghim co chu', () => {
    const draft = run([
      { type: 'PLACE_CHOSEN', choice: choiceFromSearchResult(RESULT) },
      { type: 'PLACE_CHOSEN', choice: choiceFromKnownPlace(DINH_VU) },
    ]);
    const markers = pickerMarkers({
      draft,
      knownPlaces: [DEPOT, DINH_VU],
      searchResults: [RESULT],
      highlightedResult: 0,
      myPosition: { latitude: 21, longitude: 105.8 },
    });
    expect(markers.map((marker) => marker.kind)).toEqual([
      'DEPOT',
      'COUNTERPARTY_SITE',
      'SEARCH_RESULT',
      'MY_POSITION',
      'ORIGIN',
      'DESTINATION',
    ]);
    const origin = markers.find((marker) => marker.key === ENDPOINT_MARKER_KEY.ORIGIN);
    expect(origin?.badge).toBe('Lấy');
    expect(origin?.label).toBe('Điểm lấy hàng: Khu công nghiệp Đình Vũ');
    expect(origin?.isDraggable).toBe(true);
    const destination = markers.find((marker) => marker.key === ENDPOINT_MARKER_KEY.DESTINATION);
    expect(destination?.badge).toBe('Giao');
    expect(markers.find((marker) => marker.kind === 'SEARCH_RESULT')).toMatchObject({
      badge: '1',
      isHighlighted: true,
      label: 'Kết quả 1: Khu công nghiệp Đình Vũ',
    });
    for (const marker of markers) expect(marker.label.length).toBeGreaterThan(0);
  });

  it('chi ghim diem lay/giao keo duoc', () => {
    const markers = pickerMarkers({
      draft: EMPTY_DRAFT,
      knownPlaces: [DEPOT],
      searchResults: [RESULT],
      highlightedResult: null,
      myPosition: null,
    });
    expect(markers.every((marker) => !marker.isDraggable)).toBe(true);
  });
});

/*
 * `#395` §2.3 — TEN BAI XE KHOA tren don. Khau lap ke hoach nhan ra chang rong va "xe da ve bai"
 * bang DUNG ten bai trong "Địa điểm vận hành"; mot ten go tay la mot chang rong gia.
 */
describe('ten bai xe lay tu Dia diem van hanh', () => {
  it('chon bai xe → ten khoa; go ten khong doi gi', () => {
    const chosen = run([{ type: 'PLACE_CHOSEN', choice: choiceFromKnownPlace(DEPOT) }]);
    expect(isNameLocked(chosen.origin!)).toBe(true);
    const renamed = draftReducer(chosen, { type: 'RENAMED', endpoint: 'ORIGIN', name: 'Bãi khác' });
    expect(renamed.origin?.name).toBe(DEPOT.name);
    expect(renamed).toBe(chosen);
  });

  it('nha may/kho van sua ten duoc; keo ghim bai xe di cho khac thi het khoa', () => {
    const site = run([{ type: 'PLACE_CHOSEN', choice: choiceFromKnownPlace(DINH_VU) }]);
    expect(isNameLocked(site.origin!)).toBe(false);
    const moved = run([
      { type: 'PLACE_CHOSEN', choice: choiceFromKnownPlace(DEPOT) },
      { type: 'POINT_DRAGGED', endpoint: 'ORIGIN', point: { latitude: 21, longitude: 105.9 } },
    ]);
    expect(isNameLocked(moved.origin!)).toBe(false);
  });
});
