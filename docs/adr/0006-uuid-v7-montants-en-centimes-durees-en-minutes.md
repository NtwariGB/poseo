# 0006 — Identifiants UUID v7, montants en centimes, durées en minutes

Date : 2026-09-12
Statut : accepté

Décision : `@default(uuid(7)) @db.Uuid` partout ; entiers pour l'argent et le temps.
Écarté : UUID v4 (non ordonné, index moins efficaces) ; décimaux JS pour les montants (arrondis).
Conséquence : tri chronologique possible par id ; conversion en euros uniquement à l'affichage.
