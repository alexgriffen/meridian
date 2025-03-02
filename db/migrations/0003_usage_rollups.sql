-- 0003_usage_rollups.sql
-- Daily usage aggregates produced by the usage-aggregator service.

CREATE TABLE daily_usage_rollups (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    metric TEXT NOT NULL,
    day DATE NOT NULL,
    total_quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, customer_id, metric, day)
);
