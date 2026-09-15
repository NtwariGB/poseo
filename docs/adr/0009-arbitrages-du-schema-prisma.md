# 0009 — Arbitrages du schéma Prisma

Date : 2026-09-12
Statut : accepté

Contexte : points laissés ouverts par `specs/01-modele-domaine.md` au moment d'écrire
`prisma/schema.prisma`. Tranchés par le développeur avant écriture.

- A2 — `createdAt` sur toutes les tables, `updatedAt` uniquement sur `ServiceComposition` : seule
  la prestation est mutable, tout le reste est du référentiel ou de l'immuable ; un `updatedAt`
  ailleurs serait un mensonge.
- B1 — `tenantId` sur les entités racines seulement ; `ServiceConstraint`, `ServiceOperation` et
  `QuoteLine` sont isolées par leur parent : pas de dénormalisation sans besoin de requête directe.
  Exception `ZonePostalCode`, dont l'unicité est définie au niveau du tenant.
- C2 — aucune contrainte d'unicité sur `CompositionRule` : ses colonnes discriminantes
  (`constraintTypeId`, `operationId`) sont nullables et Postgres considère les NULL comme distincts,
  donc un index unique ne protégerait rien ; la cohérence relève de la règle applicative.
- C3 — « exactement un de `surchargePercentBp` / `surchargeCents` » et « `operationId` obligatoire
  sauf pour SURCHARGE » posés en CHECK SQL brut dans la migration : Prisma ne les exprime pas, et un
  contrôle purement applicatif laisserait passer les écritures manuelles de catalogue.
- D1 — `productRef` obligatoire sur `ServiceComposition` : le périmètre référence le produit acheté
  par identifiant, il manquait au modèle de domaine, qui a été mis à jour.
- E4 — `Quote.issuedAt` sans `@default(now())`, fourni par l'application : `validUntil` en dérive,
  les deux doivent venir du même instant calculé, pas de l'horloge du serveur de base.
- F2 — `aggregatetype` et `type` de l'outbox en `String` et non en enum : le routeur Debezium lit du
  texte, et un enum Postgres figerait la liste des types d'événements derrière une migration.
