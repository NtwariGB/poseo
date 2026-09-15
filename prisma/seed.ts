import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Catalogue de référence (FR-109). Le catalogue ne s'écrit pas par l'API
 * (voir DECISIONS.md) : ce script en est la seule source.
 *
 * Idempotent (FR-113) : rejouable sans doublon et sans faire bouger les identifiants,
 * les tests d'intégration s'appuyant dessus.
 */

const TENANT = {
  code: 'LM-FR',
  name: 'Enseigne LM France',
  countryCode: 'FR',
  vatRateBp: 2000,
  quoteValidityDays: 30,
} as const;

const PRODUCT_TYPES = [
  { code: 'DISHWASHER_BUILTIN', label: 'Lave-vaisselle encastrable' },
  { code: 'WATER_HEATER_ELEC', label: 'Chauffe-eau électrique' },
] as const;

const OPERATIONS = [
  { code: 'INSTALL', label: 'Pose', referenceDurationMinutes: 60 },
  {
    code: 'WATER_CONNECT',
    label: 'Raccordement eau',
    referenceDurationMinutes: 30,
  },
  {
    code: 'ELEC_CONNECT',
    label: 'Raccordement électrique',
    referenceDurationMinutes: 30,
  },
  {
    code: 'OLD_APPLIANCE_REMOVAL',
    label: 'Dépose ancien appareil',
    referenceDurationMinutes: 20,
  },
  {
    code: 'WASTE_DISPOSAL',
    label: 'Évacuation déchets',
    referenceDurationMinutes: 15,
  },
  {
    code: 'FLOOR_PROTECTION',
    label: 'Protection des sols',
    referenceDurationMinutes: 10,
  },
  {
    code: 'CARRY_UPSTAIRS',
    label: 'Portage en étage',
    referenceDurationMinutes: 30,
  },
  {
    code: 'GAS_CONNECT',
    label: 'Raccordement gaz',
    referenceDurationMinutes: 45,
  },
] as const;

const CONSTRAINT_TYPES = [
  { code: 'NO_ELEVATOR', label: 'Étage sans ascenseur' },
  { code: 'OLD_APPLIANCE_REMOVAL', label: 'Appareil existant à évacuer' },
  { code: 'NO_WATER_INLET', label: "Absence d'arrivée d'eau" },
  { code: 'LOAD_BEARING_WALL', label: 'Mur porteur' },
  { code: 'HARD_ACCESS', label: 'Accès difficile' },
] as const;

const ZONES = [
  {
    code: 'NORD',
    label: 'Nord',
    postalCodes: ['59000', '59100', '59200', '59491', '59650'],
    hourlyRateCents: 4500,
  },
  {
    code: 'PDC',
    label: 'Pas-de-Calais',
    postalCodes: ['62000', '62100', '62200'],
    hourlyRateCents: 4200,
  },
] as const;

/** Les taux sont versionnés : on n'écrase jamais, on ajoute un `validFrom`. */
const RATES_VALID_FROM = new Date('2026-01-01T00:00:00.000Z');

interface RuleSeed {
  productType: string;
  kind: 'REQUIRE' | 'OFFER' | 'FORBID' | 'SURCHARGE';
  operation?: string;
  constraintType?: string;
  label?: string;
  surchargePercentBp?: number;
  surchargeCents?: number;
}

