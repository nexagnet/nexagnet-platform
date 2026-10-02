import { Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  TRANSPORT_ASSET_OWNERSHIP_DECISIONS,
  type OwnershipScopeReason,
} from './asset-ownership-decisions.js';
import { AssetOwnershipRepository } from './asset-ownership.repository.js';
import type {
  StakeholderOwnershipPeriod,
  StakeholderScope,
  StakeholderVehicleView,
  VehicleOwnershipInterest,
} from './asset-ownership.types.js';
import { VehicleOwnershipPort } from './vehicle-ownership.port.js';

/**
 * PHAM VI DOC CUA BEN HUU QUAN — #242 E3/E6.
 *
 * Day la CONG THAT cua be mat "Xe toi co co phan", va no khong phai mot vai.
 *
 * Vi sao khong phai mot vai: nen tang co dung bon vai phang (`SALE`/`MANAGER`/`ACCOUNTING`/`ADMIN`)
 * va `RolesGuard` so `user.role` voi mot danh sach. `SALE` DA la vai cua lai xe, con `MANAGER` la
 * mot khoang trong phan quyen chua ai quyet — gan y nghia "co dong" cho mot trong hai la dua vao
 * base mot chinh sach khong ai quyet, roi moi khach van tai sau deu thua huong no.
 *
 * Nen pham vi den tu MOT HANG DU LIEU: `TransportAssetStakeholder.authUserId`. Cung dung khuon ma
 * lai xe da dung (`TransportDriver.authUserId` + `CostingReadService`) — hai lai xe khac nhau cung
 * mot vai, nen vai khong the la cong; nguoi so huu cung vay.
 *
 * BA DIEU DUOC BAO DAM BANG CAU TRUC, khong bang ky luat:
 *
 *   1. `resolve()` la duong VAO DUY NHAT. Moi ham doc deu goi no truoc, va no lay danh tinh TU
 *      PHIEN — khong ham nao o day nhan `stakeholderId` tu nguoi goi.
 *   2. `myVehicle()` doi chieu `vehicleId` voi tap CUA CHINH nguoi dang xem. Doi tham so tren duong
 *      dan khong mo duoc xe cua nguoi khac, vi tap kia khong he chua no.
 *   3. Quyen loi DA HET HAN khong cap quyen doc. Xem `isCurrent`.
 */
