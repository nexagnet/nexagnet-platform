/**
 * Kieu cua mien VI BANG (Issue #427). Mien nay DOC LAP: khong import `transport/`, `messaging`,
 * `turn-processing` hay mot cong LLM nao. Enum nghiep vu o DAY, khong o nen tang.
 */

export const CUSTOMER_KINDS = ['PERSON', 'ORGANIZATION'] as const;
export type CustomerKind = (typeof CUSTOMER_KINDS)[number];

/** Tam trang thai cua ho so, theo thu tu vong doi. */
export const CASE_STATUSES = [
  'DRAFT',
  'IN_PROGRESS',
  'WAITING_PAYMENT',
  'WAITING_NUMBER',
  'NUMBERED',
  'STAMPED',
  'ISSUED',
  'RETURNED',
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const PARTICIPANT_KINDS = ['REQUESTER', 'PARTICIPANT'] as const;
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];

export interface Customer {
  readonly id: string;
  readonly kind: CustomerKind;
  readonly displayName: string;
  readonly source: string | null;
  readonly category: string | null;
  readonly phone: string | null;
  readonly nationalId: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly taxCode: string | null;
  readonly note: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ServiceContract {
  readonly id: string;
  readonly customerId: string;
  readonly contractRef: string;
  readonly title: string | null;
  readonly signedAt: string | null;
  readonly note: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CaseParticipant {
  readonly id: string;
  readonly kind: ParticipantKind;
  readonly customerId: string | null;
  readonly displayName: string;
  readonly roleLabel: string | null;
}

export interface ViBangCase {
  readonly id: string;
  readonly customerId: string;
  readonly contractId: string | null;
  readonly status: CaseStatus;
  readonly executorUserId: string | null;
  readonly secretaryUserId: string | null;
  readonly branch: string | null;
  readonly occurredAt: string | null;
  readonly location: string | null;
  readonly content: string | null;
  /** Dang ky PHAP LY. KHONG phai so vi bang (cap o issue sau). */
  readonly registrationNumber: string | null;
  readonly registeredAt: string | null;
  readonly participants: readonly CaseParticipant[];
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Canh bao trung — CHI canh bao, khong bao gio hop nhat. Khong mang PII ngoai `id`. */
export interface DuplicateWarning {
  readonly customerId: string;
  readonly matchedOn: readonly ('phone' | 'nationalId')[];
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly limit: number;
  readonly offset: number;
}
