import { Injectable } from '@nestjs/common';
import { CatalogRepository } from './catalog.repository';
import { CatalogItemView, OperationCatalogView } from './catalog.view';

/** Lecture du référentiel du tenant courant (FR-105). Le catalogue s'écrit par le seed. */
@Injectable()
export class CatalogService {
  constructor(private readonly catalog: CatalogRepository) {}

  listProductTypes(tenantId: string): Promise<CatalogItemView[]> {
    return this.catalog.findProductTypes(tenantId);
  }

  listOperations(tenantId: string): Promise<OperationCatalogView[]> {
    return this.catalog.findOperations(tenantId);
  }

  listConstraintTypes(tenantId: string): Promise<CatalogItemView[]> {
    return this.catalog.findConstraintTypes(tenantId);
  }
}
