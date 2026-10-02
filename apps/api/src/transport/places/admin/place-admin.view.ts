import type { CounterpartyRepository } from '../../counterparty/counterparty.repository.js';
import type { Counterparty, CounterpartyLink } from '../../counterparty/counterparty.types.js';
import type { CounterpartySiteRepository } from '../../counterparty/site.repository.js';
import type { CounterpartySite } from '../../counterparty/site.types.js';
import { normalizePlaceLabel } from '../../dispatch/place-resolution.js';
import type { FleetRepository } from '../../fleet/fleet.repository.js';
import {
  depotSourceOf,
  type DepotDirectory,
  type DepotEntry,
} from '../../planning/depot-directory.js';
import { resolveDepotFrom } from '../../planning/planning-policy.js';
import type { GeofenceRecord, GeofenceRepository } from '../../proof/geofence.repository.js';
import type { TransportCustomer } from '../../transport.types.js';
import {
  listPlaceNameConflicts,
  loadPlaceNameIndex,
  type PlaceNameEntry,
} from './place-name-rule.js';
import {
  MANAGED_PLACE_KINDS,
  PLACE_DISPLAY_KINDS,
  PLACE_KIND_LABEL,
  customerLinkOf,
  displayKindOf,
  isManagedPlaceKind,
  type DepotPlannerStatus,
  type PlaceAdminView,
  type PlaceDepotView,
  type PlaceListQuery,
  type PlaceOwnerView,
} from './place-admin.types.js';

/**
 * KHUNG NHIN cua man "Dia diem van hanh" — CHI DOC (`#395`).
 *
 * Moi cot tren man hinh doc tu MOT nguon da co:
 *   · trang thai hieu luc  — `listEffectivelyActive()` cua kho hang rao (MOT vi tu voi Tao don va
 *                            dieu xe);
 *   · va cham ten          — CHINH so ten va ham chuan hoa ma luat trung ten dung;
 *   · bai xe dung de lap ke hoach — CHINH danh ba bai xe (`DepotDirectoryHub`) va
 *                            `resolveDepotFrom()` ma khau lap ke hoach dung. Khong mot phep tinh
 *                            rieng nao co the noi "dang dung" trong khi khau lap ke hoach noi khac.
 */
export interface PlaceAdminViewSources {
  readonly geofences: GeofenceRepository;
  readonly sites: CounterpartySiteRepository;
  readonly counterparties: CounterpartyRepository;
  readonly customers: Pick<FleetRepository, 'findCustomer'>;
  readonly depots: DepotDirectory;
}

interface OwnerFacts {
  readonly sites: ReadonlyMap<string, CounterpartySite>;
  readonly parties: ReadonlyMap<string, Counterparty>;
  readonly customerLinks: ReadonlyMap<string, CounterpartyLink>;
  readonly customers: ReadonlyMap<string, TransportCustomer>;
}

const KIND_ORDER: Readonly<Record<PlaceAdminView['displayKind'], number>> = Object.fromEntries(
  PLACE_DISPLAY_KINDS.map((kind, index) => [kind, index]),
) as Record<PlaceAdminView['displayKind'], number>;

export class PlaceAdminViews {
  constructor(private readonly sources: PlaceAdminViewSources) {}

  async list(query: PlaceListQuery = {}): Promise<readonly PlaceAdminView[]> {
    const fences = await this.sources.geofences.listAll({ subjectKinds: MANAGED_PLACE_KINDS });
    const views = await this.build(fences);
    const needle = normalizePlaceLabel(query.q ?? '');
    return views
      .filter((view) => query.kind === undefined || view.displayKind === query.kind)
      .filter((view) => matchesStatus(view, query.status ?? 'all'))
      .filter((view) => needle === '' || searchText(view).includes(needle))
      .sort(
        (left, right) =>
          KIND_ORDER[left.displayKind] - KIND_ORDER[right.displayKind] ||
          left.name.localeCompare(right.name, 'vi') ||
          left.id.localeCompare(right.id),
      );
  }

  /** Mot dia diem, hoac `null` khi khong co / khong phai loai quan ly o day. */
  async one(id: string): Promise<PlaceAdminView | null> {
    const fence = await this.sources.geofences.find(id);
    if (!fence || !isManagedPlaceKind(fence.subjectKind)) return null;
    const [view] = await this.build([fence]);
    return view ?? null;
  }

  private async build(fences: readonly GeofenceRecord[]): Promise<PlaceAdminView[]> {
    const [owners, index, depots] = await Promise.all([
      this.ownerFacts(fences),
      loadPlaceNameIndex(this.sources),
      this.sources.depots.list(),
    ]);
    const effective = new Set(index.map((entry) => entry.geofenceId));
    return fences.flatMap((fence) => {
      if (!isManagedPlaceKind(fence.subjectKind)) return [];
      return [this.viewOf(fence, owners, effective, index, depots)];
    });
  }

