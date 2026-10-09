import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContentOrigin, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../common/auth.decorators';
import { BusinessRuleError, ConflictError, NotFoundError } from '../common/errors/app-exceptions';
import { paginate, PaginationQuery } from '../common/pagination';
import { CONTENT_REGISTRY, CONTENT_TYPES, ContentRow, ContentType, ContentTypeDef, contentType, contentValues } from '../content/content-types';
import { PrismaService } from '../prisma/prisma.service';

export interface ReviewQueueFilter extends PaginationQuery {
  service?: string; // service slug
  origin?: ContentOrigin;
  minConfidence?: number;
}

const REVIEWABLE = ['PENDING', 'UNDER_REVIEW'] as const;

/**
 * The verification workflow (spec §7, ADR-003). This is the ONLY code path that
 * makes content public. Each decision runs in one transaction that also writes
 * the verification record, the public change record and the audit log.
 */
@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** Pending items across all content types, oldest first, with evidence and the row being replaced. */
  async queue(q: ReviewQueueFilter) {
    const where: Record<string, unknown> = {
      status: { in: REVIEWABLE },
      ...(q.origin ? { origin: q.origin } : {}),
      ...(q.minConfidence !== undefined ? { confidence: { gte: q.minConfidence } } : {}),
      ...(q.service ? { service: { slug: q.service } } : {}),
    };
    const include = {
      service: { select: { id: true, slug: true, nameKm: true, nameEn: true } },
      source: { select: { id: true, code: true, name: true, url: true, tier: true, status: true } },
      supersedes: true,
    };

    // Small volumes at MVP scale: gather all types, then sort and page in memory.
    const perType = await Promise.all(
      CONTENT_TYPES.map(async (type) => {
        const def = CONTENT_REGISTRY[type];
        const rows = await def.delegate(this.prisma).findMany({ where, include, orderBy: { createdAt: 'asc' } });
        return rows.map((row) => this.toQueueItem(type, def, row));
      }),
    );
    const all = perType.flat().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const start = (q.page - 1) * q.pageSize;
    return paginate(all.slice(start, start + q.pageSize), all.length, q);
  }

  async startReview(type: string, id: string, reviewerId: string, meta: RequestMeta) {
    const def = contentType(type);
    return this.prisma.$transaction(async (tx) => {
      const { count } = await def.delegate(tx).updateMany({ where: { id, status: 'PENDING' }, data: { status: 'UNDER_REVIEW' } });
      if (count !== 1) throw await this.notReviewable(def, tx, id);
      await this.log(tx, def, id, 'START_REVIEW', reviewerId, undefined, meta);
      return def.delegate(tx).findUnique({ where: { id } });
    });
  }

  async approve(type: string, id: string, reviewerId: string, comment: string | undefined, meta: RequestMeta) {
    const def = contentType(type);
    return this.prisma.$transaction(async (tx) => {
      const row = await def.delegate(tx).findUnique({ where: { id } });
      if (!row) throw new NotFoundError('Content');
      if (!REVIEWABLE.includes(row.status as (typeof REVIEWABLE)[number])) {
        throw new ConflictError(`Only pending content can be approved (current status: ${row.status})`);
      }
      await this.assertApprovable(def, row, reviewerId, tx);

      // Swap the superseded row out first; if someone changed it meanwhile, abort.
      let previous: ContentRow | null = null;
      if (row.supersedesId) {
        previous = await def.delegate(tx).findUnique({ where: { id: row.supersedesId } });
        const { count } = await def.delegate(tx).updateMany({
          where: { id: row.supersedesId, status: 'VERIFIED' },
          data: { status: 'OUTDATED' },
        });
        if (count !== 1) {
          throw new ConflictError('The content this change replaces is no longer verified; reject this change and start again');
        }
      }

      const now = new Date();
      const { count } = await def.delegate(tx).updateMany({
        where: { id, status: { in: REVIEWABLE } },
        data: { status: 'VERIFIED', verifiedById: reviewerId, verifiedAt: now },
      });
      if (count !== 1) throw new ConflictError('This item was reviewed by someone else at the same time');

      const label = def.label(row);
      await tx.changeRecord.create({
        data: {
          serviceId: row.serviceId,
          entityType: def.entityType,
          entityId: id,
          previousEntityId: previous?.id,
          changeType: previous ? 'CHANGED' : 'ADDED',
          summaryKm: label.km,
          summaryEn: label.en,
          diff: (previous
            ? { before: contentValues(def, previous), after: contentValues(def, row) }
            : { after: contentValues(def, row) }) as Prisma.InputJsonValue,
        },
      });
      await tx.service.update({ where: { id: row.serviceId }, data: { lastVerifiedAt: now } });
      await this.log(tx, def, id, 'APPROVE', reviewerId, comment, meta);
      return def.delegate(tx).findUnique({ where: { id } });
    });
  }

  async reject(type: string, id: string, reviewerId: string, comment: string, meta: RequestMeta) {
    const def = contentType(type);
    return this.prisma.$transaction(async (tx) => {
      const { count } = await def.delegate(tx).updateMany({ where: { id, status: { in: REVIEWABLE } }, data: { status: 'REJECTED' } });
      if (count !== 1) throw await this.notReviewable(def, tx, id);
      await this.log(tx, def, id, 'REJECT', reviewerId, comment, meta);
      return def.delegate(tx).findUnique({ where: { id } });
    });
  }

  /** Withdraws verified content from public view (e.g. the office stopped requiring a document). */
  async markOutdated(type: string, id: string, reviewerId: string, comment: string, meta: RequestMeta) {
    const def = contentType(type);
    return this.prisma.$transaction(async (tx) => {
      const row = await def.delegate(tx).findUnique({ where: { id } });
      if (!row) throw new NotFoundError('Content');
      const { count } = await def.delegate(tx).updateMany({ where: { id, status: 'VERIFIED' }, data: { status: 'OUTDATED' } });
      if (count !== 1) throw new ConflictError(`Only verified content can be marked outdated (current status: ${row.status})`);

      const label = def.label(row);
      await tx.changeRecord.create({
        data: {
          serviceId: row.serviceId, entityType: def.entityType, entityId: id, changeType: 'REMOVED',
          summaryKm: label.km, summaryEn: label.en,
          diff: { before: contentValues(def, row) } as Prisma.InputJsonValue,
        },
      });
      await this.log(tx, def, id, 'MARK_OUTDATED', reviewerId, comment, meta);
      return def.delegate(tx).findUnique({ where: { id } });
    });
  }

  /** Approval rules: Khmer text, a verified official source with evidence, and optionally a second person. */
  private async assertApprovable(def: ContentTypeDef, row: ContentRow, reviewerId: string, tx: Prisma.TransactionClient): Promise<void> {
    if (!row[def.textFields.km]) {
      throw new BusinessRuleError(`Add the Khmer text (${def.textFields.km}) before approving; Khmer is required for published content`);
    }
    if (!row.sourceId) throw new BusinessRuleError('Content without a source cannot be approved');
    const source = await tx.source.findUnique({ where: { id: row.sourceId } });
    if (!source || source.status !== 'VERIFIED') {
      throw new BusinessRuleError('The source must be verified before content from it can be approved');
    }
    if (source.tier === 'T3') {
      throw new BusinessRuleError('Secondary (T3) sources cannot support published content; cite an official source');
    }
    if (!row.evidence) throw new BusinessRuleError('Content without evidence from the source cannot be approved');
    if (this.config.get<boolean>('REQUIRE_DIFFERENT_APPROVER') && row.createdById === reviewerId) {
      throw new BusinessRuleError('Content must be approved by a different admin than the one who created it');
    }
  }

  private async notReviewable(def: ContentTypeDef, tx: Prisma.TransactionClient, id: string) {
    const row = await def.delegate(tx).findUnique({ where: { id } });
    return row ? new ConflictError(`This action is not allowed for ${row.status} content`) : new NotFoundError('Content');
  }

  private async log(
    tx: Prisma.TransactionClient,
    def: ContentTypeDef,
    id: string,
    action: 'START_REVIEW' | 'APPROVE' | 'REJECT' | 'MARK_OUTDATED',
    reviewerId: string,
    comment: string | undefined,
    meta: RequestMeta,
  ): Promise<void> {
    await tx.verification.create({ data: { entityType: def.entityType, entityId: id, action, reviewerId, comment } });
    await this.audit.record(
      { actorId: reviewerId, action: `content.${action.toLowerCase()}`, entityType: def.entityType, entityId: id, metadata: comment ? { comment } : undefined, meta },
      tx,
    );
  }

  private toQueueItem(type: ContentType, def: ContentTypeDef, row: ContentRow) {
    const { service, source, supersedes } = row as ContentRow & { service: unknown; source: unknown; supersedes: ContentRow | null };
    return {
      contentType: type,
      id: row.id,
      status: row.status,
      origin: row.origin,
      confidence: row.confidence ?? null,
      label: def.label(row),
      values: contentValues(def, row),
      evidence: row.evidence,
      service,
      source,
      replaces: supersedes ? { id: supersedes.id, values: contentValues(def, supersedes) } : null,
      createdById: row.createdById,
      createdAt: row.createdAt,
    };
  }
}
