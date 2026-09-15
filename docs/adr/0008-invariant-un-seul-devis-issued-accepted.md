# 0008 — Invariant « un seul devis ISSUED / ACCEPTED par prestation »

Date : 2026-09-12
Statut : accepté

Décision : les deux, en couches. Index uniques partiels en SQL brut ajoutés à la main dans la
migration (Prisma ne les exprime pas dans le schéma), plus contrôle applicatif dans la transaction
pour renvoyer une erreur métier lisible avant que la base ne refuse.
Écarté : contrôle applicatif seul (course possible entre deux émissions concurrentes).
Conséquence : la migration contient un bloc SQL manuel, documenté en commentaire.
