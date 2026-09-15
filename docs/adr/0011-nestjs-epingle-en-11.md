# 0011 — NestJS épinglé en 11

Date : 2026-09-12
Statut : accepté

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
