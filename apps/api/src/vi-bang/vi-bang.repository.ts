import type { ListCasesQuery, ListContractsQuery, ListCustomersQuery } from './vi-bang.schemas.js';
import type {
  CaseParticipant,
  CaseStatus,
  Customer,
  ServiceContract,
  ViBangCase,
} from './vi-bang.types.js';

/** Du lieu da CHUAN HOA (khong `undefined`) — service la noi duy nhat doi `undefined` thanh `null`. */
export type NewCustomer = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>;
export type NewContract = Omit<ServiceContract, 'id' | 'createdAt' | 'updatedAt'>;
export type NewCase = Omit<
  ViBangCase,
  'id' | 'status' | 'participants' | 'createdAt' | 'updatedAt'
> & { readonly participants: readonly Omit<CaseParticipant, 'id'>[] };

/**
 * Kho cua mien vi bang. MOI ham nhan `tenantId` DO MAY CHU cap (`trustedTenantScope()`); khong ham
 * nao doc `tenantId` tu dau vao cua nguoi goi, va moi truy van deu bi gioi han boi no.
 */
export abstract class ViBangRepository {
  abstract insertCustomer(tenantId: string, data: NewCustomer): Promise<Customer>;
  abstract getCustomer(tenantId: string, id: string): Promise<Customer | null>;
  abstract listCustomers(tenantId: string, query: ListCustomersQuery): Promise<Customer[]>;
  /** Khach co CUNG phone HOAC CUNG nationalId — dung de CANH BAO, khong de hop nhat. */
  abstract findCustomersByContact(
    tenantId: string,
    keys: { readonly phone: string | null; readonly nationalId: string | null },
  ): Promise<Customer[]>;

  abstract insertContract(tenantId: string, data: NewContract): Promise<ServiceContract>;
  abstract getContract(tenantId: string, id: string): Promise<ServiceContract | null>;
  abstract listContracts(tenantId: string, query: ListContractsQuery): Promise<ServiceContract[]>;

  abstract insertCase(tenantId: string, data: NewCase): Promise<ViBangCase>;
  abstract getCase(tenantId: string, id: string): Promise<ViBangCase | null>;
  abstract listCases(tenantId: string, query: ListCasesQuery): Promise<ViBangCase[]>;
  /**
   * Doi trang thai co DIEU KIEN: chi thanh cong khi ho so con dung o `from`. `null` = khong co ho
   * so (trong pham vi nay) HOAC no da roi khoi `from` — hai yeu cau song song khong ghi de nhau.
   */
  abstract transitionCase(
    tenantId: string,
    id: string,
    from: CaseStatus,
    to: CaseStatus,
  ): Promise<ViBangCase | null>;
}
