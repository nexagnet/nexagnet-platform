import { describe, expect, it } from 'vitest';
import {
  NOMINATIM_SEARCH_LIMIT,
  buildNominatimReverseUrl,
  buildNominatimSearchUrl,
  parseNominatimReverse,
  parseNominatimSearch,
  type NominatimConfig,
} from './nominatim.js';

const CONFIG: NominatimConfig = {
  baseUrl: 'https://nominatim.example.test',
  userAgent: 'NexagnetTransport/1.0 (+https://example.test)',
  contactEmail: null,
};

/** Doc lai tham so cua URL — so sanh TAP khoa, de mot khoa la lot vao la do ngay. */
const paramsOf = (url: string): Record<string, string> =>
  Object.fromEntries(new URL(url).searchParams.entries());

describe('URL tim kiem Nominatim', () => {
  /**
   * Danh sach tham so di ra ngoai la DONG. Bai nay khang dinh CA tap khoa bang `toEqual`, nen mot
   * `tenant=`, `userId=` hay `orderId=` them vao sau nay se lam do bai nay, khong lang le di ra ngoai.
   */
  it('chi gui dung nam tham so, khong mot khoa nao khac', () => {
    const url = buildNominatimSearchUrl(CONFIG, 'Khu công nghiệp Đình Vũ Hải Phòng');

    expect(new URL(url).origin + new URL(url).pathname).toBe(
      'https://nominatim.example.test/search',
    );
    expect(paramsOf(url)).toEqual({
      q: 'Khu công nghiệp Đình Vũ Hải Phòng',
      format: 'jsonv2',
      'accept-language': 'vi,en',
      countrycodes: 'vn',
      limit: String(NOMINATIM_SEARCH_LIMIT),
    });
  });

  /**
   * Chuoi tieng Viet co dau phai ma hoa UTF-8 dung: `Đ` la `%C4%90`. Mot chuoi ma hoa sai se ra
   * "khong tim thay" cho moi dia danh co dau — tuc hau het dia danh Viet Nam.
   */
  it('ma hoa chuoi Unicode dung chuan, khong de lot ky tu tho', () => {
    const url = buildNominatimSearchUrl(CONFIG, 'Khu công nghiệp Đình Vũ Hải Phòng');

    expect(url).toContain(
      'q=Khu+c%C3%B4ng+nghi%E1%BB%87p+%C4%90%C3%ACnh+V%C5%A9+H%E1%BA%A3i+Ph%C3%B2ng',
    );
    expect(url).not.toMatch(/[^\x21-\x7E]/u);
  });

  it('ky tu dac biet cua URL trong chuoi tim khong tach duoc thanh tham so moi', () => {
    const url = buildNominatimSearchUrl(CONFIG, 'Kho A&B=1 #2');

    expect(paramsOf(url)['q']).toBe('Kho A&B=1 #2');
    expect(Object.keys(paramsOf(url)).sort()).toEqual(
      ['accept-language', 'countrycodes', 'format', 'limit', 'q'].sort(),
    );
  });

  it('email LIEN HE cua nguoi van hanh chi di kem khi duoc khai', () => {
    const url = buildNominatimSearchUrl({ ...CONFIG, contactEmail: 'ops@example.test' }, 'Dinh Vu');

    expect(paramsOf(url)['email']).toBe('ops@example.test');
    expect(Object.keys(paramsOf(url))).toHaveLength(6);
  });
});

describe('URL tim nguoc Nominatim', () => {
  it('chi gui toa do lam tron 5 chu so + tham so co dinh', () => {
    const url = buildNominatimReverseUrl(CONFIG, {
      latitude: 20.8264012345,
      longitude: 106.77520987,
    });

    expect(new URL(url).pathname).toBe('/reverse');
    expect(paramsOf(url)).toEqual({
      lat: '20.82640',
      lon: '106.77521',
      format: 'jsonv2',
      'accept-language': 'vi,en',
      zoom: '17',
    });
  });
});

