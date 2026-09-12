import { DomainError } from './domain-error';

/** Entrée invalide : en-tête mal formé, DTO refusé par class-validator. */
export class ValidationError extends DomainError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, 400, message, details);
  }
}
