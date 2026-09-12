import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CompositionController } from './composition.controller';
import { CompositionRepository } from './composition.repository';
import { CompositionService } from './composition.service';

@Module({
  imports: [CatalogModule],
  controllers: [CompositionController],
  providers: [CompositionService, CompositionRepository],
})
export class ServiceModule {}
