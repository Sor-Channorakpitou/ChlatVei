import { Module } from '@nestjs/common';
import { ContentService } from '../content/content.service';
import { AdminContentController } from './verification.controller';
import { VerificationService } from './verification.service';

@Module({
  controllers: [AdminContentController],
  providers: [ContentService, VerificationService],
})
export class VerificationModule {}
