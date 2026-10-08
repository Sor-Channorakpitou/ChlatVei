import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser, Public, ReqMeta, RequestMeta, Roles } from '../common/auth.decorators';
import {
  AdminListServicesQuery, CreateServiceDto, ListServicesQuery, RequirementsQuery, SearchQuery, UpdateServiceDto,
} from './services.dto';
import { ServicesService } from './services.service';

/** Citizen-facing catalogue. Returns published services and VERIFIED content only. */
@Public()
@Controller()
export class PublicServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get('categories')
  async categories() {
    return { data: await this.services.categories() };
  }

  @Get('services')
  list(@Query() q: ListServicesQuery) {
    return this.services.listPublic(q);
  }

  @Get('services/:slug')
  async get(@Param('slug') slug: string) {
    return { data: await this.services.getPublic(slug) };
  }

  @Get('services/:slug/requirements')
  async requirements(@Param('slug') slug: string, @Query() q: RequirementsQuery) {
    return { data: await this.services.requirements(slug, q.kind) };
  }

  @Get('services/:slug/steps')
  async steps(@Param('slug') slug: string) {
    return { data: await this.services.steps(slug) };
  }

  @Get('services/:slug/changes')
  async changes(@Param('slug') slug: string) {
    return { data: await this.services.changes(slug) };
  }

  @Get('search')
  async search(@Query() q: SearchQuery) {
    return { data: await this.services.search(q.q) };
  }
}

@Roles('ADMIN')
@Controller('admin/services')
export class AdminServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  list(@Query() q: AdminListServicesQuery) {
    return this.services.listAdmin(q);
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.services.getAdmin(id) };
  }

  @Post()
  async create(@Body() dto: CreateServiceDto, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    return { data: await this.services.create(dto, user.id, meta) };
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateServiceDto, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    return { data: await this.services.update(id, dto, user.id, meta) };
  }

  @Delete(':id')
  async archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    return { data: await this.services.archive(id, user.id, meta) };
  }
}
