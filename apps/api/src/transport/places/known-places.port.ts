import { Injectable, Optional } from '@nestjs/common';
import { CounterpartyRepository } from '../counterparty/counterparty.repository.js';
import { CounterpartySiteService } from '../counterparty/site.service.js';
import { FleetRepository } from '../fleet/fleet.repository.js';
import { GeofenceRepository, type Geofence } from '../proof/geofence.repository.js';
import { isCustomerLinked } from './admin/place-admin.types.js';
import { buildKnownPlaces, type KnownSiteName } from './known-places.js';
import type { KnownPlace } from './place-search.types.js';

/**
 * CUA SO CHI DOC vao so hang rao — thuoc `transport-proof`, doc tu `transport-core`.
 *
 * Man tao don thuoc `transport-core`; so hang rao thuoc `transport-proof`. Cung khuon
 * `DispatchLocationFacts`: cong nay la TUY CHON, adapter chi duoc dang ky khi khach bat
 * `transport-proof`, va `TransportPlaceService` tiem no bang `@Optional()`. Vang mat thi man hinh
 * noi "chua co so dia diem da biet" — dung, chu khong phai "khong co dia diem nao".
 *
 * Khong mot ham ghi nao: `NO_CROSS_CONTEXT_REPOSITORY_WRITE` duoc dat bang CAU TRUC.
 */
export abstract class KnownPlacesFacts {
  abstract listKnownPlaces(): Promise<readonly KnownPlace[]>;
}

/**
 * Tiem bon token DUOC EXPORT: `GeofenceRepository` (tu `TransportProofModule`),
 * `CounterpartySiteService`, `CounterpartyRepository` va `FleetRepository` (tu `TransportModule`).
 * Adapter dang ky o GOC chi thay danh sach export — mot provider noi bo o day se lam tien trinh api
 * chet luc khoi dong (da xay ra that).
 *
 * `#395`: doc hang rao CON HIEU LUC THAT (`listEffectivelyActive()` — cung vi tu voi dieu xe va luat
 * trung ten), va dat ten chu cho moi loai (khach hang cua hang rao `CUSTOMER` kieu cu doc qua
 * `FleetRepository`, cuoi va tuy chon cho spec dung adapter theo vi tri).
 *
 * `#395` §2.1: nhan loai cua dia diem phap nhan can biet phap nhan co lien ket KHACH HANG khong —
 * `CounterpartyRepository` la BAT BUOC (khong `@Optional`): thieu no thi moi kho khach hang se lang
 * le mang nhan "Nhà máy / kho đối tác". Lien ket doc MOT lan cho moi phap nhan (`listLinksOf`).
 */
@Injectable()
export class KnownPlacesFactsAdapter extends KnownPlacesFacts {
  constructor(
    private readonly geofences: GeofenceRepository,
    private readonly sites: CounterpartySiteService,
    private readonly counterparties: CounterpartyRepository,
    @Optional() private readonly customers?: FleetRepository,
  ) {
    super();
  }

  async listKnownPlaces(): Promise<readonly KnownPlace[]> {
    const fences = await this.geofences.listEffectivelyActive();
    const siteIds = fences.flatMap((fence) =>
      fence.subjectKind === 'COUNTERPARTY_SITE' && fence.subjectId !== null
        ? [fence.subjectId]
        : [],
    );
    // Mot lan doc theo lo cho moi dia diem, khong N lan — xem `CounterpartySiteService.activeViews`.
    const views = siteIds.length === 0 ? [] : await this.sites.activeViews([...new Set(siteIds)]);
    const customerParties = await this.customerLinkedParties(
      views.map((view) => view.counterpartyId),
    );
    const sitesById = new Map<string, KnownSiteName>(
      views.map((view) => [
        view.site.id,
        {
          siteName: view.site.name,
          counterpartyName: view.counterpartyName,
          customerLinked: customerParties.has(view.counterpartyId),
        },
      ]),
    );
    return buildKnownPlaces(fences, sitesById, await this.customerNames(fences));
  }

  /** Phap nhan nao (trong danh sach) co lien ket khach hang — MOT lan doc lien ket. */
  private async customerLinkedParties(ids: readonly string[]): Promise<ReadonlySet<string>> {
    if (ids.length === 0) return new Set();
    const links = await this.counterparties.listLinksOf([...new Set(ids)]);
    const linksOf = (id: string) => links.filter((link) => link.counterpartyId === id);
    return new Set(ids.filter((id) => isCustomerLinked(linksOf(id))));
  }

  /** Ten khach cua cac hang rao `CUSTOMER` kieu cu — hiem, nen doc tung khach la du. */
  private async customerNames(fences: readonly Geofence[]): Promise<ReadonlyMap<string, string>> {
    const customers = this.customers;
    const ids = [
      ...new Set(
        fences.flatMap((fence) =>
          fence.subjectKind === 'CUSTOMER' && fence.subjectId !== null ? [fence.subjectId] : [],
        ),
      ),
    ];
    if (ids.length === 0 || customers === undefined) return new Map();
    const rows = await Promise.all(ids.map((id) => customers.findCustomer(id)));
    return new Map(rows.flatMap((row) => (row ? [[row.id, row.name] as const] : [])));
  }
}
