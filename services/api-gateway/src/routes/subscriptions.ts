import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getPool } from "@meridian/db";
import { getTenant } from "../tenant.js";

const ListQuery = z.object({
  customer_id: z.string().uuid().optional(),
  status: z.enum(["active", "past_due", "canceled"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const GetParams = z.object({ id: z.string().uuid() });

const CreateBody = z.object({
  customer_id: z.string().uuid(),
  plan_id: z.string().min(1),
  discount_pct: z.number().min(0).max(100).optional(),
});

const PlanChangeBody = z.object({
  new_plan_id: z.string().min(1),
  effective_at: z.string().datetime().optional(),
});

export const subscriptionsRoutes: FastifyPluginAsync = async (server) => {
  server.get("/", async (req) => {
    const tenant = getTenant(req);
    const q = ListQuery.parse(req.query);
    const pool = getPool();

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [tenant.tenantId];
    if (q.customer_id) {
      params.push(q.customer_id);
      conditions.push(`customer_id = $${params.length}`);
    }
    if (q.status) {
      params.push(q.status);
      conditions.push(`status = $${params.length}`);
    }
    params.push(q.limit);
    const limitIdx = params.length;

    const result = await pool.query(
      `SELECT id, tenant_id, customer_id, plan_id, current_period_start,
              current_period_end, status
       FROM subscriptions
       WHERE ${conditions.join(" AND ")}
       ORDER BY current_period_start DESC
       LIMIT $${limitIdx}`,
      params
    );
    return { data: result.rows };
  });

  server.get("/:id", async (req, reply) => {
    const { id } = GetParams.parse(req.params);
    const pool = getPool();

    const result = await pool.query(
      `SELECT id, tenant_id, customer_id, plan_id, current_period_start,
              current_period_end, status
       FROM subscriptions
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "not found" });
    }
    return result.rows[0];
  });

  server.post("/", async (req, reply) => {
    const tenant = getTenant(req);
    const body = CreateBody.parse(req.body);
    const pool = getPool();

    const planRes = await pool.query<{ interval_days: number }>(
      `SELECT interval_days FROM plans WHERE id = $1`,
      [body.plan_id]
    );
    const plan = planRes.rows[0];
    if (!plan) return reply.code(400).send({ error: "unknown plan_id" });

    const result = await pool.query<{ id: string }>(
      `INSERT INTO subscriptions
         (tenant_id, customer_id, plan_id,
          current_period_start, current_period_end, status, discount_pct)
       VALUES ($1, $2, $3, NOW(), NOW() + ($4 || ' days')::interval, 'active', $5)
       RETURNING id`,
      [
        tenant.tenantId,
        body.customer_id,
        body.plan_id,
        plan.interval_days,
        body.discount_pct ?? 0,
      ]
    );
    return reply.code(201).send({ id: result.rows[0]?.id });
  });

  server.post<{ Params: { id: string } }>("/:id/plan-change", async (req) => {
    const tenant = getTenant(req);
    const body = PlanChangeBody.parse(req.body);

    const { changePlan } = await import("@meridian/billing-engine/plan-change");
    const result = await changePlan({
      tenantId: tenant.tenantId,
      subscriptionId: req.params.id,
      newPlanId: body.new_plan_id,
      effectiveAt: body.effective_at ? new Date(body.effective_at) : undefined,
    });
    return result;
  });
};
