import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/auth.decorators';
import { BusinessRuleError, ConflictError, NotFoundError } from '../common/errors/app-exceptions';
import { PrismaService } from '../prisma/prisma.service';

class CreateChecklistDto {
  @IsString() @MaxLength(80) serviceSlug: string;
}

class UpdateItemDto {
  @IsBoolean() isDone: boolean;
}

const ITEM_SELECT = {
  id: true, labelKm: true, labelEn: true, position: true, isDone: true, doneAt: true,
  requirementId: true, stepId: true,
  requirement: { select: { status: true } },
  step: { select: { status: true } },
} as const;

/**
 * Personal checklists (spec §6 steps 11–12). Items are copied from the service's
 * VERIFIED documents and steps at creation time. If that content is later changed
 * or withdrawn, the item is flagged `contentChanged` instead of silently altered.
 */
@Injectable()
export class ChecklistsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const lists = await this.prisma.checklist.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        service: { select: { slug: true, nameKm: true, nameEn: true } },
        items: { select: { isDone: true } },
      },
    });
    return lists.map(({ items, ...c }) => ({ ...c, progress: { done: items.filter((i) => i.isDone).length, total: items.length } }));
  }

  async get(userId: string, id: string) {
    // Ownership is part of the query: another user's checklist is simply "not found".
    const checklist = await this.prisma.checklist.findFirst({
      where: { id, userId },
      include: {
        service: { select: { slug: true, nameKm: true, nameEn: true } },
        items: { orderBy: { position: 'asc' }, select: ITEM_SELECT },
      },
    });
    if (!checklist) throw new NotFoundError('Checklist');

    const items = checklist.items.map(({ requirement, step, ...item }) => ({
      ...item,
      kind: item.requirementId ? 'DOCUMENT' : 'STEP',
      contentChanged: (requirement ?? step)?.status !== 'VERIFIED',
    }));
    return { ...checklist, items, progress: { done: items.filter((i) => i.isDone).length, total: items.length } };
  }

  async create(userId: string, serviceSlug: string) {
    const service = await this.prisma.service.findFirst({
      where: { slug: serviceSlug, publishStatus: 'PUBLISHED' },
      select: {
        id: true,
        requirements: { where: { status: 'VERIFIED', kind: 'DOCUMENT' }, orderBy: { position: 'asc' }, select: { id: true, textKm: true, textEn: true } },
        steps: { where: { status: 'VERIFIED' }, orderBy: { position: 'asc' }, select: { id: true, titleKm: true, titleEn: true } },
      },
    });
    if (!service) throw new NotFoundError('Service');

    const existing = await this.prisma.checklist.findUnique({ where: { userId_serviceId: { userId, serviceId: service.id } } });
    if (existing) throw new ConflictError(`You already have a checklist for this service (${existing.id})`);

    // Documents to gather first, then the steps to follow.
    const items = [
      ...service.requirements.map((r) => ({ requirementId: r.id, labelKm: r.textKm!, labelEn: r.textEn })),
      ...service.steps.map((s) => ({ stepId: s.id, labelKm: s.titleKm!, labelEn: s.titleEn })),
    ].map((item, position) => ({ ...item, position }));
    if (items.length === 0) throw new BusinessRuleError('This service has no verified documents or steps yet');

    const checklist = await this.prisma.checklist.create({
      data: { userId, serviceId: service.id, items: { create: items } },
    });
    return this.get(userId, checklist.id);
  }

  async setItem(userId: string, checklistId: string, itemId: string, isDone: boolean) {
    const item = await this.prisma.checklistItem.findFirst({ where: { id: itemId, checklistId, checklist: { userId } } });
    if (!item) throw new NotFoundError('Checklist item');

    await this.prisma.$transaction(async (tx) => {
      await tx.checklistItem.update({ where: { id: itemId }, data: { isDone, doneAt: isDone ? new Date() : null } });
      const remaining = await tx.checklistItem.count({ where: { checklistId, isDone: false } });
      await tx.checklist.update({ where: { id: checklistId }, data: { completedAt: remaining === 0 ? new Date() : null } });
    });
    return this.get(userId, checklistId);
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.checklist.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundError('Checklist');
  }
}

@Controller('checklists')
export class ChecklistsController {
  constructor(private readonly checklists: ChecklistsService) {}

  @Get()
  async list(@CurrentUser() u: AuthUser) {
    return { data: await this.checklists.list(u.id) };
  }

  @Post()
  async create(@CurrentUser() u: AuthUser, @Body() dto: CreateChecklistDto) {
    return { data: await this.checklists.create(u.id, dto.serviceSlug) };
  }

  @Get(':id')
  async get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.checklists.get(u.id, id) };
  }

  @Patch(':id/items/:itemId')
  async setItem(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateItemDto,
  ) {
    return { data: await this.checklists.setItem(u.id, id, itemId, dto.isDone) };
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.checklists.remove(u.id, id);
  }
}

@Module({ controllers: [ChecklistsController], providers: [ChecklistsService] })
export class ChecklistsModule {}
