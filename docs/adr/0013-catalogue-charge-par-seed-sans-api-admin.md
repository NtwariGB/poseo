# 0013 — Catalogue chargé par seed, pas d'API d'administration

Date : 2026-09-12
Statut : accepté

Contexte : deux jours ; l'admin du catalogue coûte une dizaine d'endpoints sans valeur de démonstration.
Décision : script de seed idempotent, catalogue en lecture seule via l'API.
Écarté : CRUD complet du catalogue.
Conséquence : le catalogue se modifie en base ou par le seed ; à ajouter si le projet continue.
