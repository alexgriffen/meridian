# Runbook: Tenant isolation

## Rule

**Every SQL query that touches a tenant-scoped table MUST include a
`tenant_id = $N` predicate.** No exceptions in service code. The only allowed
exception is the billing-engine cron loop, which legitimately scans across
tenants for due subscriptions, and the usage-aggregator consumer (which
trusts the tenant_id from the event payload).

## Tenant-scoped tables

- `customers`
- `subscriptions`
- `invoices`
- `webhook_endpoints`
- `webhook_deliveries`
- `daily_usage_rollups`

## Why this matters

We do not enforce isolation at the DB layer. See `docs/incidents.md`
2024-11 entry. Every query is the trust boundary.

## How to verify in code review

1. Search the diff for new `pool.query(` or `client.query(` calls.
2. For each, confirm the WHERE clause includes `tenant_id`.
3. If the query joins multiple tables, every tenant-scoped table in the join
   must have its own tenant_id predicate (don't trust transitivity).
4. If the query uses `currentTenant()`, make sure the tenant id is actually
   passed as a parameter to the SQL — not just looked up but unused.

## How to verify at runtime

Logs from `api-gateway` include `tenant_id` and `request_id` on every query
through `pino`'s context binding. Look for queries where `tenant_id` is null
or empty:

```
fly logs -a meridian-api-prod | jq 'select(.tenant_id == null)'
```

## If a leak is suspected

1. Page `@platform-api` immediately. S1 by default.
2. Run the audit query in `ops/queries/cross_tenant_audit.sql` (TODO: this
   query doesn't exist yet — write it).
3. Add a `tenant_id` filter and deploy a hotfix.
4. File post-incident review even if no customer was impacted.
