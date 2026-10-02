import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PermissionGrant } from '../../auth/access/permission-domain.js';
import type { AuthenticatedUser, UserRole } from '../../auth/auth.types.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import { DispatchController } from '../dispatch/dispatch.controller.js';
import type { DispatchCaller, DispatchService } from '../dispatch/dispatch.service.js';
import { FleetController } from '../fleet/fleet.controller.js';
import type { LocationHealthService } from '../proof/location-health.service.js';
import { TrackingController } from '../proof/tracking.controller.js';
import type { TrackingService } from '../proof/tracking.service.js';
import { TransportActionGuard, requestCanPerform } from '../transport-action.guard.js';
import type { TransportAction } from '../transport-actions.js';

/**
 * #395 S2 — CUNG MOT CAU TRA LOI o guard va o ba cho kiem quyen TRONG MA.
 *
 * Moi bai o day dung mot tai khoan co QUYEN RIENG (hoac khong co truong do — fixture cu) va doi
 * hanh vi that cua: `TransportActionGuard` tren metadata that cua route, `DispatchController`
 * (`callerOf`), `TrackingController` (`canReadCoordinates`). Tep tai lieu van hanh co bai rieng
 * (`operational-document-file.authorizer.grants.spec.ts`).
 */

const reflector = new Reflector();
const guard = new TransportActionGuard(reflector);

function user(role: UserRole, permissionGrants?: readonly PermissionGrant[]): AuthenticatedUser {
  return {
    id: `user-${role.toLowerCase()}`,
    username: `user-${role.toLowerCase()}`,
    name: role,
    email: null,
    phone: null,
    role,
    credentialVersion: 1,
    disabledAt: null,
    createdAt: '2026-09-25T00:00:00.000Z',
    updatedAt: '2026-09-25T00:00:00.000Z',
    lastLoginAt: null,
    passwordChangedAt: null,
    ...(permissionGrants === undefined ? {} : { permissionGrants }),
  };
}

const allow = (permission: TransportAction): PermissionGrant => ({ permission, effect: 'ALLOW' });
const deny = (permission: TransportAction): PermissionGrant => ({ permission, effect: 'DENY' });

function request(authUser?: AuthenticatedUser): AuthenticatedRequest {
  return { authUser, headers: {} } as unknown as AuthenticatedRequest;
}

function routeContext(
  method: keyof FleetController,
  authUser?: AuthenticatedUser,
): ExecutionContext {
  const handler = FleetController.prototype[method] as (...args: never[]) => unknown;
  const req = request(authUser);
  return {
    getHandler: () => handler,
    getClass: () => FleetController,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function forbiddenBody(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ForbiddenException);
    return (error as ForbiddenException).getResponse();
  }
  throw new Error('guard da cho qua');
}

