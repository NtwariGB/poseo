# Revue du lot 2 — `lot-2-devis` (commit `9aa15ae`)

**Date** : 2026-09-15
**Périmètre relu** : `0d1eeb7..HEAD` (3 commits : `92f04df` spec, `8c2b5f1` tests rouges, `9aa15ae` implémentation)
**Références** : `CLAUDE.md`, `specs/00-perimetre.md`, `specs/01-modele-domaine.md`, `prisma/schema.prisma`, `specs/lot-2-devis.md`, ADR 0018 à 0022.

**Vérifications d'exécution** (infra Docker up) :
`npm run lint` vert · `npx tsc --noEmit` vert · `npm run test` 55/55 vert (6 suites) · `npm run test:e2e` 47/47 vert (4 suites, dont les 18 `it` de `test/lot-2.e2e-spec.ts`).

---

## Axe 1 — Fidélité à la spec

### Couverture des exigences fonctionnelles

| FR | État | Preuve |
|---|---|---|
| FR-201 `POST /compositions/:id/quotes`, transaction unique | couvert | `src/quote/composition-quotes.controller.ts:13-19`, `src/quote/quote.service.ts:45-164` (supersession, compteur, insert, outbox, statut : tout dans `quotes.transaction`, `:106-161`) |
| FR-202 `PricingRules` pure, sans Prisma | couvert | `src/quote/pricing.rules.ts` (n'importe que `InvariantViolationError`), 14 tests unitaires : arrondis `:62`, pourcentage `:116`, montant fixe `:135`, cumul `:146`, `NOTHING_TO_QUOTE` `:249` de `src/quote/pricing.rules.spec.ts` |
| FR-203 compteur `SELECT … FOR UPDATE`, `Q-<année>-<6>` | couvert | `src/quote/quote.repository.ts:79-101` (`$executeRaw` upsert + `$queryRaw … FOR UPDATE` + update, paramétrés) ; table `quote_counter` PK `(tenant_id, year)` conforme au schéma contractuel |
| FR-204 `GET /quotes/:id`, `GET /compositions/:id/quotes` | couvert | `quote.controller.ts:11-18`, `composition-quotes.controller.ts:21-27`, `quote.service.ts:167-190`, tri `issuedAt desc, id desc` `quote.repository.ts:190-199` |
| FR-205 acceptation | couvert | `quote.service.ts:196-252` : contrôle ISSUED `:201`, validité `:210`, `acceptIssued` re-filtré sur le statut `quote.repository.ts:161-177`, outbox + statut prestation dans la même transaction |
| FR-206 `OutboxWriter.append(tx, …)` | couvert | `src/outbox/outbox.writer.ts:16-31`, module dédié, aucun producteur Kafka dans l'app |
| FR-207 consommateur de démo | couvert (non testé, comme prévu) | `scripts/consume.ts`, script `consume` dans `package.json:18` ; lit l'en-tête `eventType` et la clé `aggregateid` |
| FR-208 représentation du devis | couvert | `src/quote/quote.view.ts:20-72` : les 16 champs de la spec, ni plus ni moins ; assertions `toEqual` strictes en e2e (S1.1, S1.2, S1.3, S2.1, CL2) |
| FR-209 `label` snapshot | couvert | `pricing.rules.ts:129` (OPERATION ← `Operation.label` via `composition.service.ts:247`), `:147` (SURCHARGE ← `CompositionRule.label` via `catalog.repository.ts:100-110`) |
| FR-210 ordre déterministe des `position` | couvert | `pricing.rules.ts:120-135` puis `:163-166` ; test unitaire `pricing.rules.spec.ts:97`, e2e `orderedLines` `test/lot-2.e2e-spec.ts:188-206` |
| FR-211 liste inter-tenant → 404 | couvert | `quote.service.ts:176-190` (la prestation est chargée avant la liste), test `test/lot-2.e2e-spec.ts:891-894` |

Aucun FR absent, aucun partiel.

### Scénarios d'acceptation

Les 13 scénarios de stories et les 3 cas limites ont chacun un `it` qui vérifie réellement le scénario (pas de test vert par accident) :

- **S1.1-S1.4** `test/lot-2.e2e-spec.ts:633-761` : S1.1 fait une égalité stricte sur la représentation entière et vérifie en plus l'absence des options non cochées et de `GAS_CONNECT` ; S1.4 vérifie qu'aucun devis n'a été créé et que la prestation reste `DRAFT`.
- **S1.5** `:763` : re-lecture du premier devis (`SUPERSEDED`), statut prestation `QUOTED`, et comptage de l'invariant « au plus un ISSUED ».
- **S1.6** `:795` : tenants dédiés `NUM-A`/`NUM-B`, assertions sur le numéro exact (`000001`, `000002`, puis `000001`) — robuste aux réexécutions.
- **S1.7** `:813`, **S2.1** `:825`, **S2.2** `:863` : isolation vérifiée par 404 + code d'erreur, jamais par une liste vide.
- **S3.1-S3.4** `:898-1025` : S3.3 recule `validUntil` via Prisma comme la spec l'exige et vérifie qu'aucun `acceptedAt` n'est posé ; S3.4 couvre contraintes + option cochée + option décochée.
- **S4.1-S4.2** `:1028-1111` : assertions sur `aggregatetype`, `aggregateid`, la séquence exacte des `type` par agrégat, et le contenu du payload ; vérifie qu'aucune ligne outbox n'est supprimée ni mise à jour.
- **S4.3** (test unitaire exigé par la spec) `src/quote/quote.service.spec.ts:155-191` : transaction simulée, trois modes d'échec (insert, supersession déjà écrite, statut prestation non écrit), à chaque fois `outboxRows` vide.
- **CL1-CL3** `:1115-1170` : CL3 prouve l'immuabilité par `toEqual({ ...firstQuote, status: 'SUPERSEDED' })`.

### Tests d'acceptation modifiés depuis leur commit ?

**Non.** `git diff 8c2b5f1..HEAD -- test/` est vide. Le commit d'implémentation n'a touché aucun fichier de `test/`.

### Code hors périmètre

Rien de substantiel. Trois écritures hors du répertoire `src/quote` sont chacune adossées à un ADR : `resolveForQuote` (`composition.service.ts:215-254`, ADR 0019/0021-Q1), `CompositionRepository.setStatus` (`composition.repository.ts:224-240`, FR-201/FR-205), `assertDraft → assertModifiable` (ADR 0022). Le seed du lot 1 n'est pas modifié, `prisma/schema.prisma` non plus, aucune migration ajoutée.

---

## Vérification 1 — Régression du verrou (ADR 0022)

### Diff des tests entre `0d1eeb7` et HEAD

`git diff 0d1eeb7..HEAD --stat -- test/` : **un seul fichier, `test/lot-2.e2e-spec.ts`, 1172 lignes ajoutées.** Aucun test e2e préexistant modifié ou supprimé.
`git diff 0d1eeb7..HEAD -- 'src/**/*.spec.ts'` : `pricing.rules.spec.ts` et `quote.service.spec.ts` créés, et `src/service/composition.rules.spec.ts` modifié — le seul fichier de test préexistant touché.

### Détail des modifications de `composition.rules.spec.ts`

| Test | Nature du changement | Autorisé par ADR 0022 ? |
|---|---|---|
| `describe('CompositionRules.assertDraft (FR-110)')` | renommé `assertModifiable` | oui, corollaire mécanique du renommage |
| `laisse passer une prestation en brouillon` | appel renommé, assertion identique (`not.toThrow`) | oui, mécanique |
| `refuse une prestation déjà devisée` → `laisse passer une prestation devisée` | **inversion de l'assertion** : `toThrow(ConflictError)` → `not.toThrow()` | **oui, c'est l'unique modification autorisée** |
| `refuse une prestation acceptée` | appel renommé, assertion inchangée (`toThrow(ConflictError)`) | oui, mécanique |
| `porte le code COMPOSITION_LOCKED et le statut 409` | appel renommé, assertions inchangées | oui, mécanique |

**Aucun test supprimé, aucun cas retiré, aucun `expect` relâché en dehors de l'inversion autorisée.** Le décompte global corrobore : 55 tests unitaires verts contre 37 à la revue du lot 1, soit +18 (14 `pricing.rules.spec.ts` + 4 `quote.service.spec.ts`), `composition.rules.spec.ts` gardant le même nombre de `it`.

### Couverture perdue : nulle

Le seul chemin autrefois protégé par `assertDraft` et qui ne l'est plus est l'écriture sur une prestation `QUOTED`. Sa protection n'était couverte que par le test unitaire inversé ci-dessus — état `QUOTED` inatteignable au lot 1. Aucun test e2e du lot 1 n'assérait `COMPOSITION_LOCKED`. Le nouveau comportement permissif est assuré à deux niveaux : unitaire (`composition.rules.spec.ts:333`) et e2e (`test/lot-2.e2e-spec.ts:1145-1152`, CL3). Bilan : une assertion retirée, deux ajoutées.

### Isolation tenant : non affaiblie

Dans `composition.service.ts`, le contrôle de tenant précède toujours le contrôle de statut — `this.load(tenantId, …)` en `:108` et `:167`, qui lève `COMPOSITION_NOT_FOUND` avant l'appel à `assertModifiable` en `:109` et `:168`. Assouplir le second ne peut donc pas ouvrir de fuite inter-tenant.
`test/tenant-isolation.e2e-spec.ts` attaque directement `CompositionRepository`, donc en aval de la règle : ses trois `it` ne passaient pas par `assertDraft` et sont inchangés. Ils passent toujours (47/47 e2e verts).

### `ACCEPTED` reste-t-il refusé partout ?

| Axe | Refusé ? | Preuve | Couverture de test |
|---|---|---|---|
| Options (`PATCH /:id/operations/:operationId`) | oui, 409 `COMPOSITION_LOCKED` | `composition.service.ts:168` | e2e S3.4 `:1001-1016`, cochage **et** décochage |
| Contraintes / recalcul (`PUT /:id/constraints`) | oui, 409 `COMPOSITION_LOCKED` | `composition.service.ts:109` | e2e S3.4 `:994-999` |
| Adresse, produit | sans objet | aucun endpoint de modification n'existe | — |
| Émission d'un nouveau devis | oui, 409 `COMPOSITION_LOCKED` (ADR 0021-Q2) | `quote.service.ts:52-58` | **aucune** (écart n° 3) |

**Conclusion : aucune régression.** L'assouplissement est strictement borné à ce que l'ADR 0022 autorise, la couverture perdue est nulle, l'isolation multi-tenant est intacte, et `ACCEPTED` reste verrouillé sur tous les chemins d'écriture existants. Seul le verrou à l'émission n'a pas de test.

---

## Vérification 2 — Étanchéité de l'agent-tests

### Fichiers écrits par l'agent-tests du lot 2

`git show --stat 8c2b5f1` : le commit n'ajoute **qu'un seul fichier de test**, `test/lot-2.e2e-spec.ts` (1172 lignes, création). Aucun fichier de test préexistant n'y est modifié.

### Imports depuis `src/`

`test/lot-2.e2e-spec.ts:1-8` :

```ts
import { PrismaClient } from '../src/generated/prisma/client';   // autorisé
import { AppModule } from '../src/app.module';                    // autorisé
import { seed } from '../prisma/seed';                            // hors src/, prévu par la charte
```

Aucun `require()` dynamique, aucun `import()`, aucun `jest.mock`, aucune lecture de fichier. Les types de sortie (`QuoteView`, `QuoteLineView`, `CompositionView`…) sont **redéclarés localement** aux lignes 29-97, dérivés de FR-208, et non importés du code.

### Indices indirects de lecture du code : aucun

- **Codes d'erreur assertés** : `ZONE_NOT_COVERED`, `COMPOSITION_NOT_FOUND`, `QUOTE_NOT_FOUND`, `QUOTE_NOT_ACCEPTABLE`, `QUOTE_EXPIRED`, `COMPOSITION_LOCKED`, `NOTHING_TO_QUOTE` — tous figurent nommément dans `specs/lot-2-devis.md`. Aucun code inventé par l'agent-code (`LABOR_RATE_NOT_FOUND`, `CATALOG_INCONSISTENT`, `SURCHARGE_RULE_INVALID`, `TENANT_NOT_FOUND`) n'apparaît : preuve négative attendue.
- **Aucune assertion sur un message d'erreur interne** : seuls `status` et `body.code` sont assérés.
- **Libellés en dur** : `'Accès difficile'`, `'Fixation mur porteur'` proviennent de `specs/lot-1-composition.md:139`/`:142` et de `prisma/seed.ts` — sources autorisées.
- **Ordre des lignes** : `orderedLines` réimplémente la règle FR-210 telle qu'écrite dans la spec, pas l'algorithme du code.
- Aucun nom de classe, de méthode privée ni de fichier de `src/` n'est cité, y compris en commentaire.

### Le faux positif `tenant-isolation.e2e-spec.ts`

`test/tenant-isolation.e2e-spec.ts:6` importe `CompositionRepository`. Origine établie :

```
git log --diff-filter=A -- test/tenant-isolation.e2e-spec.ts
→ 7730dd2  fix(lot-1): tenant-scoped writes, MANDATORY->OPTIONAL transition, scope doc reconciled
```

Fichier **créé au lot 1**, dans le commit de remédiation de la revue du lot 1 (20:22), 23 minutes avant le commit de tests du lot 2 (`8c2b5f1`, 20:45), et absent de `git show --stat 8c2b5f1`. Test blanc-boîte écrit côté développeur pour clore l'écart n° 1 de la revue du lot 1 (ADR 0017), hors du champ de la charte de l'agent-tests.

**Conclusion :**
- **Agent-tests du lot 2 : étanchéité respectée, sans réserve.** Un seul fichier écrit, deux imports `src/` autorisés, zéro fuite indirecte.
- **`tenant-isolation.e2e-spec.ts` : import hors charte, mais préexistant au lot 2 et non imputable à l'agent-tests.** À noter comme dette (écart n° 6).

---

## Axe 2 — Standards du CLAUDE.md

- **Règle métier dans un contrôleur** : aucune. `@HttpCode(200)` sur `accept` est un choix de protocole.
- **Accès Prisma hors repository** : aucun. Seuls `prisma.service.ts`, `health.repository.ts`, `tenant.repository.ts`, `catalog.repository.ts`, `composition.repository.ts`, `quote.repository.ts` et `outbox.writer.ts` touchent Prisma.
- **Requête sans filtre `tenantId`** : aucune sur une table multi-tenant. `quote.repository.ts` filtre dans ses six requêtes (`:113`, `:121`, `:135`, `:168`, `:174`, `:181`, `:195`) ; `nextNumber` filtre `tenant_id` dans ses trois requêtes brutes. `outbox_event` n'a pas de colonne tenant au schéma contractuel (le `tenantId` voyage dans le payload, `quote.events.ts:19`).
- **TypeScript strict** : `npx tsc --noEmit` vert, aucun `any` ni `as any` dans `src/quote` et `src/outbox`.
- **Erreurs typées** : uniquement `NotFoundError` / `ConflictError` / `InvariantViolationError` (404 / 409 / 422).
- **Nommage et conventions** : kebab-case, PascalCase, un fichier par classe, centimes entiers, minutes entières, aucun flottant conservé (`Math.round` à chaque étape).
- **Immuabilité du devis** : aucune écriture hors `status` / `acceptedAt` (`quote.repository.ts:120-123`, `:167-170`). Vérifié e2e par CL3.
- **Transactionnalité outbox** : outbox écrite via le `tx` métier dans les trois cas (`quote.service.ts:115`, `:144`, `:232`), jamais de producteur Kafka. Prouvé par `quote.service.spec.ts`.
- **Dépendances** : `package-lock.json` inchangé, `package.json` ne gagne qu'un script `consume`. `kafkajs` était déjà là depuis le lot 0. **Aucune dépendance ajoutée.**
- **ADR** : `docs/adr/README.md` indexe 0018 à 0022, tous datés, motivés, avec alternatives écartées. Les ADR 0021 et 0022 tracent des questions remontées avant implémentation.

---

## Écarts

### Bloquant

Aucun.

### À corriger

1. **Une prestation modifiée après émission ne remplace pas son devis, et le devis périmé reste acceptable.**
   `specs/00-perimetre.md`, règle métier 6 : « Toute modification de la prestation après émission produit un nouveau devis, l'ancien passe en « remplacé » ». L'ADR 0022 s'appuie sur cette règle pour déverrouiller `QUOTED`, mais n'en implémente que la moitié : la modification est autorisée (`composition.service.ts:109`, `:168`) sans qu'aucun nouveau devis soit produit ni l'ancien superseded — la supersession n'a lieu qu'à la réémission explicite (`quote.service.ts:109`). Conséquence : on peut cocher une option coûteuse sur une prestation `QUOTED`, puis accepter le devis `ISSUED` d'avant ; `accept()` ne revérifie rien, et la prestation est figée `ACCEPTED` avec un contenu divergent des lignes du devis accepté. Non bloquant — aucun scénario de la spec n'est mis en défaut — mais à trancher par ADR avant le lot 3.

2. **La spec du lot n'a pas été mise à jour après l'ADR 0021**, alors que le précédent ADR l'avait été (0020 → FR-209 à FR-211). L'ADR 0021 introduit quatre comportements observables absents des FR : 409 `COMPOSITION_LOCKED` à l'émission (Q2), 422 `LABOR_RATE_NOT_FOUND` (point 7), la précédence `ZONE_NOT_COVERED` > `NOTHING_TO_QUOTE` (point 6), le 404 sur identifiant mal formé (point 4). Méthode CLAUDE.md, point 7.

3. **ADR 0021-Q2 implémenté, jamais testé.** Le refus d'émettre sur une prestation `ACCEPTED` (`quote.service.ts:52-58`) n'a ni test e2e ni test unitaire. Une régression sur ce `if` passerait toute la suite au vert.

4. **`LABOR_RATE_NOT_FOUND` implémenté, jamais testé.** `quote.service.ts:80-85` et `catalog.repository.ts:113-131` : code d'erreur public sans couverture. Idem `CATALOG_INCONSISTENT` (`composition.service.ts:236-241`).

5. **Le verrou `ACCEPTED` est exprimé deux fois** : `CompositionRules.assertModifiable` (`composition.rules.ts:60-67`) et, en dur, `quote.service.ts:53-58`, avec un message différent. La règle est la même (règle métier 8) : elle devrait vivre dans la classe pure. C'est exactement le type de duplication qui a produit l'incohérence FR-110 corrigée par l'ADR 0022.

6. **La nouvelle écriture tenant-scoped du lot 2 échappe à la suite d'isolation.** `CompositionRepository.setStatus` (`composition.repository.ts:224-240`) filtre bien sur `tenantId`, mais `test/tenant-isolation.e2e-spec.ts` — créé précisément pour verrouiller ce point (ADR 0017) — ne l'a pas suivi. Couverture indirecte seulement. Les écritures de `quote.repository.ts` ne sont pas davantage couvertes à ce niveau.

### Remarques

7. **Inversion de dépendance catalogue → devis** : `src/catalog/catalog.repository.ts:3` importe `SurchargeRuleInput` depuis `../quote/pricing.rules`. Le module socle dépend du module aval.
8. **Les entrées du calcul sont lues hors transaction** (`quote.service.ts:64-95`, transaction ouverte en `:106`) : un changement de tarif concurrent produirait un devis figé sur un taux déjà remplacé. Sans conséquence en démonstration.
9. **`listForComposition` recompose toute la prestation** (`quote.service.ts:180`) pour un simple contrôle d'existence exigé par FR-211.
10. **Deux contrôleurs sur la base `compositions`**, dans deux modules. Les routes ne se recouvrent pas ; choix de frontière défendable.
11. **La validation d'identifiant est dans le service** (`quote.service.ts:257`), imposée par l'ADR 0021-4, mais s'écarte de « Contrôleur = validation DTO ».
12. **`OutboxWriter` accède à Prisma hors d'un `*.repository.ts`** — nom imposé par FR-206, accès confiné au module : esprit respecté, nommage non.
13. **`specs/lot-1-composition.md` modifié par le commit d'implémentation du lot 2** : mandaté par l'ADR 0022 et correctement référencé.
14. **`npm run lint` ne couvre toujours pas `scripts/`** (`package.json:16`). `scripts/consume.ts` échappe au lint. Déjà l'écart n° 12 de la revue du lot 1, non traité.
15. **`afterAll` ne nettoie pas le `quote_counter` du tenant du seed.** Sans effet : les assertions de numéro exact utilisent des tenants dédiés.
16. **Le verrou « produit » et « adresse » du modèle de domaine est vide de sens aujourd'hui** : aucun endpoint ne les modifie. À réactiver le jour où un `PATCH` d'adresse apparaîtra.

---

## Verdict

**Mergeable.**

Les onze exigences fonctionnelles sont implémentées et prouvées, les seize scénarios ont un test qui les vérifie vraiment, les tests d'acceptation n'ont pas été altérés depuis leur commit rouge, le schéma Prisma contractuel n'est pas touché, aucune dépendance n'est ajoutée, et lint, typage, unitaires (55/55) et e2e (47/47) sont verts. Les quatre couches sont respectées : contrôleurs muets, service applicatif, `PricingRules` réellement pure, accès Prisma confiné aux repositories, `tenantId` sur toutes les requêtes multi-tenant. La transactionnalité outbox est démontrée par un test unitaire à trois modes d'échec, pas seulement affirmée.

Les deux vérifications demandées sont négatives : **aucune régression du verrou** — la seule modification d'un test préexistant est celle qu'autorise l'ADR 0022, la couverture perdue est nulle, et l'isolation multi-tenant n'est pas concernée puisque le contrôle de tenant précède toujours le contrôle de statut ; **aucune fuite de l'agent-tests** — le seul import `src/` hors charte, dans `tenant-isolation.e2e-spec.ts`, est établi comme antérieur au lot 2 (`7730dd2`) et donc non imputable.

L'écart n° 1 est le seul qui touche une source de vérité (règle métier 6 du périmètre). Il est la conséquence non documentée d'une décision par ailleurs bien argumentée, il n'invalide aucun scénario testé, et il ne justifie pas de bloquer — mais il ouvre une fenêtre d'incohérence entre un devis `ISSUED` et sa prestation modifiée, et doit être tranché par un ADR avant le lot 3. Les écarts n° 3, 4 et 6 sont à combler dans la foulée.
