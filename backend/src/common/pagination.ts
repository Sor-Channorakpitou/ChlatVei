import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { BusinessRuleError } from './errors/app-exceptions';

export class PaginationQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  /** Field name, prefixed with "-" for descending. Each endpoint whitelists fields. */
  @IsOptional()
  @IsString()
  sort?: string;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export function paginate<T>(data: T[], total: number, q: PaginationQuery): Paginated<T> {
  return { data, meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.ceil(total / q.pageSize) } };
}

export function skipTake(q: PaginationQuery): { skip: number; take: number } {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

/**
 * Turns `?sort=-createdAt` into a Prisma orderBy, rejecting fields not in the whitelist
 * so clients cannot sort on arbitrary (possibly sensitive or unindexed) columns.
 */
export function parseSort(
  sort: string | undefined,
  allowed: readonly string[],
  fallback: Record<string, 'asc' | 'desc'>,
): Record<string, 'asc' | 'desc'> {
  if (!sort) return fallback;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  if (!allowed.includes(field)) {
    throw new BusinessRuleError(`Cannot sort by "${field}". Allowed: ${allowed.join(', ')}`);
  }
  return { [field]: desc ? 'desc' : 'asc' };
}
