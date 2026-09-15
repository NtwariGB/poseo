/**
 * Seul point d'appel de l'API (UI-301). Les types reprennent les vues de sortie du
 * serveur : `CatalogItemView` / `OperationCatalogView` (FR-105), `CompositionView`
 * (FR-108) et `QuoteView` (FR-208).
 *
 * Une seule divergence assumée avec les vues TypeScript du serveur : les champs datés
 * y sont des `Date`, ils arrivent ici en chaînes ISO après sérialisation JSON.
 */

export interface CatalogItem {
  id: string;
  code: string;
  label: string;
}

export type OperationOrigin = 'MANDATORY' | 'OPTIONAL';
export type CompositionStatus = 'DRAFT' | 'QUOTED' | 'ACCEPTED';

export interface CompositionOperation {
  operationId: string;
  code: string;
  label: string;
  referenceDurationMinutes: number;
  origin: OperationOrigin;
  selected: boolean;
}

export interface Composition {
  id: string;
  status: CompositionStatus;
  productType: CatalogItem;
  productRef: string;
  address: { addressLine: string; postalCode: string; city: string };
  zone: CatalogItem | null;
  constraints: CatalogItem[];
  operations: CompositionOperation[];
  warnings: string[];
}

export type QuoteStatus = 'ISSUED' | 'ACCEPTED' | 'EXPIRED' | 'SUPERSEDED';
export type QuoteLineKind = 'OPERATION' | 'SURCHARGE';

export interface QuoteLine {
  position: number;
  kind: QuoteLineKind;
  label: string;
  durationMinutes: number | null;
  hourlyRateCents: number | null;
  amountCents: number;
}

export interface Quote {
  id: string;
  number: string;
  status: QuoteStatus;
  issuedAt: string;
  validUntil: string;
  acceptedAt: string | null;
  compositionId: string;
  productTypeLabel: string;
  zoneCode: string;
  hourlyRateCents: number;
  lines: QuoteLine[];
  laborCents: number;
  surchargeCents: number;
  subtotalCents: number;
  vatRateBp: number;
  vatCents: number;
  totalCents: number;
}

/** Corps d'erreur du `DomainErrorFilter` : `{ code, message }`, rendu tel quel (UI-308). */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** UI-302 : le tenant est résolu une fois au chargement, puis porté par chaque appel. */
let tenantId = '';

export function setTenantId(value: string): void {
  tenantId = value.trim();
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: {
        'X-Tenant-Id': tenantId,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // L'API est injoignable : même forme que les erreurs du domaine, pour un seul
    // chemin d'affichage dans le bandeau.
    throw new ApiError(
      'NETWORK_ERROR',
      "L'API ne répond pas. Vérifiez qu'elle écoute sur http://localhost:3000.",
      0,
    );
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload as { code?: string; message?: string } | null;
    throw new ApiError(
      error?.code ?? 'HTTP_ERROR',
      error?.message ?? `Réponse ${response.status} sans corps exploitable.`,
      response.status,
    );
  }

  return payload as T;
}

export const listProductTypes = (): Promise<CatalogItem[]> =>
  request('GET', '/catalog/product-types');

export const listConstraintTypes = (): Promise<CatalogItem[]> =>
  request('GET', '/catalog/constraint-types');

export interface CreateCompositionBody {
  productTypeId: string;
  productRef: string;
  addressLine: string;
  postalCode: string;
  city: string;
}

export const createComposition = (
  body: CreateCompositionBody,
): Promise<Composition> => request('POST', '/compositions', body);

export const getComposition = (id: string): Promise<Composition> =>
  request('GET', `/compositions/${id}`);

export const replaceConstraints = (
  id: string,
  constraintTypeIds: string[],
): Promise<Composition> =>
  request('PUT', `/compositions/${id}/constraints`, { constraintTypeIds });

export const selectOperation = (
  id: string,
  operationId: string,
  selected: boolean,
): Promise<Composition> =>
  request('PATCH', `/compositions/${id}/operations/${operationId}`, {
    selected,
  });

export const issueQuote = (compositionId: string): Promise<Quote> =>
  request('POST', `/compositions/${compositionId}/quotes`);

export const listQuotes = (compositionId: string): Promise<Quote[]> =>
  request('GET', `/compositions/${compositionId}/quotes`);

export const acceptQuote = (quoteId: string): Promise<Quote> =>
  request('POST', `/quotes/${quoteId}/accept`);
