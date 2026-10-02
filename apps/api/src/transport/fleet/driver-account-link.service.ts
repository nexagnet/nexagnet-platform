import { Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { traceWrite } from '../../audit/audit-trail.js';
import { UserRepository } from '../../auth/user.repository.js';
import type { DecisionOutcome } from '../../observability/decision-vocabulary.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { isUniqueViolationOn, type UniqueIndexRef } from '../storage-conflict.js';
import { TransportDomainError } from '../transport.errors.js';
import type { Driver } from '../transport.types.js';
import {
  TRANSPORT_ACCOUNT_LINK_DECISIONS,
  type AccountLinkErrorReason,
  type AccountLinkReason,
} from './account-link-decisions.js';
import { accountLinkError } from './account-link-errors.js';
import { FleetRepository } from './fleet.repository.js';

/**
 * `TransportDriver.authUserId @unique` — hai lan noi CUNG mot tai khoan vao hai ho so cung luc thi
 * lan thu hai chet o day, va do la `DRIVER_ACCOUNT_TAKEN`, khong phai mot `500`.
 */
export const DRIVER_ACCOUNT_UNIQUE: UniqueIndexRef = {
  indexName: 'TransportDriver_authUserId_key',
  model: 'TransportDriver',
  column: 'authUserId',
};

/** Vai nen tang ma ho so lai xe nhan — `GD-22`: lai xe anh xa sang `SALE` o tang xac thuc. */
const DRIVER_ACCOUNT_ROLE = 'SALE';

/**
 * NOI / GO tai khoan dang nhap voi HO SO LAI XE (`#395` §1.8).
 *
 * Day la duong ghi DUY NHAT cua `TransportDriver.authUserId` tu man hinh: `POST/PATCH
 * /transport/drivers` KHONG con nhan truong nay (schema `strict` → `400`), vi mot o nhap tu do o do
 * da la mot duong CAP PHAM VI lai xe cho bat ky tai khoan nao ma khong kiem gi ca.
 *
 * Luat, theo thu tu (thu tu quyet dinh ma ly do nao duoc tra):
 *   1. ho so lai xe ton tai (`DRIVER_NOT_FOUND`);
 *   2. GO NOI (`authUserId = null`): luon duoc, ke ca ho so da ngung — go la cach DONG mot pham vi;
 *   3. NOI: ho so dang hoat dong (`ACCOUNT_LINK_DRIVER_INACTIVE`); tai khoan co that o nen tang
 *      (`ACCOUNT_LINK_USER_NOT_FOUND`), dang hoat dong (`ACCOUNT_LINK_USER_DISABLED`), vai Lai xe
 *      (`ACCOUNT_LINK_ROLE_MISMATCH`), chua noi ho so khac (`DRIVER_ACCOUNT_TAKEN` — va DB chan
 *      lan dua qua unique, cung ma).
 *
 * Moi thay doi ghi `transport.driver.account_link` / `account_unlink` voi `before`/`after` la chinh
 * ho so lai xe. Lan goi trung trang thai khong ghi gi (`ACCOUNT_LINK_UNCHANGED`).
 */
@Injectable()
export class DriverAccountLinkService {
  constructor(
    private readonly fleet: FleetRepository,
    private readonly users: UserRepository,
    private readonly audit: AuditLogService,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  setDriverAccount(driverId: string, authUserId: string | null, actor: string): Promise<Driver> {
    const run = (): Promise<Driver> =>
      authUserId === null ? this.unlink(driverId, actor) : this.link(driverId, authUserId, actor);
    return this.telemetry ? this.telemetry.step('driver.account_link', run) : run();
  }

  private async unlink(driverId: string, actor: string): Promise<Driver> {
    const before = await this.requireDriver(driverId);
    if (before.authUserId === null) {
      this.decide('allowed', 'ACCOUNT_LINK_UNCHANGED', { driverId, linked: false });
      return before;
    }
    const after = await this.write(before, null, actor);
    this.decide('allowed', 'ACCOUNT_UNLINKED', { driverId });
    return after;
  }

  private async link(driverId: string, authUserId: string, actor: string): Promise<Driver> {
    const before = await this.requireDriver(driverId);
    if (before.status !== 'ACTIVE') this.deny('ACCOUNT_LINK_DRIVER_INACTIVE', { driverId });

    const user = await this.users.findById(authUserId);
    if (!user) this.deny('ACCOUNT_LINK_USER_NOT_FOUND', { driverId, authUserId });
    if (user.disabledAt !== null) this.deny('ACCOUNT_LINK_USER_DISABLED', { driverId, authUserId });
    if (user.role !== DRIVER_ACCOUNT_ROLE) {
      this.deny('ACCOUNT_LINK_ROLE_MISMATCH', { driverId, authUserId, role: user.role });
    }

    const holder = await this.fleet.findDriverByAuthUserId(authUserId);
    if (holder && holder.id !== driverId) {
      this.deny('DRIVER_ACCOUNT_TAKEN', { driverId, authUserId, holderDriverId: holder.id });
    }
    if (before.authUserId === authUserId) {
      this.decide('allowed', 'ACCOUNT_LINK_UNCHANGED', { driverId, authUserId, linked: true });
      return before;
    }

    const after = await this.write(before, authUserId, actor);
    this.decide('allowed', 'ACCOUNT_LINKED', {
      driverId,
      authUserId,
      replaced: before.authUserId !== null,
    });
    return after;
  }

  /**
   * Ghi qua KHO (kho giu truong nay cho may gieo, fixture va chinh dich vu nay), dau vet
   * `transport.driver.account_link` / `account_unlink` trong CUNG giao dich (`audit-trail.ts`).
   */
  private async write(before: Driver, authUserId: string | null, actor: string): Promise<Driver> {
    const driverId = before.id;
    try {
      const after = await traceWrite(
        this.audit,
        (trail) => this.fleet.updateDriver(driverId, { authUserId }, trail),
        (driver) => driver,
        (driver) => [
          {
            actor,
            action:
              authUserId === null
                ? 'transport.driver.account_unlink'
                : 'transport.driver.account_link',
            entityType: 'TransportDriver',
            entityId: driverId,
            before,
            after: driver,
          },
        ],
      );
      if (!after) throw driverNotFound();
      return after;
    } catch (error) {
      if (authUserId !== null && isUniqueViolationOn(error, DRIVER_ACCOUNT_UNIQUE)) {
        this.deny('DRIVER_ACCOUNT_TAKEN', { driverId, authUserId, race: true });
      }
      throw error;
    }
  }

  private async requireDriver(driverId: string): Promise<Driver> {
    const driver = await this.fleet.findDriver(driverId);
    if (!driver) throw driverNotFound();
    return driver;
  }

  private deny(reason: AccountLinkErrorReason, detail: Readonly<Record<string, unknown>>): never {
    this.decide('denied', reason, detail);
    throw accountLinkError(reason);
  }

  private decide(
    outcome: DecisionOutcome,
    reason: AccountLinkReason,
    detail: Readonly<Record<string, unknown>>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_ACCOUNT_LINK_DECISIONS,
      point: 'driver.account_link',
      outcome,
      reason,
      detail,
    });
  }
}

/** Cau cho nguoi dung — co dau, khong lo ma ho so (ma nam o `reason` + duong dan route). */
function driverNotFound(): TransportDomainError {
  return TransportDomainError.notFound('DRIVER_NOT_FOUND', 'Không tìm thấy hồ sơ lái xe này.');
}
