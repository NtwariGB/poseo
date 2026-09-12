import { Controller, Get } from '@nestjs/common';
import type { CurrentTenantContext } from './current-tenant';
import { CurrentTenant } from './current-tenant.decorator';

/**
 * Sonde du socle (FR-009) : vérifie le middleware et le décorateur.
 * À supprimer dès qu'un endpoint métier existe.
 */
@Controller('tenant')
export class TenantController {
  @Get('me')
  me(@CurrentTenant() tenant: CurrentTenantContext): CurrentTenantContext {
    return tenant;
  }
}
