# 0021 : Arbitrages de l'agent-code (lot 2)

Date : 2026-09-15
Statut : accepté

## Contexte

Trois points que `specs/lot-2-devis.md` et les ADR 0018 à 0020 ne tranchent pas ont été remontés
avant implémentation, plus trois points annexes qui ne font que prolonger le lot 1.

## Décision

1. **Q1 — La recomposition de l'émission (ADR 0019) n'est pas persistée** : les règles et le tarif
   courants sont rejoués en mémoire pour construire le devis, les `ServiceOperation` de la
   prestation ne sont pas réécrites.
2. **Q2 — Émettre sur une prestation `ACCEPTED` est refusé** par 409 `COMPOSITION_LOCKED`
   (règle métier 8 : l'acceptation fige définitivement la prestation).
3. **Q3 — Les lignes SURCHARGE sont ordonnées entre elles par `label` alphabétique**, FR-210 ne
   fixant que leur placement après les lignes OPERATION.
4. `GET /quotes/:id` avec un identifiant mal formé renvoie 404 `QUOTE_NOT_FOUND`, comme le lot 1
   traite une prestation au format invalide.
5. L'année du numéro de devis est celle de `issuedAt` côté serveur.
6. Quand deux motifs de refus coexistent, la zone est vérifiée avant « rien à chiffrer » : le taux
   horaire est nécessaire au calcul, donc `ZONE_NOT_COVERED` prime sur `NOTHING_TO_QUOTE`.
7. Une zone couverte mais sans taux en vigueur à l'instant de l'émission renvoie 422
   `LABOR_RATE_NOT_FOUND`, et non `ZONE_NOT_COVERED` qui dirait faux au vendeur.

## Alternatives écartées

- Q1 : réécrire les opérations recomposées sur la prestation — muterait une prestation `QUOTED`,
  que FR-110 gèle, et effacerait sans trace ce que le vendeur avait sous les yeux.
- Q2 : accepter une réémission sur une prestation `ACCEPTED` — contredirait règle métier 8.
- Q3 : conserver l'ordre d'évaluation des règles — non déterministe, écarté pour les mêmes raisons
  qu'en ADR 0020.
- Point 7 : réutiliser `ZONE_NOT_COVERED` — l'adresse est couverte, c'est la grille tarifaire qui
  manque ; le vendeur chercherait l'erreur du mauvais côté.

## Conséquence

Conséquence de Q1, noir sur blanc : si le catalogue ou les règles ont changé entre la composition
et l'émission, le devis peut contenir des opérations que `GET /compositions/:id` n'affiche pas, et
en omettre qu'il affiche. Le devis est la photographie faisant foi, la prestation reste le
brouillon tel que le vendeur l'a laissé.
