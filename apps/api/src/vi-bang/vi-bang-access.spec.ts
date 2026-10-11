import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { RolesGuard } from '../auth/roles.guard.js';
import { ROLES_KEY } from '../auth/roles.decorator.js';
import { ViBangController } from './vi-bang.controller.js';

describe('ViBang #427 temporary legal PII role boundary', () => {
  const reflector = new Reflector();
  const prototype = ViBangController.prototype as unknown as Record<string, (...args: never[]) => unknown>;
  const methods = Object.getOwnPropertyNames(prototype).filter((name) =>
    name !== 'constructor' &&
    typeof prototype[name] === 'function' &&
    Reflect.getMetadata('method', prototype[name]) !== undefined
  );

  it('covers every read and write route with ADMIN until #428', () => {
    expect(methods).toHaveLength(10);
    for (const name of methods) {
      expect(
        reflector.getAllAndOverride<readonly string[]>(ROLES_KEY, [
          prototype[name], ViBangController,
        ]),
        name,
      ).toEqual(['ADMIN']);
    }
  });

  it('denies legacy SALE/MANAGER on every route in session mode', () => {
    vi.stubEnv('AUTH_MODE', 'session');
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(48));
    try {
      const guard = new RolesGuard(reflector);
      for (const name of methods) {
        for (const role of ['SALE', 'MANAGER'] as const) {
          const ctx = {
            getHandler: () => prototype[name],
            getClass: () => ViBangController,
            switchToHttp: () => ({ getRequest: () => ({ authUser: { role } }) }),
          } as unknown as Parameters<RolesGuard['canActivate']>[0];
          expect(() => guard.canActivate(ctx), name).toThrow(ForbiddenException);
        }
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
