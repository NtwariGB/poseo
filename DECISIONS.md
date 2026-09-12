# Journal de décisions

Format : date, contexte, décision, alternatives écartées, conséquence.
Toute question remontée par l'agent et tranchée par le développeur est consignée ici.

## 2026-09-12 — Prisma épinglé en version 7

Contexte : Prisma 8 vient de sortir avec une CLI unifiée et un découpage de paquets refondus
(`prisma orm init`, `@prisma/orm-postgres`, notion de contrat).
Décision : rester sur Prisma 7 (générateur `prisma-client`, adaptateur `@prisma/adapter-pg`).
Écarté : Prisma 8, documentation encore mince et courbe d'apprentissage non budgétée sur deux jours.
Conséquence : montée de version à planifier plus tard, isolée dans le module `prisma`.

## 2026-09-12 — CommonJS plutôt qu'ES Modules

Contexte : le Nest CLI propose ESM + vitest ou CJS + Jest à la création.
Décision : CommonJS + Jest, `moduleFormat = "cjs"` côté Prisma.
Écarté : ESM, plus moderne mais source de frictions avec les décorateurs et certains paquets.
Conséquence : outillage de test standard NestJS, pas de configuration ESM à maintenir.

## 2026-09-12 — Publication des événements par outbox + Debezium (CDC)

Contexte : les événements métier (devis émis, accepté, expiré) doivent partir vers la planification
sans risque d'incohérence entre la base et Kafka.
Décision : écriture dans `outbox_event` dans la transaction métier, capture par Debezium
(connecteur PostgreSQL, plugin `pgoutput`), routage par Outbox Event Router vers
`poseo.<aggregatetype>`, clé `aggregateid`, en-tête `eventType`. Aucun producteur Kafka dans l'application.
Écarté : producteur kafkajs dans le service (événement perdu si la publication échoue après le commit) ;
outbox avec relais applicatif en polling (code à maintenir, latence, ordre non garanti).
Conséquence : une brique d'infra supplémentaire (Connect). Les tests d'intégration vérifient la
ligne outbox, pas Kafka. Les lignes outbox ne sont pas supprimées après capture (journal lisible).

## 2026-09-12 — Kafka officiel en KRaft plutôt que Redpanda

