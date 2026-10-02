import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `#376` — HAI LENH VAN PHONG tren duong truyen: tien chang va xac nhan don giao xong.
 *
 * Do DUNG thu may chu nhan (duong dan, than yeu cau) va DUNG thu man hinh doc lai khi bi tu choi
 * (`reason` co kieu cua `#168 B7`). Mot bai e2e voi may chu gia khong do duoc hai dieu nay: may chu
 * gia chap nhan bat cu than nao no duoc viet de chap nhan.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIENT_FILE = resolve(HERE, '../transport-api.ts');

vi.mock('../../../lib/auth', () => ({
  authFetch: vi.fn(),
}));
vi.mock('../../../lib/api-base', () => ({
  publicApiBase: () => 'https://api.test',
}));

const { authFetch } = await import('../../../lib/auth');
const { TransportApiError, transportApi } = await import('../transport-api');

const respond = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const lastCall = (): { readonly url: string; readonly body: unknown } => {
  const call = vi.mocked(authFetch).mock.calls.at(-1);
  if (call === undefined) throw new Error('khong co lan goi nao');
  const [url, init] = call as [string, RequestInit | undefined];
  return { url, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) };
};

describe('#376 — lenh van phong tren duong truyen', () => {
  beforeEach(() => {
    vi.mocked(authFetch).mockReset();
  });

  it('tien chang: dung duong cua RunsController, than CHI co `to` khi khong ghi de', async () => {
    vi.mocked(authFetch).mockResolvedValue(respond({ leg: {}, closure: {} }));
    await transportApi.movement.transitionLeg('run 1', 'leg/2', { to: 'IN_TRANSIT' });

    const { url, body } = lastCall();
    expect(url).toBe('https://api.test/transport/runs/run%201/legs/leg%2F2/transition');
    // `.strict()` o may chu: mot `overrideReason: undefined` lot vao than la dau hieu than tu dap.
    expect(body).toEqual({ to: 'IN_TRANSIT' });
  });

  it('ghi de: `overrideReason` di kem, dung nguyen van nguoi dung ghi', async () => {
    vi.mocked(authFetch).mockResolvedValue(respond({ leg: {}, closure: {} }));
    await transportApi.movement.transitionLeg('run-1', 'leg-2', {
      to: 'COMPLETED',
      overrideReason: 'Người nhận xác nhận qua điện thoại',
    });
    expect(lastCall().body).toEqual({
      to: 'COMPLETED',
      overrideReason: 'Người nhận xác nhận qua điện thoại',
    });
  });

  it('giao xong don: `POST /transport/orders/:id/transition` voi `FULFILLED`', async () => {
    vi.mocked(authFetch).mockResolvedValue(respond({ id: 'ord-1', status: 'FULFILLED' }));
    await transportApi.movement.fulfilOrder('ord-1');
    expect(lastCall()).toEqual({
      url: 'https://api.test/transport/orders/ord-1/transition',
      body: { to: 'FULFILLED' },
    });
  });

  it('bi tu choi: loi giu `reason` CO KIEU va cau cua may chu', async () => {
    vi.mocked(authFetch).mockResolvedValue(
      respond(
        {
          statusCode: 403,
          message:
            'Hien truong chua ghi nguoi nhan da nhan hang — chua hoan tat duoc chang co hang',
          error: 'Forbidden',
          reason: 'LEG_FIELD_DELIVERY_NOT_RECORDED',
        },
        403,
      ),
    );

    const failure = await transportApi.movement
      .transitionLeg('run-1', 'leg-2', { to: 'COMPLETED' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(TransportApiError);
    expect(failure).toMatchObject({ status: 403, reason: 'LEG_FIELD_DELIVERY_NOT_RECORDED' });
  });

  it('guard quyen (`#395`): `reason` CO KIEU `ACTION_NOT_PERMITTED` va cau co dau cua may chu', async () => {
    vi.mocked(authFetch).mockResolvedValue(
      respond(
        {
          statusCode: 403,
          message: 'Bạn không có quyền thực hiện thao tác này.',
          error: 'Forbidden',
          reason: 'ACTION_NOT_PERMITTED',
          detail: { action: 'transport.run.manage' },
        },
        403,
      ),
    );
    const failure = await transportApi.movement
      .transitionLeg('run-1', 'leg-2', { to: 'IN_TRANSIT' })
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({
      status: 403,
      reason: 'ACTION_NOT_PERMITTED',
      message: 'Bạn không có quyền thực hiện thao tác này.',
    });
  });

  it('than 403 khong co `reason` (may chu cu): `reason` la null — man hinh hien nguyen van', async () => {
    vi.mocked(authFetch).mockResolvedValue(
      respond({ statusCode: 403, message: 'Forbidden resource', error: 'Forbidden' }, 403),
    );
    const failure = await transportApi.movement
      .transitionLeg('run-1', 'leg-2', { to: 'IN_TRANSIT' })
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ reason: null, message: 'Forbidden resource' });
  });
});

/**
 * KHONG CO LENH DONG VONG CHAY TREN WEB — `#293` R1, `#376`.
 *
 * Duong ghi duy nhat vao `POST /transport/runs/:id/transition` cua client la `startRun` voi
 * `ACTIVE`. Bai doc thang ma nguon: mot ngay ai do them `{ to: 'COMPLETED' }` vao duong do, bai nay
 * do truoc khi mot nut "Đóng vòng chạy" kip len man hinh.
 */
describe('#376 — web khong co duong nao dong vong chay', () => {
  it('moi lan gui toi `/transport/runs/:id/transition` chi mang `ACTIVE`', () => {
    const source = readFileSync(CLIENT_FILE, 'utf8');
    const runTransitions = [
      ...source.matchAll(/\/transport\/runs\/\$\{[^}]+\}\/transition`,\s*(\{[^}]*\})/g),
    ].map((match) => match[1]);
    expect(runTransitions).toEqual(["{ to: 'ACTIVE' }"]);
  });

  it('khong duong nao cua client goi `/closure` bang POST (be mat chan doan chi doc)', () => {
    const source = readFileSync(CLIENT_FILE, 'utf8');
    expect(source).not.toMatch(/send\(\s*'POST',\s*`[^`]*\/closure`/);
  });
});
