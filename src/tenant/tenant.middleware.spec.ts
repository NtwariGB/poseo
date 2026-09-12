import { NextFunction, Request, Response } from 'express';
import { DomainError } from '../common/errors/domain-error';
import { CurrentTenantContext } from './current-tenant';
import { TenantMiddleware } from './tenant.middleware';
import { TenantRepository } from './tenant.repository';

const TENANT_ID = '0199a4c0-1111-7000-8000-000000000000';

describe('TenantMiddleware', () => {
  let findById: jest.Mock<Promise<CurrentTenantContext | null>, [string]>;
  let middleware: TenantMiddleware;
  let next: NextFunction;

  const request = (headers: Request['headers']): Request =>
    ({ headers }) as Request;

  const run = (headers: Request['headers']): Promise<void> =>
    middleware.use(request(headers), {} as Response, next);

  const expectDomainError = async (
    headers: Request['headers'],
    code: string,
    httpStatus: number,
  ): Promise<void> => {
    await expect(run(headers)).rejects.toMatchObject({ code, httpStatus });
    await expect(run(headers)).rejects.toBeInstanceOf(DomainError);
    expect(next).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    findById = jest.fn();
    middleware = new TenantMiddleware({
      findById,
    } as unknown as TenantRepository);
    next = jest.fn();
  });

  it('refuse une requête sans en-tête', async () => {
    await expectDomainError({}, 'TENANT_HEADER_MISSING', 400);
    expect(findById).not.toHaveBeenCalled();
  });

  it('refuse un en-tête vide', async () => {
    await expectDomainError(
      { 'x-tenant-id': '   ' },
      'TENANT_HEADER_MISSING',
      400,
    );
  });

  it('refuse un en-tête qui n est pas un UUID', async () => {
    await expectDomainError(
      { 'x-tenant-id': 'pas-un-uuid' },
      'TENANT_HEADER_INVALID',
      400,
    );
    expect(findById).not.toHaveBeenCalled();
  });

  it('refuse un tenant absent de la base', async () => {
    findById.mockResolvedValue(null);
    await expectDomainError(
      { 'x-tenant-id': TENANT_ID },
      'TENANT_NOT_FOUND',
      404,
    );
    expect(findById).toHaveBeenCalledWith(TENANT_ID);
  });

  it('attache le tenant et poursuit la chaîne', async () => {
    const tenant: CurrentTenantContext = { id: TENANT_ID, code: 'FR-ACME' };
    findById.mockResolvedValue(tenant);

    const req = request({ 'x-tenant-id': TENANT_ID });
    await middleware.use(req, {} as Response, next);

    expect(req.tenant).toEqual(tenant);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
