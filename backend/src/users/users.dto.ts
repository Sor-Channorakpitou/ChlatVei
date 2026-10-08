import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Language, Role } from '@prisma/client';
import { PaginationQuery } from '../common/pagination';

export class UpdateMeDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsIn(Object.values(Language))
  preferredLanguage?: Language;
}

export class AdminUpdateUserDto {
  @IsOptional()
  @IsIn(Object.values(Role))
  role?: Role;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListUsersQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(Object.values(Role))
  role?: Role;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
