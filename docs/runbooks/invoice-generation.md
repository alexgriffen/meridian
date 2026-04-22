# Runbook: Invoice generation

## How it works

`billing-engine` runs a loop every `CYCLE_INTERVAL_MS` (default 60s). Each
cycle, it:

1. SELECTs up to 500 subscriptions where `current_period_end <= NOW()` and
   `status = 'active'`, joined to `customers` for `tax_region`.
2. For each: in a transaction, inserts an `invoices` row and advances
   `current_period_start`/`current_period_end` by the plan's `interval_days`.

## Common alerts

### Alert: `billing_cycle_errors > 0`

Per-subscription failures are counted but **not individually logged** — see
PLAT-1156. To find which subscriptions are failing, attach a debugger to a
billing-engine pod or temporarily change the catch block to log.

### Alert: `billing_cycle_duration_p95 > 30s`

Means the SELECT-due-subscriptions query is slow. Check that the
`subs_due_idx` partial index is being used:

```sql
EXPLAIN SELECT ... FROM subscriptions s
JOIN customers c ON c.id = s.customer_id
WHERE s.status = 'active' AND s.current_period_end <= NOW() LIMIT 500;
```

### Alert: customer reports they were charged the wrong amount

Common causes, in order of frequency:

1. **Tax region misconfigured** on the customer record. Check `tax_region`.
2. **Plan price changed** between when the customer signed up and now. Plan
   price is read at invoice time, not at subscription creation. This is a
   deliberate choice and is in our ToS, but customers don't expect it.
3. **Discount not applied**. As of the 2026-02 Enterprise SKU rollout
   (migration `0004`), subscriptions can have a `discount_pct`. **Verify the
   invoice math accounts for it.** Multiple support tickets have flagged this.
4. **Proration off-by-one cent** on plan changes. See incidents.md 2025-11.
