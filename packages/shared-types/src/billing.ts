import { z } from "zod";
import { TenantId } from "./tenant.js";

export const Money = z.object({
  amount_minor: z.number().int(),
  currency: z.enum(["USD", "EUR", "GBP"]),
});
export type Money = z.infer<typeof Money>;

export const Plan = z.object({
  id: z.string(),
  name: z.string(),
  monthly_price: Money,
  interval_days: z.number().int().positive(),
});
export type Plan = z.infer<typeof Plan>;

export const Subscription = z.object({
  id: z.string().uuid(),
  tenant_id: TenantId,
  customer_id: z.string().uuid(),
  plan_id: z.string(),
  current_period_start: z.string().datetime(),
  current_period_end: z.string().datetime(),
  status: z.enum(["active", "past_due", "canceled"]),
});
export type Subscription = z.infer<typeof Subscription>;

export const Invoice = z.object({
  id: z.string().uuid(),
  tenant_id: TenantId,
  customer_id: z.string().uuid(),
  subscription_id: z.string().uuid().nullable(),
  total: Money,
  status: z.enum(["draft", "open", "paid", "void"]),
  created_at: z.string().datetime(),
});
export type Invoice = z.infer<typeof Invoice>;
