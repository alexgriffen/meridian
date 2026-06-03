-- 0005_usage_events_outbox.sql
-- Alpha: postgres outbox in place of Kafka for usage events.
-- In production this table doesn't exist — usage events go straight to
-- usage.events.v1 in Kafka. usage-aggregator's worker mode is selected by the
-- USAGE_INGEST env var (`kafka` vs `outbox`).
--
-- Migrated 2026-05-12 by @amorales (PR #1923) for the alpha environment.

CREATE TABLE usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    metric TEXT NOT NULL,
    quantity DOUBLE PRECISION NOT NULL CHECK (quantity >= 0),
    occurred_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'claimed', 'processed', 'failed')),
    claimed_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX usage_events_pending_idx
    ON usage_events (created_at)
    WHERE status = 'pending';

CREATE INDEX usage_events_tenant_customer_idx
    ON usage_events (tenant_id, customer_id, occurred_at);
