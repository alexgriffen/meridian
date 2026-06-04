/**
 * End-to-end canary — runs a known tenant through the public API on a steady
 * cadence so that observability tooling (Grafana / PlayerZero) has a baseline
 * runtime signal even when no real customer traffic is flowing.
 *
 * What it does each tick:
 *   - Posts 3-7 usage events with a realistic metric mix
 *   - 30% chance of exercising read paths (GET /v1/subscriptions, /v1/invoices)
 *   - 5%  chance of creating a fresh subscription
 *   - 2%  chance of triggering a plan change on the seeded subscription
 *
 * OTel auto-instrumentation traces the outbound HTTP calls; spans propagate
 * to the gateway so we see distributed canary -> gateway -> postgres traces
 * end-to-end.
 */
import { initTelemetry } from "@meridian/otel";
import pino from "pino";

initTelemetry("canary");
const log = pino({ name: "canary" });

const API_URL = process.env.API_URL ?? "https://meridian-gateway.fly.dev";
const TENANT_ID = process.env.TENANT_ID ?? "00000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = process.env.CUSTOMER_ID ?? "00000000-0000-4000-8000-000000000010";
const SUBSCRIPTION_ID =
  process.env.SUBSCRIPTION_ID ?? "00000000-0000-4000-8000-000000000020";
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 60_000);

const METRICS = [
  "api_calls",
  "api_calls",
  "api_calls",
  "api_calls",
  "storage_gb",
  "compute_seconds",
  "emails_sent",
];

const baseHeaders = {
  "content-type": "application/json",
  "X-Tenant-Id": TENANT_ID,
};

async function postUsage(): Promise<void> {
  const metric = METRICS[Math.floor(Math.random() * METRICS.length)]!;
  const quantity = Math.floor(Math.random() * 250) + 1;
  const resp = await fetch(`${API_URL}/v1/usage`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify({ customer_id: CUSTOMER_ID, metric, quantity }),
  });
  log.info({ metric, quantity, status: resp.status }, "usage event posted");
}

async function getReads(): Promise<void> {
  const r1 = await fetch(`${API_URL}/v1/subscriptions`, {
    headers: { "X-Tenant-Id": TENANT_ID },
  });
  const r2 = await fetch(`${API_URL}/v1/invoices`, {
    headers: { "X-Tenant-Id": TENANT_ID },
  });
  log.info({ subs_status: r1.status, invoices_status: r2.status }, "read paths exercised");
}

async function maybeCreateSubscription(): Promise<void> {
  if (Math.random() >= 0.05) return;
  const resp = await fetch(`${API_URL}/v1/subscriptions`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify({ customer_id: CUSTOMER_ID, plan_id: "plan_starter" }),
  });
  log.info({ status: resp.status }, "subscription created");
}

async function maybeChangePlan(): Promise<void> {
  if (Math.random() >= 0.02) return;
  const newPlan = Math.random() < 0.5 ? "plan_starter" : "plan_enterprise";
  const resp = await fetch(
    `${API_URL}/v1/subscriptions/${SUBSCRIPTION_ID}/plan-change`,
    {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({ new_plan_id: newPlan }),
    }
  );
  log.info({ new_plan: newPlan, status: resp.status }, "plan change attempted");
}

async function tick(): Promise<void> {
  try {
    const count = Math.floor(Math.random() * 5) + 3;
    for (let i = 0; i < count; i++) {
      await postUsage();
      await new Promise((r) => setTimeout(r, 300));
    }
    if (Math.random() < 0.3) await getReads();
    await maybeCreateSubscription();
    await maybeChangePlan();
  } catch (err) {
    log.error({ err: (err as Error).message }, "tick failed");
  }
}

async function main(): Promise<void> {
  log.info(
    {
      api_url: API_URL,
      tenant_id: TENANT_ID,
      interval_ms: INTERVAL_MS,
    },
    "canary starting"
  );
  while (true) {
    await tick();
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main().catch((err) => {
  log.error({ err }, "fatal");
  process.exit(1);
});
