import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { AppModule } from '../src/app.module';

// Suites de la revue du lot 2 : les comportements identifiés comme implémentés mais non
// testés (écarts n° 3 et 4) et celui ajouté par l'ADR 0023 (écart n° 1). Fichier distinct :
// `test/lot-2.e2e-spec.ts` est le test d'acceptation du lot, il n'est pas touché.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Tenants créés par ce fichier, indépendants du seed et des tenants du test d'acceptation.
const STALE_TENANT_CODE = 'TEST-FIX-STALE';
const LOCKED_TENANT_CODE = 'TEST-FIX-LOCKED';
const NO_RATE_TENANT_CODE = 'TEST-FIX-NO-RATE';

interface CatalogItemView {
  id: string;
  code: string;
  label: string;
}

interface CompositionOperationView {
  operationId: string;
  code: string;
  label: string;
  referenceDurationMinutes: number;
  origin: 'MANDATORY' | 'OPTIONAL';
  selected: boolean;
}

interface CompositionView {
  id: string;
  status: string;
  productType: CatalogItemView;
  productRef: string;
  address: { addressLine: string; postalCode: string; city: string };
  zone: CatalogItemView | null;
  constraints: CatalogItemView[];
  operations: CompositionOperationView[];
  warnings: string[];
}

interface QuoteView {
  id: string;
  number: string;
  status: string;
  issuedAt: string;
  validUntil: string;
  acceptedAt: string | null;
  compositionId: string;
  totalCents: number;
}

/**
 * Tenant autonome : un type de produit, une opération obligatoire, une option, une zone
 * et un taux. L'option permet de modifier la prestation après l'émission sans recomposer.
 */
interface TenantFixture {
  tenantId: string;
  productTypeId: string;
  postalCode: string;
  zoneId: string;
  mandatoryOperationId: string;
  optionalOperationId: string;
}

