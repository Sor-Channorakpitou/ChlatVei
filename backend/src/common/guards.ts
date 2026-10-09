import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { AuthUser, IS_PUBLIC_KEY, OPTIONAL_AUTH_KEY, ROLES_KEY } from './auth.decorators';
import { UnauthenticatedError } from './errors/app-exceptions';

interface AccessTokenPayload {
  sub: string;
  role: Role;
}

function bearerToken(req: Request): string | undefined {
  const [type, token] = req.headers.authorization?.split(' ') ?? [];
  return type === 'Bearer' ? token : undefined;
}

/**
 * Global guard: every route requires a valid access token unless marked @Public()
 * or @OptionalAuth(). Secure by default; forgetting a decorator closes a route.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    const isOptional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH_KEY, targets);

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = bearerToken(req);

    if (!token) {
      if (isPublic || isOptional) return true;
      throw new UnauthenticatedError();
    }
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { algorithms: ['HS256'] });
      req.user = { id: payload.sub, role: payload.role };
    } catch {
      // An invalid token on a public route is ignored; on any other route it is rejected.
      if (isPublic) return true;
      throw new UnauthenticatedError('Invalid or expired access token');
    }
    return true;
  }
}

/** Checks @Roles(...) after JwtAuthGuard has identified the user. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!required || required.length === 0) return true;
    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) throw new UnauthenticatedError();
    if (!required.includes(user.role)) throw new ForbiddenException('You do not have permission to do this');
    return true;
  }
}
