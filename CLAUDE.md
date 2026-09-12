# Poseo

Composition de prestations d'installation et émission de devis, multi-enseigne, multi-pays.
Reprend le périmètre SOR + SQS d'un Quote Framework. SDO (planification) est hors périmètre :
il est représenté par un consommateur Kafka de démonstration.

## Documents de référence

- `specs/00-perimetre.md` : périmètre métier, règles, cas limites. Source de vérité fonctionnelle.
- `specs/01-modele-domaine.md` : entités et relations. Source de vérité du modèle.
- `prisma/schema.prisma` : modèle de données contractuel, dérivé du précédent.
- `specs/lot-N-*.md` : spec du lot en cours.
- `specs/reviews/lot-N.md` : rapport de revue du lot.
- `DECISIONS.md` : journal des arbitrages. Toute décision y est tracée avec date et raison.

## Méthode (non négociable)

1. Lire le périmètre, le modèle de domaine et la spec du lot avant d'écrire du code.
2. Ne rien implémenter hors du périmètre du lot demandé, même si cela semble utile.
3. Toute question non tranchée par la spec est remontée au développeur AVANT implémentation.
   Ne jamais trancher seul. Une fois tranchée, la décision est ajoutée à `DECISIONS.md`.
4. Les tests écrits par le développeur définissent le résultat attendu. Ne pas les modifier
   ni les supprimer sans accord explicite. Si un test semble contredire la spec, le signaler.
5. Le schéma Prisma est contractuel : tout écart nécessaire est une question remontée.
6. Aucune dépendance npm ajoutée sans accord.
7. Une tâche terminée = code + tests verts + lint vert + spec mise à jour si elle a évolué.

## Architecture

- Un seul service NestJS (CommonJS). Modules par domaine :
  `catalog` (tenants, types de produit, opérations, zones, grilles, règles de composition),
  `service` (prestation : composition, recalcul), `quote` (devis : émission, expiration,
  acceptation), `outbox` (écriture des événements), `prisma` (client partagé).
- Contrôleur = validation DTO + appel du service applicatif. Aucune règle métier dans un contrôleur.
- Règles métier dans des classes pures (`*.rules.ts`), sans dépendance à Prisma, testables unitairement.
- Accès base uniquement via Prisma, dans un repository par module.
- Erreurs métier : classe `DomainError` et sous-classes, converties en HTTP par un filtre global.
- Multi-tenant : chaque requête porte l'en-tête `X-Tenant-Id`. Toute requête Prisma filtre
  sur `tenantId`. Un tenant ne voit jamais les données d'un autre. Pas d'authentification
  (simplification assumée, voir DECISIONS.md).
- Événements : jamais de producteur Kafka dans l'application. On écrit une ligne dans
  `outbox_event` dans la même transaction Prisma que l'écriture métier. Debezium capte la ligne
  et publie sur le topic `poseo.<aggregatetype>`, clé = `aggregateid`, en-tête `eventType` = `type`.
- Le devis est immuable une fois émis. Toute modification produit un nouveau devis.

## Stack

- Node 22, TypeScript strict, NestJS 11, Prisma 7 (générateur `prisma-client`, sortie
  `src/generated/prisma`, format CommonJS, adaptateur `@prisma/adapter-pg`).
- Config Prisma dans `prisma7.config.ts`, connexion via `DATABASE_URL` du `.env`.
- PostgreSQL 16 (`wal_level=logical`), Kafka 3.9 (KRaft), Debezium Connect 3.0. Tout en Docker Compose.
- Tests : Jest (unitaires à côté du code en `*.spec.ts`, intégration dans `test/`), Supertest.
- Front : une page Svelte dans `web/` (récapitulatif de devis), ajoutée en dernier.

## Conventions

- Identifiants : UUID v7, colonnes `@db.Uuid`.
- Montants en centimes (entiers). Durées en minutes (entiers). Jamais de flottants pour l'argent.
- Fichiers en kebab-case, classes en PascalCase, un fichier par classe.
- DTO d'entrée validés avec class-validator, suffixe `Dto`.
- Noms de tables et colonnes en snake_case via `@@map` / `@map`.
- Commits : Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).

## Commandes

- `npm run infra:up` : lance Postgres, Kafka, Connect et enregistre le connecteur Debezium.
- `npm run infra:down` : arrête l'infra.
- `npx prisma migrate dev --name <nom>` : crée et applique une migration.
- `npx prisma generate` : régénère le client.
- `npm run test` : unitaires. `npm run test:e2e` : intégration. `npm run lint` : lint.
