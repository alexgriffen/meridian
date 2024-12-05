import { getPool } from "@meridian/db";
import { withSpan } from "@meridian/otel";
import pino from "pino";
import { signPayload } from "./signing.js";
import { computeBackoff } from "./backoff.js";

const log = pino({ name: "webhook-dispatcher" });
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 1000);
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 25);
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS ?? 8);

interface DeliveryRow {
  id: string;
  tenant_id: string;
  endpoint_url: string;
  endpoint_secret: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempt_count: number;
}

export async function runDispatchLoop(): Promise<void> {
  while (true) {
    try {
      const batch = await claimBatch();
      if (batch.length > 0) {
        await Promise.all(batch.map((d) => deliver(d)));
      } else {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (err) {
      log.error({ err }, "loop iteration failed");
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

async function claimBatch(): Promise<DeliveryRow[]> {
  const pool = getPool();
  const result = await pool.query<DeliveryRow>(
    `SELECT d.id, d.tenant_id, d.endpoint_url, e.secret AS endpoint_secret,
            d.event_type, d.payload, d.attempt_count
     FROM webhook_deliveries d
     JOIN webhook_endpoints e ON e.id = d.endpoint_id
     WHERE d.status = 'pending'
       AND (d.next_retry_at IS NULL OR d.next_retry_at <= NOW())
     ORDER BY d.next_retry_at NULLS FIRST
     LIMIT $1`,
    [BATCH_SIZE]
  );
  return result.rows;
}

async function deliver(d: DeliveryRow): Promise<void> {
  return withSpan(
    "webhook.deliver",
    async () => {
      const signedBody = JSON.stringify(d.payload);
      const signature = signPayload(signedBody, d.endpoint_secret);

      let success = false;
      let statusCode: number | null = null;
      try {
        const resp = await fetch(d.endpoint_url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-meridian-event": d.event_type,
            "x-meridian-signature": signature,
            "x-meridian-delivery-id": d.id,
          },
          body: signedBody,
          signal: AbortSignal.timeout(10_000),
        });
        statusCode = resp.status;
        success = resp.status >= 200 && resp.status < 300;
      } catch (err) {
        log.warn({ err, delivery_id: d.id }, "delivery http error");
      }

      const pool = getPool();
      const nextAttempt = d.attempt_count + 1;
      if (success) {
        await pool.query(
          `UPDATE webhook_deliveries
           SET status = 'delivered', delivered_at = NOW(), attempt_count = $2,
               last_status_code = $3
           WHERE id = $1`,
          [d.id, nextAttempt, statusCode]
        );
      } else if (nextAttempt >= MAX_ATTEMPTS) {
        await pool.query(
          `UPDATE webhook_deliveries
           SET status = 'dead', attempt_count = $2, last_status_code = $3
           WHERE id = $1`,
          [d.id, nextAttempt, statusCode]
        );
      } else {
        const backoffMs = computeBackoff(nextAttempt);
        await pool.query(
          `UPDATE webhook_deliveries
           SET attempt_count = $2, last_status_code = $3,
               next_retry_at = NOW() + ($4 || ' milliseconds')::interval
           WHERE id = $1`,
          [d.id, nextAttempt, statusCode, backoffMs]
        );
      }
    },
    { delivery_id: d.id, event_type: d.event_type, tenant_id: d.tenant_id }
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
