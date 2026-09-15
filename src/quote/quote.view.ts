import { QuoteLineKindName } from './pricing.rules';

export type QuoteStatusName = 'ISSUED' | 'ACCEPTED' | 'EXPIRED' | 'SUPERSEDED';

/** Ligne du devis telle que rendue par l'API (FR-208). */
export interface QuoteLineView {
  position: number;
  kind: QuoteLineKindName;
  label: string;
  durationMinutes: number | null;
  hourlyRateCents: number | null;
  amountCents: number;
}

/** Représentation de sortie d'un devis (FR-208). */
export interface QuoteView {
  id: string;
  number: string;
  status: QuoteStatusName;
  issuedAt: Date;
  validUntil: Date;
  acceptedAt: Date | null;
  compositionId: string;
  productTypeLabel: string;
  zoneCode: string;
  hourlyRateCents: number;
  lines: QuoteLineView[];
  laborCents: number;
  surchargeCents: number;
  subtotalCents: number;
  vatRateBp: number;
  vatCents: number;
  totalCents: number;
}

export interface QuoteViewInput extends Omit<QuoteView, 'lines'> {
  lines: readonly QuoteLineView[];
}

/**
 * Assemble la représentation FR-208. Seul endroit qui décide de l'ordre des lignes :
 * par `position` croissante, l'ordre figé à l'émission (FR-210).
 */
export function buildQuoteView(input: QuoteViewInput): QuoteView {
  return {
    id: input.id,
    number: input.number,
    status: input.status,
    issuedAt: input.issuedAt,
    validUntil: input.validUntil,
    acceptedAt: input.acceptedAt,
    compositionId: input.compositionId,
    productTypeLabel: input.productTypeLabel,
    zoneCode: input.zoneCode,
    hourlyRateCents: input.hourlyRateCents,
    lines: [...input.lines]
      .sort((left, right) => left.position - right.position)
      .map((line) => ({
        position: line.position,
        kind: line.kind,
        label: line.label,
        durationMinutes: line.durationMinutes,
        hourlyRateCents: line.hourlyRateCents,
        amountCents: line.amountCents,
      })),
    laborCents: input.laborCents,
    surchargeCents: input.surchargeCents,
    subtotalCents: input.subtotalCents,
    vatRateBp: input.vatRateBp,
    vatCents: input.vatCents,
    totalCents: input.totalCents,
  };
}
