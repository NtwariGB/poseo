import { Injectable, NestMiddleware } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { NextFunction, Request, Response } from 'express';
import { NotFoundError } from '../common/errors/not-found-error';
import { ValidationError } from '../common/errors/validation-error';
import { CurrentTenantContext, TENANT_HEADER } from './current-tenant';
import { TenantRepository } from './tenant.repository';

/**
 * Résout le tenant de la requête : en-tête présent, format UUID, existence en base.
 * Attache `{ id, code }` à la requête pour `@CurrentTenant()`.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenants: TenantRepository) {}

  async use(
    request: Request,
    _response: Response,
    next: NextFunction,
  ): Promise<void> {
    const header = request.headers[TENANT_HEADER];
    const raw = (Array.isArray(header) ? header[0] : header)?.trim();

    if (!raw) {
      throw new ValidationError(
        'TENANT_HEADER_MISSING',
        `En-tête ${TENANT_HEADER} obligatoire.`,
      );
    }

    if (!isUUID(raw)) {
      throw new ValidationError(
        'TENANT_HEADER_INVALID',
        `En-tête ${TENANT_HEADER} : UUID attendu.`,
      );
    }

    const tenant: CurrentTenantContext | null =
      await this.tenants.findById(raw);

    if (!tenant) {
      throw new NotFoundError('TENANT_NOT_FOUND', `Tenant ${raw} inconnu.`);
    }

    request.tenant = tenant;
    next();
  }
}
