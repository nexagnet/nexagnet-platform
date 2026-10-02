import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditLogService, type AppendAuditLogCommand } from '../../../audit/audit-log.service.js';
import { TelemetryService } from '../../../observability/telemetry.service.js';
import { CounterpartyRepository } from '../../counterparty/counterparty.repository.js';
import { CounterpartySiteRepository } from '../../counterparty/site.repository.js';
import type { CounterpartySite } from '../../counterparty/site.types.js';
import { normalizePlaceLabel } from '../../dispatch/place-resolution.js';
import { FleetRepository } from '../../fleet/fleet.repository.js';
import {
  isWithinRoadNetworkBoundingBox,
  parseGeoPoint,
  type GeoPoint,
} from '../../geo/geo-point.js';
import { DepotDirectoryHub, type DepotDirectory } from '../../planning/depot-directory.js';
import {
  DepotOpenWorkReader,
  sameDepotLabel,
  type DepotChangeKind,
  type DepotOpenWork,
} from '../../planning/depot-open-work.js';
import {
  GeofenceRepository,
  type GeofenceRecord,
  type GeofenceSubjectKind,
} from '../../proof/geofence.repository.js';
import {
  PlaceWriteStore,
  placeStorageConflict,
  runTraced,
  type PlaceWriteTx,
} from '../../proof/place-write.store.js';
import { TRANSPORT_PROOF_POLICY, type TransportProofPolicy } from '../../proof/tracking-policy.js';
import { TransportDomainError } from '../../transport.errors.js';
import {
  TRANSPORT_PLACE_ADMIN_DECISIONS,
  type PlaceWriteReason,
} from '../place-admin-decisions.js';
import { PlaceAdminError } from './place-admin-error.js';
import { PlaceAdminViews } from './place-admin.view.js';
import {
  isManagedPlaceKind,
  type CreatePlaceCommand,
  type DeactivatePlaceCommand,
  type MakePrimaryDepotCommand,
  type PlaceAdminView,
  type PlaceHistoryEntry,
  type PlaceListQuery,
  type PlaceWriteCaller,
  type UpdatePlaceCommand,
} from './place-admin.types.js';
import {
  describePlaceNameConflict,
  findPlaceNameConflict,
  loadPlaceNameIndex,
  type PlaceNameSelf,
} from './place-name-rule.js';
import {
  changeEntries,
  createEntries,
  primarySwitchEntries,
  type WriteOutcome,
} from './place-admin.audit.js';
import { ownerInactive, resolveSiteOwner } from './place-owner.js';
import { COUNTERPARTY_MANAGE_REQUIRED_MESSAGE } from './place-write-caller.js';

type Operation = 'create' | 'update' | 'deactivate' | 'activate' | 'make_primary_depot';

const DEPOT_CODE_MAX_SLUG = 40;

/**
 * DIA DIEM VAN HANH — luat o DAY (`#395`).
 *
 * Moi lan ghi di qua `PlaceWriteStore` (MOT giao dich, sau MOT khoa) va ghi dau vet
 * `transport.place.*` voi `before`/`after` TRONG chinh giao dich do (`runTraced`,
 * `place-admin.audit.ts`). Dau vet KHONG mang dia chi tho (khoa `address` bi che o
 * `redactAuditValue`); no ghi `addressChanged` de nguoi doc van biet dia chi co doi hay khong.
 *
 * Bai xe (DEPOT) la diem dau chang rong va diem dong vong chay cua khau lap ke hoach — nen doi ten,
 * tat, hay doi bai chinh khi con viec dang mo phai duoc NGUOI DUNG xac nhan (`acknowledgeOpenWork`),
 * va danh sach viec bi anh huong di vao dau vet.
 */
@Injectable()
export class PlaceAdminService {
  private readonly views: PlaceAdminViews;

