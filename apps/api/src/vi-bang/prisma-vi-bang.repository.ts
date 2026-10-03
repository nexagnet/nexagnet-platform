import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../config/prisma.service.js';
import { ViBangError } from './vi-bang.errors.js';
import {
  ViBangRepository,
  type NewCase,
  type NewContract,
  type NewCustomer,
} from './vi-bang.repository.js';
import type { ListCasesQuery, ListContractsQuery, ListCustomersQuery } from './vi-bang.schemas.js';
import type {
  CaseStatus,
  Customer,
  CustomerKind,
  ParticipantKind,
  ServiceContract,
  ViBangCase,
} from './vi-bang.types.js';

const iso = (value: Date): string => value.toISOString();
const isoOrNull = (value: Date | null): string | null => (value ? value.toISOString() : null);
const dateOrNull = (value: string | null): Date | null => (value ? new Date(value) : null);

const toCustomer = (row: Prisma.ViBangCustomerGetPayload<object>): Customer => ({
  id: row.id,
  kind: row.kind as CustomerKind,
  displayName: row.displayName,
  source: row.source,
  category: row.category,
  phone: row.phone,
  nationalId: row.nationalId,
  email: row.email,
  address: row.address,
  taxCode: row.taxCode,
  note: row.note,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const toContract = (row: Prisma.ViBangServiceContractGetPayload<object>): ServiceContract => ({
  id: row.id,
  customerId: row.customerId,
  contractRef: row.contractRef,
  title: row.title,
  signedAt: isoOrNull(row.signedAt),
  note: row.note,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const CASE_INCLUDE = { participants: { orderBy: { id: 'asc' } } } as const;
type CaseRow = Prisma.ViBangCaseGetPayload<{ include: typeof CASE_INCLUDE }>;

const toCase = (row: CaseRow): ViBangCase => ({
  id: row.id,
  customerId: row.customerId,
  contractId: row.contractId,
  status: row.status as CaseStatus,
  executorUserId: row.executorUserId,
  secretaryUserId: row.secretaryUserId,
  branch: row.branch,
  occurredAt: isoOrNull(row.occurredAt),
  location: row.location,
  content: row.content,
  registrationNumber: row.registrationNumber,
  registeredAt: isoOrNull(row.registeredAt),
  participants: row.participants.map((p) => ({
    id: p.id,
    kind: p.kind as ParticipantKind,
    customerId: p.customerId,
    displayName: p.displayName,
    roleLabel: p.roleLabel,
  })),
  createdBy: row.createdBy,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const });

@Injectable()
export class PrismaViBangRepository extends ViBangRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async insertCustomer(tenantId: string, data: NewCustomer): Promise<Customer> {
    return toCustomer(await this.prisma.viBangCustomer.create({ data: { ...data, tenantId } }));
  }

  async getCustomer(tenantId: string, id: string): Promise<Customer | null> {
    const row = await this.prisma.viBangCustomer.findFirst({ where: { id, tenantId } });
    return row ? toCustomer(row) : null;
  }

  async listCustomers(tenantId: string, query: ListCustomersQuery): Promise<Customer[]> {
    const rows = await this.prisma.viBangCustomer.findMany({
      where: {
        tenantId,
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.q ? { displayName: contains(query.q) } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
      skip: query.offset,
    });
    return rows.map(toCustomer);
  }

  async findCustomersByContact(
    tenantId: string,
    keys: { phone: string | null; nationalId: string | null },
  ): Promise<Customer[]> {
    const or: Prisma.ViBangCustomerWhereInput[] = [];
    if (keys.phone !== null) or.push({ phone: keys.phone });
    if (keys.nationalId !== null) or.push({ nationalId: keys.nationalId });
    if (or.length === 0) return [];
    const rows = await this.prisma.viBangCustomer.findMany({
      where: { tenantId, OR: or },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });
    return rows.map(toCustomer);
  }

  async insertContract(tenantId: string, data: NewContract): Promise<ServiceContract> {
    return toContract(
      await this.prisma.viBangServiceContract.create({
        data: { ...data, tenantId, signedAt: dateOrNull(data.signedAt) },
      }),
    );
  }

  async getContract(tenantId: string, id: string): Promise<ServiceContract | null> {
    const row = await this.prisma.viBangServiceContract.findFirst({ where: { id, tenantId } });
    return row ? toContract(row) : null;
  }

  async listContracts(tenantId: string, query: ListContractsQuery): Promise<ServiceContract[]> {
    const rows = await this.prisma.viBangServiceContract.findMany({
      where: {
        tenantId,
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.q
          ? { OR: [{ contractRef: contains(query.q) }, { title: contains(query.q) }] }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
      skip: query.offset,
    });
    return rows.map(toContract);
  }

  async insertCase(tenantId: string, data: NewCase): Promise<ViBangCase> {
    try {
      const { participants, occurredAt, registeredAt, ...fields } = data;
      const row = await this.prisma.viBangCase.create({
        data: {
          ...fields,
          tenantId,
          occurredAt: dateOrNull(occurredAt),
          registeredAt: dateOrNull(registeredAt),
          participants: { create: participants.map((p) => ({ ...p })) },
        },
        include: CASE_INCLUDE,
      });
      return toCase(row);
    } catch (error) {
      // FK toi `User` (Thua hanh vien / Thu ky) khong ton tai. Thong diep KHONG nhac gia tri.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ViBangError(
          'REFERENCE_NOT_FOUND',
          'Tham chieu toi tai khoan/doi tuong khong ton tai',
        );
      }
      throw error;
    }
  }

  async getCase(tenantId: string, id: string): Promise<ViBangCase | null> {
    const row = await this.prisma.viBangCase.findFirst({
      where: { id, tenantId },
      include: CASE_INCLUDE,
    });
    return row ? toCase(row) : null;
  }

  async listCases(tenantId: string, query: ListCasesQuery): Promise<ViBangCase[]> {
    const rows = await this.prisma.viBangCase.findMany({
      where: {
        tenantId,
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.contractId ? { contractId: query.contractId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.q
          ? {
              OR: [
                { content: contains(query.q) },
                { location: contains(query.q) },
                { branch: contains(query.q) },
              ],
            }
          : {}),
      },
      include: CASE_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
      skip: query.offset,
    });
    return rows.map(toCase);
  }

  async transitionCase(
    tenantId: string,
    id: string,
    from: CaseStatus,
    to: CaseStatus,
  ): Promise<ViBangCase | null> {
    // So sanh-va-dat NGUYEN TU trong mot cau UPDATE: hai yeu cau song song cung muon roi `from`
    // thi chi mot yeu cau dem duoc `count === 1`.
    const { count } = await this.prisma.viBangCase.updateMany({
      where: { id, tenantId, status: from },
      data: { status: to },
    });
    return count === 1 ? this.getCase(tenantId, id) : null;
  }
}
