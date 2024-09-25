import { describe, it, expect } from "vitest";

// Smoke test placeholder — integration tests live in tests/integration/ and
// require a postgres test container (see tests/README.md).
describe("subscriptions routes", () => {
  it("module loads", async () => {
    const mod = await import("./subscriptions.js");
    expect(mod.subscriptionsRoutes).toBeTypeOf("function");
  });
});
