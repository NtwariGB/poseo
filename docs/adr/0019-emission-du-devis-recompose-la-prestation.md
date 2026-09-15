# 0019 : L'émission du devis recompose la prestation

Date : 2026-09-15
Statut : accepté

## Contexte

Entre la composition et l'émission, le catalogue ou les tarifs peuvent avoir changé.

## Décision

L'émission rejoue les règles et le tarif courants avant de figer le devis, pour que le snapshot
reflète le catalogue du moment (règle 9 du périmètre).

## Écarté

Figer les opérations telles que stockées dans la prestation.

## Conséquence

Un changement de tarif entre deux émissions donne deux devis différents, l'ancien passant
SUPERSEDED ; les devis émis ne sont jamais modifiés.
