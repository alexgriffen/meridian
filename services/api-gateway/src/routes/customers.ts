import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getPool } from "@meridian/db";
import { getTenant } from "../tenant.js";

const SearchQuery = z.object({
  email: z.string().email().optional(),
  q: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const customersRoutes: FastifyPluginAsync = async (server) => {
  server.get("/", async (req) => {
    const tenant = getTenant(req);
    const params_ = SearchQuery.parse(req.query);
    const pool = getPool();

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [tenant.tenantId];
    if (params_.email) {
      params.push(params_.email);
      conditions.push(`email = $${params.length}`);
    }
    if (params_.q) {
      params.push(`%${params_.q}%`);
      conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }
    params.push(params_.limit);

    const result = await pool.query(
      `SELECT id, tenant_id, email, name, created_at
       FROM customers
       WHERE ${conditions.join(" AND ")}
       LIMIT $${params.length}`,
      params
    );
    return { data: result.rows };
  });

  // Lookup by external id — used by support tooling to deep-link from Zendesk.
  server.get<{ Querystring: { external_id?: string } }>("/by-external-id", async (req, reply) => {
    const externalId = req.query.external_id;
    if (!externalId) return reply.code(400).send({ error: "external_id required" });

    const pool = getPool();
    const result = await pool.query(
      `SELECT id, tenant_id, email, name, external_id, created_at
       FROM customers
       WHERE external_id = $1`,
      [externalId]
    );
    if (result.rows.length === 0) return reply.code(404).send({ error: "not found" });
    return result.rows[0];
  });
};
