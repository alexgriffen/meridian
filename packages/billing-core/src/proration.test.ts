import { describe, it, expect } from "vitest";
import { prorate } from "./proration.js";

describe("prorate", () => {
  it("returns zero when plans are equal", () => {
    const r = prorate({
      oldPlanPrice: { amount_minor: 10_000, currency: "USD" },
      newPlanPrice: { amount_minor: 10_000, currency: "USD" },
      periodStart: new Date("2026-01-01T00:00:00Z"),
      periodEnd: new Date("2026-02-01T00:00:00Z"),
      changeAt: new Date("2026-01-15T00:00:00Z"),
    });
    expect(r.amount_minor).toBe(0);
  });

  it("charges the difference for a mid-cycle upgrade", () => {
    const r = prorate({
      oldPlanPrice: { amount_minor: 10_000, currency: "USD" },
      newPlanPrice: { amount_minor: 30_000, currency: "USD" },
      periodStart: new Date("2026-01-01T00:00:00Z"),
      periodEnd: new Date("2026-01-31T00:00:00Z"),
      changeAt: new Date("2026-01-16T00:00:00Z"),
    });
    // 15 days remaining of 30 = half the delta = 10000
    expect(r.amount_minor).toBe(10_000);
  });

  it("rejects mismatched currencies", () => {
    expect(() =>
      prorate({
        oldPlanPrice: { amount_minor: 10_000, currency: "USD" },
        newPlanPrice: { amount_minor: 10_000, currency: "EUR" },
        periodStart: new Date("2026-01-01"),
        periodEnd: new Date("2026-02-01"),
        changeAt: new Date("2026-01-15"),
      })
    ).toThrow(/currency mismatch/);
  });
});