describe('doc phan hoi /search', () => {
  it('lay `name` lam nhan va `display_name` lam dia chi', () => {
    const parsed = parseNominatimSearch([
      {
        lat: '20.8264',
        lon: '106.7752',
        name: 'Khu công nghiệp Đình Vũ',
        display_name: 'Khu công nghiệp Đình Vũ, Hải An, Hải Phòng, Việt Nam',
      },
    ]);

    expect(parsed).toEqual([
      {
        label: 'Khu công nghiệp Đình Vũ',
        address: 'Khu công nghiệp Đình Vũ, Hải An, Hải Phòng, Việt Nam',
        point: { latitude: 20.8264, longitude: 106.7752 },
      },
    ]);
  });

  it('khong co `name` -> doan dau cua `display_name` lam nhan', () => {
    const parsed = parseNominatimSearch([
      { lat: '21.0285', lon: '105.8542', name: '', display_name: 'Phố Huế, Hai Bà Trưng, Hà Nội' },
    ]);

    expect(parsed?.[0]?.label).toBe('Phố Huế');
    expect(parsed?.[0]?.address).toBe('Phố Huế, Hai Bà Trưng, Hà Nội');
  });

  /**
   * Toa do hong KHONG thanh mot cham "hop le": chuoi rong (Number('') = 0), ngoai bien, Null
   * Island, chu. Moi muc hong bi bo, cac muc tot van ve.
   */
  it('bo muc co toa do hong qua `parseGeoPoint`, giu muc tot', () => {
    const parsed = parseNominatimSearch([
      { lat: '', lon: '', name: 'Rong' },
      { lat: '95', lon: '105', name: 'Ngoai bien' },
      { lat: '0', lon: '0', name: 'Null Island' },
      { lat: 'abc', lon: '105', name: 'Chu' },
      { lat: '21.5', lon: '105.8', name: 'Tot' },
      'khong phai object',
      null,
    ]);

    expect(parsed?.map((candidate) => candidate.label)).toEqual(['Tot']);
  });

  it('bo muc khong co ten lan dia chi', () => {
    expect(parseNominatimSearch([{ lat: '21.5', lon: '105.8' }])).toEqual([]);
  });

  it('than khong phai mang -> `null` (sai hinh dang, khong phai "khong tim thay")', () => {
    expect(parseNominatimSearch({ error: 'x' })).toBeNull();
    expect(parseNominatimSearch(null)).toBeNull();
    expect(parseNominatimSearch('[]')).toBeNull();
    expect(parseNominatimSearch([])).toEqual([]);
  });

  it('khong tra qua gioi han so ket qua', () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      lat: String(21 + index / 100),
      lon: '105.8',
      name: `Diem ${index}`,
    }));

    expect(parseNominatimSearch(many)).toHaveLength(NOMINATIM_SEARCH_LIMIT);
  });
});

describe('doc phan hoi /reverse', () => {
  it('mot object hop le -> mot goi y', () => {
    expect(
      parseNominatimReverse({
        lat: '21.61700',
        lon: '105.81700',
        name: 'Quốc lộ 3',
        display_name: 'Quốc lộ 3, Thái Nguyên, Việt Nam',
      }),
    ).toEqual({
      ok: true,
      candidate: {
        label: 'Quốc lộ 3',
        address: 'Quốc lộ 3, Thái Nguyên, Việt Nam',
        point: { latitude: 21.617, longitude: 105.817 },
      },
    });
  });

  it('`{ error }` -> khong co ten o day, van la ket qua hop le', () => {
    expect(parseNominatimReverse({ error: 'Unable to geocode' })).toEqual({
      ok: true,
      candidate: null,
    });
  });

  it('than khong phai object -> sai hinh dang', () => {
    expect(parseNominatimReverse([])).toEqual({ ok: false });
    expect(parseNominatimReverse(null)).toEqual({ ok: false });
  });
});
