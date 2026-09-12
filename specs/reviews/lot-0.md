# Revue du lot 0 — socle technique

**Branche** : `lot-0-socle`
**Commit d'implémentation** : `6886dd6 feat(lot-0): prisma module, tenant middleware, domain errors, health endpoint`
**Base de comparaison** : `master` (= `39d8f50 test: lot 0 acceptance tests (red)`)
**Date de revue** : 2026-09-12
**Relecteur** : agent de revue (lecture seule sur le code)

## État constaté

Commandes exécutées telles quelles (infra Docker déjà en marche : `poseo-postgres-1`, `poseo-kafka-1`, `poseo-connect-1`) :

| Commande | Résultat |
| --- | --- |
| `npm run lint` (`oxlint src/ test/`) | vert, 0 diagnostic |
| `npx tsc --noEmit -p tsconfig.json` | vert (TypeScript strict) |
| `npm run test` | vert — 2 suites, 9 tests |
| `npm run test:e2e` | vert — 1 suite, 7 tests |
| `nest build` | vert, `dist/main.js` présent |

Périmètre réel du lot : 32 fichiers, +636 / -204 (tous commités au moment de la revue ; l'index était
encore non commité en début de relecture, le contenu est identique au commit `6886dd6`).

---

## Axe 1 — Fidélité à la spec (`specs/lot-0-socle.md`)

### Exigences fonctionnelles

| Exigence | Statut | Preuve |
| --- | --- | --- |
| **FR-001** `PrismaModule` global, `PrismaService` avec `@prisma/adapter-pg`, connecté au démarrage, déconnecté à l'arrêt | **partiel** | `src/prisma/prisma.module.ts:5` (`@Global()`), `src/prisma/prisma.service.ts:12-18` (adaptateur), `:20-22` (`$connect` sur `onModuleInit`), `:24-26` (`$disconnect` sur `onModuleDestroy`). **Manque** : `src/main.ts` n'appelle pas `app.enableShutdownHooks()` ; sous NestJS 11 les hooks de cycle de vie ne sont pas branchés sur les signaux par défaut, donc `onModuleDestroy` n'est jamais appelé sur `SIGTERM`/`SIGINT`. La déconnexion n'est effective que via `app.close()` (cas des tests). |
| **FR-002** `GET /health` vérifie la base par `SELECT 1` | **couvert** | `src/health/health.controller.ts:19` (`this.prisma.$queryRaw\`SELECT 1\``), `src/health/health.module.ts`. Voir Axe 2 pour la forme de cet accès. |
| **FR-003** middleware `X-Tenant-Id`, format UUID, existence, `{ id, code }` attaché ; décorateur `@CurrentTenant()` | **couvert** | `src/tenant/tenant.middleware.ts:22-47`, `src/tenant/tenant.repository.ts:9-14`, `src/tenant/current-tenant.decorator.ts:7-20`, type et constante d'en-tête dans `src/tenant/current-tenant.ts`. |
| **FR-004** routes exemptées : `/health` uniquement | **couvert** | `src/app.module.ts:51-54` : `.apply(TenantMiddleware).exclude('health').forRoutes('{*path}')`. Vérifié e2e (`/health` sans en-tête → 200). |
| **FR-005** `DomainError { code, httpStatus, message, details? }` + `NotFoundError` 404, `ValidationError` 400, `ConflictError` 409, `InvariantViolationError` 422 | **couvert** | `src/common/errors/domain-error.ts:5-21` (abstraite, constructeur `protected`), puis `not-found-error.ts:6`, `validation-error.ts:6`, `conflict-error.ts:6`, `invariant-violation-error.ts:6`. Statuts vérifiés par `src/common/filters/domain-error.filter.spec.ts:54-60`. |
| **FR-006** filtre global `DomainError` → HTTP ; erreurs class-validator au format `{ code: "VALIDATION_FAILED", message, details }` | **couvert (2e volet non testé)** | `src/common/filters/domain-error.filter.ts:14-34` (enregistré par `APP_FILTER`, `src/app.module.ts:26`) ; `src/app.module.ts:35-43` (`exceptionFactory` du `ValidationPipe` qui lève `ValidationError('VALIDATION_FAILED', …)`). Aucun endpoint à DTO n'existe dans ce lot, donc le chemin class-validator n'est exercé par aucun test (ni unitaire ni e2e). |
| **FR-007** `ValidationPipe` global `whitelist`, `forbidNonWhitelisted`, `transform` | **couvert** | `src/app.module.ts:27-45`. |
| **FR-008** `@nestjs/config`, `DATABASE_URL` obligatoire au démarrage | **couvert** | `src/app.module.ts:20` (`ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })`), `src/config/env.validation.ts:5-21`. Non testé (pas de `env.validation.spec.ts`). |
| **FR-009** `GET /tenant/me` renvoie `{ id, code }` | **couvert** | `src/tenant/tenant.controller.ts:11-14`, `src/tenant/tenant.module.ts`. Le commentaire `:5-8` rappelle la suppression prévue. |

