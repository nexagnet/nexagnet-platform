import { Injectable, Optional } from '@nestjs/common';
import { AuditLogService, type AppendAuditLogCommand } from '../../audit/audit-log.service.js';
import { traceWrite } from '../../audit/audit-trail.js';
import { UserRepository } from '../../auth/user.repository.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import {
  TRANSPORT_ACCOUNT_LINK_DECISIONS,
  type AccountLinkErrorReason,
  type AccountLinkReason,
} from '../fleet/account-link-decisions.js';
import { accountLinkError } from '../fleet/account-link-errors.js';
import { isUniqueViolationOn } from '../storage-conflict.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  TRANSPORT_ASSET_OWNERSHIP_DECISIONS,
  type OwnershipCloseReason,
  type OwnershipRecordReason,
  type OwnershipRegisterReason,
} from './asset-ownership-decisions.js';
import {
  ASSET_STAKEHOLDER_ACCOUNT_UNIQUE,
  AssetOwnershipRepository,
  sortActiveInterests,
  sortClosedInterests,
  type CreateStakeholderInput,
  type UpdateStakeholderInput,
} from './asset-ownership.repository.js';
import {
  OWNERSHIP_BASIS_POINTS_TOTAL,
  type AssetStakeholder,
  type VehicleOperationalControl,
  type VehicleOwnershipInterest,
  type VehicleOwnershipRegister,
} from './asset-ownership.types.js';
import { VehicleOwnershipPort, type VehicleOwnershipFacts } from './vehicle-ownership.port.js';

export interface RecordInterestInput {
  readonly stakeholderId: string;
  readonly ownershipBasisPoints: number;
  readonly effectiveFrom: Date;
  readonly note?: string | null;
}

export interface CloseInterestRequest {
  readonly effectiveTo: Date;
  readonly note?: string | null;
}

/**
 * SO DANG KY SO HUU TAI SAN — `TX-08`, Issue #242 Lane E.
 *
 * Ba dieu service nay CO Y KHONG lam, va ca ba deu la yeu cau minh thi cua #242:
 *
 *   1. KHONG suy quyen dieu hanh tu quyen so huu. Them mot ben huu quan khong dong mot cot nao cua
 *      `operationalControl` — khong co dong ma nao lam viec do, va `asset-ownership.service.spec.ts`
 *      do dieu do bang mot bai rieng (#242 E1).
 *   2. KHONG ghi de lich su. Khong ton tai duong `delete`, va sua mot ty le la DONG ban cu roi MO
 *      ban moi (#242 E2).
 *   3. KHONG sinh mot nghia vu tien nao tu ty le so huu. Khong ham nao o day nhan hay tra mot so
 *      tien, va `no-auto-profit-distribution.spec.ts` quet ca thu muc de giu dieu do (#242 E4).
 *
 * `ownershipBasisPoints` la SO NGUYEN diem co ban. Bat bien tong dua han vao dieu do: ba lan cong
 * `3333` roi so voi `10000` luon cho mot cau tra loi, con ba lan cong `33.33` roi so voi `100` thi
 * khong bao gio.
 */
@Injectable()
export class AssetOwnershipService {
  constructor(
    private readonly repository: AssetOwnershipRepository,
    private readonly vehicles: VehicleOwnershipPort,
    private readonly audit: AuditLogService,
    @Optional() private readonly telemetry?: TelemetryService,
    /**
     * `#395` — kiem tai khoan dinh noi CO THAT va DANG HOAT DONG. Cuoi va tuy chon O TANG KIEU de
     * cac spec dung lop theo vi tri khong phai doi; KHONG `@Optional()` o tang DI: `AuthModule`
     * (`foundation`, `@Global`) luon co, va thieu no thi boot phai CHET chu khong am tham bo kiem.
     */
    private readonly users?: UserRepository,
  ) {}

  /* ------------------------------ Ben huu quan ------------------------------ */

  listStakeholders(): Promise<AssetStakeholder[]> {
    return this.repository.listStakeholders();
  }

