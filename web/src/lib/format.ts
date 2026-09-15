/**
 * Mise en forme d'affichage uniquement. Aucun montant, aucun statut, aucune éligibilité
 * n'est calculé ici : ces fonctions traduisent ce que l'API a déjà décidé.
 */

const EUROS = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

const DATE = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** UI-306 : les montants arrivent en centimes (ADR 0006), ils s'affichent en euros. */
export const euros = (cents: number): string => EUROS.format(cents / 100);

/** Les taux arrivent en points de base : 2000 bp se lit 20 %. */
export const percent = (basisPoints: number): string =>
  `${(basisPoints / 100).toLocaleString('fr-FR')} %`;

export const duration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
};

export const date = (iso: string): string => DATE.format(new Date(iso));
export const dateTime = (iso: string): string => DATE_TIME.format(new Date(iso));

const QUOTE_STATUS: Record<string, string> = {
  ISSUED: 'Émis',
  ACCEPTED: 'Accepté',
  EXPIRED: 'Expiré',
  SUPERSEDED: 'Remplacé',
};

const COMPOSITION_STATUS: Record<string, string> = {
  DRAFT: 'En cours',
  QUOTED: 'Devis émis',
  ACCEPTED: 'Acceptée',
};

/** Traduction de libellé, pas de déduction : le statut vient du serveur. */
export const quoteStatus = (status: string): string =>
  QUOTE_STATUS[status] ?? status;

export const compositionStatus = (status: string): string =>
  COMPOSITION_STATUS[status] ?? status;

export const operationOrigin = (origin: string): string =>
  origin === 'MANDATORY' ? 'Obligatoire' : 'Option';

/**
 * Les avertissements de FR-108 arrivent en codes. Phrase française pour les deux codes
 * connus, code brut en repli pour tout code ajouté plus tard côté serveur.
 */
export const warning = (code: string): string => {
  if (code === 'ZONE_NOT_COVERED') {
    return "Aucune zone d'intervention ne couvre ce code postal : la prestation ne pourra pas être chiffrée.";
  }
  if (code.startsWith('OPERATION_REMOVED:')) {
    const operation = code.slice('OPERATION_REMOVED:'.length);
    return `L'option ${operation} a été retirée : elle n'est plus proposée pour cette situation.`;
  }
  return code;
};
