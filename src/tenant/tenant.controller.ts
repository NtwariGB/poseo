import { Controller, Get } from '@nestjs/common';
import type { CurrentTenantContext } from './current-tenant';
import { CurrentTenant } from './current-tenant.decorator';

/**
 * Sonde du socle (FR-009) : vérifie le middleware et le décorateur.
 * Sonde conservée pour les tests du lot 0.
 */
@Controller('tenant')
export class TenantController {
  @Get('me')
  me(@CurrentTenant() tenant: CurrentTenantContext): CurrentTenantContext {
    return tenant;
  }
}
