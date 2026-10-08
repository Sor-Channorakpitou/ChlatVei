import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AnalyticsModule } from './analytics/analytics';
import { AuditModule } from './audit/audit.service';
import { AuthModule } from './auth/auth.module';
import { ChecklistsModule } from './checklists/checklists';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { validateEnv } from './config/env.validation';
import { FeedbackModule } from './feedback/feedback';
import { HealthController } from './health.controller';
import { MlModule } from './ml/ml.module';
import { PrismaModule } from './prisma/prisma.service';
import { ServicesModule } from './services/services.module';
import { SourcesModule } from './sources/sources';
import { UsersModule } from './users/users.module';
import { VerificationModule } from './verification/verification.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: config.get('JWT_ACCESS_TTL', '15m') },
      }),
    }),
    // Global default: 100 requests per minute per IP. Stricter limits on auth and feedback routes.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
        skipIf: () => config.get('RATE_LIMIT_ENABLED') === false,
      }),
    }),
    PrismaModule,
    AuditModule,
    MlModule,
    AuthModule,
    UsersModule,
    ServicesModule,
    VerificationModule,
    SourcesModule,
    FeedbackModule,
    ChecklistsModule,
    AnalyticsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: rate limit → authenticate → authorize.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}');
  }
}
