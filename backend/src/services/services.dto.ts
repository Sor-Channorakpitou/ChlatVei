import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { GovernmentLevel, PublishStatus, RequirementKind } from '@prisma/client';
import { PaginationQuery } from '../common/pagination';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ListServicesQuery extends PaginationQuery {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) q?: string;
  /** Category slug */
  @IsOptional() @IsString() category?: string;
}

export class AdminListServicesQuery extends ListServicesQuery {
  @IsOptional() @IsIn(Object.values(PublishStatus)) publishStatus?: PublishStatus;
}

export class SearchQuery {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) q: string;
}

export class RequirementsQuery {
  @IsOptional() @IsIn(Object.values(RequirementKind)) kind?: RequirementKind;
}

export class CreateServiceDto {
  @Matches(/^[a-z0-9_]{3,80}$/, { message: 'slug must be 3-80 characters of a-z, 0-9 or _' })
  slug: string;

  @IsUUID() categoryId: string;
  /** Required before publishing; optional for drafts. */
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) nameKm?: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) nameEn: string;
  @IsOptional() @IsString() @MaxLength(2000) summaryKm?: string;
  @IsOptional() @IsString() @MaxLength(2000) summaryEn?: string;
  @IsOptional() @IsString() @MaxLength(300) responsibleBodyKm?: string;
  @IsOptional() @IsString() @MaxLength(300) responsibleBodyEn?: string;
  @IsOptional() @IsIn(Object.values(GovernmentLevel)) governmentLevel?: GovernmentLevel;
}

export class UpdateServiceDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) nameKm?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) nameEn?: string;
  @IsOptional() @IsString() @MaxLength(2000) summaryKm?: string;
  @IsOptional() @IsString() @MaxLength(2000) summaryEn?: string;
  @IsOptional() @IsString() @MaxLength(300) responsibleBodyKm?: string;
  @IsOptional() @IsString() @MaxLength(300) responsibleBodyEn?: string;
  @IsOptional() @IsIn(Object.values(GovernmentLevel)) governmentLevel?: GovernmentLevel;
  @IsOptional() @IsIn(Object.values(PublishStatus)) publishStatus?: PublishStatus;
}
