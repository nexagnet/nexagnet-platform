import { Injectable } from '@nestjs/common';
import type { TransactionTrail } from '../../audit/audit-trail.js';
import type { PrismaService } from '../../config/prisma.service.js';
import {
  AssetOwnershipRepository,
  type CloseInterestInput,
  type CreateStakeholderInput,
  type OpenInterestInput,
  type UpdateStakeholderInput,
} from './asset-ownership.repository.js';
import type {
  AssetStakeholder,
  AssetStakeholderKind,
  VehicleOwnershipInterest,
} from './asset-ownership.types.js';

/** Kieu tho tu Prisma — chi lay nhung cot ma mien nay doc. */
interface StakeholderRow {
  id: string;
  kind: string;
  displayName: string;
  status: string;
  note: string | null;
  authUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface InterestRow {
  id: string;
  vehicleId: string;
  stakeholderId: string;
  ownershipBasisPoints: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  recordedBy: string;
  recordedNote: string | null;
  closedBy: string | null;
  closedNote: string | null;
  createdAt: Date;
  stakeholder?: { displayName: string; kind: string } | null;
}

const iso = (value: Date): string => value.toISOString();

/**
 * `authUserId` bien thanh `hasAccount` NGAY TAI RANH GIOI KHO.
 *
 * Khong tang nao ben tren nhin thay dinh danh tai khoan, nen khong tang nao co the lo no ra. Neu
 * phep doi nay nam o controller thay vi o day, mot service moi doc thang kho se lay duoc ca cot —
 * va mot bang danh sach ben huu quan se lang le tro thanh mot bang anh xa nguoi dung.
 */
const toStakeholder = (row: StakeholderRow): AssetStakeholder => ({
  id: row.id,
  kind: row.kind as AssetStakeholderKind,
  displayName: row.displayName,
  status: row.status as AssetStakeholder['status'],
  note: row.note,
  hasAccount: row.authUserId !== null,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const toInterest = (row: InterestRow): VehicleOwnershipInterest => ({
  id: row.id,
  vehicleId: row.vehicleId,
  stakeholderId: row.stakeholderId,
  stakeholderName: row.stakeholder?.displayName ?? '',
  stakeholderKind: (row.stakeholder?.kind ?? 'PERSON') as AssetStakeholderKind,
  ownershipBasisPoints: row.ownershipBasisPoints,
  effectiveFrom: iso(row.effectiveFrom),
  effectiveTo: row.effectiveTo ? iso(row.effectiveTo) : null,
  recordedBy: row.recordedBy,
  recordedNote: row.recordedNote,
  closedBy: row.closedBy,
  closedNote: row.closedNote,
  createdAt: iso(row.createdAt),
});

function prune<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/*
 * Cung ly le voi `PrismaCounterpartyRepository`: Prisma sinh kieu delegate theo tung ban client,
 * nen goi qua mot ham tra `any` de tang nay khong vo khi ai do chua chay `prisma generate`. Ranh
 * gioi kieu that su nam o hai ham `to*` ben tren.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const model = (prisma: PrismaService, name: string): any =>
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (prisma as unknown as Record<string, any>)[name];

/** Luon keo ten ben huu quan theo — de ban Prisma va ban trong bo nho tra ve cung mot hinh dang. */
const WITH_HOLDER = { stakeholder: { select: { displayName: true, kind: true } } };

@Injectable()
export class PrismaAssetOwnershipRepository extends AssetOwnershipRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async createStakeholder(input: CreateStakeholderInput): Promise<AssetStakeholder> {
    return toStakeholder(
      await model(this.prisma, 'transportAssetStakeholder').create({
        data: {
          kind: input.kind,
          displayName: input.displayName,
          note: input.note ?? null,
          status: input.status ?? 'ACTIVE',
        },
      }),
    );
  }

  async updateStakeholder(
    id: string,
    patch: UpdateStakeholderInput,
  ): Promise<AssetStakeholder | null> {
    const row = await model(this.prisma, 'transportAssetStakeholder').update({
      where: { id },
      data: prune(patch),
    });
    return row ? toStakeholder(row) : null;
  }

  async findStakeholder(id: string): Promise<AssetStakeholder | null> {
    const row = await model(this.prisma, 'transportAssetStakeholder').findUnique({ where: { id } });
    return row ? toStakeholder(row) : null;
  }

  async listStakeholders(): Promise<AssetStakeholder[]> {
    const rows: StakeholderRow[] = await model(this.prisma, 'transportAssetStakeholder').findMany({
      orderBy: { displayName: 'asc' },
    });
    return rows.map(toStakeholder);
  }

  async findStakeholderByAuthUser(authUserId: string): Promise<AssetStakeholder | null> {
    const row = await model(this.prisma, 'transportAssetStakeholder').findUnique({
      where: { authUserId },
    });
    return row ? toStakeholder(row) : null;
  }

  async findStakeholderIdHoldingAccount(authUserId: string): Promise<string | null> {
    const row = await model(this.prisma, 'transportAssetStakeholder').findUnique({
      where: { authUserId },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async linkedAccountOf(stakeholderId: string): Promise<string | null> {
    const row = await model(this.prisma, 'transportAssetStakeholder').findUnique({
      where: { id: stakeholderId },
      select: { authUserId: true },
    });
    return row?.authUserId ?? null;
  }

  async setStakeholderAccount(
    id: string,
    authUserId: string | null,
    trail?: TransactionTrail<AssetStakeholder>,
  ): Promise<AssetStakeholder | null> {
    const write = async (client: PrismaService): Promise<AssetStakeholder | null> => {
      const row = await model(client, 'transportAssetStakeholder').update({
        where: { id },
        data: { authUserId },
      });
      return row ? toStakeholder(row) : null;
    };
    if (!trail) return write(this.prisma);
    // Dau vet trong CUNG giao dich: hong thi lan noi / go tai khoan lui theo.
    return this.prisma.$transaction(async (tx) => {
      const stakeholder = await write(tx as unknown as PrismaService);
      if (stakeholder) await trail(stakeholder, tx);
      return stakeholder;
    });
  }

  async openInterest(input: OpenInterestInput): Promise<VehicleOwnershipInterest> {
    return toInterest(
      await model(this.prisma, 'transportVehicleOwnershipInterest').create({
        data: {
          vehicleId: input.vehicleId,
          stakeholderId: input.stakeholderId,
          ownershipBasisPoints: input.ownershipBasisPoints,
          effectiveFrom: input.effectiveFrom,
          recordedBy: input.recordedBy,
          recordedNote: input.recordedNote ?? null,
        },
        include: WITH_HOLDER,
      }),
    );
  }

  /**
   * DONG mot quyen loi — `updateMany` co dieu kien `effectiveTo: null`, khong phai `update`.
   *
   * Dieu kien do la mot khoa lac quan: hai nguoi cung bam "dong" thi nguoi thu hai ghi vao 0 hang,
   * va moc dong dau tien duoc giu nguyen. Voi `update` thi nguoi thu hai se GHI DE moc dong cua
   * nguoi thu nhat, va so kiem toan se mang mot thoi diem khong ai chon.
   */
  async closeInterest(input: CloseInterestInput): Promise<VehicleOwnershipInterest | null> {
    await model(this.prisma, 'transportVehicleOwnershipInterest').updateMany({
      where: { id: input.interestId, effectiveTo: null },
      data: {
        effectiveTo: input.effectiveTo,
        closedBy: input.closedBy,
        closedNote: input.closedNote ?? null,
      },
    });
    return this.findInterest(input.interestId);
  }

  async findInterest(id: string): Promise<VehicleOwnershipInterest | null> {
    const row = await model(this.prisma, 'transportVehicleOwnershipInterest').findUnique({
      where: { id },
      include: WITH_HOLDER,
    });
    return row ? toInterest(row) : null;
  }

  async listInterestsForVehicle(vehicleId: string): Promise<VehicleOwnershipInterest[]> {
    const rows: InterestRow[] = await model(
      this.prisma,
      'transportVehicleOwnershipInterest',
    ).findMany({ where: { vehicleId }, include: WITH_HOLDER });
    return rows.map(toInterest);
  }

  async listInterestsForStakeholder(stakeholderId: string): Promise<VehicleOwnershipInterest[]> {
    const rows: InterestRow[] = await model(
      this.prisma,
      'transportVehicleOwnershipInterest',
    ).findMany({ where: { stakeholderId }, include: WITH_HOLDER });
    return rows.map(toInterest);
  }

  async findActiveInterest(
    vehicleId: string,
    stakeholderId: string,
  ): Promise<VehicleOwnershipInterest | null> {
    const row = await model(this.prisma, 'transportVehicleOwnershipInterest').findFirst({
      where: { vehicleId, stakeholderId, effectiveTo: null },
      include: WITH_HOLDER,
    });
    return row ? toInterest(row) : null;
  }
}
