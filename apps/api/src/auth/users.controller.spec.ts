import { RequestMethod } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';
import { ROLES_KEY } from './roles.decorator.js';
import { UsersController } from './users.controller.js';
import { errorBodyOf } from './__tests__/account-fixtures.js';

/**
 * HOP DONG ROUTE cua quan tri tai khoan (`#395`).
 *
 * Ba dieu chi bai nay giu:
 *   1. MOI route nam duoi `/settings/users` hoac `/auth` — hai tien to ma edge Caddy da cong. Mot
 *      tien to moi (vd `/access`) se roi xuong Next.js va tra 404 tren ban deploy.
 *   2. Route TINH (`permission-catalog`, `suggest-username`) khai TRUOC moi route `:id`.
 *   3. Ca controller chi Giam doc: khong route nao ghi de `@Roles` cua lop.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const CADDYFILE = readFileSync(resolve(HERE, '../../../../deploy/netviet/edge/Caddyfile'), 'utf8');

const METHOD_METADATA = 'method';
const PATH_METADATA = 'path';

interface Route {
  readonly handler: string;
  readonly method: RequestMethod;
  readonly path: string;
}

function routesOf(controller: NewableFunction): Route[] {
  const prefix = String(Reflect.getMetadata(PATH_METADATA, controller));
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor' && typeof prototype[name] === 'function')
    .flatMap((name) => {
      const handler = prototype[name] as object;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (method === undefined) return [];
      const sub = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '/');
      const path = `/${prefix}/${sub}`.replace(/\/+/g, '/').replace(/\/$/, '');
      return [{ handler: name, method, path }];
    });
}

describe('UsersController — hop dong route (#395)', () => {
  const routes = routesOf(UsersController);

  it('du 12 route cua quan tri tai khoan', () => {
    expect(routes.map((route) => `${RequestMethod[route.method]} ${route.path}`)).toEqual([
      'GET /settings/users',
      'GET /settings/users/permission-catalog',
      'POST /settings/users/suggest-username',
      'POST /settings/users',
      'PATCH /settings/users/:id',
      'GET /settings/users/:id/access',
      'PUT /settings/users/:id/access',
      'PATCH /settings/users/:id/role',
      'POST /settings/users/:id/disable',
      'POST /settings/users/:id/enable',
      'POST /settings/users/:id/credentials/reset',
      'GET /settings/users/:id/history',
    ]);
  });

  it('route tinh khai truoc moi route `:id`', () => {
    const firstParam = routes.findIndex((route) => route.path.includes(':id'));
    const statics = routes
      .map((route, index) => ({ route, index }))
      .filter(({ route }) => !route.path.includes(':id'));
    for (const { route, index } of statics) {
      expect(index, route.path).toBeLessThan(firstParam);
    }
  });

  it('moi route nam duoi tien to edge Caddy da cong (`/settings/users*`, `/auth*`)', () => {
    const matcher = CADDYFILE.match(/@api path ([^\r\n]+)/)?.[1]?.split(/\s+/) ?? [];
    expect(matcher).toContain('/settings/users*');
    expect(matcher).toContain('/auth*');
    for (const route of [...routes, ...routesOf(AuthController)]) {
      expect(
        route.path.startsWith('/settings/users') || route.path.startsWith('/auth'),
        route.path,
      ).toBe(true);
    }
  });

  it('ca controller chi Giam doc — khong route nao ghi de vai cua lop', () => {
    const reflector = new Reflector();
    expect(reflector.get(ROLES_KEY, UsersController)).toEqual(['ADMIN']);
    const prototype = UsersController.prototype as unknown as Record<string, object>;
    for (const route of routes) {
      expect(
        reflector.get(ROLES_KEY, prototype[route.handler] as never),
        route.handler,
      ).toBeUndefined();
    }
  });

  it('chuyen dung nguoi goi + ma tai khoan cho dich vu; ma rong → 400 ACCOUNT_INPUT_INVALID', async () => {
    const auth = {
      setAccess: vi.fn(async () => ({ ok: true })),
      enableUser: vi.fn(async () => ({ ok: true })),
      resetPassword: vi.fn(async () => ({ ok: true })),
    } as unknown as AuthService;
    const controller = new UsersController(auth);
    const request = { authUser: { id: 'gd-1', username: 'giam.doc' } } as never;

    await controller.setAccess(' u-1 ', { role: 'MANAGER', grants: [], dryRun: true }, request);
    expect(auth.setAccess).toHaveBeenCalledWith({ id: 'gd-1', username: 'giam.doc' }, 'u-1', {
      role: 'MANAGER',
      grants: [],
      dryRun: true,
    });
    await controller.resetPassword('u-1', undefined as never, request);
    expect(auth.resetPassword).toHaveBeenCalledWith(expect.anything(), 'u-1', {});

    const body = await errorBodyOf(
      Promise.resolve().then(() => controller.enable('   ', { confirmed: true }, request)),
    );
    expect(body).toMatchObject({ statusCode: 400, reason: 'ACCOUNT_INPUT_INVALID' });
  });
});
