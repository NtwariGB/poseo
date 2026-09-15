import { InvariantViolationError } from '../common/errors/invariant-violation-error';
import {
  PricingOperationInput,
  PricingSurchargeInput,
  PricingRules,
  SurchargeRuleInput,
} from './pricing.rules';

const operation = (
  overrides: Partial<PricingOperationInput> & { code: string },
): PricingOperationInput => ({
  label: `Libellé ${overrides.code}`,
  referenceDurationMinutes: 60,
  origin: 'MANDATORY',
  selected: true,
  ...overrides,
});

const percent = (
  label: string,
  surchargePercentBp: number,
): PricingSurchargeInput => ({
  label,
  surchargePercentBp,
  surchargeCents: null,
});

const fixed = (label: string, surchargeCents: number): PricingSurchargeInput => ({
  label,
  surchargePercentBp: null,
  surchargeCents,
});

const price = (
  operations: PricingOperationInput[],
  surcharges: PricingSurchargeInput[] = [],
  hourlyRateCents = 4500,
  vatRateBp = 2000,
) =>
  PricingRules.price({ operations, surcharges, hourlyRateCents, vatRateBp });

describe('PricingRules', () => {
  describe('lignes opération', () => {
    it('chiffre une ligne à durée × taux / 60', () => {
      const result = price([
        operation({ code: 'INSTALL', referenceDurationMinutes: 60 }),
      ]);

      expect(result.lines).toEqual([
        {
          position: 1,
          kind: 'OPERATION',
          label: 'Libellé INSTALL',
          durationMinutes: 60,
          hourlyRateCents: 4500,
          amountCents: 4500,
        },
      ]);
      expect(result.laborCents).toBe(4500);
    });

    it('arrondit au centime le plus proche, y compris une demie qui monte', () => {
      // 15 × 4500 / 60 = 1125 (exact) ; 10 × 4500 / 60 = 750 (exact) ;
      // 7 × 4500 / 60 = 525 (exact) ; 1 × 4510 / 60 = 75,1666… → 75.
      const exact = price([
        operation({ code: 'A', referenceDurationMinutes: 15 }),
        operation({ code: 'B', referenceDurationMinutes: 10 }),
      ]);
      expect(exact.lines.map((line) => line.amountCents)).toEqual([1125, 750]);

      const rounded = price(
        [operation({ code: 'A', referenceDurationMinutes: 1 })],
        [],
        4510,
      );
      expect(rounded.lines[0].amountCents).toBe(75);

      // 1 × 4530 / 60 = 75,5 → 76 : la demie monte.
      const half = price(
        [operation({ code: 'A', referenceDurationMinutes: 1 })],
        [],
        4530,
      );
      expect(half.lines[0].amountCents).toBe(76);
    });

    it('ignore les opérations non sélectionnées', () => {
      const result = price([
        operation({ code: 'INSTALL' }),
        operation({ code: 'EXTRA', origin: 'OPTIONAL', selected: false }),
      ]);

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].label).toBe('Libellé INSTALL');
    });

    it('ordonne MANDATORY avant OPTIONAL, puis par code, et numérote de 1 à n (FR-210)', () => {
      const result = price([
        operation({ code: 'ZZ_OPTION', origin: 'OPTIONAL' }),
        operation({ code: 'WATER_CONNECT' }),
        operation({ code: 'AA_OPTION', origin: 'OPTIONAL' }),
        operation({ code: 'INSTALL' }),
      ]);

      expect(result.lines.map((line) => line.label)).toEqual([
        'Libellé INSTALL',
        'Libellé WATER_CONNECT',
        'Libellé AA_OPTION',
        'Libellé ZZ_OPTION',
      ]);
      expect(result.lines.map((line) => line.position)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('majorations', () => {
    it('applique un pourcentage sur le montant de main d œuvre, arrondi', () => {
      // labor = 4500 ; 1500 bp → 675.
      const result = price(
        [operation({ code: 'INSTALL' })],
        [percent('Accès difficile', 1500)],
      );

      expect(result.lines[1]).toEqual({
        position: 2,
        kind: 'SURCHARGE',
        label: 'Accès difficile',
        durationMinutes: null,
        hourlyRateCents: null,
        amountCents: 675,
      });
      expect(result.surchargeCents).toBe(675);
      expect(result.subtotalCents).toBe(5175);
    });

    it('applique un montant fixe tel quel', () => {
      const result = price(
        [operation({ code: 'INSTALL' })],
        [fixed('Fixation mur porteur', 3000)],
      );

      expect(result.lines[1].amountCents).toBe(3000);
      expect(result.surchargeCents).toBe(3000);
      expect(result.subtotalCents).toBe(7500);
    });

    it('cumule plusieurs majorations, chaque pourcentage portant sur le labor', () => {
      // labor = 4500 ; 1000 bp → 450 ; 500 bp → 225 ; fixe 3000. Total 3675.
      const result = price(
        [operation({ code: 'INSTALL' })],
        [
          percent('B pourcentage', 1000),
          fixed('C fixe', 3000),
          percent('A pourcentage', 500),
        ],
      );

      // Les majorations suivent les opérations, ordonnées par libellé (ADR 0021).
      expect(result.lines.map((line) => line.label)).toEqual([
        'Libellé INSTALL',
        'A pourcentage',
        'B pourcentage',
        'C fixe',
      ]);
      expect(result.lines.map((line) => line.amountCents)).toEqual([
        4500, 225, 450, 3000,
      ]);
      expect(result.lines.map((line) => line.position)).toEqual([1, 2, 3, 4]);
      expect(result.surchargeCents).toBe(3675);
      expect(result.subtotalCents).toBe(8175);
    });

    it('refuse une majoration sans montant ni pourcentage', () => {
      expect(() =>
        price(
          [operation({ code: 'INSTALL' })],
          [{ label: 'Vide', surchargePercentBp: null, surchargeCents: null }],
        ),
      ).toThrow(
        expect.objectContaining({ code: 'SURCHARGE_RULE_INVALID' }) as Error,
      );
    });
  });

  describe('totaux', () => {
    it('dérive sous-total, TVA arrondie et total', () => {
      // labor 4500 + 675 = 5175 ; TVA 2000 bp → 1035 ; total 6210.
      const result = price(
        [operation({ code: 'INSTALL' })],
        [percent('Accès difficile', 1500)],
      );

      expect(result.subtotalCents).toBe(5175);
      expect(result.vatRateBp).toBe(2000);
      expect(result.vatCents).toBe(1035);
      expect(result.totalCents).toBe(6210);
    });

    it('arrondit la TVA au centime le plus proche', () => {
      // 1 × 4510 / 60 = 75 ; TVA 2050 bp → 15,375 → 15.
      const result = price(
        [operation({ code: 'A', referenceDurationMinutes: 1 })],
        [],
        4510,
        2050,
      );

      expect(result.subtotalCents).toBe(75);
      expect(result.vatCents).toBe(15);
      expect(result.totalCents).toBe(90);
    });
  });

  describe('règles applicables', () => {
    const rule = (
      overrides: Partial<SurchargeRuleInput>,
    ): SurchargeRuleInput => ({
      label: 'Majoration',
      constraintTypeId: null,
      surchargePercentBp: 1000,
      surchargeCents: null,
      ...overrides,
    });

    it('retient les règles sans contrainte et celles dont la contrainte est déclarée', () => {
      const applicable = PricingRules.applicableSurcharges(
        [
          rule({ label: 'Sans contrainte' }),
          rule({ label: 'Déclarée', constraintTypeId: 'c-1' }),
          rule({ label: 'Non déclarée', constraintTypeId: 'c-2' }),
        ],
        ['c-1'],
      );

      expect(applicable.map((surcharge) => surcharge.label)).toEqual([
        'Sans contrainte',
        'Déclarée',
      ]);
    });

    it('refuse une majoration sans libellé', () => {
      expect(() =>
        PricingRules.applicableSurcharges([rule({ label: null })], []),
      ).toThrow(
        expect.objectContaining({ code: 'SURCHARGE_RULE_INVALID' }) as Error,
      );
    });
  });

  it('refuse une prestation sans aucune opération sélectionnée (NOTHING_TO_QUOTE)', () => {
    const empty = () =>
      price([operation({ code: 'EXTRA', origin: 'OPTIONAL', selected: false })]);

    expect(empty).toThrow(InvariantViolationError);
    expect(empty).toThrow(
      expect.objectContaining({
        code: 'NOTHING_TO_QUOTE',
        httpStatus: 422,
      }) as Error,
    );
  });
});
