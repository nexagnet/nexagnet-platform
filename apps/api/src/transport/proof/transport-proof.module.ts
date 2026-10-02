import { Module } from '@nestjs/common';
import { loadFoundationEnv } from '../../config/foundation-env.js';
import { PrismaModule } from '../../config/prisma.module.js';
import { PrismaService } from '../../config/prisma.service.js';
import { CounterpartyRepository } from '../counterparty/counterparty.repository.js';
import { CounterpartySiteRepository } from '../counterparty/site.repository.js';
import { FleetRepository } from '../fleet/fleet.repository.js';
import { PlaceAdminService } from '../places/admin/place-admin.service.js';
import { TransportPlacesRegistrar } from '../places/admin/place-registrations.js';
import { TRANSPORT_CORE_POLICY, tenantTransportCorePolicy } from '../transport-policy.js';
import { TransportModule } from '../transport.module.js';
import {
  GeofenceRepository,
  InMemoryGeofenceRepository,
  PrismaGeofenceRepository,
  RepositoryGeofenceOwnerLookup,
} from './geofence.repository.js';
import { GeofenceService } from './geofence.service.js';
import { LocationHealthService } from './location-health.service.js';
import {
  InMemoryOperationalProofRepository,
  InMemoryProofChallengeRepository,
  OperationalProofRepository,
  ProofChallengeRepository,
} from './operational-proof.repository.js';
import { PrismaProofChallengeRepository } from './prisma-proof-challenge.repository.js';
import { OperationalProofService } from './operational-proof.service.js';
import {
  InMemoryPlaceWriteStore,
  PlaceWriteStore,
  PrismaPlaceWriteStore,
} from './place-write.store.js';
import { PrismaOperationalProofRepository } from './prisma-operational-proof.repository.js';
import { PrismaTrackingRepository } from './prisma-tracking.repository.js';
import {
  DEFAULT_TRANSPORT_PROOF_POLICY,
  TRANSPORT_PROOF_POLICY,
  type TransportProofPolicy,
} from './tracking-policy.js';
import { InMemoryTrackingRepository, TrackingRepository } from './tracking.repository.js';
import { TrackingService } from './tracking.service.js';
import { TelematicsIngressService } from './telematics/telematics-ingress.service.js';
import {
  UnconfiguredVehicleTelematicsAdapter,
  VehicleTelematicsPort,
} from './telematics/vehicle-telematics.port.js';
import {
  TransportProofCoreFacts,
  TransportProofCoreFactsAdapter,
} from './transport-proof-facts.port.js';

/**
 * Capability `transport-proof` — bam vi tri va chung cu van hanh.
 *
 * MOT CAPABILITY RIENG, khong phai mot phan cua `transport-core`, va ly do rat cu the: mot khach
 * van tai phai chay duoc MA KHONG bam vi tri. Vi tri cua nguoi lao dong la thu co dieu kien phap
 * ly, co chi phi luu tru, va co khach se dung nguon khac (hop GSHT tren xe) thay vi dien thoai.
 * Nhet no vao `transport-core` se bat moi khach van tai mang theo ca tang do du ho khong bao gio
 * bat no.
 *
 * `imports: [TransportModule]` — de lay `TripRepository` va `FleetRepository` cho cong doc
 * `TransportProofCoreFacts`. Day la mot chieu: `transport-core` khong biet gi ve capability nay.
 */
