import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CompositionController } from './composition.controller';
import { CompositionRepository } from './composition.repository';
import { CompositionService } from './composition.service';

@Module({
  imports: [CatalogModule],
  controllers: [CompositionController],
  providers: [CompositionService, CompositionRepository],
  // Le module `quote` recompose la prestation avant de la chiffrer (ADR 0019) et bascule
  // son statut dans sa propre transaction (FR-201, FR-205).
  exports: [CompositionService, CompositionRepository],
})
export class ServiceModule {}
