# Meridian

Meridian is the billing and revenue platform powering subscription, usage-based, and hybrid pricing across our customers.

Meridian is a **polyrepo**: each service and shared package lives in its own repository, and this `meridian` repo is the **umbrella** that composes them as git submodules and provides the shared infrastructure (Postgres, migrations, seed data, docker-compose, deploy config) needed to run the whole platform end to end.

> Production: `meridian-prod` (us-east-1, us-west-2, eu-central-1)
> Staging: `meridian-stage` (us-east-1)

## Repositories

| Repo | Path | Description | Owner |
|---|---|---|---|
| [`meridian`](https://github.com/alexgriffen/meridian) | _(this repo)_ | Umbrella: submodules, infra, migrations, deploy. | `@platform-api` |
| [`meridian-web`](https://github.com/alexgriffen/meridian-web) | `services/web` | Billing console (Vite + React) — browse/manage billing, post usage. | `@platform-api` |
| [`meridian-api-gateway`](https://github.com/alexgriffen/meridian-api-gateway) | `services/api-gateway` | Public REST API. Auth, tenant resolution, request fanout. | `@platform-api` |
| [`meridian-billing-engine`](https://github.com/alexgriffen/meridian-billing-engine) | `services/billing-engine` | Invoice generation, proration, plan changes. | `@billing-core` `@platform-api` |
| [`meridian-webhook-dispatcher`](https://github.com/alexgriffen/meridian-webhook-dispatcher) | `services/webhook-dispatcher` | Async webhook delivery with retries + DLQ. | `@platform-api` |
| [`meridian-usage-aggregator`](https://github.com/alexgriffen/meridian-usage-aggregator) | `services/usage-aggregator` | Python service: raw usage → daily aggregates. | `@data-platform` |
| [`meridian-canary`](https://github.com/alexgriffen/meridian-canary) | `services/canary` | End-to-end canary for SLO/observability baseline. | `@platform-api` |
| [`meridian-shared-types`](https://github.com/alexgriffen/meridian-shared-types) | `packages/shared-types` | Cross-service TypeScript types and Zod schemas. | `@platform-api` |
| [`meridian-db`](https://github.com/alexgriffen/meridian-db) | `packages/db` | Postgres client, query builders, migration runner. | `@platform-api` |
| [`meridian-otel`](https://github.com/alexgriffen/meridian-otel) | `packages/otel` | OpenTelemetry tracer + metric setup. | `@observability` |
| [`meridian-billing-core`](https://github.com/alexgriffen/meridian-billing-core) | `packages/billing-core` | Pure proration/tax/rounding logic. No I/O. | `@billing-core` |

## Cross-repo dependency graph

Every `@meridian/*` import is an edge spanning two repositories:

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

shared packages (consumed across the service repos above):
  shared-types ← billing-core, db, billing-engine, webhook-dispatcher, api-gateway
  otel         ← api-gateway, billing-engine, webhook-dispatcher, canary
  db           ← api-gateway, billing-engine, webhook-dispatcher
  billing-core ← billing-engine
```

## Quickstart (alpha)

Clone **with submodules** so all service/package repos are checked out:

```bash
git clone --recurse-submodules https://github.com/alexgriffen/meridian
cd meridian

cp .env.example .env
# Grab a webhook destination URL from https://webhook.site and paste it
# into .env as WEBHOOK_URL — you'll watch invoice events arrive there.

docker compose up --build
```

Already cloned without `--recurse-submodules`? Run:

```bash
git submodule update --init --recursive
```

That brings up postgres, runs migrations, seeds a tenant, and starts every
service. The **billing console** is at `http://localhost:5173` and the
api-gateway REST API at `http://localhost:4000`.

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

# 4) Watch usage rollups (via the API, or psql)
curl http://localhost:4000/v1/usage/rollups -H "X-Tenant-Id: $TENANT"
docker compose exec postgres psql -U meridian -c \
  "SELECT * FROM daily_usage_rollups;"
```

Or just open the **billing console** at `http://localhost:5173` and drive the
same loop from the UI (Usage → Invoices → Rollups).

## Development without docker

The umbrella provides the pnpm workspace that links every submodule together:

```bash
git submodule update --init --recursive
pnpm install
pnpm -r typecheck
pnpm -r test
```

Working on a single service? Commit inside its submodule (it's a standalone
repo with its own history and remote), then bump the pointer here:

```bash
cd services/billing-engine
git checkout -b my-change && git commit -am "…" && git push
cd ../.. && git add services/billing-engine && git commit -m "bump billing-engine"
```

Individual services (requires a running postgres and `DATABASE_URL` exported):

```bash
pnpm --filter @meridian/scripts migrate
pnpm --filter @meridian/scripts seed
pnpm --filter @meridian/api-gateway dev
pnpm --filter @meridian/billing-engine dev
pnpm --filter @meridian/webhook-dispatcher dev
pnpm --filter @meridian/canary dev
cd services/usage-aggregator && python -m usage_aggregator
```

## Onboarding

New engineers should start with `docs/architecture.md` and then read at least one runbook before going oncall. Pair with a current oncall for at least one shift.

## Security / Compliance

- SOC 2 Type II (2024 attestation in Vanta)
- PCI DSS scope is limited to the `payments-vault` repo (separate)
- All tenant data must be filtered by `tenant_id` at the query layer — see `docs/runbooks/tenant-isolation.md`
