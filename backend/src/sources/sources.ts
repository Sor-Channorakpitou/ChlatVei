import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, MaxLength, Min } from 'class-validator';
import { ContentStatus, Language, Prisma, SourceRelevance, SourceTier, SourceType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, ReqMeta, RequestMeta, Roles } from '../common/auth.decorators';
import { ConflictError, NotFoundError } from '../common/errors/app-exceptions';
import { paginate, PaginationQuery, parseSort, skipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

// ─── DTOs ──────────────────────────────────────────────────────────────────

class ListSourcesQuery extends PaginationQuery {
  @IsOptional() @IsIn(Object.values(ContentStatus)) status?: ContentStatus;
  @IsOptional() @IsIn(Object.values(SourceTier)) tier?: SourceTier;
  /** service slug */
  @IsOptional() @IsString() service?: string;
}

class CreateSourceDto {
  @Matches(/^S\d{3,}$/, { message: 'code must look like S001' }) code: string;
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true }) url: string;
  @IsString() @IsNotEmpty() @MaxLength(300) name: string;
  @IsString() @IsNotEmpty() @MaxLength(300) publisher: string;
  @IsIn(Object.values(SourceType)) sourceType: SourceType;
  @IsIn(Object.values(SourceTier)) tier: SourceTier;
  @IsIn(Object.values(Language)) language: Language;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

class UpdateSourceDto {
  @IsOptional() @IsUrl({ protocols: ['https', 'http'], require_protocol: true }) url?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(300) name?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(300) publisher?: string;
  @IsOptional() @IsIn(Object.values(SourceType)) sourceType?: SourceType;
  @IsOptional() @IsIn(Object.values(SourceTier)) tier?: SourceTier;
  @IsOptional() @IsIn(Object.values(Language)) language?: Language;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

class SourceDecisionDto {
  @IsIn(['VERIFIED', 'REJECTED', 'OUTDATED']) status: 'VERIFIED' | 'REJECTED' | 'OUTDATED';
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

class CreateSnapshotDto {
  @Type(() => Date) @IsDate() collectedAt: Date;
  @Matches(/^[a-f0-9]{64}$/) sha256: string;
  @IsString() @IsNotEmpty() @MaxLength(500) storagePath: string;
  @IsOptional() @IsString() @MaxLength(200) contentType?: string;
  @IsOptional() @IsInt() @Min(0) bytes?: number;
}

class LinkSourceDto {
  @IsIn(Object.values(SourceRelevance)) relevance: SourceRelevance;
}

// ─── Service ───────────────────────────────────────────────────────────────

const ACTION_FOR_STATUS = { VERIFIED: 'APPROVE', REJECTED: 'REJECT', OUTDATED: 'MARK_OUTDATED' } as const;

@Injectable()
export class SourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: ListSourcesQuery) {
    const where: Prisma.SourceWhereInput = {
      status: q.status,
      tier: q.tier,
      ...(q.service ? { services: { some: { service: { slug: q.service } } } } : {}),
    };
    const orderBy = parseSort(q.sort, ['code', 'name', 'lastCheckedAt', 'createdAt'], { code: 'asc' });
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.source.findMany({ where, orderBy, ...skipTake(q), include: { _count: { select: { snapshots: true, services: true } } } }),
      this.prisma.source.count({ where }),
    ]);
    return paginate(rows, total, q);
  }

  async get(id: string) {
    const source = await this.prisma.source.findUnique({
      where: { id },
      include: {
        snapshots: { orderBy: { collectedAt: 'desc' } },
        services: { include: { service: { select: { id: true, slug: true, nameKm: true, nameEn: true } } } },
      },
    });
    if (!source) throw new NotFoundError('Source');
    return source;
  }

  async create(dto: CreateSourceDto, actorId: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.source.create({ data: { ...dto, status: 'PENDING' } });
      await this.audit.record({ actorId, action: 'source.create', entityType: 'SOURCE', entityId: source.id, meta }, tx);
      return source;
    });
  }

  /** Changing what a source points at (URL or tier) sends it back for verification. */
  async update(id: string, dto: UpdateSourceDto, actorId: string, meta: RequestMeta) {
    const before = await this.prisma.source.findUnique({ where: { id } });
    if (!before) throw new NotFoundError('Source');
    const identityChanged = (dto.url && dto.url !== before.url) || (dto.tier && dto.tier !== before.tier);
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.source.update({ where: { id }, data: { ...dto, ...(identityChanged ? { status: 'PENDING' } : {}) } });
      await this.audit.record(
        { actorId, action: 'source.update', entityType: 'SOURCE', entityId: id, metadata: { changes: Object.keys(dto), resetToPending: !!identityChanged }, meta },
        tx,
      );
      return source;
    });
  }

  async decide(id: string, dto: SourceDecisionDto, actorId: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.source.findUnique({ where: { id } });
      if (!source) throw new NotFoundError('Source');
      const updated = await tx.source.update({
        where: { id },
        data: { status: dto.status, ...(dto.status === 'VERIFIED' ? { lastCheckedAt: new Date() } : {}) },
      });
      await tx.verification.create({
        data: { entityType: 'SOURCE', entityId: id, action: ACTION_FOR_STATUS[dto.status], reviewerId: actorId, comment: dto.comment },
      });
      await this.audit.record(
        { actorId, action: `source.${dto.status.toLowerCase()}`, entityType: 'SOURCE', entityId: id, metadata: { from: source.status }, meta },
        tx,
      );
      return updated;
    });
  }

  /**
   * Registers a snapshot. New content for a source that already has a snapshot is a change (spec §24):
   * the source goes back to PENDING so an admin re-checks it. Published content is never changed here.
   */
  async addSnapshot(sourceId: string, dto: CreateSnapshotDto, actorId: string, meta: RequestMeta) {
    const source = await this.prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) throw new NotFoundError('Source');
    const existing = await this.prisma.sourceSnapshot.findUnique({ where: { sourceId_sha256: { sourceId, sha256: dto.sha256 } } });
    if (existing) throw new ConflictError('A snapshot with identical content is already registered');
    const previous = await this.prisma.sourceSnapshot.findFirst({ where: { sourceId }, orderBy: { collectedAt: 'desc' } });
    const changed = !!previous;
    return this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.sourceSnapshot.create({ data: { ...dto, sourceId } });
      await tx.source.update({ where: { id: sourceId }, data: { lastCheckedAt: dto.collectedAt, ...(changed ? { status: 'PENDING' } : {}) } });
      await this.audit.record({ actorId, action: 'source.snapshot', entityType: 'SOURCE', entityId: sourceId, meta }, tx);
      if (changed) {
        await this.audit.record(
          { actorId, action: 'source.changed', entityType: 'SOURCE', entityId: sourceId, metadata: { from: source.status, previousSha256: previous.sha256, sha256: dto.sha256 }, meta },
          tx,
        );
      }
      return { ...snapshot, changed };
    });
  }

  async link(serviceId: string, sourceId: string, relevance: SourceRelevance, actorId: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const link = await tx.serviceSource.upsert({
        where: { serviceId_sourceId: { serviceId, sourceId } },
        create: { serviceId, sourceId, relevance },
        update: { relevance },
      });
      await this.audit.record({ actorId, action: 'source.link', entityType: 'SERVICE', entityId: serviceId, metadata: { sourceId, relevance }, meta }, tx);
      return link;
    });
  }

  async unlink(serviceId: string, sourceId: string, actorId: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.serviceSource.deleteMany({ where: { serviceId, sourceId } });
      if (count === 0) throw new NotFoundError('Link');
      await this.audit.record({ actorId, action: 'source.unlink', entityType: 'SERVICE', entityId: serviceId, metadata: { sourceId }, meta }, tx);
    });
  }
}

