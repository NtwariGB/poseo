import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import {
  CatalogRepository,
  CompositionRuleRow,
} from '../catalog/catalog.repository';
import { CatalogItemView } from '../catalog/catalog.view';
import { InvariantViolationError } from '../common/errors/invariant-violation-error';
import { NotFoundError } from '../common/errors/not-found-error';
import {
  CompositionRepository,
  CompositionRecord,
} from './composition.repository';
import { CompositionRules, ZONE_NOT_COVERED } from './composition.rules';
import { buildCompositionView, CompositionView } from './composition.view';
import { CreateCompositionDto } from './dto/create-composition.dto';
import { ReplaceConstraintsDto } from './dto/replace-constraints.dto';
import { SelectOperationDto } from './dto/select-operation.dto';

/** Ce que le référentiel apporte au moteur de règles pour un type de produit donné. */
interface CompositionContext {
  /** Codes métier des opérations du tenant, pour trier et libeller les avertissements. */
  operationCodesById: Map<string, string>;
  rules: CompositionRuleRow[];
}

/**
 * Composition d'une prestation (FR-101 à FR-104). Orchestre : lecture du référentiel,
 * application du moteur pur, persistance, assemblage de la représentation FR-108.
 */
@Injectable()
export class CompositionService {
  constructor(
    private readonly catalog: CatalogRepository,
    private readonly compositions: CompositionRepository,
  ) {}

  /** FR-101 : résout la zone, applique les règles du type de produit, persiste. */
  async create(
    tenantId: string,
    dto: CreateCompositionDto,
  ): Promise<CompositionView> {
    const productType = await this.catalog.findProductType(
      tenantId,
      dto.productTypeId,
    );
    if (!productType) {
      throw new NotFoundError(
        'PRODUCT_TYPE_NOT_FOUND',
        `Type de produit ${dto.productTypeId} inconnu.`,
      );
    }

    const context = await this.loadContext(tenantId, productType.id);
    const resolved = CompositionRules.resolve({
      rules: context.rules,
      declaredConstraintTypeIds: [],
      currentOperations: [],
      operationCodesById: context.operationCodesById,
    });

    const record = await this.compositions.create({
      tenantId,
      productTypeId: productType.id,
      productRef: dto.productRef,
      addressLine: dto.addressLine,
      postalCode: dto.postalCode,
      city: dto.city,
      operations: resolved.operations,
    });

    const zone = await this.catalog.findZoneByPostalCode(
      tenantId,
      record.postalCode,
    );

    return this.toView(record, zone, [
      resolved.catalogWarnings,
      this.zoneWarnings(zone),
    ]);
  }

  /**
   * FR-102 / FR-112 : remplace l'ensemble des contraintes et recompose. Les identifiants sont
   * tous vérifiés avant la moindre écriture : un seul inconnu laisse la prestation intacte.
   */
  async replaceConstraints(
    tenantId: string,
    compositionId: string,
    dto: ReplaceConstraintsDto,
  ): Promise<CompositionView> {
    const record = await this.load(tenantId, compositionId);
    CompositionRules.assertDraft(record.status);

    const requested = [...new Set(dto.constraintTypeIds)];
    const constraintTypes = await this.catalog.findConstraintTypesByIds(
      tenantId,
      requested,
    );
    if (constraintTypes.length !== requested.length) {
      const known = new Set(constraintTypes.map((constraint) => constraint.id));
      throw new NotFoundError(
        'CONSTRAINT_TYPE_NOT_FOUND',
        'Une ou plusieurs contraintes sont inconnues de ce tenant.',
        { constraintTypeIds: requested.filter((id) => !known.has(id)) },
      );
    }

    const context = await this.loadContext(tenantId, record.productTypeId);
    const resolved = CompositionRules.resolve({
      rules: context.rules,
      declaredConstraintTypeIds: requested,
      currentOperations: record.operations,
      operationCodesById: context.operationCodesById,
    });

    const updated = await this.compositions.replaceConstraintsAndOperations(
      tenantId,
      record.id,
      requested,
      resolved.operations,
    );
    if (!updated) {
      // La prestation a cessé d'appartenir à ce tenant entre la lecture et l'écriture :
      // rien n'a été écrit, et on répond comme si elle n'existait pas (Q4).
      throw new NotFoundError(
        'COMPOSITION_NOT_FOUND',
        `Prestation ${record.id} inconnue.`,
      );
    }

    const zone = await this.catalog.findZoneByPostalCode(
      tenantId,
      updated.postalCode,
    );

    return this.toView(updated, zone, [
      resolved.catalogWarnings,
      resolved.differenceWarnings,
      this.zoneWarnings(zone),
    ]);
  }

