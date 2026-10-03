import { Module } from '@nestjs/common';
import { AuditLogRepository, InMemoryAuditLogRepository } from '../audit/audit-log.repository.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import { PrismaAuditLogRepository } from '../audit/prisma-audit-log.repository.js';
import { loadFoundationEnv } from '../config/foundation-env.js';
import { PrismaModule } from '../config/prisma.module.js';
import { PrismaService } from '../config/prisma.service.js';
import { InMemoryViBangRepository } from './in-memory-vi-bang.repository.js';
import { PrismaViBangRepository } from './prisma-vi-bang.repository.js';
import { ViBangRepository } from './vi-bang.repository.js';
import { ViBangService } from './vi-bang.service.js';

/**
 * Capability `vi-bang-management` (Issue #427) — khach hang, hop dong dich vu, ho so vi bang.
 *
 * DOC LAP: khong phu thuoc capability nao, khong import `transport/`, khong can messaging hay LLM.
 * Tu cung cap `AuditLogService` cua chinh no (cung ly do voi `TransportModule`): `vi-bang-management`
 * khong keo theo `operations`, nhung moi lan tao/chuyen trang thai van phai co dau vet.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: AuditLogRepository,
      useFactory: (prisma: PrismaService): AuditLogRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaAuditLogRepository(prisma)
          : new InMemoryAuditLogRepository(),
      inject: [PrismaService],
    },
    AuditLogService,
    {
      provide: ViBangRepository,
      useFactory: (prisma: PrismaService): ViBangRepository =>
        loadFoundationEnv().PERSISTENCE === 'prisma'
          ? new PrismaViBangRepository(prisma)
          : new InMemoryViBangRepository(),
      inject: [PrismaService],
    },
    ViBangService,
  ],
  exports: [ViBangService, ViBangRepository],
})
export class ViBangModule {}
