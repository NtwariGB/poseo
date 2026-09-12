# Périmètre métier

## Contexte

Un client achète en magasin un produit qui nécessite une installation (lave-vaisselle encastrable,
chauffe-eau, porte de garage). Le vendeur compose la prestation d'installation adaptée au produit et
à la situation du client, puis émet un devis. Une fois accepté, le devis part vers la planification,
qui est hors de notre périmètre.

## Acteurs

- Administrateur réseau : maintient le catalogue de travaux, les grilles de main d'œuvre et les règles
  de composition pour son enseigne et son pays.
- Vendeur : compose la prestation et émet le devis, face au client.
- Client : reçoit le devis, l'accepte ou le laisse expirer.

## Objets métier

- Enseigne / pays (tenant) : chaque enseigne dans chaque pays a son propre catalogue, ses grilles et
  ses règles. Rien n'est partagé implicitement.
- Type de produit : catégorie installable (lave-vaisselle encastrable, chauffe-eau électrique...).
  C'est ce qui déclenche les règles.
- Opération : unité de travail du catalogue (dépose de l'ancien appareil, pose, raccordement eau,
  raccordement électrique, évacuation des déchets, protection des sols). Durée de référence en minutes.
- Grille de main d'œuvre : taux horaire par zone géographique.
- Zone : découpage géographique de l'enseigne (par département, région ou liste de codes postaux).
- Contrainte client : élément de la situation qui influence la prestation (étage sans ascenseur,
  appareil existant à évacuer, absence d'arrivée d'eau, mur porteur, accès difficile).
- Règle de composition : pour un type de produit et éventuellement une contrainte, quelles opérations
  sont obligatoires, optionnelles ou interdites, et quelles majorations s'appliquent.
- Prestation : brouillon de travail du vendeur : produit, adresse du client (donc zone), contraintes
  déclarées, opérations retenues. Modifiable et recalculable tant qu'aucun devis n'est émis dessus.
- Devis : photographie de la prestation à un instant donné : lignes détaillées (opération, durée,
  taux, montant), majorations, total, durée de validité, numéro unique. Immuable.

## Règles métier

1. Composition : les opérations obligatoires pour le type de produit sont toujours présentes, le
   vendeur ne peut pas les retirer. Les optionnelles sont proposées, il choisit. Une contrainte client
   peut rendre une optionnelle obligatoire (étage sans ascenseur rend « portage » obligatoire) ou
   ajouter une majoration.
2. Cohérence : une opération interdite pour un type de produit ne peut pas être ajoutée (pas de
   raccordement gaz sur un chauffe-eau électrique).
3. Prix d'une ligne : durée de référence × taux horaire de la zone du client. Majorations en
   pourcentage ou en montant fixe, appliquées après.
4. Zone : déterminée par l'adresse du client. Adresse hors de toute zone couverte : la prestation ne
   peut pas être chiffrée, message explicite.
5. Émission : un devis ne peut être émis que si la prestation est complète (produit, adresse, toutes
   les obligatoires présentes, zone couverte).
6. Immuabilité : un devis émis ne change jamais. Toute modification de la prestation après émission
   produit un nouveau devis, l'ancien passe en « remplacé ».
7. Validité : durée de validité fixée par l'enseigne ; passé ce délai, le devis passe en « expiré » et
   ne peut plus être accepté.
8. Acceptation : un seul devis accepté par prestation ; l'acceptation fige définitivement la prestation.
9. Versioning des grilles : un changement de tarif ne touche pas les devis déjà émis, seulement les
   prestations recalculées ensuite.

## Parcours nominal

1. Le vendeur crée une prestation : type de produit + adresse du client.
2. Il déclare les contraintes du client.
3. Le système applique les règles : liste des opérations, obligatoires verrouillées, optionnelles à cocher.
4. Le vendeur ajuste les optionnelles ; le prix se recalcule.
5. Il émet le devis ; le client le reçoit avec sa date de validité.
6. Le client accepte : événement vers la planification. Ou le devis expire.

## Cas limites à traiter

- Le vendeur change le type de produit après avoir coché des optionnelles : on recompose et on perd ce
  qui n'est plus valide, avec avertissement.
- Adresse modifiée après émission : nouveau devis.
- Contrainte ajoutée qui rend une opération interdite déjà cochée : rejet avec explication.
- Grille de main d'œuvre modifiée pendant qu'une prestation est en brouillon : le prochain calcul prend
  la nouvelle grille.

## Hors périmètre, assumé

- Planification de l'intervention (SDO).
- Signature électronique, paiement, facturation.
- Prix du produit lui-même : on chiffre l'installation, le produit est référencé par identifiant.
- Remises commerciales, multi-devise, taxes détaillées (un taux de TVA unique par enseigne / pays suffit).
- Gestion des artisans et de leur disponibilité.

## Correspondance avec le Quote Framework

SOR (catalogue, tarifs par zone, assemblage d'une prestation) et SQS (prix final, émission du devis).
SDO reste le consommateur de l'événement d'acceptation.
