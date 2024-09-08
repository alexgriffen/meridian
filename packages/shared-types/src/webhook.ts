import { z } from "zod";
import { TenantId } from "./tenant.js";

export const WebhookEventType = z.enum([
  "invoice.created",
  "invoice.paid",
  "subscription.created",
  "subscription.updated",
  "subscription.canceled",
  "usage.threshold_exceeded",
]);
export type WebhookEventType = z.infer<typeof WebhookEventType>;

export const WebhookDelivery = z.object({
  id: z.string().uuid(),
  tenant_id: TenantId,
  endpoint_url: z.string().url(),
  event_type: WebhookEventType,
  payload: z.record(z.unknown()),
  attempt_count: z.number().int().nonnegative(),
  status: z.enum(["pending", "delivered", "failed", "dead"]),
  next_retry_at: z.string().datetime().nullable(),
});
export type WebhookDelivery = z.infer<typeof WebhookDelivery>;
