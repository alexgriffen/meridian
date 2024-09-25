import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getPool } from "@meridian/db";
import { currentTenant } from "@meridian/db";

const ListQuery = z.object({
  customer_id: z.string().uuid().optional(),
  status: z.enum(["active", "past_due", "canceled"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const GetParams = z.object({ id: z.string().uuid() });

export const subscriptionsRoutes: FastifyPluginAsync = async (server) => {
  server.get("/", async (req) => {
    const tenant = currentTenant();
    const q = ListQuery.parse(req.query);
    const pool = getPool();

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [tenant?.tenantId];
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
};
