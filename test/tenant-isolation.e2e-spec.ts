import 'dotenv/config';
import { TestingModule, Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { AppModule } from '../src/app.module';
import { CompositionRepository } from '../src/service/composition.repository';

// Test de non-régression du filtrage `tenantId` sur les écritures de la prestation
// (revue du lot 1, écart n° 1). Il attaque le repository directement, sans passer par
// le service : c'est justement le contrôle que le service faisait à sa place.
// Client Prisma propre au test, indépendant de celui de l'application.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const OWNER_TENANT_CODE = 'TEST-ISO-OWNER';
const INTRUDER_TENANT_CODE = 'TEST-ISO-INTRUDER';

describe('Isolation multi-tenant des écritures de prestation', () => {
  let moduleRef: TestingModule;
  let repository: CompositionRepository;

  let ownerTenantId: string;
  let intruderTenantId: string;
  let compositionId: string;
  let mandatoryOperationId: string;
  let optionalOperationId: string;
  let constraintTypeId: string;

  /** État complet des lignes écrites par la prestation, pour prouver qu'elles ne bougent pas. */
  const snapshot = async () => {
    const composition = await prisma.serviceComposition.findUniqueOrThrow({
      where: { id: compositionId },
      select: { id: true, tenantId: true, status: true, updatedAt: true },
    });
    const operations = await prisma.serviceOperation.findMany({
      where: { compositionId },
      select: { operationId: true, origin: true, selected: true },
      orderBy: { operationId: 'asc' },
    });
    const constraints = await prisma.serviceConstraint.findMany({
      where: { compositionId },
      select: { constraintTypeId: true },
      orderBy: { constraintTypeId: 'asc' },
    });

    return { composition, operations, constraints };
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();
    repository = moduleRef.get(CompositionRepository, { strict: false });

    const tenantData = {
      name: 'Enseigne de test (isolation)',
      countryCode: 'FR',
      vatRateBp: 2000,
      quoteValidityDays: 30,
    };
    const owner = await prisma.tenant.create({
      data: { ...tenantData, code: OWNER_TENANT_CODE },
    });
    ownerTenantId = owner.id;
    const intruder = await prisma.tenant.create({
      data: { ...tenantData, code: INTRUDER_TENANT_CODE },
    });
    intruderTenantId = intruder.id;

    const productType = await prisma.productType.create({
      data: { tenantId: ownerTenantId, code: 'ISO_PRODUCT', label: 'Produit de test' },
    });
    const mandatory = await prisma.operation.create({
      data: {
        tenantId: ownerTenantId,
        code: 'ISO_INSTALL',
        label: 'Pose de test',
        referenceDurationMinutes: 60,
      },
    });
    mandatoryOperationId = mandatory.id;
    const optional = await prisma.operation.create({
      data: {
        tenantId: ownerTenantId,
        code: 'ISO_OPTION',
        label: 'Option de test',
        referenceDurationMinutes: 20,
      },
    });
    optionalOperationId = optional.id;
    const constraintType = await prisma.constraintType.create({
      data: { tenantId: ownerTenantId, code: 'ISO_CONSTRAINT', label: 'Contrainte de test' },
    });
    constraintTypeId = constraintType.id;

    const record = await repository.create({
      tenantId: ownerTenantId,
      productTypeId: productType.id,
      productRef: 'ISO-1',
      addressLine: '1 rue du test',
      postalCode: '59000',
      city: 'Lille',
      operations: [
        { operationId: mandatoryOperationId, origin: 'MANDATORY', selected: true },
        { operationId: optionalOperationId, origin: 'OPTIONAL', selected: true },
      ],
    });
    compositionId = record.id;
  }, 60_000);

  afterAll(async () => {
    await moduleRef?.close();

    const tenantIds = [ownerTenantId, intruderTenantId].filter(Boolean);
    const compositionIds = (
      await prisma.serviceComposition.findMany({
        where: { tenantId: { in: tenantIds } },
        select: { id: true },
      })
    ).map((composition) => composition.id);

    await prisma.serviceOperation.deleteMany({ where: { compositionId: { in: compositionIds } } });
    await prisma.serviceConstraint.deleteMany({ where: { compositionId: { in: compositionIds } } });
    await prisma.serviceComposition.deleteMany({ where: { id: { in: compositionIds } } });
    await prisma.constraintType.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.operation.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.productType.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });

    await prisma.$disconnect();
  }, 60_000);

  it('replaceConstraintsAndOperations sous un autre tenant ne touche aucune ligne', async () => {
    const before = await snapshot();

    const result = await repository.replaceConstraintsAndOperations(
      intruderTenantId,
      compositionId,
      [constraintTypeId],
      [{ operationId: mandatoryOperationId, origin: 'OPTIONAL', selected: false }],
    );

    expect(result).toBeNull();
    expect(await snapshot()).toEqual(before);
  });

  it('updateOperationSelection sous un autre tenant ne touche aucune ligne', async () => {
    const before = await snapshot();

    const result = await repository.updateOperationSelection(
      intruderTenantId,
      compositionId,
      optionalOperationId,
      false,
    );

    expect(result).toBeNull();
    expect(await snapshot()).toEqual(before);
  });

  // Témoin : sans lui, les deux tests ci-dessus passeraient même si plus rien n'écrivait.
  it('les mêmes écritures sous le tenant propriétaire aboutissent', async () => {
    const replaced = await repository.replaceConstraintsAndOperations(
      ownerTenantId,
      compositionId,
      [constraintTypeId],
      [
        { operationId: mandatoryOperationId, origin: 'MANDATORY', selected: true },
        { operationId: optionalOperationId, origin: 'OPTIONAL', selected: true },
      ],
    );
    expect(replaced?.constraints.map((constraint) => constraint.id)).toEqual([constraintTypeId]);

    const updated = await repository.updateOperationSelection(
      ownerTenantId,
      compositionId,
      optionalOperationId,
      false,
    );
    expect(
      updated?.operations.find((operation) => operation.operationId === optionalOperationId)
        ?.selected,
    ).toBe(false);
  });
});
