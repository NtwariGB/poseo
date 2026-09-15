import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { AppModule } from '../src/app.module';
import { seed } from '../prisma/seed';

// Client Prisma propre au test : on ne dépend pas de ce que l'agent écrira dans l'application.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Tenant du catalogue de référence, chargé par `prisma/seed.ts` (FR-109, non modifié au lot 2).
const SEED_TENANT_CODE = 'LM-FR';

// Tenants créés par le test.
// - OTHER : isolation (S1.7, S2.1) et configuration de tenant différente (TVA, validité).
// - NUM_A / NUM_B : numérotation repartant à zéro, indépendante de l'historique du seed (S1.6).
// - EMPTY : type de produit sans opération obligatoire (cas limite NOTHING_TO_QUOTE de FR-202).
const OTHER_TENANT_CODE = 'TEST-LOT2-OTHER';
const NUM_A_TENANT_CODE = 'TEST-LOT2-NUM-A';
const NUM_B_TENANT_CODE = 'TEST-LOT2-NUM-B';
const EMPTY_TENANT_CODE = 'TEST-LOT2-EMPTY';

const DAY_MS = 24 * 60 * 60 * 1000;

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

/** Ligne de devis telle que définie par FR-208. */
interface QuoteLineView {
  position: number;
  kind: 'OPERATION' | 'SURCHARGE';
  label: string;
  durationMinutes: number | null;
  hourlyRateCents: number | null;
  amountCents: number;
}

/** Représentation d'un devis telle que définie par FR-208. */
interface QuoteView {
  id: string;
  number: string;
  status: string;
  issuedAt: string;
  validUntil: string;
  acceptedAt: string | null;
  compositionId: string;
  productTypeLabel: string;
  zoneCode: string;
  hourlyRateCents: number;
  lines: QuoteLineView[];
  laborCents: number;
  surchargeCents: number;
  subtotalCents: number;
  vatRateBp: number;
  vatCents: number;
  totalCents: number;
}

/** Forme d'une ligne attendue : les champs peuvent être des matchers asymétriques. */
type ExpectedLine = { kind: string; label: string } & Record<string, unknown>;

/** Opération attendue sur un devis : son code au catalogue et son origine sur la prestation. */
type OperationSpec = { code: string; origin: 'MANDATORY' | 'OPTIONAL' };

/** Catalogue minimal créé par le test pour un tenant qui lui est propre. */
interface TenantFixture {
  tenantId: string;
  productTypeId: string;
  productTypeLabel: string;
  zoneCode: string;
  hourlyRateCents: number;
  vatRateBp: number;
  quoteValidityDays: number;
  postalCode: string;
  operation: { id: string; label: string; durationMinutes: number };
}

