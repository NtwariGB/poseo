# Revue du lot 1 — `lot-1-composition` (commit `ec814c8`)

**Date** : 2026-09-12
**Périmètre relu** : `ec218fc..HEAD` (4 commits)
**Références** : `CLAUDE.md`, `specs/00-perimetre.md`, `specs/01-modele-domaine.md`,
`prisma/schema.prisma`, `DECISIONS.md`, `specs/lot-1-composition.md`.

**Vérifications d'exécution** : `npm run lint` vert, `npx tsc --noEmit` vert,
`npm run test` 37/37 vert, `npm run test:e2e` 26/26 vert (infra Docker up).

---

## Axe 1 — Fidélité à la spec

### Couverture des exigences fonctionnelles

| FR | État | Preuve |
|---|---|---|
| FR-101 `POST /compositions` | couvert | `src/service/composition.controller.ts:15-21`, `src/service/composition.service.ts:39-81`, `src/service/composition.repository.ts:109-130` |
| FR-102 `PUT /:id/constraints` | couvert | `composition.service.ts:87-133`, `composition.repository.ts:148-198` |
| FR-103 `PATCH /:id/operations/:operationId` | couvert | `composition.service.ts:136-174`, `composition.repository.ts:201-220` |
| FR-104 `GET /:id` | couvert | `composition.service.ts:177-182`, `composition.controller.ts:23-29` |
| FR-105 lecture catalogue | couvert | `src/catalog/catalog.controller.ts:12-31`, `catalog.repository.ts:22-54` |
| FR-106 moteur pur `*.rules.ts` | couvert | `src/service/composition.rules.ts` (aucun import Prisma/Nest), 26 tests unitaires dans `composition.rules.spec.ts` |
| FR-107 FORBID > REQUIRE > OFFER | couvert | `composition.rules.ts:79-101` (filtrage par contrainte) et `:111-123` (résolution) |
| FR-108 représentation de sortie | couvert | `src/service/composition.view.ts:17-28, 51-69` |
| FR-109 seed idempotent | couvert | `prisma/seed.ts` (tenant LM-FR 2000 bp / 30 j, 8 opérations, 2 zones, 8 CP, 5 contraintes, 17 règles), `package.json:17`, test CL2 |
| FR-110 écriture refusée hors DRAFT | couvert (code + unitaire) | `composition.rules.ts:58-65`, appelé en `composition.service.ts:93` et `:143`, tests `composition.rules.spec.ts:307-333` |
| FR-111 réponse 200 + représentation complète | **partiel** | le contrôleur renvoie bien la vue complète (`composition.controller.ts:31-48`), mais aucun test n'assère l'égalité de forme complète sur la réponse de `PUT`/`PATCH` (S2.1 et S3.1 vérifient des sous-ensembles) |
| FR-112 atomicité du `PUT` | couvert | `composition.service.ts:95-107` : validation intégrale avant toute écriture ; test S2.5 `test/lot-1.e2e-spec.ts:590-608` |
| FR-113 `seed(): Promise<void>` exporté | couvert | `prisma/seed.ts:200` et garde `require.main` en `:339` |

### Scénarios d'acceptation

Tous les scénarios de la spec ont un test qui les vérifie réellement (pas de test « vert par accident ») :

