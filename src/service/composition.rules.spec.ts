import { ConflictError } from '../common/errors/conflict-error';
import {
  CompositionOperationState,
  CompositionRuleInput,
  CompositionRules,
} from './composition.rules';

// Catalogue minimal : un identifiant lisible par opération, et son code métier.
const CODES = new Map<string, string>([
  ['op-install', 'INSTALL'],
  ['op-water', 'WATER_CONNECT'],
  ['op-waste', 'WASTE_DISPOSAL'],
  ['op-carry', 'CARRY_UPSTAIRS'],
  ['op-gas', 'GAS_CONNECT'],
]);

const CONSTRAINT_NO_ELEVATOR = 'ct-no-elevator';
const CONSTRAINT_HARD_ACCESS = 'ct-hard-access';

const rule = (
  kind: CompositionRuleInput['kind'],
  operationId: string | null,
  constraintTypeId: string | null = null,
): CompositionRuleInput => ({ kind, operationId, constraintTypeId });

const resolve = (
  rules: CompositionRuleInput[],
  declaredConstraintTypeIds: string[] = [],
  currentOperations: CompositionOperationState[] = [],
) =>
  CompositionRules.resolve({
    rules,
    declaredConstraintTypeIds,
    currentOperations,
    operationCodesById: CODES,
  });

