import { Logger } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';
import { HealthRepository } from './health.repository';

describe('HealthController', () => {
  let queryRaw: jest.Mock;
  let status: jest.Mock;
  let response: Response;
  let controller: HealthController;

  beforeEach(() => {
    queryRaw = jest.fn();
    status = jest.fn();
    response = { status } as unknown as Response;
    controller = new HealthController(
      new HealthRepository({ $queryRaw: queryRaw } as unknown as PrismaService),
    );
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rend ok quand la base répond', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(controller.check(response)).resolves.toEqual({
      status: 'ok',
      db: 'up',
    });
    expect(queryRaw).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it('rend 503 et db down quand la base est injoignable', async () => {
    queryRaw.mockRejectedValue(new Error('connexion refusée'));

    await expect(controller.check(response)).resolves.toEqual({
      status: 'error',
      db: 'down',
    });
    expect(status).toHaveBeenCalledWith(503);
  });
});
