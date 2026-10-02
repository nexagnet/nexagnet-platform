import { describe, expect, it } from 'vitest';
import type { KnownPlace, PlaceSearchResponse } from '../../transport-types';
import {
  accuracyPhrase,
  accuracyRing,
  boundsOfPoints,
  checkSearchQuery,
  formatCoordinates,
  formatStraightLine,
  groupKnownPlaces,
  initialPickerBounds,
  isNearlySamePoint,
  knownPlaceSourceLine,
  pickerCameraFor,
  PICKER_POINT_ZOOM,
  LOCATING_MESSAGE,
  POSITION_FAILURE_MESSAGE,
  positionStatusText,
  SEARCH_BUSY_MESSAGE,
  SEARCH_DISABLED_MESSAGE,
  SEARCH_EMPTY_MESSAGE,
  SEARCH_UNAVAILABLE_MESSAGE,
  searchOutcomeOf,
  straightLineKm,
  VIETNAM_PICKER_BOUNDS,
} from '../place-lookup';

/*
 * `#379` — tim va chon dia diem. Ham thuan: khong mang, khong DOM. Toa do chi la toa do khi nguoi
 * dung bam chon; khong mot ham nao o day doan toa do tu chu.
 */

const HA_NOI = { latitude: 21.0285, longitude: 105.8542 };
const HAI_PHONG = { latitude: 20.8449, longitude: 106.6881 };

const place = (over: Partial<KnownPlace>): KnownPlace => ({
  id: 'geo-1',
  kind: 'DEPOT',
  name: 'Bãi xe Hà Nội',
  detail: null,
  point: HA_NOI,
  radiusMetres: 250,
  ...over,
});

const response = (over: Partial<PlaceSearchResponse>): PlaceSearchResponse => ({
  status: 'OK',
  reason: null,
  results: [],
  attribution: null,
  fromCache: false,
  ...over,
});

describe('chuoi tim kiem', () => {
  it('gom khoang trang va cat hai dau, GIU dau tieng Viet', () => {
    expect(checkSearchQuery('  Khu   công nghiệp  Đình Vũ ')).toEqual({
      ok: true,
      query: 'Khu công nghiệp Đình Vũ',
    });
  });

  it('it hon 2 ky tu thi khong gui', () => {
    const check = checkSearchQuery(' a ');
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.message).toContain('ít nhất 2 ký tự');
  });

  it('dai qua 200 ky tu thi khong gui (may chu tu choi bang 400)', () => {
    expect(checkSearchQuery('x'.repeat(201)).ok).toBe(false);
    expect(checkSearchQuery('x'.repeat(200)).ok).toBe(true);
  });
});

describe('trang thai tim -> MOT cau, moi trang thai mot cau', () => {
  it('bon trang thai, bon cau khac nhau', () => {
    expect(
      searchOutcomeOf(response({ status: 'DISABLED', reason: 'PROVIDER_UNCONFIGURED' })),
    ).toEqual({
      message: SEARCH_DISABLED_MESSAGE,
      isProblem: true,
    });
    expect(searchOutcomeOf(response({ status: 'BUSY', reason: 'PROVIDER_BUSY' })).message).toBe(
      SEARCH_BUSY_MESSAGE,
    );
    expect(
      searchOutcomeOf(response({ status: 'UNAVAILABLE', reason: 'PROVIDER_UNAVAILABLE' })).message,
    ).toBe(SEARCH_UNAVAILABLE_MESSAGE);
    expect(searchOutcomeOf(response({}))).toEqual({
      message: SEARCH_EMPTY_MESSAGE,
      isProblem: false,
    });
    const messages = new Set([
      SEARCH_DISABLED_MESSAGE,
      SEARCH_BUSY_MESSAGE,
      SEARCH_UNAVAILABLE_MESSAGE,
      SEARCH_EMPTY_MESSAGE,
    ]);
    expect(messages.size).toBe(4);
  });

  it('tat tim kiem van chi ra ba cach chon khac', () => {
    expect(SEARCH_DISABLED_MESSAGE).toContain('bản đồ');
    expect(SEARCH_DISABLED_MESSAGE).toContain('địa điểm đã biết');
    expect(SEARCH_DISABLED_MESSAGE).toContain('vị trí của bạn');
  });

  it('co ket qua thi noi so ket qua', () => {
    const outcome = searchOutcomeOf(
      response({ results: [{ label: 'A', address: null, point: HA_NOI }] }),
    );
    expect(outcome).toEqual({
      message: 'Tìm thấy 1 địa điểm. Chọn một kết quả để đặt điểm.',
      isProblem: false,
    });
  });
});

