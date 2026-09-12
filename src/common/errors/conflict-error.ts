import { DomainError } from './domain-error';

/** Conflit avec l'état courant : unicité, concurrence. */
export class ConflictError extends DomainError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, 409, message, details);
  }
}
