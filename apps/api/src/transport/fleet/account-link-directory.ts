import { Injectable } from '@nestjs/common';
import { AssetOwnershipRepository } from '../asset-ownership/asset-ownership.repository.js';
import type { DriverStatus, PartyStatus } from '../transport.types.js';
import { FleetRepository } from './fleet.repository.js';

/** Ho so lai xe dang noi voi mot tai khoan — du de man hinh quan tri noi ra "day la ai". */
export interface DriverAccountLinkView {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly status: DriverStatus;
  /** Xe lai xe nay DANG phu trach (ban phan cong con hieu luc), neu co. */
  readonly vehicle: { readonly id: string; readonly registrationPlate: string } | null;
}

/** Ho so ben gop von dang noi voi mot tai khoan. */
export interface StakeholderAccountLinkView {
  readonly id: string;
  readonly name: string;
  readonly status: PartyStatus;
}

/** `GET /transport/account-links/:authUserId`. */
export interface AccountLinksView {
  readonly driver: DriverAccountLinkView | null;
  readonly stakeholder: StakeholderAccountLinkView | null;
}

/**
 * DANH BA LIEN KET TAI KHOAN cua mien van tai (`#395`) — CHI DOC.
 *
 * Mot tai khoan nen tang (`User.id`) co the dang la hai thu trong mien van tai: mot LAI XE
 * (`TransportDriver.authUserId`) va/hoac mot BEN GOP VON (`TransportAssetStakeholder.authUserId`).
 * Hai lien ket do mo hai PHAM VI ma khong dong quyen rieng nao cap duoc, nen man hinh
 * "Nguoi nay lam duoc gi?" phai doc ra chung tu day.
 *
 * MOT cho doc, hai noi dung: route quan tri `GET /transport/account-links/:authUserId` va mien phan
 * quyen `transport` (`describeScopes`, `checkAccessChange`) — hai cau tra loi khong lech nhau duoc.
 */
@Injectable()
export class TransportAccountLinkDirectory {
  constructor(
    private readonly fleet: FleetRepository,
    private readonly ownership: AssetOwnershipRepository,
  ) {}

  async forUser(authUserId: string): Promise<AccountLinksView> {
    const [driver, stakeholder] = await Promise.all([
      this.driverFor(authUserId),
      this.stakeholderFor(authUserId),
    ]);
    return { driver, stakeholder };
  }

  async driverFor(authUserId: string): Promise<DriverAccountLinkView | null> {
    const driver = await this.fleet.findDriverByAuthUserId(authUserId);
    if (!driver) return null;
    const vehicleId = await this.fleet.activeVehicleForDriver(driver.id);
    const vehicle = vehicleId ? await this.fleet.findVehicle(vehicleId) : null;
    return {
      id: driver.id,
      name: driver.fullName,
      phone: driver.phone,
      status: driver.status,
      vehicle: vehicle ? { id: vehicle.id, registrationPlate: vehicle.registrationPlate } : null,
    };
  }

  async stakeholderFor(authUserId: string): Promise<StakeholderAccountLinkView | null> {
    const stakeholder = await this.ownership.findStakeholderByAuthUser(authUserId);
    if (!stakeholder) return null;
    return { id: stakeholder.id, name: stakeholder.displayName, status: stakeholder.status };
  }
}
