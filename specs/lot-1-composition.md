# Lot 1 : catalogue et composition de prestation

**Branche** : `lot-1-composition`
**Créé le** : 2026-09-12
**Statut** : validé

## Stories et scénarios d'acceptation

### Story 1 : composer une prestation (P1)

En tant que vendeur, je veux créer une prestation à partir d'un type de produit et de l'adresse du
client, afin d'obtenir la liste des opérations à réaliser.

**Test indépendant** : `POST /compositions` renvoie une prestation en `DRAFT` avec ses opérations
obligatoires et optionnelles issues des règles du type de produit.

**Scénarios** :

1. **Étant donné** le catalogue seed et le type `DISHWASHER_BUILTIN`, **quand** je crée une prestation
   avec ce type, `productRef = "DW-8842"` et une adresse en `59000 Lille`, **alors** je reçois 201,
   `status = DRAFT`, les opérations REQUIRE du type en `origin = MANDATORY, selected = true`, les
   opérations OFFER en `origin = OPTIONAL, selected = false`, et `zone = { code: "NORD" }`.
2. **Étant donné** un type de produit d'un autre tenant, **quand** je crée une prestation avec,
   **alors** je reçois 404 `PRODUCT_TYPE_NOT_FOUND`.
3. **Étant donné** une adresse en `75001 Paris` (hors zones du tenant), **quand** je crée une prestation,
   **alors** je reçois 201 avec `zone = null` et `warnings` contenant `ZONE_NOT_COVERED`.
4. **Étant donné** un corps sans `productRef`, **quand** je crée une prestation, **alors** je reçois 400
   `VALIDATION_FAILED` avec `details` listant le champ.

### Story 2 : déclarer les contraintes du client (P1)

En tant que vendeur, je veux déclarer les contraintes de la situation du client, afin que les
opérations et majorations correspondantes soient prises en compte.

**Test indépendant** : `PUT /compositions/:id/constraints` remplace les contraintes et recompose.

**Scénarios** :

1. **Étant donné** une prestation `DISHWASHER_BUILTIN` sans contrainte, **quand** je déclare
   `NO_ELEVATOR`, **alors** l'opération `CARRY_UPSTAIRS` apparaît en `MANDATORY` (règle REQUIRE
   liée à la contrainte).
2. **Étant donné** une prestation avec `NO_ELEVATOR` déclarée, **quand** je remplace les contraintes
   par une liste vide, **alors** `CARRY_UPSTAIRS` disparaît.
3. **Étant donné** une prestation où l'option `OLD_APPLIANCE_REMOVAL` a été cochée, **quand** je
   déclare une contrainte qui ne la concerne pas, **alors** l'option reste cochée.
4. **Étant donné** une contrainte dont la règle FORBID retire une option précédemment cochée,
   **quand** je la déclare, **alors** l'option disparaît et `warnings` contient
   `OPERATION_REMOVED:<code>`.
5. **Étant donné** un `constraintTypeId` inconnu du tenant, **quand** je déclare, **alors** 404
   `CONSTRAINT_TYPE_NOT_FOUND`, et la prestation est inchangée.

### Story 3 : choisir les options (P1)

En tant que vendeur, je veux cocher ou décocher les opérations optionnelles, afin d'ajuster la
prestation au besoin du client.

**Scénarios** :

1. **Étant donné** une opération `OPTIONAL` non cochée, **quand** je la coche, **alors** `selected = true`.
2. **Étant donné** une opération `MANDATORY`, **quand** j'essaie de la décocher, **alors** 422
   `OPERATION_MANDATORY`.
3. **Étant donné** une opération absente de la prestation, **quand** je la coche, **alors** 404
   `OPERATION_NOT_IN_COMPOSITION`.

### Story 4 : consulter une prestation (P2)

**Scénarios** :

1. **Étant donné** une prestation existante, **quand** j'appelle `GET /compositions/:id`, **alors**
   je reçois le même corps que celui renvoyé par la création, à jour.
