# 0012 — `rootDir: "."` dans `tsconfig.json`

Date : 2026-09-12
Statut : accepté

Le `tsconfig.json` racine sert aussi de configuration aux outils qui lisent hors de `src/`
(`jest.config.ts`, `prisma7.config.ts`, `test/*.e2e-spec.ts`) : avec `rootDir: "./src"`, `tsc --noEmit`
sur ce fichier refuse les fichiers situés au-dessus de la racine. Le build n'est pas concerné,
`tsconfig.build.json` réimposant `rootDir: "./src"`, donc `dist/` garde sa structure.
