import { Body, Controller, Get, Global, HttpCode, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { AuthUser, CurrentUser, ReqMeta, RequestMeta, Roles } from '../common/auth.decorators';
import { MlClient } from './ml.client';
import { ComplexityService, ExtractionService } from './ml.services';

class RunExtractionDto {
  @IsUUID() sourceId: string;
  @IsUUID() serviceId: string;
  @IsOptional() @IsUUID() snapshotId?: string;
}

@Roles('ADMIN')
@Controller('admin')
export class MlAdminController {
  constructor(
    private readonly complexity: ComplexityService,
    private readonly extraction: ExtractionService,
  ) {}

  /** Runs the extractor on a source snapshot; findings land in the review queue as PENDING. */
  @Post('extraction-jobs')
  async runExtraction(@Body() dto: RunExtractionDto, @CurrentUser() u: AuthUser, @ReqMeta() meta: RequestMeta) {
    return { data: await this.extraction.run(dto, u.id, meta) };
  }

  @Get('extraction-jobs/:id')
  async job(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.extraction.get(id) };
  }

  @Post('services/:id/complexity')
  async recompute(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.complexity.recompute(id) };
  }

  @HttpCode(200)
  @Post('analytics/complexity/recompute')
  async recomputeAll() {
    return { data: await this.complexity.recomputeAll() };
  }

  @Get('analytics/complexity')
  async latest() {
    return { data: await this.complexity.latest() };
  }
}

@Global()
@Module({
  controllers: [MlAdminController],
  providers: [MlClient, ComplexityService, ExtractionService],
  exports: [MlClient],
})
export class MlModule {}
