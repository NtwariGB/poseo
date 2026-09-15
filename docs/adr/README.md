# Journal de décisions d'architecture (ADR)

Un fichier par décision, numéroté chronologiquement. Format : contexte, décision,
alternatives écartées, conséquence. Toute question remontée par l'agent et tranchée par le
développeur donne lieu à un nouvel ADR.

| N°   | Date       | Titre                                                                                                                   | Statut  |
| ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------- | ------- |
| 0001 | 2026-09-12 | [Prisma épinglé en version 7](0001-prisma-epingle-en-version-7.md)                                                      | accepté |
| 0002 | 2026-09-12 | [CommonJS plutôt qu'ES Modules](0002-commonjs-plutot-que-es-modules.md)                                                 | accepté |
| 0003 | 2026-09-12 | [Publication des événements par outbox + Debezium (CDC)](0003-publication-des-evenements-par-outbox-debezium.md)        | accepté |
| 0004 | 2026-09-12 | [Kafka officiel en KRaft plutôt que Redpanda](0004-kafka-kraft-plutot-que-redpanda.md)                                  | accepté |
| 0005 | 2026-09-12 | [Tenant par en-tête, pas d'authentification](0005-tenant-par-en-tete-sans-authentification.md)                          | accepté |
| 0006 | 2026-09-12 | [Identifiants UUID v7, montants en centimes, durées en minutes](0006-uuid-v7-montants-en-centimes-durees-en-minutes.md) | accepté |
| 0007 | 2026-09-12 | [Numérotation des devis par table compteur](0007-numerotation-des-devis-par-table-compteur.md)                          | accepté |
| 0008 | 2026-09-12 | [Invariant « un seul devis ISSUED / ACCEPTED par prestation »](0008-invariant-un-seul-devis-issued-accepted.md)         | accepté |
| 0009 | 2026-09-12 | [Arbitrages du schéma Prisma](0009-arbitrages-du-schema-prisma.md)                                                      | accepté |
| 0010 | 2026-09-12 | [Arbitrages du lot 0 (socle technique)](0010-arbitrages-du-lot-0-socle-technique.md)                                    | accepté |
| 0011 | 2026-09-12 | [NestJS épinglé en 11](0011-nestjs-epingle-en-11.md)                                                                    | accepté |
| 0012 | 2026-09-12 | [`rootDir: "."` dans `tsconfig.json`](0012-rootdir-dans-tsconfig-json.md)                                               | accepté |
| 0013 | 2026-09-12 | [Catalogue chargé par seed, pas d'API d'administration](0013-catalogue-charge-par-seed-sans-api-admin.md)               | accepté |
| 0014 | 2026-09-12 | [Options non cochées par défaut, type de produit immuable](0014-options-non-cochees-type-de-produit-immuable.md)        | accepté |
| 0015 | 2026-09-12 | [Contrats précisés par l'agent-tests (lot 1)](0015-contrats-precises-par-agent-tests-lot-1.md)                          | accepté |
| 0016 | 2026-09-12 | [Arbitrages du lot 1 (catalogue et composition)](0016-arbitrages-du-lot-1-catalogue-et-composition.md)                  | accepté |
| 0017 | 2026-09-12 | [Suites de la revue du lot 1](0017-suites-de-la-revue-du-lot-1.md)                                                      | accepté |
| 0018 | 2026-09-15 | [Lot 2 réduit pour tenir en une soirée](0018-lot-2-reduit-pour-tenir-en-une-soiree.md)                                  | accepté |
| 0019 | 2026-09-15 | [L'émission du devis recompose la prestation](0019-emission-du-devis-recompose-la-prestation.md)                        | accepté |
| 0020 | 2026-09-15 | [Contrats précisés par l'agent-tests (lot 2)](0020-contrats-precises-par-agent-tests-lot-2.md)                          | accepté |
| 0021 | 2026-09-15 | [Arbitrages de l'agent-code (lot 2)](0021-arbitrages-de-l-agent-code-lot-2.md)                                          | accepté |
| 0022 | 2026-09-15 | [Le verrou de la prestation ne porte que sur ACCEPTED](0022-le-verrou-de-la-prestation-ne-porte-que-sur-accepted.md)    | accepté |
| 0023 | 2026-09-15 | [Acceptation refusée si la prestation a bougé depuis l'émission](0023-acceptation-refusee-si-la-prestation-a-bouge.md)  | accepté |
| 0024 | 2026-09-15 | [Page de démonstration vérifiée à la main, sans test navigateur](0024-page-de-demonstration-verifiee-a-la-main.md)      | accepté |
| 0025 | 2026-09-15 | [Arbitrages du lot 3 (page de démonstration)](0025-arbitrages-du-lot-3-page-de-demonstration.md) | accepté |
