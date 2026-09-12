# Lot 0 : socle technique

**Branche** : `lot-0-socle`
**Créé le** : 2026-09-12
**Statut** : validé

## Stories et scénarios d'acceptation

### Story 1 : accès à la base partagé (P1)

En tant que développeur, je veux un module Prisma unique injectable partout, afin que chaque
module métier accède à la base sans créer sa propre connexion.

**Test indépendant** : l'application démarre, `GET /health` répond 200 avec `{ status: "ok", db: "up" }`.

**Scénarios** :

1. **Étant donné** l'application démarrée, **quand** j'appelle `GET /health`, **alors** je reçois 200 et `db: "up"`.

### Story 2 : identification du tenant (P1)

En tant que système, je veux que chaque requête métier porte un tenant identifié, afin de
garantir l'isolation des données.

**Test indépendant** : une requête sans `X-Tenant-Id` sur une route métier est rejetée.

**Scénarios** :

1. **Étant donné** une route métier, **quand** j'appelle sans `X-Tenant-Id`, **alors** je reçois 400
   avec un corps `{ code: "TENANT_HEADER_MISSING" }`.
2. **Étant donné** une route métier, **quand** j'appelle avec un `X-Tenant-Id` qui n'est pas un UUID,
   **alors** je reçois 400 avec `{ code: "TENANT_HEADER_INVALID" }`.
3. **Étant donné** une route métier, **quand** j'appelle avec un UUID de tenant inconnu,
   **alors** je reçois 404 avec `{ code: "TENANT_NOT_FOUND" }`.
4. `GET /health` ne nécessite pas de tenant.

### Story 3 : erreurs métier uniformes (P2)

En tant que client de l'API, je veux que toute erreur métier ait la même forme, afin de la traiter
sans deviner.

**Scénarios** :

1. **Étant donné** une `DomainError` levée par un service, **quand** elle remonte au contrôleur,
   **alors** la réponse a le statut HTTP porté par l'erreur et le corps `{ code, message, details? }`.

## Exigences fonctionnelles

- **FR-001** : `PrismaModule` global, `PrismaService` construit avec `@prisma/adapter-pg`, connecté
  au démarrage, déconnecté à l'arrêt.
- **FR-002** : `GET /health` vérifie la base par `SELECT 1`.
- **FR-003** : un middleware lit `X-Tenant-Id`, valide le format UUID, vérifie l'existence du tenant,
  et attache `{ id, code }` à la requête. Un décorateur `@CurrentTenant()` l'expose aux contrôleurs.
- **FR-004** : routes exemptées du tenant : `/health` uniquement.
- **FR-005** : classe `DomainError { code, httpStatus, message, details? }` et sous-classes
  `NotFoundError (404)`, `ValidationError (400)`, `ConflictError (409)`, `InvariantViolationError (422)`.
- **FR-006** : filtre global qui convertit `DomainError` en réponse HTTP ; les erreurs de validation
  class-validator sortent aussi au format `{ code: "VALIDATION_FAILED", message, details }`.
- **FR-007** : `ValidationPipe` global avec `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.
- **FR-008** : configuration via `@nestjs/config`, `DATABASE_URL` obligatoire au démarrage.

## Entités concernées

- **Tenant** : lecture seule dans ce lot.

## Hypothèses

- Pas d'authentification (DECISIONS.md, 2026-09-12).
- Les tests e2e tournent contre la base du compose ; le tenant de test est inséré par le test
  lui-même et supprimé après.

## Hors périmètre du lot

- Tout endpoint métier. Toute écriture en base autre que le tenant de test.
