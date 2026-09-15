import { Injectable } from '@nestjs/common';
import { CatalogItemView } from '../catalog/catalog.view';
import type { PrismaTransaction } from '../prisma/prisma-transaction';
import { PrismaService } from '../prisma/prisma.service';
import {
  CompositionOperationState,
  CompositionStatusName,
} from './composition.rules';
import { CompositionOperationView } from './composition.view';

/** Prestation chargée avec ses contraintes et ses opérations, prête à composer ou à rendre. */
export interface CompositionRecord {
  id: string;
  status: CompositionStatusName;
  productTypeId: string;
  productType: CatalogItemView;
  productRef: string;
  addressLine: string;
  postalCode: string;
  city: string;
  constraints: CatalogItemView[];
  operations: CompositionOperationView[];
}

export interface CreateCompositionData {
  tenantId: string;
  productTypeId: string;
  productRef: string;
  addressLine: string;
  postalCode: string;
  city: string;
  operations: readonly CompositionOperationState[];
}

const CATALOG_ITEM = { id: true, code: true, label: true } as const;

const COMPOSITION_SELECT = {
  id: true,
  status: true,
  productTypeId: true,
  productRef: true,
  addressLine: true,
  postalCode: true,
  city: true,
  productType: { select: CATALOG_ITEM },
  constraints: { select: { constraintType: { select: CATALOG_ITEM } } },
  operations: {
    select: {
      operationId: true,
      origin: true,
      selected: true,
      operation: {
        select: { code: true, label: true, referenceDurationMinutes: true },
      },
    },
  },
} as const;

type CompositionRow = {
  id: string;
  status: CompositionStatusName;
  productTypeId: string;
  productRef: string;
  addressLine: string;
  postalCode: string;
  city: string;
  productType: CatalogItemView;
  constraints: { constraintType: CatalogItemView }[];
  operations: {
    operationId: string;
    origin: CompositionOperationView['origin'];
    selected: boolean;
    operation: {
      code: string;
      label: string;
      referenceDurationMinutes: number;
    };
  }[];
};

const toRecord = (row: CompositionRow): CompositionRecord => ({
  id: row.id,
  status: row.status,
  productTypeId: row.productTypeId,
  productType: row.productType,
  productRef: row.productRef,
  addressLine: row.addressLine,
  postalCode: row.postalCode,
  city: row.city,
  constraints: row.constraints.map((declared) => declared.constraintType),
  operations: row.operations.map((operation) => ({
    operationId: operation.operationId,
    code: operation.operation.code,
    label: operation.operation.label,
    referenceDurationMinutes: operation.operation.referenceDurationMinutes,
    origin: operation.origin,
    selected: operation.selected,
  })),
});

/**
 * Seul accès Prisma de la prestation. La prestation porte `tenantId` : toute lecture et
 * toute écriture le filtrent, si bien qu'une prestation d'un autre tenant est introuvable
 * plutôt qu'interdite.
 */
@Injectable()
export class CompositionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCompositionData): Promise<CompositionRecord> {
    const row = await this.prisma.serviceComposition.create({
      data: {
        tenantId: data.tenantId,
        productTypeId: data.productTypeId,
        productRef: data.productRef,
        addressLine: data.addressLine,
        postalCode: data.postalCode,
        city: data.city,
        operations: {
          create: data.operations.map((operation) => ({
            operationId: operation.operationId,
            origin: operation.origin,
            selected: operation.selected,
          })),
        },
      },
      select: COMPOSITION_SELECT,
    });

