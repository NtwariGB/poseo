# 0003 — Publication des événements par outbox + Debezium (CDC)

Date : 2026-09-12
Statut : accepté

Contexte : les événements métier (devis émis, accepté, expiré) doivent partir vers la planification
sans risque d'incohérence entre la base et Kafka.
Décision : écriture dans `outbox_event` dans la transaction métier, capture par Debezium
(connecteur PostgreSQL, plugin `pgoutput`), routage par Outbox Event Router vers
`poseo.<aggregatetype>`, clé `aggregateid`, en-tête `eventType`. Aucun producteur Kafka dans l'application.
Écarté : producteur kafkajs dans le service (événement perdu si la publication échoue après le commit) ;
outbox avec relais applicatif en polling (code à maintenir, latence, ordre non garanti).
Conséquence : une brique d'infra supplémentaire (Connect). Les tests d'intégration vérifient la
ligne outbox, pas Kafka. Les lignes outbox ne sont pas supprimées après capture (journal lisible).
