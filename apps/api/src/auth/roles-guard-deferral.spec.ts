import 'reflect-metadata';
import {
  ForbiddenException,
  Injectable,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RequiresTransportAction,
  TransportActionGuard,
} from '../transport/transport-action.guard.js';
import type { UserRole } from './auth.types.js';
import { DOMAIN_ACTION_GATE_KEY, Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

/**
 * `RolesGuard` NHUONG cho cong cua mien — va CHI khi cong do that su chay (`#395`).
 *
 * Nhuong chi dua tren dau se lam mot route mang dau ma quen `@UseGuards(TransportActionGuard)` mat
 * CA HAI cong. Bai nay khoa ca ba nhanh: co dau + co guard → nhuong; co dau ma khong co guard (hoac
 * guard khac) → kiem `@Roles` nhu cu; khong dau → khong doi gi.
 */

@Injectable()
class UnrelatedGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

@UseGuards(TransportActionGuard)
class GatedController {
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.vehicle.manage')
  write(): void {}
}

class HandlerGatedController {
  @UseGuards(TransportActionGuard)
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.vehicle.manage')
  write(): void {}
}

/** Dau co, guard KHONG — vd mot controller o module khac quen `@UseGuards`. */
class ForgottenGuardController {
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.vehicle.manage')
  write(): void {}
}

@UseGuards(UnrelatedGuard)
class WrongGuardController {
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.vehicle.manage')
  write(): void {}
}

/** Dau mang gia tri khong phai lop guard — khong bao gio duoc hieu la "nhuong". */
@UseGuards(TransportActionGuard)
class MalformedMarkerController {
  @Roles('ACCOUNTING', 'ADMIN')
  @SetMetadata(DOMAIN_ACTION_GATE_KEY, true)
  write(): void {}
}

class PlainController {
  @Roles('ACCOUNTING', 'ADMIN')
  write(): void {}
}

type Controller = { prototype: { write: () => void } };

function contextFor(controller: Controller, role: UserRole | null): ExecutionContext {
  return {
    getHandler: () => controller.prototype.write,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => (role ? { authUser: { id: `u-${role}`, username: 'u', role } } : {}),
    }),
  } as unknown as ExecutionContext;
}

const reflector = new Reflector();
const roles = new RolesGuard(reflector);
const actions = new TransportActionGuard(reflector);

const passes = (guard: CanActivate, context: ExecutionContext): boolean => {
  try {
    return guard.canActivate(context) === true;
  } catch (error) {
    if (error instanceof ForbiddenException) return false;
    throw error;
  }
};

describe('RolesGuard nhuong cho cong cua mien (#395)', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_MODE', 'session');
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(48));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('co dau + guard mien o controller: RolesGuard nhuong, cong mien quyet', () => {
    const manager = contextFor(GatedController, 'MANAGER');
    expect(passes(roles, manager)).toBe(true);
    // Cong mien van dong voi MANAGER khong co quyen rieng — nhuong KHONG co nghia la mo.
    expect(passes(actions, manager)).toBe(false);
    expect(passes(actions, contextFor(GatedController, 'ACCOUNTING'))).toBe(true);
  });

  it('guard mien gan o HANDLER cung duoc tinh', () => {
    expect(passes(roles, contextFor(HandlerGatedController, 'MANAGER'))).toBe(true);
  });

  it.each([
    ['khong co guard nao', ForgottenGuardController],
    ['co guard nhung khong phai guard mien', WrongGuardController],
    ['dau sai hinh', MalformedMarkerController],
  ] as const)('dau co ma %s: FAIL-CLOSED, @Roles kiem nhu cu', (_label, controller) => {
    expect(passes(roles, contextFor(controller, 'MANAGER'))).toBe(false);
    expect(passes(roles, contextFor(controller, 'SALE'))).toBe(false);
    expect(passes(roles, contextFor(controller, null))).toBe(false);
    expect(passes(roles, contextFor(controller, 'ACCOUNTING'))).toBe(true);
  });

  it('khong dau: @Roles khong doi', () => {
    expect(passes(roles, contextFor(PlainController, 'MANAGER'))).toBe(false);
    expect(passes(roles, contextFor(PlainController, 'ADMIN'))).toBe(true);
  });

  it('RequiresTransportAction gan dau voi GIA TRI la chinh lop guard mien', () => {
    expect(Reflect.getMetadata(DOMAIN_ACTION_GATE_KEY, GatedController.prototype.write)).toBe(
      TransportActionGuard,
    );
  });

  it('ngoai che do phien: moi thu mo nhu truoc', () => {
    vi.stubEnv('AUTH_MODE', 'none');
    expect(passes(roles, contextFor(ForgottenGuardController, 'MANAGER'))).toBe(true);
  });
});