  private viewOf(
    fence: GeofenceRecord,
    owners: OwnerFacts,
    effective: ReadonlySet<string>,
    index: readonly PlaceNameEntry[],
    depots: readonly DepotEntry[],
  ): PlaceAdminView {
    const kind = fence.subjectKind as PlaceAdminView['kind'];
    const owner = ownerOf(fence, owners);
    const displayKind = displayKindOf(kind, owner?.customerId !== undefined);
    const site = fence.subjectKind === 'COUNTERPARTY_SITE' ? (owner?.siteId ?? null) : null;
    const conflicts = listPlaceNameConflicts(fence.label, index, {
      geofenceIds: [fence.id],
      siteId: site,
    }).map((conflict) => conflict.conflictName);
    return {
      id: fence.id,
      kind,
      displayKind,
      kindLabel: PLACE_KIND_LABEL[displayKind],
      name: fence.label,
      address: fence.address,
      point: { latitude: fence.latitude, longitude: fence.longitude },
      radiusMetres: fence.radiusMetres,
      status: fence.status,
      effectiveStatus:
        fence.status !== 'ACTIVE'
          ? 'INACTIVE'
          : effective.has(fence.id)
            ? 'ACTIVE'
            : 'OWNER_INACTIVE',
      note: fence.note,
      owner,
      depot: kind === 'DEPOT' ? depotView(fence, depots) : null,
      conflicts: [...new Set(conflicts)],
      updatedAt: fence.updatedAt,
    };
  }

  /** Doc chu cua moi hang rao theo lo: dia diem, phap nhan, lien ket khach, khach. */
  private async ownerFacts(fences: readonly GeofenceRecord[]): Promise<OwnerFacts> {
    const siteIds = subjectIds(fences, 'COUNTERPARTY_SITE');
    const siteRows = await Promise.all(siteIds.map((id) => this.sources.sites.find(id)));
    const sites = new Map(siteRows.flatMap((site) => (site ? [[site.id, site] as const] : [])));
    const partyIds = [...new Set([...sites.values()].map((site) => site.counterpartyId))];
    const parties = new Map(
      (partyIds.length === 0 ? [] : await this.sources.counterparties.findMany(partyIds)).map(
        (party) => [party.id, party] as const,
      ),
    );
    const linkLists = await Promise.all(
      partyIds.map((id) => this.sources.counterparties.listLinks(id)),
    );
    const customerLinks = new Map(
      linkLists.flatMap((links) => {
        const link = customerLinkOf(links);
        return link ? [[link.counterpartyId, link] as const] : [];
      }),
    );
    const customerIds = [
      ...new Set([
        ...subjectIds(fences, 'CUSTOMER'),
        ...[...customerLinks.values()].map((link) => link.subjectId),
      ]),
    ];
    const customerRows = await Promise.all(
      customerIds.map((id) => this.sources.customers.findCustomer(id)),
    );
    const customers = new Map(
      customerRows.flatMap((customer) => (customer ? [[customer.id, customer] as const] : [])),
    );
    return { sites, parties, customerLinks, customers };
  }
}

const subjectIds = (fences: readonly GeofenceRecord[], kind: 'COUNTERPARTY_SITE' | 'CUSTOMER') => [
  ...new Set(
    fences.flatMap((fence) =>
      fence.subjectKind === kind && fence.subjectId !== null ? [fence.subjectId] : [],
    ),
  ),
];

function ownerOf(fence: GeofenceRecord, owners: OwnerFacts): PlaceOwnerView | null {
  if (fence.subjectKind === 'COUNTERPARTY_SITE' && fence.subjectId !== null) {
    const site = owners.sites.get(fence.subjectId);
    const party = site ? owners.parties.get(site.counterpartyId) : undefined;
    const link = party ? owners.customerLinks.get(party.id) : undefined;
    const customer = link ? owners.customers.get(link.subjectId) : undefined;
    return {
      counterpartyId: party?.id ?? site?.counterpartyId ?? null,
      counterpartyName: party?.name ?? null,
      ...(link ? { customerId: link.subjectId } : {}),
      ...(customer ? { customerName: customer.name } : {}),
      siteId: fence.subjectId,
      siteName: site?.name ?? null,
    };
  }
  if (fence.subjectKind === 'CUSTOMER' && fence.subjectId !== null) {
    const customer = owners.customers.get(fence.subjectId);
    return {
      counterpartyId: null,
      counterpartyName: null,
      customerId: fence.subjectId,
      ...(customer ? { customerName: customer.name } : {}),
      siteId: null,
      siteName: null,
    };
  }
  return null;
}

/**
 * Bai nay voi khau lap ke hoach — tu CHINH danh ba va luat giai bai cua khau do.
 */
function depotView(fence: GeofenceRecord, depots: readonly DepotEntry[]): PlaceDepotView {
  const source = depotSourceOf(depots);
  const resolution = resolveDepotFrom(depots);
  const mine = depots.find((entry) => entry.geofenceId === fence.id);
  let plannerStatus: DepotPlannerStatus;
  if (fence.status !== 'ACTIVE') plannerStatus = 'STANDBY';
  else if (mine === undefined) plannerStatus = 'NOT_IN_USE';
  else if (resolution.kind === 'AMBIGUOUS') plannerStatus = 'AMBIGUOUS';
  else if (resolution.kind === 'RESOLVED' && resolution.depot.code === mine.code) {
    plannerStatus = 'IN_USE';
  } else plannerStatus = 'NOT_IN_USE';
  return { code: fence.subjectId ?? '', plannerStatus, source };
}

function matchesStatus(view: PlaceAdminView, status: 'active' | 'inactive' | 'all'): boolean {
  if (status === 'all') return true;
  return status === 'active'
    ? view.effectiveStatus === 'ACTIVE'
    : view.effectiveStatus !== 'ACTIVE';
}

function searchText(view: PlaceAdminView): string {
  return normalizePlaceLabel(
    [
      view.name,
      view.address,
      view.owner?.counterpartyName,
      view.owner?.customerName,
      view.owner?.siteName,
      view.depot?.code,
    ]
      .filter((part): part is string => typeof part === 'string')
      .join(' '),
  );
}
