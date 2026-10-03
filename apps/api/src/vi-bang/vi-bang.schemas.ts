import { z } from 'zod';
import { CASE_STATUSES, CUSTOMER_KINDS, PARTICIPANT_KINDS } from './vi-bang.types.js';

const trimmed = z.string().trim();
const text = (max: number) => trimmed.min(1).max(max);
const isoDateTime = z.iso.datetime({ offset: true });

/**
 * MOI schema la `.strict()`: mot body mang `tenantId` (hay bat ky khoa la nao) bi TU CHOI, khong
 * bi lam ngo. Pham vi khach den tu goi khach cua may chu, khong tu nguoi goi.
 */
export const createCustomerSchema = z
  .object({
    kind: z.enum(CUSTOMER_KINDS),
    displayName: text(200),
    source: text(100).nullish(),
    category: text(100).nullish(),
    phone: text(30).nullish(),
    nationalId: text(30).nullish(),
    email: text(200).nullish(),
    address: text(500).nullish(),
    taxCode: text(30).nullish(),
    note: text(1000).nullish(),
  })
  .strict();

export const createContractSchema = z
  .object({
    customerId: text(100),
    contractRef: text(100),
    title: text(200).nullish(),
    signedAt: isoDateTime.nullish(),
    note: text(1000).nullish(),
  })
  .strict();

const participantSchema = z
  .object({
    kind: z.enum(PARTICIPANT_KINDS),
    customerId: text(100).nullish(),
    displayName: text(200),
    roleLabel: text(100).nullish(),
  })
  .strict();

export const createCaseSchema = z
  .object({
    customerId: text(100),
    contractId: text(100).nullish(),
    executorUserId: text(100).nullish(),
    secretaryUserId: text(100).nullish(),
    branch: text(100).nullish(),
    occurredAt: isoDateTime.nullish(),
    location: text(500).nullish(),
    content: text(5000).nullish(),
    registrationNumber: text(100).nullish(),
    registeredAt: isoDateTime.nullish(),
    participants: z.array(participantSchema).max(50).default([]),
  })
  .strict();

export const transitionCaseSchema = z.object({ to: z.enum(CASE_STATUSES) }).strict();

const pagination = {
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
};

export const listCustomersQuerySchema = z
  .object({ q: text(100).optional(), kind: z.enum(CUSTOMER_KINDS).optional(), ...pagination })
  .strict();

export const listContractsQuerySchema = z
  .object({ q: text(100).optional(), customerId: text(100).optional(), ...pagination })
  .strict();

export const listCasesQuerySchema = z
  .object({
    q: text(100).optional(),
    customerId: text(100).optional(),
    contractId: text(100).optional(),
    status: z.enum(CASE_STATUSES).optional(),
    ...pagination,
  })
  .strict();

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type CreateContractInput = z.infer<typeof createContractSchema>;
export type CreateCaseInput = z.infer<typeof createCaseSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type ListContractsQuery = z.infer<typeof listContractsQuerySchema>;
export type ListCasesQuery = z.infer<typeof listCasesQuerySchema>;
