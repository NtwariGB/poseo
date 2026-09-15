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

// Tenant du catalogue de référence, chargé par `prisma/seed.ts` (FR-109).
const SEED_TENANT_CODE = 'LM-FR';

// Tenants créés par le test : isolation d'une part, incohérences de catalogue d'autre part.
const OTHER_TENANT_CODE = 'TEST-LOT1-OTHER';
const EDGE_TENANT_CODE = 'TEST-LOT1-EDGE';

interface CatalogItemView {
  id: string;
  code: string;
  label: string;
}

interface OperationView {
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
  operations: OperationView[];
  warnings: string[];
}

describe('Lot 1 : catalogue et composition de prestation', () => {
  let app: INestApplication;

  // Tenant du seed
  let tenantId: string;
  const productTypeIdByCode = new Map<string, string>();
  const operationByCode = new Map<
    string,
    { id: string; label: string; referenceDurationMinutes: number }
  >();
  const constraintTypeByCode = new Map<string, { id: string; label: string }>();
  const zoneByCode = new Map<string, { id: string; label: string }>();

  // Tenant secondaire (isolation)
  let otherTenantId: string;
  let otherProductTypeId: string;
  let otherConstraintTypeId: string;

  // Tenant dédié aux incohérences et conflits de catalogue
  let edgeTenantId: string;
  let edgeConflictProductTypeId: string;
  let edgeForbidProductTypeId: string;
  let edgeForbidConstraintTypeId: string;
  let edgeOptionOperationId: string;

  const createdCompositionIds: string[] = [];

  const byCode = (a: { code: string }, b: { code: string }): number =>
    a.code < b.code ? -1 : a.code > b.code ? 1 : 0;

  const normalize = (view: CompositionView): CompositionView => ({
    ...view,
    constraints: [...view.constraints].sort(byCode),
    operations: [...view.operations].sort(byCode),
    warnings: [...view.warnings].sort(),
  });

  /** Forme attendue d'une opération de la prestation, résolue par son code métier. */
  const expectedOperation = (
    code: string,
    origin: 'MANDATORY' | 'OPTIONAL',
    selected: boolean,
  ): OperationView => {
    const operation = operationByCode.get(code);
    if (!operation) throw new Error(`operation ${code} absente du catalogue seed`);
    return {
      operationId: operation.id,
      code,
      label: operation.label,
      referenceDurationMinutes: operation.referenceDurationMinutes,
      origin,
      selected,
    };
  };

  const operationId = (code: string): string => {
    const operation = operationByCode.get(code);
    if (!operation) throw new Error(`operation ${code} absente du catalogue seed`);
    return operation.id;
  };

  const constraintTypeId = (code: string): string => {
    const constraintType = constraintTypeByCode.get(code);
    if (!constraintType) throw new Error(`contrainte ${code} absente du catalogue seed`);
    return constraintType.id;
  };

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

  /** Prestation du seed prête à l'emploi : lave-vaisselle encastrable, zone NORD. */
  const createDishwasherComposition = async (): Promise<CompositionView> => {
    const res = await createComposition(tenantId, {
      productTypeId: productTypeIdByCode.get('DISHWASHER_BUILTIN'),
      productRef: 'DW-8842',
      addressLine: '12 rue de Lille',
      postalCode: '59000',
      city: 'Lille',
    });
    expect(res.status).toBe(201);
    return res.body as CompositionView;
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

  beforeAll(async () => {
    // Catalogue de référence : le seed est idempotent, on peut le rejouer (FR-109).
    await seed();

    const seedTenant = await prisma.tenant.findUniqueOrThrow({
      where: { code: SEED_TENANT_CODE },
    });
    tenantId = seedTenant.id;

    for (const productType of await prisma.productType.findMany({ where: { tenantId } })) {
      productTypeIdByCode.set(productType.code, productType.id);
    }
    for (const operation of await prisma.operation.findMany({ where: { tenantId } })) {
      operationByCode.set(operation.code, {
        id: operation.id,
        label: operation.label,
        referenceDurationMinutes: operation.referenceDurationMinutes,
      });
    }
    for (const constraintType of await prisma.constraintType.findMany({ where: { tenantId } })) {
      constraintTypeByCode.set(constraintType.code, {
        id: constraintType.id,
        label: constraintType.label,
      });
    }
    for (const zone of await prisma.zone.findMany({ where: { tenantId } })) {
      zoneByCode.set(zone.code, { id: zone.id, label: zone.label });
    }

    // ---- Tenant secondaire : vérifie qu'aucune donnée ne traverse la frontière du tenant.
    const otherTenant = await prisma.tenant.create({
      data: {
        code: OTHER_TENANT_CODE,
        name: 'Enseigne de test (isolation)',
        countryCode: 'FR',
        vatRateBp: 2000,
        quoteValidityDays: 30,
      },
    });
    otherTenantId = otherTenant.id;

    const otherProductType = await prisma.productType.create({
      data: { tenantId: otherTenantId, code: 'OTHER_PRODUCT', label: 'Produit du tenant voisin' },
    });
    otherProductTypeId = otherProductType.id;

    const otherOperation = await prisma.operation.create({
      data: {
        tenantId: otherTenantId,
        code: 'OTHER_OP',
        label: 'Opération du tenant voisin',
        referenceDurationMinutes: 60,
      },
    });

    const otherConstraintType = await prisma.constraintType.create({
      data: {
        tenantId: otherTenantId,
        code: 'OTHER_CONSTRAINT',
        label: 'Contrainte du tenant voisin',
      },
    });
    otherConstraintTypeId = otherConstraintType.id;

    const otherZone = await prisma.zone.create({
      data: { tenantId: otherTenantId, code: 'OTHER_ZONE', label: 'Zone du tenant voisin' },
    });
    await prisma.zonePostalCode.create({
      data: { tenantId: otherTenantId, zoneId: otherZone.id, postalCode: '59000' },
    });
    await prisma.laborRate.create({
      data: {
        tenantId: otherTenantId,
        zoneId: otherZone.id,
        hourlyRateCents: 4000,
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await prisma.compositionRule.create({
      data: {
        tenantId: otherTenantId,
        productTypeId: otherProductTypeId,
        kind: 'REQUIRE',
        operationId: otherOperation.id,
      },
    });

    // ---- Tenant des cas limites : catalogue volontairement conflictuel.
    const edgeTenant = await prisma.tenant.create({
      data: {
        code: EDGE_TENANT_CODE,
        name: 'Enseigne de test (cas limites)',
        countryCode: 'FR',
        vatRateBp: 2000,
        quoteValidityDays: 30,
      },
    });
    edgeTenantId = edgeTenant.id;

    const edgeZone = await prisma.zone.create({
      data: { tenantId: edgeTenantId, code: 'EDGE_ZONE', label: 'Zone de test' },
    });
    await prisma.zonePostalCode.create({
      data: { tenantId: edgeTenantId, zoneId: edgeZone.id, postalCode: '59000' },
    });
    await prisma.laborRate.create({
      data: {
        tenantId: edgeTenantId,
        zoneId: edgeZone.id,
        hourlyRateCents: 4000,
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    const edgeBase = await prisma.operation.create({
      data: {
        tenantId: edgeTenantId,
        code: 'EDGE_BASE',
        label: 'Pose de test',
        referenceDurationMinutes: 60,
      },
    });
    const edgeOption = await prisma.operation.create({
      data: {
        tenantId: edgeTenantId,
        code: 'EDGE_OPTION',
        label: 'Option de test',
        referenceDurationMinutes: 20,
      },
    });
    edgeOptionOperationId = edgeOption.id;
    const edgeConflict = await prisma.operation.create({
      data: {
        tenantId: edgeTenantId,
        code: 'EDGE_CONFLICT',
        label: 'Opération en conflit',
        referenceDurationMinutes: 30,
      },
    });

    const edgeForbidConstraint = await prisma.constraintType.create({
      data: {
        tenantId: edgeTenantId,
        code: 'EDGE_FORBID_OPTION',
        label: 'Contrainte qui interdit l option',
      },
    });
    edgeForbidConstraintTypeId = edgeForbidConstraint.id;

    // Produit dont une opération est à la fois REQUIRE et FORBID : FORBID gagne.
    const edgeConflictProductType = await prisma.productType.create({
      data: { tenantId: edgeTenantId, code: 'EDGE_CONFLICT_PRODUCT', label: 'Produit incohérent' },
    });
    edgeConflictProductTypeId = edgeConflictProductType.id;
    await prisma.compositionRule.createMany({
      data: [
        {
          tenantId: edgeTenantId,
          productTypeId: edgeConflictProductTypeId,
          kind: 'REQUIRE',
          operationId: edgeBase.id,
        },
        {
          tenantId: edgeTenantId,
          productTypeId: edgeConflictProductTypeId,
          kind: 'REQUIRE',
          operationId: edgeConflict.id,
        },
        {
          tenantId: edgeTenantId,
          productTypeId: edgeConflictProductTypeId,
          kind: 'FORBID',
          operationId: edgeConflict.id,
        },
      ],
    });

    // Produit dont une contrainte interdit une option proposée.
    const edgeForbidProductType = await prisma.productType.create({
      data: {
        tenantId: edgeTenantId,
        code: 'EDGE_FORBID_PRODUCT',
        label: 'Produit à option interdite',
      },
    });
    edgeForbidProductTypeId = edgeForbidProductType.id;
    await prisma.compositionRule.createMany({
      data: [
        {
          tenantId: edgeTenantId,
          productTypeId: edgeForbidProductTypeId,
          kind: 'REQUIRE',
          operationId: edgeBase.id,
        },
        {
          tenantId: edgeTenantId,
          productTypeId: edgeForbidProductTypeId,
          kind: 'OFFER',
          operationId: edgeOption.id,
        },
        {
          tenantId: edgeTenantId,
          productTypeId: edgeForbidProductTypeId,
          constraintTypeId: edgeForbidConstraintTypeId,
          kind: 'FORBID',
          operationId: edgeOption.id,
        },
      ],
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app.close();

    const testTenantIds = [otherTenantId, edgeTenantId].filter(Boolean);

    // Prestations créées par le test (tenant du seed compris).
    const compositionIds = (
      await prisma.serviceComposition.findMany({
        where: {
          OR: [{ id: { in: createdCompositionIds } }, { tenantId: { in: testTenantIds } }],
        },
        select: { id: true },
      })
    ).map((composition) => composition.id);

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
  }, 60_000);

  describe('Story 1 : composer une prestation', () => {
    it('S1.1 : crée une prestation DRAFT avec les opérations obligatoires et optionnelles du type de produit', async () => {
      const res = await createComposition(tenantId, {
        productTypeId: productTypeIdByCode.get('DISHWASHER_BUILTIN'),
        productRef: 'DW-8842',
        addressLine: '12 rue de Lille',
        postalCode: '59000',
        city: 'Lille',
      });

      expect(res.status).toBe(201);

      const nord = zoneByCode.get('NORD');
      expect(nord).toBeDefined();

      expect(normalize(res.body as CompositionView)).toEqual({
        id: expect.any(String),
        status: 'DRAFT',
        productType: {
          id: productTypeIdByCode.get('DISHWASHER_BUILTIN'),
          code: 'DISHWASHER_BUILTIN',
          label: 'Lave-vaisselle encastrable',
        },
        productRef: 'DW-8842',
        address: { addressLine: '12 rue de Lille', postalCode: '59000', city: 'Lille' },
        zone: { id: nord?.id, code: 'NORD', label: nord?.label },
        constraints: [],
        operations: [
          expectedOperation('INSTALL', 'MANDATORY', true),
          expectedOperation('WATER_CONNECT', 'MANDATORY', true),
          expectedOperation('ELEC_CONNECT', 'MANDATORY', true),
          expectedOperation('OLD_APPLIANCE_REMOVAL', 'OPTIONAL', false),
          expectedOperation('WASTE_DISPOSAL', 'OPTIONAL', false),
          expectedOperation('FLOOR_PROTECTION', 'OPTIONAL', false),
        ].sort(byCode),
        warnings: [],
      });

      // L'opération FORBID du type de produit n'apparaît jamais.
      const codes = (res.body as CompositionView).operations.map((operation) => operation.code);
      expect(codes).not.toContain('GAS_CONNECT');
    });

    it('S1.2 : refuse un type de produit appartenant à un autre tenant (404 PRODUCT_TYPE_NOT_FOUND)', async () => {
      const res = await createComposition(tenantId, {
        productTypeId: otherProductTypeId,
        productRef: 'DW-8842',
        addressLine: '12 rue de Lille',
        postalCode: '59000',
        city: 'Lille',
      });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('PRODUCT_TYPE_NOT_FOUND');
    });

    it('S1.3 : accepte une adresse hors zone couverte avec zone nulle et un avertissement ZONE_NOT_COVERED', async () => {
      const res = await createComposition(tenantId, {
        productTypeId: productTypeIdByCode.get('DISHWASHER_BUILTIN'),
        productRef: 'DW-8842',
        addressLine: '1 rue de Rivoli',
        postalCode: '75001',
        city: 'Paris',
      });

      expect(res.status).toBe(201);
      const body = res.body as CompositionView;
      expect(body.status).toBe('DRAFT');
      expect(body.zone).toBeNull();
      expect(body.warnings).toContain('ZONE_NOT_COVERED');
    });

    it('S1.4 : refuse un corps sans productRef (400 VALIDATION_FAILED avec le champ en détail)', async () => {
      const res = await createComposition(tenantId, {
        productTypeId: productTypeIdByCode.get('DISHWASHER_BUILTIN'),
        addressLine: '12 rue de Lille',
        postalCode: '59000',
        city: 'Lille',
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.details).toBeDefined();
      expect(JSON.stringify(res.body.details)).toContain('productRef');
    });
  });

  describe('Story 2 : déclarer les contraintes du client', () => {
    it('S2.1 : déclarer NO_ELEVATOR rend CARRY_UPSTAIRS obligatoire', async () => {
      const composition = await createDishwasherComposition();
      expect(composition.operations.map((operation) => operation.code)).not.toContain(
        'CARRY_UPSTAIRS',
      );

      const res = await putConstraints(tenantId, composition.id, [constraintTypeId('NO_ELEVATOR')]);

      expect(res.status).toBe(200);
      const body = res.body as CompositionView;
      expect(body.constraints).toEqual([
        {
          id: constraintTypeId('NO_ELEVATOR'),
          code: 'NO_ELEVATOR',
          label: constraintTypeByCode.get('NO_ELEVATOR')?.label,
        },
      ]);
      expect(body.operations.find((operation) => operation.code === 'CARRY_UPSTAIRS')).toEqual(
        expectedOperation('CARRY_UPSTAIRS', 'MANDATORY', true),
      );
    });

    it('S2.2 : remplacer les contraintes par une liste vide retire CARRY_UPSTAIRS', async () => {
      const composition = await createDishwasherComposition();
      const withConstraint = await putConstraints(tenantId, composition.id, [
        constraintTypeId('NO_ELEVATOR'),
      ]);
      expect(withConstraint.status).toBe(200);
      expect(
        (withConstraint.body as CompositionView).operations.map((operation) => operation.code),
      ).toContain('CARRY_UPSTAIRS');

      const res = await putConstraints(tenantId, composition.id, []);

      expect(res.status).toBe(200);
      const body = res.body as CompositionView;
      expect(body.constraints).toEqual([]);
      expect(body.operations.map((operation) => operation.code)).not.toContain('CARRY_UPSTAIRS');
    });

    it('S2.3 : une option cochée reste cochée quand la contrainte déclarée ne la concerne pas', async () => {
      const composition = await createDishwasherComposition();

      const selection = await patchOperation(
        tenantId,
        composition.id,
        operationId('OLD_APPLIANCE_REMOVAL'),
        true,
      );
      expect(selection.status).toBe(200);

      const res = await putConstraints(tenantId, composition.id, [constraintTypeId('NO_ELEVATOR')]);

      expect(res.status).toBe(200);
      const body = res.body as CompositionView;
      expect(
        body.operations.find((operation) => operation.code === 'OLD_APPLIANCE_REMOVAL'),
      ).toEqual(expectedOperation('OLD_APPLIANCE_REMOVAL', 'OPTIONAL', true));
    });

    it('S2.4 : une contrainte qui interdit une option cochée la retire et avertit OPERATION_REMOVED', async () => {
      const created = await createComposition(edgeTenantId, {
        productTypeId: edgeForbidProductTypeId,
        productRef: 'EDGE-1',
        addressLine: '3 rue du Test',
        postalCode: '59000',
        city: 'Lille',
      });
      expect(created.status).toBe(201);
      const composition = created.body as CompositionView;

      const selection = await patchOperation(
        edgeTenantId,
        composition.id,
        edgeOptionOperationId,
        true,
      );
      expect(selection.status).toBe(200);

      const res = await putConstraints(edgeTenantId, composition.id, [edgeForbidConstraintTypeId]);

      expect(res.status).toBe(200);
      const body = res.body as CompositionView;
      expect(body.operations.map((operation) => operation.code)).not.toContain('EDGE_OPTION');
      expect(body.warnings).toContain('OPERATION_REMOVED:EDGE_OPTION');
    });

    it('S2.5 : refuse un constraintTypeId inconnu du tenant (404 CONSTRAINT_TYPE_NOT_FOUND) et laisse la prestation inchangée', async () => {
      const composition = await createDishwasherComposition();
      const before = await getComposition(tenantId, composition.id);
      expect(before.status).toBe(200);

      const res = await putConstraints(tenantId, composition.id, [
        constraintTypeId('HARD_ACCESS'),
        otherConstraintTypeId,
      ]);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CONSTRAINT_TYPE_NOT_FOUND');

      const after = await getComposition(tenantId, composition.id);
      expect(after.status).toBe(200);
      expect(normalize(after.body as CompositionView)).toEqual(
        normalize(before.body as CompositionView),
      );
    });
  });

  describe('Story 3 : choisir les options', () => {
    it('S3.1 : cocher une opération optionnelle la passe à selected = true', async () => {
      const composition = await createDishwasherComposition();

      const res = await patchOperation(
        tenantId,
        composition.id,
        operationId('WASTE_DISPOSAL'),
        true,
      );

      expect(res.status).toBe(200);
      expect(
        (res.body as CompositionView).operations.find(
          (operation) => operation.code === 'WASTE_DISPOSAL',
        ),
      ).toEqual(expectedOperation('WASTE_DISPOSAL', 'OPTIONAL', true));

      const reread = await getComposition(tenantId, composition.id);
      expect(reread.status).toBe(200);
      expect(
        (reread.body as CompositionView).operations.find(
          (operation) => operation.code === 'WASTE_DISPOSAL',
        )?.selected,
      ).toBe(true);
    });

    it('S3.2 : refuse de décocher une opération obligatoire (422 OPERATION_MANDATORY)', async () => {
      const composition = await createDishwasherComposition();

      const res = await patchOperation(tenantId, composition.id, operationId('INSTALL'), false);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('OPERATION_MANDATORY');

      const reread = await getComposition(tenantId, composition.id);
      expect(
        (reread.body as CompositionView).operations.find(
          (operation) => operation.code === 'INSTALL',
        )?.selected,
      ).toBe(true);
    });

    it('S3.3 : refuse une opération absente de la prestation (404 OPERATION_NOT_IN_COMPOSITION)', async () => {
      const composition = await createDishwasherComposition();

      const res = await patchOperation(tenantId, composition.id, operationId('GAS_CONNECT'), true);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('OPERATION_NOT_IN_COMPOSITION');
    });
  });

  describe('Story 4 : consulter une prestation', () => {
    it('S4.1 : GET /compositions/:id renvoie le même corps que la création, à jour', async () => {
      const created = await createComposition(tenantId, {
        productTypeId: productTypeIdByCode.get('WATER_HEATER_ELEC'),
        productRef: 'WH-1201',
        addressLine: '5 grande rue',
        postalCode: '59100',
        city: 'Roubaix',
      });
      expect(created.status).toBe(201);
      const composition = created.body as CompositionView;

      const asCreated = await getComposition(tenantId, composition.id);
      expect(asCreated.status).toBe(200);
      expect(normalize(asCreated.body as CompositionView)).toEqual(normalize(composition));

      // À jour : après une sélection d'option, la lecture reflète le nouvel état.
      const selection = await patchOperation(
        tenantId,
        composition.id,
        operationId('WASTE_DISPOSAL'),
        true,
      );
      expect(selection.status).toBe(200);

      const afterUpdate = await getComposition(tenantId, composition.id);
      expect(afterUpdate.status).toBe(200);
      expect(
        (afterUpdate.body as CompositionView).operations.find(
          (operation) => operation.code === 'WASTE_DISPOSAL',
        ),
      ).toEqual(expectedOperation('WASTE_DISPOSAL', 'OPTIONAL', true));
    });

    it('S4.2 : une prestation d un autre tenant renvoie 404 COMPOSITION_NOT_FOUND', async () => {
      const created = await createComposition(otherTenantId, {
        productTypeId: otherProductTypeId,
        productRef: 'OTHER-1',
        addressLine: '7 rue Voisine',
        postalCode: '59000',
        city: 'Lille',
      });
      expect(created.status).toBe(201);
      const foreignCompositionId = (created.body as CompositionView).id;

      const res = await getComposition(tenantId, foreignCompositionId);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('COMPOSITION_NOT_FOUND');
    });

    it('S4.3 : les écritures sur une prestation d un autre tenant renvoient aussi 404 COMPOSITION_NOT_FOUND', async () => {
      const created = await createComposition(otherTenantId, {
        productTypeId: otherProductTypeId,
        productRef: 'OTHER-2',
        addressLine: '9 rue Voisine',
        postalCode: '59000',
        city: 'Lille',
      });
      expect(created.status).toBe(201);
      const foreignCompositionId = (created.body as CompositionView).id;

      const constraints = await putConstraints(tenantId, foreignCompositionId, []);
      expect(constraints.status).toBe(404);
      expect(constraints.body.code).toBe('COMPOSITION_NOT_FOUND');

      const operation = await patchOperation(
        tenantId,
        foreignCompositionId,
        operationId('WASTE_DISPOSAL'),
        true,
      );
      expect(operation.status).toBe(404);
      expect(operation.body.code).toBe('COMPOSITION_NOT_FOUND');
    });
  });

  describe('Story 5 : lire le catalogue', () => {
    it('S5.1 : les trois endpoints ne renvoient que les éléments du tenant courant', async () => {
      const productTypes = await request(app.getHttpServer())
        .get('/catalog/product-types')
        .set('X-Tenant-Id', tenantId);
      expect(productTypes.status).toBe(200);
      expect((productTypes.body as CatalogItemView[]).slice().sort(byCode)).toEqual([
        expect.objectContaining({
          id: productTypeIdByCode.get('DISHWASHER_BUILTIN'),
          code: 'DISHWASHER_BUILTIN',
          label: 'Lave-vaisselle encastrable',
        }),
        expect.objectContaining({
          id: productTypeIdByCode.get('WATER_HEATER_ELEC'),
          code: 'WATER_HEATER_ELEC',
          label: 'Chauffe-eau électrique',
        }),
      ]);

      const operations = await request(app.getHttpServer())
        .get('/catalog/operations')
        .set('X-Tenant-Id', tenantId);
      expect(operations.status).toBe(200);
      expect((operations.body as CatalogItemView[]).slice().sort(byCode)).toEqual(
        [
          { code: 'CARRY_UPSTAIRS', label: 'Portage en étage', referenceDurationMinutes: 30 },
          { code: 'ELEC_CONNECT', label: 'Raccordement électrique', referenceDurationMinutes: 30 },
          { code: 'FLOOR_PROTECTION', label: 'Protection des sols', referenceDurationMinutes: 10 },
          { code: 'GAS_CONNECT', label: 'Raccordement gaz', referenceDurationMinutes: 45 },
          { code: 'INSTALL', label: 'Pose', referenceDurationMinutes: 60 },
          {
            code: 'OLD_APPLIANCE_REMOVAL',
            label: 'Dépose ancien appareil',
            referenceDurationMinutes: 20,
          },
          { code: 'WASTE_DISPOSAL', label: 'Évacuation déchets', referenceDurationMinutes: 15 },
          { code: 'WATER_CONNECT', label: 'Raccordement eau', referenceDurationMinutes: 30 },
        ]
          .sort(byCode)
          .map((operation) =>
            expect.objectContaining({
              id: operationByCode.get(operation.code)?.id,
              ...operation,
            }),
          ),
      );

      const constraintTypes = await request(app.getHttpServer())
        .get('/catalog/constraint-types')
        .set('X-Tenant-Id', tenantId);
      expect(constraintTypes.status).toBe(200);
      expect((constraintTypes.body as CatalogItemView[]).map((item) => item.code).sort()).toEqual(
        [
          'HARD_ACCESS',
          'LOAD_BEARING_WALL',
          'NO_ELEVATOR',
          'NO_WATER_INLET',
          'OLD_APPLIANCE_REMOVAL',
        ].sort(),
      );

      // Le tenant secondaire ne voit que son propre catalogue.
      const otherProductTypes = await request(app.getHttpServer())
        .get('/catalog/product-types')
        .set('X-Tenant-Id', otherTenantId);
      expect(otherProductTypes.status).toBe(200);
      expect((otherProductTypes.body as CatalogItemView[]).map((item) => item.code)).toEqual([
        'OTHER_PRODUCT',
      ]);

      const otherOperations = await request(app.getHttpServer())
        .get('/catalog/operations')
        .set('X-Tenant-Id', otherTenantId);
      expect(otherOperations.status).toBe(200);
      expect((otherOperations.body as CatalogItemView[]).map((item) => item.code)).toEqual([
        'OTHER_OP',
      ]);

      const otherConstraintTypes = await request(app.getHttpServer())
        .get('/catalog/constraint-types')
        .set('X-Tenant-Id', otherTenantId);
      expect(otherConstraintTypes.status).toBe(200);
      expect((otherConstraintTypes.body as CatalogItemView[]).map((item) => item.code)).toEqual([
        'OTHER_CONSTRAINT',
      ]);
    });
  });

  describe('Cas limites', () => {
    it('CL1 : une opération à la fois FORBID et REQUIRE est interdite et avertit CATALOG_INCONSISTENT', async () => {
      const res = await createComposition(edgeTenantId, {
        productTypeId: edgeConflictProductTypeId,
        productRef: 'EDGE-2',
        addressLine: '11 rue du Test',
        postalCode: '59000',
        city: 'Lille',
      });

      expect(res.status).toBe(201);
      const body = res.body as CompositionView;
      expect(body.operations.map((operation) => operation.code)).toEqual(['EDGE_BASE']);
      expect(body.warnings).toContain('CATALOG_INCONSISTENT:EDGE_CONFLICT');
    });

    it('CL2 : le seed est idempotent, le rejouer ne duplique pas le catalogue', async () => {
      await seed();

      const [productTypes, operations, constraintTypes, zones, postalCodes] = await Promise.all([
        prisma.productType.count({ where: { tenantId } }),
        prisma.operation.count({ where: { tenantId } }),
        prisma.constraintType.count({ where: { tenantId } }),
        prisma.zone.count({ where: { tenantId } }),
        prisma.zonePostalCode.count({ where: { tenantId } }),
      ]);

      expect(productTypes).toBe(2);
      expect(operations).toBe(8);
      expect(constraintTypes).toBe(5);
      expect(zones).toBe(2);
      expect(postalCodes).toBe(8);

      // Les identifiants du catalogue ne bougent pas d'un rejeu à l'autre.
      const install = await prisma.operation.findFirstOrThrow({
        where: { tenantId, code: 'INSTALL' },
      });
      expect(install.id).toBe(operationId('INSTALL'));
    });

    it('CL3 : un code postal couvert par une autre zone du tenant résout cette zone', async () => {
      const res = await createComposition(tenantId, {
        productTypeId: productTypeIdByCode.get('WATER_HEATER_ELEC'),
        productRef: 'WH-1202',
        addressLine: '4 rue d Arras',
        postalCode: '62000',
        city: 'Arras',
      });

      expect(res.status).toBe(201);
      const pdc = zoneByCode.get('PDC');
      expect((res.body as CompositionView).zone).toEqual({
        id: pdc?.id,
        code: 'PDC',
        label: pdc?.label,
      });
      expect((res.body as CompositionView).warnings).not.toContain('ZONE_NOT_COVERED');
    });
  });
});