Contexte : besoin d'un broker local léger.
Décision : image `apache/kafka:3.9.0` en mode KRaft, un seul nœud, facteur de réplication 1.
Écarté : Redpanda (compatible et plus léger, mais le projet et l'entretien parlent de Kafka).
Conséquence : contournement du bug KAFKA-18281 (listener contrôleur sur `kafka:9093`, pas `0.0.0.0`).

## 2026-09-12 — Tenant par en-tête, pas d'authentification

Contexte : multi-tenant requis, deux jours de développement.
Décision : `X-Tenant-Id` obligatoire sur chaque requête, filtrage systématique en base.
Écarté : JWT avec tenant dans les claims (hors sujet pour la démonstration).
Conséquence : à remplacer par une vraie authentification avant tout usage réel.

## 2026-09-12 — Identifiants UUID v7, montants en centimes, durées en minutes

Décision : `@default(uuid(7)) @db.Uuid` partout ; entiers pour l'argent et le temps.
Écarté : UUID v4 (non ordonné, index moins efficaces) ; décimaux JS pour les montants (arrondis).
Conséquence : tri chronologique possible par id ; conversion en euros uniquement à l'affichage.

## 2026-09-12 — Numérotation des devis par table compteur

Contexte : numéro unique par tenant au format `Q-<année>-<séquence>`.
Décision : table `QuoteCounter (tenantId, year, lastValue)` incrémentée dans la transaction
d'émission avec verrou de ligne (`SELECT ... FOR UPDATE`).
Écarté : séquence PostgreSQL par tenant (DDL dynamique à chaque nouveau tenant, invisible dans Prisma).
Conséquence : une écriture de plus par émission, ordre garanti, trous impossibles sauf rollback.

## 2026-09-12 — Invariant « un seul devis ISSUED / ACCEPTED par prestation »

Décision : les deux, en couches. Index uniques partiels en SQL brut ajoutés à la main dans la
migration (Prisma ne les exprime pas dans le schéma), plus contrôle applicatif dans la transaction
pour renvoyer une erreur métier lisible avant que la base ne refuse.
Écarté : contrôle applicatif seul (course possible entre deux émissions concurrentes).
Conséquence : la migration contient un bloc SQL manuel, documenté en commentaire.

## 2026-09-12 — Arbitrages du schéma Prisma

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

## 2026-09-12 — Arbitrages du lot 0 (socle technique)

Contexte : points laissés ouverts par `specs/lot-0-socle.md` au moment d'implémenter le socle.
Tranchés par le développeur avant écriture.

- `GET /health` base injoignable : `503` avec `{ status: 'error', db: 'down' }`, plutôt qu'un `200`
  portant `db: 'down'` : un orchestrateur doit pouvoir se fier au code de statut seul.
- FR-006/FR-007 en un seul filtre : le `ValidationPipe` global reçoit un `exceptionFactory` qui lève
  une `ValidationError` (`VALIDATION_FAILED`, `details` = erreurs class-validator). Écarté : un second
  filtre `@Catch(BadRequestException)` qui remettrait en forme, donc deux endroits à garder d'accord.
- Middleware tenant posé sur un joker (`{*path}`) hors `/health` : une URL inconnue appelée sans
  en-tête renvoie `400 TENANT_HEADER_MISSING` avant le `404` de Nest. Assumé. Écarté :
  `forRoutes(TenantController)`, qui imposerait de lister chaque contrôleur métier à venir.
- `jest.config.ts` restreint aux unitaires (`testMatch: ['<rootDir>/src/**/*.spec.ts']`) : `testRegex`
  ramassait aussi `test/*.e2e-spec.ts`, si bien que `npm run test` exécutait les tests d'intégration.
- `moduleNameMapper` `'^(\\.{1,2}/.*)\\.js$': '$1'` dans les deux configurations Jest : le client Prisma
  généré importe en NodeNext (`./internal/class.js`), que le resolver CommonJS de Jest ne rattache pas
  aux sources `.ts`. Écarté : régénérer le client avec une autre extension d'import, qui toucherait
  la sortie utilisée par l'application et non la seule configuration de test.
- `npm run test:e2e` préfixé de `NODE_OPTIONS=--experimental-vm-modules` : le runtime Prisma 7 charge
  son compilateur de requêtes par `import()` dynamique, refusé dans la VM CommonJS de Jest. Le drapeau
  autorise l'API VM Modules ; il ne rend pas notre code ESM. Non ajouté à `npm run test`, les
  unitaires n'ouvrant aucune connexion.

## 2026-09-12 — NestJS épinglé en 11

Contexte : le Nest CLI a échafaudé le projet en NestJS 12, publié en ESM pur (`"type": "module"`,
aucun build CommonJS). Incompatible avec le choix CommonJS + Jest : le runtime de Jest 30 ne
conditionne `require(ESM)` qu'à partir de Node 24.9, or la cible est Node 22. Aucun test ne démarrait,
alors que l'application elle-même tournait (`require(esm)` est stable en Node 22.23).
Décision : rester en NestJS 11 (`@nestjs/common`, `core`, `platform-express`, `testing` en `^11.2.3`,
`@nestjs/config` en `^4.0.4`, la ligne 12 étant celle de Nest 12), CommonJS conservé. Express reste
en 5.2.1, déjà embarqué par `@nestjs/platform-express@11`, donc la syntaxe des routes est inchangée.
Écarté : Jest en mode ESM (contredit la décision CommonJS, et le client Prisma est généré en CJS) ;
montée à Node 24 (hors stack annoncée) ; transpilation de `node_modules/@nestjs/*` en CommonJS
(lente et fragile).
Conséquence : la montée en NestJS 12 est un passage à ESM, à traiter avec la montée Prisma 8.
Conséquence : `@nestjs/observe` retiré des dépendances — paquet de la ligne Nest 12 (ajouté par
l'échafaudage), sans équivalent en ligne 11 et importé nulle part dans `src/`. `@nestjs/cli` et
`@nestjs/schematics` ramenés en `^11` pour que `nest g` échafaude du code ciblant le runtime en place.

## 2026-09-12 — `rootDir: "."` dans `tsconfig.json`

Le `tsconfig.json` racine sert aussi de configuration aux outils qui lisent hors de `src/`
(`jest.config.ts`, `prisma7.config.ts`, `test/*.e2e-spec.ts`) : avec `rootDir: "./src"`, `tsc --noEmit`
sur ce fichier refuse les fichiers situés au-dessus de la racine. Le build n'est pas concerné,
`tsconfig.build.json` réimposant `rootDir: "./src"`, donc `dist/` garde sa structure.

## 2026-09-12 — Catalogue chargé par seed, pas d'API d'administration

Contexte : deux jours ; l'admin du catalogue coûte une dizaine d'endpoints sans valeur de démonstration.
Décision : script de seed idempotent, catalogue en lecture seule via l'API.
Écarté : CRUD complet du catalogue.
Conséquence : le catalogue se modifie en base ou par le seed ; à ajouter si le projet continue.

## 2026-09-12 — Options non cochées par défaut, type de produit immuable

Décision : une opération OFFER est proposée décochée (le vendeur choisit, règle métier 1) ; le type de
produit d'une prestation ne change pas, on recrée une prestation.
Écarté : options précochées ; recomposition sur changement de type (cas limite du périmètre reporté).
Conséquence : un cas limite du périmètre (changement de type) sort du week-end, documenté.

## 2026-09-12 — Contrats précisés par l'agent-tests (lot 1)

Contexte : l'agent-tests a déduit cinq contrats non fixés par la spec.
Décision : tous validés et intégrés à la spec (FR-111 à FR-113) ; libellés du seed vérifiés à la lettre
en S5.1 ; forme de `details` sur VALIDATION_FAILED laissée libre (présence du champ fautif exigée).
Conséquence : la spec est la source, pas le test ; l'agent-code lit les FR, pas les déductions.

## 2026-09-12 — Arbitrages du lot 1 (catalogue et composition)

Contexte : points laissés ouverts par `specs/lot-1-composition.md` au moment d'implémenter la
composition. Remontés par l'agent-code, tranchés par le développeur avant écriture.

- Q1 — `warnings` jamais persistés, recalculés à chaque requête : `GET` rend les avertissements
  d'état (`ZONE_NOT_COVERED`, `CATALOG_INCONSISTENT:<code>`), les avertissements de différence
  (`OPERATION_REMOVED:<code>`) n'existent que dans la réponse de l'écriture qui les produit.
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
- Q8 — `/tenant/me` conservé tant que `test/lot-0.e2e-spec.ts` s'en sert ; le commentaire « à supprimer
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
