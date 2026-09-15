# 0002 — CommonJS plutôt qu'ES Modules

Date : 2026-09-12
Statut : accepté

Contexte : le Nest CLI propose ESM + vitest ou CJS + Jest à la création.
Décision : CommonJS + Jest, `moduleFormat = "cjs"` côté Prisma.
Écarté : ESM, plus moderne mais source de frictions avec les décorateurs et certains paquets.
Conséquence : outillage de test standard NestJS, pas de configuration ESM à maintenir.
