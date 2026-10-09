import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

function flatten(errors: ValidationError[], prefix = ''): string[] {
  return errors.flatMap((e) => {
    const path = prefix ? `${prefix}.${e.property}` : e.property;
    const own = Object.values(e.constraints ?? {}).map((m) => (m.startsWith(e.property) ? `${prefix}${m}` : `${path}: ${m}`));
    return [...own, ...flatten(e.children ?? [], path)];
  });
}

/**
 * Validates a body against a DTO class chosen at runtime (e.g. per content type),
 * with the same rules as the global ValidationPipe.
 */
export async function validateBody<T extends object>(cls: new () => T, body: unknown): Promise<Partial<T>> {
  const instance = plainToInstance(cls, body ?? {});
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length > 0) throw new BadRequestException(flatten(errors));
  // DTO classes declare every optional field, so unset fields exist as `undefined`.
  // Drop them: otherwise spreading the DTO over existing values would erase those values.
  return Object.fromEntries(Object.entries(instance).filter(([, v]) => v !== undefined)) as Partial<T>;
}