### Scénarios d'acceptation

| Scénario | Test | Vérifie réellement le scénario ? |
| --- | --- | --- |
| S1.1 `GET /health` → 200, `{ status: 'ok', db: 'up' }` | `test/lot-0.e2e-spec.ts:47-51` | Oui, égalité stricte du corps. |
| S2.1 sans en-tête → 400 `TENANT_HEADER_MISSING` | `test/lot-0.e2e-spec.ts:55-59` | Oui. Doublé en unitaire : `src/tenant/tenant.middleware.spec.ts:38-49` (dont en-tête blanc). |
| S2.2 en-tête non UUID → 400 `TENANT_HEADER_INVALID` | `test/lot-0.e2e-spec.ts:61-67` | Oui. Unitaire : `tenant.middleware.spec.ts:51-58`. |
| S2.3 tenant inconnu → 404 `TENANT_NOT_FOUND` | `test/lot-0.e2e-spec.ts:69-75` | Oui (UUID v7 inexistant, aller réel en base). Unitaire : `tenant.middleware.spec.ts:60-68`. |
| S2.4 `/health` sans tenant | `test/lot-0.e2e-spec.ts:85-88` | Oui. |
| FR-009 (sonde) | `test/lot-0.e2e-spec.ts:77-83` | Oui, corps `{ id, code }` comparé au tenant créé par le test. |
| S3.1 `DomainError` → statut porté par l'erreur + `{ code, message, details? }` | `test/lot-0.e2e-spec.ts:91-102` | **Partiellement** : ce test rejoue la requête de S2.2 et n'assure que la présence de `code` et `message` (pas le statut, pas `details`). Le scénario est en réalité couvert indirectement par S2.1/S2.2/S2.3 (statuts 400/404 effectifs) et complètement par le test unitaire du filtre `src/common/filters/domain-error.filter.spec.ts:23-60` (statut, `details` présent, `details` omis, statut par sous-classe). Faiblesse du test d'acceptation lui-même, pas de l'implémentation. |

### Tests d'acceptation modifiés depuis leur commit ?

Non. `git diff 39d8f50 HEAD -- test/lot-0.e2e-spec.ts` est vide : le fichier d'acceptation est
intact au bit près. `specs/lot-0-socle.md` n'a pas non plus été retouché après `39d8f50`.

Deux fichiers de `test/` ont bougé, aucun n'est un test d'acceptation :
- `test/app.e2e-spec.ts` supprimé : échafaudage Nest (`GET /` → `Hello World!`) dont le contrôleur
  `src/app.controller.ts` est lui-même supprimé. Cohérent : cette route serait désormais soumise au
  middleware tenant et le test aurait échoué.
- `test/jest-e2e.json` : ajout du seul `moduleNameMapper` pour les imports `.js` du client Prisma,
  arbitrage tracé dans `DECISIONS.md`.

### Code hors périmètre du lot ?

Non, à deux nuances près, toutes deux nécessaires et tracées :
- Suppression de l'échafaudage `app.controller.ts` / `app.service.ts` / `app.controller.spec.ts` :
  ménage imposé par FR-004 (aucune route métier hors tenant).
- Rétrogradation NestJS 12 → 11 (`package.json:26-31`) et outillage de test
  (`jest.config.ts`, `test/jest-e2e.json`, `package.json` script `test:e2e`) : cinq arbitrages
  consignés dans `DECISIONS.md` (section « Arbitrages du lot 0 » et « NestJS épinglé en 11 »).

Aucun endpoint métier, aucune entité autre que `Tenant` touchée, aucune écriture en base depuis
l'application (`TenantRepository` est en lecture seule). Conforme à « Hors périmètre du lot ».

---

## Axe 2 — Standards `CLAUDE.md`

