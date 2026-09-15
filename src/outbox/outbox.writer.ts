import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type { PrismaTransaction } from '../prisma/prisma-transaction';

/** Agrégats dont on publie les événements (section 4 du modèle de domaine). */
export type OutboxAggregateType = 'quote' | 'composition';

export interface OutboxEventInput {
  aggregateType: OutboxAggregateType;
  aggregateId: string;
  type: string;
  payload: Prisma.InputJsonValue;
}

/**
 * FR-206 : unique chemin d'écriture d'un événement sortant. L'application ne produit jamais
 * sur Kafka (ADR 0003) : elle pose une ligne `outbox_event` dans la transaction métier, que
 * Debezium capte ensuite. La ligne n'est jamais mise à jour ni supprimée.
 */
@Injectable()
export class OutboxWriter {
  async append(tx: PrismaTransaction, event: OutboxEventInput): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        type: event.type,
        payload: event.payload,
      },
    });
  }
}
