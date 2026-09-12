import { DomainError } from './domain-error';

/** Requête bien formée mais qui casserait un invariant du domaine. */
export class InvariantViolationError extends DomainError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, 422, message, details);
  }
}
