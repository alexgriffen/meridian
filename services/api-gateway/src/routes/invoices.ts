import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getPool, currentTenant } from "@meridian/db";

const ListQuery = z.object({
  customer_id: z.string().uuid().optional(),
  status: z.enum(["draft", "open", "paid", "void"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const invoicesRoutes: FastifyPluginAsync = async (server) => {
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

    const result = await pool.query(
      `SELECT id, tenant_id, customer_id, subscription_id, total_minor, currency, status, created_at
       FROM invoices
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    );
    return { data: result.rows };
  });

  server.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, tenant_id, customer_id, subscription_id, total_minor, currency, status, created_at
       FROM invoices
       WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "not found" });
    }
    return result.rows[0];
  });
};
