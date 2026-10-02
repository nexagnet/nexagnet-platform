import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  RequestMethod,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import { ROLES_KEY } from '../../auth/roles.decorator.js';
import { TRANSPORT_ACTION_KEY } from '../transport-action.guard.js';
import type { AccountLinksView, TransportAccountLinkDirectory } from './account-link-directory.js';
import { accountLinkError } from './account-link-errors.js';
import type { DriverAccountLinkService } from './driver-account-link.service.js';
import { FleetController } from './fleet.controller.js';
import type { FleetService } from './fleet.service.js';

/**
 * `#395` §1.8 o bien HTTP: ho so lai xe KHONG con nhan `authUserId`; noi tai khoan chi qua
 * `PUT /transport/drivers/:driverId/account`, chi Giam doc.
 */

const DRIVER_BODY = {
  fullName: 'Nguyen Van An',
  phone: '0900000001',
  licenceClass: 'C',
  licenceExpiry: '2029-01-01',
};

const request = {} as AuthenticatedRequest;

function harness() {
  const fleet = {
    registerDriver: vi.fn(async () => ({ id: 'driver-1' })),
    updateDriver: vi.fn(async () => ({ id: 'driver-1' })),
  };
  const links = {
    setDriverAccount: vi.fn(async (driverId: string, authUserId: string | null) => ({
      id: driverId,
      authUserId,
    })),
  };
  const view: AccountLinksView = {
    driver: {
      id: 'driver-1',
      name: 'Nguyen Van An',
      phone: '0900000001',
      status: 'ACTIVE',
      vehicle: null,
    },
    stakeholder: null,
  };
  const directory = { forUser: vi.fn(async () => view) };
  const controller = new FleetController(
    fleet as unknown as FleetService,
    links as unknown as DriverAccountLinkService,
    directory as unknown as TransportAccountLinkDirectory,
  );
  return { controller, fleet, links, directory, view };
}

describe('FleetController — noi tai khoan (#395 §1.8)', () => {
  it('POST /transport/drivers co `authUserId` -> 400, khong goi dich vu', async () => {
    const { controller, fleet } = harness();
    expect(() =>
      controller.createDriver({ ...DRIVER_BODY, authUserId: 'user-1' }, request),
    ).toThrow(BadRequestException);
    expect(fleet.registerDriver).not.toHaveBeenCalled();

    await controller.createDriver(DRIVER_BODY, request);
    expect(fleet.registerDriver).toHaveBeenCalledTimes(1);
  });

  it('PATCH /transport/drivers/:id co `authUserId` (ke ca `null`) -> 400', () => {
    const { controller, fleet } = harness();
    for (const authUserId of ['user-1', null]) {
      expect(() => controller.updateDriver('driver-1', { authUserId }, request)).toThrow(
        BadRequestException,
      );
    }
    expect(fleet.updateDriver).not.toHaveBeenCalled();
  });

  it('PUT account: than `strict`, `null` la go noi, thieu truong la 400', async () => {
    const { controller, links } = harness();
    await controller.setDriverAccount('driver-1', { authUserId: 'user-1' }, request);
    await controller.setDriverAccount('driver-1', { authUserId: null }, request);
    expect(links.setDriverAccount.mock.calls.map((call) => call.slice(0, 2))).toEqual([
      ['driver-1', 'user-1'],
      ['driver-1', null],
    ]);

    for (const body of [{}, { authUserId: 'user-1', role: 'ADMIN' }, { authUserId: '' }]) {
      expect(() => controller.setDriverAccount('driver-1', body, request)).toThrow(
        BadRequestException,
      );
    }
  });

  it('PUT account: loi mien -> ma HTTP dung, than mang ly do co kieu', async () => {
    const { controller, links } = harness();
    links.setDriverAccount.mockRejectedValueOnce(accountLinkError('ACCOUNT_LINK_ROLE_MISMATCH'));
    const conflict = await controller
      .setDriverAccount('driver-1', { authUserId: 'user-1' }, request)
      .catch((error: unknown) => error);
    expect(conflict).toBeInstanceOf(ConflictException);
    expect((conflict as ConflictException).getResponse()).toMatchObject({
      statusCode: 409,
      reason: 'ACCOUNT_LINK_ROLE_MISMATCH',
    });

    links.setDriverAccount.mockRejectedValueOnce(accountLinkError('ACCOUNT_LINK_USER_NOT_FOUND'));
    await expect(
      controller.setDriverAccount('driver-1', { authUserId: 'khong-co' }, request),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('GET account-links tra dung khung nhin cua danh ba', async () => {
    const { controller, directory, view } = harness();
    expect(await controller.accountLinksOf('user-1')).toEqual(view);
    expect(directory.forUser).toHaveBeenCalledWith('user-1');
  });

  it('hai route mang `@Roles(ADMIN)` + `transport.account_link.manage`, dung duong dan', () => {
    const reflector = new Reflector();
    const routes = [
      ['setDriverAccount', RequestMethod.PUT, 'drivers/:driverId/account'],
      ['accountLinksOf', RequestMethod.GET, 'account-links/:authUserId'],
    ] as const;
    for (const [name, method, path] of routes) {
      const handler = FleetController.prototype[name];
      expect(Reflect.getMetadata(METHOD_METADATA, handler), name).toBe(method);
      expect(Reflect.getMetadata(PATH_METADATA, handler), name).toBe(path);
      expect(reflector.get(ROLES_KEY, handler), name).toEqual(['ADMIN']);
      expect(reflector.get(TRANSPORT_ACTION_KEY, handler), name).toBe(
        'transport.account_link.manage',
      );
    }
  });
});
