# 0017 — Suites de la revue du lot 1

Date : 2026-09-12
Statut : accepté

Contexte : `specs/reviews/lot-1.md` relève deux points non tranchés et une divergence documentaire.
Tranchés par le développeur, puis corrigés (l'écart n° 1, le filtrage `tenantId` des écritures de
`composition.repository.ts`, est un défaut de conformité au CLAUDE.md et non un arbitrage : corrigé
sans décision, avec un test de non-régression dans `test/tenant-isolation.e2e-spec.ts`).

- Transition MANDATORY → OPTIONAL à la recomposition : l'opération repasse à `selected = false` et
  la réponse porte `OPERATION_NOW_OPTIONAL:<code>`. Une obligatoire est cochée d'office, jamais
  choisie ; la laisser cochée ferait passer pour un choix du vendeur ce qui n'en était pas un, et le
  prix du lot 2 s'en trouverait gonflé sans qu'il l'ait demandé. Écarté : conserver `selected = true`
  (silencieux) et retirer l'opération de la composition (elle reste proposable). Consigné dans les
  cas limites de `specs/lot-1-composition.md`.
- Divergence `specs/00-perimetre.md` / `specs/lot-1-composition.md` sur le cas « contrainte ajoutée
  qui rend une opération interdite déjà cochée » : le périmètre disait « rejet avec explication », la
  spec du lot « retrait + `OPERATION_REMOVED` ». C'est le lot qui a raison — rejeter la contrainte
  interdirait au vendeur de décrire la situation réelle du client à cause d'une option qu'il peut
  décocher. Le périmètre est aligné sur le retrait signalé.