### Règle métier dans un contrôleur

Aucune règle métier dans un contrôleur : `TenantController` ne fait que retourner le contexte résolu.
En revanche `HealthController` porte la logique de sonde (try/catch, passage en 503 via
`@Res({ passthrough: true })`) **et** l'appel Prisma ; voir le point suivant.

### Accès Prisma hors repository

**Écart** : `src/health/health.controller.ts:19` exécute `this.prisma.$queryRaw\`SELECT 1\`` en
injectant `PrismaService` directement dans un contrôleur. `CLAUDE.md` exige « Accès base uniquement
via Prisma, dans un repository par module » et « Contrôleur = validation DTO + appel du service
applicatif ». La requête est technique (pas métier), mais c'est le seul accès base du lot qui ne
passe pas par un repository, et il crée un précédent pour les modules suivants.
Correctif attendu : `HealthRepository.ping()` (ou `HealthService`) dans `src/health/`, contrôleur
réduit à l'appel.

Le reste est conforme : `TenantRepository` (`src/tenant/tenant.repository.ts`) est le seul autre
point d'accès, et `PrismaService` n'est injecté nulle part ailleurs.

### Requête sans filtre `tenantId`

Aucune. La seule requête du lot est `prisma.tenant.findUnique({ where: { id } })`
(`tenant.repository.ts:10-13`) : elle porte sur la table `Tenant` elle-même, l'identité du tenant
*est* le filtre, et la projection est réduite à `{ id, code }`.

Point positif pour la suite : le middleware est posé sur un joker (`src/app.module.ts:54`), donc
toute route métier future est couverte par défaut — pas d'oubli possible par omission de déclaration.

### Nommage, erreurs typées, TypeScript strict

- Fichiers en kebab-case, classes en PascalCase, un concept par fichier : conforme.
- `DomainError` abstraite à constructeur `protected` : impossible d'instancier une erreur métier
  sans statut. Les quatre sous-classes n'ajoutent rien d'autre que leur statut. Bon niveau.
- `src/common/filters/domain-error.filter.ts:25-31` : `details` omis du corps quand il est
  `undefined` (et non sérialisé à `null`), conforme à `{ code, message, details? }`.