describe('dia diem da biet', () => {
  it('nhom theo viec: bai xe, kho khach hang, nha may/kho doi tac; nhom rong khong hien', () => {
    const groups = groupKnownPlaces([
      place({ id: 'b', kind: 'COUNTERPARTY_SITE', name: 'Nhà máy thép Đình Vũ' }),
      place({ id: 'a', kind: 'DEPOT', name: 'Bãi xe Hà Nội' }),
      // `#395` §2.1 — kho cua KHACH HANG la mot `COUNTERPARTY_SITE`; may chu noi nhan cua no.
      place({
        id: 'c',
        kind: 'COUNTERPARTY_SITE',
        name: 'Kho Nhựa Tân Phú Hưng',
        kindLabel: 'Địa điểm khách hàng',
      }),
      // Hang rao `CUSTOMER` kieu cu: may chu cu khong tra nhan — duong lui noi DUNG ten may chu moi.
      place({ id: 'd', kind: 'CUSTOMER', name: 'Kho cũ Hưng Yên' }),
    ]);
    expect(groups.map((group) => [group.title, group.places.map((entry) => entry.id)])).toEqual([
      ['Bãi xe', ['a']],
      ['Địa điểm khách hàng', ['c']],
      ['Nhà máy / kho đối tác', ['b']],
      ['Điểm khách hàng (kiểu cũ)', ['d']],
    ]);
    expect(groupKnownPlaces([])).toEqual([]);
  });

  it('dong nguon noi ten CHU cua moi loai khi co (#395) — tru bai xe cua chinh cong ty', () => {
    expect(knownPlaceSourceLine('COUNTERPARTY_SITE', ' Công ty CP Thép Đông Á ')).toBe(
      'Nhà máy / kho đối tác của Công ty CP Thép Đông Á',
    );
    expect(knownPlaceSourceLine('COUNTERPARTY_SITE', null)).toBe('Nhà máy / kho đối tác');
    expect(knownPlaceSourceLine('CUSTOMER', 'Công ty A')).toBe(
      'Điểm khách hàng (kiểu cũ) của Công ty A',
    );
    expect(knownPlaceSourceLine('CUSTOMER', 'Công ty A', 'Điểm khách hàng (kiểu cũ)')).toBe(
      'Điểm khách hàng (kiểu cũ) của Công ty A',
    );
    expect(knownPlaceSourceLine('COUNTERPARTY_SITE', 'Công ty A', 'Địa điểm khách hàng')).toBe(
      'Địa điểm khách hàng của Công ty A',
    );
    expect(knownPlaceSourceLine('DEPOT', 'Vận tải Việt')).toBe('Bãi xe');
  });
});

describe('duong chim bay — KHONG phai quang duong', () => {
  it('Ha Noi - Hai Phong xap xi 90 km theo duong thang', () => {
    const km = straightLineKm(HA_NOI, HAI_PHONG);
    expect(km).toBeGreaterThan(85);
    expect(km).toBeLessThan(95);
  });

  it('dinh dang theo do lon', () => {
    expect(formatStraightLine(98.4)).toBe('≈ 98 km');
    expect(formatStraightLine(4.24)).toBe('≈ 4,2 km');
    expect(formatStraightLine(0.04)).toBe('≈ 40 m');
    expect(formatStraightLine(1234.4)).toBe('≈ 1.234 km');
  });

  it('hai diem gan nhu trung (< 100 m) — canh bao mem', () => {
    expect(isNearlySamePoint(HA_NOI, { latitude: 21.0289, longitude: 105.8542 })).toBe(true);
    expect(isNearlySamePoint(HA_NOI, { latitude: 21.03, longitude: 105.8542 })).toBe(false);
  });

  it('toa do de doi chieu: 5 chu so le, dau cham', () => {
    expect(formatCoordinates({ latitude: 20.8264, longitude: 106.7752 })).toBe(
      '20.82640, 106.77520',
    );
  });
});

