# Runbook: usage-aggregator

## How it works

Python worker. Two ingest modes, switched by `USAGE_INGEST`:

- `outbox` (alpha): polls the `usage_events` postgres table, claims batches
  via `UPDATE ... SET status = 'claimed' RETURNING`, processes each, marks
  `processed`.
- `kafka` (production): consumes `usage.events.v1`, manual offset commits,
  at-least-once.

Both modes upsert `daily_usage_rollups` with
`ON CONFLICT DO UPDATE SET total_quantity = existing + new`.

## Known issues

### Inflated rollups after consumer restart

When the consumer crashes between processing a message and committing the
offset, the next replay processes the same event again. Because the upsert
**adds** the quantity, the rollup gets incremented twice.

Believed-true scale: a few cents per tenant per month, dwarfed by other
billing variance. The fix requires deduplication by `event.id`, which means
either a per-event seen-set (Redis) or moving deduplication into the rollup
upsert itself (treat `total_quantity` as the max over inserts, requiring
the producer to send absolute-per-day quantities, not deltas). Both are open
in PLAT-989.

### Silent failures

Errors in `Aggregator.handle()` and `drain_outbox()` are caught and logged at
DEBUG level. In production our log level is INFO, so failures vanish. Worse,
the outbox path marks the row `processed` even on error — so a failed rollup
looks like a delivered one. If a customer reports missing usage, suspect this
first. **There's no metric or alert for this today.**

### Schema mismatch with shared-types

The Python `UsageEvent` model is hand-maintained in `aggregator.py`. The
TypeScript counterpart is in `@meridian/shared-types`. If you change the
event schema, change both — there's no codegen.

## Replaying a window

Kafka consumer offset can be reset to a past timestamp:

```bash
kafka-consumer-groups --bootstrap-server $KAFKA \
  --group usage-aggregator-v1 --topic usage.events.v1 \
  --reset-offsets --to-datetime 2026-04-01T00:00:00.000 --execute
```

**Caution:** because the upsert adds, replaying will inflate. Truncate the
affected window in `daily_usage_rollups` first, or use the offline replay
script (`ops/scripts/replay-usage.py`).