// ─── Controller ────────────────────────────────────────────────────────────

@Roles('ADMIN')
@Controller()
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Get('sources')
  list(@Query() q: ListSourcesQuery) {
    return this.sources.list(q);
  }

  @Get('sources/:id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.sources.get(id) };
  }

  @Post('sources')
  async create(@Body() dto: CreateSourceDto, @CurrentUser() u: AuthUser, @ReqMeta() meta: RequestMeta) {
    return { data: await this.sources.create(dto, u.id, meta) };
  }

  @Patch('sources/:id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSourceDto, @CurrentUser() u: AuthUser, @ReqMeta() meta: RequestMeta) {
    return { data: await this.sources.update(id, dto, u.id, meta) };
  }

  /** Verify, reject, or mark a source outdated. Content can only be approved against VERIFIED T1/T2 sources. */
  @HttpCode(200)
  @Post('sources/:id/decision')
  async decide(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SourceDecisionDto, @CurrentUser() u: AuthUser, @ReqMeta() meta: RequestMeta) {
    return { data: await this.sources.decide(id, dto, u.id, meta) };
  }

  @Post('sources/:id/snapshots')
  async addSnapshot(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateSnapshotDto, @CurrentUser() u: AuthUser, @ReqMeta() meta: RequestMeta) {
    return { data: await this.sources.addSnapshot(id, dto, u.id, meta) };
  }

  @Put('admin/services/:serviceId/sources/:sourceId')
  async link(
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Param('sourceId', ParseUUIDPipe) sourceId: string,
    @Body() dto: LinkSourceDto,
    @CurrentUser() u: AuthUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return { data: await this.sources.link(serviceId, sourceId, dto.relevance, u.id, meta) };
  }

  @HttpCode(204)
  @Delete('admin/services/:serviceId/sources/:sourceId')
  async unlink(
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Param('sourceId', ParseUUIDPipe) sourceId: string,
    @CurrentUser() u: AuthUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.sources.unlink(serviceId, sourceId, u.id, meta);
  }
}

@Module({ controllers: [SourcesController], providers: [SourcesService] })
export class SourcesModule {}
