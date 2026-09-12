/** Tenant résolu pour la requête courante. */
export interface CurrentTenantContext {
  id: string;
  code: string;
}

/** En-tête porteur du tenant, en minuscules comme le normalise Node. */
export const TENANT_HEADER = 'x-tenant-id';

declare global {
  namespace Express {
    interface Request {
      tenant?: CurrentTenantContext;
    }
  }
}
