# 0024 : Page de démonstration vérifiée à la main, sans test navigateur

Date : 2026-09-15
Statut : accepté

## Contexte

Le lot 3 est une page unique de démonstration, construite en une soirée. Un harnais de test
navigateur (Playwright) coûterait plus que la page elle-même.

## Décision

Vérification manuelle selon un script écrit dans la spec. Toute la logique testable reste côté
API, déjà couverte par les lots 0 à 2 ; la page ne contient aucune règle métier.

## Écarté

Playwright ; tests de composants Svelte.

## Conséquence

Si la page devient un vrai front, le premier lot suivant ajoute un test navigateur sur le script
de démonstration.
