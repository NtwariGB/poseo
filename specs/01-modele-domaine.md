# Modèle de domaine

Conventions : identifiants UUID v7, montants en centimes, durées en minutes, pourcentages en
points de base (1 % = 100 bp). Toute entité racine porte un `tenantId` ; les entités filles
(`ServiceConstraint`, `ServiceOperation`, `QuoteLine`) sont isolées par leur parent et n'en portent
pas. Seule exception, `ZonePostalCode` porte un `tenantId` parce que son unicité est définie au
niveau du tenant.

## 1. Référentiel (module `catalog`)

### Tenant

Une enseigne dans un pays.

- `code` (unique) : ex. `LM-FR`, `BRICO-IT`
- `name`
- `countryCode` : ISO 3166-1 alpha-2
- `vatRateBp` : taux de TVA unique du tenant
- `quoteValidityDays` : durée de validité des devis émis

### ProductType

Catégorie de produit installable. Déclencheur des règles.

- `tenantId`, `code` (unique par tenant), `label`

### Operation

Unité de travail du catalogue.

- `tenantId`, `code` (unique par tenant), `label`
- `referenceDurationMinutes` : durée de référence

### Zone

Découpage géographique du tenant.

- `tenantId`, `code` (unique par tenant), `label`
- `postalCodes` : liste de codes postaux couverts (table `ZonePostalCode`, unique par tenant + code postal :
  un code postal appartient à une seule zone d'un tenant)

### LaborRate

Taux horaire de main d'œuvre d'une zone, versionné.

- `tenantId`, `zoneId`, `hourlyRateCents`, `validFrom`
- Le taux applicable à un instant t est celui de la zone avec le plus grand `validFrom <= t`.
- On n'écrase jamais un taux, on en ajoute un (règle métier 9).

### ConstraintType

Contrainte client possible.

- `tenantId`, `code` (unique par tenant), `label`
- ex. `NO_ELEVATOR`, `OLD_APPLIANCE_REMOVAL`, `NO_WATER_INLET`, `LOAD_BEARING_WALL`, `HARD_ACCESS`

### CompositionRule

Règle appliquée lors de la composition. Une règle est déclenchée par un type de produit, seul ou
combiné à une contrainte client.

- `tenantId`, `productTypeId`, `constraintTypeId` (nullable : règle valable sans contrainte)
- `kind` :
  - `REQUIRE` : l'opération `operationId` est obligatoire
  - `OFFER` : l'opération `operationId` est proposée en option
  - `FORBID` : l'opération `operationId` est interdite
  - `SURCHARGE` : majoration, `surchargePercentBp` ou `surchargeCents` (exactement un des deux)
- `operationId` : obligatoire pour REQUIRE / OFFER / FORBID, nul pour SURCHARGE
- `label` : libellé de la majoration (pour SURCHARGE)

Résolution des conflits, dans l'ordre : FORBID > REQUIRE > OFFER. Une opération à la fois
interdite et requise est interdite (et c'est une incohérence de catalogue à signaler).

## 2. Prestation (module `service`)

### ServiceComposition

Le brouillon de travail du vendeur.

- `tenantId`, `productTypeId`
- `productRef` : référence article du produit acheté par le client. Obligatoire. Le produit lui-même
  n'est pas chiffré (hors périmètre), il est seulement référencé.
- Adresse client : `addressLine`, `postalCode`, `city`
- `status` : `DRAFT` | `QUOTED` | `ACCEPTED`
- `createdAt`, `updatedAt`

### ServiceConstraint

Contrainte déclarée sur une prestation.

- `compositionId`, `constraintTypeId` (unique par prestation)

### ServiceOperation

Opération retenue sur une prestation, résultat de la composition.

- `compositionId`, `operationId` (unique par prestation)
- `origin` : `MANDATORY` | `OPTIONAL`
- `selected` : toujours vrai si MANDATORY ; choix du vendeur si OPTIONAL

Cycle de vie de la prestation :

- `DRAFT` → `QUOTED` à la première émission de devis
- `QUOTED` reste `QUOTED` à chaque nouvelle émission (l'ancien devis passe SUPERSEDED)
- `QUOTED` → `ACCEPTED` quand un devis est accepté ; la prestation devient immuable
- Toute modification (produit, adresse, contraintes, options) est refusée en `ACCEPTED`

## 3. Devis (module `quote`)

### Quote

Photographie immuable d'une prestation à un instant.

- `tenantId`, `compositionId`
- `number` (unique par tenant) : format `Q-<année>-<séquence sur 6 chiffres>`
- `status` : `ISSUED` | `ACCEPTED` | `EXPIRED` | `SUPERSEDED`
- `issuedAt`, `validUntil` (= issuedAt + quoteValidityDays du tenant)
- `acceptedAt` (nullable)
- Snapshots : `zoneCode`, `hourlyRateCents` (le taux utilisé), `productTypeLabel`
- Montants : `laborCents` (somme des lignes opérations), `surchargeCents`, `subtotalCents`,
  `vatRateBp`, `vatCents`, `totalCents`
- Aucune colonne n'est modifiable après création sauf `status` et `acceptedAt`.

### QuoteLine

Ligne détaillée du devis.

- `quoteId`, `position`
- `kind` : `OPERATION` | `SURCHARGE`
- `label`
- `durationMinutes`, `hourlyRateCents`, `amountCents` (pour OPERATION : durée × taux / 60, arrondi)
- Pour SURCHARGE : `durationMinutes` et `hourlyRateCents` nuls, `amountCents` calculé

Cycle de vie du devis :

- `ISSUED` → `ACCEPTED` (action client, avant validUntil)
- `ISSUED` → `EXPIRED` (tâche planifiée, après validUntil)
- `ISSUED` → `SUPERSEDED` (nouvelle émission sur la même prestation)
- `ACCEPTED`, `EXPIRED`, `SUPERSEDED` sont terminaux

Invariant : au plus un devis `ISSUED` et au plus un devis `ACCEPTED` par prestation.

### QuoteCounter

Compteur de numérotation des devis, un par tenant et par année (voir DECISIONS.md).

- Clé primaire composite : `tenantId`, `year`
- `lastValue` : dernière séquence attribuée pour ce tenant et cette année
- Incrémenté dans la transaction d'émission, avec verrou de ligne (`SELECT ... FOR UPDATE`).
  `Quote.number` vaut `Q-<year>-<lastValue sur 6 chiffres>`.

## 4. Événements (module `outbox`)

### OutboxEvent

Table lue par Debezium. Colonnes imposées par le connecteur.

- `id`
- `aggregatetype` : `quote` | `composition`
- `aggregateid` : id de l'agrégat
- `type` : `quote.issued` | `quote.accepted` | `quote.expired` | `quote.superseded`
- `payload` (JSON) : snapshot utile au consommateur (numéro, total, tenant, compositionId, validUntil)
- `createdAt`

Écrite dans la même transaction Prisma que le changement métier qu'elle décrit. Jamais mise à jour,
jamais supprimée.

## 5. Calcul du prix (règle de service, pas de table)

1. Zone = zone du tenant contenant `postalCode`. Absente → erreur `ZoneNotCovered`.
2. Taux = LaborRate applicable à la zone à l'instant de l'émission.
3. Pour chaque ServiceOperation sélectionnée : `amount = round(referenceDurationMinutes × hourlyRateCents / 60)`.
4. `laborCents` = somme des lignes.
5. Majorations : les règles SURCHARGE déclenchées (produit seul, ou produit + contrainte déclarée).
   `surchargeCents` en montant fixe, ou `round(laborCents × surchargePercentBp / 10000)` en pourcentage.
6. `subtotalCents = laborCents + surchargeCents`
7. `vatCents = round(subtotalCents × vatRateBp / 10000)`, `totalCents = subtotalCents + vatCents`

## 6. Points à trancher (→ DECISIONS.md)

- Numérotation des devis : séquence PostgreSQL par tenant ou table compteur ? Tranché voir DECISIONS.md
- Invariant « au plus un ISSUED / un ACCEPTED par prestation » : index unique partiel (SQL brut dans la
  migration) ou contrôle applicatif dans la transaction ? Tranché voir DECISIONS.md
- Arrondi des montants : au centime le plus proche (banker's rounding non nécessaire). Tranché.
