import { z } from "zod";

export const TenantId = z.string().uuid().brand("TenantId");
export type TenantId = z.infer<typeof TenantId>;

export const Tenant = z.object({
  id: TenantId,
  name: z.string(),
  plan_tier: z.enum(["starter", "growth", "enterprise"]),
  created_at: z.string().datetime(),
});
export type Tenant = z.infer<typeof Tenant>;
