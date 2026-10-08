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
  CORS_ORIGINS = 'http://localhost:5173';

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  REQUIRE_DIFFERENT_APPROVER = false;

  /** Only for automated tests, which send many requests from one IP. */
  @Transform(({ value }) => value === undefined || value === true || value === 'true')
  @IsBoolean()
  RATE_LIMIT_ENABLED = true;

  @IsOptional()
  @IsString()
  ML_SERVICE_URL?: string;
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
