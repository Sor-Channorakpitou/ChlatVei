import { plainToInstance, Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min, MinLength, validateSync } from 'class-validator';

/**
 * Environment variables, validated at startup so a misconfigured server
 * refuses to boot instead of failing later at runtime.
 */
export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  PORT = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters' })
  JWT_ACCESS_SECRET: string;

  @IsString()
  JWT_ACCESS_TTL = '15m';

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  REFRESH_TOKEN_TTL_DAYS = 7;

  @IsString()
  CORS_ORIGINS = 'http://localhost:4200';

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  REQUIRE_DIFFERENT_APPROVER = false;

  /** Only for automated tests, which send many requests from one IP. */
  @Transform(({ value }) => value === undefined || value === true || value === 'true')
  @IsBoolean()
  RATE_LIMIT_ENABLED = true;

  /** Internal ML service (Phase 7). If unset, search falls back to the database and ML features are off. */
  @IsOptional()
  @IsString()
  ML_SERVICE_URL?: string;

  /** Optional shared key sent as X-Internal-Key; must match the ML service's ML_API_KEY. */
  @IsOptional()
  @IsString()
  ML_API_KEY?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(100)
  ML_TIMEOUT_MS?: number;

  /** Repository data folder (extracted source text for extraction jobs). Relative to the backend folder. */
  @IsOptional()
  @IsString()
  DATA_DIR?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: false });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    throw new Error(`Invalid environment configuration:\n- ${messages.join('\n- ')}`);
  }
  return validated;
}