2. **Étant donné** une prestation d'un autre tenant, **quand** j'appelle `GET`, **alors** 404
   `COMPOSITION_NOT_FOUND` (jamais 403 : on ne révèle pas l'existence).

### Story 5 : lire le catalogue (P2)

**Scénarios** :

1. `GET /catalog/product-types`, `GET /catalog/operations`, `GET /catalog/constraint-types`
   renvoient les éléments du tenant courant uniquement.

## Cas limites

- Prestation en statut autre que `DRAFT` : toute modification (contraintes, options) renvoie 409
  `COMPOSITION_LOCKED`. Non déclenchable dans ce lot (aucun devis), mais la règle est codée et testée
  unitairement.
- Une opération à la fois FORBID et REQUIRE pour la même combinaison : FORBID gagne, et `warnings`
  contient `CATALOG_INCONSISTENT:<code>`.
- Opération obligatoire qui redevient optionnelle à la recomposition (la contrainte qui la rendait
  obligatoire est retirée, mais une règle OFFER la propose toujours) : elle repasse à
  `selected = false` — elle était cochée d'office, jamais choisie par le vendeur — et `warnings`
  contient `OPERATION_NOW_OPTIONAL:<code>`.
- Type de produit : non modifiable après création. Pour changer de produit, on crée une nouvelle
  prestation (simplification, voir DECISIONS.md).

## Exigences fonctionnelles

- **FR-101** : `POST /compositions` `{ productTypeId, productRef, addressLine, postalCode, city }`.
  Résout la zone par `postalCode`, applique les règles, persiste la prestation et ses opérations.
- **FR-102** : `PUT /compositions/:id/constraints` `{ constraintTypeIds: string[] }`. Remplace
  l'ensemble, recompose, conserve les sélections optionnelles encore valides, retourne la prestation.
- **FR-103** : `PATCH /compositions/:id/operations/:operationId` `{ selected: boolean }`.
- **FR-104** : `GET /compositions/:id`.
- **FR-105** : `GET /catalog/product-types`, `/catalog/operations`, `/catalog/constraint-types`.
- **FR-106** : moteur de règles dans une classe pure `CompositionRules` (`*.rules.ts`), entrée :
  règles applicables + contraintes déclarées + sélections actuelles ; sortie : opérations résolues
  - warnings. Sans Prisma, testée unitairement.
- **FR-107** : résolution par opération, dans l'ordre : FORBID > REQUIRE > OFFER. Règles applicables =
  règles du type de produit dont `constraintTypeId` est nul ou fait partie des contraintes déclarées.
- **FR-108** : représentation de sortie d'une prestation :
  `{ id, status, productType: { id, code, label }, productRef, address: { addressLine, postalCode, city },
zone: { id, code, label } | null, constraints: [{ id, code, label }],
operations: [{ operationId, code, label, referenceDurationMinutes, origin, selected }], warnings: string[] }`.
- **FR-109** : script `npm run seed` (`prisma/seed.ts`) idempotent, qui crée le tenant `LM-FR`
  (TVA 2000 bp, validité 30 jours) et le catalogue décrit ci-dessous. Relançable sans doublon.
- **FR-110** : toute écriture (FR-101 à FR-103) est refusée si `status != DRAFT` (409).

- **FR-111** : `PUT /compositions/:id/constraints` et `PATCH /compositions/:id/operations/:operationId`
  répondent 200 avec la représentation FR-108 complète et à jour.
- **FR-112** : `PUT /constraints` est atomique : un seul `constraintTypeId` inconnu rejette la requête
  entière (404), la prestation reste inchangée.
- **FR-113** : `prisma/seed.ts` exporte `seed(): Promise<void>`, sans argument, autonome pour sa
  connexion, idempotente ; le script npm l'appelle.

## Catalogue seed (tenant LM-FR)

- Types de produit : `DISHWASHER_BUILTIN` « Lave-vaisselle encastrable », `WATER_HEATER_ELEC`
  « Chauffe-eau électrique ».
- Opérations (code, libellé, minutes) : `INSTALL` Pose 60 ; `WATER_CONNECT` Raccordement eau 30 ;
  `ELEC_CONNECT` Raccordement électrique 30 ; `OLD_APPLIANCE_REMOVAL` Dépose ancien appareil 20 ;
  `WASTE_DISPOSAL` Évacuation déchets 15 ; `FLOOR_PROTECTION` Protection des sols 10 ;
  `CARRY_UPSTAIRS` Portage en étage 30 ; `GAS_CONNECT` Raccordement gaz 45.
- Zones : `NORD` (59000, 59100, 59200, 59491, 59650) ; `PDC` (62000, 62100, 62200).
- Taux horaires : `NORD` 4500 cents, `PDC` 4200 cents, `validFrom` 2026-01-01.
- Contraintes : `NO_ELEVATOR`, `OLD_APPLIANCE_REMOVAL`, `NO_WATER_INLET`, `LOAD_BEARING_WALL`, `HARD_ACCESS`.
- Règles `DISHWASHER_BUILTIN` : REQUIRE `INSTALL`, `WATER_CONNECT`, `ELEC_CONNECT` ; OFFER
  `OLD_APPLIANCE_REMOVAL`, `WASTE_DISPOSAL`, `FLOOR_PROTECTION` ; FORBID `GAS_CONNECT` ;
  avec `NO_ELEVATOR` : REQUIRE `CARRY_UPSTAIRS` ; avec `HARD_ACCESS` : SURCHARGE 1500 bp « Accès difficile ».
- Règles `WATER_HEATER_ELEC` : REQUIRE `INSTALL`, `WATER_CONNECT`, `ELEC_CONNECT`, `OLD_APPLIANCE_REMOVAL` ;
  OFFER `WASTE_DISPOSAL` ; FORBID `GAS_CONNECT` ; avec `NO_ELEVATOR` : REQUIRE `CARRY_UPSTAIRS` ;
  avec `LOAD_BEARING_WALL` : SURCHARGE 3000 cents « Fixation mur porteur ».

Les règles SURCHARGE sont chargées par le seed mais ignorées par ce lot (prix au lot 2).

## Entités concernées

- Lecture : `Tenant`, `ProductType`, `Operation`, `Zone`, `ZonePostalCode`, `ConstraintType`, `CompositionRule`.
- Écriture : `ServiceComposition`, `ServiceConstraint`, `ServiceOperation`.

## Hypothèses

- Les tests e2e utilisent le catalogue du seed, chargé par le test s'il est absent.
- Un second tenant `TEST-OTHER` est créé par les tests pour vérifier l'isolation.

## Hors périmètre du lot

- Calcul du prix, majorations, devis (lot 2).
- Écriture du catalogue par API (hors périmètre du week-end, voir DECISIONS.md).
- Modification du type de produit ou de l'adresse d'une prestation existante.
