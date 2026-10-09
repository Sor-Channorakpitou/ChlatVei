import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { AppException, ErrorCode, ErrorDetail } from './app-exceptions';

interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: ErrorDetail[]; requestId?: string };
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'BUSINESS_RULE',
  429: 'RATE_LIMITED',
  503: 'DEPENDENCY_UNAVAILABLE',
};

/**
 * Converts every error into the single response shape from the API spec.
 * Internal details (stack traces, SQL) are logged, never returned.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const requestId = req.headers['x-request-id'] as string | undefined;

    const { status, body } = this.toResponse(exception);
    body.error.requestId = requestId;

    if (status >= 500) {
      this.logger.error(
        { requestId, method: req.method, path: req.path, err: exception instanceof Error ? exception.stack : exception },
        'Unhandled error',
      );
    }
    res.status(status).json(body);
  }

  private toResponse(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof AppException) {
      return this.build(exception.getStatus(), exception.code, exception.message, exception.details);
    }
    if (exception instanceof ThrottlerException) {
      return this.build(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 'Too many requests, please try again later');
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      // ValidationPipe errors carry an array of messages
      if (status === HttpStatus.BAD_REQUEST && typeof response === 'object' && Array.isArray((response as any).message)) {
        const details = ((response as any).message as string[]).map((issue) => ({ issue }));
        return this.build(status, 'VALIDATION_FAILED', 'Request validation failed', details);
      }
      return this.build(status, STATUS_TO_CODE[status] ?? 'INTERNAL', exception.message);
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') return this.build(409, 'CONFLICT', 'Resource already exists');
      if (exception.code === 'P2025') return this.build(404, 'NOT_FOUND', 'Resource not found');
      if (exception.code === 'P2003') return this.build(422, 'BUSINESS_RULE', 'Referenced resource does not exist');
    }
    return this.build(HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL', 'An unexpected error occurred');
  }

  private build(status: number, code: ErrorCode, message: string, details?: ErrorDetail[]) {
    return { status, body: { error: { code, message, ...(details ? { details } : {}) } } };
  }
}
