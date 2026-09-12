import { DomainError } from './domain-error';

/** Ressource demandée absente. */
export class NotFoundError extends DomainError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, 404, message, details);
  }
}
