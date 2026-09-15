import { QuoteLineKindName } from './pricing.rules';
import { QuoteStatusName } from './quote.view';

/** Ligne de devis telle que stockée. */
export interface QuoteLineRecord {
  position: number;
  kind: QuoteLineKindName;
  label: string;
  durationMinutes: number | null;
  hourlyRateCents: number | null;
  amountCents: number;
}

/** Devis tel que stocké, avec ses lignes. Immuable hors `status` et `acceptedAt`. */
export interface QuoteRecord {
  id: string;
  tenantId: string;
  compositionId: string;
  number: string;
  status: QuoteStatusName;
  issuedAt: Date;
  validUntil: Date;
  acceptedAt: Date | null;
  zoneCode: string;
  hourlyRateCents: number;
  productTypeLabel: string;
  laborCents: number;
  surchargeCents: number;
  subtotalCents: number;
  vatRateBp: number;
  vatCents: number;
  totalCents: number;
  lines: QuoteLineRecord[];
}