beforeEach(() => {
  vi.stubEnv('AUTH_MODE', 'session');
  vi.stubEnv('SESSION_SECRET', 'x'.repeat(48));
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('TransportActionGuard — tap quyen hieu luc (#395)', () => {
  it('Dieu hanh DUOC cap `transport.vehicle.read` qua duoc route danh sach xe', () => {
    const manager = user('MANAGER', [allow('transport.vehicle.read')]);
    expect(guard.canActivate(routeContext('listVehicles', manager))).toBe(true);
  });

  it('Dieu hanh CHUA duoc cap: 403 co ly do co kieu, cau tieng Viet co dau, ma hanh dong o detail', () => {
    const body = forbiddenBody(() =>
      guard.canActivate(routeContext('listVehicles', user('MANAGER', []))),
    );
    expect(body).toEqual({
      statusCode: 403,
      message: 'Bạn không có quyền thực hiện thao tác này.',
      error: 'Forbidden',
      reason: 'ACTION_NOT_PERMITTED',
      detail: { action: 'transport.vehicle.read' },
    });
  });

  it('Ke toan bi BOT `transport.vehicle.read` thi mat route do', () => {
    const accountant = user('ACCOUNTING', [deny('transport.vehicle.read')]);
    expect(
      forbiddenBody(() => guard.canActivate(routeContext('listVehicles', accountant))),
    ).toMatchObject({ reason: 'ACTION_NOT_PERMITTED' });
    // …con route khac cua Ke toan van nguyen.
    expect(guard.canActivate(routeContext('listDrivers', accountant))).toBe(true);
  });

  it('ALLOW gia mao mot quyen CHI GIAM DOC trong DB bi BO QUA', () => {
    const forged = [allow('transport.account_link.manage')];
    for (const role of ['MANAGER', 'ACCOUNTING', 'SALE'] as const) {
      expect(
        forbiddenBody(() =>
          guard.canActivate(routeContext('setDriverAccount', user(role, forged))),
        ),
        role,
      ).toMatchObject({ detail: { action: 'transport.account_link.manage' } });
    }
    expect(guard.canActivate(routeContext('setDriverAccount', user('ADMIN')))).toBe(true);
    expect(guard.canActivate(routeContext('accountLinksOf', user('ADMIN')))).toBe(true);
  });

  it('tai khoan KHONG co truong `permissionGrants` (fixture cu) tra loi dung nhu vai khoi diem', () => {
    expect(guard.canActivate(routeContext('listVehicles', user('ACCOUNTING')))).toBe(true);
    expect(() => guard.canActivate(routeContext('listVehicles', user('SALE')))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(routeContext('listVehicles', user('MANAGER')))).toThrow(
      ForbiddenException,
    );
  });

  it('khong co phien: 403 cung than loi', () => {
    expect(forbiddenBody(() => guard.canActivate(routeContext('listVehicles')))).toMatchObject({
      reason: 'ACTION_NOT_PERMITTED',
      detail: { action: 'transport.vehicle.read' },
    });
  });
});

describe('requestCanPerform — cau tra loi cho cac cho kiem trong ma', () => {
  const HISTORY = 'transport.location.history.read';

  it('Ke toan: vai khoi diem khong co, ALLOW (leo thang da duoc xac nhan luc cap) thi co', () => {
    expect(requestCanPerform(request(user('ACCOUNTING')), HISTORY)).toBe(false);
    expect(requestCanPerform(request(user('ACCOUNTING', [allow(HISTORY)])), HISTORY)).toBe(true);
  });

  it('Giam doc: DENY lot vao DB bi bo qua — vai day du', () => {
    expect(requestCanPerform(request(user('ADMIN', [deny(HISTORY)])), HISTORY)).toBe(true);
  });

  it('khong phien trong che do phien: KHONG; che do khong-phien: CO (nhu guard)', () => {
    expect(requestCanPerform(request(), HISTORY)).toBe(false);
    vi.stubEnv('AUTH_MODE', 'none');
    expect(requestCanPerform(request(), HISTORY)).toBe(true);
  });
});

describe('DispatchController.callerOf — toa do xe trong bang de nghi', () => {
  function captureCaller(authUser: AuthenticatedUser): Promise<DispatchCaller> {
    const dispatch = {
      suggest: vi.fn(async (_orderId: string, _request: unknown, caller: DispatchCaller) => caller),
    } as unknown as DispatchService;
    const controller = new DispatchController(dispatch);
    return controller.suggest(
      'order-1',
      {},
      request(authUser),
    ) as unknown as Promise<DispatchCaller>;
  }

  it('Dieu hanh DUOC cap doc duong di thay toa do; Ke toan mac dinh thi khong', async () => {
    const manager = user('MANAGER', [
      allow('transport.dispatch.suggest.read'),
      allow('transport.location.history.read'),
    ]);
    expect((await captureCaller(manager)).canReadLocationHistory).toBe(true);
    expect((await captureCaller(user('ACCOUNTING'))).canReadLocationHistory).toBe(false);
    expect((await captureCaller(user('ADMIN'))).canReadLocationHistory).toBe(true);
  });
});

describe('TrackingController.locationHealth — che toa do theo quyen', () => {
  function controllerWithFix(): TrackingController {
    const health = {
      forVehicle: vi.fn(async () => ({
        lastKnown: { point: { latitude: 20.8449, longitude: 106.6881 }, usableAsCurrent: true },
      })),
    } as unknown as LocationHealthService;
    return new TrackingController({} as TrackingService, health);
  }

  it('ALLOW doc duong di mo toa do cho Ke toan; khong co thi che', async () => {
    const controller = controllerWithFix();
    const granted = await controller.locationHealth(
      request(user('ACCOUNTING', [allow('transport.location.history.read')])),
      'vehicle-1',
    );
    expect(granted.lastKnown?.coordinatesRedacted).toBe(false);
    const plain = await controller.locationHealth(request(user('ACCOUNTING')), 'vehicle-1');
    expect(plain.lastKnown?.coordinatesRedacted).toBe(true);
    expect(plain.lastKnown?.point).toBeNull();
  });
});