  constructor(
    private readonly store: PlaceWriteStore,
    private readonly geofences: GeofenceRepository,
    sites: CounterpartySiteRepository,
    counterparties: CounterpartyRepository,
    fleet: FleetRepository,
    @Inject(DepotDirectoryHub) depots: DepotDirectory,
    private readonly openWork: DepotOpenWorkReader,
    @Inject(TRANSPORT_PROOF_POLICY) private readonly policy: TransportProofPolicy,
    @Optional() private readonly audit?: AuditLogService,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {
    this.views = new PlaceAdminViews({
      geofences,
      sites,
      counterparties,
      customers: fleet,
      depots,
    });
  }

  list(query: PlaceListQuery = {}): Promise<readonly PlaceAdminView[]> {
    return this.views.list(query);
  }

  async history(id: string): Promise<readonly PlaceHistoryEntry[]> {
    const fence = await this.requireManaged(this.geofences, id);
    if (!this.audit) return [];
    const [own, site] = await Promise.all([
      this.audit.list({ entityType: 'TransportGeofence', entityId: fence.id, limit: 100 }),
      fence.subjectKind === 'COUNTERPARTY_SITE' && fence.subjectId !== null
        ? this.audit.list({
            entityType: 'TransportCounterpartySite',
            entityId: fence.subjectId,
            limit: 100,
          })
        : Promise.resolve([]),
    ]);
    return [...own, ...site]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((row) => ({
        at: row.createdAt,
        actor: row.actor,
        action: row.action,
        entityType: row.entityType,
        before: row.before,
        after: row.after,
      }));
  }

  /* ------------------------------------------------------------------ *
   * GHI
   * ------------------------------------------------------------------ */

  create(command: CreatePlaceCommand, caller: PlaceWriteCaller): Promise<PlaceAdminView> {
    return this.write('create', command.kind, null, async () => {
      const point = this.requirePoint(command.point);
      this.requireRadius(command.radiusMetres);
      if (
        command.kind === 'DEPOT' &&
        (command.owner !== undefined || command.siteId !== undefined)
      ) {
        throw TransportDomainError.invalid(
          'PLACE_OWNER_INVALID',
          'Bãi xe là của chính công ty — không chọn chủ hay địa điểm của đơn vị khác.',
        );
      }
      if (command.kind === 'COUNTERPARTY_SITE') this.requireCounterpartyManage(caller, 'create');

      const trail = (written: WriteOutcome) => createEntries(written, caller.actor);
      const outcome = await this.inStore(trail, async (tx) => {
        await this.requireNameFree(tx, command.name, {});
        if (command.kind === 'DEPOT') return this.createDepot(tx, command, point, caller.actor);
        const owner = await resolveSiteOwner(tx, command, caller.actor);
        const fence = await tx.geofences.register({
          label: command.name,
          subjectKind: 'COUNTERPARTY_SITE',
          subjectId: owner.site.id,
          latitude: point.latitude,
          longitude: point.longitude,
          radiusMetres: command.radiusMetres,
          note: command.note ?? null,
          address: command.address ?? null,
          recordedBy: caller.actor,
        });
        return { changed: true, fence, before: null, owner, siteBefore: owner.siteBefore };
      });
      this.decideWritten('create', outcome);
      return this.requireView(outcome.fence.id);
    });
  }

  update(
    id: string,
    command: UpdatePlaceCommand,
    caller: PlaceWriteCaller,
  ): Promise<PlaceAdminView> {
    return this.write('update', null, id, async () => {
      const point = command.point === undefined ? undefined : this.requirePoint(command.point);
      if (command.radiusMetres !== undefined) this.requireRadius(command.radiusMetres);

      const trail = (written: WriteOutcome) => changeEntries('update', written, caller.actor, {});
      const outcome = await this.inStore(trail, async (tx): Promise<WriteOutcome> => {
        const before = await this.requireManaged(tx.geofences, id);
        const nameChanged = command.name !== undefined && command.name !== before.label;
        const siteBefore = await this.siteOf(tx, before);
        const address = command.address;
        const siteAddressChanged =
          siteBefore !== null && address !== undefined && address !== siteBefore.address;
        const addressChanged =
          (address !== undefined && address !== before.address) || siteAddressChanged;
        // Ten va dia chi cua dia diem don vi khac la cua HO SO PHAP NHAN (`TransportCounterpartySite`)
        // — sua chung doi CA quyen do. Hinh hoc (toa do, ban kinh) chi la hang rao.
        if (before.subjectKind === 'COUNTERPARTY_SITE' && (nameChanged || addressChanged)) {
          this.requireCounterpartyManage(caller, 'update', [
            ...(nameChanged ? ['name'] : []),
            ...(addressChanged ? ['address'] : []),
          ]);
        }
        let openWork: DepotOpenWork | null = null;
        if (nameChanged && command.name !== undefined) {
          await this.requireNameFree(tx, command.name, {
            geofenceIds: [before.id],
            siteId: siteBefore?.id ?? null,
          });
          if (siteBefore) await this.requireSiteNameFree(tx, siteBefore, command.name);
          // Chi doi hoa thuong / khoang trang: CUNG mot bai theo luat cua khau lap ke hoach va dong
          // vong chay — khong viec nao doi ket cuc, nen khong hoi.
          if (
            before.subjectKind === 'DEPOT' &&
            before.status === 'ACTIVE' &&
            !sameDepotLabel(before.label, command.name)
          ) {
            openWork = await this.requireOpenWorkAcknowledged(
              before.label,
              command.acknowledgeOpenWork,
              'RENAME',
            );
          }
        }
        const fence = await tx.geofences.update(before.id, {
          ...(nameChanged ? { label: command.name } : {}),
          ...(point === undefined ? {} : { latitude: point.latitude, longitude: point.longitude }),
          ...(command.radiusMetres === undefined ? {} : { radiusMetres: command.radiusMetres }),
          ...(command.note === undefined ? {} : { note: command.note }),
          ...(command.address === undefined ? {} : { address: command.address }),
        });
        // Chi ghi dia diem phap nhan khi ten / dia chi CUA NO doi: gui lai dung gia tri cu khong
        // phai mot lan sua (va khong de lai dong kiem toan rong).
        const siteAfter =
          siteBefore && (nameChanged || siteAddressChanged)
            ? await tx.sites.update(siteBefore.id, {
                ...(nameChanged ? { name: command.name } : {}),
                ...(siteAddressChanged ? { address } : {}),
              })
            : siteBefore;
        return { changed: true, fence: fence ?? before, before, siteBefore, siteAfter, openWork };
      });
      this.decideWritten('update', outcome);
      return this.requireView(outcome.fence.id);
    });
  }

  deactivate(
    id: string,
    command: DeactivatePlaceCommand,
    caller: PlaceWriteCaller,
  ): Promise<PlaceAdminView> {
    return this.write('deactivate', null, id, async () => {
      const trail = (written: WriteOutcome) =>
        changeEntries('deactivate', written, caller.actor, { reason: command.reason });
      const outcome = await this.inStore(trail, async (tx): Promise<WriteOutcome> => {
        const before = await this.requireManaged(tx.geofences, id);
        if (before.subjectKind === 'COUNTERPARTY_SITE') {
          this.requireCounterpartyManage(caller, 'deactivate');
        }
        const siteBefore = await this.siteOf(tx, before);
        const alreadyOff =
          before.status === 'INACTIVE' && (siteBefore === null || siteBefore.status === 'INACTIVE');
        if (alreadyOff) return { changed: false, fence: before, before };

        const openWork =
          before.subjectKind === 'DEPOT' && before.status === 'ACTIVE'
            ? await this.requireOpenWorkAcknowledged(
                before.label,
                command.acknowledgeOpenWork,
                'RELOCATE',
              )
            : null;
        // Tat mot dia diem phap nhan = tat dia diem VA MOI hang rao cua no: cong va bai can cua
        // mot kho da nghi khong con la noi xe lay/giao hang.
        const siblings = siteBefore
          ? await tx.geofences.listAll({
              subjectKinds: ['COUNTERPARTY_SITE'],
              subjectIds: [siteBefore.id],
            })
          : [before];
        await tx.geofences.setStatus(
          siblings.map((fence) => fence.id),
          'INACTIVE',
        );
        const siteAfter = siteBefore
          ? await tx.sites.update(siteBefore.id, { status: 'INACTIVE' })
          : null;
        const fence = (await tx.geofences.find(before.id)) ?? before;
        return {
          changed: true,
          fence,
          before,
          siteBefore,
          siteAfter,
          openWork,
          otherFences: siblings.filter((entry) => entry.id !== before.id),
        };
      });
      this.decideWritten('deactivate', outcome);
      return this.requireView(outcome.fence.id);
    });
  }

  activate(id: string, caller: PlaceWriteCaller): Promise<PlaceAdminView> {
    return this.write('activate', null, id, async () => {
      const trail = (written: WriteOutcome) => changeEntries('activate', written, caller.actor, {});
      const outcome = await this.inStore(trail, async (tx): Promise<WriteOutcome> => {
        const before = await this.requireManaged(tx.geofences, id);
        if (before.subjectKind === 'COUNTERPARTY_SITE') {
          this.requireCounterpartyManage(caller, 'activate');
        }
        const siteBefore = await this.siteOf(tx, before);
        const alreadyOn =
          before.status === 'ACTIVE' && (siteBefore === null || siteBefore.status === 'ACTIVE');
        if (alreadyOn) return { changed: false, fence: before, before };

        await this.requireNameFree(tx, before.label, {
          geofenceIds: [before.id],
          siteId: siteBefore?.id ?? null,
        });
        await this.requireOwnerActive(tx, before, siteBefore);
        if (before.subjectKind === 'DEPOT') await this.requireNoOtherActiveDepot(tx, before);
        const siteAfter = siteBefore
          ? await tx.sites.update(siteBefore.id, { status: 'ACTIVE' })
          : null;
        await tx.geofences.setStatus([before.id], 'ACTIVE');
        const fence = (await tx.geofences.find(before.id)) ?? before;
        return { changed: true, fence, before, siteBefore, siteAfter };
      });
      this.decideWritten('activate', outcome);
      return this.requireView(outcome.fence.id);
    });
  }

  /**
   * DOI BAI CHINH — MOT giao dich: tat bai dang dung roi bat bai nay. Khau lap ke hoach khong bao gio
   * thay mot khoanh "chua khai bai nao" o giua (va chi muc DB khong bao gio thay hai bai cung bat:
   * lenh tat chay truoc lenh bat).
   */
  makePrimaryDepot(
    id: string,
    command: MakePrimaryDepotCommand,
    caller: PlaceWriteCaller,
  ): Promise<PlaceAdminView> {
    return this.write('make_primary_depot', 'DEPOT', id, async () => {
      const trail = (written: WriteOutcome) => primarySwitchEntries(written, caller.actor);
      const outcome = await this.inStore(trail, async (tx): Promise<WriteOutcome> => {
        const before = await this.requireManaged(tx.geofences, id);
        if (before.subjectKind !== 'DEPOT') {
          throw TransportDomainError.invalid(
            'PLACE_NOT_A_DEPOT',
            'Chỉ bãi xe mới đổi thành bãi chính được.',
          );
        }
        if (before.status === 'ACTIVE') return { changed: false, fence: before, before };
        const current = (
          await tx.geofences.listAll({ subjectKinds: ['DEPOT'], status: 'ACTIVE' })
        ).filter((fence) => fence.id !== before.id);
        const openWork =
          current[0] === undefined
            ? null
            : await this.requireOpenWorkAcknowledged(
                current[0].label,
                command.acknowledgeOpenWork,
                'RELOCATE',
              );
        await this.requireNameFree(tx, before.label, {
          geofenceIds: [before.id, ...current.map((fence) => fence.id)],
        });
        await tx.geofences.setStatus(
          current.map((fence) => fence.id),
          'INACTIVE',
        );
        await tx.geofences.setStatus([before.id], 'ACTIVE');
        const fence = (await tx.geofences.find(before.id)) ?? before;
        return { changed: true, fence, before, openWork, otherFences: current };
      });
      this.decideWritten('make_primary_depot', outcome);
      return this.requireView(outcome.fence.id);
    });
  }

  /* ------------------------------------------------------------------ *
   * Luat
   * ------------------------------------------------------------------ */

  private createDepot(
    tx: PlaceWriteTx,
    command: CreatePlaceCommand,
    point: GeoPoint,
    actor: string,
  ): Promise<WriteOutcome> {
    return tx.geofences.listAll({ subjectKinds: ['DEPOT'] }).then(async (depots) => {
      // Da co bai dang bat thi bai moi la BAI DU PHONG (tat): toi da mot bai dang bat — DB giu
      // dieu do, va doi bai la mot thao tac rieng, co xac nhan.
      const standby = depots.some((depot) => depot.status === 'ACTIVE');
      const fence = await tx.geofences.register({
        label: command.name,
        subjectKind: 'DEPOT',
        subjectId: nextDepotCode(
          command.name,
          depots.map((depot) => depot.subjectId),
        ),
        latitude: point.latitude,
        longitude: point.longitude,
        radiusMetres: command.radiusMetres,
        note: command.note ?? null,
        address: command.address ?? null,
        recordedBy: actor,
        status: standby ? 'INACTIVE' : 'ACTIVE',
      });
      return { changed: true, fence, before: null, standby };
    });
  }

  private requirePoint(point: GeoPoint): GeoPoint {
    const parsed = parseGeoPoint(point.latitude, point.longitude);
    if (!parsed.ok) {
      throw TransportDomainError.invalid(
        'GEOFENCE_COORDINATE_REJECTED',
        'Toạ độ không hợp lệ — chọn lại điểm trên bản đồ.',
      );
    }
    if (!isWithinRoadNetworkBoundingBox(parsed.point)) {
      throw this.denied(
        'PLACE_OUTSIDE_SERVICE_AREA',
        'INVALID',
        'Vị trí này nằm ngoài vùng phục vụ — chọn một điểm trong Việt Nam.',
      );
    }
    return parsed.point;
  }

  private requireRadius(radiusMetres: number): void {
    const { min, max } = this.policy.geofenceRadiusMetres;
    if (radiusMetres < min || radiusMetres > max) {
      throw this.denied(
        'GEOFENCE_RADIUS_OUT_OF_RANGE',
        'INVALID',
        `Bán kính phải trong khoảng ${min}–${max} m.`,
      );
    }
  }

  private requireCounterpartyManage(
    caller: PlaceWriteCaller,
    operation: Operation,
    fields: readonly string[] = [],
  ): void {
    if (caller.canManageCounterparties) return;
    throw this.denied(
      'PLACE_SITE_REQUIRES_COUNTERPARTY_MANAGE',
      'DENIED',
      COUNTERPARTY_MANAGE_REQUIRED_MESSAGE,
      { operation, ...(fields.length > 0 ? { fields } : {}) },
    );
  }

  private async requireNameFree(tx: PlaceWriteTx, name: string, self: PlaceNameSelf) {
    const conflict = findPlaceNameConflict(name, await loadPlaceNameIndex(tx), self);
    if (!conflict) return;
    const detail = await describePlaceNameConflict(tx, conflict);
    const owner = detail.ownerName === undefined ? '' : ` của ${detail.ownerName}`;
    throw this.denied(
      'PLACE_NAME_TAKEN',
      'CONFLICT',
      `Tên này đã dùng cho ${detail.conflictKindLabel.toLowerCase()} "${detail.conflictName}"${owner}. Đặt một tên khác để không nhầm hai nơi.`,
      { ...detail },
    );
  }

  private async requireSiteNameFree(
    tx: PlaceWriteTx,
    site: CounterpartySite,
    name: string,
  ): Promise<void> {
    const clash = await tx.sites.findByName(site.counterpartyId, name);
    if (clash && clash.id !== site.id) {
      // Ten phap nhan va ten dia diem trung di vao `detail` de man hinh goi dung ten.
      const party = await tx.counterparties.find(site.counterpartyId);
      throw this.denied(
        'COUNTERPARTY_SITE_NAME_TAKEN',
        'CONFLICT',
        `${party ? `"${party.name}"` : 'Đơn vị này'} đã có một địa điểm khác tên "${clash.name}".`,
        {
          siteId: clash.id,
          siteName: clash.name,
          ...(party ? { counterpartyName: party.name } : {}),
        },
      );
    }
  }

  private async requireOpenWorkAcknowledged(
    depotLabel: string,
    acknowledged: boolean | undefined,
    change: DepotChangeKind,
  ): Promise<DepotOpenWork | null> {
    const work = await this.openWork.openWorkAt(depotLabel, change);
    if (work.runs.length === 0 && work.orders.length === 0) return null;
    if (acknowledged === true) return work;
    throw this.denied('DEPOT_CHANGE_AFFECTS_OPEN_WORK', 'CONFLICT', openWorkMessage(work), {
      runs: work.runs,
      orders: work.orders,
      idleHours: work.idleHours,
    });
  }

  private async requireNoOtherActiveDepot(tx: PlaceWriteTx, depot: GeofenceRecord): Promise<void> {
    const active = (await tx.geofences.listAll({ subjectKinds: ['DEPOT'], status: 'ACTIVE' })).find(
      (fence) => fence.id !== depot.id,
    );
    if (!active) return;
    throw this.denied(
      'DEPOT_ALREADY_ACTIVE',
      'CONFLICT',
      `"${active.label}" đang là bãi chính. Muốn dùng bãi này, hãy chọn "Đổi thành bãi chính".`,
      { activeDepot: { id: active.id, code: active.subjectId, name: active.label } },
    );
  }

  private async requireOwnerActive(
    tx: PlaceWriteTx,
    fence: GeofenceRecord,
    site: CounterpartySite | null,
  ): Promise<void> {
    if (fence.subjectKind === 'COUNTERPARTY_SITE') {
      const party = site ? await tx.counterparties.find(site.counterpartyId) : null;
      if (!party || party.status !== 'ACTIVE') throw ownerInactive(party?.name ?? fence.label);
    }
    if (fence.subjectKind === 'CUSTOMER' && fence.subjectId !== null) {
      const customer = await tx.customers.findCustomer(fence.subjectId);
      if (!customer || customer.status !== 'ACTIVE') {
        throw ownerInactive(customer?.name ?? fence.label);
      }
    }
  }

  private async siteOf(tx: PlaceWriteTx, fence: GeofenceRecord): Promise<CounterpartySite | null> {
    if (fence.subjectKind !== 'COUNTERPARTY_SITE' || fence.subjectId === null) return null;
    return tx.sites.find(fence.subjectId);
  }

  private async requireManaged(geofences: GeofenceRepository, id: string): Promise<GeofenceRecord> {
    const fence = await geofences.find(id);
    if (!fence || !isManagedPlaceKind(fence.subjectKind)) {
      throw TransportDomainError.notFound('PLACE_NOT_FOUND', 'Không tìm thấy địa điểm vận hành.');
    }
    return fence;
  }

  private async requireView(id: string): Promise<PlaceAdminView> {
    const view = await this.views.one(id);
    if (!view) {
      throw TransportDomainError.notFound('PLACE_NOT_FOUND', 'Không tìm thấy địa điểm vận hành.');
    }
    return view;
  }

  /* ------------------------------------------------------------------ *
   * Giao dich, dau vet, quan sat
   * ------------------------------------------------------------------ */

  /**
   * Chay trong kho ghi, dau vet `trail` trong CUNG giao dich (`runTraced`); va cham DB cua mot nguoi
   * ghi ngoai khoa thanh ly do co kieu.
   */
  private async inStore(
    trail: (outcome: WriteOutcome) => readonly AppendAuditLogCommand[],
    work: (tx: PlaceWriteTx) => Promise<WriteOutcome>,
  ): Promise<WriteOutcome> {
    try {
      return await runTraced(this.store, this.audit, work, trail);
    } catch (error) {
      const conflict = placeStorageConflict(error);
      if (!conflict) throw error;
      STORAGE_CONFLICTS.add(conflict);
      throw conflict;
    }
  }

  /**
   * MOT buoc `place.write` cho moi thao tac ghi. Moi tu choi mang ly do cua bo tu vung (ke ca tu
   * luat chu cua dia diem, va tu chi muc DB) duoc ghi quyet dinh `denied` DUNG MOT lan, o day.
   */
  private write<T>(
    operation: Operation,
    kind: GeofenceSubjectKind | null,
    placeId: string | null,
    run: () => Promise<T>,
  ): Promise<T> {
    const attributes = {
      operation,
      ...(kind === null ? {} : { kind }),
      ...(placeId === null ? {} : { placeId }),
    };
    const reported = async (): Promise<T> => {
      try {
        return await run();
      } catch (error) {
        this.reportDenied(operation, error);
        throw error;
      }
    };
    return this.telemetry ? this.telemetry.step('place.write', reported, attributes) : reported();
  }

  private reportDenied(operation: Operation, error: unknown): void {
    if (!(error instanceof TransportDomainError) || !isPlaceWriteReason(error.reason)) return;
    this.decide('denied', error.reason, operation, null, {
      ...(error instanceof PlaceAdminError ? sanitizeDetail(error.detail) : {}),
      ...(STORAGE_CONFLICTS.has(error) ? { storage: true } : {}),
    });
  }

  private denied(
    reason: PlaceWriteReason,
    kind: 'CONFLICT' | 'INVALID' | 'DENIED',
    message: string,
    detail: Readonly<Record<string, unknown>> = {},
  ): PlaceAdminError {
    return new PlaceAdminError(kind, reason, message, detail);
  }

  /**
   * Quyet dinh `allowed` + buoc chuyen trang thai cua MOI hang rao vua doi — SAU commit. Trace tra
   * loi duoc "khau lap ke hoach mat bai nao, luc nao" ma khong phai mo so kiem toan.
   */
  private decideWritten(operation: Operation, outcome: WriteOutcome): void {
    const fence = outcome.fence;
    this.decide(
      'allowed',
      outcome.openWork ? 'PLACE_WRITE_OPEN_WORK_ACKNOWLEDGED' : 'PLACE_WRITE_ALLOWED',
      operation,
      fence.subjectKind,
      {
        changed: outcome.changed,
        placeId: fence.id,
        ...(fence.subjectKind === 'DEPOT' ? { code: fence.subjectId } : {}),
        ...(outcome.standby === undefined ? {} : { standby: outcome.standby }),
        ...(outcome.openWork
          ? { runCount: outcome.openWork.runs.length, orderCount: outcome.openWork.orders.length }
          : {}),
      },
    );
    if (!outcome.changed || !this.telemetry) return;
    // `stateChange` tu bo qua from === to (sua ten, sua ban kinh).
    const moves = [
      { id: fence.id, from: outcome.before?.status ?? null, to: fence.status },
      ...(outcome.otherFences ?? []).map((other) => ({
        id: other.id,
        from: other.status,
        to: 'INACTIVE',
      })),
    ];
    for (const move of moves) {
      this.telemetry.stateChange({
        entity: 'TransportGeofence',
        entityId: move.id,
        from: move.from,
        to: move.to,
      });
    }
  }

  /** Fail-open: telemetry vang mat khong doi ket qua nghiep vu. */
  private decide(
    outcome: 'allowed' | 'denied',
    reason: PlaceWriteReason,
    operation: Operation | null,
    kind: GeofenceSubjectKind | null,
    detail: Readonly<Record<string, unknown>>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_PLACE_ADMIN_DECISIONS,
      point: 'place.write',
      outcome,
      reason,
      detail: {
        ...(operation === null ? {} : { operation }),
        ...(kind === null ? {} : { kind }),
        ...detail,
      },
    });
  }
}

