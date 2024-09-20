import Fastify from "fastify";
import { authPlugin } from "./auth.js";
import { tenantPlugin } from "./tenant.js";
import { subscriptionsRoutes } from "./routes/subscriptions.js";
import { invoicesRoutes } from "./routes/invoices.js";
import { customersRoutes } from "./routes/customers.js";

export async function buildServer() {
  const server = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    requestIdHeader: "x-request-id",
    genReqId: () => crypto.randomUUID(),
  });

  await server.register(authPlugin);
  await server.register(tenantPlugin);

  server.get("/healthz", async () => ({ ok: true }));

  await server.register(subscriptionsRoutes, { prefix: "/v1/subscriptions" });
  await server.register(invoicesRoutes, { prefix: "/v1/invoices" });
  await server.register(customersRoutes, { prefix: "/v1/customers" });

  return server;
}
