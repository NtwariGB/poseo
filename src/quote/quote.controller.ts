import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { CurrentTenantContext } from '../tenant/current-tenant';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { QuoteService } from './quote.service';
import { QuoteView } from './quote.view';

/** FR-204 et FR-205. Aucune règle métier ici : lecture du tenant et délégation. */
@Controller('quotes')
export class QuoteController {
  constructor(private readonly quotes: QuoteService) {}

  @Get(':id')
  findOne(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param('id') id: string,
  ): Promise<QuoteView> {
    return this.quotes.findOne(tenant.id, id);
  }

  // L'acceptation modifie un devis existant, elle ne crée rien : 200, pas 201.
  @Post(':id/accept')
  @HttpCode(200)
  accept(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param('id') id: string,
  ): Promise<QuoteView> {
    return this.quotes.accept(tenant.id, id);
  }
}
