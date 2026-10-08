import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { ConflictError, UnauthenticatedError } from '../common/errors/app-exceptions';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { assertAcceptablePassword, hashPassword, verifyPassword } from './password';

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: User['role'];
  preferredLanguage: User['preferredLanguage'];
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

// A real hash of a random string, used to keep login timing similar for unknown emails.
let dummyHash: Promise<string> | undefined;

export function toPublicUser(u: User): PublicUser {
  return { id: u.id, email: u.email, displayName: u.displayName, role: u.role, preferredLanguage: u.preferredLanguage };
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Auth flow (ADR-004): short-lived JWT access token + opaque refresh token that is
 * stored hashed and rotated on every use. Presenting an already-rotated refresh
 * token revokes its whole family (stolen-token detection).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<{ user: PublicUser } & IssuedTokens> {
    assertAcceptablePassword(dto.password);
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictError('An account with this email already exists');

    // Registration always creates a CITIZEN. There is no self-service path to ADMIN.
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await hashPassword(dto.password),
        displayName: dto.displayName,
        preferredLanguage: dto.preferredLanguage,
      },
    });
    return { user: toPublicUser(user), ...(await this.issueTokens(user)) };
  }

  async login(dto: LoginDto): Promise<{ user: PublicUser } & IssuedTokens> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.isActive) {
      dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
      await verifyPassword(await dummyHash, dto.password);
      throw new UnauthenticatedError('Invalid email or password');
    }
    if (!(await verifyPassword(user.passwordHash, dto.password))) {
      throw new UnauthenticatedError('Invalid email or password');
    }
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { user: toPublicUser(updated), ...(await this.issueTokens(updated)) };
  }

  async refresh(refreshToken: string | undefined): Promise<IssuedTokens> {
    if (!refreshToken) throw new UnauthenticatedError('Missing refresh token');
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (!stored) throw new UnauthenticatedError('Invalid refresh token');

    if (stored.revokedAt) {
      // Reuse of a rotated token: assume theft and end every session in this family.
      await this.revokeFamily(stored.familyId);
      throw new UnauthenticatedError('Refresh token reuse detected; please sign in again');
    }
    if (stored.expiresAt < new Date() || !stored.user.isActive) {
      throw new UnauthenticatedError('Refresh token expired');
    }

    return this.prisma.$transaction(async (tx) => {
      // Conditional update guards against two concurrent refreshes with the same token.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (count !== 1) throw new UnauthenticatedError('Refresh token already used');
      return this.issueTokens(stored.user, stored.familyId, tx);
    });
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (stored) await this.revokeFamily(stored.familyId);
  }

  /** Ends all sessions of a user (role change, deactivation). */
  async revokeAllForUser(userId: string, tx: Prisma.TransactionClient = this.prisma): Promise<void> {
    await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async issueTokens(
    user: User,
    familyId: string = randomUUID(),
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<IssuedTokens> {
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });
    const refreshToken = randomBytes(32).toString('base64url');
    const days = this.config.get<number>('REFRESH_TOKEN_TTL_DAYS', 7);
    const refreshExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await tx.refreshToken.create({
      data: { userId: user.id, tokenHash: sha256(refreshToken), familyId, expiresAt: refreshExpiresAt },
    });
    return { accessToken, refreshToken, refreshExpiresAt };
  }
}
