import { getPool, withTransaction } from "@meridian/db";
import { addMoney, calculateTax } from "@meridian/billing-core";
import { withSpan } from "@meridian/otel";
import type { Money } from "@meridian/shared-types";
import { enqueueWebhook } from "./webhook-enqueue.js";

interface CycleResult {
  subscriptions_processed: number;
  invoices_created: number;
  errors: number;
}

export async function runInvoiceGenerationCycle(): Promise<CycleResult> {
  return withSpan("billing-engine.cycle", async () => {
    const pool = getPool();
    const due = await pool.query<{
      id: string;
      tenant_id: string;
      customer_id: string;
      plan_id: string;
      current_period_end: string;
      tax_region: string;
    }>(
      `SELECT s.id, s.tenant_id, s.customer_id, s.plan_id, s.current_period_end,
              c.tax_region
       FROM subscriptions s
       JOIN customers c ON c.id = s.customer_id
       WHERE s.status = 'active'
         AND s.current_period_end <= NOW()
       LIMIT 500`
    );

    let invoicesCreated = 0;
    let errors = 0;
    for (const sub of due.rows) {
      try {
        await generateInvoiceForSubscription(sub);
        invoicesCreated += 1;
      } catch (err) {
        errors += 1;
      }
    }
    return {
      subscriptions_processed: due.rows.length,
      invoices_created: invoicesCreated,
      errors,
    };
  });
}

interface SubRow {
  id: string;
  tenant_id: string;
  customer_id: string;
  plan_id: string;
  current_period_end: string;
  tax_region: string;
}

async function generateInvoiceForSubscription(sub: SubRow): Promise<void> {
  await withTransaction(async (client) => {
    const planResult = await client.query<{
      id: string;
      monthly_price_minor: number;
      currency: string;
      interval_days: number;
    }>(`SELECT id, monthly_price_minor, currency, interval_days FROM plans WHERE id = $1`, [
      sub.plan_id,
    ]);
    const plan = planResult.rows[0];
    if (!plan) throw new Error(`plan ${sub.plan_id} not found`);

    const subtotal: Money = {
      amount_minor: plan.monthly_price_minor,
      currency: plan.currency as Money["currency"],
    };
    const tax = calculateTax(subtotal, sub.tax_region);
    const total = addMoney(subtotal, tax);

    const invoiceResult = await client.query<{ id: string }>(
      `INSERT INTO invoices
        (tenant_id, customer_id, subscription_id, subtotal_minor, tax_minor,
         total_minor, currency, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', NOW())
       RETURNING id`,
      [
        sub.tenant_id,
        sub.customer_id,
        sub.id,
        subtotal.amount_minor,
        tax.amount_minor,
        total.amount_minor,
        total.currency,
      ]
    );
    const invoiceId = invoiceResult.rows[0]?.id;

    await client.query(
      `UPDATE subscriptions
       SET current_period_start = current_period_end,
           current_period_end = current_period_end + ($2 || ' days')::interval
       WHERE id = $1`,
      [sub.id, plan.interval_days]
    );

    await enqueueWebhook(client, {
      tenantId: sub.tenant_id,
      eventType: "invoice.created",
      payload: {
        id: invoiceId,
        tenant_id: sub.tenant_id,
        customer_id: sub.customer_id,
        subscription_id: sub.id,
        subtotal_minor: subtotal.amount_minor,
        tax_minor: tax.amount_minor,
        total_minor: total.amount_minor,
        currency: total.currency,
        status: "open",
      },
    });
  });
}
