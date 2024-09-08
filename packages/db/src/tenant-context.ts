import { AsyncLocalStorage } from "node:async_hooks";
import type { TenantId } from "@meridian/shared-types";

export interface TenantContext {
  tenantId: TenantId;
  requestId: string;
}

const als = new AsyncLocalStorage<TenantContext>();

export function withTenant<T>(ctx: TenantContext, fn: () => T): T {
  return als.run(ctx, fn);
}

export function currentTenant(): TenantContext | undefined {
  return als.getStore();
}
