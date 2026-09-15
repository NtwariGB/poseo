#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

npm run infra:up                      # postgres, kafka, connect + connecteur Debezium
npx prisma migrate deploy
npm run seed                          # idempotent

trap 'kill 0' EXIT                    # Ctrl+C arrête tout
npm run start:dev &
npm --prefix web run dev &
npm run consume &
wait