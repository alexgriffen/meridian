import { FastifyPluginAsync } from "fastify";
import { jwtVerify, createRemoteJWKSet } from "jose";

declare module "fastify" {
  interface FastifyRequest {
    authedUserId?: string;
    authedTenantId?: string;
  }
}

const JWKS = createRemoteJWKSet(
  new URL(process.env.AUTH_JWKS_URL ?? "https://auth.meridian.internal/.well-known/jwks.json")
);

export const authPlugin: FastifyPluginAsync = async (server) => {
  server.addHook("onRequest", async (req, reply) => {
    if (req.url === "/healthz") return;

    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "missing bearer token" });
    }
    const token = header.slice(7);
    try {
      const { payload } = await jwtVerify(token, JWKS, {
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
