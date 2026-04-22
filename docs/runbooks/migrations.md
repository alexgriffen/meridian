# Runbook: Migrations

## Hard rules

1. Migrations are **append-only**. Once on `main`, the file is immutable.
2. Migrations must be deployable **without** a coordinated code release.
3. New columns are either nullable or have a server-side default.
4. Drops happen in two releases: stop writing in release N, drop in N+1.
5. Renames are forbidden — add a new column, dual-write, then deprecate.

## Schema-drift risks

Several services hand-maintain types that mirror the schema:

- `packages/shared-types` — TypeScript Zod schemas
- `services/usage-aggregator/src/usage_aggregator/aggregator.py` — Pydantic

When you change the schema, you MUST update the types. There is no codegen.

## Backfill

For non-trivial backfills, write a separate idempotent script in
`ops/scripts/backfills/`. Do not put long-running data movement in migrations.
