import 'reflect-metadata';
import {
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
  type Type,
} from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { CAPABILITY_IDS } from '@netviet/tenant';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildAppComposition } from '../../app-composition.js';
import { USER_ROLES, type UserRole } from '../../auth/auth.types.js';
import { DOMAIN_ACTION_GATE_KEY, ROLES_KEY } from '../../auth/roles.decorator.js';
import { RolesGuard } from '../../auth/roles.guard.js';
import { TRANSPORT_ACTION_KEY, TransportActionGuard } from '../transport-action.guard.js';
import {
  SELF_SCOPE_ACTIONS,
  TRANSPORT_ACTIONS,
  type TransportAction,
} from '../transport-actions.js';

/**
 * #395 KHONG DOI HANH VI cua mot route nao voi bon vai khoi diem — bang chung tren TUNG route.
 *
 * ============================================================================================
 * CAI GI DOI
 * ============================================================================================
 *
 * Truoc #395 mot route van tai qua HAI cong noi tiep: `RolesGuard` (`@Roles`) roi
 * `TransportActionGuard` (bang vai → hanh dong). Tu #395 route mang dau `DOMAIN_ACTION_GATE_KEY`,
 * `RolesGuard` NHUONG, va chi con cong cua mien — voi bang vai MOI (them `DIRECTOR_ONLY_ACTIONS`,
 * them `operational_document.record` vao `ACCOUNTING_DENIED`, route noi ben huu quan doi sang
 * `transport.account_link.manage`). Ba chinh sach truoc day chi song trong `@Roles` nay nam trong
 * bang vai; neu bang vai quen mot cai, mot route se MO RONG cho mot vai ma khong ai quyet.
 *
 * ============================================================================================
 * CACH CHUNG MINH
 * ============================================================================================
 *
 * Moi controller ma composition nap khi bat MOI capability van tai (goc + controller khai trong
 * module), moi handler co route, moi vai khoi diem:
 *
 *   · CU  = ban sao DONG BANG cua hai guard cu, voi bang vai cu dung lai tu mot ban sao DONG BANG cua
 *           `ACCOUNTING_DENIED` truoc #395 va cong thuc cu;
 *   · MOI = `RolesGuard` va `TransportActionGuard` THAT, tren mot `ExecutionContext` gia lap, voi
 *           `authUser` KHONG co quyen rieng.
 *
 * Hai cot phai BANG NHAU o moi o — khong co ngoai le nao duoc ghi nhan: cac thay doi tu vung duoc
 * chon dung de CU == MOI.
 *
 * Mot chi tiet: route noi ben huu quan nay mang `transport.account_link.manage` (ma moi). Bang vai
 * CU dung lai bang phep tru nen cap ma do cho `ACCOUNTING` — dung nhu ma cu
 * `transport.asset_ownership.manage` ma route mang truoc #395. `@Roles('ADMIN')` chan Ke toan o chuoi
 * cu; bang vai moi chan o chuoi moi.
 */

/** `ACCOUNTING_DENIED` NGAY TRUOC #395 — DONG BANG. Khong import: ban that da doi, va do la diem. */
const FROZEN_ACCOUNTING_DENIED_BEFORE_395: readonly string[] = [
  'transport.trip.cancel',
  'transport.costing.period.reopen',
  'transport.fuel.reconciliation.reopen',
  'transport.location.history.read',
  'transport.checkpoint.record',
  'transport.waiting.close',
  'transport.operational_document.withdraw',
  'transport.proof.withdraw',
  'transport.telematics.observation.ingest',
  'transport.geofence.manage',
];
const FROZEN_STAKEHOLDER_SCOPE: readonly string[] = ['transport.stakeholder.self.vehicle.read'];
const isSelfScope = (action: string): boolean => action.startsWith('transport.driver.self.');

/** Bang vai CU, dung lai dung cong thuc cu: van hanh = tat ca TRU pham vi; Ke toan = van hanh TRU bi cam. */
const OLD_OPERATIONS = TRANSPORT_ACTIONS.filter(
  (action) => !isSelfScope(action) && !FROZEN_STAKEHOLDER_SCOPE.includes(action),
);
const OLD_ROLE_ACTIONS: Readonly<Record<UserRole, ReadonlySet<string>>> = {
  ADMIN: new Set(OLD_OPERATIONS),
  ACCOUNTING: new Set(
    OLD_OPERATIONS.filter((action) => !FROZEN_ACCOUNTING_DENIED_BEFORE_395.includes(action)),
  ),
  SALE: new Set(TRANSPORT_ACTIONS.filter(isSelfScope)),
  MANAGER: new Set(),
};

interface Route {
  readonly label: string;
  readonly controller: Type<unknown>;
  readonly handler: (...args: never[]) => unknown;
}

const reflector = new Reflector();

function controllersOfAllTransportCapabilities(): Type<unknown>[] {
  const capabilities = CAPABILITY_IDS.filter((id) => id.startsWith('transport-'));
  const composition = buildAppComposition(capabilities);
  // Controller khai TRONG module (vd `AuthModule`) khong nam trong danh sach goc — gom ca hai.
  const declaredInModules = composition.imports.flatMap((entry) =>
    typeof entry === 'function'
      ? ((Reflect.getMetadata('controllers', entry) as Type<unknown>[] | undefined) ?? [])
      : [],
  );
  return [...new Set([...composition.controllers, ...declaredInModules])];
}

