import type { Money } from "@meridian/shared-types";
import { roundMoney } from "./money.js";

const TAX_RATES: Record<string, number> = {
  "US-CA": 0.0725,
  "US-NY": 0.04,
  "US-WA": 0.065,
  "EU-DE": 0.19,
  "EU-FR": 0.20,
  "GB": 0.20,
};

export function calculateTax(subtotal: Money, region: string): Money {
  const rate = TAX_RATES[region] ?? 0;
  return {
    amount_minor: roundMoney(subtotal.amount_minor * rate),
    currency: subtotal.currency,
  };
}
