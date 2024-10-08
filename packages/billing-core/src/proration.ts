import type { Money } from "@meridian/shared-types";
import { roundMoney } from "./money.js";

export interface ProrationInput {
  oldPlanPrice: Money;
  newPlanPrice: Money;
  periodStart: Date;
  periodEnd: Date;
  changeAt: Date;
}

/**
 * Compute the net proration delta when a customer changes plans mid-cycle.
 * Positive = upgrade owed by customer, negative = downgrade credit to customer.
 *
 * Convention: changeAt is inclusive of the new plan, exclusive of the old.
 * i.e. on changeAt, customer is on the new plan for the full day.
 */
export function prorate(input: ProrationInput): Money {
  const { oldPlanPrice, newPlanPrice, periodStart, periodEnd, changeAt } = input;

  if (oldPlanPrice.currency !== newPlanPrice.currency) {
    throw new Error("currency mismatch in proration");
  }

  const MS_PER_DAY = 86_400_000;
  const totalDays = Math.round((periodEnd.getTime() - periodStart.getTime()) / MS_PER_DAY);
  const daysRemaining = Math.round((periodEnd.getTime() - changeAt.getTime()) / MS_PER_DAY);

  const unusedOldCredit = roundMoney((oldPlanPrice.amount_minor * daysRemaining) / totalDays);
  const newPlanCharge = roundMoney((newPlanPrice.amount_minor * daysRemaining) / totalDays);

  return {
    amount_minor: newPlanCharge - unusedOldCredit,
    currency: oldPlanPrice.currency,
  };
}
