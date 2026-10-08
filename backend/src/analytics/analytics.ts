import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, MaxLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import { Roles } from '../common/auth.decorators';
import { paginate, PaginationQuery, skipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { wilsonInterval } from './wilson';

class PeriodQuery {
  @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @IsOptional() @Type(() => Date) @IsDate() to?: Date;
}

class AuditQuery extends PaginationQuery {
  @IsOptional() @IsString() actor?: string;
  @IsOptional() @IsString() @MaxLength(100) action?: string;
  @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @IsOptional() @Type(() => Date) @IsDate() to?: Date;
}

const CONTENT_TABLES = ['requirement', 'serviceStep', 'fee', 'processingTime', 'serviceLocation'] as const;

/**
 * Admin dashboard numbers (spec §23). Each query answers a specific question;
 * see docs/backend/README.md for which question each block answers.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** "What state is the catalogue in, and what needs attention?" */
  async overview() {
    const [servicesByStatus, servicesByCategory, sourcesByStatus, feedbackOpen, recentChanges, ...contentCounts] = await Promise.all([
      this.prisma.service.groupBy({ by: ['publishStatus'], _count: true }),
      this.prisma.category.findMany({ select: { slug: true, nameKm: true, nameEn: true, _count: { select: { services: true } } } }),
      this.prisma.source.groupBy({ by: ['status'], _count: true }),
      this.prisma.feedback.count({ where: { status: 'OPEN' } }),
      this.prisma.changeRecord.findMany({
        orderBy: { createdAt: 'desc' }, take: 10,
        select: { id: true, changeType: true, entityType: true, summaryKm: true, summaryEn: true, createdAt: true, service: { select: { slug: true, nameKm: true } } },
      }),
      ...CONTENT_TABLES.map((t) => (this.prisma[t] as unknown as { groupBy: (a: object) => Promise<{ status: string; _count: number }[]> }).groupBy({ by: ['status'], _count: true })),
    ]);

    const contentByStatus: Record<string, number> = {};
    for (const groups of contentCounts) for (const g of groups) contentByStatus[g.status] = (contentByStatus[g.status] ?? 0) + g._count;

    const staleThreshold = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const staleServices = await this.prisma.service.count({
      where: { publishStatus: 'PUBLISHED', OR: [{ lastVerifiedAt: null }, { lastVerifiedAt: { lt: staleThreshold } }] },
    });

    return {
      services: {
        byStatus: Object.fromEntries(servicesByStatus.map((g) => [g.publishStatus, g._count])),
        byCategory: servicesByCategory.map((c) => ({ slug: c.slug, nameKm: c.nameKm, nameEn: c.nameEn, count: c._count.services })),
        notVerifiedIn180Days: staleServices,
      },
      sources: Object.fromEntries(sourcesByStatus.map((g) => [g.status, g._count])),
      content: {
        byStatus: contentByStatus,
        pendingReview: (contentByStatus.PENDING ?? 0) + (contentByStatus.UNDER_REVIEW ?? 0),
        outdated: contentByStatus.OUTDATED ?? 0,
      },
      feedback: { open: feedbackOpen },
      recentChanges,
    };
  }

  /** "Which services are hard, and which steps confuse people?" (RQ3) */
  async feedback(q: PeriodQuery) {
    const createdAt = q.from || q.to ? { gte: q.from, lte: q.to } : undefined;
    const where: Prisma.FeedbackWhereInput = { createdAt };

    const [byService, services, stepReports, stepTotals, stepMeta] = await Promise.all([
      this.prisma.feedback.groupBy({
        by: ['serviceId'], where, _count: { _all: true }, _avg: { rating: true, difficulty: true },
      }),
      this.prisma.service.findMany({ select: { id: true, slug: true, nameKm: true, nameEn: true } }),
      this.prisma.feedback.groupBy({ by: ['confusingStepId'], where: { ...where, confusingStepId: { not: null } }, _count: { _all: true } }),
      this.prisma.feedback.groupBy({ by: ['serviceId'], where: { ...where, kind: 'RATING' }, _count: { _all: true } }),
      this.prisma.serviceStep.findMany({ where: { status: 'VERIFIED' }, select: { id: true, serviceId: true, position: true, titleKm: true, titleEn: true } }),
    ]);

    const serviceById = new Map(services.map((s) => [s.id, s]));
    const responsesByService = new Map(stepTotals.map((t) => [t.serviceId, t._count._all]));
    const stepById = new Map(stepMeta.map((s) => [s.id, s]));

    const confusingSteps = stepReports
      .map((r) => {
        const step = stepById.get(r.confusingStepId!);
        if (!step) return null;
        // Denominator: rating responses for the step's service (each could have named this step).
        const total = Math.max(responsesByService.get(step.serviceId) ?? 0, r._count._all);
        return {
          step: { id: step.id, position: step.position, titleKm: step.titleKm, titleEn: step.titleEn },
          service: serviceById.get(step.serviceId),
          reports: r._count._all,
          responses: total,
          confusionRate: wilsonInterval(r._count._all, total),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.confusionRate.low - a.confusionRate.low);

    return {
      byService: byService
        .map((g) => ({
          service: serviceById.get(g.serviceId),
          responses: g._count._all,
          avgRating: g._avg.rating !== null ? Number(g._avg.rating.toFixed(2)) : null,
          avgDifficulty: g._avg.difficulty !== null ? Number(g._avg.difficulty.toFixed(2)) : null,
        }))
        .sort((a, b) => (b.avgDifficulty ?? 0) - (a.avgDifficulty ?? 0)),
      confusingSteps,
      note: 'Steps are ranked by the lower bound of the 95% Wilson interval, so small samples do not dominate.',
    };
  }

  async auditLogs(q: AuditQuery) {
    const where: Prisma.AuditLogWhereInput = {
      actorId: q.actor,
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.from || q.to ? { createdAt: { gte: q.from, lte: q.to } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where, orderBy: { createdAt: 'desc' }, ...skipTake(q),
        include: { actor: { select: { email: true, displayName: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(rows.map((r) => ({ ...r, id: r.id.toString() })), total, q);
  }
}

@Roles('ADMIN')
@Controller('admin')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('analytics/overview')
  async overview() {
    return { data: await this.analytics.overview() };
  }

  @Get('analytics/feedback')
  async feedback(@Query() q: PeriodQuery) {
    return { data: await this.analytics.feedback(q) };
  }

  @Get('audit-logs')
  auditLogs(@Query() q: AuditQuery) {
    return this.analytics.auditLogs(q);
  }
}

@Module({ controllers: [AnalyticsController], providers: [AnalyticsService] })
export class AnalyticsModule {}
