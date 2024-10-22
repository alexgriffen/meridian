import { initTelemetry } from "@meridian/otel";
import pino from "pino";
import { runInvoiceGenerationCycle } from "./invoice-generator.js";

initTelemetry("billing-engine");
const log = pino({ name: "billing-engine" });

const INTERVAL_MS = Number(process.env.CYCLE_INTERVAL_MS ?? 60_000);

async function main() {
  log.info({ interval_ms: INTERVAL_MS }, "billing-engine starting");
  while (true) {
    try {
      const result = await runInvoiceGenerationCycle();
      log.info(result, "cycle completed");
    } catch (err) {
      log.error({ err }, "cycle failed");
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main();
