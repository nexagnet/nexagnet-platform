import { Injectable } from '@nestjs/common';
import {
  auditLogSchema,
  auditLogFilterSchema,
  type AuditLog,
  type AuditLogFilter,
} from '@netviet/shared';
import { Prisma, type AuditLog as PrismaAuditLog } from '@prisma/client';
import { PrismaService } from '../config/prisma.service.js';
import { AuditLogRepository, type AppendAuditLogInput } from './audit-log.repository.js';

@Injectable()
export class PrismaAuditLogRepository extends AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** Client giao dich co CUNG delegate `auditLog` — cung cau lenh, trong giao dich cua nguoi goi. */
  override onTransaction(client: unknown): AuditLogRepository {
    return new PrismaAuditLogRepository(client as PrismaService);
  }

  async append(input: AppendAuditLogInput): Promise<AuditLog> {
    const row = await this.prisma.auditLog.create({
      data: {
        actor: input.actor,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        before: input.before === null ? Prisma.DbNull : (input.before as Prisma.InputJsonValue),
        after: input.after === null ? Prisma.DbNull : (input.after as Prisma.InputJsonValue),
        requestId: input.requestId,
        createdAt: new Date(input.createdAt),
      },
    });
    return toAuditLog(row);
  }

  async list(filter: AuditLogFilter = {}): Promise<AuditLog[]> {
    const parsed = auditLogFilterSchema.parse(filter);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(parsed.actor ? { actor: parsed.actor } : {}),
        ...(parsed.action ? { action: parsed.action } : {}),
        ...(parsed.entityType ? { entityType: parsed.entityType } : {}),
        ...(parsed.entityId ? { entityId: parsed.entityId } : {}),
        ...(parsed.from || parsed.to
          ? {
              createdAt: {
                ...(parsed.from ? { gte: new Date(parsed.from) } : {}),
                ...(parsed.to ? { lte: new Date(parsed.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: parsed.limit,
    });
    return rows.map(toAuditLog);
  }
}

function toAuditLog(row: PrismaAuditLog): AuditLog {
  return auditLogSchema.parse({
    ...row,
    before: jsonOrNull(row.before),
    after: jsonOrNull(row.after),
    createdAt: row.createdAt.toISOString(),
  });
}

function jsonOrNull(
  value: Prisma.JsonValue | typeof Prisma.DbNull | null,
): Prisma.JsonValue | null {
  return value === null || value === Prisma.DbNull ? null : (value as Prisma.JsonValue);
}
