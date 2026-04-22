# Meridian — Architecture

## What it does

Meridian is a multi-tenant billing platform. Each tenant (our customer) uses
us to bill their own customers. We support recurring subscriptions, usage-based
metering, hybrid plans, and a webhook-based event stream for tenants to react
to billing events in their own systems.

## Service map

```
                  client requests
                        │
                        ▼
              ┌─────────────────────┐
              │     api-gateway     │  Public REST, auth, tenant resolution
              └──────────┬──────────┘
                         │
        ┌────────────────┼───────────────────────┐
        ▼                ▼                       ▼
 ┌───────────────┐  ┌───────────────┐    ┌────────────────────┐
 │ billing-engine│  │  Postgres     │    │ webhook-dispatcher │
 │ (cron loop)   │  │  (multi-      │    │ (poll queue, fan   │
 │               │  │   tenant)     │    │  out HTTP retries) │
 └───────┬───────┘  └───────▲───────┘    └─────────▲──────────┘
         │                  │                       │
         └──────────────────┘                       │
                            │                       │
                            │              ┌────────┴────────┐
                            │              │  Kafka          │
                            │              │  (usage events) │
                            │              └────────▲────────┘
                            │                       │
                            │              ┌────────┴───────────┐
                            └──────────────│ usage-aggregator    │
                                           │ (Python consumer)   │
                                           └─────────────────────┘
```

## Multi-tenancy

We use **shared schema, row-level isolation**. Every row has a `tenant_id`
column; every query must filter by it. The `@meridian/db` package exposes
`currentTenant()` via AsyncLocalStorage so services can pull the active tenant
without threading it through every function — but the actual SQL still has to
include the filter. There's no DB-side enforcement (we considered Postgres RLS
in 2024 — see `docs/incidents.md` 2024-11 incident).

This is the single most common source of bugs in the codebase.
Code review for *any* new query MUST verify the `tenant_id` filter.

## Data ownership

| Table | Written by | Read by |
|---|---|---|
| `tenants` | provisioning (out of scope of this repo) | all services |
| `customers` | api-gateway | api-gateway, billing-engine, usage-aggregator |
| `plans` | admin UI (out of scope) | api-gateway, billing-engine |
| `subscriptions` | api-gateway, billing-engine | api-gateway, billing-engine |
| `invoices` | billing-engine | api-gateway |
| `webhook_endpoints` | api-gateway | webhook-dispatcher |
| `webhook_deliveries` | api-gateway, billing-engine, usage-aggregator | webhook-dispatcher |
| `daily_usage_rollups` | usage-aggregator | billing-engine |

## Webhook delivery semantics

- **At-least-once**: we will retry until success or `MAX_ATTEMPTS` (default 8).
- **Ordered per-endpoint? No.** Customers should idempotently handle duplicates.
- Signed with `X-Meridian-Signature: t=<unix>,v1=<hmac-sha256>` per Stripe convention.

## Usage event flow

1. Tenant POSTs `/v1/usage` → api-gateway publishes to Kafka topic `usage.events.v1`.
2. usage-aggregator consumes, upserts `daily_usage_rollups` with `ON CONFLICT DO UPDATE`.
3. billing-engine reads rollups at invoice generation time.

## Why these choices

- **Postgres only, no separate OLAP store.** Reporting needs are modest;
  invoicing reads are small joins. We pay a complexity tax to avoid a Snowflake
  bill we don't yet need.
- **Kafka for usage, polling for webhooks.** Usage volume is 1–2 OOM higher
  than webhooks; Kafka backpressure matters there. Webhooks are at most ~10/s.
- **Python for usage-aggregator only.** Data team owns this service and they
  prefer Python. Everything else is TypeScript.
