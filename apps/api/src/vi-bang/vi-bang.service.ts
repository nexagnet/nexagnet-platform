import { Injectable } from '@nestjs/common';
import { AuditLogService } from '../audit/audit-log.service.js';
import { trustedTenantScope } from '../source-registry/tenant-scope.js';
import { canTransition } from './vi-bang-state-machine.js';
import { ViBangError } from './vi-bang.errors.js';
import { ViBangRepository } from './vi-bang.repository.js';
import type {
  CreateCaseInput,
  CreateContractInput,
  CreateCustomerInput,
  ListCasesQuery,
  ListContractsQuery,
  ListCustomersQuery,
} from './vi-bang.schemas.js';
import type {
  CaseStatus,
  Customer,
  DuplicateWarning,
  Page,
  ServiceContract,
  ViBangCase,
} from './vi-bang.types.js';

const orNull = <T>(value: T | null | undefined): T | null => value ?? null;

/**
 * Hang audit CHI mang id/trang thai — khong ten, SDT, CCCD, noi dung ho so (khong PII trong dau
 * vet). Pham vi khach luon la `trustedTenantScope()`, khong bao gio tu nguoi goi.
 */
@Injectable()
export class ViBangService {
  constructor(
    private readonly repository: ViBangRepository,
    private readonly audit: AuditLogService,
  ) {}

  /* ------------------------------ Customer ------------------------------ */

  async createCustomer(
    input: CreateCustomerInput,
    actor: string,
  ): Promise<{ customer: Customer; possibleDuplicates: DuplicateWarning[] }> {
    const { tenantId } = trustedTenantScope();
    const phone = orNull(input.phone);
    const nationalId = orNull(input.nationalId);
    // CANH BAO truoc khi chen de khach moi khong tu lap thanh "trung voi chinh no". Khong chan,
    // khong hop nhat: hai nguoi that co the chung so dien thoai.
    const matches = await this.repository.findCustomersByContact(tenantId, { phone, nationalId });
    const customer = await this.repository.insertCustomer(tenantId, {
      kind: input.kind,
      displayName: input.displayName,
      source: orNull(input.source),
      category: orNull(input.category),
      phone,
      nationalId,
      email: orNull(input.email),
      address: orNull(input.address),
      taxCode: orNull(input.taxCode),
      note: orNull(input.note),
    });
    await this.audit.append({
      actor,
      action: 'vi-bang.customer.create',
      entityType: 'ViBangCustomer',
      entityId: customer.id,
      after: { id: customer.id, kind: customer.kind, duplicateWarnings: matches.length },
    });
    return {
      customer,
      possibleDuplicates: matches.map((match) => ({
        customerId: match.id,
        matchedOn: [
          ...(phone !== null && match.phone === phone ? (['phone'] as const) : []),
          ...(nationalId !== null && match.nationalId === nationalId
            ? (['nationalId'] as const)
            : []),
        ],
      })),
    };
  }

  async getCustomer(id: string): Promise<Customer> {
    const customer = await this.repository.getCustomer(trustedTenantScope().tenantId, id);
    if (!customer) throw new ViBangError('CUSTOMER_NOT_FOUND', `Khong tim thay khach hang ${id}`);
    return customer;
  }

  async listCustomers(query: ListCustomersQuery): Promise<Page<Customer>> {
    const items = await this.repository.listCustomers(trustedTenantScope().tenantId, query);
    return { items, limit: query.limit, offset: query.offset };
  }

  /* ------------------------------ Contract ------------------------------ */

  async createContract(input: CreateContractInput, actor: string): Promise<ServiceContract> {
    const { tenantId } = trustedTenantScope();
    await this.requireCustomer(tenantId, input.customerId);
    const contract = await this.repository.insertContract(tenantId, {
      customerId: input.customerId,
      contractRef: input.contractRef,
      title: orNull(input.title),
      signedAt: orNull(input.signedAt),
      note: orNull(input.note),
    });
    await this.audit.append({
      actor,
      action: 'vi-bang.contract.create',
      entityType: 'ViBangServiceContract',
      entityId: contract.id,
      after: { id: contract.id, customerId: contract.customerId },
    });
    return contract;
  }

