import { ConflictError } from '../common/errors/conflict-error';

// Le moteur est pur : il ne connaît ni Prisma ni NestJS. Il redéclare donc les
// énumérations du modèle sous forme d'unions de chaînes ; la conversion depuis les
// types du client généré se fait dans le repository, et le compilateur vérifie
// la compatibilité à l'appel.

export type CompositionRuleKindName =
  'REQUIRE' | 'OFFER' | 'FORBID' | 'SURCHARGE';

export type OperationOriginName = 'MANDATORY' | 'OPTIONAL';

export type CompositionStatusName = 'DRAFT' | 'QUOTED' | 'ACCEPTED';

/** Règle de composition d'un type de produit, réduite à ce qui décide de la composition. */
export interface CompositionRuleInput {
  kind: CompositionRuleKindName;
  operationId: string | null;
  constraintTypeId: string | null;
}

/** Opération retenue sur une prestation : état courant en entrée, état résolu en sortie. */
export interface CompositionOperationState {
  operationId: string;
  origin: OperationOriginName;
  selected: boolean;
}

export interface ResolveCompositionInput {
  /** Toutes les règles du type de produit ; le filtrage par contrainte est fait ici (FR-107). */
  rules: readonly CompositionRuleInput[];
  /** Contraintes déclarées sur la prestation. */
  declaredConstraintTypeIds: readonly string[];
  /** Opérations déjà retenues, pour conserver les sélections encore valides (FR-102). */
  currentOperations: readonly CompositionOperationState[];
  /** Codes métier des opérations du tenant, pour libeller les avertissements. */
  operationCodesById: ReadonlyMap<string, string>;
}

export interface ResolveCompositionResult {
  /** Opérations résolues, triées par code métier. */
  operations: CompositionOperationState[];
  /** Avertissements d'état : incohérences du catalogue, recalculables à toute lecture. */
  catalogWarnings: string[];
  /** Avertissements de différence : opérations cochées perdues par cette recomposition. */
  removalWarnings: string[];
}

/**
 * Moteur de composition (FR-106). Applique les règles du catalogue aux contraintes
 * déclarées et rend la liste des opérations retenues.
 */
export class CompositionRules {
  /**
   * FR-110 : la prestation n'est modifiable qu'en brouillon. Une fois un devis émis,
   * toute modification produit un nouveau devis, pas une mutation de la prestation.
   */
  static assertDraft(status: CompositionStatusName): void {
    if (status !== 'DRAFT') {
      throw new ConflictError(
        'COMPOSITION_LOCKED',
        `Prestation en statut ${status} : modification impossible.`,
      );
    }
  }

  /** Fusionne des groupes d'avertissements : dédoublonnés et triés, pour une sortie stable. */
  static mergeWarnings(...groups: readonly (readonly string[])[]): string[] {
    return [...new Set(groups.flat())].sort();
  }

  static resolve(input: ResolveCompositionInput): ResolveCompositionResult {
    const declared = new Set(input.declaredConstraintTypeIds);
    const codeOf = (operationId: string): string =>
      input.operationCodesById.get(operationId) ?? operationId;

    // FR-107 : règles applicables = celles sans contrainte, plus celles dont la
    // contrainte est déclarée sur la prestation.
    const applicable = input.rules.filter(
      (rule) =>
        rule.constraintTypeId === null || declared.has(rule.constraintTypeId),
    );

    const required = new Set<string>();
    const offered = new Set<string>();
    const forbidden = new Set<string>();

    for (const rule of applicable) {
      // SURCHARGE ne porte pas d'opération : les majorations relèvent du prix (lot 2).
      if (rule.operationId === null) continue;

      if (rule.kind === 'REQUIRE') required.add(rule.operationId);
      else if (rule.kind === 'OFFER') offered.add(rule.operationId);
      else if (rule.kind === 'FORBID') forbidden.add(rule.operationId);
    }

    // FORBID > REQUIRE > OFFER. Une opération à la fois interdite et requise est
    // interdite, et c'est une incohérence de catalogue à signaler.
    const catalogWarnings = [...required]
      .filter((operationId) => forbidden.has(operationId))
      .map((operationId) => `CATALOG_INCONSISTENT:${codeOf(operationId)}`);

    const previousById = new Map(
      input.currentOperations.map((operation) => [
        operation.operationId,
        operation,
      ]),
    );

    const operations: CompositionOperationState[] = [];
    for (const operationId of new Set([...required, ...offered])) {
      if (forbidden.has(operationId)) continue;

      const mandatory = required.has(operationId);
      operations.push({
        operationId,
        origin: mandatory ? 'MANDATORY' : 'OPTIONAL',
        // Une obligatoire est toujours retenue ; une optionnelle garde le choix du vendeur.
        selected: mandatory
          ? true
          : (previousById.get(operationId)?.selected ?? false),
      });
    }

    operations.sort((left, right) =>
      codeOf(left.operationId) < codeOf(right.operationId) ? -1 : 1,
    );

    const kept = new Set(operations.map((operation) => operation.operationId));
    const removalWarnings = input.currentOperations
      .filter(
        (operation) => operation.selected && !kept.has(operation.operationId),
      )
      .map((operation) => `OPERATION_REMOVED:${codeOf(operation.operationId)}`);

    return {
      operations,
      catalogWarnings: CompositionRules.mergeWarnings(catalogWarnings),
      removalWarnings: CompositionRules.mergeWarnings(removalWarnings),
    };
  }
}

/** Avertissement porté par la représentation d'une prestation (FR-108). */
export const ZONE_NOT_COVERED = 'ZONE_NOT_COVERED';
