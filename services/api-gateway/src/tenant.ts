import { FastifyPluginAsync } from "fastify";
import { withTenant } from "@meridian/db";
import type { TenantId } from "@meridian/shared-types";

export const tenantPlugin: FastifyPluginAsync = async (server) => {
  server.addHook("preHandler", async (req, reply) => {
    if (req.url === "/healthz") return;
    if (!req.authedTenantId) {
      return reply.code(401).send({ error: "no tenant" });
    }
    // Run the rest of the request inside the tenant async-context
    // so downstream queries can pick it up via currentTenant().
    return new Promise<void>((resolve) => {
      withTenant(
        { tenantId: req.authedTenantId as TenantId, requestId: req.id },
        () => {
          resolve();
        }
      );
    });
  });
};
