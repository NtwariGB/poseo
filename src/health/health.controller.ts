import { Controller, Get, HttpStatus, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthRepository } from './health.repository';

type HealthBody = { status: 'ok' | 'error'; db: 'up' | 'down' };

/** Sonde technique. Exemptée du tenant (FR-004). */
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly health: HealthRepository) {}

  @Get()
  async check(
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthBody> {
    try {
      await this.health.ping();
      return { status: 'ok', db: 'up' };
    } catch (error) {
      this.logger.error('Sonde base en échec', error as Error);
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'error', db: 'down' };
    }
  }
}