- S1.1 à S1.4 → `test/lot-1.e2e-spec.ts:416-499` (S1.1 fait une égalité stricte de la
  représentation entière, y compris l'absence de `GAS_CONNECT`).
- S2.1 à S2.5 → `:503-608`. S2.4 utilise un tenant de test au catalogue conflictuel, ce qui est
  la bonne façon de provoquer un FORBID contraint.
- S3.1 à S3.3 → `:612-661`, avec relecture `GET` pour vérifier la persistance.
- S4.1, S4.2 → `:665-713`, plus un S4.3 supplémentaire sur les écritures cross-tenant.
- S5.1 → `:742-826`, vérifie aussi que le tenant secondaire ne voit que son catalogue.
- Cas limites : CL1 (FORBID+REQUIRE → `CATALOG_INCONSISTENT`), CL2 (idempotence du seed,
  identifiants stables), CL3 (seconde zone).
- Cas limite « statut ≠ DRAFT » : non déclenchable e2e, testé unitairement comme la spec l'exige.

**Décompte** : 15 scénarios de stories + 1 cas limite e2e + 3 tests ajoutés (S4.3, CL2, CL3)
= 19 `it` e2e. Le décompte de 20 annoncé par l'agent-tests était erroné : le fichier n'a jamais
contenu que 19 `it` (`git diff 221c688..HEAD -- test/lot-1.e2e-spec.ts` vide), aucun `skip`,
aucun `todo`, aucun `it` généré dynamiquement. Un comptage par motif `\bit\s*\(` donne 22 à cause
de trois faux positifs dans des chaînes et un commentaire (`:199`, `:257`, `:388`).

### Étanchéité du test d'acceptation

`test/lot-1.e2e-spec.ts` ne référence `src/` que par les deux imports autorisés :
`PrismaClient` (`:6`, code généré) et `AppModule` (`:7`). Le troisième import, `seed`
(`../prisma/seed`, `:8`), est hors `src/` et exigé par FR-113. Aucun contournement : pas de
`require()` dynamique, pas de `jest.mock`, pas d'`import()`, pas de lecture de fichier.
Les types de réponse (`CatalogItemView`, `OperationView`, `CompositionView`) sont redéclarés
localement (`:22-48`) au lieu d'être importés des DTO — comportement voulu.

### Tests d'acceptation modifiés depuis leur commit ?

Non. `git diff 221c688..HEAD -- test/` ne montre que `test/jest-e2e.json` (+`maxWorkers: 1`),
justifié dans `DECISIONS.md:196-199`. `test/lot-1.e2e-spec.ts` et `test/lot-0.e2e-spec.ts` sont
intacts.

### Code hors périmètre

Rien de fonctionnel hors périmètre : aucun prix, aucune majoration, aucun devis, aucune écriture
de catalogue par API. Les règles SURCHARGE sont chargées par le seed et explicitement ignorées par
le moteur (`composition.rules.ts:89`). Aucune modification de `prisma/schema.prisma` ni de
migration : le schéma contractuel est respecté à la lettre.

Trois éléments d'outillage sortent du strict périmètre mais sont tous tracés dans `DECISIONS.md` :
`scripts/resolve-ts-js-imports.js`, `maxWorkers: 1`, et le commentaire de
`src/tenant/tenant.controller.ts:7` (Q8).

---

## Axe 2 — Standards du CLAUDE.md

**Conformes :**

- Aucune règle métier dans un contrôleur : `composition.controller.ts` et `catalog.controller.ts`
  ne font que valider et déléguer.
- Accès Prisma confiné à `catalog.repository.ts` et `composition.repository.ts` ; aucun
  `PrismaService` injecté dans un service applicatif.
- `CompositionRules` est pure : aucun import Prisma ni Nest, unions de chaînes redéclarées (Q6).
- Erreurs typées : `NotFoundError` (404), `InvariantViolationError` (422), `ConflictError` (409),
  toutes dérivées de `DomainError`, converties par le filtre global existant.
- Multi-tenant en lecture : `where: { tenantId }` sur les six lectures de `catalog.repository.ts`,
  `findFirst({ where: { tenantId, id } })` en `composition.repository.ts:136`.
  `findZoneByPostalCode` utilise la clé `tenantId_postalCode`. Le test S1.1 prouve l'absence de
  fuite : le tenant voisin couvre aussi `59000` et c'est bien `NORD` qui ressort.
- Conventions : fichiers kebab-case, classes PascalCase, DTO suffixés `Dto` et validés
  class-validator, durées en minutes, montants en centimes, bp pour les pourcentages, aucun flottant.
- Outbox : aucun producteur Kafka introduit, aucune écriture `outbox_event` (le lot ne produit pas
  d'événement, ce qui est conforme à son périmètre).
- Dépendances : **aucune ajoutée ni retirée**. Seul le script `seed` est ajouté à `package.json:17`,
  appuyé sur `ts-node` déjà présent.
- TypeScript strict : `tsc --noEmit` passe, aucun `any`, aucun `@ts-ignore`.

---

## Écarts classés

### Bloquant

Aucun.

### À corriger (majeur)

1. **Écritures du repository prestation sans filtre `tenantId`** — `src/service/composition.repository.ts:158`,
   `:168`, `:172`, `:190`, `:207`, `:212`. Les cinq écritures ne portent que `compositionId`.
   Aucun chemin exploitable aujourd'hui (le service charge toujours par `findForTenant` avant
   d'écrire, cf. `composition.service.ts:92` et `:142`), mais CLAUDE.md est explicite : « Toute
   requête Prisma filtre sur `tenantId` ». C'est un contrôle temps-d'usage séparé du contrôle
   temps-de-vérification. Correctif simple : passer `tenantId` au repository et remplacer
   `serviceComposition.update({ where: { id } })` par un `updateMany({ where: { id, tenantId } })`,
   ou revérifier l'appartenance dans la transaction.

### À corriger (mineur)

2. **`read()` peut rendre des opérations que le catalogue courant interdit** —
   `src/service/composition.service.ts:198-210` : `CompositionRules.resolve` est appelé puis
   `resolved.operations` est jeté, seul `catalogWarnings` est conservé. Conséquence : après une
   modification du catalogue, un `GET` peut afficher une opération désormais FORBID tout en portant
   l'avertissement d'incohérence. Cohérent avec l'arbitrage Q1 (`warnings` recalculés, opérations
   persistées) mais la conséquence n'y est pas écrite. À consigner dans `DECISIONS.md` ou à traiter
   au lot 2, où le prix s'appuiera sur ces opérations.

3. **Comparateur de tri non conforme** — `src/service/composition.rules.ts:125-127` :
   `codeOf(left) < codeOf(right) ? -1 : 1` ne renvoie jamais `0`. Inoffensif ici (les codes sont
   uniques par tenant) mais c'est un comparateur incohérent ; `composition.view.ts:44-45` fait la
   même chose correctement.

4. **Transition MANDATORY → OPTIONAL non spécifiée et non testée** —
   `src/service/composition.rules.ts:119-121` : une opération qui cesse d'être obligatoire conserve
   `selected = true`, puisque l'état précédent était coché d'office. Le vendeur se retrouve avec une
   option cochée qu'il n'a jamais choisie. Le cas inverse est testé
   (`composition.rules.spec.ts:180-193`), pas celui-ci. À trancher et à consigner.

5. **Divergence documentaire non réconciliée** — `specs/00-perimetre.md:72` prévoit « contrainte
   ajoutée qui rend une opération interdite déjà cochée : **rejet** avec explication », alors que
   `specs/lot-1-composition.md:46-48` (S2.4) impose retrait silencieux + `OPERATION_REMOVED`.
   L'implémentation suit la spec du lot, ce qui est le bon choix, mais le périmètre — déclaré source
   de vérité fonctionnelle — reste contradictoire.

6. **Arbitrages Q1–Q6 absents de la spec** — `DECISIONS.md:162-187` précise matériellement FR-103
   (Q3 : `PATCH { selected: true }` sur MANDATORY → 200 sans effet) et FR-104/FR-108 (Q1). La
   décision du 2026-09-12 pose que « la spec est la source, pas le test » ; ces raffinements
   devraient remonter dans `specs/lot-1-composition.md` (règle 7 du CLAUDE.md).

7. **FR-111 vérifié partiellement** — aucun test n'assère que la réponse de `PUT /constraints` et de
   `PATCH /operations/:id` est la représentation FR-108 *complète*. Un
   `expect(normalize(res.body)).toEqual(normalize(await getComposition(...)))` couvrirait l'exigence
   à coût nul.

### Remarques

8. **Frontière de module** — `src/catalog/catalog.module.ts:10` exporte `CatalogRepository`,
   consommé directement par `CompositionService` (`composition.service.ts:34`). Le contrat
   inter-modules porte donc sur un repository plutôt que sur un service. Défendable (le module
   `service` n'accède pas à Prisma en propre) et commenté, mais un `CatalogService` exposant
   `findProductType` / `findCompositionRules` serait plus fidèle au découpage annoncé.

9. **Concurrence non protégée** — `composition.service.ts:92-121` lit puis écrit hors d'une
   transaction unique : deux `PUT`/`PATCH` simultanés sur la même prestation peuvent se perdre
   mutuellement. Sans conséquence en démonstration, à documenter avant tout usage réel.

10. **Erreurs Prisma non converties** — `composition.repository.ts:207` : un `P2025` (course sur la
    suppression d'une opération) remonterait en 500 plutôt qu'en `DomainError`. Le filtre global ne
    capte que `DomainError`.

11. **Seed sans élagage** — `prisma/seed.ts` n'enlève ni les codes postaux ni les règles retirés du
    tableau source. Q5 documente ce choix pour `CompositionRule` uniquement ; il vaut en fait pour
    tout le seed.

12. **`npm run lint` ne couvre ni `prisma/` ni `scripts/`** — `package.json:16` (`oxlint src/ test/`).
    `prisma/seed.ts` (346 lignes) et `scripts/resolve-ts-js-imports.js` échappent au lint.
    Vérifié à la main : ils passent quand même.

13. **`Q7` manquant** — `DECISIONS.md:162-187` énumère Q1, Q2, Q3, Q4, Q5, Q6 puis Q8. Trou de
    numérotation : soit une question a été perdue, soit elle a été fusionnée sans trace.

14. **`loadContext` charge tout le catalogue d'opérations** à chaque requête
    (`composition.service.ts:237-240`) pour n'en tirer qu'une table code↔id. Sans importance à cette
    échelle.

---

## Verdict

**Mergeable.**

Le lot est fidèle à sa spec — les treize FR sont implémentés, les quinze scénarios sont testés et
passent, le schéma Prisma contractuel n'est pas touché, aucune dépendance n'est ajoutée, les tests
d'acceptation n'ont pas été altérés, et rien n'est implémenté hors périmètre. Les quatre couches
imposées (contrôleur mince, service applicatif, règles pures, repository) sont respectées, et le
moteur `CompositionRules` est réellement isolable et testé.

L'écart n° 1 (absence de `tenantId` sur les cinq écritures du repository prestation) est le seul qui
touche une règle non négociable du CLAUDE.md. Il n'est pas exploitable en l'état et ne justifie pas
de bloquer le merge, mais il doit être corrigé avant le lot 2, où de nouvelles écritures viendront
s'appuyer sur ce repository.
