# 0001 — Prisma épinglé en version 7

Date : 2026-09-12
Statut : accepté

Contexte : Prisma 8 vient de sortir avec une CLI unifiée et un découpage de paquets refondus
(`prisma orm init`, `@prisma/orm-postgres`, notion de contrat).
Décision : rester sur Prisma 7 (générateur `prisma-client`, adaptateur `@prisma/adapter-pg`).
Écarté : Prisma 8, documentation encore mince et courbe d'apprentissage non budgétée sur deux jours.
Conséquence : montée de version à planifier plus tard, isolée dans le module `prisma`.
