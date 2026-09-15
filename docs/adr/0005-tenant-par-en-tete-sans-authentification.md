# 0005 — Tenant par en-tête, pas d'authentification

Date : 2026-09-12
Statut : accepté

Contexte : multi-tenant requis, deux jours de développement.
Décision : `X-Tenant-Id` obligatoire sur chaque requête, filtrage systématique en base.
Écarté : JWT avec tenant dans les claims (hors sujet pour la démonstration).
Conséquence : à remplacer par une vraie authentification avant tout usage réel.
