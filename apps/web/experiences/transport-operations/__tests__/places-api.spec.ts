import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `#379` — DIA DIEM va TAO DON tren duong truyen.
 *
 * Do DUNG thu may chu nhan: duong dan, phuong thuc, than yeu cau. May chu gia cua e2e chap nhan bat
 * cu than nao no duoc viet de chap nhan — con may chu that dung `.strict()`, nen mot truong thua
 * trong than la mot lan 400. Va than tim kiem chi duoc mang CHUOI nguoi dung go: khong mot ma khach,
 * ma don hay ma nguoi dung nao di ra nha cung cap ngoai.
 */

vi.mock('../../../lib/auth', () => ({
  authFetch: vi.fn(),
}));
vi.mock('../../../lib/api-base', () => ({
  publicApiBase: () => 'https://api.test',
}));

const { authFetch } = await import('../../../lib/auth');
const { transportApi } = await import('../transport-api');

const respond = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const lastCall = (): {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
} => {
  const call = vi.mocked(authFetch).mock.calls.at(-1);
  if (call === undefined) throw new Error('khong co lan goi nao');
  const [url, init] = call as [string, RequestInit | undefined];
  return {
    url,
    method: init?.method ?? 'GET',
    body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
  };
};

describe('#379 — dia diem tren duong truyen', () => {
  beforeEach(() => {
    vi.mocked(authFetch).mockReset();
  });

  it('dia diem da biet: GET, khong tham so', async () => {
    vi.mocked(authFetch).mockResolvedValue(respond({ available: true, places: [] }));
    const result = await transportApi.places.known();

    expect(lastCall()).toMatchObject({
      url: 'https://api.test/transport/places/known',
      method: 'GET',
    });
    expect(result).toEqual({ available: true, places: [] });
  });

  it('tim: POST, than CHI co chuoi nguoi dung go', async () => {
    vi.mocked(authFetch).mockResolvedValue(
      respond({ status: 'OK', reason: null, results: [], attribution: null, fromCache: false }),
    );
    await transportApi.places.search('Khu công nghiệp Đình Vũ');

    const { url, method, body } = lastCall();
    expect(url).toBe('https://api.test/transport/places/search');
    expect(method).toBe('POST');
    expect(body).toEqual({ query: 'Khu công nghiệp Đình Vũ' });
  });

  it('tim nguoc: POST, than CHI co hai so toa do', async () => {
    vi.mocked(authFetch).mockResolvedValue(
      respond({ status: 'DISABLED', reason: 'PROVIDER_UNCONFIGURED', result: null }),
    );
    const point = { latitude: 20.8264, longitude: 106.7752, label: 'khong duoc di theo' };
    const result = await transportApi.places.reverse(point);

    const { url, method, body } = lastCall();
    expect(url).toBe('https://api.test/transport/places/reverse');
    expect(method).toBe('POST');
    expect(body).toEqual({ latitude: 20.8264, longitude: 106.7752 });
    // That bai cua nha cung cap la mot TRANG THAI trong than 200, khong phai mot loi nem ra.
    expect(result.status).toBe('DISABLED');
  });
});

describe('#379 — tao don mang hai toa do', () => {
  beforeEach(() => {
    vi.mocked(authFetch).mockReset();
  });

  it('than tao don co originPoint/destinationPoint dung nhu da chon', async () => {
    vi.mocked(authFetch).mockResolvedValue(respond({ id: 'ord-1' }, 201));
    await transportApi.movement.createOrder({
      code: 'DH-379',
      originLabel: 'Nhà máy thép Đình Vũ',
      destinationLabel: 'Kho Nhựa Tân Phú Hưng',
      originPoint: { latitude: 20.8264, longitude: 106.7752 },
      destinationPoint: { latitude: 21.617, longitude: 105.817 },
      businessDate: '2026-09-23',
      customerId: 'cus-1',
      freightAmount: 5_000_000,
      cargoDescription: null,
    });

    const { url, method, body } = lastCall();
    expect(url).toBe('https://api.test/transport/orders');
    expect(method).toBe('POST');
    expect(body).toEqual({
      code: 'DH-379',
      originLabel: 'Nhà máy thép Đình Vũ',
      destinationLabel: 'Kho Nhựa Tân Phú Hưng',
      originPoint: { latitude: 20.8264, longitude: 106.7752 },
      destinationPoint: { latitude: 21.617, longitude: 105.817 },
      businessDate: '2026-09-23',
      customerId: 'cus-1',
      freightAmount: 5_000_000,
      cargoDescription: null,
    });
  });
});
