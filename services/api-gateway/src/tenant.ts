import { FastifyPluginAsync, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import type { TenantId } from "@meridian/shared-types";

declare module "fastify" {
  interface FastifyRequest {
    /** The tenant for this request, populated by tenantPlugin. */
    tenant?: { tenantId: TenantId; requestId: string };
  }
}

const tenantPluginImpl: FastifyPluginAsync = async (server) => {
  server.addHook("preHandler", async (req, reply) => {
    if (req.url === "/healthz") return;
    if (!req.authedTenantId) {
      return reply.code(401).send({ error: "no tenant" });
    }
    req.tenant = {
      tenantId: req.authedTenantId as TenantId,
      requestId: req.id,
    };
  });
};

export const tenantPlugin = fp(tenantPluginImpl, {
  name: "tenant-plugin",
  dependencies: ["auth-plugin"],
});

/**
 * Read the tenant from a request. Throws if the tenant plugin didn't populate
 * it — that should be impossible because the preHandler 401s first, but the
 * throw narrows the type for TS.
 */
export function getTenant(req: FastifyRequest): { tenantId: TenantId; requestId: string } {
  if (!req.tenant) {
    throw new Error("tenant not set on request — tenant plugin not installed?");
  }
  return req.tenant;
}
