import { Inject, Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { parseGeoPoint } from '../geo/geo-point.js';
import { PlaceAdminError } from '../places/admin/place-admin-error.js';
import {
  describePlaceNameConflict,
  findPlaceNameConflict,
  loadPlaceNameIndex,
} from '../places/admin/place-name-rule.js';
import { TransportDomainError } from '../transport.errors.js';
import {
  GeofenceRepository,
  type Geofence,
  type GeofenceSubjectKind,
} from './geofence.repository.js';
import {
  PlaceWriteStore,
  placeStorageConflict,
  runTraced,
  type PlaceWriteTx,
} from './place-write.store.js';
import { TRANSPORT_PROOF_POLICY, type TransportProofPolicy } from './tracking-policy.js';

export interface RegisterGeofenceCommand {
  readonly label: string;
  readonly subjectKind: GeofenceSubjectKind;
  readonly subjectId: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusMetres: number;
  readonly note: string | null;
  readonly recordedBy: string;
}

/**
 * HANG RAO DIA LY — luat o DAY, khong o controller.
 *
 * ============================================================================================
 * VI SAO LOP NAY TON TAI, VA NO SUA MOT LOI DA LAM CHET MOT LAN DEPLOY
 * ============================================================================================
 *
 * Ban dau ba phep kiem duoi day nam trong `ProofReviewController`, va controller do tiem thang
 * `TRANSPORT_PROOF_POLICY`. Dieu do BIEN DICH duoc, qua het bo test don vi, va qua ca bai
 * composition — roi lam tien trinh CHET LUC KHOI DONG tren ban dang chay:
 *
 *   Nest can't resolve dependencies of the ProofReviewController (..., ?).
 *   Please make sure that the argument Symbol(TRANSPORT_PROOF_POLICY) at index [2] is
 *   available in the AppModule module.
 *
 * Ly do: controller nay duoc dang ky o GOC (`app-composition.ts`), nen no chi thay nhung gi
 * `AppModule` thay — tuc phan EXPORT cua `TransportProofModule`, khong phai phan `providers` ben
 * trong no. `TRANSPORT_PROOF_POLICY` la mot provider noi bo.
 *
 * Cach sua co the la "export them cai token do". Nhung cach dung hon la cai nay: nguong chinh
 * sach la LUAT NGHIEP VU, va luat nghiep vu khong thuoc ve mot controller. Dua chung vao mot dich
 * vu trong chinh module so huu chinh sach thi controller chi con tiem nhung thu da duoc export —
 * va cai lop wiring nay het cho de sai lan nua.
 *
 * ============================================================================================
 * `#395`: CUNG DUONG GHI VOI MAN "DIA DIEM VAN HANH"
 * ============================================================================================
 *
 * Moi loai hang rao (ke ca cay xang, hang rao tam) di qua `PlaceWriteStore` — cung giao dich, cung
 * khoa — va qua CUNG luat trung ten: dieu xe giai nhan tren MOI hang rao con hieu luc, nen mot hang
 * rao tam trung ten bai xe cung lam bai xe thanh mo ho. Duong nay VAN nhan ma bai tuy y cho hang
 * rao `DEPOT` (vd `kho-boot` cua bai boot); chi man moi sinh ma `DEPOT-...`. Hai chi muc bai xe cua
 * DB cung chan duong nay, va va cham cua chung ra ly do co kieu thay vi `500`.
 */
@Injectable()
export class GeofenceService {
  constructor(
    private readonly geofences: GeofenceRepository,
    @Inject(TRANSPORT_PROOF_POLICY) private readonly policy: TransportProofPolicy,
    /*
     * Cuoi va tuy chon: spec cu dung dich vu theo vi tri voi mot kho tran. Vang mat thi ghi thang
     * vao kho nhu truoc #395 (khong khoa, khong luat trung ten) — ung dung that luon co kho ghi.
     */
    @Optional() private readonly store?: PlaceWriteStore,
    @Optional() private readonly audit?: AuditLogService,
  ) {}

  listActive(): Promise<readonly Geofence[]> {
    return this.geofences.listActive();
  }

  async register(command: RegisterGeofenceCommand): Promise<Geofence> {
    // Cung phep kiem bien voi duong ingest — mot tam hang rao o (0,0) la mot hang rao bao MOI diem
    // tren the gioi deu "o ngoai", va no se im lang lam viec do mai mai.
    const centre = parseGeoPoint(command.latitude, command.longitude);
    if (!centre.ok) {
      throw TransportDomainError.invalid(
        'GEOFENCE_COORDINATE_REJECTED',
        `Toa do tam hang rao khong hop le: ${centre.rejection}`,
      );
    }

    const { min, max } = this.policy.geofenceRadiusMetres;
    if (command.radiusMetres < min || command.radiusMetres > max) {
      throw TransportDomainError.invalid(
        'GEOFENCE_RADIUS_OUT_OF_RANGE',
        `Ban kinh phai trong khoang ${min}-${max}m`,
      );
    }

    // `AD_HOC` phai KHONG co chu the; moi loai khac phai CO. Mot hang rao "cua kho nao do" khong
    // noi duoc no thuoc kho nao la mot hang rao khong doi chieu duoc voi bat ky don hang nao.
    const wantsSubject = command.subjectKind !== 'AD_HOC';
    if (wantsSubject !== Boolean(command.subjectId)) {
      throw TransportDomainError.invalid(
        'GEOFENCE_SUBJECT_SHAPE_INVALID',
        wantsSubject
          ? `Hang rao loai ${command.subjectKind} bat buoc co chu the`
          : 'Hang rao AD_HOC khong duoc gan chu the',
      );
    }

    const input = {
      label: command.label,
      subjectKind: command.subjectKind,
      subjectId: command.subjectId,
      latitude: centre.point.latitude,
      longitude: centre.point.longitude,
      radiusMetres: command.radiusMetres,
      note: command.note,
      recordedBy: command.recordedBy,
    };
    if (!this.store) return this.geofences.register(input);

    // Dau vet trong CUNG giao dich voi lan ghi (`runTraced`, `#395`).
    return runTraced(
      this.store,
      this.audit,
      async (tx) => {
        await this.requireNameFree(tx, command);
        return tx.geofences.register(input);
      },
      (fence) => [
        {
          actor: command.recordedBy,
          action: 'transport.geofence.register',
          entityType: 'TransportGeofence',
          entityId: fence.id,
          before: null,
          after: {
            label: fence.label,
            kind: fence.subjectKind,
            subjectId: fence.subjectId,
            point: { latitude: fence.latitude, longitude: fence.longitude },
            radiusMetres: fence.radiusMetres,
            status: fence.status,
          },
        },
      ],
    ).catch((error: unknown) => {
      throw placeStorageConflict(error) ?? error;
    });
  }

  private async requireNameFree(tx: PlaceWriteTx, command: RegisterGeofenceCommand) {
    const conflict = findPlaceNameConflict(command.label, await loadPlaceNameIndex(tx), {
      siteId: command.subjectKind === 'COUNTERPARTY_SITE' ? command.subjectId : null,
    });
    if (!conflict) return;
    const detail = await describePlaceNameConflict(tx, conflict);
    throw new PlaceAdminError(
      'CONFLICT',
      'PLACE_NAME_TAKEN',
      `Tên này đã dùng cho ${detail.conflictKindLabel.toLowerCase()} "${detail.conflictName}". Đặt một tên khác để không nhầm hai nơi.`,
      { ...detail },
    );
  }
}
