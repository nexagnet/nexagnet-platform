import { Injectable } from '@nestjs/common';
import { AssetComplianceRepository } from '../asset-compliance/asset-compliance.repository.js';
import { resolveEffectiveVehicleState } from '../asset-compliance/effective-vehicle-state.js';
import {
  evaluateDispatchReadiness,
  type DispatchReadiness,
} from '../asset-compliance/vehicle-availability.js';
import { CounterpartySiteRepository } from '../counterparty/site.repository.js';
import { FleetRepository } from '../fleet/fleet.repository.js';
import { MovementRepository } from '../movement/movement.repository.js';
import type { Order, RunLeg, VehicleRun } from '../movement/movement.types.js';
import { GeofenceRepository } from '../proof/geofence.repository.js';
import { TrackingRepository } from '../proof/tracking.repository.js';
import type { Vehicle } from '../transport.types.js';
import type { PlaceIndexEntry } from './place-resolution.js';
import type { ObservationSample } from './vehicle-state-projection.js';

/**
 * CAC CUA SO cua mien dieu xe. TAT CA deu CHI DOC.
 *
 * ===========================================================================
 * KHONG MOT HAM GHI NAO O DUOI DAY, VA DO LA CACH `#277 M8` DUOC CUONG CHE.
 *
 * `M8` doi be mat de nghi phai *"remain read-only business effect"*. Mot cau nhu the trong tai
 * lieu la mot loi hua; o day no la mot dieu kien BIEN DICH. `DispatchService` khong duoc tiem
 * `MovementRepository` — no duoc tiem cac cong nay, va cac cong nay khong co mot phuong thuc ghi
 * nao de goi.
 *
 * Duong ghi DUY NHAT cua ca Lane M di qua `DispatchAssignmentPlanner`
 * (`dispatch-planner.port.ts`), va no chi mo sau khi mot con nguoi bam xac nhan.
 *
 * Cung khuon `ControlTowerCoreFacts` va `TransportProofCoreFacts`, va cung mot ly le: T1 §4.1
 * luat 4 (`NO_CROSS_CONTEXT_REPOSITORY_WRITE`) duoc dat bang CAU TRUC chu khong bang ky luat.
 *
 * ===========================================================================
 * BA CONG, MOT BAT BUOC VA HAI TUY CHON
 *
 * `DispatchCoreFacts`       `transport-core` — doi xe, vong chay, chang, don. KHONG co no thi
 *                           khong co cau hoi nao de hoi.
 * `DispatchLocationFacts`   `transport-proof` — vi tri xe va hang rao. Vang mat thi moi xe deu
 *                           `LOCATION_CAPABILITY_ABSENT`, va he thong VAN chay bang phep chieu
 *                           "se ranh" tu cac chang da lap ke hoach.
 * `DispatchComplianceFacts` `transport-asset-compliance` — canh bao van hanh. Vang mat thi khong
 *                           co canh bao, chu khong phai "khong co canh bao nao".
 */

/* ------------------------------------------------------------------ *
 * transport-core — BAT BUOC
 * ------------------------------------------------------------------ */

/** Mot chang, kem vong chay so huu no — de sap thu tu tat dinh. */
export interface DispatchLegFact {
  readonly leg: RunLeg;
  readonly run: VehicleRun;
}

export abstract class DispatchCoreFacts {
  abstract listVehicles(): Promise<readonly Vehicle[]>;
  abstract findVehicle(vehicleId: string): Promise<Vehicle | null>;
  abstract findOrder(orderId: string): Promise<Order | null>;
  /**
   * Cac chang cua cac vong chay CHUA dong cua mot chiec xe.
   *
   * Loc o tang duoi chu khong o tang tren: mot chiec xe mot nam co the co hang tram chang, va tat
   * ca deu di qua mang de tra loi mot cau hoi ve nam chang sap toi.
   */
  abstract listOpenLegsForVehicle(vehicleId: string): Promise<readonly DispatchLegFact[]>;
  /** Cac chang DANG tro toi mot don — dung de kiem "don nay da nam tren xe nao chua". */
  abstract listLegsForOrder(orderId: string): Promise<readonly DispatchLegFact[]>;
}

@Injectable()
export class DispatchCoreFactsAdapter extends DispatchCoreFacts {
  constructor(
    private readonly movement: MovementRepository,
    private readonly fleet: FleetRepository,
  ) {
    super();
  }

  listVehicles(): Promise<readonly Vehicle[]> {
    return this.fleet.listVehicles();
  }

  findVehicle(vehicleId: string): Promise<Vehicle | null> {
    return this.fleet.findVehicle(vehicleId);
  }

  findOrder(orderId: string): Promise<Order | null> {
    return this.movement.findOrder(orderId);
  }

  async listOpenLegsForVehicle(vehicleId: string): Promise<readonly DispatchLegFact[]> {
    const runs = (await this.movement.listRuns()).filter(
      (run) =>
        run.vehicleId === vehicleId && run.status !== 'COMPLETED' && run.status !== 'CANCELLED',
    );
    const facts: DispatchLegFact[] = [];
    for (const run of runs) {
      for (const leg of await this.movement.listLegs(run.id)) facts.push({ leg, run });
    }
    return facts;
  }

