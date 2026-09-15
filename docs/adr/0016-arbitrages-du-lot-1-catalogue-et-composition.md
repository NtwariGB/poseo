# 0016 — Arbitrages du lot 1 (catalogue et composition)

Date : 2026-09-12
Statut : accepté

Contexte : points laissés ouverts par `specs/lot-1-composition.md` au moment d'implémenter la
composition. Remontés par l'agent-code, tranchés par le développeur avant écriture.

- Q1 — `warnings` jamais persistés, recalculés à chaque requête : `GET` rend les avertissements
  d'état (`ZONE_NOT_COVERED`, `CATALOG_INCONSISTENT:<code>`), les avertissements de différence
  (`OPERATION_REMOVED:<code>`, `OPERATION_NOW_OPTIONAL:<code>`) n'existent que dans la réponse de
  l'écriture qui les produit.
  Conséquence assumée (signalée par la revue du lot 1) : les opérations, elles, sont persistées et
  rendues telles quelles. Après une modification du catalogue, un `GET` peut donc exposer une
  opération devenue FORBID, accompagnée de son avertissement d'incohérence, tant que la prestation
  n'a pas été recomposée par un `PUT /constraints`. La composition ne se recalcule qu'à l'écriture,
  jamais à la lecture — sans quoi la lecture deviendrait une écriture implicite. À revoir au lot 2,
  où le prix s'appuiera sur ces opérations.
- Q2 — `OPERATION_REMOVED:<code>` émis pour toute opération qui était cochée et qui disparaît après
  recomposition, quelle qu'en soit la cause (FORBID déclenché ou contrainte retirée) : un prédicat
  unique plutôt qu'un cas par cause.
- Q3 — `PATCH { selected: true }` sur une opération MANDATORY : 200 sans effet, l'état demandé étant
  l'état courant ; le 422 `OPERATION_MANDATORY` est réservé au décochage (règle métier 1).
- Q4 — identifiants d'URL invalides traités comme absents, jamais 400 ni 403 : `:id` mal formé ou
  inconnu → 404 `COMPOSITION_NOT_FOUND`, `:operationId` mal formé ou hors prestation → 404
  `OPERATION_NOT_IN_COMPOSITION`. On ne révèle pas l'existence d'une ressource d'un autre tenant.
- Q5 — idempotence du seed sur `CompositionRule` par recherche du tuple discriminant
  (`tenantId, productTypeId, constraintTypeId, kind, operationId`) puis création si absent, faute de
  contrainte d'unicité (arbitrage C2). Écarté : purge des règles du tenant puis recréation, qui fait
  tourner les identifiants à chaque rejeu et supprimerait des règles ajoutées à la main en base.
- Q6 — `CompositionRules` reste pur : le fichier redéclare ses propres unions de chaînes
  (`'REQUIRE' | ...`, `'MANDATORY' | 'OPTIONAL'`, `'DRAFT' | ...`) au lieu d'importer les énumérations
  du client Prisma généré. Celles-ci étant elles aussi des unions de chaînes, le compilateur vérifie
  la compatibilité à l'appel sans cast.
- Q7 — `/tenant/me` conservé tant que `test/lot-0.e2e-spec.ts` s'en sert ; le commentaire « à supprimer
  dès qu'un endpoint métier existe » est remplacé en conséquence.

Deux points d'outillage sont tombés du même coup :

- `npm run seed` préchargé de `scripts/resolve-ts-js-imports.js` : sous ts-node, le client Prisma
  généré importe `./internal/class.js`, que le resolver CommonJS de Node ne rattache pas aux sources
  `.ts`. Même cause et même contournement que le `moduleNameMapper` des configurations Jest (lot 0),
  cette fois en hook `require`. Écarté : `TS_NODE_EXPERIMENTAL_RESOLVER`, sans effet ici ; régénérer
  le client avec une autre extension d'import, déjà écarté au lot 0.
- `maxWorkers: 1` dans `test/jest-e2e.json` : les deux suites d'intégration partagent une seule base
  et, exécutées en parallèle, se privaient mutuellement de temps — le `beforeAll` du lot 0 dépassait
  son délai de 5 s pendant que le lot 1 chargeait le seed. Sérialiser est de toute façon la bonne
  hypothèse pour des tests qui écrivent dans la même base.
