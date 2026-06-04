import { AsyncLocalStorage } from "node:async_hooks";
import type { TenantId } from "@meridian/shared-types";

export interface TenantContext {
  tenantId: TenantId;
  requestId: string;
}

const als = new AsyncLocalStorage<TenantContext>();

/**
 * Run `fn` inside the tenant context. Returns after `fn` completes; the
 * context is released after the callback. Use this for batch jobs or
 * synchronous-style flows.
 */
export function withTenant<T>(ctx: TenantContext, fn: () => T): T {
  return als.run(ctx, fn);
}

/**
 * Enter the tenant context for the rest of the current async chain. Use
 * this in request/lifecycle hooks where the handler needs the context to
 * persist across awaits without wrapping the whole handler in a callback.
 */
export function enterTenant(ctx: TenantContext): void {
  als.enterWith(ctx);
}

export function currentTenant(): TenantContext | undefined {
  return als.getStore();
}
