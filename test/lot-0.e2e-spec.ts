import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { AppModule } from '../src/app.module';

// Client Prisma propre au test : on ne dépend pas de ce que l'agent écrira dans l'application.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TENANT_CODE = 'TEST-LOT0';
const UNKNOWN_TENANT = '0199a4c0-0000-7000-8000-000000000000';

describe('Lot 0 : socle technique', () => {
  let app: INestApplication;
  let tenantId: string;

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: {
        code: TENANT_CODE,
        name: 'Tenant de test lot 0',
        countryCode: 'FR',
        vatRateBp: 2000,
        quoteValidityDays: 30,
      },
    });
    tenantId = tenant.id;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.tenant.delete({ where: { code: TENANT_CODE } });
    await prisma.$disconnect();
  });

  describe('Story 1 : accès à la base partagé', () => {
    it('GET /health répond 200 avec db up', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok', db: 'up' });
    });
  });

  describe('Story 2 : identification du tenant', () => {
    it('rejette une requête sans X-Tenant-Id', async () => {
      const res = await request(app.getHttpServer()).get('/tenant/me');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('TENANT_HEADER_MISSING');
    });

    it('rejette un X-Tenant-Id qui n est pas un UUID', async () => {
      const res = await request(app.getHttpServer())
        .get('/tenant/me')
        .set('X-Tenant-Id', 'pas-un-uuid');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('TENANT_HEADER_INVALID');
    });

    it('rejette un tenant inconnu', async () => {
      const res = await request(app.getHttpServer())
        .get('/tenant/me')
        .set('X-Tenant-Id', UNKNOWN_TENANT);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('TENANT_NOT_FOUND');
    });

    it('expose le tenant courant sur une route métier', async () => {
      const res = await request(app.getHttpServer())
        .get('/tenant/me')
        .set('X-Tenant-Id', tenantId);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: tenantId, code: TENANT_CODE });
    });

    it('n exige pas de tenant sur /health', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(200);
    });
  });

  describe('Story 3 : erreurs métier uniformes', () => {
    it('renvoie code, message et details sur une erreur de validation', async () => {
      const res = await request(app.getHttpServer())
        .get('/tenant/me')
        .set('X-Tenant-Id', 'pas-un-uuid');
      expect(res.body).toEqual(
        expect.objectContaining({
          code: expect.any(String),
          message: expect.any(String),
        }),
      );
    });
  });
});
