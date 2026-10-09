import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from './common/auth.decorators';
import { PrismaService } from './prisma/prisma.service';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
