# 0022 : Le verrou de la prestation ne porte que sur ACCEPTED

Date : 2026-09-15
Statut : accepté

## Contexte

FR-110 du lot 1 refusait toute écriture sur une prestation dont le `status` n'est pas `DRAFT`.
La règle a été écrite quand `QUOTED` était inatteignable — le cas limite de
`specs/lot-1-composition.md` le disait lui-même : « Non déclenchable dans ce lot (aucun devis) ».
Le lot 2 émet des devis, donc rend l'état atteignable, et l'écart devient visible : CL3 de
`test/lot-2.e2e-spec.ts` modifie une option sur une prestation `QUOTED` et attend 200, là où le
lot 1 renvoyait 409 `COMPOSITION_LOCKED`.

Documents en conflit :

- `specs/00-perimetre.md`, règle métier 6 : « Toute modification de la prestation après émission
  produit un nouveau devis, l'ancien passe en « remplacé » » — modifier après émission est prévu.
- `specs/01-modele-domaine.md`, section 2 : « Toute modification (produit, adresse, contraintes,
  options) est refusée en `ACCEPTED` » — `ACCEPTED` seul.
- `specs/lot-2-devis.md`, S3.4 : le verrou est constaté sur une prestation `ACCEPTED`.
- `specs/lot-1-composition.md`, FR-110 : `status != DRAFT`, seul document à verrouiller `QUOTED`.

## Décision

L'autorité revient au périmètre et au modèle de domaine, qui sont les sources de vérité
fonctionnelle et du modèle : le verrou ne porte que sur `ACCEPTED`, avec le même code
`COMPOSITION_LOCKED` et le même statut 409. `CompositionRules.assertDraft` devient
`assertModifiable` et ne refuse que `ACCEPTED`. FR-110 et le cas limite correspondant de
`specs/lot-1-composition.md` sont corrigés en ce sens.

Le test unitaire `composition.rules.spec.ts` qui figeait l'ancienne règle est modifié avec
l'accord du développeur : « refuse une prestation déjà devisée » devient « laisse passer une
prestation devisée ». Le test d'acceptation CL3 n'est pas touché.

## Alternatives écartées

- Conserver `status != DRAFT` et amender le lot 2 : contredirait la règle métier 6, et
  interdirait au vendeur de corriger une prestation devisée sans en recréer une.
- Verrouiller `QUOTED` sauf pour les options : distinction qu'aucun document ne porte, et qui
  laisserait l'adresse non modifiable alors que le périmètre prévoit explicitement
  « Adresse modifiée après émission : nouveau devis ».

## Conséquence

Une prestation `QUOTED` reste un brouillon de travail : le vendeur l'ajuste et réémet, chaque
émission remplaçant le devis précédent. Seule l'acceptation la fige (règle métier 8). Une spec
de lot ne peut pas restreindre le modèle de domaine sans ADR : c'est ce qui a manqué au lot 1.
