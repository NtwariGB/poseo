import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogRepository } from './catalog.repository';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, CatalogRepository],
  // Le module `service` compose à partir du référentiel : il lit par ce repository.
  exports: [CatalogRepository],
})
export class CatalogModule {}
