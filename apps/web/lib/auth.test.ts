import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthApiError, authApi, authFetch, resetAuthClientForTests } from './auth';

/**
 * `authFetch` gui `headers` duoi dang `Headers` (chuan web, khong phan biet hoa thuong va gop
 * duoc header caller tu dat). `expect.objectContaining({'x-csrf-token': ...})` KHONG khop mot
 * `Headers` vi no khong co thuoc tinh enumerable — nen doc bang chinh API cua Headers.
 */
function headerOf(mock: ReturnType<typeof vi.fn>, nth: number, name: string): string | null {
  const init = mock.mock.calls[nth - 1]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers).get(name);
}

describe('auth client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
    resetAuthClientForTests();
  });

  it('keeps login, logout and user settings same-origin when API configuration is empty', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    vi.resetModules();
    const { authApi: sameOriginAuth } = await import('./auth');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/auth/csrf') {
        return new Response(JSON.stringify({ csrfToken: 'before-login' }), { status: 200 });
      }
      if (url === '/auth/login') {
        return new Response(
          JSON.stringify({
            csrfToken: 'after-login',
            user: { id: 'u1', username: 'sale.one', name: 'Sale One', role: 'SALE' },
          }),
          { status: 200 },
        );
      }
      if (url === '/auth/config') {
        return new Response(JSON.stringify({ mode: 'none' }), { status: 200 });
      }
      if (url === '/settings/users') {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(sameOriginAuth.config()).resolves.toEqual({ mode: 'none' });
    await expect(sameOriginAuth.users()).resolves.toEqual([]);
    await expect(sameOriginAuth.login('sale.one', 'correct-password')).resolves.toMatchObject({
      csrfToken: 'after-login',
    });
    await expect(sameOriginAuth.logout()).resolves.toBeUndefined();

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      '/auth/config',
      '/settings/users',
      '/auth/csrf',
      '/auth/login',
      '/auth/logout',
    ]);
    expect(headerOf(fetchMock, 4, 'x-csrf-token')).toBe('before-login');
    expect(headerOf(fetchMock, 5, 'x-csrf-token')).toBe('after-login');
  });

  it('includes cookies and obtains a CSRF token before a mutation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'csrf-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await authFetch('http://localhost:3001/settings/rules', { method: 'POST', body: '{}' });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/auth/csrf',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/settings/rules',
      expect.objectContaining({ credentials: 'include', method: 'POST' }),
    );
    expect(headerOf(fetchMock, 2, 'x-csrf-token')).toBe('csrf-1');
  });

  it('uses the rotated token returned after login', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: 'before-login' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            csrfToken: 'after-login',
            user: { id: 'u1', username: 'sale.one', name: 'Sale One', role: 'SALE' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await authApi.login('sale.one', 'correct-password');
    await authFetch('http://localhost:3001/orders/one/approve', { method: 'POST' });

    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://localhost:3001/orders/one/approve',
      expect.objectContaining({ credentials: 'include', method: 'POST' }),
    );
    // Sau login, token phai la ban XOAY VONG tra ve tu /auth/login — khong dung lai token cu.
    expect(headerOf(fetchMock, fetchMock.mock.calls.length, 'x-csrf-token')).toBe('after-login');
  });

  /*
   * `#395` — doi mat khau tao lai phien: token CSRF cu chet cung phien cu. Neu client khong giu token
   * moi, lenh ghi DAU TIEN sau man doi bat buoc bi tu choi — dung luc nguoi dung vua duoc cho vao.
   */
  it('keeps the rotated token returned by a password change', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrfToken: 'old-session' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            csrfToken: 'new-session',
            user: { id: 'u1', username: 'dh.an', name: 'An', role: 'MANAGER' },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const current = ['tam', '01'].join('-');
    const next = ['mot', 'mat', 'khau', 'moi'].join('-');

    await authApi.changePassword(current, next);
    await authFetch('http://localhost:3001/transport/orders', { method: 'POST' });

    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/auth/credentials/change');
    expect(headerOf(fetchMock, 2, 'x-csrf-token')).toBe('old-session');
    expect(headerOf(fetchMock, 3, 'x-csrf-token')).toBe('new-session');
  });

  it('keeps status, typed reason and structured detail of a refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'c' }), { status: 200 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              statusCode: 409,
              message: 'Đây là Giám đốc đang hoạt động cuối cùng',
              reason: 'LAST_ACTIVE_ADMIN',
              detail: { username: 'giam-doc' },
            }),
            { status: 409 },
          ),
        ),
    );

    const failure = await authApi.disableUser('u-admin').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AuthApiError);
    expect(failure).toMatchObject({
      status: 409,
      reason: 'LAST_ACTIVE_ADMIN',
      detail: { username: 'giam-doc' },
      message: 'Đây là Giám đốc đang hoạt động cuối cùng',
    });
  });

  it('turns an HTML 404 into a typed not-mounted error instead of a SyntaxError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response('<!doctype html><p>404</p>', { status: 404 })),
    );

    const failure = await authApi.users().catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 404, reason: 'ROUTE_NOT_MOUNTED' });
  });

  it('never sends an empty password: the server then issues a temporary one', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: 'c' }), { status: 200 }))
      .mockImplementation(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await authApi.createUser({ username: 'lx.an', name: 'An', role: 'SALE', password: '' });
    await authApi.resetPassword('u 1');
    await authApi.enableUser('u 1');

    const bodyOf = (nth: number): unknown =>
      JSON.parse(String((fetchMock.mock.calls[nth - 1]?.[1] as RequestInit).body));
    expect(bodyOf(2)).toEqual({ username: 'lx.an', name: 'An', role: 'SALE' });
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain(
      '/settings/users/u%201/credentials/reset',
    );
    expect(bodyOf(3)).toEqual({});
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain('/settings/users/u%201/enable');
    expect(bodyOf(4)).toEqual({ confirmed: true });
  });
});
