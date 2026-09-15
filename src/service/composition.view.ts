import { CatalogItemView } from '../catalog/catalog.view';
import {
  CompositionStatusName,
  OperationOriginName,
} from './composition.rules';

/** Opération retenue sur une prestation, telle que rendue par l'API (FR-108). */
export interface CompositionOperationView {
  operationId: string;
  code: string;
  label: string;
  referenceDurationMinutes: number;
  origin: OperationOriginName;
  selected: boolean;
}

/** Représentation de sortie d'une prestation (FR-108). */
export interface CompositionView {
  id: string;
  status: CompositionStatusName;
  productType: CatalogItemView;
  productRef: string;
  address: { addressLine: string; postalCode: string; city: string };
  zone: CatalogItemView | null;
  constraints: CatalogItemView[];
  operations: CompositionOperationView[];
  warnings: string[];
}

export interface CompositionViewInput {
  id: string;
  status: CompositionStatusName;
  productType: CatalogItemView;
  productRef: string;
  addressLine: string;
  postalCode: string;
  city: string;
  zone: CatalogItemView | null;
  constraints: readonly CatalogItemView[];
  operations: readonly CompositionOperationView[];
  warnings: readonly string[];
}

const byCode = (left: { code: string }, right: { code: string }): number =>
  left.code < right.code ? -1 : left.code > right.code ? 1 : 0;

/**
 * Assemble la représentation FR-108. Seul endroit qui décide de l'ordre : listes triées
 * par code métier, avertissements triés, pour que deux lectures identiques se comparent.
 */
export function buildCompositionView(
  input: CompositionViewInput,
): CompositionView {
  return {
    id: input.id,
    status: input.status,
    productType: input.productType,
    productRef: input.productRef,
    address: {
      addressLine: input.addressLine,
      postalCode: input.postalCode,
      city: input.city,
    },
    zone: input.zone,
    constraints: [...input.constraints].sort(byCode),
    operations: [...input.operations].sort(byCode),
    warnings: [...input.warnings].sort(),
  };
}
