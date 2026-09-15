import { InvariantViolationError } from '../common/errors/invariant-violation-error';

// Le calcul est pur : ni Prisma, ni NestJS. Il redéclare donc les énumérations du modèle
// sous forme d'unions de chaînes, la conversion depuis le client généré se faisant dans
// le repository.

export type PricingOperationOrigin = 'MANDATORY' | 'OPTIONAL';

export type QuoteLineKindName = 'OPERATION' | 'SURCHARGE';

/** Opération retenue sur la prestation, réduite à ce qui décide du prix et de l'ordre. */
export interface PricingOperationInput {
  code: string;
  label: string;
  referenceDurationMinutes: number;
  origin: PricingOperationOrigin;
  selected: boolean;
}

/** Règle SURCHARGE déclenchée : exactement un des deux montants est renseigné. */
export interface PricingSurchargeInput {
  label: string;
  surchargePercentBp: number | null;
  surchargeCents: number | null;
}

/** Règle SURCHARGE du catalogue, avant filtrage par les contraintes déclarées (FR-107). */
export interface SurchargeRuleInput {
  label: string | null;
  constraintTypeId: string | null;
  surchargePercentBp: number | null;
  surchargeCents: number | null;
}

export interface PricingInput {
  operations: readonly PricingOperationInput[];
  surcharges: readonly PricingSurchargeInput[];
  hourlyRateCents: number;
  vatRateBp: number;
}

/** Ligne du devis, telle qu'elle sera figée (FR-208). */
export interface PricedLine {
  position: number;
  kind: QuoteLineKindName;
  label: string;
  durationMinutes: number | null;
  hourlyRateCents: number | null;
  amountCents: number;
}

/** Résultat complet du calcul : les lignes et les montants agrégés. */
export interface PricedQuote {
  lines: PricedLine[];
  laborCents: number;
  surchargeCents: number;
  subtotalCents: number;
  vatRateBp: number;
  vatCents: number;
  totalCents: number;
}

const ORIGIN_RANK: Record<PricingOperationOrigin, number> = {
  MANDATORY: 0,
  OPTIONAL: 1,
};

const compare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

/**
 * Calcul du prix d'une prestation (FR-202), section 5 de `01-modele-domaine.md`.
 * Arrondi au centime le plus proche à chaque étape, jamais de flottant conservé.
 */
export class PricingRules {
  /**
   * FR-107, côté prix : une règle SURCHARGE s'applique si elle ne porte pas de contrainte,
   * ou si sa contrainte est déclarée sur la prestation. Le catalogue les rend toutes, le
   * filtrage est ici, comme pour les opérations.
   */
  static applicableSurcharges(
    rules: readonly SurchargeRuleInput[],
    declaredConstraintTypeIds: readonly string[],
  ): PricingSurchargeInput[] {
    const declared = new Set(declaredConstraintTypeIds);

    return rules
      .filter(
        (rule) =>
          rule.constraintTypeId === null || declared.has(rule.constraintTypeId),
      )
      .map((rule) => {
        if (rule.label === null) {
          // Une majoration sans libellé ne peut pas figurer sur un devis remis au client.
          throw new InvariantViolationError(
            'SURCHARGE_RULE_INVALID',
            'Majoration sans libellé dans le catalogue.',
          );
        }

        return {
          label: rule.label,
          surchargePercentBp: rule.surchargePercentBp,
          surchargeCents: rule.surchargeCents,
        };
      });
  }

  static price(input: PricingInput): PricedQuote {
    const selected = input.operations.filter((operation) => operation.selected);

    // Règle métier 5 : sans aucune opération retenue, il n'y a rien à chiffrer.
    if (selected.length === 0) {
      throw new InvariantViolationError(
        'NOTHING_TO_QUOTE',
        'Aucune opération sélectionnée : la prestation ne peut pas être chiffrée.',
      );
    }

    // FR-210 : OPERATION d'abord, MANDATORY avant OPTIONAL, puis code alphabétique.
    const operationLines = [...selected]
      .sort((left, right) =>
        left.origin !== right.origin
          ? ORIGIN_RANK[left.origin] - ORIGIN_RANK[right.origin]
          : compare(left.code, right.code),
      )
      .map((operation) => ({
        kind: 'OPERATION' as const,
        label: operation.label,
        durationMinutes: operation.referenceDurationMinutes,
        hourlyRateCents: input.hourlyRateCents,
        amountCents: Math.round(
          (operation.referenceDurationMinutes * input.hourlyRateCents) / 60,
        ),
      }));

    const laborCents = operationLines.reduce(
      (sum, line) => sum + line.amountCents,
      0,
    );

    // FR-210 et ADR 0021 : les majorations suivent les opérations, ordonnées par libellé.
    const surchargeLines = [...input.surcharges]
      .sort((left, right) => compare(left.label, right.label))
      .map((surcharge) => ({
        kind: 'SURCHARGE' as const,
        label: surcharge.label,
        durationMinutes: null,
        hourlyRateCents: null,
        // Un pourcentage porte toujours sur le montant de main d'œuvre, pas sur le
        // cumul courant : deux majorations de 10 % font 20 % du labor, pas 21 %.
        amountCents: PricingRules.surchargeAmount(surcharge, laborCents),
      }));

    const surchargeCents = surchargeLines.reduce(
      (sum, line) => sum + line.amountCents,
      0,
    );
    const subtotalCents = laborCents + surchargeCents;
    const vatCents = Math.round((subtotalCents * input.vatRateBp) / 10000);

    return {
      lines: [...operationLines, ...surchargeLines].map((line, index) => ({
        ...line,
        position: index + 1,
      })),
      laborCents,
      surchargeCents,
      subtotalCents,
      vatRateBp: input.vatRateBp,
      vatCents,
      totalCents: subtotalCents + vatCents,
    };
  }

  private static surchargeAmount(
    surcharge: PricingSurchargeInput,
    laborCents: number,
  ): number {
    if (surcharge.surchargePercentBp !== null) {
      return Math.round((laborCents * surcharge.surchargePercentBp) / 10000);
    }
    if (surcharge.surchargeCents !== null) {
      return surcharge.surchargeCents;
    }

    // Le schéma impose déjà « exactement un des deux » par CHECK SQL : si la ligne
    // arrive ici, le catalogue a été écrit hors migration et le devis serait faux.
    throw new InvariantViolationError(
      'SURCHARGE_RULE_INVALID',
      `Majoration « ${surcharge.label} » sans montant ni pourcentage.`,
    );
  }
}
