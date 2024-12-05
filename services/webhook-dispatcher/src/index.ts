import { initTelemetry } from "@meridian/otel";
import pino from "pino";
import { runDispatchLoop } from "./dispatcher.js";

initTelemetry("webhook-dispatcher");
const log = pino({ name: "webhook-dispatcher" });

async function main() {
  log.info("webhook-dispatcher starting");
  await runDispatchLoop();
}

main().catch((err) => {
  log.error({ err }, "fatal");
  process.exit(1);
});
