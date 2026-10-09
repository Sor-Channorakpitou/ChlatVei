import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';

/**
 * Applies the global HTTP configuration. Shared by main.ts and the e2e tests,
 * so tests exercise exactly the same pipes, filters and security headers.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get<string>('CORS_ORIGINS', '').split(',').map((o) => o.trim()).filter(Boolean),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // ...and reject requests that send them
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  // Behind a reverse proxy (nginx in Phase 10) so req.ip is the client, not the proxy.
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', 1);
}
