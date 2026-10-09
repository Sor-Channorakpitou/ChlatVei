import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthService, toPublicUser } from '../auth/auth.service';
import { RequestMeta } from '../common/auth.decorators';
import { BusinessRuleError, NotFoundError } from '../common/errors/app-exceptions';
import { paginate, parseSort, skipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { AdminUpdateUserDto, ListUsersQuery, UpdateMeDto } from './users.dto';

const ADMIN_USER_FIELDS = {
  id: true, email: true, displayName: true, role: true, preferredLanguage: true,
  isActive: true, lastLoginAt: true, createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new NotFoundError('User');
    return toPublicUser(user);
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const user = await this.prisma.user.update({ where: { id: userId }, data: dto });
    return toPublicUser(user);
  }

  async list(q: ListUsersQuery) {
    const where: Prisma.UserWhereInput = {
      role: q.role,
      ...(q.q ? { OR: [{ email: { contains: q.q, mode: 'insensitive' } }, { displayName: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const orderBy = parseSort(q.sort, ['createdAt', 'email', 'displayName', 'lastLoginAt'], { createdAt: 'desc' });
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, orderBy, ...skipTake(q), select: ADMIN_USER_FIELDS }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(rows, total, q);
  }

  /** Role changes and deactivation end the user's sessions and are audit-logged. */
  async adminUpdate(actorId: string, userId: string, dto: AdminUpdateUserDto, meta: RequestMeta) {
    if (actorId === userId && (dto.role !== undefined || dto.isActive === false)) {
      throw new BusinessRuleError('You cannot change your own role or deactivate yourself');
    }
    const before = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!before) throw new NotFoundError('User');

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id: userId }, data: dto, select: ADMIN_USER_FIELDS });
      if ((dto.role && dto.role !== before.role) || dto.isActive === false) {
        await this.auth.revokeAllForUser(userId, tx);
      }
      await this.audit.record(
        {
          actorId,
          action: 'user.update',
          entityType: 'USER',
          entityId: userId,
          metadata: { before: { role: before.role, isActive: before.isActive }, after: { role: user.role, isActive: user.isActive } },
          meta,
        },
        tx,
      );
      return user;
    });
  }
}