const RULES: RuleSeed[] = [
  // Lave-vaisselle encastrable
  { productType: 'DISHWASHER_BUILTIN', kind: 'REQUIRE', operation: 'INSTALL' },
  {
    productType: 'DISHWASHER_BUILTIN',
    kind: 'REQUIRE',
    operation: 'WATER_CONNECT',
  },
  {
    productType: 'DISHWASHER_BUILTIN',
    kind: 'REQUIRE',
    operation: 'ELEC_CONNECT',
  },
  {
    productType: 'DISHWASHER_BUILTIN',
    kind: 'OFFER',
    operation: 'OLD_APPLIANCE_REMOVAL',
  },
  {
    productType: 'DISHWASHER_BUILTIN',
    kind: 'OFFER',
    operation: 'WASTE_DISPOSAL',
  },
  {
    productType: 'DISHWASHER_BUILTIN',
    kind: 'OFFER',
    operation: 'FLOOR_PROTECTION',
  },
  {
    productType: 'DISHWASHER_BUILTIN',
    kind: 'FORBID',
    operation: 'GAS_CONNECT',
  },
  {
    productType: 'DISHWASHER_BUILTIN',
    kind: 'REQUIRE',
    operation: 'CARRY_UPSTAIRS',
    constraintType: 'NO_ELEVATOR',
  },
  {
    productType: 'DISHWASHER_BUILTIN',
    kind: 'SURCHARGE',
    constraintType: 'HARD_ACCESS',
    label: 'Accès difficile',
    surchargePercentBp: 1500,
  },

  // Chauffe-eau électrique
  { productType: 'WATER_HEATER_ELEC', kind: 'REQUIRE', operation: 'INSTALL' },
  {
    productType: 'WATER_HEATER_ELEC',
    kind: 'REQUIRE',
    operation: 'WATER_CONNECT',
  },
  {
    productType: 'WATER_HEATER_ELEC',
    kind: 'REQUIRE',
    operation: 'ELEC_CONNECT',
  },
  {
    productType: 'WATER_HEATER_ELEC',
    kind: 'REQUIRE',
    operation: 'OLD_APPLIANCE_REMOVAL',
  },
  {
    productType: 'WATER_HEATER_ELEC',
    kind: 'OFFER',
    operation: 'WASTE_DISPOSAL',
  },
  {
    productType: 'WATER_HEATER_ELEC',
    kind: 'FORBID',
    operation: 'GAS_CONNECT',
  },
  {
    productType: 'WATER_HEATER_ELEC',
    kind: 'REQUIRE',
    operation: 'CARRY_UPSTAIRS',
    constraintType: 'NO_ELEVATOR',
  },
  {
    productType: 'WATER_HEATER_ELEC',
    kind: 'SURCHARGE',
    constraintType: 'LOAD_BEARING_WALL',
    label: 'Fixation mur porteur',
    surchargeCents: 3000,
  },
];

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL absent : seed impossible.');
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Charge le catalogue de référence. Autonome pour sa connexion (FR-113). */
export async function seed(): Promise<void> {
  const prisma = createClient();

  try {
    const tenant = await prisma.tenant.upsert({
      where: { code: TENANT.code },
      create: { ...TENANT },
      update: {
        name: TENANT.name,
        countryCode: TENANT.countryCode,
        vatRateBp: TENANT.vatRateBp,
        quoteValidityDays: TENANT.quoteValidityDays,
      },
    });
    const tenantId = tenant.id;

    const productTypeIds = new Map<string, string>();
    for (const productType of PRODUCT_TYPES) {
      const row = await prisma.productType.upsert({
        where: { tenantId_code: { tenantId, code: productType.code } },
        create: { tenantId, ...productType },
        update: { label: productType.label },
      });
      productTypeIds.set(row.code, row.id);
    }

    const operationIds = new Map<string, string>();
    for (const operation of OPERATIONS) {
      const row = await prisma.operation.upsert({
        where: { tenantId_code: { tenantId, code: operation.code } },
        create: { tenantId, ...operation },
        update: {
          label: operation.label,
          referenceDurationMinutes: operation.referenceDurationMinutes,
        },
      });
      operationIds.set(row.code, row.id);
    }

    const constraintTypeIds = new Map<string, string>();
    for (const constraintType of CONSTRAINT_TYPES) {
      const row = await prisma.constraintType.upsert({
        where: { tenantId_code: { tenantId, code: constraintType.code } },
        create: { tenantId, ...constraintType },
        update: { label: constraintType.label },
      });
      constraintTypeIds.set(row.code, row.id);
    }

    for (const zone of ZONES) {
      const row = await prisma.zone.upsert({
        where: { tenantId_code: { tenantId, code: zone.code } },
        create: { tenantId, code: zone.code, label: zone.label },
        update: { label: zone.label },
      });

      for (const postalCode of zone.postalCodes) {
        await prisma.zonePostalCode.upsert({
          where: { tenantId_postalCode: { tenantId, postalCode } },
          create: { tenantId, zoneId: row.id, postalCode },
          update: { zoneId: row.id },
        });
      }

      await prisma.laborRate.upsert({
        where: {
          zoneId_validFrom: { zoneId: row.id, validFrom: RATES_VALID_FROM },
        },
        create: {
          tenantId,
          zoneId: row.id,
          hourlyRateCents: zone.hourlyRateCents,
          validFrom: RATES_VALID_FROM,
        },
        update: { hourlyRateCents: zone.hourlyRateCents },
      });
    }

    // `CompositionRule` n'a pas de contrainte d'unicité (DECISIONS.md, arbitrage C2) :
    // l'idempotence se fait donc en cherchant le tuple discriminant avant de créer.
    for (const rule of RULES) {
      const productTypeId = productTypeIds.get(rule.productType);
      if (!productTypeId) {
        throw new Error(`Type de produit ${rule.productType} absent du seed.`);
      }

      const operationId = rule.operation
        ? (operationIds.get(rule.operation) ?? null)
        : null;
      if (rule.operation && !operationId) {
        throw new Error(`Opération ${rule.operation} absente du seed.`);
      }

      const constraintTypeId = rule.constraintType
        ? (constraintTypeIds.get(rule.constraintType) ?? null)
        : null;
      if (rule.constraintType && !constraintTypeId) {
        throw new Error(`Contrainte ${rule.constraintType} absente du seed.`);
      }

      const identity = {
        tenantId,
        productTypeId,
        constraintTypeId,
        kind: rule.kind,
        operationId,
      };

      const existing = await prisma.compositionRule.findFirst({
        where: identity,
        select: { id: true },
      });

      if (existing) {
        await prisma.compositionRule.update({
          where: { id: existing.id },
          data: {
            label: rule.label ?? null,
            surchargePercentBp: rule.surchargePercentBp ?? null,
            surchargeCents: rule.surchargeCents ?? null,
          },
        });
      } else {
        await prisma.compositionRule.create({
          data: {
            ...identity,
            label: rule.label ?? null,
            surchargePercentBp: rule.surchargePercentBp ?? null,
            surchargeCents: rule.surchargeCents ?? null,
          },
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Exécution directe par `npm run seed`. L'import du module (tests) ne déclenche rien.
if (require.main === module) {
  seed()
    .then(() => console.log(`Catalogue ${TENANT.code} chargé.`))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