describe('Suites de la revue du lot 2', () => {
  let app: INestApplication;

  let stale: TenantFixture;
  let locked: TenantFixture;
  let noRate: TenantFixture;

  const createdTenantIds: string[] = [];

  // ---------------------------------------------------------------- appels HTTP

  const createComposition = (fixture: TenantFixture) =>
    request(app.getHttpServer())
      .post('/compositions')
      .set('X-Tenant-Id', fixture.tenantId)
      .send({
        productTypeId: fixture.productTypeId,
        productRef: 'FIX-1',
        addressLine: '1 rue du Test',
        postalCode: fixture.postalCode,
        city: 'Lille',
      });

  const patchOperation = (
    fixture: TenantFixture,
    compositionId: string,
    operationId: string,
    selected: boolean,
  ) =>
    request(app.getHttpServer())
      .patch(`/compositions/${compositionId}/operations/${operationId}`)
      .set('X-Tenant-Id', fixture.tenantId)
      .send({ selected });

  const getComposition = (fixture: TenantFixture, compositionId: string) =>
    request(app.getHttpServer())
      .get(`/compositions/${compositionId}`)
      .set('X-Tenant-Id', fixture.tenantId);

  const issueQuote = (fixture: TenantFixture, compositionId: string) =>
    request(app.getHttpServer())
      .post(`/compositions/${compositionId}/quotes`)
      .set('X-Tenant-Id', fixture.tenantId)
      .send({});

  const acceptQuote = (fixture: TenantFixture, quoteId: string) =>
    request(app.getHttpServer())
      .post(`/quotes/${quoteId}/accept`)
      .set('X-Tenant-Id', fixture.tenantId)
      .send({});

  /** Prestation neuve du tenant, avec son opération obligatoire déjà retenue. */
  const newComposition = async (
    fixture: TenantFixture,
  ): Promise<CompositionView> => {
    const created = await createComposition(fixture);
    expect(created.status).toBe(201);
    return created.body as CompositionView;
  };

  // ---------------------------------------------------------------- fixtures

  /**
   * `rateValidFrom` porte le seul taux de la zone : daté dans le futur, aucun taux n'est en
   * vigueur à l'émission (FR-213).
   */
  const createTenantFixture = async (args: {
    code: string;
    rateValidFrom: Date;
  }): Promise<TenantFixture> => {
    const tenant = await prisma.tenant.create({
      data: {
        code: args.code,
        name: `Enseigne de test (${args.code})`,
        countryCode: 'FR',
        vatRateBp: 2000,
        quoteValidityDays: 30,
      },
    });
    createdTenantIds.push(tenant.id);

    const productType = await prisma.productType.create({
      data: {
        tenantId: tenant.id,
        code: 'FIX_PRODUCT',
        label: `Produit ${args.code}`,
      },
    });
    const mandatory = await prisma.operation.create({
      data: {
        tenantId: tenant.id,
        code: 'FIX_INSTALL',
        label: `Pose ${args.code}`,
        referenceDurationMinutes: 60,
      },
    });
    const optional = await prisma.operation.create({
      data: {
        tenantId: tenant.id,
        code: 'FIX_OPTION',
        label: `Option ${args.code}`,
        referenceDurationMinutes: 30,
      },
    });
    const zone = await prisma.zone.create({
      data: { tenantId: tenant.id, code: 'FIX_ZONE', label: `Zone ${args.code}` },
    });
    await prisma.zonePostalCode.create({
      data: { tenantId: tenant.id, zoneId: zone.id, postalCode: '59000' },
    });
    await prisma.laborRate.create({
      data: {
        tenantId: tenant.id,
        zoneId: zone.id,
        hourlyRateCents: 4000,
        validFrom: args.rateValidFrom,
      },
    });
    await prisma.compositionRule.create({
      data: {
        tenantId: tenant.id,
        productTypeId: productType.id,
        kind: 'REQUIRE',
        operationId: mandatory.id,
      },
    });
    await prisma.compositionRule.create({
      data: {
        tenantId: tenant.id,
        productTypeId: productType.id,
        kind: 'OFFER',
        operationId: optional.id,
      },
    });

    return {
      tenantId: tenant.id,
      productTypeId: productType.id,
      postalCode: '59000',
      zoneId: zone.id,
      mandatoryOperationId: mandatory.id,
      optionalOperationId: optional.id,
    };
  };

  const IN_FORCE = new Date('2026-01-01T00:00:00.000Z');
  const NOT_YET_IN_FORCE = new Date('2099-01-01T00:00:00.000Z');

  beforeAll(async () => {
    stale = await createTenantFixture({
      code: STALE_TENANT_CODE,
      rateValidFrom: IN_FORCE,
    });
    locked = await createTenantFixture({
      code: LOCKED_TENANT_CODE,
      rateValidFrom: IN_FORCE,
    });
    // Seul taux de la zone, daté dans le futur : créé ici, supprimé par `afterAll`.
    noRate = await createTenantFixture({
      code: NO_RATE_TENANT_CODE,
      rateValidFrom: NOT_YET_IN_FORCE,
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();

    const tenantIds = createdTenantIds.filter(Boolean);

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

    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: [...quoteIds, ...compositionIds] } },
    });
    await prisma.quoteLine.deleteMany({ where: { quoteId: { in: quoteIds } } });
    await prisma.quote.deleteMany({ where: { id: { in: quoteIds } } });
    await prisma.quoteCounter.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });

    await prisma.serviceOperation.deleteMany({
      where: { compositionId: { in: compositionIds } },
    });
    await prisma.serviceConstraint.deleteMany({
      where: { compositionId: { in: compositionIds } },
    });
    await prisma.serviceComposition.deleteMany({
      where: { id: { in: compositionIds } },
    });

    await prisma.compositionRule.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.laborRate.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.zonePostalCode.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.zone.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.operation.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.productType.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });

    await prisma.$disconnect();
  }, 120_000);

  // ------------------------------------------------------------------ écart n° 1

  describe('FR-216 : acceptation d un devis dont la prestation a bougé (ADR 0023)', () => {
    it('refuse l acceptation après modification de la prestation (409 QUOTE_STALE)', async () => {
      const composition = await newComposition(stale);
      const issued = await issueQuote(stale, composition.id);
      expect(issued.status).toBe(201);
      const quote = issued.body as QuoteView;

      // La prestation bouge après l'émission : l'option cochée change le prix.
      const selection = await patchOperation(
        stale,
        composition.id,
        stale.optionalOperationId,
        true,
      );
      expect(selection.status).toBe(200);

      const res = await acceptQuote(stale, quote.id);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('QUOTE_STALE');

      // Rien n'a été écrit : ni le devis, ni la prestation.
      const row = await prisma.quote.findUniqueOrThrow({
        where: { id: quote.id },
      });
      expect(row.status).toBe('ISSUED');
      expect(row.acceptedAt).toBeNull();

      const reread = await getComposition(stale, composition.id);
      expect((reread.body as CompositionView).status).toBe('QUOTED');
    });

    it('accepte de nouveau une fois le devis réémis', async () => {
      const composition = await newComposition(stale);
      expect((await issueQuote(stale, composition.id)).status).toBe(201);

      const selection = await patchOperation(
        stale,
        composition.id,
        stale.optionalOperationId,
        true,
      );
      expect(selection.status).toBe(200);

      const reissued = await issueQuote(stale, composition.id);
      expect(reissued.status).toBe(201);
      const fresh = reissued.body as QuoteView;

      const res = await acceptQuote(stale, fresh.id);

      expect(res.status).toBe(200);
      expect((res.body as QuoteView).status).toBe('ACCEPTED');
      expect((res.body as QuoteView).acceptedAt).not.toBeNull();
    });

    // Témoin : sans lui, le contrôle de fraîcheur pourrait refuser toute acceptation et les
    // deux tests ci-dessus resteraient verts.
    it('accepte un devis dont la prestation n a pas bougé depuis l émission', async () => {
      const composition = await newComposition(stale);
      const issued = await issueQuote(stale, composition.id);
      expect(issued.status).toBe(201);

      const res = await acceptQuote(stale, (issued.body as QuoteView).id);

      expect(res.status).toBe(200);
      expect((res.body as QuoteView).status).toBe('ACCEPTED');
    });
  });

  // ------------------------------------------------------------------ écart n° 3

  describe('FR-212 : émission sur une prestation ACCEPTED (ADR 0021 Q2)', () => {
    it('refuse d émettre un nouveau devis (409 COMPOSITION_LOCKED) et n en crée aucun', async () => {
      const composition = await newComposition(locked);
      const issued = await issueQuote(locked, composition.id);
      expect(issued.status).toBe(201);
      const accepted = await acceptQuote(
        locked,
        (issued.body as QuoteView).id,
      );
      expect(accepted.status).toBe(200);

      const res = await issueQuote(locked, composition.id);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('COMPOSITION_LOCKED');

      // Le devis accepté reste seul, et il reste ACCEPTED.
      const quotes = await prisma.quote.findMany({
        where: { compositionId: composition.id },
        select: { id: true, status: true },
      });
      expect(quotes).toEqual([
        { id: (issued.body as QuoteView).id, status: 'ACCEPTED' },
      ]);

      const reread = await getComposition(locked, composition.id);
      expect((reread.body as CompositionView).status).toBe('ACCEPTED');
    });
  });

  // ------------------------------------------------------------------ écart n° 4

  describe('FR-213 : zone sans taux en vigueur', () => {
    it('refuse l émission (422 LABOR_RATE_NOT_FOUND) et n écrit rien', async () => {
      const composition = await newComposition(noRate);
      // La zone couvre bien le code postal : c'est le taux qui manque, pas la zone.
      expect((composition.zone as CatalogItemView).code).toBe('FIX_ZONE');

      const res = await issueQuote(noRate, composition.id);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('LABOR_RATE_NOT_FOUND');

      expect(
        await prisma.quote.count({ where: { compositionId: composition.id } }),
      ).toBe(0);
      const reread = await getComposition(noRate, composition.id);
      expect((reread.body as CompositionView).status).toBe('DRAFT');
    });

    it('émet dès qu un taux entre en vigueur, sur la même prestation', async () => {
      const composition = await newComposition(noRate);

      // Témoin : seul le taux manquait. Le taux daté du futur reste en place, un second
      // taux déjà en vigueur est ajouté puis retiré.
      const rate = await prisma.laborRate.create({
        data: {
          tenantId: noRate.tenantId,
          zoneId: noRate.zoneId,
          hourlyRateCents: 4000,
          validFrom: IN_FORCE,
        },
      });
      try {
        const res = await issueQuote(noRate, composition.id);

        expect(res.status).toBe(201);
        expect((res.body as QuoteView).totalCents).toBeGreaterThan(0);
      } finally {
        // Le devis émis est laissé en place : `afterAll` nettoie le tenant entier.
        await prisma.laborRate.delete({ where: { id: rate.id } });
      }

      // Le taux retiré, la prestation redevient non chiffrable.
      const after = await issueQuote(noRate, composition.id);
      expect(after.status).toBe(422);
      expect(after.body.code).toBe('LABOR_RATE_NOT_FOUND');
    });
  });
});
