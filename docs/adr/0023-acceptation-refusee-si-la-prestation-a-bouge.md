# 0023 : Acceptation refusée si la prestation a bougé depuis l'émission

Date : 2026-09-15
Statut : accepté

## Contexte

Écart n° 1 de `specs/reviews/lot-2.md`. `specs/00-perimetre.md`, règle métier 6 :
« Toute modification de la prestation après émission produit un nouveau devis, l'ancien passe
en « remplacé » ». L'ADR 0022 s'appuie sur cette règle pour rendre une prestation `QUOTED`
modifiable, mais n'en implémente que la moitié : la modification est autorisée sans qu'aucun
nouveau devis soit produit ni l'ancien superseded — la supersession n'a lieu qu'à la
réémission explicite (`quote.service.ts`, `supersedeIssued`).

Conséquence observée : on coche une option coûteuse sur une prestation `QUOTED`, puis on
accepte le devis `ISSUED` d'avant. `accept()` ne revérifiait rien. La prestation se retrouve
figée `ACCEPTED` sur un devis dont les lignes ne la décrivent plus.

Deux décisions annexes étaient à prendre : la duplication du verrou `ACCEPTED`, exprimé à la
fois dans `CompositionRules.assertModifiable` et en dur dans `QuoteService.issue` avec un
message différent (écart n° 5), et le fait que `ServiceComposition.updatedAt` bouge aussi
quand l'émission écrit le statut `QUOTED`.

## Décision

**L'acceptation refuse un devis dont la prestation a bougé depuis l'émission.**
`POST /quotes/:id/accept` renvoie 409 `QUOTE_STALE` quand
`ServiceComposition.updatedAt > Quote.issuedAt`. Rien n'est écrit : le devis reste `ISSUED`,
la prestation reste `QUOTED`, le vendeur réémet. C'est FR-216.

Les contrôles d'acceptation s'enchaînent dans cet ordre : statut (`QUOTE_NOT_ACCEPTABLE`),
validité (`QUOTE_EXPIRED`), fraîcheur (`QUOTE_STALE`). La validité est une règle du périmètre
(règle métier 7), la fraîcheur une garde ajoutée ici : elle passe en dernier.

**`updatedAt` date le dernier mouvement métier, pas la dernière écriture SQL.**
`CompositionRepository.setStatus` prend désormais l'instant à inscrire et l'émission lui passe
`issuedAt`. Sans cela, `setStatus(QUOTED)` ayant lieu après la capture de `issuedAt`, tout
devis serait périmé à la seconde de sa naissance. L'acceptation passe `acceptedAt` pour la
même raison de cohérence.

**Les deux chemins de modification datent la prestation explicitement.** `updatedAt` est une
colonne `@updatedAt`, mais l'`updateMany({ data: {} })` que `replaceConstraintsAndOperations`
et `updateOperationSelection` émettaient pour prouver l'appartenance au tenant ne la touchait
pas : sans champ à écrire, Prisma n'émet aucun `SET`, et la colonne restait à la date de
création. Le commentaire du lot 1 (« `updatedAt` ne bouge que si la prestation elle-même est
touchée ») décrivait une intention, pas le comportement obtenu. Les deux écritures passent
désormais `updatedAt` explicitement. C'est ce qui rend FR-216 observable : sans cela, modifier
contraintes ou options ne datait rien et aucun devis n'aurait jamais été détecté périmé.

**Le verrou `ACCEPTED` de l'émission passe par la règle pure.** `QuoteService.issue` appelle
`CompositionRules.assertModifiable` au lieu de redire le test en dur : émettre est un
mouvement de la prestation au même titre que la modifier. C'est FR-212, et cela supprime la
duplication qui avait produit l'incohérence FR-110 corrigée par l'ADR 0022.

## Alternatives écartées

- **Supersession automatique à la modification** (option A, la lettre de la règle métier 6) :
  `PUT /constraints` et `PATCH /operations` feraient passer le devis `ISSUED` en `SUPERSEDED`
  et émettraient le remplaçant. Écartée ce soir : le module `service` devrait appeler le
  module `quote`, qui appelle déjà `service` (`resolveForQuote`, `setStatus`) — dépendance
  circulaire entre modules NestJS, à casser par un port dédié qu'on n'a pas le temps de
  concevoir correctement. C'est la cible : quand le module devis exposera un port
  d'émission consommable par `service`, la modification produira le nouveau devis elle-même
  et `QUOTE_STALE` deviendra une garde défensive plutôt que le mécanisme principal.
- **Superséder sans réémettre** : la modification passerait le devis `SUPERSEDED` sans en
  produire d'autre. Moins de code, mais une prestation `QUOTED` sans aucun devis vivant est un
  état que le modèle de domaine ne décrit pas.
- **Comparer le contenu plutôt que les dates** : recomposer et rechiffrer à l'acceptation pour
  comparer les totaux. Plus fin — une modification sans effet sur le prix resterait
  acceptable — mais cela referait tout le calcul à chaque acceptation, et ferait dépendre le
  verdict du catalogue du moment, pas de la prestation.
- **Ne rien faire et documenter** : l'écart touche une source de vérité, la fenêtre
  d'incohérence est atteignable par l'API publique.

## Conséquence

Un vendeur qui retouche une prestation devisée doit réémettre avant de faire signer. Le
parcours reste celui de la règle métier 6, mais la supersession est déclenchée par la
réémission, pas par la modification : l'écart à la lettre de la règle est borné et tracé ici.
`QUOTE_STALE` est un nouveau code d'erreur public, en 409.

Limite connue : `updatedAt` étant figé sur `issuedAt` à l'émission, une modification concourante
glissée entre la capture de `issuedAt` et le commit de la transaction d'émission serait masquée.
Sans transaction sérialisable ni verrou sur la prestation, ce cas n'est pas couvert ; il est
hors de portée d'une démonstration mono-utilisateur.
