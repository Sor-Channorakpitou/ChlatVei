import { Type } from 'class-transformer';
import {
  IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, IsUUID, Max, MaxLength, Min,
} from 'class-validator';
import { LocationChannel, RequirementKind } from '@prisma/client';

/**
 * Every new piece of content must say where it came from (spec §8, ADR-003).
 * Approval additionally requires that source to be a VERIFIED T1/T2 source.
 */
class ProvenanceDto {
  @IsUUID()
  sourceId: string;

  @IsOptional()
  @IsUUID()
  sourceSnapshotId?: string;

  /** Verbatim quote from the source supporting this content. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  evidence: string;
}

/** On edits, provenance is optional: omitted fields keep the previous version's values. */
class OptionalProvenanceDto {
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @IsOptional()
  @IsUUID()
  sourceSnapshotId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  evidence?: string;
}

const Text = (max = 1000) => [IsString(), IsNotEmpty(), MaxLength(max)];
const apply = (...decorators: PropertyDecorator[]): PropertyDecorator => (target, key) =>
  decorators.forEach((d) => d(target, key));

// ─── Requirements ──────────────────────────────────────────────────────────

export class CreateRequirementDto extends ProvenanceDto {
  @IsIn(Object.values(RequirementKind)) kind: RequirementKind;
  @IsOptional() @apply(...Text()) textKm?: string;
  @IsOptional() @apply(...Text()) textEn?: string;
  @IsOptional() @apply(...Text(200)) appliesTo?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1000) position?: number;
}

export class UpdateRequirementDto extends OptionalProvenanceDto {
  @IsOptional() @IsIn(Object.values(RequirementKind)) kind?: RequirementKind;
  @IsOptional() @apply(...Text()) textKm?: string;
  @IsOptional() @apply(...Text()) textEn?: string;
  @IsOptional() @apply(...Text(200)) appliesTo?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1000) position?: number;
}

// ─── Steps ─────────────────────────────────────────────────────────────────

export class CreateStepDto extends ProvenanceDto {
  @IsInt() @Min(0) @Max(1000) position: number;
  @IsOptional() @apply(...Text(300)) titleKm?: string;
  @IsOptional() @apply(...Text(300)) titleEn?: string;
  @IsOptional() @apply(...Text(2000)) detailKm?: string;
  @IsOptional() @apply(...Text(2000)) detailEn?: string;
  @IsOptional() @apply(...Text(200)) appliesTo?: string;
}

export class UpdateStepDto extends OptionalProvenanceDto {
  @IsOptional() @IsInt() @Min(0) @Max(1000) position?: number;
  @IsOptional() @apply(...Text(300)) titleKm?: string;
  @IsOptional() @apply(...Text(300)) titleEn?: string;
  @IsOptional() @apply(...Text(2000)) detailKm?: string;
  @IsOptional() @apply(...Text(2000)) detailEn?: string;
  @IsOptional() @apply(...Text(200)) appliesTo?: string;
}

// ─── Fees ──────────────────────────────────────────────────────────────────

export class CreateFeeDto extends ProvenanceDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount: number;
  @IsIn(['KHR', 'USD']) currency: 'KHR' | 'USD';
  @IsOptional() @apply(...Text(300)) labelKm?: string;
  @IsOptional() @apply(...Text(300)) labelEn?: string;
  @IsOptional() @apply(...Text(200)) appliesTo?: string;
}

export class UpdateFeeDto extends OptionalProvenanceDto {
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount?: number;
  @IsOptional() @IsIn(['KHR', 'USD']) currency?: 'KHR' | 'USD';
  @IsOptional() @apply(...Text(300)) labelKm?: string;
  @IsOptional() @apply(...Text(300)) labelEn?: string;
  @IsOptional() @apply(...Text(200)) appliesTo?: string;
}

// ─── Processing times ──────────────────────────────────────────────────────

export class CreateProcessingTimeDto extends ProvenanceDto {
  @IsOptional() @IsInt() @Min(0) minDays?: number;
  @IsOptional() @IsInt() @Min(0) maxDays?: number;
  @IsOptional() @apply(...Text(300)) textKm?: string;
  @IsOptional() @apply(...Text(300)) textEn?: string;
  @IsOptional() @apply(...Text(200)) appliesTo?: string;
}

export class UpdateProcessingTimeDto extends OptionalProvenanceDto {
  @IsOptional() @IsInt() @Min(0) minDays?: number;
  @IsOptional() @IsInt() @Min(0) maxDays?: number;
  @IsOptional() @apply(...Text(300)) textKm?: string;
  @IsOptional() @apply(...Text(300)) textEn?: string;
  @IsOptional() @apply(...Text(200)) appliesTo?: string;
}

// ─── Locations ─────────────────────────────────────────────────────────────

export class CreateLocationDto extends ProvenanceDto {
  @IsOptional() @apply(...Text(300)) nameKm?: string;
  @IsOptional() @apply(...Text(300)) nameEn?: string;
  @IsOptional() @apply(...Text(500)) addressKm?: string;
  @IsOptional() @apply(...Text(500)) addressEn?: string;
  @IsOptional() @IsIn(Object.values(LocationChannel)) channel?: LocationChannel;
  @IsOptional() @IsUrl({ protocols: ['https', 'http'], require_protocol: true }) url?: string;
  @IsOptional() @apply(...Text(50)) phone?: string;
  @IsOptional() @apply(...Text(200)) hoursText?: string;
  @IsOptional() @apply(...Text(200)) appliesTo?: string;
}

export class UpdateLocationDto extends OptionalProvenanceDto {
  @IsOptional() @apply(...Text(300)) nameKm?: string;
  @IsOptional() @apply(...Text(300)) nameEn?: string;
  @IsOptional() @apply(...Text(500)) addressKm?: string;
  @IsOptional() @apply(...Text(500)) addressEn?: string;
  @IsOptional() @IsIn(Object.values(LocationChannel)) channel?: LocationChannel;
  @IsOptional() @IsUrl({ protocols: ['https', 'http'], require_protocol: true }) url?: string;
  @IsOptional() @apply(...Text(50)) phone?: string;
  @IsOptional() @apply(...Text(200)) hoursText?: string;
  @IsOptional() @apply(...Text(200)) appliesTo?: string;
}

// ─── Review actions ────────────────────────────────────────────────────────

export class ReviewCommentDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class RequiredCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  comment: string;
}
