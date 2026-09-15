# 0010 — Arbitrages du lot 0 (socle technique)

Date : 2026-09-12
Statut : accepté

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
