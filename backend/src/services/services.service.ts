import { Injectable } from '@nestjs/common';
import { Prisma, RequirementKind } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../common/auth.decorators';
import { BusinessRuleError, NotFoundError } from '../common/errors/app-exceptions';
import { paginate, parseSort, skipTake } from '../common/pagination';
import { MlClient } from '../ml/ml.client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminListServicesQuery, CreateServiceDto, ListServicesQuery, UpdateServiceDto } from './services.dto';

/** Only verified content is ever selected for citizens (spec rule 11). */
const VERIFIED = { status: 'VERIFIED' } as const;
const SOURCE_REF = { select: { code: true, name: true, url: true, tier: true } } as const;
const PUBLIC_META = { id: true, appliesTo: true, verifiedAt: true, source: SOURCE_REF } as const;

const SERVICE_SUMMARY = {
  id: true, slug: true, nameKm: true, nameEn: true, summaryKm: true, summaryEn: true,
  governmentLevel: true, lastVerifiedAt: true,
  category: { select: { slug: true, nameKm: true, nameEn: true } },
} satisfies Prisma.ServiceSelect;

const PUBLIC_SORT = ['nameKm', 'nameEn', 'lastVerifiedAt'] as const;
/** Below this similarity a match is noise (shared character n-grams only). */
const MIN_SIMILARITY = 0.05;

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ml: MlClient,
  ) {}

  // ─── Public ──────────────────────────────────────────────────────────────

  async listPublic(q: ListServicesQuery) {
    return this.list({ ...this.filters(q), publishStatus: 'PUBLISHED' }, q, PUBLIC_SORT);
  }

  async getPublic(slug: string) {
    const service = await this.prisma.service.findFirst({
      where: { slug, publishStatus: 'PUBLISHED' },
      select: {
        ...SERVICE_SUMMARY,
        responsibleBodyKm: true,
        responsibleBodyEn: true,
        requirements: {
          where: VERIFIED,
          orderBy: [{ kind: 'asc' }, { position: 'asc' }],
          select: { ...PUBLIC_META, kind: true, textKm: true, textEn: true, position: true },
        },
        steps: {
          where: VERIFIED,
          orderBy: { position: 'asc' },
          select: { ...PUBLIC_META, position: true, titleKm: true, titleEn: true, detailKm: true, detailEn: true },
        },
        fees: {
          where: VERIFIED,
          orderBy: { amount: 'asc' },
          select: { ...PUBLIC_META, amount: true, currency: true, labelKm: true, labelEn: true },
        },
        processingTimes: {
          where: VERIFIED,
          select: { ...PUBLIC_META, minDays: true, maxDays: true, textKm: true, textEn: true },
        },
        locations: {
          where: VERIFIED,
          orderBy: { channel: 'asc' },
          select: {
            ...PUBLIC_META, nameKm: true, nameEn: true, addressKm: true, addressEn: true,
            channel: true, url: true, phone: true, hoursText: true,
          },
        },
        gaps: { select: { field: true, appliesTo: true, checkedAt: true, source: SOURCE_REF } },
        sources: {
          where: { source: { status: 'VERIFIED' } },
          select: { relevance: true, source: { select: { ...SOURCE_REF.select, publisher: true, lastCheckedAt: true } } },
        },
        predictions: {
          where: { kind: 'COMPLEXITY' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { score: true, modelVersion: true, output: true, createdAt: true },
        },
      },
    });
    if (!service) throw new NotFoundError('Service');

    const { gaps, sources, predictions, fees, ...rest } = service;
    return {
      ...rest,
      fees: fees.map((f) => ({ ...f, amount: f.amount.toString() })),
      notStated: gaps.map((g) => ({ field: g.field, appliesTo: g.appliesTo || null, checkedAt: g.checkedAt, source: g.source })),
      sources: sources.map((s) => ({ ...s.source, relevance: s.relevance })),
      complexity: predictions[0] ?? null,
    };
  }

  async requirements(slug: string, kind?: RequirementKind) {
    const service = await this.publishedId(slug);
    return this.prisma.requirement.findMany({
      where: { serviceId: service, ...VERIFIED, ...(kind ? { kind } : {}) },
      orderBy: [{ kind: 'asc' }, { position: 'asc' }],
      select: { ...PUBLIC_META, kind: true, textKm: true, textEn: true, position: true },
    });
  }

  async steps(slug: string) {
    const service = await this.publishedId(slug);
    return this.prisma.serviceStep.findMany({
      where: { serviceId: service, ...VERIFIED },
      orderBy: { position: 'asc' },
      select: { ...PUBLIC_META, position: true, titleKm: true, titleEn: true, detailKm: true, detailEn: true },
    });
  }

  async changes(slug: string) {
    const service = await this.publishedId(slug);
    return this.prisma.changeRecord.findMany({
      where: { serviceId: service },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, entityType: true, changeType: true, summaryKm: true, summaryEn: true, diff: true, createdAt: true },
    });
  }

  /**
   * Search (ADR-005, Phase 7): the ML service's character n-gram ranker first, which
   * was the best system in the Phase 6 evaluation; the database keyword search is the
   * fallback whenever the ML service is not configured, slow or down.
   */
  async search(q: string) {
    if (this.ml.enabled) {
      const services = await this.prisma.service.findMany({
        where: { publishStatus: 'PUBLISHED' },
        select: {
          ...SERVICE_SUMMARY,
          responsibleBodyKm: true,
          responsibleBodyEn: true,
          requirements: { where: VERIFIED, select: { textKm: true, textEn: true } },
          steps: { where: VERIFIED, select: { titleKm: true, titleEn: true } },
          fees: { where: VERIFIED, select: { labelKm: true, labelEn: true } },
        },
      });
      const candidates = services.map((s) => ({
        id: s.id,
        name: [s.nameKm, s.nameEn].filter(Boolean).join(' '),
        text: [
          s.summaryKm, s.summaryEn, s.responsibleBodyKm, s.responsibleBodyEn, s.category.nameKm, s.category.nameEn,
          ...s.requirements.flatMap((r) => [r.textKm, r.textEn]),
          ...s.steps.flatMap((r) => [r.titleKm, r.titleEn]),
          ...s.fees.flatMap((r) => [r.labelKm, r.labelEn]),
        ].filter(Boolean).join('\n'),
      }));
      const result = await this.ml.searchSimilar(q, candidates, 10);
      if (result) {
        const byId = new Map(services.map(({ requirements: _r, steps: _s, fees: _f, responsibleBodyKm: _bk, responsibleBodyEn: _be, ...s }) => [s.id, s]));
        return result.results
          .filter((r) => r.score >= MIN_SIMILARITY && byId.has(r.id))
          .map((r) => ({ ...byId.get(r.id)!, score: Math.round(r.score * 1000) / 1000, matchedBy: 'similarity' as const }));
      }
    }
    return this.keywordSearch(q);
  }

  /**
   * Keyword baseline search (ADR-005): trigram similarity on Khmer and English names
   * and on verified requirement text, plus substring matches. This is the baseline
   * that RQ4 compares ML similarity against.
   */
  async keywordSearch(q: string) {
    const rows = await this.prisma.$queryRaw<{ id: string; score: number }[]>`
      SELECT s.id,
             GREATEST(
               word_similarity(${q}, coalesce(s.name_km, '')),
               word_similarity(${q}, coalesce(s.name_en, '')),
               CASE WHEN coalesce(s.name_km, '') ILIKE '%' || ${q} || '%' OR coalesce(s.name_en, '') ILIKE '%' || ${q} || '%' THEN 1 ELSE 0 END,
               coalesce(max(word_similarity(${q}, coalesce(r.text_km, r.text_en, ''))), 0) * 0.8
             )::float AS score
      FROM services s
      LEFT JOIN requirements r ON r.service_id = s.id AND r.status = 'VERIFIED'
      WHERE s.publish_status = 'PUBLISHED'
      GROUP BY s.id
      HAVING GREATEST(
               word_similarity(${q}, coalesce(s.name_km, '')),
               word_similarity(${q}, coalesce(s.name_en, '')),
               CASE WHEN coalesce(s.name_km, '') ILIKE '%' || ${q} || '%' OR coalesce(s.name_en, '') ILIKE '%' || ${q} || '%' THEN 1 ELSE 0 END,
               coalesce(max(word_similarity(${q}, coalesce(r.text_km, r.text_en, ''))), 0) * 0.8
             ) >= 0.3
      ORDER BY score DESC
      LIMIT 10`;
    if (rows.length === 0) return [];

    const services = await this.prisma.service.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: SERVICE_SUMMARY });
    const byId = new Map(services.map((s) => [s.id, s]));
    return rows.map((r) => ({ ...byId.get(r.id)!, score: Math.round(r.score * 1000) / 1000, matchedBy: 'keyword' as const }));
  }

  async categories() {
    return this.prisma.category.findMany({ orderBy: [{ position: 'asc' }, { nameEn: 'asc' }], select: { id: true, slug: true, nameKm: true, nameEn: true } });
  }

  // ─── Admin ───────────────────────────────────────────────────────────────

  async listAdmin(q: AdminListServicesQuery) {
    return this.list({ ...this.filters(q), publishStatus: q.publishStatus }, q, [...PUBLIC_SORT, 'createdAt', 'updatedAt']);
  }

  async getAdmin(id: string) {
    const service = await this.prisma.service.findUnique({
      where: { id },
      include: {
        category: true,
        sources: { include: { source: true } },
        gaps: { include: { source: { select: { code: true, name: true } } } },
        _count: { select: { requirements: true, steps: true, fees: true, processingTimes: true, locations: true, feedback: true } },
      },
    });
    if (!service) throw new NotFoundError('Service');
    return service;
  }

  async create(dto: CreateServiceDto, actorId: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const service = await tx.service.create({ data: { ...dto, publishStatus: 'DRAFT' } });
      await this.audit.record({ actorId, action: 'service.create', entityType: 'SERVICE', entityId: service.id, meta }, tx);
      return service;
    });
  }

  async update(id: string, dto: UpdateServiceDto, actorId: string, meta: RequestMeta) {
    const before = await this.prisma.service.findUnique({ where: { id } });
    if (!before) throw new NotFoundError('Service');
    if (dto.publishStatus === 'PUBLISHED' && before.publishStatus !== 'PUBLISHED') {
      if (!(dto.nameKm ?? before.nameKm)) throw new BusinessRuleError('Add the Khmer name before publishing');
      await this.assertPublishable(id);
    }
    return this.prisma.$transaction(async (tx) => {
      const service = await tx.service.update({ where: { id }, data: dto });
      await this.audit.record(
        { actorId, action: 'service.update', entityType: 'SERVICE', entityId: id, metadata: { changes: Object.keys(dto) }, meta },
        tx,
      );
      return service;
    });
  }

  /** Soft delete: archived services disappear from public lists but keep their history. */
  async archive(id: string, actorId: string, meta: RequestMeta) {
    return this.update(id, { publishStatus: 'ARCHIVED' }, actorId, meta);
  }

  /** A service is only published once it has at least one verified requirement or step. */
  private async assertPublishable(serviceId: string) {
    const [requirements, steps] = await Promise.all([
      this.prisma.requirement.count({ where: { serviceId, ...VERIFIED } }),
      this.prisma.serviceStep.count({ where: { serviceId, ...VERIFIED } }),
    ]);
    if (requirements + steps === 0) {
      throw new BusinessRuleError('A service needs at least one verified requirement or step before it can be published');
    }
  }

  private filters(q: ListServicesQuery): Prisma.ServiceWhereInput {
    return {
      ...(q.category ? { category: { slug: q.category } } : {}),
      ...(q.q
        ? { OR: [{ nameKm: { contains: q.q, mode: 'insensitive' } }, { nameEn: { contains: q.q, mode: 'insensitive' } }, { slug: { contains: q.q.toLowerCase() } }] }
        : {}),
    };
  }

  private async list(where: Prisma.ServiceWhereInput, q: ListServicesQuery, sortable: readonly string[]) {
    const orderBy = parseSort(q.sort, sortable, { nameKm: 'asc' });
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.service.findMany({ where, orderBy, ...skipTake(q), select: { ...SERVICE_SUMMARY, publishStatus: true } }),
      this.prisma.service.count({ where }),
    ]);
    return paginate(rows, total, q);
  }

  private async publishedId(slug: string): Promise<string> {
    const service = await this.prisma.service.findFirst({ where: { slug, publishStatus: 'PUBLISHED' }, select: { id: true } });
    if (!service) throw new NotFoundError('Service');
    return service.id;
  }
}
