# Meridian

Meridian is the billing and revenue platform powering subscription, usage-based, and hybrid pricing across our customers. This repository contains the core services, shared libraries, and database schema.

> Production: `meridian-prod` (us-east-1, us-west-2, eu-central-1)
> Staging: `meridian-stage` (us-east-1)

## Architecture

```
                          ┌─────────────────┐
                          │   api-gateway   │  Public REST + tenant auth
                          └────────┬────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            ▼                      ▼                      ▼
   ┌────────────────┐    ┌──────────────────┐   ┌──────────────────┐
   │ billing-engine │    │ webhook-dispatch │   │ usage-aggregator │
   │  (invoices,    │    │  (async fanout   │   │  (Python, daily  │
   │   proration)   │    │   w/ retries)    │   │   usage rollups) │
   └───────┬────────┘    └────────┬─────────┘   └─────────┬────────┘
           │                      │                       │
           └──────────────────────┼───────────────────────┘
                                  ▼
                        ┌──────────────────┐
                        │ Postgres (RDS)   │   Multi-tenant, row-level
                        └──────────────────┘
```

## Repository layout

| Path | Description | Owner |
|---|---|---|
| `services/api-gateway` | Public-facing REST API. Handles auth, tenant resolution, request fanout. | `@platform-api` |
| `services/billing-engine` | Invoice generation, proration, plan changes. Source of truth for amounts owed. | `@billing-core` |
| `services/webhook-dispatcher` | Async delivery of customer-facing webhooks with retries and DLQ. | `@platform-api` |
| `services/usage-aggregator` | Python service that consumes raw usage events and produces daily aggregates. | `@data-platform` |
| `packages/shared-types` | Cross-service TypeScript types and Zod schemas. | `@platform-api` |
| `packages/db` | Postgres client, query builders, migration runner. | `@platform-api` |
| `packages/otel` | OpenTelemetry tracer + metric setup. | `@observability` |
| `packages/billing-core` | Pure proration/tax/rounding logic. No I/O. | `@billing-core` |
| `db/migrations` | SQL migrations, applied in order. | `@platform-api` |
| `docs/runbooks` | Oncall runbooks for common failure modes. | `@oncall` |
| `docs/incidents.md` | Post-incident review log. | `@oncall` |
| `ops/tickets.json` | Open customer-reported issues, code-area annotated. | `@support-eng` |

## Quickstart (alpha)

```bash
cp .env.example .env
# Grab a webhook destination URL from https://webhook.site and paste it
# into .env as WEBHOOK_URL — you'll watch invoice events arrive there.

docker compose up --build
```

That brings up postgres, runs migrations, seeds a tenant, and starts all four
services. The api-gateway is exposed on `http://localhost:4000`.

### Demo loop

```bash
TENANT=00000000-0000-4000-8000-000000000001
CUSTOMER=00000000-0000-4000-8000-000000000010

# 1) Post a usage event (lands in usage_events outbox)
curl -X POST http://localhost:4000/v1/usage \
  -H "X-Tenant-Id: $TENANT" -H "content-type: application/json" \
  -d "{\"customer_id\":\"$CUSTOMER\",\"metric\":\"api_calls\",\"quantity\":42}"

# 2) The seeded subscription's period ends ~1 minute after seed runs.
#    billing-engine generates an invoice, enqueues a webhook delivery,
#    and webhook-dispatcher POSTs it to your WEBHOOK_URL.

# 3) Watch invoices appear
curl http://localhost:4000/v1/invoices -H "X-Tenant-Id: $TENANT"

# 4) Watch usage rollups
docker compose exec postgres psql -U meridian -c \
  "SELECT * FROM daily_usage_rollups;"
```

## Development without docker

```bash
pnpm install
pnpm -r typecheck
pnpm -r test
```

Individual services (requires a running postgres and `DATABASE_URL` exported):

```bash
pnpm --filter @meridian/scripts migrate
pnpm --filter @meridian/scripts seed
pnpm --filter @meridian/api-gateway dev
pnpm --filter @meridian/billing-engine dev
pnpm --filter @meridian/webhook-dispatcher dev
cd services/usage-aggregator && python -m usage_aggregator
```

## Onboarding

New engineers should start with `docs/architecture.md` and then read at least one runbook before going oncall. Pair with a current oncall for at least one shift.

## Security / Compliance

- SOC 2 Type II (2024 attestation in Vanta)
- PCI DSS scope is limited to the `payments-vault` repo (separate)
- All tenant data must be filtered by `tenant_id` at the query layer — see `docs/runbooks/tenant-isolation.md`
