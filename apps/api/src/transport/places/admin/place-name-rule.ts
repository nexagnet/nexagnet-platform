import { normalizePlaceLabel } from '../../dispatch/place-resolution.js';
import type { GeofenceSubjectKind } from '../../proof/geofence.repository.js';
import type { PlaceWriteTx } from '../../proof/place-write.store.js';
import { fenceKindLabel, isCustomerLinked } from './place-admin.types.js';

/**
 * LUAT TRUNG TEN cua dia diem van hanh (`#395`).
 *
 * Dieu xe giai mot nhan chang ra toa do bang `normalizePlaceLabel` (bo dau, hoa, gop dau cach) tren
 * MOI hang rao con hieu luc that — nhan hang rao TRUOC, ten dia diem phap nhan SAU — va hai hang rao
 * khac nhau trung mot khoa la `PICKUP_LABEL_AMBIGUOUS`: ca hai khong giai duoc nua. Nen mot ten moi
 * phai khac (sau chuan hoa) MOI nhan hang rao con hieu luc that cua MOI loai, va moi ten dia diem cua
 * chung. Cung ham chuan hoa voi dieu xe, nen "trung" o day nghia dung la "se thanh mo ho" o do.
 *
 * Chi kiem khi TAO, khi DOI TEN, va khi BAT LAI: mot lan sua khong dung toi ten van qua ke ca khi du
 * lieu cu da co mot va cham (man hinh hien va cham do de nguoi dung tu sua).
 */

export interface PlaceNameEntry {
  readonly geofenceId: string;
  readonly subjectKind: GeofenceSubjectKind;
  readonly subjectId: string | null;
  readonly label: string;
  /** Ten dia diem phap nhan (chi `COUNTERPARTY_SITE`). */
  readonly siteName: string | null;
}

/** Chinh dia diem dang sua — khong va cham voi chinh no. */
export interface PlaceNameSelf {
  readonly geofenceIds?: readonly string[];
  readonly siteId?: string | null;
}

export interface PlaceNameConflict {
  readonly entry: PlaceNameEntry;
  /** Ten da va cham, dung nhu dang dung (nhan hang rao hoac ten dia diem). */
  readonly conflictName: string;
}

/** Ham THUAN: MOI va cham cua `name` trong so ten, theo thu tu cua so. */
export function listPlaceNameConflicts(
  name: string,
  entries: readonly PlaceNameEntry[],
  self: PlaceNameSelf = {},
): readonly PlaceNameConflict[] {
  const key = normalizePlaceLabel(name);
  if (key === '') return [];
  const ownFences = new Set(self.geofenceIds ?? []);
  const ownSiteId = self.siteId ?? null;
  return entries.flatMap((entry): PlaceNameConflict[] => {
    if (ownFences.has(entry.geofenceId)) return [];
    if (normalizePlaceLabel(entry.label) === key) return [{ entry, conflictName: entry.label }];
    const ownSite = ownSiteId !== null && entry.subjectId === ownSiteId;
    if (!ownSite && entry.siteName !== null && normalizePlaceLabel(entry.siteName) === key) {
      return [{ entry, conflictName: entry.siteName }];
    }
    return [];
  });
}

/** Va cham DAU TIEN, hoac `null`. */
export function findPlaceNameConflict(
  name: string,
  entries: readonly PlaceNameEntry[],
  self: PlaceNameSelf = {},
): PlaceNameConflict | null {
  return listPlaceNameConflicts(name, entries, self)[0] ?? null;
}

/** Moi ten dang hieu luc — hang rao con hieu luc that + ten dia diem cua chung. Doc SAU khoa. */
export async function loadPlaceNameIndex(
  tx: Pick<PlaceWriteTx, 'geofences' | 'sites'>,
): Promise<readonly PlaceNameEntry[]> {
  const fences = await tx.geofences.listEffectivelyActive();
  const siteIds = [
    ...new Set(
      fences.flatMap((fence) =>
        fence.subjectKind === 'COUNTERPARTY_SITE' && fence.subjectId !== null
          ? [fence.subjectId]
          : [],
      ),
    ),
  ];
  const sites = siteIds.length === 0 ? [] : await tx.sites.findManyActive(siteIds);
  const siteNames = new Map(sites.map((site) => [site.id, site.name] as const));
  return fences.map((fence) => ({
    geofenceId: fence.id,
    subjectKind: fence.subjectKind,
    subjectId: fence.subjectId,
    label: fence.label,
    siteName:
      fence.subjectKind === 'COUNTERPARTY_SITE' && fence.subjectId !== null
        ? (siteNames.get(fence.subjectId) ?? null)
        : null,
  }));
}

export interface PlaceNameConflictDetail {
  readonly conflictName: string;
  readonly conflictKindLabel: string;
  readonly ownerName?: string;
}

/** Noi ro va cham LA CAI GI: ten, loai (bang tieng Viet), va cua ai. */
export async function describePlaceNameConflict(
  tx: PlaceWriteTx,
  conflict: PlaceNameConflict,
): Promise<PlaceNameConflictDetail> {
  const { entry } = conflict;
  if (entry.subjectKind === 'COUNTERPARTY_SITE' && entry.subjectId !== null) {
    const site = await tx.sites.find(entry.subjectId);
    const party = site ? await tx.counterparties.find(site.counterpartyId) : null;
    const links = party ? await tx.counterparties.listLinks(party.id) : [];
    return {
      conflictName: conflict.conflictName,
      conflictKindLabel: fenceKindLabel(entry.subjectKind, isCustomerLinked(links)),
      ...(party ? { ownerName: party.name } : {}),
    };
  }
  if (entry.subjectKind === 'CUSTOMER' && entry.subjectId !== null) {
    const customer = await tx.customers.findCustomer(entry.subjectId);
    return {
      conflictName: conflict.conflictName,
      conflictKindLabel: fenceKindLabel(entry.subjectKind, false),
      ...(customer ? { ownerName: customer.name } : {}),
    };
  }
  return {
    conflictName: conflict.conflictName,
    conflictKindLabel: fenceKindLabel(entry.subjectKind, false),
  };
}
