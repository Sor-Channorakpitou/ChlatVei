import { Module } from '@nestjs/common';
import { AdminServicesController, PublicServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({
  controllers: [PublicServicesController, AdminServicesController],
  providers: [ServicesService],
})
export class ServicesModule {}
