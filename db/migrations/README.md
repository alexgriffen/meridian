# Migrations

Migrations are applied in lexical order by `scripts/migrate.ts` against
`$DATABASE_URL`. They are **append-only** — once merged to `main`, a migration
file is immutable.

## Conventions

- Use `IF NOT EXISTS` for indexes and tables to make migrations re-runnable in
  dev. Production runs once per file via the migrations ledger.
- All new tables MUST have `tenant_id UUID NOT NULL` as the first column after
  `id`, and an index on `tenant_id`. See `docs/runbooks/tenant-isolation.md`.
- Backward compatibility: a migration must be deployable WITHOUT a coordinated
  code deploy. Add columns nullable or with defaults; never drop a column in
  the same release that stops writing to it.

## Numbering

`NNNN_short_description.sql`, zero-padded to 4 digits.
