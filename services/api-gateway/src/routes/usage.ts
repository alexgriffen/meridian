import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getPool, currentTenant } from "@meridian/db";

const UsageEventInput = z.object({
  customer_id: z.string().uuid(),
  metric: z.string().min(1).max(64),
  quantity: z.number().nonnegative(),
  occurred_at: z.string().datetime().optional(),
});

const BatchInput = z.object({
  events: z.array(UsageEventInput).min(1).max(500),
});

export const usageRoutes: FastifyPluginAsync = async (server) => {
  server.post("/", async (req, reply) => {
    const tenant = currentTenant();
    if (!tenant) return reply.code(401).send({ error: "no tenant" });

    const body = parseBody(req.body);
    const pool = getPool();

    const accepted: string[] = [];
    for (const e of body.events) {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO usage_events
           (tenant_id, customer_id, metric, quantity, occurred_at)
         VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()))
         RETURNING id`,
        [tenant.tenantId, e.customer_id, e.metric, e.quantity, e.occurred_at ?? null]
      );
      const row = result.rows[0];
      if (row) accepted.push(row.id);
    }

    return reply.code(202).send({ accepted });
  });
};

function parseBody(body: unknown): { events: z.infer<typeof UsageEventInput>[] } {
  // Accept either { events: [...] } or a single event object.
  if (body && typeof body === "object" && "events" in body) {
    return BatchInput.parse(body);
  }
  return { events: [UsageEventInput.parse(body)] };
}
