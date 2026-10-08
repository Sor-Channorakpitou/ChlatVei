import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ContentOrigin, GapField } from '@prisma/client';
import { AuthUser, CurrentUser, ReqMeta, RequestMeta, Roles } from '../common/auth.decorators';
import { PaginationQuery } from '../common/pagination';
import { RequiredCommentDto, ReviewCommentDto } from '../content/content.dto';
import { ContentService } from '../content/content.service';
import { VerificationService } from './verification.service';

class ReviewQueueQuery extends PaginationQuery {
  @IsOptional() @IsString() service?: string;
  @IsOptional() @IsIn(Object.values(ContentOrigin)) origin?: ContentOrigin;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1) minConfidence?: number;
}

class CreateGapDto {
  @IsIn(Object.values(GapField)) field: GapField;
  @IsUUID() sourceId: string;
  @IsOptional() @IsString() appliesTo?: string;
}

/**
 * Admin endpoints for service content and its review. `:type` is one of
 * requirements | steps | fees | processing-times | locations.
 */
@Roles('ADMIN')
@Controller('admin')
export class AdminContentController {
  constructor(
    private readonly content: ContentService,
    private readonly verification: VerificationService,
  ) {}

  // ─── Content authoring ───────────────────────────────────────────────────

  @Get('services/:serviceId/:type')
  async list(@Param('serviceId', ParseUUIDPipe) serviceId: string, @Param('type') type: string) {
    return { data: await this.content.listForService(type, serviceId) };
  }

  @Post('services/:serviceId/gaps')
  async addGap(
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Body() dto: CreateGapDto,
    @CurrentUser() user: AuthUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return { data: await this.content.addGap(serviceId, dto, user.id, meta) };
  }

  @Post('services/:serviceId/:type')
  async create(
    @Param('serviceId', ParseUUIDPipe) serviceId: string,
    @Param('type') type: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return { data: await this.content.create(type, serviceId, body, user.id, meta) };
  }

  @Get('content/:type/:id')
  async get(@Param('type') type: string, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.content.get(type, id) };
  }

  /** On VERIFIED content this creates a new PENDING version instead of editing. */
  @Patch('content/:type/:id')
  async update(
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return { data: await this.content.update(type, id, body, user.id, meta) };
  }

  @HttpCode(200)
  @Post('content/:type/:id/mark-outdated')
  async markOutdated(
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequiredCommentDto,
    @CurrentUser() user: AuthUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return { data: await this.verification.markOutdated(type, id, user.id, dto.comment, meta) };
  }

  // ─── Review ──────────────────────────────────────────────────────────────

  @Get('review')
  queue(@Query() q: ReviewQueueQuery) {
    return this.verification.queue(q);
  }

  @HttpCode(200)
  @Post('review/:type/:id/start')
  async start(@Param('type') type: string, @Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    return { data: await this.verification.startReview(type, id, user.id, meta) };
  }

  @HttpCode(200)
  @Post('review/:type/:id/approve')
  async approve(
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewCommentDto,
    @CurrentUser() user: AuthUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return { data: await this.verification.approve(type, id, user.id, dto.comment, meta) };
  }

  @HttpCode(200)
  @Post('review/:type/:id/reject')
  async reject(
    @Param('type') type: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequiredCommentDto,
    @CurrentUser() user: AuthUser,
    @ReqMeta() meta: RequestMeta,
  ) {
    return { data: await this.verification.reject(type, id, user.id, dto.comment, meta) };
  }
}
