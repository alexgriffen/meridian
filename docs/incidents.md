# Incident log

Post-incident reviews. Newest first.

---

## 2026-04-08 — Webhook duplicates for tenant `wave-comms`

**Severity:** S2
**Duration:** 4h
**Customer impact:** wave-comms processed ~3,400 duplicate `invoice.paid` events,
causing duplicate fulfillment in their downstream system. Refunds issued from
their side; no money lost on the Meridian side.

**Root cause:** Inconclusive. wave-comms uses two webhook-dispatcher pods due
to traffic. Both pods appear to have claimed the same delivery rows from the
queue and POSTed independently. Theory is that the `claimBatch` query does not
take a row lock, so concurrent SELECTs over the same `next_retry_at` window
return overlapping rows.

**Action items:**
- [ ] Add `FOR UPDATE SKIP LOCKED` to the claim query, or move to a real queue.
- [ ] Add duplicate-delivery detection in monitoring (dispatch counter vs HTTP
      attempt counter).
- [ ] Ask wave-comms to add idempotency keys to their handler.

> Status: open. Ticket [PLAT-1102](https://internal/jira/PLAT-1102).
> Owner: @ksong (webhook-dispatcher CODEOWNER).

---

## 2026-02-22 — Cross-tenant invoice visible in dashboard

**Severity:** S1
**Duration:** 11 minutes (detection to mitigation)
**Customer impact:** Tenant A's CSM saw invoice IDs belonging to Tenant B in
the lookup-by-ID view of their dashboard. No financial data was rendered in
the UI, but invoice IDs themselves are arguably PII for B.

**Root cause:** The new `/v1/invoices/:id` route in api-gateway was added
without a `tenant_id` filter. It returns the row for any caller authenticated
to *any* tenant who guesses an invoice UUID.

**Mitigation:** Hotfix added `WHERE tenant_id = $2` to the query and redeployed
in 11m. No leak occurred via the API itself because Tenant A's dashboard does
not enumerate other tenants' UUIDs — the leak path was a single CSM in our own
support tool who was investigating two tenants in parallel.

**Action items:**
- [x] Hotfix landed (commit `f4a2c1e`).
- [ ] Add a lint rule that flags raw SQL containing `WHERE id = ` without
      a sibling `tenant_id` predicate.
- [ ] Audit all other routes for the same pattern. Audit was started but not
      completed. **The audit is unfinished.**

> Status: action items partially open.
> Owner: @platform-api.

---

## 2025-11-14 — Plan downgrade prorated to wrong amount

**Severity:** S2 (financial)
**Duration:** 9 days (latent — discovered via customer support escalation)
**Customer impact:** ~140 customers across 6 tenants were credited the wrong
amount on plan downgrades over a 9-day window. Maximum overcredit per customer
was $0.47; aggregate $34.12 in incorrect credits.

**Root cause:** `prorate()` in `@meridian/billing-core` rounds `unusedOldCredit`
and `newPlanCharge` independently using `Math.round`, then subtracts. The
half-up rounding bias compounds — there's an off-by-one cent in some inputs
because the rounding error of each side is biased in the same direction
roughly half the time.

**Action items:**
- [ ] Refactor `prorate()` to subtract the raw values and round once.
- [ ] Add property-based tests using fast-check covering full proration space.

> Status: open. Low priority because impact per customer is small.
> Owner: @billing-core.

---

## 2024-11-04 — Considered Postgres RLS, decided against

Not an incident — context for current architecture. We evaluated turning on
Postgres row-level security to enforce tenant isolation at the DB layer
instead of relying on every query to include `tenant_id`. We chose not to
because:

1. The billing-engine cycle job needs cross-tenant reads at the application
   layer (the cron loop is global, not per-tenant).
2. RLS policy bypasses are easy to introduce by accident (any role with
   `BYPASSRLS` defeats it; pgbouncer transaction-pooling complicates the
   per-session `SET LOCAL meridian.tenant_id` model).
3. Migration would have required rewriting our cron jobs.

The architectural decision is **application-enforced tenant isolation**.
This means we MUST treat every new query as a tenant-isolation review.
