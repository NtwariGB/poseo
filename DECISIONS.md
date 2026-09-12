# Journal de décisions

Format : date, contexte, décision, alternatives écartées, conséquence.
Toute question remontée par l'agent et tranchée par le développeur est consignée ici.

## 2026-09-12 — Prisma épinglé en version 7

Contexte : Prisma 8 vient de sortir avec une CLI unifiée et un découpage de paquets refondus
(`prisma orm init`, `@prisma/orm-postgres`, notion de contrat).
Décision : rester sur Prisma 7 (générateur `prisma-client`, adaptateur `@prisma/adapter-pg`).
Écarté : Prisma 8, documentation encore mince et courbe d'apprentissage non budgétée sur deux jours.
Conséquence : montée de version à planifier plus tard, isolée dans le module `prisma`.

## 2026-09-12 — CommonJS plutôt qu'ES Modules

Contexte : le Nest CLI propose ESM + vitest ou CJS + Jest à la création.
Décision : CommonJS + Jest, `moduleFormat = "cjs"` côté Prisma.
Écarté : ESM, plus moderne mais source de frictions avec les décorateurs et certains paquets.
Conséquence : outillage de test standard NestJS, pas de configuration ESM à maintenir.

## 2026-09-12 — Publication des événements par outbox + Debezium (CDC)

Contexte : les événements métier (devis émis, accepté, expiré) doivent partir vers la planification
sans risque d'incohérence entre la base et Kafka.
Décision : écriture dans `outbox_event` dans la transaction métier, capture par Debezium
(connecteur PostgreSQL, plugin `pgoutput`), routage par Outbox Event Router vers
`poseo.<aggregatetype>`, clé `aggregateid`, en-tête `eventType`. Aucun producteur Kafka dans l'application.
Écarté : producteur kafkajs dans le service (événement perdu si la publication échoue après le commit) ;
outbox avec relais applicatif en polling (code à maintenir, latence, ordre non garanti).
Conséquence : une brique d'infra supplémentaire (Connect). Les tests d'intégration vérifient la
ligne outbox, pas Kafka. Les lignes outbox ne sont pas supprimées après capture (journal lisible).

## 2026-09-12 — Kafka officiel en KRaft plutôt que Redpanda

Contexte : besoin d'un broker local léger.
Décision : image `apache/kafka:3.9.0` en mode KRaft, un seul nœud, facteur de réplication 1.
Écarté : Redpanda (compatible et plus léger, mais le projet et l'entretien parlent de Kafka).
Conséquence : contournement du bug KAFKA-18281 (listener contrôleur sur `kafka:9093`, pas `0.0.0.0`).

## 2026-09-12 — Tenant par en-tête, pas d'authentification

Contexte : multi-tenant requis, deux jours de développement.
Décision : `X-Tenant-Id` obligatoire sur chaque requête, filtrage systématique en base.
Écarté : JWT avec tenant dans les claims (hors sujet pour la démonstration).
Conséquence : à remplacer par une vraie authentification avant tout usage réel.

## 2026-09-12 — Identifiants UUID v7, montants en centimes, durées en minutes

Décision : `@default(uuid(7)) @db.Uuid` partout ; entiers pour l'argent et le temps.
Écarté : UUID v4 (non ordonné, index moins efficaces) ; décimaux JS pour les montants (arrondis).
Conséquence : tri chronologique possible par id ; conversion en euros uniquement à l'affichage.

## 2026-09-12 — Numérotation des devis par table compteur

Contexte : numéro unique par tenant au format `Q-<année>-<séquence>`.
Décision : table `QuoteCounter (tenantId, year, lastValue)` incrémentée dans la transaction
d'émission avec verrou de ligne (`SELECT ... FOR UPDATE`).
Écarté : séquence PostgreSQL par tenant (DDL dynamique à chaque nouveau tenant, invisible dans Prisma).
Conséquence : une écriture de plus par émission, ordre garanti, trous impossibles sauf rollback.

## 2026-09-12 — Invariant « un seul devis ISSUED / ACCEPTED par prestation »

Décision : les deux, en couches. Index uniques partiels en SQL brut ajoutés à la main dans la
migration (Prisma ne les exprime pas dans le schéma), plus contrôle applicatif dans la transaction
pour renvoyer une erreur métier lisible avant que la base ne refuse.
Écarté : contrôle applicatif seul (course possible entre deux émissions concurrentes).
Conséquence : la migration contient un bloc SQL manuel, documenté en commentaire.

## 2026-09-12 — Arbitrages du schéma Prisma

Contexte : points laissés ouverts par `specs/01-modele-domaine.md` au moment d'écrire
`prisma/schema.prisma`. Tranchés par le développeur avant écriture.

- A2 — `createdAt` sur toutes les tables, `updatedAt` uniquement sur `ServiceComposition` : seule
  la prestation est mutable, tout le reste est du référentiel ou de l'immuable ; un `updatedAt`
  ailleurs serait un mensonge.
- B1 — `tenantId` sur les entités racines seulement ; `ServiceConstraint`, `ServiceOperation` et
  `QuoteLine` sont isolées par leur parent : pas de dénormalisation sans besoin de requête directe.
  Exception `ZonePostalCode`, dont l'unicité est définie au niveau du tenant.
- C2 — aucune contrainte d'unicité sur `CompositionRule` : ses colonnes discriminantes
  (`constraintTypeId`, `operationId`) sont nullables et Postgres considère les NULL comme distincts,
  donc un index unique ne protégerait rien ; la cohérence relève de la règle applicative.
- C3 — « exactement un de `surchargePercentBp` / `surchargeCents` » et « `operationId` obligatoire
  sauf pour SURCHARGE » posés en CHECK SQL brut dans la migration : Prisma ne les exprime pas, et un
  contrôle purement applicatif laisserait passer les écritures manuelles de catalogue.
- D1 — `productRef` obligatoire sur `ServiceComposition` : le périmètre référence le produit acheté
  par identifiant, il manquait au modèle de domaine, qui a été mis à jour.
- E4 — `Quote.issuedAt` sans `@default(now())`, fourni par l'application : `validUntil` en dérive,
  les deux doivent venir du même instant calculé, pas de l'horloge du serveur de base.
- F2 — `aggregatetype` et `type` de l'outbox en `String` et non en enum : le routeur Debezium lit du
  texte, et un enum Postgres figerait la liste des types d'événements derrière une migration.
