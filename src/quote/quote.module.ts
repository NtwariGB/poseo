import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ServiceModule } from '../service/service.module';
import { TenantModule } from '../tenant/tenant.module';
import { CompositionQuotesController } from './composition-quotes.controller';
import { QuoteController } from './quote.controller';
import { QuoteRepository } from './quote.repository';
import { QuoteService } from './quote.service';

@Module({
  imports: [CatalogModule, ServiceModule, TenantModule, OutboxModule],
  controllers: [QuoteController, CompositionQuotesController],
  providers: [QuoteService, QuoteRepository],
})
export class QuoteModule {}
