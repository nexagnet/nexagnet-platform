import 'reflect-metadata';
import { BadRequestException, HttpException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser, UserRole } from '../../../auth/auth.types.js';
import type { AuthenticatedRequest } from '../../../auth/session.types.js';
import type { PermissionGrant } from '../../permissions/transport-permission-rules.js';
import { TransportActionGuard } from '../../transport-action.guard.js';
import { PlaceAdminError } from './place-admin-error.js';
import { PlaceAdminController } from './place-admin.controller.js';
import type { PlaceAdminService } from './place-admin.service.js';
import type { PlaceWriteCaller } from './place-admin.types.js';

/**
 * BE MAT HTTP cua man "Dia diem van hanh" (`#395` S3) — phan KHONG nam trong dich vu:
 *
 *   · quyen THU HAI (`transport.counterparty.manage`) hoi tren CHINH nguoi dang goi, bang CUNG luat
 *     quyen van tai voi cong route (vai khoi diem + quyen rieng), khong phai bang ten vai;
 *   · than loi 409 giu `detail` co cau truc (ten trung, viec dang mo) cho man hinh;
 *   · than yeu cau sai hinh -> 400 truoc khi dich vu thay gi.
 */

const VALID_SESSION_KEY = 's'.repeat(48);

const userOf = (role: UserRole, grants: readonly PermissionGrant[] = []): AuthenticatedUser =>
  ({
    id: `user-${role}`,
    username: `nguoi-${role.toLowerCase()}`,
    name: `Người ${role}`,
    role,
    permissionGrants: grants,
  }) as unknown as AuthenticatedUser;

const requestOf = (user: AuthenticatedUser): AuthenticatedRequest =>
  ({ authUser: user, headers: {} }) as unknown as AuthenticatedRequest;

const SITE_BODY = {
  kind: 'COUNTERPARTY_SITE',
  name: 'Nhà máy thép Đình Vũ',
  point: { latitude: 20.8264, longitude: 106.7752 },
  radiusMetres: 300,
  owner: { newCounterparty: { name: 'Công ty CP Thép Đông Á' } },
};

function controllerWith(create: PlaceAdminService['create']) {
  const service = { create: vi.fn(create) } as unknown as PlaceAdminService;
  return { controller: new PlaceAdminController(service), service };
}

const callerOfCall = (service: PlaceAdminService): PlaceWriteCaller =>
  vi.mocked(service.create).mock.calls[0]?.[1] as PlaceWriteCaller;

describe('PlaceAdminController o che do session (#395)', () => {
  const previous = { mode: process.env.AUTH_MODE, key: process.env.SESSION_SECRET };

  beforeEach(() => {
    process.env.AUTH_MODE = 'session';
    process.env.SESSION_SECRET = VALID_SESSION_KEY;
  });

  afterEach(() => {
    if (previous.mode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = previous.mode;
    if (previous.key === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous.key;
  });

  it.each([
    ['Giám đốc', true, userOf('ADMIN')],
    ['Kế toán (vai khởi điểm có quyền đối tác)', true, userOf('ACCOUNTING')],
    [
      'Kế toán bị gỡ quyền đối tác',
      false,
      userOf('ACCOUNTING', [{ permission: 'transport.counterparty.manage', effect: 'DENY' }]),
    ],
    [
      'Điều hành chỉ được cấp quyền hàng rào',
      false,
      userOf('MANAGER', [{ permission: 'transport.geofence.manage', effect: 'ALLOW' }]),
    ],
    [
      'Điều hành được cấp cả quyền đối tác',
      true,
      userOf('MANAGER', [
        { permission: 'transport.geofence.manage', effect: 'ALLOW' },
        { permission: 'transport.counterparty.manage', effect: 'ALLOW' },
      ]),
    ],
  ])('%s -> canManageCounterparties = %s', async (_label, expected, user) => {
    const { controller, service } = controllerWith(async () => ({}) as never);

    await controller.create(SITE_BODY, requestOf(user));

    expect(callerOfCall(service)).toEqual({
      actor: user.username,
      canManageCounterparties: expected,
    });
  });

  it('409 giu `reason` va `detail` co cau truc cua dich vu', async () => {
    const { controller } = controllerWith(async () => {
      throw new PlaceAdminError('CONFLICT', 'PLACE_NAME_TAKEN', 'Tên này đã dùng.', {
        conflictName: 'Bãi xe Hà Nội',
        conflictKindLabel: 'Bãi xe',
      });
    });

    const error = await controller
      .create(SITE_BODY, requestOf(userOf('ADMIN')))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(409);
    expect((error as HttpException).getResponse()).toMatchObject({
      reason: 'PLACE_NAME_TAKEN',
      detail: { conflictName: 'Bãi xe Hà Nội', conflictKindLabel: 'Bãi xe' },
    });
  });

  it.each([
    ['khoa la', { ...SITE_BODY, subjectKind: 'DEPOT' }],
    ['ban kinh ngoai bang', { ...SITE_BODY, radiusMetres: 5 }],
    ['loai khong tao duoc (CUSTOMER kieu cu)', { ...SITE_BODY, kind: 'CUSTOMER' }],
    ['ten rong', { ...SITE_BODY, name: '   ' }],
  ])('than sai hinh (%s) -> 400, dich vu khong duoc goi', async (_label, body) => {
    const { controller, service } = controllerWith(async () => ({}) as never);

    // `parse()` chay TRUOC khi vao dich vu — nem ngay, dong bo.
    expect(() => controller.create(body, requestOf(userOf('ADMIN')))).toThrow(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
  });

  /** Cong route: ke toan DOC duoc so dia diem nhung KHONG ghi (hang rao cham chung cu luc doc). */
  it('ke toan: doc duoc danh sach, khong tao duoc dia diem', () => {
    const guard = new TransportActionGuard(new Reflector());
    const contextFor = (handler: keyof PlaceAdminController, user: AuthenticatedUser) =>
      ({
        getHandler: () => PlaceAdminController.prototype[handler],
        getClass: () => PlaceAdminController,
        switchToHttp: () => ({ getRequest: () => requestOf(user) }),
      }) as unknown as ExecutionContext;

    expect(guard.canActivate(contextFor('list', userOf('ACCOUNTING')))).toBe(true);
    expect(() => guard.canActivate(contextFor('create', userOf('ACCOUNTING')))).toThrow();
    expect(guard.canActivate(contextFor('create', userOf('ADMIN')))).toBe(true);
  });
});

describe('PlaceAdminController ngoai che do session', () => {
  const previous = process.env.AUTH_MODE;

  beforeEach(() => {
    process.env.AUTH_MODE = 'none';
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = previous;
  });

  it('khong co danh tinh de hoi -> khong chan them (ca ung dung von khong xac thuc)', async () => {
    const { controller, service } = controllerWith(async () => ({}) as never);

    await controller.create(SITE_BODY, { headers: {} } as unknown as AuthenticatedRequest);

    expect(callerOfCall(service).canManageCounterparties).toBe(true);
  });
});
