import { HttpException, HttpStatus } from '@nestjs/common';

/** Error codes returned in the `error.code` field (docs/architecture/03_api_spec.md#errors). */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE'
  | 'RATE_LIMITED'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'INTERNAL';

export interface ErrorDetail {
  field?: string;
  issue: string;
}

export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message, status);
  }
}

export class NotFoundError extends AppException {
  constructor(resource: string) {
    super(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${resource} not found`);
  }
}

export class ConflictError extends AppException {
  constructor(message: string) {
    super(HttpStatus.CONFLICT, 'CONFLICT', message);
  }
}

/** A request that is well-formed but violates a domain rule (HTTP 422). */
export class BusinessRuleError extends AppException {
  constructor(message: string) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, 'BUSINESS_RULE', message);
  }
}

export class UnauthenticatedError extends AppException {
  constructor(message = 'Authentication required') {
    super(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', message);
  }
}
