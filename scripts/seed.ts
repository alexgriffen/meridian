#!/usr/bin/env tsx
/**
 * Seed the alpha database with one tenant, two plans, one customer, one
 * active subscription on the Enterprise plan with 15% discount, and one
 * webhook endpoint pointing at WEBHOOK_URL (webhook.site by default).
 *
 * Idempotent — uses fixed UUIDs and ON CONFLICT DO NOTHING / DO UPDATE.
 *
 *   DATABASE_URL=postgres://... WEBHOOK_URL=https://webhook.site/<uuid> \
 *     tsx scripts/seed.ts
 */
import { Client } from "pg";
import { randomBytes } from "node:crypto";

const FIXTURES = {
  tenant_id: "00000000-0000-4000-8000-000000000001",
  starter_plan_id: "plan_starter",
  enterprise_plan_id: "plan_enterprise",
  customer_id: "00000000-0000-4000-8000-000000000010",
  subscription_id: "00000000-0000-4000-8000-000000000020",
  webhook_endpoint_id: "00000000-0000-4000-8000-000000000030",
};

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(2);
  }
  const webhookUrl =
    process.env.WEBHOOK_URL ?? "https://webhook.site/00000000-0000-0000-0000-000000000000";

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO tenants (id, name, plan_tier)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [FIXTURES.tenant_id, "Alpha Demo Tenant", "enterprise"]
    );

    await client.query(
      `INSERT INTO plans (id, name, monthly_price_minor, currency, interval_days)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           monthly_price_minor = EXCLUDED.monthly_price_minor,
           currency = EXCLUDED.currency,
           interval_days = EXCLUDED.interval_days`,
      [FIXTURES.starter_plan_id, "Starter", 2000, "USD", 30]
    );
    await client.query(
      `INSERT INTO plans (id, name, monthly_price_minor, currency, interval_days)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           monthly_price_minor = EXCLUDED.monthly_price_minor,
           currency = EXCLUDED.currency,
           interval_days = EXCLUDED.interval_days`,
      [FIXTURES.enterprise_plan_id, "Enterprise", 50000, "USD", 30]
    );

    await client.query(
      `INSERT INTO customers (id, tenant_id, email, name, tax_region, external_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        FIXTURES.customer_id,
        FIXTURES.tenant_id,
        "ops@northwind-saas.example",
        "Northwind SaaS",
        "US-CA",
        "northwind-001",
      ]
    );

    // Subscription has a 15% discount — important for demoing the schema-drift
    // bug where billing-engine ignores discount_pct.
    await client.query(
      `INSERT INTO subscriptions
         (id, tenant_id, customer_id, plan_id,
          current_period_start, current_period_end, status, discount_pct)
       VALUES ($1, $2, $3, $4,
               NOW() - INTERVAL '29 days', NOW() + INTERVAL '1 minute',
               'active', 15)
       ON CONFLICT (id) DO UPDATE
       SET current_period_end = EXCLUDED.current_period_end,
           status = 'active',
           discount_pct = EXCLUDED.discount_pct`,
      [
        FIXTURES.subscription_id,
        FIXTURES.tenant_id,
        FIXTURES.customer_id,
        FIXTURES.enterprise_plan_id,
      ]
    );

    const secret = "whsec_" + randomBytes(24).toString("hex");
    await client.query(
      `INSERT INTO webhook_endpoints (id, tenant_id, url, secret, enabled)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (id) DO UPDATE
       SET url = EXCLUDED.url, enabled = TRUE`,
      [FIXTURES.webhook_endpoint_id, FIXTURES.tenant_id, webhookUrl, secret]
    );

    await client.query("COMMIT");
    console.log("seeded:");
    console.log(`  tenant_id            = ${FIXTURES.tenant_id}`);
    console.log(`  customer_id          = ${FIXTURES.customer_id}`);
    console.log(`  subscription_id      = ${FIXTURES.subscription_id}  (Enterprise, 15% discount)`);
    console.log(`  webhook_endpoint     = ${webhookUrl}`);
    console.log("");
    console.log("subscription's first billing cycle ends in ~1 minute.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
