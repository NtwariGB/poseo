/** Élément de référentiel identifié par son code métier (FR-105, FR-108). */
export interface CatalogItemView {
  id: string;
  code: string;
  label: string;
}

/** Opération du catalogue : un élément de référentiel plus sa durée de référence. */
export interface OperationCatalogView extends CatalogItemView {
  referenceDurationMinutes: number;
}
