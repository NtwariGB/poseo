# 0020 : Contrats précisés par l'agent-tests (lot 2)

Date : 2026-09-15
Statut : accepté

## Contexte

L'agent-tests du lot 2 a buté sur quatre points que `specs/lot-2-devis.md` n'a pas tranchés :
la source du `label` d'une ligne OPERATION, l'origine et l'ordre des `position` de lignes
(exposées par FR-208 sans règle d'attribution), le comportement de
`GET /compositions/:id/quotes` sur une prestation d'un autre tenant, et la couverture du cas
« plusieurs majorations » que FR-202 exige alors que le seed n'a qu'une règle SURCHARGE par type
de produit et que le catalogue n'a pas d'API d'administration (ADR 0013).

## Décision

1. `QuoteLine.label` d'une ligne OPERATION est le snapshot de `Operation.label` du catalogue,
   par symétrie avec les lignes SURCHARGE qui prennent `CompositionRule.label`.
2. Les `position` sont attribuées de 1 à n dans un ordre dérivé et déterministe : les lignes
   OPERATION d'abord (origin MANDATORY avant OPTIONAL, puis `Operation.code` en ordre
   alphabétique), les lignes SURCHARGE ensuite. Aucun champ d'ordre n'existe au catalogue et
   le schéma est contractuel : l'ordre est donc calculé à l'émission, pas stocké au catalogue.
3. `GET /compositions/:id/quotes` sur une prestation d'un autre tenant renvoie 404
   `COMPOSITION_NOT_FOUND`, comme l'émission (S1.7). Jamais 403, jamais 200 avec liste vide.
4. Le cumul de majorations est couvert par les tests unitaires de `PricingRules` (FR-202) et non
   en e2e : c'est du calcul pur, et le couvrir de bout en bout exigerait d'écrire du catalogue
   hors seed.

Ces quatre points sont intégrés à la spec du lot en FR-209 à FR-211 (le quatrième précise FR-202).

## Alternatives écartées

- Libellé enrichi de la durée (« Pose et raccordement (90 min) ») : redondant avec
  `durationMinutes`, déjà exposé ligne par ligne par FR-208.
- `position` suivant l'ordre d'évaluation du moteur de composition : non déterministe si l'ordre
  des règles en base change, et rendrait les assertions de test fragiles.
- 200 avec liste vide sur la liste inter-tenant : confond « prestation inexistante » et
  « prestation sans devis », et masque une erreur d'appel côté client.

## Conséquence

La spec reste la source : l'agent-code lit FR-209 à FR-211, pas les déductions du test.
L'ordre des lignes étant désormais défini, `test/lot-2.e2e-spec.ts` assert `position` à sa valeur
exacte et les lignes dans leur ordre, au lieu de les comparer comme un ensemble trié.