describe('Lot 2 : prix, devis, événements', () => {
  let app: INestApplication;

  // Tenant du seed
  let tenantId: string;
  const productTypeByCode = new Map<string, { id: string; label: string }>();
  const operationByCode = new Map<
    string,
    { id: string; label: string; referenceDurationMinutes: number }
  >();
  const constraintTypeByCode = new Map<string, { id: string; label: string }>();

  // Tenants créés par le test
  let other: TenantFixture;
  let numA: TenantFixture;
  let numB: TenantFixture;
  let empty: TenantFixture;

  const createdTenantIds: string[] = [];
  const createdCompositionIds: string[] = [];

  // Constantes du catalogue seed utilisées par la spec du lot.
  const NORD_RATE_CENTS = 4500;
  const SEED_VAT_RATE_BP = 2000;
  const SEED_VALIDITY_DAYS = 30;

  const currentYear = new Date().getFullYear();

  // ---------------------------------------------------------------- utilitaires

  const productTypeId = (code: string): string => {
    const productType = productTypeByCode.get(code);
    if (!productType) throw new Error(`type de produit ${code} absent du catalogue seed`);
    return productType.id;
  };

  const productTypeLabel = (code: string): string => {
    const productType = productTypeByCode.get(code);
    if (!productType) throw new Error(`type de produit ${code} absent du catalogue seed`);
    return productType.label;
  };

  const operation = (code: string) => {
    const found = operationByCode.get(code);
    if (!found) throw new Error(`opération ${code} absente du catalogue seed`);
    return found;
  };

  const constraintTypeId = (code: string): string => {
    const constraintType = constraintTypeByCode.get(code);
    if (!constraintType) throw new Error(`contrainte ${code} absente du catalogue seed`);
    return constraintType.id;
  };

  /** Montant d'une ligne opération : round(durée × taux / 60) (section 5 du modèle). */
  const operationAmount = (code: string, hourlyRateCents: number): number =>
    Math.round((operation(code).referenceDurationMinutes * hourlyRateCents) / 60);

  /** Ligne OPERATION attendue, hors `position` (attribuée par `orderedLines`).
   *  FR-209 : `label` est le snapshot de `Operation.label` du catalogue. */
  const operationLine = (code: string, hourlyRateCents: number): ExpectedLine => ({
    kind: 'OPERATION',
    label: operation(code).label,
    durationMinutes: operation(code).referenceDurationMinutes,
    hourlyRateCents,
    amountCents: operationAmount(code, hourlyRateCents),
  });

  /** Ligne SURCHARGE attendue, hors `position` : durée et taux nuls (modèle de domaine).
   *  FR-209 : `label` est le snapshot de `CompositionRule.label`. */
  const surchargeLine = (label: string, amountCents: number): ExpectedLine => ({
    kind: 'SURCHARGE',
    label,
    durationMinutes: null,
    hourlyRateCents: null,
    amountCents,
  });

  const ORIGIN_RANK: Record<OperationSpec['origin'], number> = { MANDATORY: 0, OPTIONAL: 1 };

  const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

  /**
   * FR-210 : lignes attendues dans l'ordre imposé par la spec — les OPERATION d'abord
   * (MANDATORY avant OPTIONAL, puis `Operation.code` en ordre alphabétique), les SURCHARGE
   * ensuite, avec `position` de 1 à n.
   */
  const orderedLines = (
    operations: OperationSpec[],
    hourlyRateCents: number,
    surcharges: ExpectedLine[] = [],
  ): ExpectedLine[] => {
    const sorted = [...operations].sort((a, b) =>
      a.origin !== b.origin
        ? ORIGIN_RANK[a.origin] - ORIGIN_RANK[b.origin]
        : byCode(a.code, b.code),
    );
    return [...sorted.map((op) => operationLine(op.code, hourlyRateCents)), ...surcharges].map(
      (line, index) => ({ ...line, position: index + 1 }),
    );
  };

  /**
   * Forme complète attendue d'un devis (FR-208). Les montants agrégés sont dérivés des lignes
   * selon la section 5 du modèle : labor, surcharge, sous-total, TVA, total.
   */
  const quoteShape = (args: {
    compositionId: string;
    productTypeLabel: string;
    zoneCode: string;
    hourlyRateCents: number;
    lines: ExpectedLine[];
    vatRateBp: number;
    status?: string;
    acceptedAt?: unknown;
  }) => {
    const amountOf = (line: ExpectedLine) => line.amountCents as number;
    const laborCents = args.lines
      .filter((line) => line.kind === 'OPERATION')
      .reduce((sum, line) => sum + amountOf(line), 0);
    const surchargeCents = args.lines
      .filter((line) => line.kind === 'SURCHARGE')
      .reduce((sum, line) => sum + amountOf(line), 0);
    const subtotalCents = laborCents + surchargeCents;
    const vatCents = Math.round((subtotalCents * args.vatRateBp) / 10000);

    return {
      id: expect.any(String),
      number: expect.any(String),
      status: args.status ?? 'ISSUED',
      issuedAt: expect.any(String),
      validUntil: expect.any(String),
      acceptedAt: args.acceptedAt ?? null,
      compositionId: args.compositionId,
      productTypeLabel: args.productTypeLabel,
      zoneCode: args.zoneCode,
      hourlyRateCents: args.hourlyRateCents,
      lines: args.lines,
      laborCents,
      surchargeCents,
      subtotalCents,
      vatRateBp: args.vatRateBp,
      vatCents,
      totalCents: subtotalCents + vatCents,
    };
  };

  /** `validUntil = issuedAt + quoteValidityDays du tenant`. */
  const expectValidity = (quote: QuoteView, validityDays: number): void => {
    expect(new Date(quote.validUntil).getTime() - new Date(quote.issuedAt).getTime()).toBe(
      validityDays * DAY_MS,
    );
  };

  /** FR-210 : les positions vont de 1 à n, dans l'ordre des lignes renvoyées. */
  const expectSequentialPositions = (quote: QuoteView, expectedCount: number): void => {
    expect(quote.lines.map((line) => line.position)).toEqual(
      Array.from({ length: expectedCount }, (_, index) => index + 1),
    );
  };

  // ---------------------------------------------------------------- appels HTTP

  const createComposition = async (headerTenantId: string, body: Record<string, unknown>) => {
    const res = await request(app.getHttpServer())
      .post('/compositions')
      .set('X-Tenant-Id', headerTenantId)
      .send(body);
    if (res.status === 201 && typeof res.body?.id === 'string') {
      createdCompositionIds.push(res.body.id as string);
    }
    return res;
  };

  const putConstraints = (
    headerTenantId: string,
    compositionId: string,
    constraintTypeIds: string[],
  ) =>
    request(app.getHttpServer())
      .put(`/compositions/${compositionId}/constraints`)
      .set('X-Tenant-Id', headerTenantId)
      .send({ constraintTypeIds });

  const patchOperation = (
    headerTenantId: string,
    compositionId: string,
    opId: string,
    selected: boolean,
  ) =>
    request(app.getHttpServer())
      .patch(`/compositions/${compositionId}/operations/${opId}`)
      .set('X-Tenant-Id', headerTenantId)
      .send({ selected });

  const getComposition = (headerTenantId: string, compositionId: string) =>
    request(app.getHttpServer())
      .get(`/compositions/${compositionId}`)
      .set('X-Tenant-Id', headerTenantId);

  const issueQuote = (headerTenantId: string, compositionId: string) =>
    request(app.getHttpServer())
      .post(`/compositions/${compositionId}/quotes`)
      .set('X-Tenant-Id', headerTenantId)
      .send({});

  const getQuote = (headerTenantId: string, quoteId: string) =>
    request(app.getHttpServer()).get(`/quotes/${quoteId}`).set('X-Tenant-Id', headerTenantId);

  const listQuotes = (headerTenantId: string, compositionId: string) =>
    request(app.getHttpServer())
      .get(`/compositions/${compositionId}/quotes`)
      .set('X-Tenant-Id', headerTenantId);

  const acceptQuote = (headerTenantId: string, quoteId: string) =>
    request(app.getHttpServer())
      .post(`/quotes/${quoteId}/accept`)
      .set('X-Tenant-Id', headerTenantId)
      .send({});

  // ------------------------------------------------- prestations prêtes à l'emploi

  /**
   * Prestation du tenant seed. Par défaut : lave-vaisselle encastrable en zone NORD.
   * Les contraintes sont déclarées avant les options, l'ordre inverse recomposerait la sélection.
   */
  const createSeedComposition = async (args: {
    productTypeCode: string;
    constraintCodes?: string[];
    selectedOptionCodes?: string[];
    postalCode?: string;
    productRef?: string;
  }): Promise<CompositionView> => {
    const created = await createComposition(tenantId, {
      productTypeId: productTypeId(args.productTypeCode),
      productRef: args.productRef ?? 'DW-8842',
      addressLine: '12 rue de Lille',
      postalCode: args.postalCode ?? '59000',
      city: 'Lille',
    });
    expect(created.status).toBe(201);
    let view = created.body as CompositionView;

    if (args.constraintCodes?.length) {
      const res = await putConstraints(
        tenantId,
        view.id,
        args.constraintCodes.map((code) => constraintTypeId(code)),
      );
      expect(res.status).toBe(200);
      view = res.body as CompositionView;
    }

    for (const code of args.selectedOptionCodes ?? []) {
      const res = await patchOperation(tenantId, view.id, operation(code).id, true);
      expect(res.status).toBe(200);
      view = res.body as CompositionView;
    }

    return view;
  };

  /** Prestation de référence de la story 1 : NO_ELEVATOR + option WASTE_DISPOSAL cochée. */
  const createDishwasherComposition = (constraintCodes: string[] = ['NO_ELEVATOR']) =>
    createSeedComposition({
      productTypeCode: 'DISHWASHER_BUILTIN',
      constraintCodes,
      selectedOptionCodes: ['WASTE_DISPOSAL'],
    });

  /**
   * Opérations attendues sur la prestation de référence : REQUIRE du type et REQUIRE apporté par
   * `NO_ELEVATOR` en MANDATORY, option `WASTE_DISPOSAL` cochée en OPTIONAL (règles du seed).
   */
  const dishwasherOperationSpecs = (): OperationSpec[] => [
    { code: 'INSTALL', origin: 'MANDATORY' },
    { code: 'WATER_CONNECT', origin: 'MANDATORY' },
    { code: 'ELEC_CONNECT', origin: 'MANDATORY' },
    { code: 'CARRY_UPSTAIRS', origin: 'MANDATORY' },
    { code: 'WASTE_DISPOSAL', origin: 'OPTIONAL' },
  ];

  /** Lignes attendues pour la prestation de référence (zone NORD, taux 4500). */
  const dishwasherOperationLines = (surcharges: ExpectedLine[] = []): ExpectedLine[] =>
    orderedLines(dishwasherOperationSpecs(), NORD_RATE_CENTS, surcharges);

  const dishwasherLaborCents = (): number =>
    ['INSTALL', 'WATER_CONNECT', 'ELEC_CONNECT', 'CARRY_UPSTAIRS', 'WASTE_DISPOSAL'].reduce(
      (sum, code) => sum + operationAmount(code, NORD_RATE_CENTS),
      0,
    );

  /** Prestation d'un tenant créé par le test, prête à être chiffrée. */
  const createFixtureComposition = async (fixture: TenantFixture): Promise<CompositionView> => {
    const created = await createComposition(fixture.tenantId, {
      productTypeId: fixture.productTypeId,
      productRef: 'FIX-1',
      addressLine: '1 rue du Test',
      postalCode: fixture.postalCode,
      city: 'Lille',
    });
    expect(created.status).toBe(201);
    return created.body as CompositionView;
  };

  const fixtureQuoteShape = (fixture: TenantFixture, compositionId: string) =>
    quoteShape({
      compositionId,
      productTypeLabel: fixture.productTypeLabel,
      zoneCode: fixture.zoneCode,
      hourlyRateCents: fixture.hourlyRateCents,
      vatRateBp: fixture.vatRateBp,
      lines: [
        {
          position: 1,
          kind: 'OPERATION',
          label: fixture.operation.label,
          durationMinutes: fixture.operation.durationMinutes,
          hourlyRateCents: fixture.hourlyRateCents,
          amountCents: Math.round(
            (fixture.operation.durationMinutes * fixture.hourlyRateCents) / 60,
          ),
        },
      ],
    });

  // ---------------------------------------------------------------- fixtures tenant

  /**
   * Tenant de test autonome : un type de produit, une opération, une zone, un taux.
   * `ruleKind = OFFER` produit une prestation sans aucune opération sélectionnée.
   */
  const createTenantFixture = async (args: {
    code: string;
    name: string;
    ruleKind: 'REQUIRE' | 'OFFER';
    hourlyRateCents: number;
    vatRateBp: number;
    quoteValidityDays: number;
    postalCode: string;
    durationMinutes?: number;
  }): Promise<TenantFixture> => {
    const tenant = await prisma.tenant.create({
      data: {
        code: args.code,
        name: args.name,
        countryCode: 'FR',
        vatRateBp: args.vatRateBp,
        quoteValidityDays: args.quoteValidityDays,
      },
    });
    createdTenantIds.push(tenant.id);

    const productType = await prisma.productType.create({
      data: { tenantId: tenant.id, code: 'FIX_PRODUCT', label: `Produit ${args.code}` },
    });
    const op = await prisma.operation.create({
      data: {
        tenantId: tenant.id,
        code: 'FIX_OP',
        label: `Opération ${args.code}`,
        referenceDurationMinutes: args.durationMinutes ?? 60,
      },
    });
    const zone = await prisma.zone.create({
      data: { tenantId: tenant.id, code: 'FIX_ZONE', label: `Zone ${args.code}` },
    });
    await prisma.zonePostalCode.create({
      data: { tenantId: tenant.id, zoneId: zone.id, postalCode: args.postalCode },
    });
    await prisma.laborRate.create({
      data: {
        tenantId: tenant.id,
        zoneId: zone.id,
        hourlyRateCents: args.hourlyRateCents,
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await prisma.compositionRule.create({
      data: {
        tenantId: tenant.id,
        productTypeId: productType.id,
        kind: args.ruleKind,
        operationId: op.id,
      },
    });

    return {
      tenantId: tenant.id,
      productTypeId: productType.id,
      productTypeLabel: productType.label,
      zoneCode: zone.code,
      hourlyRateCents: args.hourlyRateCents,
      vatRateBp: args.vatRateBp,
      quoteValidityDays: args.quoteValidityDays,
      postalCode: args.postalCode,
      operation: {
        id: op.id,
        label: op.label,
        durationMinutes: op.referenceDurationMinutes,
      },
    };
  };

  beforeAll(async () => {
    // Catalogue de référence : le seed du lot 1 est idempotent, on peut le rejouer.
    await seed();

    const seedTenant = await prisma.tenant.findUniqueOrThrow({ where: { code: SEED_TENANT_CODE } });
    tenantId = seedTenant.id;
    expect(seedTenant.vatRateBp).toBe(SEED_VAT_RATE_BP);
    expect(seedTenant.quoteValidityDays).toBe(SEED_VALIDITY_DAYS);

    for (const row of await prisma.productType.findMany({ where: { tenantId } })) {
      productTypeByCode.set(row.code, { id: row.id, label: row.label });
    }
    for (const row of await prisma.operation.findMany({ where: { tenantId } })) {
      operationByCode.set(row.code, {
        id: row.id,
        label: row.label,
        referenceDurationMinutes: row.referenceDurationMinutes,
      });
    }
    for (const row of await prisma.constraintType.findMany({ where: { tenantId } })) {
      constraintTypeByCode.set(row.code, { id: row.id, label: row.label });
    }

    // Taux de la zone NORD utilisé par les scénarios de la story 1.
    const nord = await prisma.zone.findFirstOrThrow({ where: { tenantId, code: 'NORD' } });
    const nordRate = await prisma.laborRate.findFirstOrThrow({
      where: { tenantId, zoneId: nord.id },
      orderBy: { validFrom: 'desc' },
    });
    expect(nordRate.hourlyRateCents).toBe(NORD_RATE_CENTS);

    other = await createTenantFixture({
      code: OTHER_TENANT_CODE,
      name: 'Enseigne de test (isolation)',
      ruleKind: 'REQUIRE',
      hourlyRateCents: 4000,
      vatRateBp: 1000,
      quoteValidityDays: 15,
      postalCode: '59000',
    });
    numA = await createTenantFixture({
      code: NUM_A_TENANT_CODE,
      name: 'Enseigne de test (numérotation A)',
      ruleKind: 'REQUIRE',
      hourlyRateCents: 4000,
      vatRateBp: 2000,
      quoteValidityDays: 30,
      postalCode: '59000',
    });
    numB = await createTenantFixture({
      code: NUM_B_TENANT_CODE,
      name: 'Enseigne de test (numérotation B)',
      ruleKind: 'REQUIRE',
      hourlyRateCents: 4000,
      vatRateBp: 2000,
      quoteValidityDays: 30,
      postalCode: '59000',
    });
    empty = await createTenantFixture({
      code: EMPTY_TENANT_CODE,
      name: 'Enseigne de test (rien à chiffrer)',
      ruleKind: 'OFFER',
      hourlyRateCents: 4000,
      vatRateBp: 2000,
      quoteValidityDays: 30,
      postalCode: '59000',
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();

    const testTenantIds = createdTenantIds.filter(Boolean);

    // Prestations créées par le test (tenant du seed compris).
    const compositionIds = (
      await prisma.serviceComposition.findMany({
        where: {
          OR: [{ id: { in: createdCompositionIds } }, { tenantId: { in: testTenantIds } }],
        },
        select: { id: true },
      })
    ).map((composition) => composition.id);

    // Devis émis par le test, et les événements outbox qu'ils ont produits.
    const quoteIds = (
      await prisma.quote.findMany({
        where: {
          OR: [{ compositionId: { in: compositionIds } }, { tenantId: { in: testTenantIds } }],
        },
        select: { id: true },
      })
    ).map((quote) => quote.id);

    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: [...quoteIds, ...compositionIds] } },
    });
    await prisma.quoteLine.deleteMany({ where: { quoteId: { in: quoteIds } } });
    await prisma.quote.deleteMany({ where: { id: { in: quoteIds } } });
    await prisma.quoteCounter.deleteMany({ where: { tenantId: { in: testTenantIds } } });

    await prisma.serviceOperation.deleteMany({ where: { compositionId: { in: compositionIds } } });
    await prisma.serviceConstraint.deleteMany({ where: { compositionId: { in: compositionIds } } });
    await prisma.serviceComposition.deleteMany({ where: { id: { in: compositionIds } } });

    // Catalogues des tenants de test.
    await prisma.compositionRule.deleteMany({ where: { tenantId: { in: testTenantIds } } });
    await prisma.laborRate.deleteMany({ where: { tenantId: { in: testTenantIds } } });
    await prisma.zonePostalCode.deleteMany({ where: { tenantId: { in: testTenantIds } } });
    await prisma.zone.deleteMany({ where: { tenantId: { in: testTenantIds } } });
    await prisma.constraintType.deleteMany({ where: { tenantId: { in: testTenantIds } } });
    await prisma.operation.deleteMany({ where: { tenantId: { in: testTenantIds } } });
    await prisma.productType.deleteMany({ where: { tenantId: { in: testTenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: testTenantIds } } });

    await prisma.$disconnect();
  }, 120_000);

  describe('Story 1 : émettre un devis', () => {
    it('S1.1 : émet un devis ISSUED avec une ligne par opération sélectionnée, sans majoration', async () => {
      const composition = await createDishwasherComposition();

      const res = await issueQuote(tenantId, composition.id);

      expect(res.status).toBe(201);
      const quote = res.body as QuoteView;

      expect(quote).toEqual(
        quoteShape({
          compositionId: composition.id,
          productTypeLabel: productTypeLabel('DISHWASHER_BUILTIN'),
          zoneCode: 'NORD',
          hourlyRateCents: NORD_RATE_CENTS,
          vatRateBp: SEED_VAT_RATE_BP,
          lines: dishwasherOperationLines(),
        }),
      );

      // Détail des montants exigés par le scénario.
      expect(quote.status).toBe('ISSUED');
      expect(quote.surchargeCents).toBe(0);
      expect(quote.vatRateBp).toBe(2000);
      expect(quote.laborCents).toBe(dishwasherLaborCents());
      expect(quote.subtotalCents).toBe(quote.laborCents + quote.surchargeCents);
      expect(quote.vatCents).toBe(Math.round((quote.subtotalCents * quote.vatRateBp) / 10000));
      expect(quote.totalCents).toBe(quote.subtotalCents + quote.vatCents);
      expectValidity(quote, SEED_VALIDITY_DAYS);
      expectSequentialPositions(quote, 5);

      // `number` au format Q-<année>-<6 chiffres>.
      expect(quote.number).toMatch(/^Q-\d{4}-\d{6}$/);
      expect(quote.number.startsWith(`Q-${currentYear}-`)).toBe(true);

      // Aucune ligne pour les options non cochées ni les opérations interdites.
      const labels = quote.lines.map((line) => line.label);
      expect(labels).not.toContain(operation('FLOOR_PROTECTION').label);
      expect(labels).not.toContain(operation('OLD_APPLIANCE_REMOVAL').label);
      expect(labels).not.toContain(operation('GAS_CONNECT').label);
    });

    it('S1.2 : HARD_ACCESS ajoute une ligne SURCHARGE en pourcentage (1500 bp du labor)', async () => {
      const composition = await createDishwasherComposition(['NO_ELEVATOR', 'HARD_ACCESS']);

      const res = await issueQuote(tenantId, composition.id);

      expect(res.status).toBe(201);
      const quote = res.body as QuoteView;

      const laborCents = dishwasherLaborCents();
      const expectedSurcharge = Math.round((laborCents * 1500) / 10000);

      expect(quote).toEqual(
        quoteShape({
          compositionId: composition.id,
          productTypeLabel: productTypeLabel('DISHWASHER_BUILTIN'),
          zoneCode: 'NORD',
          hourlyRateCents: NORD_RATE_CENTS,
          vatRateBp: SEED_VAT_RATE_BP,
          lines: dishwasherOperationLines([
            surchargeLine('Accès difficile', expectedSurcharge),
          ]),
        }),
      );

      expect(quote.laborCents).toBe(laborCents);
      expect(quote.surchargeCents).toBe(expectedSurcharge);
      expect(quote.subtotalCents).toBe(laborCents + expectedSurcharge);
      expectSequentialPositions(quote, 6);
    });

    it('S1.3 : LOAD_BEARING_WALL sur WATER_HEATER_ELEC ajoute une ligne SURCHARGE de 3000 cents', async () => {
      const composition = await createSeedComposition({
        productTypeCode: 'WATER_HEATER_ELEC',
        constraintCodes: ['LOAD_BEARING_WALL'],
        productRef: 'WH-1201',
      });

      const res = await issueQuote(tenantId, composition.id);

      expect(res.status).toBe(201);
      const quote = res.body as QuoteView;

      expect(quote).toEqual(
        quoteShape({
          compositionId: composition.id,
          productTypeLabel: productTypeLabel('WATER_HEATER_ELEC'),
          zoneCode: 'NORD',
          hourlyRateCents: NORD_RATE_CENTS,
          vatRateBp: SEED_VAT_RATE_BP,
          lines: orderedLines(
            [
              { code: 'INSTALL', origin: 'MANDATORY' },
              { code: 'WATER_CONNECT', origin: 'MANDATORY' },
              { code: 'ELEC_CONNECT', origin: 'MANDATORY' },
              { code: 'OLD_APPLIANCE_REMOVAL', origin: 'MANDATORY' },
            ],
            NORD_RATE_CENTS,
            [surchargeLine('Fixation mur porteur', 3000)],
          ),
        }),
      );

      expect(quote.surchargeCents).toBe(3000);
      expectSequentialPositions(quote, 5);
    });

    it('S1.4 : refuse une prestation hors zone couverte (422 ZONE_NOT_COVERED)', async () => {
      const created = await createComposition(tenantId, {
        productTypeId: productTypeId('DISHWASHER_BUILTIN'),
        productRef: 'DW-9001',
        addressLine: '1 rue de Rivoli',
        postalCode: '75001',
        city: 'Paris',
      });
      expect(created.status).toBe(201);
      const composition = created.body as CompositionView;
      expect(composition.zone).toBeNull();

      const res = await issueQuote(tenantId, composition.id);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('ZONE_NOT_COVERED');

      // Aucun devis n'a été créé, la prestation reste DRAFT.
      expect(await prisma.quote.count({ where: { compositionId: composition.id } })).toBe(0);
      const reread = await getComposition(tenantId, composition.id);
      expect((reread.body as CompositionView).status).toBe('DRAFT');
    });

    it('S1.5 : réémettre passe l ancien devis en SUPERSEDED, la prestation reste QUOTED', async () => {
      const composition = await createDishwasherComposition();

      const first = await issueQuote(tenantId, composition.id);
      expect(first.status).toBe(201);
      const firstQuote = first.body as QuoteView;
      expect(firstQuote.status).toBe('ISSUED');

      const afterFirst = await getComposition(tenantId, composition.id);
      expect((afterFirst.body as CompositionView).status).toBe('QUOTED');

      const second = await issueQuote(tenantId, composition.id);
      expect(second.status).toBe(201);
      const secondQuote = second.body as QuoteView;

      expect(secondQuote.id).not.toBe(firstQuote.id);
      expect(secondQuote.number).not.toBe(firstQuote.number);
      expect(secondQuote.status).toBe('ISSUED');

      const rereadFirst = await getQuote(tenantId, firstQuote.id);
      expect(rereadFirst.status).toBe(200);
      expect((rereadFirst.body as QuoteView).status).toBe('SUPERSEDED');

      const afterSecond = await getComposition(tenantId, composition.id);
      expect((afterSecond.body as CompositionView).status).toBe('QUOTED');

      // Invariant : au plus un devis ISSUED par prestation.
      expect(
        await prisma.quote.count({ where: { compositionId: composition.id, status: 'ISSUED' } }),
      ).toBe(1);
    });

    it('S1.6 : la numérotation se suit par tenant et repart à 000001 pour un autre tenant', async () => {
      const compositionA1 = await createFixtureComposition(numA);
      const compositionA2 = await createFixtureComposition(numA);

      const firstA = await issueQuote(numA.tenantId, compositionA1.id);
      expect(firstA.status).toBe(201);
      expect((firstA.body as QuoteView).number).toBe(`Q-${currentYear}-000001`);

      const secondA = await issueQuote(numA.tenantId, compositionA2.id);
      expect(secondA.status).toBe(201);
      expect((secondA.body as QuoteView).number).toBe(`Q-${currentYear}-000002`);

      const compositionB1 = await createFixtureComposition(numB);
      const firstB = await issueQuote(numB.tenantId, compositionB1.id);
      expect(firstB.status).toBe(201);
      expect((firstB.body as QuoteView).number).toBe(`Q-${currentYear}-000001`);
    });

    it('S1.7 : refuse d émettre sur la prestation d un autre tenant (404 COMPOSITION_NOT_FOUND)', async () => {
      const foreign = await createFixtureComposition(other);

      const res = await issueQuote(tenantId, foreign.id);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('COMPOSITION_NOT_FOUND');
      expect(await prisma.quote.count({ where: { compositionId: foreign.id } })).toBe(0);
    });
  });

  describe('Story 2 : consulter un devis', () => {
    it('S2.1 : GET /quotes/:id renvoie lignes et snapshots ; un devis d un autre tenant renvoie 404 QUOTE_NOT_FOUND', async () => {
      const composition = await createDishwasherComposition();
      const issued = await issueQuote(tenantId, composition.id);
      expect(issued.status).toBe(201);
      const issuedQuote = issued.body as QuoteView;

      const res = await getQuote(tenantId, issuedQuote.id);

      expect(res.status).toBe(200);
      const quote = res.body as QuoteView;
      expect(quote).toEqual(issuedQuote);
      expect(quote).toEqual(
        quoteShape({
          compositionId: composition.id,
          productTypeLabel: productTypeLabel('DISHWASHER_BUILTIN'),
          zoneCode: 'NORD',
          hourlyRateCents: NORD_RATE_CENTS,
          vatRateBp: SEED_VAT_RATE_BP,
          lines: dishwasherOperationLines(),
        }),
      );

      // Snapshots explicitement exigés par le scénario.
      expect(quote.zoneCode).toBe('NORD');
      expect(quote.hourlyRateCents).toBe(NORD_RATE_CENTS);
      expect(quote.productTypeLabel).toBe(productTypeLabel('DISHWASHER_BUILTIN'));
      expect(quote.lines.length).toBe(5);

      // Isolation : le devis d'un tenant voisin est invisible.
      const foreignComposition = await createFixtureComposition(other);
      const foreignIssued = await issueQuote(other.tenantId, foreignComposition.id);
      expect(foreignIssued.status).toBe(201);

      const foreign = await getQuote(tenantId, (foreignIssued.body as QuoteView).id);
      expect(foreign.status).toBe(404);
      expect(foreign.body.code).toBe('QUOTE_NOT_FOUND');
    });

    it('S2.2 : GET /compositions/:id/quotes liste les devis du plus récent au plus ancien', async () => {
      const composition = await createDishwasherComposition();

      const first = await issueQuote(tenantId, composition.id);
      expect(first.status).toBe(201);
      const firstQuote = first.body as QuoteView;

      const second = await issueQuote(tenantId, composition.id);
      expect(second.status).toBe(201);
      const secondQuote = second.body as QuoteView;

      const res = await listQuotes(tenantId, composition.id);

      expect(res.status).toBe(200);
      const list = res.body as QuoteView[];
      expect(list.map((quote) => quote.id)).toEqual([secondQuote.id, firstQuote.id]);
      expect(list.map((quote) => quote.status)).toEqual(['ISSUED', 'SUPERSEDED']);
      expect(list[0]).toEqual(
        expect.objectContaining({
          id: secondQuote.id,
          number: secondQuote.number,
          compositionId: composition.id,
          totalCents: secondQuote.totalCents,
        }),
      );

      // FR-211 : la liste d'une prestation d'un autre tenant renvoie 404, jamais 200 vide.
      const foreignComposition = await createFixtureComposition(other);
      const foreignList = await listQuotes(tenantId, foreignComposition.id);
      expect(foreignList.status).toBe(404);
      expect(foreignList.body.code).toBe('COMPOSITION_NOT_FOUND');
    });
  });

  describe('Story 3 : accepter un devis', () => {
    it('S3.1 : accepter un devis ISSUED le passe ACCEPTED et passe la prestation ACCEPTED', async () => {
      const composition = await createDishwasherComposition();
      const issued = await issueQuote(tenantId, composition.id);
      expect(issued.status).toBe(201);
      const issuedQuote = issued.body as QuoteView;

      const res = await acceptQuote(tenantId, issuedQuote.id);

      expect(res.status).toBe(200);
      const quote = res.body as QuoteView;
      expect(quote).toEqual(
        quoteShape({
          compositionId: composition.id,
          productTypeLabel: productTypeLabel('DISHWASHER_BUILTIN'),
          zoneCode: 'NORD',
          hourlyRateCents: NORD_RATE_CENTS,
          vatRateBp: SEED_VAT_RATE_BP,
          lines: dishwasherOperationLines(),
          status: 'ACCEPTED',
          acceptedAt: expect.any(String),
        }),
      );
      expect(quote.status).toBe('ACCEPTED');
      expect(quote.acceptedAt).not.toBeNull();

      const reread = await getQuote(tenantId, issuedQuote.id);
      expect(reread.status).toBe(200);
      expect((reread.body as QuoteView).status).toBe('ACCEPTED');
      expect((reread.body as QuoteView).acceptedAt).toEqual(quote.acceptedAt);

      const rereadComposition = await getComposition(tenantId, composition.id);
      expect((rereadComposition.body as CompositionView).status).toBe('ACCEPTED');
    });

    it('S3.2 : refuse d accepter un devis SUPERSEDED ou déjà ACCEPTED (409 QUOTE_NOT_ACCEPTABLE)', async () => {
      // Devis remplacé.
      const supersededComposition = await createDishwasherComposition();
      const first = await issueQuote(tenantId, supersededComposition.id);
      expect(first.status).toBe(201);
      const supersededQuote = first.body as QuoteView;
      const second = await issueQuote(tenantId, supersededComposition.id);
      expect(second.status).toBe(201);

      const supersededRes = await acceptQuote(tenantId, supersededQuote.id);
      expect(supersededRes.status).toBe(409);
      expect(supersededRes.body.code).toBe('QUOTE_NOT_ACCEPTABLE');
      expect((await getQuote(tenantId, supersededQuote.id)).body.status).toBe('SUPERSEDED');

      // Devis déjà accepté.
      const acceptedComposition = await createDishwasherComposition();
      const issued = await issueQuote(tenantId, acceptedComposition.id);
      expect(issued.status).toBe(201);
      const acceptedQuote = issued.body as QuoteView;
      const accepted = await acceptQuote(tenantId, acceptedQuote.id);
      expect(accepted.status).toBe(200);

      const again = await acceptQuote(tenantId, acceptedQuote.id);
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('QUOTE_NOT_ACCEPTABLE');
      expect((await getQuote(tenantId, acceptedQuote.id)).body.acceptedAt).toEqual(
        (accepted.body as QuoteView).acceptedAt,
      );
    });

    it('S3.3 : refuse d accepter un devis dont validUntil est dépassé (409 QUOTE_EXPIRED)', async () => {
      const composition = await createDishwasherComposition();
      const issued = await issueQuote(tenantId, composition.id);
      expect(issued.status).toBe(201);
      const quote = issued.body as QuoteView;

      // La date de validité est reculée en base : l'expiration planifiée est hors périmètre du lot.
      await prisma.quote.update({
        where: { id: quote.id },
        data: { validUntil: new Date(Date.now() - DAY_MS) },
      });

      const res = await acceptQuote(tenantId, quote.id);

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('QUOTE_EXPIRED');

      const row = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
      expect(row.acceptedAt).toBeNull();
      expect(row.status).not.toBe('ACCEPTED');

      const rereadComposition = await getComposition(tenantId, composition.id);
      expect((rereadComposition.body as CompositionView).status).toBe('QUOTED');
    });

    it('S3.4 : une prestation ACCEPTED refuse toute modification (409 COMPOSITION_LOCKED)', async () => {
      const composition = await createDishwasherComposition();
      const issued = await issueQuote(tenantId, composition.id);
      expect(issued.status).toBe(201);
      const accepted = await acceptQuote(tenantId, (issued.body as QuoteView).id);
      expect(accepted.status).toBe(200);

      const constraints = await putConstraints(tenantId, composition.id, [
        constraintTypeId('HARD_ACCESS'),
      ]);
      expect(constraints.status).toBe(409);
      expect(constraints.body.code).toBe('COMPOSITION_LOCKED');

      const optionOn = await patchOperation(
        tenantId,
        composition.id,
        operation('FLOOR_PROTECTION').id,
        true,
      );
      expect(optionOn.status).toBe(409);
      expect(optionOn.body.code).toBe('COMPOSITION_LOCKED');

      const optionOff = await patchOperation(
        tenantId,
        composition.id,
        operation('WASTE_DISPOSAL').id,
        false,
      );
      expect(optionOff.status).toBe(409);
      expect(optionOff.body.code).toBe('COMPOSITION_LOCKED');

      // La prestation est bien restée intacte.
      const reread = await getComposition(tenantId, composition.id);
      expect((reread.body as CompositionView).status).toBe('ACCEPTED');
      expect((reread.body as CompositionView).constraints.map((item) => item.code)).toEqual([
        'NO_ELEVATOR',
      ]);
    });
  });

  describe('Story 4 : événements sortants', () => {
    it('S4.1 : une émission écrit une ligne outbox quote.issued avec le payload attendu', async () => {
      const composition = await createDishwasherComposition();
      const issued = await issueQuote(tenantId, composition.id);
      expect(issued.status).toBe(201);
      const quote = issued.body as QuoteView;

      const events = await prisma.outboxEvent.findMany({
        where: { aggregateId: quote.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(events.map((event) => event.type)).toEqual(['quote.issued']);

      const event = events[0];
      expect(event.aggregateType).toBe('quote');
      expect(event.aggregateId).toBe(quote.id);

      const payload = event.payload as Record<string, unknown>;
      expect(payload).toEqual(
        expect.objectContaining({
          quoteId: quote.id,
          number: quote.number,
          tenantId,
          compositionId: composition.id,
          totalCents: quote.totalCents,
        }),
      );
      expect(payload.validUntil).toBeDefined();
      expect(new Date(payload.validUntil as string).toISOString()).toBe(
        new Date(quote.validUntil).toISOString(),
      );
    });

    it('S4.2 : une acceptation écrit quote.accepted, une supersession écrit quote.superseded pour l ancien devis', async () => {
      const composition = await createDishwasherComposition();

      const first = await issueQuote(tenantId, composition.id);
      expect(first.status).toBe(201);
      const firstQuote = first.body as QuoteView;

      // Supersession : nouvelle émission sur la même prestation.
      const second = await issueQuote(tenantId, composition.id);
      expect(second.status).toBe(201);
      const secondQuote = second.body as QuoteView;

      const firstEvents = await prisma.outboxEvent.findMany({
        where: { aggregateId: firstQuote.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(firstEvents.map((event) => event.type)).toEqual(['quote.issued', 'quote.superseded']);
      const supersededEvent = firstEvents[1];
      expect(supersededEvent.aggregateType).toBe('quote');
      expect(supersededEvent.payload).toEqual(
        expect.objectContaining({
          quoteId: firstQuote.id,
          number: firstQuote.number,
          tenantId,
          compositionId: composition.id,
        }),
      );

      // Acceptation du devis courant.
      const accepted = await acceptQuote(tenantId, secondQuote.id);
      expect(accepted.status).toBe(200);

      const secondEvents = await prisma.outboxEvent.findMany({
        where: { aggregateId: secondQuote.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(secondEvents.map((event) => event.type)).toEqual(['quote.issued', 'quote.accepted']);
      const acceptedEvent = secondEvents[1];
      expect(acceptedEvent.aggregateType).toBe('quote');
      expect(acceptedEvent.payload).toEqual(
        expect.objectContaining({
          quoteId: secondQuote.id,
          number: secondQuote.number,
          tenantId,
          compositionId: composition.id,
          totalCents: secondQuote.totalCents,
        }),
      );

      // Aucun événement n'est supprimé ni mis à jour : les deux lignes de l'ancien devis subsistent.
      expect(firstEvents[0].type).toBe('quote.issued');
    });
  });

  describe('Cas limites', () => {
    it('CL1 : une prestation sans aucune opération sélectionnée est refusée (422 NOTHING_TO_QUOTE)', async () => {
      const composition = await createFixtureComposition(empty);
      expect(composition.operations.every((op) => !op.selected)).toBe(true);

      const res = await issueQuote(empty.tenantId, composition.id);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('NOTHING_TO_QUOTE');
      expect(await prisma.quote.count({ where: { compositionId: composition.id } })).toBe(0);
    });

    it('CL2 : validUntil et vatRateBp suivent la configuration du tenant du devis', async () => {
      const composition = await createFixtureComposition(other);

      const res = await issueQuote(other.tenantId, composition.id);

      expect(res.status).toBe(201);
      const quote = res.body as QuoteView;
      expect(quote).toEqual(fixtureQuoteShape(other, composition.id));
      expect(quote.vatRateBp).toBe(other.vatRateBp);
      expectValidity(quote, other.quoteValidityDays);
    });

    it('CL3 : le devis est immuable, une réémission produit un nouveau devis sans toucher au précédent', async () => {
      const composition = await createDishwasherComposition();
      const first = await issueQuote(tenantId, composition.id);
      expect(first.status).toBe(201);
      const firstQuote = first.body as QuoteView;

      // On ajoute une option, donc un montant : le devis déjà émis ne doit pas bouger.
      const selection = await patchOperation(
        tenantId,
        composition.id,
        operation('FLOOR_PROTECTION').id,
        true,
      );
      expect(selection.status).toBe(200);

      const second = await issueQuote(tenantId, composition.id);
      expect(second.status).toBe(201);
      const secondQuote = second.body as QuoteView;

      expect(secondQuote.laborCents).toBe(
        dishwasherLaborCents() + operationAmount('FLOOR_PROTECTION', NORD_RATE_CENTS),
      );
      expect(secondQuote.lines).toHaveLength(6);

      const rereadFirst = await getQuote(tenantId, firstQuote.id);
      expect(rereadFirst.status).toBe(200);
      const reread = rereadFirst.body as QuoteView;
      expect(reread).toEqual(
        { ...firstQuote, status: 'SUPERSEDED' },
      );
      expect(reread.laborCents).toBe(dishwasherLaborCents());
      expect(reread.totalCents).toBe(firstQuote.totalCents);
    });
  });
});
