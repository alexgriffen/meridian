-- 0004_subscription_discounts.sql
-- Add per-subscription discount percentage (0-100). Applied at invoice time.
-- Migrated 2026-02-14 by @vmehta (PR #1842) for the Enterprise SKU rollout.

ALTER TABLE subscriptions
    ADD COLUMN discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (discount_pct >= 0 AND discount_pct <= 100);

-- Backfill: nothing to do, default is 0.
