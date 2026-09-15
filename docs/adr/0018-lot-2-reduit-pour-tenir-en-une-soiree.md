# 0018 : Lot 2 réduit pour tenir en une soirée

Date : 2026-09-15
Statut : accepté

## Contexte

Entretien le 17/09. Le lot complet (prix, devis, acceptation, expiration planifiée, page Svelte)
risque de ne rien merger à temps.

## Décision

Le lot 2 couvre l'émission, l'acceptation et les événements sortants. L'expiration par tâche
planifiée et la page Svelte sont reportées.

## Écarté

Lot complet.

## Conséquence

L'expiration reste spécifiée dans le modèle de domaine mais non implémentée ; un devis périmé
est refusé à l'acceptation, pas basculé automatiquement en EXPIRED.
