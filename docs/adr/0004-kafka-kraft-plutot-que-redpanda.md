# 0004 — Kafka officiel en KRaft plutôt que Redpanda

Date : 2026-09-12
Statut : accepté

Contexte : besoin d'un broker local léger.
Décision : image `apache/kafka:3.9.0` en mode KRaft, un seul nœud, facteur de réplication 1.
Écarté : Redpanda (compatible et plus léger, mais le projet et l'entretien parlent de Kafka).
Conséquence : contournement du bug KAFKA-18281 (listener contrôleur sur `kafka:9093`, pas `0.0.0.0`).
