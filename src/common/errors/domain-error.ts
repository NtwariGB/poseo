/**
 * Erreur métier. Porte son code stable, le statut HTTP correspondant et, si besoin,
 * des détails structurés. Convertie en réponse HTTP par le filtre global.
 */
export abstract class DomainError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly details?: unknown;

  protected constructor(
    code: string,
    httpStatus: number,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}
