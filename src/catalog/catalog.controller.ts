import { Controller, Get } from '@nestjs/common';
import type { CurrentTenantContext } from '../tenant/current-tenant';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { CatalogService } from './catalog.service';
import { CatalogItemView, OperationCatalogView } from './catalog.view';

/** FR-105 : lecture du catalogue, borné au tenant de l'en-tête. */
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('product-types')
  listProductTypes(
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<CatalogItemView[]> {
    return this.catalog.listProductTypes(tenant.id);
  }

  @Get('operations')
  listOperations(
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<OperationCatalogView[]> {
    return this.catalog.listOperations(tenant.id);
  }

  @Get('constraint-types')
  listConstraintTypes(
    @CurrentTenant() tenant: CurrentTenantContext,
  ): Promise<CatalogItemView[]> {
    return this.catalog.listConstraintTypes(tenant.id);
  }
}