/**
 * Ma bai xe do may chu sinh: `DEPOT-<CHU-KHONG-DAU>`, them `-2`, `-3`... khi trung — ke ca voi bai
 * da tat (chi muc `TransportGeofence_depot_code_key` khong phan biet trang thai).
 */
export function nextDepotCode(name: string, taken: readonly (string | null)[]): string {
  const slug = normalizePlaceLabel(name)
    .replace(/ /g, '-')
    .slice(0, DEPOT_CODE_MAX_SLUG)
    .replace(/-+$/, '');
  const base = `DEPOT-${slug === '' ? 'BAI' : slug}`;
  const used = new Set(taken.filter((code): code is string => code !== null));
  if (!used.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Cau hoi xac nhan khi doi / tat bai xe con viec dang mo — CHI ke phan co that: khong "Còn 0 vòng
 * xe", va cau ve viec tu dong vong chi noi khi CO vong xe.
 */
export function openWorkMessage(work: DepotOpenWork): string {
  const counts = [
    ...(work.runs.length > 0 ? [`${work.runs.length} vòng xe`] : []),
    ...(work.orders.length > 0 ? [`${work.orders.length} đơn`] : []),
  ];
  const closes =
    work.idleHours === null
      ? 'sẽ không tự đóng khi xe về bãi nữa'
      : `sẽ chỉ tự đóng sau ${work.idleHours} giờ không có việc`;
  const runsNote = work.runs.length > 0 ? ` Các vòng xe đó ${closes}.` : '';
  return `Còn ${counts.join(' và ')} đang mở dùng bãi xe này.${runsNote} Xác nhận để tiếp tục.`;
}

/** Loi da dich tu mot va cham chi muc DB (nguoi ghi ngoai khoa) — de quyet dinh ghi `storage`. */
const STORAGE_CONFLICTS = new WeakSet<Error>();

const PLACE_WRITE_REASON_SET: ReadonlySet<string> = new Set(
  Object.keys(TRANSPORT_PLACE_ADMIN_DECISIONS.labels),
);

const isPlaceWriteReason = (reason: string): reason is PlaceWriteReason =>
  PLACE_WRITE_REASON_SET.has(reason);

/** Telemetry: chi ma va con so — ten dia diem va chu cua no o lai trong than loi. */
function sanitizeDetail(detail: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (Array.isArray(detail['runs'])) out['runCount'] = detail['runs'].length;
  if (Array.isArray(detail['orders'])) out['orderCount'] = detail['orders'].length;
  if (typeof detail['conflictKindLabel'] === 'string')
    out['conflictKind'] = detail['conflictKindLabel'];
  if (typeof detail['operation'] === 'string') out['operation'] = detail['operation'];
  // Ten TRUONG (`name` / `address`), khong phai gia tri cua chung.
  if (Array.isArray(detail['fields'])) out['fields'] = detail['fields'];
  return out;
}