describe('khung nhin cua cong cu chon', () => {
  it('khong co diem nao thi khung Viet Nam — khung cua CONG CU, khong phai du lieu', () => {
    expect(boundsOfPoints([])).toBeNull();
    expect(initialPickerBounds([])).toEqual(VIETNAM_PICKER_BOUNDS);
    expect(pickerCameraFor(null).kind).toBe('FIT');
  });

  it('co dia diem da biet thi mo o bao cua chung', () => {
    expect(
      initialPickerBounds([place({ point: HA_NOI }), place({ id: 'g2', point: HAI_PHONG })]),
    ).toEqual([105.8542, 20.8449, 106.6881, 21.0285]);
  });

  it('mot diem duy nhat thi canh giua o muc phong du thay cong kho', () => {
    expect(pickerCameraFor([105.8, 21, 105.8, 21])).toEqual({
      kind: 'CENTER',
      longitude: 105.8,
      latitude: 21,
      zoom: PICKER_POINT_ZOOM,
    });
  });

  it('khung hong (NaN, nguoc) thi van mo ra, khong chet', () => {
    expect(pickerCameraFor([Number.NaN, 0, 1, 1]).kind).toBe('FIT');
  });
});

describe('vi tri trinh duyet — mot goi y, khong phai bang chung', () => {
  it('sai so lam tron toi 5 m', () => {
    expect(accuracyPhrase(34)).toBe('sai số khoảng ±35 m');
    expect(accuracyPhrase(1)).toBe('sai số khoảng ±5 m');
    expect(accuracyPhrase(1234)).toBe('sai số khoảng ±1.235 m');
    expect(accuracyPhrase(null)).toBe('không rõ sai số');
    expect(accuracyPhrase(Number.NaN)).toBe('không rõ sai số');
  });

  it('ba cach hong, ba cau, cau nao cung chi ra cach khac', () => {
    expect(POSITION_FAILURE_MESSAGE.DENIED).toContain('Bật quyền vị trí');
    for (const message of Object.values(POSITION_FAILURE_MESSAGE)) {
      expect(message).toContain('bản đồ');
    }
  });

  it('vung trang thai vi tri: rong khi chua bam, roi dang lay / da co / loi', () => {
    expect(positionStatusText({ status: 'IDLE' })).toBe('');
    expect(positionStatusText({ status: 'LOCATING' })).toBe(LOCATING_MESSAGE);
    expect(positionStatusText({ status: 'FOUND', point: HA_NOI, accuracyMetres: 34 })).toBe(
      'Đã có vị trí của bạn, sai số khoảng ±35 m. Chọn đặt làm điểm lấy hàng hoặc điểm giao hàng.',
    );
    expect(positionStatusText({ status: 'FAILED', message: POSITION_FAILURE_MESSAGE.DENIED })).toBe(
      POSITION_FAILURE_MESSAGE.DENIED,
    );
  });

  it('vong sai so la mot polygon kin quanh diem', () => {
    const ring = accuracyRing(HA_NOI, 100, 16);
    const coordinates = ring.geometry.coordinates[0] as number[][];
    expect(coordinates).toHaveLength(17);
    expect(coordinates[0]).toEqual(coordinates[16]);
    const [lng, lat] = coordinates[4] as [number, number];
    expect(lng).toBeCloseTo(HA_NOI.longitude, 6);
    expect((lat - HA_NOI.latitude) * 111_320).toBeCloseTo(100, 0);
  });
});