  async getContract(id: string): Promise<ServiceContract> {
    const contract = await this.repository.getContract(trustedTenantScope().tenantId, id);
    if (!contract) throw new ViBangError('CONTRACT_NOT_FOUND', `Khong tim thay hop dong ${id}`);
    return contract;
  }

  async listContracts(query: ListContractsQuery): Promise<Page<ServiceContract>> {
    const items = await this.repository.listContracts(trustedTenantScope().tenantId, query);
    return { items, limit: query.limit, offset: query.offset };
  }

  /* -------------------------------- Case -------------------------------- */

  async createCase(input: CreateCaseInput, actor: string): Promise<ViBangCase> {
    const { tenantId } = trustedTenantScope();
    await this.requireCustomer(tenantId, input.customerId);
    if (input.contractId) {
      const contract = await this.repository.getContract(tenantId, input.contractId);
      if (!contract) {
        throw new ViBangError('CONTRACT_NOT_FOUND', `Khong tim thay hop dong ${input.contractId}`);
      }
      if (contract.customerId !== input.customerId) {
        throw new ViBangError(
          'CONTRACT_CUSTOMER_MISMATCH',
          'Hop dong khong thuoc khach hang cua ho so',
        );
      }
    }
    for (const participant of input.participants) {
      if (participant.customerId) await this.requireCustomer(tenantId, participant.customerId);
    }
    const created = await this.repository.insertCase(tenantId, {
      customerId: input.customerId,
      contractId: orNull(input.contractId),
      executorUserId: orNull(input.executorUserId),
      secretaryUserId: orNull(input.secretaryUserId),
      branch: orNull(input.branch),
      occurredAt: orNull(input.occurredAt),
      location: orNull(input.location),
      content: orNull(input.content),
      registrationNumber: orNull(input.registrationNumber),
      registeredAt: orNull(input.registeredAt),
      participants: input.participants.map((p) => ({
        kind: p.kind,
        customerId: orNull(p.customerId),
        displayName: p.displayName,
        roleLabel: orNull(p.roleLabel),
      })),
      createdBy: actor,
    });
    await this.audit.append({
      actor,
      action: 'vi-bang.case.create',
      entityType: 'ViBangCase',
      entityId: created.id,
      after: {
        id: created.id,
        customerId: created.customerId,
        contractId: created.contractId,
        status: created.status,
      },
    });
    return created;
  }

  async getCase(id: string): Promise<ViBangCase> {
    const found = await this.repository.getCase(trustedTenantScope().tenantId, id);
    if (!found) throw new ViBangError('CASE_NOT_FOUND', `Khong tim thay ho so ${id}`);
    return found;
  }

  async listCases(query: ListCasesQuery): Promise<Page<ViBangCase>> {
    const items = await this.repository.listCases(trustedTenantScope().tenantId, query);
    return { items, limit: query.limit, offset: query.offset };
  }

  /**
   * Chuyen trang thai — DUONG DUY NHAT doi `status`. FAIL-CLOSED: canh khong nam trong bang
   * (`canTransition`) bi tu choi truoc khi cham kho; canh hop le van chi ghi duoc neu ho so con
   * dung o trang thai da doc.
   */
  async transitionCase(id: string, to: CaseStatus, actor: string): Promise<ViBangCase> {
    const { tenantId } = trustedTenantScope();
    const current = await this.getCase(id);
    if (!canTransition(current.status, to)) {
      throw new ViBangError(
        'TRANSITION_NOT_ALLOWED',
        `Khong cho phep chuyen ho so ${id} tu ${current.status} sang ${to}`,
      );
    }
    const updated = await this.repository.transitionCase(tenantId, id, current.status, to);
    if (!updated) {
      throw new ViBangError('STATE_CHANGED', `Ho so ${id} da doi trang thai, hay doc lai`);
    }
    await this.audit.append({
      actor,
      action: 'vi-bang.case.transition',
      entityType: 'ViBangCase',
      entityId: id,
      before: { status: current.status },
      after: { status: updated.status },
    });
    return updated;
  }

  private async requireCustomer(tenantId: string, id: string): Promise<void> {
    if (!(await this.repository.getCustomer(tenantId, id))) {
      throw new ViBangError('CUSTOMER_NOT_FOUND', `Khong tim thay khach hang ${id}`);
    }
  }
}