  async getStakeholder(id: string): Promise<AssetStakeholder> {
    return this.requireStakeholder(id);
  }

  async createStakeholder(input: CreateStakeholderInput, actor: string): Promise<AssetStakeholder> {
    const row = await this.repository.createStakeholder(input);
    await this.audit.append({
      actor,
      action: 'transport.asset_stakeholder.create',
      entityType: 'TransportAssetStakeholder',
      entityId: row.id,
      before: null,
      after: row,
    });
    return row;
  }

  async updateStakeholder(
    id: string,
    patch: UpdateStakeholderInput,
    actor: string,
  ): Promise<AssetStakeholder> {
    const before = await this.requireStakeholder(id);
    const after = await this.repository.updateStakeholder(id, patch);
    if (!after) throw this.stakeholderNotFound();
    await this.audit.append({
      actor,
      action: 'transport.asset_stakeholder.update',
      entityType: 'TransportAssetStakeholder',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  /**
   * NOI ho so ben huu quan voi mot tai khoan dang nhap — hoac GO cau noi (`authUserId = null`).
   *
   * Day la duong DUY NHAT cap pham vi "Xe toi co co phan". Khong vai nen tang nao cap no, va do la
   * co y: `SALE` da la vai cua lai xe, con `MANAGER` la mot khoang trong phan quyen chua ai quyet
   * (xem `transport-actions.ts`). Muon mot nguoi doc duoc xe cua ho, phai co MOT hang o day.
   *
   * Lan ghi duoc kiem doc quyen truoc: mot tai khoan dang thuoc ho so KHAC bi tu choi bang mot ma
   * rieng, vi ghi de se lang le chuyen toan bo pham vi doc cua nguoi nay sang nguoi kia.
   */
  async setStakeholderAccount(
    id: string,
    authUserId: string | null,
    actor: string,
  ): Promise<AssetStakeholder> {
    const run = async (): Promise<AssetStakeholder> => {
      const before = await this.requireStakeholder(id);
      if (authUserId) await this.requireLinkableAccount(id, authUserId);
      const previousAuthUserId = await this.repository.linkedAccountOf(id);
      if (previousAuthUserId === authUserId) {
        this.decideLink('allowed', 'ACCOUNT_LINK_UNCHANGED', {
          stakeholderId: id,
          linked: authUserId !== null,
        });
        return before;
      }
      // Khung nhin chi co `hasAccount`: noi X roi doi sang Y se ra truoc == sau. Noi tai khoan la
      // cap quyen cho mot con nguoi (`#395`, chi Giam doc), nen dong kiem toan phai noi ai MAT
      // pham vi "Xe toi co co phan" va ai DUOC no — ghi TRONG cung giao dich voi lan noi.
      const after = await this.writeStakeholderAccount(id, authUserId, (written) => [
        {
          actor,
          action: authUserId
            ? 'transport.asset_stakeholder.account_link'
            : 'transport.asset_stakeholder.account_unlink',
          entityType: 'TransportAssetStakeholder',
          entityId: id,
          before: { ...before, authUserId: previousAuthUserId },
          after: { ...written, authUserId },
        },
      ]);
      this.decideLink('allowed', authUserId ? 'ACCOUNT_LINKED' : 'ACCOUNT_UNLINKED', {
        stakeholderId: id,
        authUserId,
        previousAuthUserId,
      });
      return after;
    };
    return this.telemetry ? this.telemetry.step('stakeholder.account_link', run) : run();
  }

  /**
   * Ghi qua kho; va cham unique cua DB (hai lan noi CUNG mot tai khoan vao hai ho so cung luc — ca
   * hai deu qua phep kiem o tren) la `ASSET_STAKEHOLDER_ACCOUNT_TAKEN`, khong phai mot `500`.
   */
  private async writeStakeholderAccount(
    id: string,
    authUserId: string | null,
    entries: (written: AssetStakeholder) => readonly AppendAuditLogCommand[],
  ): Promise<AssetStakeholder> {
    try {
      const after = await traceWrite(
        this.audit,
        (trail) => this.repository.setStakeholderAccount(id, authUserId, trail),
        (written) => written,
        entries,
      );
      if (!after) throw this.stakeholderNotFound();
      return after;
    } catch (error) {
      if (authUserId !== null && isUniqueViolationOn(error, ASSET_STAKEHOLDER_ACCOUNT_UNIQUE)) {
        this.denyLink('ASSET_STAKEHOLDER_ACCOUNT_TAKEN', {
          stakeholderId: id,
          authUserId,
          race: true,
        });
      }
      throw error;
    }
  }

  /**
   * Tai khoan dinh noi: CO THAT o nen tang, DANG HOAT DONG (`#395`), va chua thuoc ho so ben gop
   * von khac. Khong kiem vai: mot chu xe co the la bat ky ai — ke ca mot Ke toan co gop von.
   */
  private async requireLinkableAccount(stakeholderId: string, authUserId: string): Promise<void> {
    if (this.users) {
      const user = await this.users.findById(authUserId);
      if (!user) this.denyLink('ACCOUNT_LINK_USER_NOT_FOUND', { stakeholderId, authUserId });
      if (user.disabledAt !== null) {
        this.denyLink('ACCOUNT_LINK_USER_DISABLED', { stakeholderId, authUserId });
      }
    }
    const holder = await this.repository.findStakeholderIdHoldingAccount(authUserId);
    if (holder && holder !== stakeholderId) {
      this.denyLink('ASSET_STAKEHOLDER_ACCOUNT_TAKEN', {
        stakeholderId,
        authUserId,
        holderStakeholderId: holder,
      });
    }
  }

  private denyLink(reason: AccountLinkErrorReason, detail: Record<string, unknown>): never {
    this.decideLink('denied', reason, detail);
    throw accountLinkError(reason);
  }

  private decideLink(
    outcome: 'allowed' | 'denied',
    reason: AccountLinkReason,
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_ACCOUNT_LINK_DECISIONS,
      point: 'stakeholder.account_link',
      outcome,
      reason,
      detail,
    });
  }

  /* ------------------------------ So dang ky ------------------------------ */

  async register(vehicleId: string): Promise<VehicleOwnershipRegister> {
    const vehicle = await this.requireVehicle(vehicleId, 'ownership.interest.record');
    return this.buildRegister(vehicle);
  }

  /**
   * GHI mot quyen loi so huu moi.
   *
   * Thu tu kiem la mot phan cua thiet ke: ty le TRUOC (loi go nham pho bien nhat, va nguoi dung sua
   * duoc ngay), roi xe, roi ho so, roi quan he. Doi thu tu se bao "khong tim thay xe" cho mot nguoi
   * vua go nham mot con so.
   */
  async recordInterest(
    vehicleId: string,
    input: RecordInterestInput,
    actor: string,
  ): Promise<VehicleOwnershipInterest> {
    this.requireBasisPoints(input.ownershipBasisPoints);
    const vehicle = await this.requireVehicle(vehicleId, 'ownership.interest.record');
    const holder = await this.repository.findStakeholder(input.stakeholderId);
    if (!holder) {
      this.decide('ownership.interest.record', 'denied', 'STAKEHOLDER_NOT_FOUND', {
        vehicleId,
        stakeholderId: input.stakeholderId,
      });
      throw this.stakeholderNotFound();
    }
    if (holder.status !== 'ACTIVE') {
      this.decide('ownership.interest.record', 'denied', 'STAKEHOLDER_INACTIVE', {
        vehicleId,
        stakeholderId: holder.id,
      });
      throw TransportDomainError.conflict(
        'ASSET_STAKEHOLDER_NOT_FOUND',
        'Ho so ben huu quan da ngung hoat dong — khong mo them quyen loi moi',
      );
    }

    const existing = await this.repository.findActiveInterest(vehicleId, holder.id);
    if (existing) {
      this.decide('ownership.interest.record', 'denied', 'ACTIVE_INTEREST_EXISTS', {
        vehicleId,
        stakeholderId: holder.id,
        interestId: existing.id,
      });
      throw TransportDomainError.conflict(
        'OWNERSHIP_PERIOD_INVALID',
        'Ben huu quan da co quyen loi dang hieu luc tren xe nay — dong ban cu truoc khi mo ban moi',
      );
    }

    /**
     * TRAN 100% LUON DUNG — khong phu thuoc so dang ky da khai day du hay chua.
     *
     * Ban dau phep kiem nay nam trong `if (vehicle.ownershipRegisterComplete)`, va do la mot LOI:
     * mot so dang ky "con thieu" khi do nhan duoc tong 11500 diem co ban. Bang chung luc chay tren
     * `transport-preview/gd1-test` do dung con so ay ra.
     *
     * Hai khai niem bi lan: "day du" quyet dinh tong co phai BANG 10000 hay khong; no khong bao gio
     * quyet dinh tong co bi CHAN o 10000 hay khong. Khong ai so huu duoc 115% mot chiec xe, du he
     * thong da biet het chu hay chua — phan chua biet chi co the la phan CON LAI, va no khong am.
     *
     * Duong sua mot ty le van nguyen: DONG ban cu truoc, roi MO ban moi. Tong luc do da tru phan
     * cu, nen mot lan tang ty le hop le khong bao gio cham tran nay.
     */
    const total = await this.activeTotal(vehicleId);
    if (total + input.ownershipBasisPoints > OWNERSHIP_BASIS_POINTS_TOTAL) {
      this.decide('ownership.interest.record', 'denied', 'OWNERSHIP_SUM_EXCEEDS_TOTAL', {
        vehicleId,
        total,
        adding: input.ownershipBasisPoints,
        registerComplete: vehicle.ownershipRegisterComplete,
      });
      throw TransportDomainError.conflict(
        'OWNERSHIP_BASIS_POINTS_INVALID',
        `Tong ty le so huu dang hieu luc se thanh ${total + input.ownershipBasisPoints}/${OWNERSHIP_BASIS_POINTS_TOTAL} diem co ban — dong bot mot quyen loi khac truoc`,
      );
    }

    const row = await this.repository.openInterest({
      vehicleId,
      stakeholderId: holder.id,
      ownershipBasisPoints: input.ownershipBasisPoints,
      effectiveFrom: input.effectiveFrom,
      recordedBy: actor,
      recordedNote: input.note ?? null,
    });
    this.decide('ownership.interest.record', 'allowed', 'INTEREST_RECORDED', {
      vehicleId,
      stakeholderId: holder.id,
      ownershipBasisPoints: input.ownershipBasisPoints,
    });
    await this.audit.append({
      actor,
      action: 'transport.ownership.interest.record',
      entityType: 'TransportVehicleOwnershipInterest',
      entityId: row.id,
      before: null,
      after: row,
    });
    return row;
  }

  /**
   * DONG mot quyen loi — khong xoa, khong ghi de ty le.
   *
   * Neu so dang ky da duoc khai day du va lan dong nay lam tong tut duoi 100%, so dang ky TU HA
   * xuong `false`. Khong chan: nguoi ta ban co phan cua ho la mot su that da xay ra ngoai doi, va
   * phan mem tu choi ghi nhan no chi lam du lieu sai di. Cai dung la noi ra rang loi khai truoc do
   * khong con dung nua.
   */
  async closeInterest(
    interestId: string,
    request: CloseInterestRequest,
    actor: string,
  ): Promise<VehicleOwnershipInterest> {
    const before = await this.repository.findInterest(interestId);
    if (!before) throw this.interestNotFound(interestId);
    if (before.effectiveTo !== null) {
      this.decide('ownership.interest.close', 'allowed', 'INTEREST_ALREADY_CLOSED', { interestId });
      return before;
    }
    if (request.effectiveTo.toISOString() <= before.effectiveFrom) {
      throw TransportDomainError.invalid(
        'OWNERSHIP_PERIOD_INVALID',
        'Moc dong phai sau moc bat dau hieu luc',
      );
    }

    const after = await this.repository.closeInterest({
      interestId,
      effectiveTo: request.effectiveTo,
      closedBy: actor,
      closedNote: request.note ?? null,
    });
    if (!after) throw this.interestNotFound(interestId);
    this.decide('ownership.interest.close', 'allowed', 'INTEREST_CLOSED', {
      interestId,
      vehicleId: after.vehicleId,
    });
    await this.audit.append({
      actor,
      action: 'transport.ownership.interest.close',
      entityType: 'TransportVehicleOwnershipInterest',
      entityId: interestId,
      before,
      after,
    });
    await this.dropCompletenessIfBroken(after.vehicleId, actor);
    return after;
  }

  /**
   * KHAI so dang ky la day du, hoac ha no ve trang thai con thieu.
   *
   * Khai day du chi duoc khi tong cac ty le dang hieu luc dung 10000 diem. Ha xuong thi luon duoc —
   * mot nguoi phat hien ho khai nham phai sua duoc ngay, khong phai di dong bot quyen loi that.
   */
  async declareRegisterComplete(
    vehicleId: string,
    complete: boolean,
    actor: string,
  ): Promise<VehicleOwnershipRegister> {
    const vehicle = await this.requireVehicle(vehicleId, 'ownership.register.declare');
    if (complete) {
      const total = await this.activeTotal(vehicleId);
      if (total !== OWNERSHIP_BASIS_POINTS_TOTAL) {
        this.decide('ownership.register.declare', 'denied', 'REGISTER_SUM_NOT_FULL', {
          vehicleId,
          total,
        });
        throw TransportDomainError.conflict(
          'OWNERSHIP_BASIS_POINTS_INVALID',
          `Chua khai day du duoc: tong ty le dang hieu luc la ${total}/${OWNERSHIP_BASIS_POINTS_TOTAL} diem co ban`,
        );
      }
    }
    const updated = await this.vehicles.setRegisterComplete(vehicleId, complete);
    if (!updated) throw this.vehicleNotFound(vehicleId);
    this.decide(
      'ownership.register.declare',
      'allowed',
      complete ? 'REGISTER_MARKED_COMPLETE' : 'REGISTER_MARKED_PARTIAL',
      { vehicleId },
    );
    await this.audit.append({
      actor,
      action: 'transport.ownership.register.declare',
      entityType: 'TransportVehicle',
      entityId: vehicleId,
      before: { ownershipRegisterComplete: vehicle.ownershipRegisterComplete },
      after: { ownershipRegisterComplete: complete },
    });
    return this.buildRegister(updated);
  }

  /**
   * DOI quyen DIEU HANH — thao tac RIENG, khong dinh gi toi cac quyen loi so huu.
   *
   * Khong ham nao khac trong tep nay ghi cot `operationalControl`, va do la ca diem cua #242 E1:
   * mot xe dong so huu ma B van dieu hanh la xe NOI BO, va chi mot lan goi minh thi moi doi duoc
   * dieu do.
   */
  async setOperationalControl(
    vehicleId: string,
    control: VehicleOperationalControl,
    actor: string,
  ): Promise<VehicleOwnershipRegister> {
    const before = await this.requireVehicle(vehicleId, 'ownership.register.declare');
    const updated = await this.vehicles.setOperationalControl(vehicleId, control);
    if (!updated) throw this.vehicleNotFound(vehicleId);
    await this.audit.append({
      actor,
      action: 'transport.ownership.operational_control.set',
      entityType: 'TransportVehicle',
      entityId: vehicleId,
      before: { operationalControl: before.operationalControl },
      after: { operationalControl: control },
    });
    return this.buildRegister(updated);
  }

  /* ------------------------------ Noi bo ------------------------------ */

  private async buildRegister(vehicle: VehicleOwnershipFacts): Promise<VehicleOwnershipRegister> {
    const rows = await this.repository.listInterestsForVehicle(vehicle.id);
    const current = sortActiveInterests(rows.filter((row) => row.effectiveTo === null));
    const total = current.reduce((sum, row) => sum + row.ownershipBasisPoints, 0);
    return {
      vehicleId: vehicle.id,
      registrationPlate: vehicle.registrationPlate,
      operationalControl: vehicle.operationalControl,
      registerComplete: vehicle.ownershipRegisterComplete,
      current,
      currentBasisPointsTotal: total,
      unattributedBasisPoints: Math.max(0, OWNERSHIP_BASIS_POINTS_TOTAL - total),
      history: sortClosedInterests(rows.filter((row) => row.effectiveTo !== null)),
    };
  }

  private async activeTotal(vehicleId: string): Promise<number> {
    const rows = await this.repository.listInterestsForVehicle(vehicleId);
    return rows
      .filter((row) => row.effectiveTo === null)
      .reduce((sum, row) => sum + row.ownershipBasisPoints, 0);
  }

  private async dropCompletenessIfBroken(vehicleId: string, actor: string): Promise<void> {
    const vehicle = await this.vehicles.findVehicle(vehicleId);
    if (!vehicle?.ownershipRegisterComplete) return;
    const total = await this.activeTotal(vehicleId);
    if (total === OWNERSHIP_BASIS_POINTS_TOTAL) return;
    await this.vehicles.setRegisterComplete(vehicleId, false);
    this.decide('ownership.interest.close', 'degraded', 'REGISTER_COMPLETENESS_DROPPED', {
      vehicleId,
      total,
    });
    await this.audit.append({
      actor,
      action: 'transport.ownership.register.declare',
      entityType: 'TransportVehicle',
      entityId: vehicleId,
      before: { ownershipRegisterComplete: true },
      after: { ownershipRegisterComplete: false },
    });
  }

  private requireBasisPoints(value: number): void {
    if (!Number.isInteger(value) || value < 1 || value > OWNERSHIP_BASIS_POINTS_TOTAL) {
      throw TransportDomainError.invalid(
        'OWNERSHIP_BASIS_POINTS_INVALID',
        `Ty le so huu phai la so nguyen diem co ban trong 1..${OWNERSHIP_BASIS_POINTS_TOTAL} (10000 = 100%)`,
      );
    }
  }

  private async requireStakeholder(id: string): Promise<AssetStakeholder> {
    const row = await this.repository.findStakeholder(id);
    if (!row) throw this.stakeholderNotFound();
    return row;
  }

  private async requireVehicle(
    vehicleId: string,
    point: 'ownership.interest.record' | 'ownership.register.declare',
  ): Promise<VehicleOwnershipFacts> {
    const vehicle = await this.vehicles.findVehicle(vehicleId);
    if (!vehicle) {
      this.decide(point, 'denied', 'VEHICLE_NOT_FOUND', { vehicleId });
      throw this.vehicleNotFound(vehicleId);
    }
    return vehicle;
  }

  /** Cau cho nguoi dung — co dau, KHONG lo ma ho so (ma nam o duong dan route va trace). */
  private stakeholderNotFound(): TransportDomainError {
    return TransportDomainError.notFound(
      'ASSET_STAKEHOLDER_NOT_FOUND',
      'Không tìm thấy hồ sơ bên góp vốn.',
    );
  }

  private interestNotFound(id: string): TransportDomainError {
    this.decide('ownership.interest.close', 'denied', 'INTEREST_NOT_FOUND', { interestId: id });
    return TransportDomainError.notFound(
      'VEHICLE_OWNERSHIP_INTEREST_NOT_FOUND',
      `Khong tim thay quyen loi so huu ${id}`,
    );
  }

  private vehicleNotFound(id: string): TransportDomainError {
    return TransportDomainError.notFound('VEHICLE_NOT_FOUND', `Khong tim thay xe ${id}`);
  }

  private decide(
    point: 'ownership.interest.record' | 'ownership.interest.close' | 'ownership.register.declare',
    outcome: 'allowed' | 'denied' | 'degraded',
    reason: OwnershipRecordReason | OwnershipCloseReason | OwnershipRegisterReason,
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_ASSET_OWNERSHIP_DECISIONS,
      point,
      outcome,
      reason,
      detail,
    });
  }
}
