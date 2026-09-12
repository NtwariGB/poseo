#!/usr/bin/env bash
set -e

docker compose up -d

echo "waiting for kafka connect..."
until curl -sf localhost:8083/connectors >/dev/null; do
  sleep 2
done

if curl -sf localhost:8083/connectors/poseo-outbox >/dev/null; then
  echo "connector already registered"
else
  curl -sf -X POST -H "Content-Type: application/json" \
    --data @debezium/outbox-connector.json localhost:8083/connectors >/dev/null
  echo "connector registered"
fi

echo "infra ready"