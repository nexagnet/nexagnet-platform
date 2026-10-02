import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './auth.types.js';
import { ALLOW_DURING_PASSWORD_CHANGE_KEY } from './password-change.decorator.js';

// Xem ghi chu o auth.service.spec.ts: hang so de bo quet bi mat pre-commit khong bao dong gia.
const VALID_PW = 'correct-password';

const USER: AuthenticatedUser = {
  id: 'user-1',
  username: 'sale.one',
  name: 'Sale One',
  email: null,
  phone: null,
  role: 'SALE',
  credentialVersion: 3,
  disabledAt: null,
  createdAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-12T00:00:00.000Z',
  lastLoginAt: null,
  passwordChangedAt: null,
};

describe('AuthController', () => {
  it('regenerates the session before storing identity and returns a fresh CSRF token', async () => {
    let didRegenerate = false;
    const session = {
      regenerate: vi.fn((done: (error?: unknown) => void) => {
        didRegenerate = true;
        done();
      }),
      save: vi.fn((done: (error?: unknown) => void) => done()),
      destroy: vi.fn(),
    };
    const request = { session } as unknown as Request;
    const auth = {
      authenticate: vi.fn(async () => {
        expect(didRegenerate).toBe(false);
        return USER;
      }),
    } as unknown as AuthService;
    const controller = new AuthController(auth);

    const result = await controller.login({ username: USER.username, password: VALID_PW }, request);

    expect(session.regenerate).toHaveBeenCalledOnce();
    expect(request.session.user).toEqual({ userId: USER.id, credentialVersion: 3 });
    expect(result).toMatchObject({ user: USER, csrfToken: expect.any(String) });
  });

  it('destroys the session and clears its cookie on logout', async () => {
    const request = {
      authUser: USER,
      session: { destroy: vi.fn((done: (error?: unknown) => void) => done()) },
    } as unknown as Request;
    const response = { clearCookie: vi.fn() } as unknown as Response;
    const auth = { recordLogout: vi.fn(async () => undefined) } as unknown as AuthService;
    const controller = new AuthController(auth);

    await controller.logout(request, response);

    expect(request.session.destroy).toHaveBeenCalledOnce();
    expect(response.clearCookie).toHaveBeenCalled();
  });

  /*
   * #395: `/auth/me` tra tap quyen HIEU LUC do may chu tinh — man hinh khong tu suy tu vai.
   */
  it('me tra nguoi dung + tap quyen hieu luc cua may chu', () => {
    const auth = {
      currentAccess: vi.fn((user: AuthenticatedUser) => ({
        user,
        roles: ['SALE', 'MANAGER', 'ACCOUNTING', 'ADMIN'],
        permissions: ['kho.phieu.read'],
      })),
    } as unknown as AuthService;
    const controller = new AuthController(auth);
    const result = controller.me({ authUser: USER } as unknown as Request);
    expect(result).toEqual({
      user: USER,
      roles: ['SALE', 'MANAGER', 'ACCOUNTING', 'ADMIN'],
      permissions: ['kho.phieu.read'],
    });
  });

  it('chi ba route mo khi dang dung mat khau tam: me, doi mat khau, dang xuat', () => {
    const prototype = AuthController.prototype as unknown as Record<string, object>;
    const open = Object.getOwnPropertyNames(prototype).filter(
      (name) =>
        Reflect.getMetadata(ALLOW_DURING_PASSWORD_CHANGE_KEY, prototype[name] as object) === true,
    );
    expect(open.sort()).toEqual(['changePassword', 'logout', 'me']);
  });
});
