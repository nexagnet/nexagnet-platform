import { randomUUID } from 'node:crypto';
import {
  ViBangRepository,
  type NewCase,
  type NewContract,
  type NewCustomer,
} from './vi-bang.repository.js';
import type { ListCasesQuery, ListContractsQuery, ListCustomersQuery } from './vi-bang.schemas.js';
import type { CaseStatus, Customer, ServiceContract, ViBangCase } from './vi-bang.types.js';

interface Owned<T> {
  readonly tenantId: string;
  readonly value: T;
}

const has = (haystack: string | null | undefined, needle: string): boolean =>
  (haystack ?? '').toLowerCase().includes(needle.toLowerCase());

const page = <T>(rows: T[], query: { limit: number; offset: number }): T[] =>
  rows.slice(query.offset, query.offset + query.limit);

/** Kho bo nho (`PERSISTENCE=memory`): demo/CI khong can DB. Cung hop dong voi ban Prisma. */
export class InMemoryViBangRepository extends ViBangRepository {
  private readonly customers = new Map<string, Owned<Customer>>();
  private readonly contracts = new Map<string, Owned<ServiceContract>>();
  private readonly cases = new Map<string, Owned<ViBangCase>>();

  private scoped<T>(store: Map<string, Owned<T>>, tenantId: string): T[] {
    // Moi nhat truoc (thu tu chen dao nguoc) — cung thu tu voi `createdAt desc` cua ban Prisma.
    return [...store.values()]
      .filter((row) => row.tenantId === tenantId)
      .map((row) => row.value)
      .reverse();
  }

  async insertCustomer(tenantId: string, data: NewCustomer): Promise<Customer> {
    const now = new Date().toISOString();
    const row: Customer = { ...data, id: randomUUID(), createdAt: now, updatedAt: now };
    this.customers.set(row.id, { tenantId, value: row });
    return row;
  }

  async getCustomer(tenantId: string, id: string): Promise<Customer | null> {
    const row = this.customers.get(id);
    return row && row.tenantId === tenantId ? row.value : null;
  }

  async listCustomers(tenantId: string, query: ListCustomersQuery): Promise<Customer[]> {
    const rows = this.scoped(this.customers, tenantId).filter(
      (c) => (!query.kind || c.kind === query.kind) && (!query.q || has(c.displayName, query.q)),
    );
    return page(rows, query);
  }

  async findCustomersByContact(
    tenantId: string,
    keys: { phone: string | null; nationalId: string | null },
  ): Promise<Customer[]> {
    return this.scoped(this.customers, tenantId).filter(
      (c) =>
        (keys.phone !== null && c.phone === keys.phone) ||
        (keys.nationalId !== null && c.nationalId === keys.nationalId),
    );
  }

  async insertContract(tenantId: string, data: NewContract): Promise<ServiceContract> {
    const now = new Date().toISOString();
    const row: ServiceContract = { ...data, id: randomUUID(), createdAt: now, updatedAt: now };
    this.contracts.set(row.id, { tenantId, value: row });
    return row;
  }

  async getContract(tenantId: string, id: string): Promise<ServiceContract | null> {
    const row = this.contracts.get(id);
    return row && row.tenantId === tenantId ? row.value : null;
  }

  async listContracts(tenantId: string, query: ListContractsQuery): Promise<ServiceContract[]> {
    const rows = this.scoped(this.contracts, tenantId).filter(
      (c) =>
        (!query.customerId || c.customerId === query.customerId) &&
        (!query.q || has(c.contractRef, query.q) || has(c.title, query.q)),
    );
    return page(rows, query);
  }

  async insertCase(tenantId: string, data: NewCase): Promise<ViBangCase> {
    const now = new Date().toISOString();
    const row: ViBangCase = {
      ...data,
      id: randomUUID(),
      status: 'DRAFT',
      participants: data.participants.map((p) => ({ ...p, id: randomUUID() })),
      createdAt: now,
      updatedAt: now,
    };
    this.cases.set(row.id, { tenantId, value: row });
    return row;
  }

  async getCase(tenantId: string, id: string): Promise<ViBangCase | null> {
    const row = this.cases.get(id);
    return row && row.tenantId === tenantId ? row.value : null;
  }

  async listCases(tenantId: string, query: ListCasesQuery): Promise<ViBangCase[]> {
    const rows = this.scoped(this.cases, tenantId).filter(
      (c) =>
        (!query.customerId || c.customerId === query.customerId) &&
        (!query.contractId || c.contractId === query.contractId) &&
        (!query.status || c.status === query.status) &&
        (!query.q || has(c.content, query.q) || has(c.location, query.q) || has(c.branch, query.q)),
    );
    return page(rows, query);
  }

  async transitionCase(
    tenantId: string,
    id: string,
    from: CaseStatus,
    to: CaseStatus,
  ): Promise<ViBangCase | null> {
    const row = this.cases.get(id);
    if (!row || row.tenantId !== tenantId || row.value.status !== from) return null;
    const next: ViBangCase = { ...row.value, status: to, updatedAt: new Date().toISOString() };
    this.cases.set(id, { tenantId, value: next });
    return next;
  }
}
