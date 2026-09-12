import { Injectable } from '@nestjs/common';
import { CatalogItemView } from '../catalog/catalog.view';
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
   */
  async replaceConstraintsAndOperations(
    compositionId: string,
    constraintTypeIds: readonly string[],
    operations: readonly CompositionOperationState[],
  ): Promise<CompositionRecord> {
    const keptOperationIds = operations.map(
      (operation) => operation.operationId,
    );

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.serviceConstraint.deleteMany({ where: { compositionId } });
      if (constraintTypeIds.length > 0) {
        await tx.serviceConstraint.createMany({
          data: constraintTypeIds.map((constraintTypeId) => ({
            compositionId,
            constraintTypeId,
          })),
        });
      }

      await tx.serviceOperation.deleteMany({
        where: { compositionId, operationId: { notIn: keptOperationIds } },
      });
      for (const operation of operations) {
        await tx.serviceOperation.upsert({
          where: {
            compositionId_operationId: {
              compositionId,
              operationId: operation.operationId,
            },
          },
          create: {
            compositionId,
            operationId: operation.operationId,
            origin: operation.origin,
            selected: operation.selected,
          },
          update: { origin: operation.origin, selected: operation.selected },
        });
      }

      // `updatedAt` ne bouge que si la prestation elle-même est touchée.
      return tx.serviceComposition.update({
        where: { id: compositionId },
        data: {},
        select: COMPOSITION_SELECT,
      });
    });

    return toRecord(row);
  }

  /** FR-103 : ne touche que le choix du vendeur sur une opération déjà retenue. */
  async updateOperationSelection(
    compositionId: string,
    operationId: string,
    selected: boolean,
  ): Promise<CompositionRecord> {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.serviceOperation.update({
        where: { compositionId_operationId: { compositionId, operationId } },
        data: { selected },
      });

      return tx.serviceComposition.update({
        where: { id: compositionId },
        data: {},
        select: COMPOSITION_SELECT,
      });
    });

    return toRecord(row);
  }
}
