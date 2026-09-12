import { ArgumentsHost } from '@nestjs/common';
import { ConflictError } from '../errors/conflict-error';
import { InvariantViolationError } from '../errors/invariant-violation-error';
import { NotFoundError } from '../errors/not-found-error';
import { ValidationError } from '../errors/validation-error';
import { DomainErrorFilter } from './domain-error.filter';

describe('DomainErrorFilter', () => {
  let json: jest.Mock;
  let status: jest.Mock;
  let host: ArgumentsHost;
  let filter: DomainErrorFilter;

  beforeEach(() => {
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;
    filter = new DomainErrorFilter();
  });

  it('rend code et message sur le statut porté par l erreur', () => {
    filter.catch(new NotFoundError('TENANT_NOT_FOUND', 'Tenant inconnu.'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      code: 'TENANT_NOT_FOUND',
      message: 'Tenant inconnu.',
    });
  });

  it('ajoute details quand l erreur en porte', () => {
    const details = [{ field: 'productRef', constraints: ['obligatoire'] }];
    filter.catch(
      new ValidationError('VALIDATION_FAILED', 'Requête invalide.', details),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      code: 'VALIDATION_FAILED',
      message: 'Requête invalide.',
      details,
    });
  });

  it('omet details quand l erreur n en porte pas', () => {
    filter.catch(new ValidationError('BAD', 'Invalide.'), host);

    expect(json).toHaveBeenCalledWith({ code: 'BAD', message: 'Invalide.' });
  });

  it('reprend le statut de chaque sous-classe', () => {
    filter.catch(new ConflictError('CONFLICT', 'Conflit.'), host);
    expect(status).toHaveBeenCalledWith(409);

    filter.catch(new InvariantViolationError('INVARIANT', 'Invariant.'), host);
    expect(status).toHaveBeenCalledWith(422);
  });
});
