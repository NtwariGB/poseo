# Lot 2 : prix, devis, événements

**Branche** : `lot-2-devis`
**Créé le** : 2026-09-15
**Statut** : validé

## Stories et scénarios d'acceptation

### Story 1 : émettre un devis (P1)

En tant que vendeur, je veux émettre un devis à partir d'une prestation, afin de le remettre au client.

**Scénarios** :

1. **Étant donné** une prestation DRAFT `DISHWASHER_BUILTIN` en zone NORD (taux 4500 cents/h), avec
   `NO_ELEVATOR` et l'option `WASTE_DISPOSAL` cochée, **quand** j'appelle `POST /compositions/:id/quotes`,
   **alors** 201, `status = ISSUED`, une ligne OPERATION par opération sélectionnée avec
   `amountCents = round(durée × 4500 / 60)`, `laborCents` = somme des lignes OPERATION, `surchargeCents = 0`,
   `vatRateBp = 2000`, `totalCents = subtotalCents + vatCents`, `validUntil = issuedAt + 30 jours`,
   `number` au format `Q-2026-000001`.
2. **Étant donné** la même prestation avec `HARD_ACCESS` (SURCHARGE 1500 bp), **quand** j'émets,
   **alors** une ligne SURCHARGE « Accès difficile » avec `amountCents = round(laborCents × 1500 / 10000)`.
3. **Étant donné** une prestation `WATER_HEATER_ELEC` avec `LOAD_BEARING_WALL` (SURCHARGE 3000 cents),
   **quand** j'émets, **alors** une ligne SURCHARGE de 3000 cents.
4. **Étant donné** une prestation hors zone couverte, **quand** j'émets, **alors** 422 `ZONE_NOT_COVERED`.
5. **Étant donné** une prestation qui a déjà un devis ISSUED, **quand** j'émets à nouveau, **alors** 201,
   le nouveau devis est ISSUED, l'ancien passe SUPERSEDED, la prestation reste QUOTED.
6. **Étant donné** deux émissions successives sur le même tenant, **alors** les numéros se suivent
   (`000001`, `000002`) ; un autre tenant repart à `000001`.
7. **Étant donné** une prestation d'un autre tenant, **quand** j'émets, **alors** 404 `COMPOSITION_NOT_FOUND`.

### Story 2 : consulter un devis (P1)

1. `GET /quotes/:id` renvoie le devis avec ses lignes et ses snapshots (`zoneCode`, `hourlyRateCents`,
   `productTypeLabel`). Un devis d'un autre tenant : 404 `QUOTE_NOT_FOUND`.
2. `GET /compositions/:id/quotes` liste les devis de la prestation, du plus récent au plus ancien.

### Story 3 : accepter un devis (P1)

1. **Étant donné** un devis ISSUED, **quand** j'appelle `POST /quotes/:id/accept`, **alors** 200,
   `status = ACCEPTED`, `acceptedAt` renseigné, la prestation passe `ACCEPTED`.
2. **Étant donné** un devis SUPERSEDED ou déjà ACCEPTED, **quand** j'accepte, **alors** 409 `QUOTE_NOT_ACCEPTABLE`.
3. **Étant donné** un devis dont `validUntil` est dépassé, **quand** j'accepte, **alors** 409 `QUOTE_EXPIRED`
   (le test crée le devis puis modifie `validUntil` en base via Prisma).
4. **Étant donné** une prestation ACCEPTED, **quand** je modifie ses contraintes ou ses options,
   **alors** 409 `COMPOSITION_LOCKED`.
5. **Étant donné** un devis ISSUED dont la prestation a été modifiée depuis l'émission,
   **quand** j'accepte, **alors** 409 `QUOTE_STALE`, le devis reste ISSUED et la prestation
   reste QUOTED (FR-216).
6. **Étant donné** une prestation ACCEPTED, **quand** j'émets un nouveau devis, **alors** 409
   `COMPOSITION_LOCKED` et aucun devis n'est créé (FR-212).

### Story 4 : événements sortants (P1)

1. **Étant donné** une émission, **alors** une ligne `outbox_event` existe avec `aggregatetype = quote`,
   `aggregateid = <id du devis>`, `type = quote.issued`, `payload` contenant
   `quoteId, number, tenantId, compositionId, totalCents, validUntil`.
2. Une acceptation produit `quote.accepted` ; une supersession produit `quote.superseded` pour l'ancien devis.
3. La ligne outbox et le changement métier sont dans la même transaction : si l'écriture du devis échoue,
   aucune ligne outbox (test unitaire du service avec repository moqué en échec).

## Exigences fonctionnelles

- **FR-201** : `POST /compositions/:id/quotes`. Recompose la prestation (règles à jour), calcule, persiste
  devis + lignes + outbox + compteur dans une transaction, passe l'ancien ISSUED en SUPERSEDED,
  passe la prestation en QUOTED.