- `strict: true` conservé dans `tsconfig.json` (avec `strictPropertyInitialization: false`, hérité
  de l'échafaudage, nécessaire aux propriétés injectées). `tsc --noEmit` passe, aucun `any` implicite,
  aucun `@ts-ignore`. Les quelques casts sont cantonnés aux tests (`as unknown as TenantRepository`).
- `src/main.ts` et toutes les méthodes publiques portent un type de retour explicite.

### Dépendances ajoutées ou retirées

- **Aucune dépendance ajoutée.** Le diff de `package-lock.json` n'introduit que des paquets
  transitifs (`dotenv` sous `@nestjs/config`). `dotenv`, utilisé par le test d'acceptation, était
  déjà en `devDependencies`.
- Rétrogradations `@nestjs/{common,core,platform-express,testing}` 12 → `^11.2.3` et
  `@nestjs/config` 12 → `^4.0.4` : **justifiées** dans `DECISIONS.md` (§ « NestJS épinglé en 11 »).
- **Écart** : `@nestjs/observe` (et son transitif `es-toolkit`) a été **retiré** de `dependencies`
  (`package.json:25-…`) sans une ligne dans `DECISIONS.md`. La décision NestJS 11 énumère les paquets
  épinglés mais ne mentionne aucune suppression. À tracer (le retrait est vraisemblablement correct :
  paquet de la ligne Nest 12, non utilisé par le code).
- Remarque : `@nestjs/schedule@^12.0.1` reste en ligne 12 ; son `peerDependencies` accepte
  `@nestjs/common ^11 || ^12`, donc pas de conflit. `@nestjs/cli` et `@nestjs/schematics` restent en
  12 : attention, tout `nest g` échafaudera du code ciblant Nest 12.

### Autres points de standard

- Événements / outbox : hors périmètre du lot, aucun producteur Kafka dans le code (`kafkajs` est
  présent dans `package.json` depuis `master`, non importé).
- `tsconfig.json` : ajout de `"rootDir": "."` non tracé dans `DECISIONS.md`. Sans effet sur le build
  (`tsconfig.build.json` réimpose `rootDir: "./src"`, `dist/main.js` est bien produit), mais c'est un
  réglage de contrat de compilation modifié sans justification.
- `package.json` : `"test:e2e": "NODE_OPTIONS=--experimental-vm-modules jest …"` — affectation
  inline non portable sous Windows/PowerShell. Arbitrage tracé, portabilité non évoquée.

---

## Écarts classés

### Bloquant

Aucun écart ne remet en cause la conception, le périmètre ou l'isolation des données.

### À corriger (avant de construire le lot 1 dessus)

1. **Accès Prisma depuis un contrôleur** — `src/health/health.controller.ts:12` (injection) et
   `:19` (`$queryRaw`). Violation directe de « Accès base uniquement via Prisma, dans un repository
   par module » et de « Contrôleur = … appel du service applicatif ». Extraire un
   `HealthRepository.ping()` / `HealthService`. Aucun test d'acceptation n'est impacté.
2. **FR-001 partiel : pas de déconnexion à l'arrêt du processus** — `src/main.ts:4-7`. Ajouter
   `app.enableShutdownHooks()` avant `listen()` ; sans cela `PrismaService.onModuleDestroy` ne part
   jamais sur `SIGTERM`/`SIGINT` et la connexion au pool n'est pas fermée proprement.
3. **Retrait de `@nestjs/observe` non tracé** — `package.json:25-…`. Ajouter une ligne à
   `DECISIONS.md` (et idéalement y mentionner `"rootDir": "."` dans `tsconfig.json`, point 6).

### Remarque

4. **FR-006, volet class-validator non exercé** — `src/app.module.ts:35-43`. Aucun endpoint à DTO
   dans le lot, donc l'`exceptionFactory` n'est couverte par aucun test. Premier endpoint du lot 1 :
   vérifier le format `{ code: 'VALIDATION_FAILED', message, details }` de bout en bout.
5. **`details` perd les erreurs imbriquées** — `src/app.module.ts:39-42` : seul `error.constraints`
   du premier niveau est lu, `error.children` est ignoré. Un DTO imbriqué (`@ValidateNested`)
   produira `{ field: 'x', constraints: [] }`. À traiter quand un tel DTO apparaîtra.
6. **`tsconfig.json` : `"rootDir": "."`** ajouté sans nécessité apparente ni justification (build
   inchangé car `tsconfig.build.json` le surcharge).
7. **Chemins d'erreur de la sonde non testés** — `src/health/health.controller.ts:21-25` : le 503
   `{ status: 'error', db: 'down' }` (arbitrage de `DECISIONS.md`) n'a aucun test ; un unitaire avec
   un `PrismaService` moqué serait immédiat. Idem pour `src/config/env.validation.ts` (FR-008).
8. **Test d'acceptation S3.1 faible** — `test/lot-0.e2e-spec.ts:91-102` : rejoue S2.2 et ne vérifie
   ni le statut HTTP ni `details`. Signalé, non modifié (règle 4 de `CLAUDE.md`). Le test unitaire du
   filtre comble le trou.
9. **Message trompeur possible du décorateur** — `src/tenant/current-tenant.decorator.ts:12-16` :
   si une route échappe au middleware, l'appelant reçoit `TENANT_HEADER_MISSING` alors que l'en-tête
   peut être présent. Un code distinct (p. ex. `TENANT_NOT_RESOLVED`) serait plus honnête.
10. **404 masqué sur URL inconnue** — une route inexistante sans `X-Tenant-Id` renvoie
    `400 TENANT_HEADER_MISSING` au lieu de `404`. Conséquence assumée du joker, déjà consignée dans
    `DECISIONS.md`.
11. **`@nestjs/cli` / `@nestjs/schematics` restés en 12** alors que le runtime est en 11 : tout
    `nest g` produira du code ciblant la ligne 12.

---

## Verdict

**Non mergeable en l'état, mergeable après les points 1 à 3** — aucun désaccord de fond.

Le socle est fidèle à la spec : les neuf exigences sont implémentées (FR-001 partiellement), les
sept scénarios d'acceptation passent réellement contre la base du compose, les tests du développeur
sont intacts, le lint, `tsc --noEmit`, les unitaires et les e2e sont verts, et rien n'a été
implémenté hors périmètre. Les deux corrections à faire sont mécaniques (un `HealthRepository`, un
`app.enableShutdownHooks()`), la troisième documentaire (une ligne de `DECISIONS.md`), et aucune ne
touche un test d'acceptation ni le schéma Prisma.
