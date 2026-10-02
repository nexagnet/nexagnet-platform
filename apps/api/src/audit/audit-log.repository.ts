import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { auditLogFilterSchema, auditLogSchema } from '@netviet/shared';
import type { AuditJsonValue, AuditLog, AuditLogFilter } from '@netviet/shared';

export interface AppendAuditLogInput {
  actor: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: AuditJsonValue | null;
  after: AuditJsonValue | null;
  requestId: string | null;
  createdAt: string;
}

/** Append-only persistence seam: deliberately exposes no update or delete operation. */
export abstract class AuditLogRepository {
  abstract append(input: AppendAuditLogInput): Promise<AuditLog>;
  abstract list(filter?: AuditLogFilter): Promise<AuditLog[]>;

  /**
   * CHINH kho nay, nhung ghi tren mot GIAO DICH dang mo (`client` = client giao dich Prisma) — de
   * dong dau vet nam trong cung don vi cong viec voi thay doi no ke (`#395`, `audit-trail.ts`).
   * `null` = kho khong nhap duoc vao giao dich do (bo nho): nguoi goi ghi dau vet sau commit.
   */
  onTransaction(_client: unknown): AuditLogRepository | null {
    return null;
  }
}

function cloneLog(log: AuditLog): AuditLog {
  return structuredClone(log);
}

@Injectable()
export class InMemoryAuditLogRepository extends AuditLogRepository {
  private store: readonly AuditLog[] = [];

  async append(input: AppendAuditLogInput): Promise<AuditLog> {
    const entry = auditLogSchema.parse({ id: randomUUID(), ...structuredClone(input) });
    this.store = [...this.store, entry];
    return cloneLog(entry);
  }

  async list(filter: AuditLogFilter = {}): Promise<AuditLog[]> {
    const parsed = auditLogFilterSchema.parse(filter);
    return this.store
      .filter((entry) => {
        if (parsed.actor && entry.actor !== parsed.actor) return false;
        if (parsed.action && entry.action !== parsed.action) return false;
        if (parsed.entityType && entry.entityType !== parsed.entityType) return false;
        if (parsed.entityId && entry.entityId !== parsed.entityId) return false;
        if (parsed.from && entry.createdAt < parsed.from) return false;
        if (parsed.to && entry.createdAt > parsed.to) return false;
        return true;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, parsed.limit)
      .map(cloneLog);
  }
}