@Injectable()
export class AssetOwnershipScopeService {
  constructor(
    private readonly repository: AssetOwnershipRepository,
    private readonly vehicles: VehicleOwnershipPort,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  /**
   * Giai danh tinh ben huu quan tu mot phien dang nhap.
   *
   * FAIL-CLOSED o ca hai duong: khong co ho so, hoac ho so da ngung. Ca hai deu tra `403` — khong
   * phai `404` — vi cau tra loi "tai khoan nay khong phai ben huu quan" khong duoc phep khac nhau
   * tuy theo trong DB co gi.
   */
  async resolve(authUserId: string): Promise<StakeholderScope> {
    const holder = await this.repository.findStakeholderByAuthUser(authUserId);
    if (!holder) throw this.denyScope('STAKEHOLDER_NOT_LINKED', {});
    if (holder.status !== 'ACTIVE') {
      throw this.denyScope('STAKEHOLDER_INACTIVE', { stakeholderId: holder.id });
    }

    const interests = await this.repository.listInterestsForStakeholder(holder.id);
    const vehicleIds = [...new Set(interests.filter(isCurrent).map((row) => row.vehicleId))].sort();

    this.decide('allowed', 'SCOPE_GRANTED', {
      stakeholderId: holder.id,
      vehicleCount: vehicleIds.length,
    });
    return { stakeholderId: holder.id, displayName: holder.displayName, vehicleIds };
  }

  /** "Xe toi co co phan" — DANH SACH. Chi cac xe co quyen loi DANG hieu luc cua chinh nguoi xem. */
  async myVehicles(authUserId: string): Promise<StakeholderVehicleView[]> {
    const scope = await this.resolve(authUserId);
    const interests = await this.repository.listInterestsForStakeholder(scope.stakeholderId);
    const views: StakeholderVehicleView[] = [];
    for (const vehicleId of scope.vehicleIds) {
      const view = await this.viewOf(vehicleId, interests);
      if (view) views.push(view);
    }
    return views.sort((a, b) => a.registrationPlate.localeCompare(b.registrationPlate));
  }

  /**
   * MOT xe trong pham vi cua nguoi dang xem.
   *
   * Mot chiec xe khong thuoc pham vi tra `403` chu khong `404`: hai ma khac nhau se bien duong nay
   * thanh mot cong do — ke goi doi `vehicleId` cho toi khi thay ma doi, va dem duoc ca doi xe cua
   * doanh nghiep ma khong doc duoc mot dong nao. Ca hai truong hop tra ve cung mot cau tra loi.
   */
  async myVehicle(authUserId: string, vehicleId: string): Promise<StakeholderVehicleView> {
    const scope = await this.resolve(authUserId);
    const interests = await this.repository.listInterestsForStakeholder(scope.stakeholderId);
    const view = scope.vehicleIds.includes(vehicleId)
      ? await this.viewOf(vehicleId, interests)
      : null;
    if (!view) {
      throw this.denyScope('VEHICLE_NOT_ENTITLED', {
        stakeholderId: scope.stakeholderId,
        vehicleId,
      });
    }
    return view;
  }

  /* ------------------------------ Noi bo ------------------------------ */

  private async viewOf(
    vehicleId: string,
    interests: readonly VehicleOwnershipInterest[],
  ): Promise<StakeholderVehicleView | null> {
    const mine = interests.filter((row) => row.vehicleId === vehicleId);
    const active = mine.find(isCurrent);
    if (!active) return null;
    const vehicle = await this.vehicles.findVehicle(vehicleId);
    if (!vehicle) return null;
    return {
      vehicleId: vehicle.id,
      registrationPlate: vehicle.registrationPlate,
      vehicleClass: vehicle.vehicleClass,
      status: vehicle.status,
      operationalControl: vehicle.operationalControl,
      currentOdoKm: vehicle.currentOdoKm,
      myBasisPoints: active.ownershipBasisPoints,
      myEffectiveFrom: active.effectiveFrom,
      myHistory: toHistory(mine),
      driverName: await this.vehicles.activeDriverName(vehicleId),
    };
  }

  private denyScope(
    reason: OwnershipScopeReason | 'STAKEHOLDER_INACTIVE',
    detail: Record<string, unknown>,
  ): TransportDomainError {
    this.decide('denied', reason, detail);
    return TransportDomainError.denied(
      'ASSET_STAKEHOLDER_NOT_FOUND',
      'Tài khoản này không có quyền xem xe đã yêu cầu.',
    );
  }

  private decide(
    outcome: 'allowed' | 'denied',
    reason: OwnershipScopeReason | 'STAKEHOLDER_INACTIVE',
    detail: Record<string, unknown>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_ASSET_OWNERSHIP_DECISIONS,
      point: 'ownership.scope.resolve',
      outcome,
      reason,
      detail,
    });
  }
}

/**
 * QUYEN LOI DANG HIEU LUC — `effectiveTo === null`.
 *
 * #242 E6 doi chung minh rang "inactive/expired ownership link is not treated as current access".
 * Chinh sach o day la: HET HAN LA HET DOC, va khong co ngoai le "giu quyen doc lich su". Mot nguoi
 * da ban co phan cua ho khong con la ben huu quan cua chiec xe do, va giu cho ho mot cua so doc
 * "chi de xem lai" se la mot quyet dinh chua ai o phia nghiep vu dua ra.
 *
 * Neu mot ngay B muon giu quyen doc lich su, do phai la mot loi khai MINH THI tren tung quyen loi —
 * khong phai mot tac dung phu cua viec ban ghi con nam trong bang.
 */
const isCurrent = (row: VehicleOwnershipInterest): boolean => row.effectiveTo === null;

/** Lich su CUA CHINH nguoi xem: moi nhat truoc, va khong mang ten nguoi ghi cua B. */
const toHistory = (
  rows: readonly VehicleOwnershipInterest[],
): readonly StakeholderOwnershipPeriod[] =>
  [...rows]
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
    .map((row) => ({
      ownershipBasisPoints: row.ownershipBasisPoints,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
    }));
