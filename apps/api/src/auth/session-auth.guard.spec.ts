import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthService } from './auth.service.js';
import { RolesGuard } from './roles.guard.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { ALLOW_DURING_PASSWORD_CHANGE_KEY } from './password-change.decorator.js';

function context(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => (): void => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('session authorization guards', () => {
  const previousAuthMode = process.env.AUTH_MODE;
  const previousSessionSecret = process.env.SESSION_SECRET;
  const reflector = {
    getAllAndOverride: vi.fn(),
  } as unknown as Reflector;
  const user = {
    id: 'sale-1',
    username: 'sale.one',
    name: 'Sale One',
    email: null,
    phone: null,
    role: 'SALE' as const,
    credentialVersion: 1,
    disabledAt: null,
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    lastLoginAt: null,
    passwordChangedAt: null,
  };
  const auth = { validateSession: vi.fn(async () => user) } as unknown as AuthService;

  beforeEach(() => {
    process.env.AUTH_MODE = 'session';
    process.env.SESSION_SECRET = 's'.repeat(48);
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (previousAuthMode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = previousAuthMode;
    if (previousSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSessionSecret;
  });

  it('rejects a request without a session identity', async () => {
    const guard = new SessionAuthGuard(reflector, auth);
    reflector.getAllAndOverride = vi.fn(() => false);

    await expect(guard.canActivate(context({ session: {} }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('loads the current user and rejects stale credential versions', async () => {
    const guard = new SessionAuthGuard(reflector, auth);
    reflector.getAllAndOverride = vi.fn(() => false);
    const request = {
      session: { user: { userId: user.id, credentialVersion: 1 } },
    };

    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request).toHaveProperty('authUser', user);

    auth.validateSession = vi.fn(async () => null);
    await expect(guard.canActivate(context(request))).rejects.toThrow(UnauthorizedException);
  });

  /*
   * #395: tai khoan dang dung MAT KHAU TAM chi lam duoc ba viec (xem minh, doi mat khau, dang xuat).
   * Moi route khac — REST, SSE, tai tep — deu qua guard nay nen deu bi chan o day.
   */
  it('mat khau tam: route thuong -> 403 PASSWORD_CHANGE_REQUIRED; route co dau -> qua', async () => {
    const pending = { ...user, mustChangePassword: true };
    auth.validateSession = vi.fn(async () => pending);
    const guard = new SessionAuthGuard(reflector, auth);
    const request = { session: { user: { userId: user.id, credentialVersion: 1 } } };

    reflector.getAllAndOverride = vi.fn(() => false);
    const denied = guard.canActivate(context(request));
    await expect(denied).rejects.toThrow(ForbiddenException);
    await denied.catch((error: { getResponse: () => unknown }) => {
      expect(error.getResponse()).toMatchObject({
        statusCode: 403,
        reason: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Bạn cần đổi mật khẩu tạm trước khi tiếp tục.',
      });
    });
    expect(request).not.toHaveProperty('authUser');

    reflector.getAllAndOverride = vi.fn(
      (key: unknown) => key === ALLOW_DURING_PASSWORD_CHANGE_KEY,
    ) as unknown as Reflector['getAllAndOverride'];
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(request).toHaveProperty('authUser', pending);
  });

  it('allows api-key mode to retain backwards compatibility', async () => {
    process.env.AUTH_MODE = 'api-key';
    const guard = new SessionAuthGuard(reflector, auth);
    await expect(guard.canActivate(context({}))).resolves.toBe(true);
  });

  it('denies SALE when a route requires MANAGER or ADMIN', () => {
    const guard = new RolesGuard(reflector);
    reflector.getAllAndOverride = vi.fn(() => ['MANAGER', 'ADMIN']);

    expect(() => guard.canActivate(context({ authUser: user }))).toThrow(ForbiddenException);
  });
});
