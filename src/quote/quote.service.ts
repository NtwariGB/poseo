import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { CatalogRepository } from '../catalog/catalog.repository';
import { ConflictError } from '../common/errors/conflict-error';
import { InvariantViolationError } from '../common/errors/invariant-violation-error';
import { NotFoundError } from '../common/errors/not-found-error';
import { OutboxWriter } from '../outbox/outbox.writer';
import { CompositionRepository } from '../service/composition.repository';
import { CompositionRules } from '../service/composition.rules';
import { CompositionService } from '../service/composition.service';
import { TenantRepository } from '../tenant/tenant.repository';
import { PricingRules } from './pricing.rules';
import {
  QUOTE_ACCEPTED,
  QUOTE_ISSUED,
  QUOTE_SUPERSEDED,
  quoteEvent,
} from './quote.events';
import { QuoteRecord } from './quote.record';
import { QuoteRepository } from './quote.repository';
import { buildQuoteView, QuoteView } from './quote.view';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Émission, consultation et acceptation d'un devis (FR-201, FR-204, FR-205). Orchestre :
 * recomposition de la prestation, calcul pur, écriture transactionnelle du devis, du
 * compteur, du statut de la prestation et des événements sortants.
 */
@Injectable()
export class QuoteService {
  constructor(
    private readonly compositions: CompositionService,
    private readonly compositionRepository: CompositionRepository,
    private readonly catalog: CatalogRepository,
    private readonly tenants: TenantRepository,
    private readonly quotes: QuoteRepository,
    private readonly outbox: OutboxWriter,
  ) {}

  /**
   * FR-201 : recompose (ADR 0019), chiffre, puis fige le devis. La supersession de l'ancien
   * devis, le compteur, le nouveau devis, le statut de la prestation et les événements sont
   * dans la même transaction : un échec ne laisse ni devis orphelin ni événement menteur.
   */
  async issue(tenantId: string, compositionId: string): Promise<QuoteView> {
    const resolved = await this.compositions.resolveForQuote(
      tenantId,
      compositionId,
    );
    const composition = resolved.record;

    // FR-212 : émettre est un mouvement de la prestation, il obéit au même verrou que sa
    // modification. La règle vit dans la classe pure, pas en double ici (ADR 0023).
    CompositionRules.assertModifiable(composition.status);

    const issuedAt = new Date();

    // Règle métier 4 : hors zone, la prestation n'est pas chiffrable. Contrôlé avant le
    // « rien à chiffrer » : le taux horaire est nécessaire au calcul (ADR 0021).
    const zone = await this.catalog.findZoneByPostalCode(
      tenantId,
      composition.postalCode,
    );
    if (!zone) {
      throw new InvariantViolationError(
        'ZONE_NOT_COVERED',
        `Aucune zone ne couvre le code postal ${composition.postalCode}.`,
      );
    }

    const hourlyRateCents = await this.catalog.findApplicableLaborRate(
      tenantId,
      zone.id,
      issuedAt,
    );
    if (hourlyRateCents === null) {
      throw new InvariantViolationError(
        'LABOR_RATE_NOT_FOUND',
        `Aucun taux en vigueur pour la zone ${zone.code}.`,
      );
    }

    const settings = await this.tenants.findSettings(tenantId);
    if (!settings) {
      throw new NotFoundError('TENANT_NOT_FOUND', `Tenant ${tenantId} inconnu.`);
    }

    const surchargeRules = await this.catalog.findSurchargeRules(
      tenantId,
      composition.productTypeId,
    );
    const priced = PricingRules.price({
      operations: resolved.operations,
      surcharges: PricingRules.applicableSurcharges(
        surchargeRules,
        composition.constraints.map((constraint) => constraint.id),
      ),
      hourlyRateCents,
      vatRateBp: settings.vatRateBp,
    });

    const issued = await this.quotes.transaction(async (tx) => {
      // Règle métier 6 et invariant « au plus un ISSUED » : l'ancien sort de l'état ISSUED
      // avant que le nouveau n'y entre.
      const superseded = await this.quotes.supersedeIssued(
        tx,
        tenantId,
        composition.id,
      );
      if (superseded) {
        await this.outbox.append(tx, quoteEvent(QUOTE_SUPERSEDED, superseded));
      }

      const number = await this.quotes.nextNumber(
        tx,
        tenantId,
        issuedAt.getFullYear(),
      );

      const created = await this.quotes.insert(tx, {
        tenantId,
        compositionId: composition.id,
        number,
        issuedAt,
        validUntil: new Date(
          issuedAt.getTime() + settings.quoteValidityDays * DAY_MS,
        ),
        zoneCode: zone.code,
        hourlyRateCents,
        productTypeLabel: composition.productType.label,
        laborCents: priced.laborCents,
        surchargeCents: priced.surchargeCents,
        subtotalCents: priced.subtotalCents,
        vatRateBp: priced.vatRateBp,
        vatCents: priced.vatCents,
        totalCents: priced.totalCents,
        lines: priced.lines,
      });

      await this.outbox.append(tx, quoteEvent(QUOTE_ISSUED, created));

      // DRAFT → QUOTED ; une prestation déjà QUOTED le reste (cycle de vie section 2).
      const touched = await this.compositionRepository.setStatus(
        tx,
        tenantId,
        composition.id,
        'QUOTED',
        issuedAt,
      );
      if (!touched) {
        throw new NotFoundError(
          'COMPOSITION_NOT_FOUND',
          `Prestation ${composition.id} inconnue.`,
        );
      }

      return created;
    });

    return buildQuoteView(issued);
  }

