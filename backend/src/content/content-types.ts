import { ContentOrigin, ContentStatus, EntityType, Prisma } from '@prisma/client';
import { NotFoundError } from '../common/errors/app-exceptions';
import {
  CreateFeeDto, CreateLocationDto, CreateProcessingTimeDto, CreateRequirementDto, CreateStepDto,
  UpdateFeeDto, UpdateLocationDto, UpdateProcessingTimeDto, UpdateRequirementDto, UpdateStepDto,
} from './content.dto';

/**
 * Registry of the five versioned content types (ADR-003).
 *
 * The versioning/review logic is identical for all of them, so it is written once
 * (ContentService, VerificationService) and this registry supplies what differs:
 * the Prisma model, DTO classes, and which columns hold the actual content.
 */
export const CONTENT_TYPES = ['requirements', 'steps', 'fees', 'processing-times', 'locations'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** The ContentMeta columns shared by every content row. */
export interface ContentRow {
  id: string;
  serviceId: string;
  status: ContentStatus;
  origin: ContentOrigin;
  supersedesId: string | null;
  sourceId: string | null;
  sourceSnapshotId: string | null;
  evidence: string | null;
  createdById: string | null;
  createdAt: Date;
  [field: string]: unknown;
}

/**
 * Minimal structural view of a Prisma model delegate. Prisma's generated delegates
 * have incompatible generic signatures, so the registry narrows them to this shape.
 */
export interface ContentDelegate {
  findUnique(args: { where: { id: string }; include?: object }): Promise<ContentRow | null>;
  findFirst(args: object): Promise<ContentRow | null>;
  findMany(args: object): Promise<ContentRow[]>;
  count(args: object): Promise<number>;
  create(args: { data: object }): Promise<ContentRow>;
  update(args: { where: { id: string }; data: object }): Promise<ContentRow>;
  updateMany(args: { where: object; data: object }): Promise<{ count: number }>;
}

export interface ContentTypeDef {
  entityType: EntityType;
  delegate(tx: Prisma.TransactionClient): ContentDelegate;
  createDto: new () => object;
  updateDto: new () => object;
  /** Columns holding the content itself (copied when superseding, compared in diffs). */
  fields: readonly string[];
  /** The main text column in each language. Khmer is required before approval (Khmer first). */
  textFields: { km: string; en: string };
  /** Short human label for review queues, change records and checklist items. */
  label(row: ContentRow): { km: string | null; en: string | null };
  orderBy: object[];
}

const asDelegate = (d: unknown) => d as ContentDelegate;

export const CONTENT_REGISTRY: Record<ContentType, ContentTypeDef> = {
  requirements: {
    entityType: 'REQUIREMENT',
    delegate: (tx) => asDelegate(tx.requirement),
    createDto: CreateRequirementDto,
    updateDto: UpdateRequirementDto,
    fields: ['kind', 'textKm', 'textEn', 'appliesTo', 'position'],
    textFields: { km: 'textKm', en: 'textEn' },
    label: (r) => ({ km: (r.textKm as string) ?? null, en: (r.textEn as string) ?? null }),
    orderBy: [{ kind: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
  },
  steps: {
    entityType: 'STEP',
    delegate: (tx) => asDelegate(tx.serviceStep),
    createDto: CreateStepDto,
    updateDto: UpdateStepDto,
    fields: ['position', 'titleKm', 'titleEn', 'detailKm', 'detailEn', 'appliesTo'],
    textFields: { km: 'titleKm', en: 'titleEn' },
    label: (r) => ({ km: (r.titleKm as string) ?? null, en: (r.titleEn as string) ?? null }),
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  },
  fees: {
    entityType: 'FEE',
    delegate: (tx) => asDelegate(tx.fee),
    createDto: CreateFeeDto,
    updateDto: UpdateFeeDto,
    fields: ['amount', 'currency', 'labelKm', 'labelEn', 'appliesTo'],
    textFields: { km: 'labelKm', en: 'labelEn' },
    label: (r) => ({
      km: r.labelKm ? `${r.labelKm}: ${r.amount} ${r.currency}` : null,
      en: r.labelEn ? `${r.labelEn}: ${r.amount} ${r.currency}` : null,
    }),
    orderBy: [{ amount: 'asc' }, { createdAt: 'asc' }],
  },
  'processing-times': {
    entityType: 'PROCESSING_TIME',
    delegate: (tx) => asDelegate(tx.processingTime),
    createDto: CreateProcessingTimeDto,
    updateDto: UpdateProcessingTimeDto,
    fields: ['minDays', 'maxDays', 'textKm', 'textEn', 'appliesTo'],
    textFields: { km: 'textKm', en: 'textEn' },
    label: (r) => ({ km: (r.textKm as string) ?? null, en: (r.textEn as string) ?? null }),
    orderBy: [{ createdAt: 'asc' }],
  },
  locations: {
    entityType: 'LOCATION',
    delegate: (tx) => asDelegate(tx.serviceLocation),
    createDto: CreateLocationDto,
    updateDto: UpdateLocationDto,
    fields: ['nameKm', 'nameEn', 'addressKm', 'addressEn', 'channel', 'url', 'phone', 'hoursText', 'appliesTo'],
    textFields: { km: 'nameKm', en: 'nameEn' },
    label: (r) => ({ km: (r.nameKm as string) ?? null, en: (r.nameEn as string) ?? null }),
    orderBy: [{ channel: 'asc' }, { createdAt: 'asc' }],
  },
};

export function contentType(value: string): ContentTypeDef {
  if (!(CONTENT_TYPES as readonly string[]).includes(value)) {
    throw new NotFoundError(`Content type "${value}"`);
  }
  return CONTENT_REGISTRY[value as ContentType];
}

/** Content field values, normalized for comparison and JSON (Decimal → string). */
export function contentValues(def: ContentTypeDef, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    const v = row[f];
    out[f] = v instanceof Prisma.Decimal ? v.toString() : (v ?? null);
  }
  return out;
}
