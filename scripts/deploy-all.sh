#!/usr/bin/env bash
# Deploy every Fly app from the repo root. Assumes:
#   - flyctl auth done (`flyctl auth login`)
#   - apps already exist (`flyctl apps create meridian-api` etc.)
#   - secrets already set (DATABASE_URL on every app)
set -euo pipefail

cd "$(dirname "$0")/.."

declare -a TOMLS=(
  "fly.api-gateway.toml"
  "fly.billing-engine.toml"
  "fly.webhook-dispatcher.toml"
  "fly.usage-aggregator.toml"
)

for toml in "${TOMLS[@]}"; do
  echo ""
  echo "============================================"
  echo " deploying $toml"
  echo "============================================"
  flyctl deploy -c "$toml" --remote-only
done
