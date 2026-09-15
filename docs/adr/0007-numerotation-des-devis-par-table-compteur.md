# 0007 — Numérotation des devis par table compteur

Date : 2026-09-12
Statut : accepté

Contexte : numéro unique par tenant au format `Q-<année>-<séquence>`.
Décision : table `QuoteCounter (tenantId, year, lastValue)` incrémentée dans la transaction
d'émission avec verrou de ligne (`SELECT ... FOR UPDATE`).
Écarté : séquence PostgreSQL par tenant (DDL dynamique à chaque nouveau tenant, invisible dans Prisma).
Conséquence : une écriture de plus par émission, ordre garanti, trous impossibles sauf rollback.
