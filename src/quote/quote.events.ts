import type { Prisma } from '../generated/prisma/client';
import { OutboxEventInput } from '../outbox/outbox.writer';
import { QuoteRecord } from './quote.record';

/** Types d'événements du devis (section 4 du modèle de domaine). */
export const QUOTE_ISSUED = 'quote.issued';
export const QUOTE_ACCEPTED = 'quote.accepted';
export const QUOTE_SUPERSEDED = 'quote.superseded';

/**
 * Snapshot utile au consommateur (SDO). Les dates partent en ISO 8601 : le payload est du
 * JSON, il ne transporte pas de type Date.
 */
function payloadOf(quote: QuoteRecord): Prisma.InputJsonValue {
  return {
    quoteId: quote.id,
    number: quote.number,
    tenantId: quote.tenantId,
    compositionId: quote.compositionId,
    status: quote.status,
    totalCents: quote.totalCents,
    issuedAt: quote.issuedAt.toISOString(),
    validUntil: quote.validUntil.toISOString(),
    acceptedAt: quote.acceptedAt?.toISOString() ?? null,
  };
}

/** Événement sortant décrivant un devis, prêt pour `OutboxWriter.append` (FR-206). */
export function quoteEvent(type: string, quote: QuoteRecord): OutboxEventInput {
  return {
    aggregateType: 'quote',
    aggregateId: quote.id,
    type,
    payload: payloadOf(quote),
  };
}
