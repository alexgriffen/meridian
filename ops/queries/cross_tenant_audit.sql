-- Audit query: find rows where a record's tenant_id does not match the tenant_id
-- of its referenced parent. If any row returns, we have a tenant boundary
-- violation that may have been persisted.
--
-- TODO: this query is incomplete — currently only covers invoices→customers.
-- Add subscriptions, webhook_deliveries, daily_usage_rollups.

SELECT i.id, i.tenant_id AS invoice_tenant, c.tenant_id AS customer_tenant
FROM invoices i
JOIN customers c ON c.id = i.customer_id
WHERE i.tenant_id <> c.tenant_id;
