import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RequestMeta } from '../common/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId?: string;
  action: string; // e.g. "content.approve", "user.role_change"
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  meta?: RequestMeta;
}

/**
 * Writes the append-only audit trail for sensitive admin actions (spec §21).
 * Pass a transaction client so the audit row commits or rolls back with the action.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata,
        ip: entry.meta?.ip,
        userAgent: entry.meta?.userAgent?.slice(0, 300),
      },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