  /** FR-204 : un devis du tenant courant, avec ses lignes et ses snapshots. */
  async findOne(tenantId: string, quoteId: string): Promise<QuoteView> {
    return buildQuoteView(await this.load(tenantId, quoteId));
  }

  /**
   * FR-204 et FR-211 : les devis d'une prestation, du plus récent au plus ancien. La
   * prestation est chargée d'abord : celle d'un autre tenant est inconnue (404), jamais
   * une liste vide.
   */
  async listForComposition(
    tenantId: string,
    compositionId: string,
  ): Promise<QuoteView[]> {
    const composition = await this.compositions.findOne(
      tenantId,
      compositionId,
    );
    const records = await this.quotes.listForComposition(
      tenantId,
      composition.id,
    );

    return records.map(buildQuoteView);
  }

  /**
   * FR-205 : acceptation d'un devis encore valide. Le devis passe ACCEPTED, la prestation
   * aussi, et l'événement part dans la même transaction.
   */
  async accept(tenantId: string, quoteId: string): Promise<QuoteView> {
    const quote = await this.load(tenantId, quoteId);
    const acceptedAt = new Date();

    // Seul ISSUED est acceptable : ACCEPTED, EXPIRED et SUPERSEDED sont terminaux.
    if (quote.status !== 'ISSUED') {
      throw new ConflictError(
        'QUOTE_NOT_ACCEPTABLE',
        `Devis ${quote.number} en statut ${quote.status} : acceptation impossible.`,
      );
    }

    // Règle métier 7. Le devis périmé n'est pas basculé en EXPIRED ici : la tâche
    // planifiée est hors périmètre du lot (ADR 0018), l'acceptation est juste refusée.
    if (quote.validUntil.getTime() <= acceptedAt.getTime()) {
      throw new ConflictError(
        'QUOTE_EXPIRED',
        `Devis ${quote.number} périmé depuis le ${quote.validUntil.toISOString()}.`,
      );
    }

    // FR-216 : la prestation a bougé depuis l'émission, le devis ne la décrit plus. On
    // refuse plutôt que de figer une prestation ACCEPTED sur un devis divergent (ADR 0023).
    const updatedAt = await this.compositionRepository.findUpdatedAt(
      tenantId,
      quote.compositionId,
    );
    if (!updatedAt) {
      throw new NotFoundError(
        'COMPOSITION_NOT_FOUND',
        `Prestation ${quote.compositionId} inconnue.`,
      );
    }
    if (updatedAt.getTime() > quote.issuedAt.getTime()) {
      throw new ConflictError(
        'QUOTE_STALE',
        `Devis ${quote.number} : la prestation a été modifiée depuis l'émission, il faut réémettre.`,
      );
    }

    const accepted = await this.quotes.transaction(async (tx) => {
      const updated = await this.quotes.acceptIssued(
        tx,
        tenantId,
        quote.id,
        acceptedAt,
      );
      if (!updated) {
        // Le devis a changé d'état entre le contrôle et l'écriture : rien n'a été écrit.
        throw new ConflictError(
          'QUOTE_NOT_ACCEPTABLE',
          `Devis ${quote.number} n'est plus acceptable.`,
        );
      }

      await this.outbox.append(tx, quoteEvent(QUOTE_ACCEPTED, updated));

      // Règle métier 8 : l'acceptation fige la prestation.
      const touched = await this.compositionRepository.setStatus(
        tx,
        tenantId,
        updated.compositionId,
        'ACCEPTED',
        acceptedAt,
      );
      if (!touched) {
        throw new NotFoundError(
          'COMPOSITION_NOT_FOUND',
          `Prestation ${updated.compositionId} inconnue.`,
        );
      }

      return updated;
    });

    return buildQuoteView(accepted);
  }

  private async load(tenantId: string, quoteId: string): Promise<QuoteRecord> {
    // Un identifiant mal formé est traité comme absent (ADR 0021) : on ne distingue jamais
    // « pas à vous » de « inconnu ».
    const record = isUUID(quoteId)
      ? await this.quotes.findForTenant(tenantId, quoteId)
      : null;

    if (!record) {
      throw new NotFoundError('QUOTE_NOT_FOUND', `Devis ${quoteId} inconnu.`);
    }

    return record;
  }
}
