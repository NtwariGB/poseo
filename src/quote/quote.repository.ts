import { Injectable } from '@nestjs/common';
import type { PrismaTransaction } from '../prisma/prisma-transaction';
import { PrismaService } from '../prisma/prisma.service';
import { QuoteLineRecord, QuoteRecord } from './quote.record';

/** Devis à figer, tel que le calcul l'a produit. */
export interface InsertQuoteData {
  tenantId: string;
  compositionId: string;
  number: string;
  issuedAt: Date;
  validUntil: Date;
  zoneCode: string;
  hourlyRateCents: number;
  productTypeLabel: string;
  laborCents: number;
  surchargeCents: number;
  subtotalCents: number;
  vatRateBp: number;
  vatCents: number;
  totalCents: number;
  lines: readonly QuoteLineRecord[];
}

const QUOTE_SELECT = {
  id: true,
  tenantId: true,
  compositionId: true,
  number: true,
  status: true,
  issuedAt: true,
  validUntil: true,
  acceptedAt: true,
  zoneCode: true,
  hourlyRateCents: true,
  productTypeLabel: true,
  laborCents: true,
  surchargeCents: true,
  subtotalCents: true,
  vatRateBp: true,
  vatCents: true,
  totalCents: true,
  lines: {
    select: {
      position: true,
      kind: true,
      label: true,
      durationMinutes: true,
      hourlyRateCents: true,
      amountCents: true,
    },
    orderBy: { position: 'asc' },
  },
} as const;

const PAD = 6;

/**
 * Seul accès Prisma du devis. Le devis porte `tenantId` : toute lecture et toute écriture le
 * filtrent, si bien qu'un devis d'un autre tenant est introuvable plutôt qu'interdit (ADR 0017).
 *
 * Les écritures prennent la transaction en paramètre : l'émission et l'acceptation touchent
 * aussi le compteur, l'outbox et la prestation, et tout doit être commité d'un bloc.
 */
@Injectable()
export class QuoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Ouvre la transaction métier que le service remplit (FR-201, FR-205, FR-206). */
  transaction<T>(run: (tx: PrismaTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(run);
  }

  /**
   * FR-203 : numéro `Q-<année>-<6 chiffres>`, séquence par tenant et par année. La ligne de
   * compteur est verrouillée (`SELECT ... FOR UPDATE`) jusqu'à la fin de la transaction :
   * deux émissions concurrentes s'attendent au lieu de se donner le même numéro.
   */
  async nextNumber(
    tx: PrismaTransaction,
    tenantId: string,
    year: number,
  ): Promise<string> {
    await tx.$executeRaw`
      INSERT INTO quote_counter (tenant_id, year, last_value)
      VALUES (${tenantId}::uuid, ${year}::int, 0)
      ON CONFLICT (tenant_id, year) DO NOTHING`;

    const locked = await tx.$queryRaw<{ last_value: number }[]>`
      SELECT last_value FROM quote_counter
      WHERE tenant_id = ${tenantId}::uuid AND year = ${year}::int
      FOR UPDATE`;

    const next = (locked[0]?.last_value ?? 0) + 1;

    await tx.$executeRaw`
      UPDATE quote_counter SET last_value = ${next}::int
      WHERE tenant_id = ${tenantId}::uuid AND year = ${year}::int`;

    return `Q-${year}-${String(next).padStart(PAD, '0')}`;
  }

  /**
   * Passe le devis ISSUED de la prestation en SUPERSEDED et le rend tel qu'il devient
   * (règle métier 6). `null` si la prestation n'en avait pas.
   */
  async supersedeIssued(
    tx: PrismaTransaction,
    tenantId: string,
    compositionId: string,
  ): Promise<QuoteRecord | null> {
    const current = await tx.quote.findFirst({
      where: { tenantId, compositionId, status: 'ISSUED' },
      select: QUOTE_SELECT,
    });
    if (!current) return null;

    // Refiltre sur le statut : entre la lecture et l'écriture, un autre appel a pu
    // l'accepter ou le remplacer. Sans ligne touchée, on n'annonce pas de supersession.
    const updated = await tx.quote.updateMany({
      where: { id: current.id, tenantId, status: 'ISSUED' },
      data: { status: 'SUPERSEDED' },
    });
    if (updated.count === 0) return null;

    return { ...current, status: 'SUPERSEDED' };
  }

  /** Fige le devis et ses lignes. Aucune de ces colonnes ne sera plus modifiée. */
  async insert(
    tx: PrismaTransaction,
    data: InsertQuoteData,
  ): Promise<QuoteRecord> {
    return tx.quote.create({
      data: {
        tenantId: data.tenantId,
        compositionId: data.compositionId,
        number: data.number,
        status: 'ISSUED',
        issuedAt: data.issuedAt,
        validUntil: data.validUntil,
        zoneCode: data.zoneCode,
        hourlyRateCents: data.hourlyRateCents,
        productTypeLabel: data.productTypeLabel,
        laborCents: data.laborCents,
        surchargeCents: data.surchargeCents,
        subtotalCents: data.subtotalCents,
        vatRateBp: data.vatRateBp,
        vatCents: data.vatCents,
        totalCents: data.totalCents,
        lines: { create: data.lines.map((line) => ({ ...line })) },
      },
      select: QUOTE_SELECT,
    });
  }

  /**
   * FR-205 : n'accepte qu'un devis encore ISSUED, du tenant courant. `null` si l'état a
   * changé entre le contrôle et l'écriture : rien n'est écrit.
   */
  async acceptIssued(
    tx: PrismaTransaction,
    tenantId: string,
    quoteId: string,
    acceptedAt: Date,
  ): Promise<QuoteRecord | null> {
    const updated = await tx.quote.updateMany({
      where: { id: quoteId, tenantId, status: 'ISSUED' },
      data: { status: 'ACCEPTED', acceptedAt },
    });
    if (updated.count === 0) return null;

    return tx.quote.findFirst({
      where: { id: quoteId, tenantId },
      select: QUOTE_SELECT,
    });
  }

  findForTenant(tenantId: string, id: string): Promise<QuoteRecord | null> {
    return this.prisma.quote.findFirst({
      where: { tenantId, id },
      select: QUOTE_SELECT,
    });
  }

  /**
   * FR-204 : les devis de la prestation, du plus récent au plus ancien. `id` départage deux
   * émissions de même horodatage : l'UUID v7 est ordonné dans le temps.
   */
  listForComposition(
    tenantId: string,
    compositionId: string,
  ): Promise<QuoteRecord[]> {
    return this.prisma.quote.findMany({
      where: { tenantId, compositionId },
      select: QUOTE_SELECT,
      orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
    });
  }
}