@Module({
  imports: [PrismaModule, TransportModule],
  providers: [
    {
      provide: TrackingRepository,
      useFactory: (prisma: PrismaService): TrackingRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaTrackingRepository(prisma)
          : new InMemoryTrackingRepository(),
      inject: [PrismaService],
    },
    { provide: TransportProofCoreFacts, useClass: TransportProofCoreFactsAdapter },
    {
      /**
       * NGUON VI TRI THU HAI — hom nay chua co nha cung cap nao, va adapter mac dinh noi thang
       * dieu do thay vi tra ve mot mang rong.
       *
       * Khac biet do khong vun vat: mot mang rong khong phan biet duoc voi "xe do khong chay hom
       * nay", nen mot man hinh doi chieu cheo se hien mau xanh cho moi chiec xe, mai mai, o mot
       * he chua he duoc cam vao gi ca — va khong ai phat hien ra.
       */
      provide: VehicleTelematicsPort,
      useClass: UnconfiguredVehicleTelematicsAdapter,
    },
    { provide: TRANSPORT_CORE_POLICY, useFactory: tenantTransportCorePolicy },
    {
      // Moi nguong o day deu co mot mac dinh dung duoc, nen "goi khach khong khai gi" la duong
      // chay binh thuong chu khong phai mot cau hinh thieu.
      provide: TRANSPORT_PROOF_POLICY,
      useFactory: (): TransportProofPolicy => DEFAULT_TRANSPORT_PROOF_POLICY,
    },
    {
      provide: OperationalProofRepository,
      useFactory: (prisma: PrismaService): OperationalProofRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaOperationalProofRepository(prisma)
          : new InMemoryOperationalProofRepository(),
      inject: [PrismaService],
    },
    {
      provide: ProofChallengeRepository,
      useFactory: (prisma: PrismaService): ProofChallengeRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaProofChallengeRepository(prisma)
          : new InMemoryProofChallengeRepository(),
      inject: [PrismaService],
    },
    {
      /*
       * Ban trong bo nho hoi trang thai CHU THE (dia diem, phap nhan, khach) qua ba kho da export
       * cua `transport-core` — de "con hieu luc that" (`#395`) cung mot nghia o ca hai che do.
       */
      provide: GeofenceRepository,
      useFactory: (
        prisma: PrismaService,
        sites: CounterpartySiteRepository,
        counterparties: CounterpartyRepository,
        fleet: FleetRepository,
      ): GeofenceRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaGeofenceRepository(prisma)
          : new InMemoryGeofenceRepository(
              new RepositoryGeofenceOwnerLookup(sites, counterparties, fleet),
            ),
      inject: [PrismaService, CounterpartySiteRepository, CounterpartyRepository, FleetRepository],
    },
    /*
     * `#395` — DUONG GHI DUY NHAT cua dia diem van hanh: mot giao dich, mot khoa. Ban trong bo nho
     * dung CHINH cac kho ma phan con lai cua ung dung doc.
     */
    {
      provide: PlaceWriteStore,
      useFactory: (
        prisma: PrismaService,
        geofences: GeofenceRepository,
        sites: CounterpartySiteRepository,
        counterparties: CounterpartyRepository,
        fleet: FleetRepository,
      ): PlaceWriteStore =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaPlaceWriteStore(prisma)
          : new InMemoryPlaceWriteStore({ geofences, sites, counterparties, customers: fleet }),
      inject: [
        PrismaService,
        GeofenceRepository,
        CounterpartySiteRepository,
        CounterpartyRepository,
        FleetRepository,
      ],
    },
    TrackingService,
    OperationalProofService,
    GeofenceService,
    LocationHealthService,
    TelematicsIngressService,
    PlaceAdminService,
    /*
     * `#395` — dang ky bai xe duoc quan ly vao `DepotDirectoryHub` va cong chan sua dia diem cu vao
     * `CounterpartySitePlaceGuardHub` (hai cho noi cua `transport-core`), TRONG HAM DUNG — xem
     * `place-registrations.ts`. Khong ai tiem provider nay; Nest van dung no vi no nam trong module.
     */
    TransportPlacesRegistrar,
  ],
  exports: [
    TrackingService,
    TrackingRepository,
    VehicleTelematicsPort,
    OperationalProofService,
    OperationalProofRepository,
    GeofenceRepository,
    // `ProofReviewController` dang ky o GOC, nen no CHI thay danh sach nay. Mot provider noi bo
    // (vd `TRANSPORT_PROOF_POLICY`) tiem vao controller do se chet luc khoi dong — da xay ra that.
    GeofenceService,
    LocationHealthService,
    // `TelematicsIngressController` dang ky o GOC, nen no CHI thay danh sach nay — cung cai bay da
    // lam chet mot lan deploy o `ProofReviewController`. Xem chu thich ngay tren.
    TelematicsIngressService,
    // `PlaceAdminController` (`#395`) dang ky o GOC — cung ly do.
    PlaceAdminService,
  ],
})
export class TransportProofModule {}
