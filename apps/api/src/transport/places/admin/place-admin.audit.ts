import type { AppendAuditLogCommand } from '../../../audit/audit-log.service.js';
import type { CounterpartySite } from '../../counterparty/site.types.js';
import type { DepotOpenWork } from '../../planning/depot-open-work.js';
import type { GeofenceRecord } from '../../proof/geofence.repository.js';
import type { PlaceOwnerOutcome } from './place-owner.js';

/**
 * DAU VET cua man "Dia diem van hanh" (`#395`) — ham THUAN: tu ket qua mot lan ghi ra cac dong
 * `transport.place.*` / `transport.counterparty*`. `PlaceAdminService` dat chung vao CUNG giao dich
 * voi lan ghi (`runTraced`, `place-write.store.ts`).
 *
 * Dau vet KHONG mang dia chi tho (khoa `address` bi che o `redactAuditValue`) va KHONG chep ghi chu
 * (chu tu do, co the mang du lieu ca nhan): no ghi `addressChanged` / `noteChanged`.
 */

/** Ket qua cua mot lan ghi trong giao dich — du de dung dau vet va quyet dinh. */
export interface WriteOutcome {
  readonly changed: boolean;
  readonly fence: GeofenceRecord;
  readonly before: GeofenceRecord | null;
  readonly siteBefore?: CounterpartySite | null;
  readonly siteAfter?: CounterpartySite | null;
  readonly owner?: PlaceOwnerOutcome;
  readonly openWork?: DepotOpenWork | null;
  readonly standby?: boolean;
  readonly otherFences?: readonly GeofenceRecord[];
}

export function createEntries(outcome: WriteOutcome, actor: string): AppendAuditLogCommand[] {
  const owner = outcome.owner;
  return [
    ...(owner?.partyCreated
      ? [
          {
            actor,
            action: 'transport.counterparty.create',
            entityType: 'TransportCounterparty',
            entityId: owner.party.id,
            before: null,
            after: owner.party,
          },
        ]
      : []),
    ...(owner?.linkCreated
      ? [
          {
            actor,
            action: 'transport.counterparty.link',
            entityType: 'TransportCounterpartyLink',
            entityId: `${owner.linkCreated.kind}:${owner.linkCreated.subjectId}`,
            before: null,
            after: { ...owner.linkCreated, counterpartyName: owner.party.name },
          },
        ]
      : []),
    ...(owner
      ? [
          {
            actor,
            action: owner.siteBefore
              ? 'transport.counterparty_site.update'
              : 'transport.counterparty_site.create',
            entityType: 'TransportCounterpartySite',
            entityId: owner.site.id,
            before: owner.siteBefore,
            after: owner.site,
          },
        ]
      : []),
    {
      actor,
      action: 'transport.place.create',
      entityType: 'TransportGeofence',
      entityId: outcome.fence.id,
      before: null,
      after: {
        ...placeSnapshot(outcome.fence),
        addressChanged: outcome.fence.address !== null,
        ...(owner ? { owner: ownerSnapshot(owner) } : {}),
        ...(outcome.standby ? { standby: true } : {}),
      },
    },
  ];
}

/** Sua / tat / bat — rong khi lan ghi khong doi gi (tat lan hai, bat mot dia diem dang bat). */
export function changeEntries(
  operation: 'update' | 'deactivate' | 'activate',
  outcome: WriteOutcome,
  actor: string,
  extra: Readonly<Record<string, unknown>>,
): AppendAuditLogCommand[] {
  const before = outcome.before;
  if (!outcome.changed || before === null) return [];
  const site =
    outcome.siteBefore && outcome.siteAfter && outcome.siteBefore !== outcome.siteAfter
      ? [
          {
            actor,
            action: 'transport.counterparty_site.update',
            entityType: 'TransportCounterpartySite',
            entityId: outcome.siteBefore.id,
            before: outcome.siteBefore,
            after: outcome.siteAfter,
          },
        ]
      : [];
  const siblings = (outcome.otherFences ?? []).map((sibling) => ({
    actor,
    action: `transport.place.${operation}`,
    entityType: 'TransportGeofence',
    entityId: sibling.id,
    before: placeSnapshot(sibling),
    after: { ...placeSnapshot(sibling), status: 'INACTIVE', viaPlace: outcome.fence.id },
  }));
  return [
    ...site,
    ...siblings,
    {
      actor,
      action: `transport.place.${operation}`,
      entityType: 'TransportGeofence',
      entityId: outcome.fence.id,
      before: placeSnapshot(before),
      after: {
        ...placeSnapshot(outcome.fence),
        addressChanged: before.address !== outcome.fence.address,
        noteChanged: before.note !== outcome.fence.note,
        ...(outcome.openWork ? { acknowledgedOpenWork: openWorkSnapshot(outcome.openWork) } : {}),
        ...extra,
      },
    },
  ];
}

/** Doi bai chinh: bai cu tat (ke ten bai thay), bai moi thanh bai chinh. */
export function primarySwitchEntries(
  outcome: WriteOutcome,
  actor: string,
): AppendAuditLogCommand[] {
  const before = outcome.before;
  if (!outcome.changed || before === null) return [];
  const replaced = outcome.otherFences ?? [];
  return [
    ...replaced.map((old) => ({
      actor,
      action: 'transport.place.deactivate',
      entityType: 'TransportGeofence',
      entityId: old.id,
      before: placeSnapshot(old),
      after: { ...placeSnapshot(old), status: 'INACTIVE', replacedBy: outcome.fence.id },
    })),
    {
      actor,
      action: 'transport.place.make_primary_depot',
      entityType: 'TransportGeofence',
      entityId: outcome.fence.id,
      before: {
        ...placeSnapshot(before),
        primaryDepot: replaced[0] ? { id: replaced[0].id, code: replaced[0].subjectId } : null,
      },
      after: {
        ...placeSnapshot(outcome.fence),
        primaryDepot: { id: outcome.fence.id, code: outcome.fence.subjectId },
        ...(outcome.openWork ? { acknowledgedOpenWork: openWorkSnapshot(outcome.openWork) } : {}),
      },
    },
  ];
}

/**
 * Dau vet cua MOT dia diem — khoa song sot qua `redactAuditValue`. KHONG co khoa `address`: dia
 * chi la du lieu vi tri va bi che; nguoi goi ghi `addressChanged` thay the.
 */
function placeSnapshot(fence: GeofenceRecord): Record<string, unknown> {
  return {
    label: fence.label,
    kind: fence.subjectKind,
    ...(fence.subjectKind === 'DEPOT' ? { code: fence.subjectId } : {}),
    point: { latitude: fence.latitude, longitude: fence.longitude },
    radiusMetres: fence.radiusMetres,
    status: fence.status,
  };
}

function ownerSnapshot(owner: PlaceOwnerOutcome): Record<string, unknown> {
  return {
    counterpartyId: owner.party.id,
    counterpartyName: owner.party.name,
    counterpartyCreated: owner.partyCreated,
    customerId: owner.customerId,
    customerLinkCreated: owner.linkCreated !== null,
    siteId: owner.site.id,
    siteCreated: owner.siteBefore === null,
  };
}

function openWorkSnapshot(work: DepotOpenWork): Record<string, unknown> {
  return { runs: work.runs, orders: work.orders, idleHours: work.idleHours };
}