- **FR-202** : calcul dans une classe pure `PricingRules` (`src/quote/pricing.rules.ts`), sans Prisma,
  selon la section 5 de `01-modele-domaine.md`. Tests unitaires : arrondis, pourcentage, montant fixe,
  plusieurs majorations, aucune opération sélectionnée (422 `NOTHING_TO_QUOTE`).
  Le cumul de majorations est couvert par ces tests unitaires seulement, pas en e2e : le seed n'a
  qu'une règle SURCHARGE par type de produit et le catalogue n'a pas d'API d'administration
  (ADR 0013, ADR 0020).
- **FR-203** : numérotation par `QuoteCounter` avec `SELECT ... FOR UPDATE` (via `$queryRaw` dans la
  transaction), format `Q-<année>-<6 chiffres>`.
- **FR-204** : `GET /quotes/:id`, `GET /compositions/:id/quotes`.
- **FR-205** : `POST /quotes/:id/accept` : contrôle ISSUED + validité, passe ACCEPTED, prestation ACCEPTED,
  outbox `quote.accepted`, même transaction.
- **FR-206** : module `outbox` avec `OutboxWriter.append(tx, { aggregateType, aggregateId, type, payload })`
  utilisable dans une transaction Prisma existante.
- **FR-207** : consommateur de démonstration `scripts/consume.ts` (kafkajs), topic `poseo.quote`,
  affiche `eventType` (en-tête) et le payload ; script npm `consume`. Non testé, vérifié à la main.
- **FR-208** : représentation d'un devis :
  `{ id, number, status, issuedAt, validUntil, acceptedAt, compositionId, productTypeLabel, zoneCode,
hourlyRateCents, lines: [{ position, kind, label, durationMinutes, hourlyRateCents, amountCents }],
laborCents, surchargeCents, subtotalCents, vatRateBp, vatCents, totalCents }`.
- **FR-209** : `QuoteLine.label` est un snapshot. Pour une ligne OPERATION c'est `Operation.label`
  du catalogue, pour une ligne SURCHARGE c'est `CompositionRule.label` (ADR 0020).
- **FR-210** : les `position` vont de 1 à n dans un ordre déterministe calculé à l'émission :
  lignes OPERATION d'abord (origin MANDATORY avant OPTIONAL, puis `Operation.code` en ordre
  alphabétique), lignes SURCHARGE ensuite (ADR 0020).
- **FR-211** : `GET /compositions/:id/quotes` sur une prestation d'un autre tenant renvoie 404
  `COMPOSITION_NOT_FOUND`, comme l'émission. Jamais 403, jamais 200 avec liste vide (ADR 0020).
- **FR-212** : `POST /compositions/:id/quotes` sur une prestation `ACCEPTED` renvoie 409
  `COMPOSITION_LOCKED` : l'acceptation fige la prestation (règle métier 8). Le contrôle passe
  par `CompositionRules.assertModifiable`, la même règle pure que la modification (ADR 0021 Q2,
  ADR 0023).
- **FR-213** : si la zone de la prestation n'a aucun taux en vigueur à l'instant de l'émission
  (`validFrom <= issuedAt`), l'émission renvoie 422 `LABOR_RATE_NOT_FOUND` et n'écrit rien
  (ADR 0021, point 7).
- **FR-214** : à l'émission, les contrôles s'enchaînent dans cet ordre : verrou de la prestation
  (FR-212), puis zone (`ZONE_NOT_COVERED`), puis taux (FR-213), puis calcul
  (`NOTHING_TO_QUOTE`). `ZONE_NOT_COVERED` prime donc sur `NOTHING_TO_QUOTE` : hors zone, la
  prestation n'est pas chiffrable, quelle que soit sa composition (ADR 0021, point 6).
- **FR-215** : un identifiant de devis mal formé (non-UUID) sur `GET /quotes/:id` ou
  `POST /quotes/:id/accept` renvoie 404 `QUOTE_NOT_FOUND`, comme un identifiant inconnu : on ne
  distingue jamais « mal formé », « inconnu » et « pas à vous » (ADR 0021, point 4).
- **FR-216** : `POST /quotes/:id/accept` renvoie 409 `QUOTE_STALE` si la prestation a été
  modifiée depuis l'émission du devis (`ServiceComposition.updatedAt > Quote.issuedAt`). Rien
  n'est écrit : le devis reste `ISSUED`, la prestation reste `QUOTED`, et le vendeur doit
  réémettre. L'émission fige `updatedAt` sur `issuedAt` pour que le devis qu'elle produit ne
  se rende pas périmé lui-même. Les contrôles d'acceptation s'enchaînent dans cet ordre :
  statut (`QUOTE_NOT_ACCEPTABLE`), validité (`QUOTE_EXPIRED`), fraîcheur (`QUOTE_STALE`)
  (ADR 0023).

## Entités concernées

- Lecture : `ServiceComposition` et ses enfants, catalogue, `LaborRate`, `CompositionRule` (SURCHARGE).
- Écriture : `Quote`, `QuoteLine`, `QuoteCounter`, `OutboxEvent`, `ServiceComposition.status`.

## Hypothèses

- Le seed du lot 1 n'est pas modifié.
- Les tests e2e créent leurs prestations via l'API du lot 1.

## Hors périmètre du lot

- Expiration automatique par tâche planifiée (spécifiée dans le modèle, non implémentée ce soir).
- Page Svelte.
- Rendu PDF du devis.