describe('CompositionRules.resolve', () => {
  describe('FR-107 : sélection des règles applicables', () => {
    it('retient les règles sans contrainte', () => {
      const result = resolve([rule('REQUIRE', 'op-install')]);

      expect(result.operations).toEqual([
        { operationId: 'op-install', origin: 'MANDATORY', selected: true },
      ]);
    });

    it('ignore une règle dont la contrainte n est pas déclarée', () => {
      const result = resolve([
        rule('REQUIRE', 'op-install'),
        rule('REQUIRE', 'op-carry', CONSTRAINT_NO_ELEVATOR),
      ]);

      expect(
        result.operations.map((operation) => operation.operationId),
      ).toEqual(['op-install']);
    });

    it('applique une règle dont la contrainte est déclarée', () => {
      const result = resolve(
        [
          rule('REQUIRE', 'op-install'),
          rule('REQUIRE', 'op-carry', CONSTRAINT_NO_ELEVATOR),
        ],
        [CONSTRAINT_NO_ELEVATOR],
      );

      expect(result.operations).toEqual([
        { operationId: 'op-carry', origin: 'MANDATORY', selected: true },
        { operationId: 'op-install', origin: 'MANDATORY', selected: true },
      ]);
    });

    it('ignore une contrainte déclarée qui ne déclenche aucune règle', () => {
      const result = resolve(
        [rule('REQUIRE', 'op-install')],
        [CONSTRAINT_HARD_ACCESS],
      );

      expect(
        result.operations.map((operation) => operation.operationId),
      ).toEqual(['op-install']);
    });
  });

  describe('FR-107 : ordre de résolution FORBID > REQUIRE > OFFER', () => {
    it('REQUIRE rend l opération obligatoire et cochée', () => {
      const result = resolve([rule('REQUIRE', 'op-install')]);

      expect(result.operations[0]).toEqual({
        operationId: 'op-install',
        origin: 'MANDATORY',
        selected: true,
      });
    });

    it('OFFER rend l opération optionnelle et décochée', () => {
      const result = resolve([rule('OFFER', 'op-waste')]);

      expect(result.operations[0]).toEqual({
        operationId: 'op-waste',
        origin: 'OPTIONAL',
        selected: false,
      });
    });

    it('REQUIRE l emporte sur OFFER pour la même opération', () => {
      const result = resolve([
        rule('OFFER', 'op-waste'),
        rule('REQUIRE', 'op-waste'),
      ]);

      expect(result.operations).toEqual([
        { operationId: 'op-waste', origin: 'MANDATORY', selected: true },
      ]);
    });

    it('FORBID retire une opération proposée, sans avertissement d incohérence', () => {
      const result = resolve([
        rule('OFFER', 'op-gas'),
        rule('FORBID', 'op-gas'),
      ]);

      expect(result.operations).toEqual([]);
      expect(result.catalogWarnings).toEqual([]);
    });

    it('FORBID l emporte sur REQUIRE et signale l incohérence de catalogue', () => {
      const result = resolve([
        rule('REQUIRE', 'op-install'),
        rule('REQUIRE', 'op-gas'),
        rule('FORBID', 'op-gas'),
      ]);

      expect(
        result.operations.map((operation) => operation.operationId),
      ).toEqual(['op-install']);
      expect(result.catalogWarnings).toEqual([
        'CATALOG_INCONSISTENT:GAS_CONNECT',
      ]);
    });

    it('FORBID porté par une contrainte ne s applique que si elle est déclarée', () => {
      const rules = [
        rule('OFFER', 'op-waste'),
        rule('FORBID', 'op-waste', CONSTRAINT_HARD_ACCESS),
      ];

      expect(resolve(rules).operations.map((op) => op.operationId)).toEqual([
        'op-waste',
      ]);
      expect(resolve(rules, [CONSTRAINT_HARD_ACCESS]).operations).toEqual([]);
    });
  });

  describe('FR-102 : conservation des sélections', () => {
    it('conserve une optionnelle cochée', () => {
      const result = resolve(
        [rule('OFFER', 'op-waste')],
        [],
        [{ operationId: 'op-waste', origin: 'OPTIONAL', selected: true }],
      );

      expect(result.operations).toEqual([
        { operationId: 'op-waste', origin: 'OPTIONAL', selected: true },
      ]);
      expect(result.differenceWarnings).toEqual([]);
    });

    it('conserve une optionnelle décochée', () => {
      const result = resolve(
        [rule('OFFER', 'op-waste')],
        [],
        [{ operationId: 'op-waste', origin: 'OPTIONAL', selected: false }],
      );

      expect(result.operations[0].selected).toBe(false);
    });

    it('force à cochée une optionnelle décochée devenue obligatoire', () => {
      const result = resolve(
        [
          rule('OFFER', 'op-waste'),
          rule('REQUIRE', 'op-waste', CONSTRAINT_NO_ELEVATOR),
        ],
        [CONSTRAINT_NO_ELEVATOR],
        [{ operationId: 'op-waste', origin: 'OPTIONAL', selected: false }],
      );

      expect(result.operations).toEqual([
        { operationId: 'op-waste', origin: 'MANDATORY', selected: true },
      ]);
    });

    it('avertit quand une opération cochée disparaît de la composition', () => {
      const result = resolve(
        [
          rule('OFFER', 'op-waste'),
          rule('FORBID', 'op-waste', CONSTRAINT_HARD_ACCESS),
        ],
        [CONSTRAINT_HARD_ACCESS],
        [{ operationId: 'op-waste', origin: 'OPTIONAL', selected: true }],
      );

      expect(result.operations).toEqual([]);
      expect(result.differenceWarnings).toEqual([
        'OPERATION_REMOVED:WASTE_DISPOSAL',
      ]);
    });

    it('n avertit pas quand l opération qui disparaît n était pas cochée', () => {
      const result = resolve(
        [
          rule('OFFER', 'op-waste'),
          rule('FORBID', 'op-waste', CONSTRAINT_HARD_ACCESS),
        ],
        [CONSTRAINT_HARD_ACCESS],
        [{ operationId: 'op-waste', origin: 'OPTIONAL', selected: false }],
      );

      expect(result.differenceWarnings).toEqual([]);
    });

    it('décoche et avertit quand une obligatoire devient optionnelle', () => {
      const result = resolve(
        [
          rule('OFFER', 'op-waste'),
          rule('REQUIRE', 'op-waste', CONSTRAINT_NO_ELEVATOR),
        ],
        [],
        [{ operationId: 'op-waste', origin: 'MANDATORY', selected: true }],
      );

      expect(result.operations).toEqual([
        { operationId: 'op-waste', origin: 'OPTIONAL', selected: false },
      ]);
      expect(result.differenceWarnings).toEqual([
        'OPERATION_NOW_OPTIONAL:WASTE_DISPOSAL',
      ]);
    });

    it('avertit quand une obligatoire disparaît avec la contrainte qui la déclenchait', () => {
      const result = resolve(
        [rule('REQUIRE', 'op-carry', CONSTRAINT_NO_ELEVATOR)],
        [],
        [{ operationId: 'op-carry', origin: 'MANDATORY', selected: true }],
      );

      expect(result.operations).toEqual([]);
      expect(result.differenceWarnings).toEqual([
        'OPERATION_REMOVED:CARRY_UPSTAIRS',
      ]);
    });
  });

  describe('cas limites', () => {
    it('rend une composition vide sans règle', () => {
      const result = resolve([]);

      expect(result).toEqual({
        operations: [],
        catalogWarnings: [],
        differenceWarnings: [],
      });
    });

    it('ignore les règles SURCHARGE, qui ne portent pas d opération (prix au lot 2)', () => {
      const result = resolve(
        [
          rule('REQUIRE', 'op-install'),
          rule('SURCHARGE', null, CONSTRAINT_HARD_ACCESS),
        ],
        [CONSTRAINT_HARD_ACCESS],
      );

      expect(
        result.operations.map((operation) => operation.operationId),
      ).toEqual(['op-install']);
    });

    it('trie les opérations par code métier, pas par identifiant', () => {
      const result = resolve([
        rule('REQUIRE', 'op-water'),
        rule('REQUIRE', 'op-install'),
        rule('OFFER', 'op-carry'),
      ]);

      expect(
        result.operations.map((operation) => operation.operationId),
      ).toEqual(['op-carry', 'op-install', 'op-water']);
    });

    it('dédoublonne les règles répétées', () => {
      const result = resolve([
        rule('REQUIRE', 'op-install'),
        rule('REQUIRE', 'op-install'),
      ]);

      expect(result.operations).toHaveLength(1);
    });

    it('retombe sur l identifiant quand le code de l opération est inconnu', () => {
      const result = CompositionRules.resolve({
        rules: [rule('REQUIRE', 'op-inconnue'), rule('FORBID', 'op-inconnue')],
        declaredConstraintTypeIds: [],
        currentOperations: [],
        operationCodesById: new Map(),
      });

      expect(result.catalogWarnings).toEqual([
        'CATALOG_INCONSISTENT:op-inconnue',
      ]);
    });

    it('dédoublonne et trie les avertissements', () => {
      expect(CompositionRules.mergeWarnings(['B', 'A'], ['A'], ['C'])).toEqual([
        'A',
        'B',
        'C',
      ]);
    });
  });
});

describe('CompositionRules.assertDraft (FR-110)', () => {
  it('laisse passer une prestation en brouillon', () => {
    expect(() => CompositionRules.assertDraft('DRAFT')).not.toThrow();
  });

  it('refuse une prestation déjà devisée', () => {
    expect(() => CompositionRules.assertDraft('QUOTED')).toThrow(ConflictError);
  });

  it('refuse une prestation acceptée', () => {
    expect(() => CompositionRules.assertDraft('ACCEPTED')).toThrow(
      ConflictError,
    );
  });

  it('porte le code COMPOSITION_LOCKED et le statut 409', () => {
    let caught: ConflictError | undefined;
    try {
      CompositionRules.assertDraft('ACCEPTED');
    } catch (error) {
      caught = error as ConflictError;
    }

    expect(caught?.code).toBe('COMPOSITION_LOCKED');
    expect(caught?.httpStatus).toBe(409);
  });
});
