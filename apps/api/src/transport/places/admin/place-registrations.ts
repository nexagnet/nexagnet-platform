import { Inject, Injectable } from '@nestjs/common';
import {
  CounterpartySitePlaceGuardHub,
  type CounterpartySitePlaceGuard,
  type LegacySiteChange,
  type LegacySiteChangeVerdict,
} from '../../counterparty/counterparty-site-place-guard.js';
import {
  ConfigDepotDirectory,
  DepotDirectory,
  DepotDirectoryHub,
  type DepotEntry,
} from '../../planning/depot-directory.js';
import { TRANSPORT_PLANNING_POLICY } from '../../planning/planning-policy.js';
import type { TransportPlanningPolicy } from '../../planning/planning.types.js';
import { GeofenceRepository } from '../../proof/geofence.repository.js';

/**
 * BAI XE DUOC QUAN LY — nguon cua danh ba bai xe khi khach bat `transport-proof` (`#395`).
 *
 * LUAT UU TIEN, noi bang mot cau: co MOT hang rao `DEPOT` nao (ke ca da tat) thi man "Dia diem van
 * hanh" LA su that — chi bai dang bat moi duoc dung, va KHONG BAO GIO lui ve cau hinh; chua co hang
 * rao `DEPOT` nao thi doc cau hinh goi khach (khach cu chua khai bai tren man hinh van chay nhu
 * truoc).
 *
 * "Ke ca da tat" la co y: Giam doc tat bai cuoi cung thi khau lap ke hoach phai noi
 * `DEPOT_NOT_CONFIGURED`, khong phai am tham hoi sinh mot bai trong tep cau hinh ma man hinh khong
 * hien.
 */
export class GeofenceDepotDirectory extends DepotDirectory {
  constructor(
    private readonly geofences: GeofenceRepository,
    private readonly fallback: DepotDirectory,
  ) {
    super();
  }

  async list(): Promise<readonly DepotEntry[]> {
    const fences = await this.geofences.listAll({ subjectKinds: ['DEPOT'] });
    if (fences.length === 0) return this.fallback.list();
    return fences.map((fence) => ({
      code: fence.subjectId ?? fence.id,
      label: fence.label,
      active: fence.status === 'ACTIVE',
      source: 'MANAGED' as const,
      geofenceId: fence.id,
      point: { latitude: fence.latitude, longitude: fence.longitude },
      radiusMetres: fence.radiusMetres,
    }));
  }
}

/**
 * CONG THAT cua duong sua dia diem cu (`#395`): mot dia diem co hang rao (MOI trang thai) la mot dia
 * diem van hanh — ten va trang thai cua no chi doi o man "Dia diem van hanh", cung hang rao, trong
 * mot giao dich.
 */
export class GeofenceSitePlaceGuard implements CounterpartySitePlaceGuard {
  constructor(private readonly geofences: GeofenceRepository) {}

  async checkLegacySiteChange(change: LegacySiteChange): Promise<LegacySiteChangeVerdict> {
    const fences = await this.geofences.listAll({
      subjectKinds: ['COUNTERPARTY_SITE'],
      subjectIds: [change.siteId],
    });
    return fences.length > 0
      ? { allowed: false, reason: 'COUNTERPARTY_SITE_MANAGED_AS_PLACE' }
      : { allowed: true };
  }
}

/**
 * DANG KY hai nguon cua `transport-proof` vao hai cho noi cua `transport-core` — TRONG HAM DUNG.
 *
 * Ham dung chu khong `onModuleInit`: moi provider duoc dung truoc khi bat ky moc khoi dong nao chay,
 * ke ca `RunClosureSweepScheduler` (goi luot quet dau tien trong `onModuleInit` cua no). Dang ky o
 * mot moc se de luot quet dau tien doc cau hinh — ma goi xem truoc khong con khai bai nao trong cau
 * hinh. Hai cho noi NEM khi bi dang ky hai lan: mot loi composition phai lo ngay luc khoi dong.
 */
@Injectable()
export class TransportPlacesRegistrar {
  constructor(
    geofences: GeofenceRepository,
    depots: DepotDirectoryHub,
    siteGuard: CounterpartySitePlaceGuardHub,
    @Inject(TRANSPORT_PLANNING_POLICY) policy: TransportPlanningPolicy,
  ) {
    depots.register(new GeofenceDepotDirectory(geofences, new ConfigDepotDirectory(policy)));
    siteGuard.register(new GeofenceSitePlaceGuard(geofences));
  }
}
