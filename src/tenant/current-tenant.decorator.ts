import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { ValidationError } from '../common/errors/validation-error';
import { CurrentTenantContext, TENANT_HEADER } from './current-tenant';

/** Expose au contrôleur le tenant attaché par `TenantMiddleware`. */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentTenantContext => {
    const tenant = context.switchToHttp().getRequest<Request>().tenant;

    if (!tenant) {
      throw new ValidationError(
        'TENANT_HEADER_MISSING',
        `En-tête ${TENANT_HEADER} obligatoire.`,
      );
    }

    return tenant;
  },
);