  async listLegsForOrder(orderId: string): Promise<readonly DispatchLegFact[]> {
    const legs = await this.movement.listLegsByOrder(orderId);
    const facts: DispatchLegFact[] = [];
    for (const leg of legs) {
      const run = await this.movement.findRun(leg.runId);
      if (run) facts.push({ leg, run });
    }
    return facts;
  }
}

/* ------------------------------------------------------------------ *
 * transport-proof — TUY CHON
 * ------------------------------------------------------------------ */

export abstract class DispatchLocationFacts {
  /** Ban dinh vi gan nhat cua mot chiec xe, hoac `null`. KHONG BAO GIO tra ve ca chuoi. */
  abstract latestObservationForVehicle(vehicleId: string): Promise<ObservationSample | null>;
  /** So tra cuu dia diem: hang rao CON HIEU LUC THAT, noi voi dia diem phap nhan neu co. */
  abstract placeIndex(): Promise<readonly PlaceIndexEntry[]>;
}

/**
 * Tiem `TrackingRepository` va `GeofenceRepository` — hai kho cua `transport-proof`.
 *
 * `CounterpartySiteRepository` thuoc `transport-core`, nen adapter nay bat cau giua hai capability
 * o DUNG MOT CHO. Do la ly do no ton tai: neu `DispatchService` tu doi chieu hang rao voi dia
 * diem thi phep noi do se lap lai o moi cho goi, va hai cho se lech nhau vao lan sua thu ba.
 */
@Injectable()
export class DispatchLocationFactsAdapter extends DispatchLocationFacts {
  constructor(
    private readonly tracking: TrackingRepository,
    private readonly geofences: GeofenceRepository,
    private readonly sites: CounterpartySiteRepository,
  ) {
    super();
  }

  async latestObservationForVehicle(vehicleId: string): Promise<ObservationSample | null> {
    const observation = await this.tracking.latestObservationForVehicle(vehicleId);
    if (!observation) return null;
    return {
      sessionId: observation.sessionId,
      point: observation.point,
      accuracyMetres: observation.accuracyMetres,
      source: observation.source,
      // `receivedAt` — dong ho MAY CHU. `capturedAt` la loi khai cua may khach va khong dung o day.
      receivedAt: observation.receivedAt,
    };
  }

  /**
   * `#395`: CUNG vi tu "con hieu luc that" voi dia diem da biet va luat trung ten
   * (`listEffectivelyActive()`): hang rao cua mot kho da nghi, cua mot phap nhan da nghi, hay cua mot
   * khach da nghi khong con giai duoc mot nhan chang — va khong con lam nhan cua ai "mo ho".
   */
  async placeIndex(): Promise<readonly PlaceIndexEntry[]> {
    const [fences, sites] = await Promise.all([
      this.geofences.listEffectivelyActive(),
      this.sites.listActive(),
    ]);
    const siteNameById = new Map(sites.map((site) => [site.id, site.name] as const));

    return fences.map((fence) => ({
      geofenceId: fence.id,
      label: fence.label,
      point: { latitude: fence.latitude, longitude: fence.longitude },
      siteId: fence.subjectKind === 'COUNTERPARTY_SITE' ? fence.subjectId : null,
      siteName:
        fence.subjectKind === 'COUNTERPARTY_SITE' && fence.subjectId !== null
          ? (siteNameById.get(fence.subjectId) ?? null)
          : null,
    }));
  }
}

/* ------------------------------------------------------------------ *
 * transport-asset-compliance — TUY CHON
 * ------------------------------------------------------------------ */

export abstract class DispatchComplianceFacts {
  abstract readinessForVehicle(vehicle: Vehicle): Promise<DispatchReadiness>;
}

/**
 * KHONG TINH LAI CANH BAO — goi dung `evaluateDispatchReadiness()` cua chu so huu.
 *
 * `#237` da quyet dinh cai gi chan va cai gi chi canh bao, va cai quyet dinh do song trong
 * `transport-asset-compliance`. Viet lai o day se cho ra hai cau tra loi cho cung mot cau hoi, va
 * cau tra loi cua Lane M — mot lane duoc viet sau, boi mot nguoi khac — se la cau sai.
 */
@Injectable()
export class DispatchComplianceFactsAdapter extends DispatchComplianceFacts {
  constructor(private readonly compliance: AssetComplianceRepository) {
    super();
  }

  async readinessForVehicle(vehicle: Vehicle): Promise<DispatchReadiness> {
    const workOrders = await this.compliance.listWorkOrders(vehicle.id);
    const state = resolveEffectiveVehicleState({
      vehicleId: vehicle.id,
      registrationPlate: vehicle.registrationPlate,
      recordedStatus: vehicle.status,
      workOrders,
      /*
       * CO Y de RONG. Truc "dang chay chuyen v1" thuoc mo hinh chuyen cu; dieu xe lam viec tren
       * mo hinh v2 (vong chay/chang), va cau "xe co dang ban khong" da duoc tra loi chinh xac hon
       * bang chinh cac chang chua xong. Nhoi mot danh sach chuyen v1 vao day se lam mot chiec xe
       * hien ra `ON_TRIP` vi mot ly do khong lien quan gi den bang de nghi.
       */
      inTransitTripIds: [],
    });
    return evaluateDispatchReadiness(state);
  }
}
