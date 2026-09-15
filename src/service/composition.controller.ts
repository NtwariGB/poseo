import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import type { CurrentTenantContext } from '../tenant/current-tenant';
import { CurrentTenant } from '../tenant/current-tenant.decorator';
import { CompositionService } from './composition.service';
import { CompositionView } from './composition.view';
import { CreateCompositionDto } from './dto/create-composition.dto';
import { ReplaceConstraintsDto } from './dto/replace-constraints.dto';
import { SelectOperationDto } from './dto/select-operation.dto';

/** FR-101 à FR-104. Validation du corps et délégation : aucune règle métier ici. */
@Controller('compositions')
export class CompositionController {
  constructor(private readonly compositions: CompositionService) {}

  @Post()
  create(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Body() dto: CreateCompositionDto,
  ): Promise<CompositionView> {
    return this.compositions.create(tenant.id, dto);
  }

  @Get(':id')
  findOne(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param('id') id: string,
  ): Promise<CompositionView> {
    return this.compositions.findOne(tenant.id, id);
  }

  @Put(':id/constraints')
  replaceConstraints(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param('id') id: string,
    @Body() dto: ReplaceConstraintsDto,
  ): Promise<CompositionView> {
    return this.compositions.replaceConstraints(tenant.id, id, dto);
  }

  @Patch(':id/operations/:operationId')
  selectOperation(
    @CurrentTenant() tenant: CurrentTenantContext,
    @Param('id') id: string,
    @Param('operationId') operationId: string,
    @Body() dto: SelectOperationDto,
  ): Promise<CompositionView> {
    return this.compositions.selectOperation(tenant.id, id, operationId, dto);
  }
}
