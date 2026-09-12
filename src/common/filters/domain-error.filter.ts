import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { DomainError } from '../errors/domain-error';

/**
 * Donne à toute erreur métier la même forme HTTP : statut porté par l'erreur,
 * corps `{ code, message, details? }`.
 */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter<DomainError> {
  private readonly logger = new Logger(DomainErrorFilter.name);

  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    this.logger.debug(
      `${exception.code} (${exception.httpStatus}): ${exception.message}`,
    );

    const body: { code: string; message: string; details?: unknown } = {
      code: exception.code,
      message: exception.message,
    };
    if (exception.details !== undefined) {
      body.details = exception.details;
    }

    response.status(exception.httpStatus).json(body);
  }
}
