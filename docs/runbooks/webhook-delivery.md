# Runbook: Webhook delivery

## How it works

`webhook-dispatcher` polls `webhook_deliveries` for rows where
`status = 'pending'` and `next_retry_at <= NOW()`, POSTs to the tenant's
endpoint, and updates the row with the outcome.

Backoff: exponential with 25% jitter, capped at 6h. Max 8 attempts before
the row is marked `dead`.

## Common alerts

### Alert: `webhook_delivery_failure_rate > 5%`

1. Check the OTel span for `webhook.deliver` and group by `tenant_id`.
2. If concentrated on one tenant → that tenant's endpoint is probably down.
   Contact via the support channel. No action on our side.
3. If spread across tenants → check `last_status_code` in
   `webhook_deliveries`. 5xx clustered on one region = our outbound network.

### Alert: `webhook_dead_letter_count` rising

These are deliveries that exhausted retries. Run:

```sql
SELECT tenant_id, event_type, COUNT(*)
FROM webhook_deliveries
WHERE status = 'dead' AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY 1, 2 ORDER BY 3 DESC;
```

### Alert: customer reports duplicate webhooks

See [incidents.md](../incidents.md) 2026-04 entry. The current code does not
take a row lock when claiming deliveries — concurrent dispatcher pods can
double-deliver. Until that's fixed, the recommended customer-side mitigation
is idempotent handling keyed on `x-meridian-delivery-id`.

## Replaying a delivery

```sql
UPDATE webhook_deliveries
SET status = 'pending', next_retry_at = NOW(), attempt_count = 0
WHERE id = $1;
```

Only do this for one delivery at a time. Replaying in bulk has caused thundering
herd issues — see PLAT-1010.
