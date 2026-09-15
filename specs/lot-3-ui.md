# Lot 3 : page de démonstration du parcours vendeur

**Branche** : `lot-3-ui`
**Créé le** : 2026-09-15
**Statut** : validé

## Objectif

Une seule page Svelte 5 qui déroule le parcours vendeur de bout en bout sur l'API existante :
composer, ajuster, émettre, accepter. Aucune règle métier côté navigateur : tout montant, tout
statut, tout warning vient du serveur.

## Périmètre

- **UI-301** : projet Vite + Svelte 5 dans `web/`, TypeScript, sans librairie UI. Proxy Vite
  `/api` → `http://localhost:3000`. Script racine `npm run web` qui lance Vite.
- **UI-302** : tenant fixé à `LM-FR` : au chargement, la page lit `GET /api/catalog/product-types`
  avec l'en-tête `X-Tenant-Id` résolu une fois (identifiant lu depuis `VITE_TENANT_ID`, ou saisi
  dans un champ en haut de page si absent).
- **UI-303** : bloc « Prestation » : sélection du type de produit, référence produit, adresse,
  code postal, ville, bouton « Composer » → `POST /api/compositions`. Affiche zone (ou avertissement
  hors zone), liste des opérations avec origine (obligatoire / option) et case à cocher pour les options.
- **UI-304** : bloc « Situation du client » : cases à cocher des contraintes
  (`GET /api/catalog/constraint-types`). Tout changement → `PUT /api/compositions/:id/constraints`,
  puis rafraîchissement de la liste des opérations et des warnings.
- **UI-305** : cocher / décocher une option → `PATCH /api/compositions/:id/operations/:operationId`.
- **UI-306** : bouton « Émettre le devis » → `POST /api/compositions/:id/quotes`. Bloc « Devis » :
  numéro, statut, validité, lignes (libellé, durée, montant), main d'œuvre, majorations, HT, TVA,
  TTC, formatés en euros depuis les centimes. Historique des devis de la prestation
  (`GET /api/compositions/:id/quotes`), le remplacé grisé.
- **UI-307** : bouton « Accepter » sur le devis ISSUED → `POST /api/quotes/:id/accept`. Après
  acceptation, la prestation est affichée verrouillée, les cases désactivées.
- **UI-308** : toute erreur API (`{ code, message }`) s'affiche dans un bandeau sous le bloc concerné,
  avec le code et le message tels que renvoyés. Cas à rendre lisibles : `ZONE_NOT_COVERED`,
  `QUOTE_STALE`, `COMPOSITION_LOCKED`, `NOTHING_TO_QUOTE`.
- **UI-309** : CORS activé côté NestJS pour `http://localhost:5173` (`main.ts`).

## Contraintes

- Aucun calcul de montant, de statut ou d'éligibilité en JavaScript. La page affiche ce que l'API renvoie.
- Un seul fichier de logique d'appel API (`web/src/lib/api.ts`), typé d'après FR-108 et FR-208.
- Composants : `App.svelte` et au plus quatre composants enfants (prestation, contraintes, devis, bandeau d'erreur).
- CSS simple, lisible sur un écran de portable, pas de design system.

## Vérification

Pas de test navigateur automatisé pour ce lot (ADR 0024). Vérification manuelle selon le script
de démonstration :

1. Chauffe-eau électrique, 59000 Lille → prestation composée, zone NORD.
2. Cocher « Pas d'ascenseur » → « Portage en étage » apparaît en obligatoire.
3. Cocher « Mur porteur » → émettre → ligne de majoration 30 €, total cohérent.
4. Terminal `npm run consume` : `quote.issued` reçu.
5. Cocher une option après émission → accepter → `QUOTE_STALE` affiché ; réémettre → accepter → OK,
   `quote.superseded` puis `quote.accepted` reçus.

## Hors périmètre

Authentification, choix du tenant dans l'interface, impression, responsive avancé, i18n.
