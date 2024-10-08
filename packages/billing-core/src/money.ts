import type { Money } from "@meridian/shared-types";

export function roundMoney(amount: number): number {
  return Math.round(amount);
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`currency mismatch: ${a.currency} vs ${b.currency}`);
  }
  return { amount_minor: a.amount_minor + b.amount_minor, currency: a.currency };
}

export function subtractMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`currency mismatch: ${a.currency} vs ${b.currency}`);
  }
  return { amount_minor: a.amount_minor - b.amount_minor, currency: a.currency };
}
