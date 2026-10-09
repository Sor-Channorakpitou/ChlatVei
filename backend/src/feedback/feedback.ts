import { Body, Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { FeedbackKind, FeedbackOutcome, FeedbackStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, OptionalAuth, ReqMeta, RequestMeta, Roles } from '../common/auth.decorators';
import { BusinessRuleError, NotFoundError } from '../common/errors/app-exceptions';
import { paginate, PaginationQuery, parseSort, skipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

// ─── DTOs ──────────────────────────────────────────────────────────────────

/** Spec §15. Deliberately has no fields for names, phone numbers or ID numbers. */
class CreateFeedbackDto {
  @IsString() @MaxLength(80) serviceSlug: string;
  @IsIn(Object.values(FeedbackKind)) kind: FeedbackKind;
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) difficulty?: number;
  @IsOptional() @IsBoolean() foundNeeded?: boolean;
  @IsOptional() @IsIn(Object.values(FeedbackOutcome)) outcome?: FeedbackOutcome;
  @IsOptional() @IsUUID() confusingStepId?: string;
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsString() @MaxLength(1000) comment?: string;
}

class ListFeedbackQuery extends PaginationQuery {
  @IsOptional() @IsString() service?: string;
  @IsOptional() @IsIn(Object.values(FeedbackKind)) kind?: FeedbackKind;
  @IsOptional() @IsIn(Object.values(FeedbackStatus)) status?: FeedbackStatus;
  @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @IsOptional() @Type(() => Date) @IsDate() to?: Date;
}

class UpdateFeedbackDto {
  @IsIn(Object.values(FeedbackStatus)) status: FeedbackStatus;
}

// ─── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateFeedbackDto, userId: string | undefined) {
    const service = await this.prisma.service.findFirst({ where: { slug: dto.serviceSlug, publishStatus: 'PUBLISHED' }, select: { id: true } });
    if (!service) throw new NotFoundError('Service');

    if (dto.kind === 'RATING' && dto.rating === undefined && dto.difficulty === undefined) {
      throw new BusinessRuleError('A rating needs at least a rating or a difficulty score');
    }
    if ((dto.kind === 'REPORT_UNCLEAR' || dto.kind === 'REPORT_OUTDATED') && !dto.comment && !dto.confusingStepId) {
      throw new BusinessRuleError('Please say what is unclear or outdated');
    }
    if (dto.confusingStepId) {
      const step = await this.prisma.serviceStep.findFirst({ where: { id: dto.confusingStepId, serviceId: service.id, status: 'VERIFIED' } });
      if (!step) throw new BusinessRuleError('That step does not belong to this service');
    }

    const { serviceSlug: _slug, ...data } = dto;
    const created = await this.prisma.feedback.create({ data: { ...data, serviceId: service.id, userId } });
    return { id: created.id, createdAt: created.createdAt };
  }

  async list(q: ListFeedbackQuery) {
    const where: Prisma.FeedbackWhereInput = {
      kind: q.kind,
      status: q.status,
      ...(q.service ? { service: { slug: q.service } } : {}),
      ...(q.from || q.to ? { createdAt: { gte: q.from, lte: q.to } } : {}),
    };
    const orderBy = parseSort(q.sort, ['createdAt', 'rating', 'difficulty'], { createdAt: 'desc' });
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.feedback.findMany({
        where, orderBy, ...skipTake(q),
        // userId is not exposed: admins see feedback, not who gave it.
        select: {
          id: true, kind: true, rating: true, difficulty: true, foundNeeded: true, outcome: true, comment: true, status: true, createdAt: true,
          service: { select: { slug: true, nameKm: true, nameEn: true } },
          confusingStep: { select: { id: true, position: true, titleKm: true, titleEn: true } },
        },
      }),
      this.prisma.feedback.count({ where }),
    ]);
    return paginate(rows, total, q);
  }

  async updateStatus(id: string, status: FeedbackStatus, actorId: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.feedback.update({ where: { id }, data: { status }, select: { id: true, status: true } });
      await this.audit.record({ actorId, action: 'feedback.status', entityType: 'FEEDBACK', entityId: id, metadata: { status }, meta }, tx);
      return updated;
    });
  }
}

// ─── Controller ────────────────────────────────────────────────────────────

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  /** Anyone may give feedback; signed-in users are linked. Rate-limited per IP. */
  @OptionalAuth()
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  @Post()
  async create(@Body() dto: CreateFeedbackDto, @CurrentUser() user?: AuthUser) {
    return { data: await this.feedback.create(dto, user?.id) };
  }

  @Roles('ADMIN')
  @Get()
  list(@Query() q: ListFeedbackQuery) {
    return this.feedback.list(q);
  }

  @Roles('ADMIN')
  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFeedbackDto, @CurrentUser() u: AuthUser, @ReqMeta() meta: RequestMeta) {
    return { data: await this.feedback.updateStatus(id, dto.status, u.id, meta) };
  }
}

@Module({ controllers: [FeedbackController], providers: [FeedbackService] })
export class FeedbackModule {}
