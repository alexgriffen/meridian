import type { PoolClient } from "pg";

/**
 * Enqueue a webhook delivery for every enabled endpoint of the tenant that
 * is subscribed to `event_type`. For now every endpoint receives every event
 * — fine-grained event subscriptions are PLAT-993.
 *
 * Must be called inside the same transaction as the row that triggered the
 * event so that we don't enqueue a delivery for a row we end up rolling back.
 */
export async function enqueueWebhook(
  client: PoolClient,
  args: {
    tenantId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  const endpoints = await client.query<{
    id: string;
    url: string;
  }>(
    `SELECT id, url FROM webhook_endpoints
     WHERE tenant_id = $1 AND enabled = TRUE`,
    [args.tenantId]
  );

  for (const ep of endpoints.rows) {
    await client.query(
      `INSERT INTO webhook_deliveries
         (tenant_id, endpoint_id, endpoint_url, event_type, payload, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'pending')`,
      [args.tenantId, ep.id, ep.url, args.eventType, JSON.stringify(args.payload)]
    );
  }
}
