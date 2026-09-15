import 'dotenv/config';
import { TestingModule, Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { AppModule } from '../src/app.module';
import { CompositionRepository } from '../src/service/composition.repository';
import { QuoteRepository } from '../src/quote/quote.repository';

// Test de non-régression du filtrage `tenantId` sur les écritures de la prestation
// (revue du lot 1, écart n° 1) et du devis (revue du lot 2, écart n° 6). Il attaque les
// repositories directement, sans passer par le service : c'est justement le contrôle que
// le service faisait à leur place.
// Client Prisma propre au test, indépendant de celui de l'application.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const OWNER_TENANT_CODE = 'TEST-ISO-OWNER';
const INTRUDER_TENANT_CODE = 'TEST-ISO-INTRUDER';

describe('Isolation multi-tenant des écritures de prestation et de devis', () => {
  let moduleRef: TestingModule;
  let repository: CompositionRepository;
  let quotes: QuoteRepository;

  let ownerTenantId: string;
  let intruderTenantId: string;
  let compositionId: string;
  let mandatoryOperationId: string;
  let optionalOperationId: string;
  let constraintTypeId: string;
  let quoteId: string;

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

  /** État des devis du tenant propriétaire, pour prouver qu'aucun ne bouge. */
  const quoteSnapshot = async () =>
    prisma.quote.findMany({
      where: { compositionId },
      select: { id: true, tenantId: true, number: true, status: true, acceptedAt: true },
      orderBy: { number: 'asc' },
    });

  /** Devis figé du tenant propriétaire, écrit par le repository lui-même. */
  const insertQuote = (number: string) =>
    quotes.transaction((tx) =>
      quotes.insert(tx, {
        tenantId: ownerTenantId,
        compositionId,
        number,
        issuedAt: new Date('2026-09-15T10:00:00.000Z'),
        validUntil: new Date('2026-10-15T10:00:00.000Z'),
        zoneCode: 'ISO_ZONE',
        hourlyRateCents: 4000,
        productTypeLabel: 'Produit de test',
        laborCents: 4000,
        surchargeCents: 0,
        subtotalCents: 4000,
        vatRateBp: 2000,
        vatCents: 800,
        totalCents: 4800,
        lines: [
          {
            position: 1,
            kind: 'OPERATION',
            label: 'Pose de test',
            durationMinutes: 60,
            hourlyRateCents: 4000,
            amountCents: 4000,
          },
        ],
      }),
    );

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();
    repository = moduleRef.get(CompositionRepository, { strict: false });
    quotes = moduleRef.get(QuoteRepository, { strict: false });

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

    // Devis ISSUED du tenant propriétaire : cible des écritures du module devis.
    quoteId = (await insertQuote('Q-ISO-000001')).id;
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

    const quoteIds = (
      await prisma.quote.findMany({
        where: { tenantId: { in: tenantIds } },
        select: { id: true },
      })
    ).map((quote) => quote.id);
    await prisma.quoteLine.deleteMany({ where: { quoteId: { in: quoteIds } } });
    await prisma.quote.deleteMany({ where: { id: { in: quoteIds } } });
    await prisma.quoteCounter.deleteMany({ where: { tenantId: { in: tenantIds } } });

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

  // Écritures ajoutées par le lot 2 (revue du lot 2, écart n° 6). `setStatus` appartient au
  // repository de la prestation mais n'est appelé que par le module devis ; les écritures de
  // `QuoteRepository` sont toutes filtrées sur le tenant.

  it('setStatus sous un autre tenant ne touche aucune ligne', async () => {
    const before = await snapshot();

    const touched = await quotes.transaction((tx) =>
      repository.setStatus(tx, intruderTenantId, compositionId, 'ACCEPTED', new Date()),
    );

    expect(touched).toBe(false);
    expect(await snapshot()).toEqual(before);
  });

  it('supersedeIssued sous un autre tenant ne touche aucun devis', async () => {
    const before = await quoteSnapshot();

    const superseded = await quotes.transaction((tx) =>
      quotes.supersedeIssued(tx, intruderTenantId, compositionId),
    );

    expect(superseded).toBeNull();
    expect(await quoteSnapshot()).toEqual(before);
  });

  it('acceptIssued sous un autre tenant ne touche aucun devis', async () => {
    const before = await quoteSnapshot();

    const accepted = await quotes.transaction((tx) =>
      quotes.acceptIssued(tx, intruderTenantId, quoteId, new Date()),
    );

    expect(accepted).toBeNull();
    expect(await quoteSnapshot()).toEqual(before);
  });

  it('findForTenant et listForComposition ne rendent rien à un autre tenant', async () => {
    expect(await quotes.findForTenant(intruderTenantId, quoteId)).toBeNull();
    expect(await quotes.listForComposition(intruderTenantId, compositionId)).toEqual([]);
  });

  it('nextNumber tient un compteur par tenant', async () => {
    const year = 2099;

    const ownerFirst = await quotes.transaction((tx) =>
      quotes.nextNumber(tx, ownerTenantId, year),
    );
    const ownerSecond = await quotes.transaction((tx) =>
      quotes.nextNumber(tx, ownerTenantId, year),
    );
    const intruderFirst = await quotes.transaction((tx) =>
      quotes.nextNumber(tx, intruderTenantId, year),
    );

    expect(ownerFirst).toBe(`Q-${year}-000001`);
    expect(ownerSecond).toBe(`Q-${year}-000002`);
    // Le compteur de l'intrus n'a pas hérité de la séquence du propriétaire.
    expect(intruderFirst).toBe(`Q-${year}-000001`);
  });

  // Témoin : sans lui, les quatre tests ci-dessus passeraient même si plus rien n'écrivait.
  it('les mêmes écritures sous le tenant propriétaire aboutissent', async () => {
    const touched = await quotes.transaction((tx) =>
      repository.setStatus(tx, ownerTenantId, compositionId, 'QUOTED', new Date()),
    );
    expect(touched).toBe(true);
    expect((await snapshot()).composition.status).toBe('QUOTED');

    const superseded = await quotes.transaction((tx) =>
      quotes.supersedeIssued(tx, ownerTenantId, compositionId),
    );
    expect(superseded?.id).toBe(quoteId);
    expect(superseded?.status).toBe('SUPERSEDED');

    const second = await insertQuote('Q-ISO-000002');
    const acceptedAt = new Date();
    const accepted = await quotes.transaction((tx) =>
      quotes.acceptIssued(tx, ownerTenantId, second.id, acceptedAt),
    );
    expect(accepted?.status).toBe('ACCEPTED');
    expect(accepted?.acceptedAt).toEqual(acceptedAt);

    expect(await quotes.findForTenant(ownerTenantId, quoteId)).not.toBeNull();
    expect(await quotes.listForComposition(ownerTenantId, compositionId)).toHaveLength(2);
  });
});
