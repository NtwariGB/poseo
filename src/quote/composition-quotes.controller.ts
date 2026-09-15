import { Controller, Get, Param, Post } from '@nestjs/common';
import type { CurrentTenantContext } from '../tenant/current-tenant';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { QuoteService } from './quote.service';
import { QuoteView } from './quote.view';

/** FR-201 et FR-204, côté prestation : émission et historique des devis d'une prestation. */
@Controller('compositions')
export class CompositionQuotesController {
  constructor(private readonly quotes: QuoteService) {}

  @Post(':id/quotes')
  issue(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param('id') id: string,
  ): Promise<QuoteView> {
    return this.quotes.issue(tenant.id, id);
  }

  @Get(':id/quotes')
  list(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param('id') id: string,
  ): Promise<QuoteView[]> {
    return this.quotes.listForComposition(tenant.id, id);
  }
}
