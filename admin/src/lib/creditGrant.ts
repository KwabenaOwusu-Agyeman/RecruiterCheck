// Plans an admin can grant for free from the Control Centre. The amounts
// mirror the live one-time credit packs (Product and Pricing: Starter 5,
// Active 15, Power 40) rather than inventing a new size, since a manual
// grant should look identical in the ledger to a paid one of the same name.
export const GRANT_PLANS = {
  single: 1,
  power: 40,
} as const

export type GrantPlan = keyof typeof GRANT_PLANS

export function resolveGrantAmount(plan: string): number | null {
  return Object.prototype.hasOwnProperty.call(GRANT_PLANS, plan)
    ? GRANT_PLANS[plan as GrantPlan]
    : null
}
