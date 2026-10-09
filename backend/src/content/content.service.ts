import { Injectable } from '@nestjs/common';
import { GapField } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../common/auth.decorators';
import { BusinessRuleError, ConflictError, NotFoundError } from '../common/errors/app-exceptions';
import { validateBody } from '../common/validate';
import { PrismaService } from '../prisma/prisma.service';
import { ContentRow, ContentTypeDef, contentType, contentValues } from './content-types';

/**
 * Creating and editing content (ADR-003).
 *
 * - New content always starts as PENDING; it is never public until approved.
 * - Editing a PENDING/UNDER_REVIEW row changes it in place.
 * - Editing a VERIFIED row never touches it: a new PENDING row is created with
 *   `supersedesId` pointing at it. Approval later swaps them (VerificationService).
 * - REJECTED and OUTDATED rows are history and cannot be edited.
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(type: string, serviceId: string, body: unknown, actorId: string, meta: RequestMeta) {
    const def = contentType(type);
    const dto = (await validateBody(def.createDto, body)) as Record<string, unknown>;

    const service = await this.prisma.service.findUnique({ where: { id: serviceId }, select: { id: true } });
    if (!service) throw new NotFoundError('Service');
    await this.assertProvenance(dto.sourceId as string, dto.sourceSnapshotId as string | undefined);
    this.assertDayRange(dto);
    if (!dto[def.textFields.km] && !dto[def.textFields.en]) {
      throw new BusinessRuleError(`Provide ${def.textFields.km} (preferred) or ${def.textFields.en}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await def.delegate(tx).create({
        data: { ...dto, serviceId, status: 'PENDING', origin: 'MANUAL', createdById: actorId },
      });
      await this.audit.record(
        { actorId, action: 'content.create', entityType: def.entityType, entityId: row.id, metadata: { serviceId }, meta },
        tx,
      );
      return row;
    });
  }

  async update(type: string, id: string, body: unknown, actorId: string, meta: RequestMeta) {
    const def = contentType(type);
    const dto = (await validateBody(def.updateDto, body)) as Record<string, unknown>;
    if (Object.keys(dto).length === 0) throw new BusinessRuleError('Nothing to update');

    const current = await def.delegate(this.prisma).findUnique({ where: { id } });
    if (!current) throw new NotFoundError('Content');
    if (dto.sourceId) await this.assertProvenance(dto.sourceId as string, dto.sourceSnapshotId as string | undefined);
    this.assertDayRange({ ...current, ...dto });

    switch (current.status) {
      case 'PENDING':
      case 'UNDER_REVIEW':
        return this.prisma.$transaction(async (tx) => {
          const row = await def.delegate(tx).update({ where: { id }, data: dto });
          await this.audit.record(
            { actorId, action: 'content.edit_pending', entityType: def.entityType, entityId: id, meta },
            tx,
          );
          return row;
        });
      case 'VERIFIED':
        return this.proposeReplacement(def, current, dto, actorId, meta);
      default:
        throw new ConflictError(`${current.status} content is history and cannot be edited`);
    }
  }

  async get(type: string, id: string) {
    const def = contentType(type);
    const row = await def.delegate(this.prisma).findUnique({ where: { id } });
    if (!row) throw new NotFoundError('Content');
    return row;
  }

  async listForService(type: string, serviceId: string) {
    const def = contentType(type);
    return def.delegate(this.prisma).findMany({ where: { serviceId }, orderBy: def.orderBy });
  }

  /** Records "source checked; it does not state this field" (unknown ≠ none). */
  async addGap(
    serviceId: string,
    input: { field: GapField; sourceId: string; appliesTo?: string },
    actorId: string,
    meta: RequestMeta,
  ) {
    await this.assertProvenance(input.sourceId);
    return this.prisma.$transaction(async (tx) => {
      const gap = await tx.fieldGap.upsert({
        where: {
          serviceId_field_appliesTo_sourceId: {
            serviceId, field: input.field, appliesTo: input.appliesTo ?? '', sourceId: input.sourceId,
          },
        },
        create: { serviceId, field: input.field, appliesTo: input.appliesTo ?? '', sourceId: input.sourceId, checkedById: actorId },
        update: { checkedAt: new Date(), checkedById: actorId },
      });
      await this.audit.record({ actorId, action: 'gap.record', entityType: 'FIELD_GAP', entityId: gap.id, meta }, tx);
      return gap;
    });
  }

  private async proposeReplacement(
    def: ContentTypeDef,
    current: ContentRow,
    changes: Record<string, unknown>,
    actorId: string,
    meta: RequestMeta,
  ) {
    const openProposal = await def.delegate(this.prisma).findFirst({
      where: { supersedesId: current.id, status: { in: ['PENDING', 'UNDER_REVIEW'] } },
    });
    if (openProposal) {
      throw new ConflictError(`A pending change to this item already exists (${openProposal.id}); edit that one instead`);
    }

    const data = {
      ...contentValues(def, current),
      serviceId: current.serviceId,
      sourceId: current.sourceId,
      sourceSnapshotId: current.sourceSnapshotId,
      evidence: current.evidence,
      ...changes,
      supersedesId: current.id,
      status: 'PENDING',
      origin: 'MANUAL',
      createdById: actorId,
    };

    return this.prisma.$transaction(async (tx) => {
      const row = await def.delegate(tx).create({ data });
      await this.audit.record(
        { actorId, action: 'content.propose_change', entityType: def.entityType, entityId: row.id, metadata: { supersedes: current.id }, meta },
        tx,
      );
      return row;
    });
  }

  private async assertProvenance(sourceId: string, sourceSnapshotId?: string): Promise<void> {
    const source = await this.prisma.source.findUnique({ where: { id: sourceId }, select: { id: true } });
    if (!source) throw new BusinessRuleError('Source does not exist');
    if (sourceSnapshotId) {
      const snapshot = await this.prisma.sourceSnapshot.findUnique({ where: { id: sourceSnapshotId } });
      if (!snapshot || snapshot.sourceId !== sourceId) {
        throw new BusinessRuleError('Snapshot does not belong to the given source');
      }
    }
  }

  private assertDayRange(values: Record<string, unknown>): void {
    const min = values.minDays as number | null | undefined;
    const max = values.maxDays as number | null | undefined;
    if (min != null && max != null && min > max) throw new BusinessRuleError('minDays cannot be greater than maxDays');
  }
}

