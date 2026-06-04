import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { jwtVerify, createRemoteJWKSet } from "jose";

declare module "fastify" {
  interface FastifyRequest {
    authedUserId?: string;
    authedTenantId?: string;
  }
}

/**
 * AUTH_MODE selects how requests are authenticated:
 *
 * - "prod" (default): verify a Bearer JWT against the JWKS endpoint. tenant_id
 *   is read from the token claim.
 * - "dev": trust an X-Tenant-Id header on every request. Used only for the
 *   alpha environment and local dev. NEVER enable this in production.
 */
const AUTH_MODE = process.env.AUTH_MODE ?? "prod";

const JWKS =
  AUTH_MODE === "prod"
    ? createRemoteJWKSet(
        new URL(
          process.env.AUTH_JWKS_URL ??
            "https://auth.meridian.internal/.well-known/jwks.json"
        )
      )
    : null;

const authPluginImpl: FastifyPluginAsync = async (server) => {
  server.addHook("onRequest", async (req, reply) => {
    if (req.url === "/healthz") return;

    if (AUTH_MODE === "dev") {
      const tenantId = req.headers["x-tenant-id"];
      if (!tenantId || typeof tenantId !== "string") {
        return reply.code(401).send({ error: "missing X-Tenant-Id" });
      }
      req.authedTenantId = tenantId;
      req.authedUserId = "dev-user";
      return;
    }

    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "missing bearer token" });
    }
    const token = header.slice(7);
    try {
      const { payload } = await jwtVerify(token, JWKS!, {
        issuer: "https://auth.meridian.internal/",
        audience: "meridian-api",
      });
      req.authedUserId = String(payload.sub);
      req.authedTenantId = String(payload["tenant_id"]);
    } catch (err) {
      req.log.warn({ err }, "jwt verification failed");
      return reply.code(401).send({ error: "invalid token" });
    }
  });
};

export const authPlugin = fp(authPluginImpl, { name: "auth-plugin" });
