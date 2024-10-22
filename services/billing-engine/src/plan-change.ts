import { getPool, withTransaction } from "@meridian/db";
import { prorate } from "@meridian/billing-core";
import type { Money, TenantId } from "@meridian/shared-types";

export interface PlanChangeRequest {
  tenantId: TenantId;
  subscriptionId: string;
  newPlanId: string;
  effectiveAt?: Date;
}

export async function changePlan(req: PlanChangeRequest): Promise<{ proration: Money }> {
  return withTransaction(async (client) => {
    const subRes = await client.query<{
      id: string;
      tenant_id: string;
      customer_id: string;
      plan_id: string;
      current_period_start: string;
      current_period_end: string;
    }>(
      `SELECT id, tenant_id, customer_id, plan_id, current_period_start, current_period_end
       FROM subscriptions
       WHERE id = $1 AND tenant_id = $2 AND status = 'active'
       FOR UPDATE`,
      [req.subscriptionId, req.tenantId]
    );
    const sub = subRes.rows[0];
    if (!sub) throw new Error("subscription not found or not active");

    const oldPlanRes = await client.query<{
      monthly_price_minor: number;
      currency: string;
    }>(`SELECT monthly_price_minor, currency FROM plans WHERE id = $1`, [sub.plan_id]);
    const newPlanRes = await client.query<{
      monthly_price_minor: number;
      currency: string;
    }>(`SELECT monthly_price_minor, currency FROM plans WHERE id = $1`, [req.newPlanId]);

    const oldPlan = oldPlanRes.rows[0];
    const newPlan = newPlanRes.rows[0];
    if (!oldPlan || !newPlan) throw new Error("plan lookup failed");

    const proration = prorate({
      oldPlanPrice: {
        amount_minor: oldPlan.monthly_price_minor,
        currency: oldPlan.currency as Money["currency"],
      },
      newPlanPrice: {
        amount_minor: newPlan.monthly_price_minor,
        currency: newPlan.currency as Money["currency"],
      },
      periodStart: new Date(sub.current_period_start),
      periodEnd: new Date(sub.current_period_end),
      changeAt: req.effectiveAt ?? new Date(),
    });

    await client.query(
      `UPDATE subscriptions SET plan_id = $1 WHERE id = $2`,
      [req.newPlanId, sub.id]
    );

    if (proration.amount_minor !== 0) {
      await client.query(
        `INSERT INTO invoices
           (id, tenant_id, customer_id, subscription_id, subtotal_minor, tax_minor,
            total_minor, currency, status, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, $4, $5, 'open', NOW())`,
        [sub.tenant_id, sub.customer_id, sub.id, proration.amount_minor, proration.currency]
      );
    }

    return { proration };
  });
}
