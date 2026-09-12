import { Module } from '@nestjs/common';
import { TenantController } from './tenant.controller';
import { TenantRepository } from './tenant.repository';

@Module({
  controllers: [TenantController],
  providers: [TenantRepository],
  exports: [TenantRepository],
})
export class TenantModule {}