    return toRecord(row);
  }

  async findForTenant(
    tenantId: string,
    id: string,
  ): Promise<CompositionRecord | null> {
    const row = await this.prisma.serviceComposition.findFirst({
      where: { tenantId, id },
      select: COMPOSITION_SELECT,
    });

    return row ? toRecord(row) : null;
  }

  /**
   * FR-102 : remplace d'un bloc les contraintes déclarées et les opérations retenues.
   * Une seule transaction, pour qu'aucune lecture ne voie une composition à moitié recomposée.
   *
   * Rend `null` si la prestation n'appartient pas (ou plus) au tenant : la vérification
   * faite par le service avant l'appel ne vaut que pour l'instant où elle a eu lieu, donc
   * chaque écriture refiltre sur le tenant dans la transaction qui écrit.
   */
  async replaceConstraintsAndOperations(
    tenantId: string,
    compositionId: string,
    constraintTypeIds: readonly string[],
    operations: readonly CompositionOperationState[],
  ): Promise<CompositionRecord | null> {
    const keptOperationIds = operations.map(
      (operation) => operation.operationId,
    );

    const row = await this.prisma.$transaction(async (tx) => {
      // Touche la prestation et prouve son appartenance d'un même geste : sans ligne
      // touchée, rien n'est écrit derrière.
      // `updatedAt` ne bouge que si la prestation elle-même est touchée.
      const touched = await tx.serviceComposition.updateMany({
        where: { id: compositionId, tenantId },
        data: {},
      });
      if (touched.count === 0) return null;

      await tx.serviceConstraint.deleteMany({
        where: { compositionId, composition: { tenantId } },
      });
      if (constraintTypeIds.length > 0) {
        await tx.serviceConstraint.createMany({
          data: constraintTypeIds.map((constraintTypeId) => ({
            compositionId,
            constraintTypeId,
          })),
        });
      }

      await tx.serviceOperation.deleteMany({
        where: {
          compositionId,
          composition: { tenantId },
          operationId: { notIn: keptOperationIds },
        },
      });
      for (const operation of operations) {
        // `upsert` ne prend qu'une clé unique en `where`, qui ne porte pas le tenant :
        // on écrit donc en `updateMany` filtré, et on ne crée que si rien n'a été touché.
        const updated = await tx.serviceOperation.updateMany({
          where: {
            compositionId,
            operationId: operation.operationId,
            composition: { tenantId },
          },
          data: { origin: operation.origin, selected: operation.selected },
        });
        if (updated.count === 0) {
          await tx.serviceOperation.create({
            data: {
              compositionId,
              operationId: operation.operationId,
              origin: operation.origin,
              selected: operation.selected,
            },
          });
        }
      }

      return tx.serviceComposition.findFirst({
        where: { id: compositionId, tenantId },
        select: COMPOSITION_SELECT,
      });
    });

    return row ? toRecord(row) : null;
  }

  /**
   * Statut de la prestation, écrit dans la transaction du module `quote` (FR-201, FR-205) :
   * le devis et le statut qu'il fait basculer sont commités ensemble ou pas du tout.
   * Rend `false` si la prestation n'appartient pas au tenant, sans rien écrire.
   */
  async setStatus(
    tx: PrismaTransaction,
    tenantId: string,
    compositionId: string,
    status: CompositionStatusName,
  ): Promise<boolean> {
    const updated = await tx.serviceComposition.updateMany({
      where: { id: compositionId, tenantId },
      data: { status },
    });

    return updated.count > 0;
  }

  /**
   * FR-103 : ne touche que le choix du vendeur sur une opération déjà retenue.
   * Rend `null` si l'opération n'appartient pas à une prestation de ce tenant.
   */
  async updateOperationSelection(
    tenantId: string,
    compositionId: string,
    operationId: string,
    selected: boolean,
  ): Promise<CompositionRecord | null> {
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.serviceOperation.updateMany({
        where: { compositionId, operationId, composition: { tenantId } },
        data: { selected },
      });
      if (updated.count === 0) return null;

      await tx.serviceComposition.updateMany({
        where: { id: compositionId, tenantId },
        data: {},
      });

      return tx.serviceComposition.findFirst({
        where: { id: compositionId, tenantId },
        select: COMPOSITION_SELECT,
      });
    });

    return row ? toRecord(row) : null;
  }
}
