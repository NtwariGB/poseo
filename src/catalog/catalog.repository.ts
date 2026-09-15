import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogItemView, OperationCatalogView } from './catalog.view';

/** Règle de composition telle que lue en base, réduite à ce dont le moteur a besoin. */
export interface CompositionRuleRow {
  kind: 'REQUIRE' | 'OFFER' | 'FORBID' | 'SURCHARGE';
  operationId: string | null;
  constraintTypeId: string | null;
}

const CATALOG_ITEM = { id: true, code: true, label: true } as const;

/**
 * Seul accès Prisma du référentiel. Toute requête porte `tenantId` : un tenant ne voit
 * jamais le catalogue d'un autre.
 */
@Injectable()
export class CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProductTypes(tenantId: string): Promise<CatalogItemView[]> {
    return this.prisma.productType.findMany({
      where: { tenantId },
      select: CATALOG_ITEM,
      orderBy: { code: 'asc' },
    });
  }

  findProductType(
    tenantId: string,
    productTypeId: string,
  ): Promise<CatalogItemView | null> {
    return this.prisma.productType.findFirst({
      where: { tenantId, id: productTypeId },
      select: CATALOG_ITEM,
    });
  }

  findOperations(tenantId: string): Promise<OperationCatalogView[]> {
    return this.prisma.operation.findMany({
      where: { tenantId },
      select: { ...CATALOG_ITEM, referenceDurationMinutes: true },
      orderBy: { code: 'asc' },
    });
  }

  findConstraintTypes(tenantId: string): Promise<CatalogItemView[]> {
    return this.prisma.constraintType.findMany({
      where: { tenantId },
      select: CATALOG_ITEM,
      orderBy: { code: 'asc' },
    });
  }

  /** Ne renvoie que les contraintes du tenant : un identifiant étranger est simplement absent. */
  findConstraintTypesByIds(
    tenantId: string,
    constraintTypeIds: readonly string[],
  ): Promise<CatalogItemView[]> {
    return this.prisma.constraintType.findMany({
      where: { tenantId, id: { in: [...constraintTypeIds] } },
      select: CATALOG_ITEM,
      orderBy: { code: 'asc' },
    });
  }

  /**
   * Zone couvrant ce code postal (règle métier 4). `null` si l'adresse est hors zones du tenant.
   * La zone n'est pas stockée sur la prestation, elle est résolue à chaque lecture.
   */
  async findZoneByPostalCode(
    tenantId: string,
    postalCode: string,
  ): Promise<CatalogItemView | null> {
    const covered = await this.prisma.zonePostalCode.findUnique({
      where: { tenantId_postalCode: { tenantId, postalCode } },
      select: { zone: { select: CATALOG_ITEM } },
    });

    return covered?.zone ?? null;
  }

  /** Toutes les règles du type de produit ; le filtrage par contrainte déclarée est au moteur (FR-107). */
  findCompositionRules(
    tenantId: string,
    productTypeId: string,
  ): Promise<CompositionRuleRow[]> {
    return this.prisma.compositionRule.findMany({
      where: { tenantId, productTypeId },
      select: { kind: true, operationId: true, constraintTypeId: true },
    });
  }
}
