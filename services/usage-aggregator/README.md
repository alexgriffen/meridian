# usage-aggregator

Consumes raw usage events from `usage.events.v1` and maintains the
`daily_usage_rollups` table that billing-engine reads at invoicing time.

## Operating notes

- Consumer group: `usage-aggregator-v1`
- Commit policy: manual commit after each message — at-least-once semantics
- Upserts are idempotent at the (tenant_id, customer_id, metric, day) level
  via `ON CONFLICT … DO UPDATE`.

> ⚠️ At-least-once delivery means we will re-process events after a crash.
> The `ON CONFLICT DO UPDATE` re-adds quantity, which means duplicates inflate
> rollups. See `docs/runbooks/usage-aggregator.md` for the deduplication plan.

## Development

```bash
pip install -e ".[dev]"
pytest
python -m usage_aggregator
```
