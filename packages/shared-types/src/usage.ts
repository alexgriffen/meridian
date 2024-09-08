import { z } from "zod";
import { TenantId } from "./tenant.js";

export const UsageEvent = z.object({
  id: z.string().uuid(),
  tenant_id: TenantId,
  customer_id: z.string().uuid(),
  metric: z.string(),
  quantity: z.number(),
  occurred_at: z.string().datetime(),
});
export type UsageEvent = z.infer<typeof UsageEvent>;

export const DailyUsageRollup = z.object({
  tenant_id: TenantId,
  customer_id: z.string().uuid(),
  metric: z.string(),
  day: z.string(),
  total_quantity: z.number(),
});
export type DailyUsageRollup = z.infer<typeof DailyUsageRollup>;