function routesOf(controller: Type<unknown>): Route[] {
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => [name, prototype[name]] as const)
    .filter(
      (entry): entry is readonly [string, (...args: never[]) => unknown] =>
        typeof entry[1] === 'function',
    )
    .filter(([, handler]) => Reflect.getMetadata(METHOD_METADATA, handler) !== undefined)
    .map(([name, handler]) => ({ label: `${controller.name}.${name}`, controller, handler }));
}

const targetsOf = (route: Route): [Route['handler'], Type<unknown>] => [
  route.handler,
  route.controller,
];

const guardsOf = (route: Route): unknown[] =>
  reflector.getAllAndMerge<unknown[]>(GUARDS_METADATA, targetsOf(route)) ?? [];

const hasTransportGuard = (route: Route): boolean => guardsOf(route).includes(TransportActionGuard);

/* ------------------------------ CHUOI CU (dong bang) ------------------------------ */

function oldRolesGuard(route: Route, role: UserRole): boolean {
  const required = reflector.getAllAndOverride<readonly UserRole[]>(ROLES_KEY, targetsOf(route));
  if (!required || required.length === 0) return true;
  return required.includes(role);
}

function oldTransportActionGuard(route: Route, role: UserRole): boolean {
  const action = reflector.getAllAndOverride<string | undefined>(
    TRANSPORT_ACTION_KEY,
    targetsOf(route),
  );
  if (!action) return true;
  if (FROZEN_STAKEHOLDER_SCOPE.includes(action)) return true;
  return OLD_ROLE_ACTIONS[role].has(action);
}

const oldChain = (route: Route, role: UserRole): boolean =>
  oldRolesGuard(route, role) && (!hasTransportGuard(route) || oldTransportActionGuard(route, role));

/* ------------------------------ CHUOI MOI (guard that) ------------------------------ */

const rolesGuard = new RolesGuard(reflector);
const transportGuard = new TransportActionGuard(reflector);

function contextFor(route: Route, role: UserRole): ExecutionContext {
  const request = { authUser: { id: `user-${role}`, username: `user-${role}`, role } };
  return {
    getHandler: () => route.handler,
    getClass: () => route.controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function passes(guard: CanActivate, context: ExecutionContext): boolean {
  try {
    return guard.canActivate(context) === true;
  } catch (error) {
    if (error instanceof ForbiddenException) return false;
    throw error;
  }
}

function newChain(route: Route, role: UserRole): boolean {
  const context = contextFor(route, role);
  return (
    passes(rolesGuard, context) && (!hasTransportGuard(route) || passes(transportGuard, context))
  );
}

/* ------------------------------------ BAI ------------------------------------ */

const ROUTES = controllersOfAllTransportCapabilities().flatMap(routesOf);
const GATED = ROUTES.filter(
  (route) => reflector.getAllAndOverride(DOMAIN_ACTION_GATE_KEY, targetsOf(route)) !== undefined,
);

describe('#395 giu nguyen hanh vi cua moi route voi bon vai khoi diem', () => {
  beforeAll(() => {
    vi.stubEnv('AUTH_MODE', 'session');
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(48));
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('bang vai cu dung lai dung pham vi lai xe cua ban that', () => {
    expect([...OLD_ROLE_ACTIONS.SALE]).toEqual([...SELF_SCOPE_ACTIONS]);
  });

  /** Luoi an toan: doi khoa metadata cua Nest thi danh sach rong va bai duoi "xanh gia". */
  it(`tim thay route: ${ROUTES.length} handler, ${GATED.length} qua cong van tai`, () => {
    expect(ROUTES.length).toBeGreaterThan(280);
    expect(GATED.length).toBeGreaterThan(275);
  });

  it(`CU == MOI tren ${ROUTES.length} route x ${USER_ROLES.length} vai`, () => {
    const mismatches: string[] = [];
    for (const route of ROUTES) {
      for (const role of USER_ROLES) {
        const before = oldChain(route, role);
        const after = newChain(route, role);
        if (before !== after) mismatches.push(`${route.label} ${role}: cu=${before} moi=${after}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  /**
   * `RolesGuard` chi nhuong khi guard mien that su chay — nhung mot route mang dau ma thieu guard
   * van la mot route SAI HINH. Bai nay bat no ngay, khong doi toi luc ai do nhan ra `@Roles` dang
   * lam viec cua mot cong da mat.
   */
  it('moi route mang dau cong mien deu that su co `TransportActionGuard`', () => {
    const orphaned = GATED.filter(
      (route) =>
        reflector.getAllAndOverride(DOMAIN_ACTION_GATE_KEY, targetsOf(route)) !==
          TransportActionGuard || !hasTransportGuard(route),
    ).map((route) => route.label);
    expect(orphaned).toEqual([]);
  });

  it('moi route khai hanh dong van tai deu mang dau cong mien (khai qua RequiresTransportAction)', () => {
    const unmarked = ROUTES.filter((route) => {
      const action = reflector.getAllAndOverride<TransportAction | undefined>(
        TRANSPORT_ACTION_KEY,
        targetsOf(route),
      );
      return action !== undefined && !GATED.includes(route);
    }).map((route) => route.label);
    expect(unmarked).toEqual([]);
  });
});