  /** FR-103 : ne change que le choix du vendeur, sans recomposer. */
  async selectOperation(
    tenantId: string,
    compositionId: string,
    operationId: string,
    dto: SelectOperationDto,
  ): Promise<CompositionView> {
    const record = await this.load(tenantId, compositionId);
    CompositionRules.assertDraft(record.status);

    const operation = record.operations.find(
      (candidate) => candidate.operationId === operationId,
    );
    if (!operation) {
      throw new NotFoundError(
        'OPERATION_NOT_IN_COMPOSITION',
        `Opération ${operationId} absente de la prestation.`,
      );
    }

    if (operation.origin === 'MANDATORY') {
      // Le vendeur ne peut pas retirer une obligatoire (règle métier 1). La recocher est
      // sans effet : l'état demandé est déjà l'état courant.
      if (!dto.selected) {
        throw new InvariantViolationError(
          'OPERATION_MANDATORY',
          `Opération ${operation.code} obligatoire : elle ne peut pas être retirée.`,
        );
      }
      return this.read(tenantId, record);
    }

    const updated = await this.compositions.updateOperationSelection(
      tenantId,
      record.id,
      operationId,
      dto.selected,
    );
    if (!updated) {
      // L'opération a disparu de la prestation entre la lecture et l'écriture :
      // rien n'a été écrit.
      throw new NotFoundError(
        'OPERATION_NOT_IN_COMPOSITION',
        `Opération ${operationId} absente de la prestation.`,
      );
    }

    return this.read(tenantId, updated);
  }

  /** FR-104 : la prestation telle qu'elle est stockée, ses avertissements d'état recalculés. */
  async findOne(
    tenantId: string,
    compositionId: string,
  ): Promise<CompositionView> {
    return this.read(tenantId, await this.load(tenantId, compositionId));
  }

  /**
   * Lecture d'une prestation déjà chargée : les opérations viennent de la base, seuls les
   * avertissements d'état sont recalculés (zone couverte, cohérence du catalogue). Les
   * avertissements de différence n'existent que dans la réponse de l'écriture qui les produit.
   */
  private async read(
    tenantId: string,
    record: CompositionRecord,
  ): Promise<CompositionView> {
    const [zone, context] = await Promise.all([
      this.catalog.findZoneByPostalCode(tenantId, record.postalCode),
      this.loadContext(tenantId, record.productTypeId),
    ]);

    const resolved = CompositionRules.resolve({
      rules: context.rules,
      declaredConstraintTypeIds: record.constraints.map(
        (constraint) => constraint.id,
      ),
      currentOperations: record.operations,
      operationCodesById: context.operationCodesById,
    });

    return this.toView(record, zone, [
      resolved.catalogWarnings,
      this.zoneWarnings(zone),
    ]);
  }

  private async load(
    tenantId: string,
    compositionId: string,
  ): Promise<CompositionRecord> {
    // Un identifiant mal formé est traité comme absent : on ne révèle jamais l'existence
    // d'une prestation, et on ne distingue pas « pas à vous » de « inconnue » (S4.2).
    const record = isUUID(compositionId)
      ? await this.compositions.findForTenant(tenantId, compositionId)
      : null;

    if (!record) {
      throw new NotFoundError(
        'COMPOSITION_NOT_FOUND',
        `Prestation ${compositionId} inconnue.`,
      );
    }

    return record;
  }

  private async loadContext(
    tenantId: string,
    productTypeId: string,
  ): Promise<CompositionContext> {
    const [operations, rules] = await Promise.all([
      this.catalog.findOperations(tenantId),
      this.catalog.findCompositionRules(tenantId, productTypeId),
    ]);

    return {
      operationCodesById: new Map(
        operations.map((operation) => [operation.id, operation.code]),
      ),
      rules,
    };
  }

  private zoneWarnings(zone: CatalogItemView | null): string[] {
    // Règle métier 4 : hors zone, la prestation existe mais ne pourra pas être chiffrée.
    return zone ? [] : [ZONE_NOT_COVERED];
  }

  private toView(
    record: CompositionRecord,
    zone: CatalogItemView | null,
    warningGroups: readonly string[][],
  ): CompositionView {
    return buildCompositionView({
      id: record.id,
      status: record.status,
      productType: record.productType,
      productRef: record.productRef,
      addressLine: record.addressLine,
      postalCode: record.postalCode,
      city: record.city,
      zone,
      constraints: record.constraints,
      operations: record.operations,
      warnings: CompositionRules.mergeWarnings(...warningGroups),
    });
  }
}
