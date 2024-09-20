import { initTelemetry } from "@meridian/otel";
import { buildServer } from "./server.js";

initTelemetry("api-gateway");

const port = Number(process.env.PORT ?? 4000);
const server = await buildServer();

server.listen({ port, host: "0.0.0.0" }).then(() => {
  server.log.info({ port }, "api-gateway listening");
});
