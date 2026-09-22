// Plans an admin can grant for free from the Control Centre. Amount and pack
// id both mirror a real one-time pack (Product and Pricing / the live pricing
// page: Starter 5, Active 15, Power 40) rather than inventing a new size.
//
// pack_id matters beyond the amount: generate-documents/logic.ts gates CV
// draft, Cover Letter and Recruiter Message entitlement on checks.funding_pack_id
// ('small' | 'medium' | 'large'), which a completed check inherits from
// whichever credit_batches row funded it (complete_check_analysis). A batch
// with pack_id null funds a check with funding_pack_id null, which is
// EXCLUDED from every entitlement, including the CV draft Starter gets — not
// merely missing Power's extras. So a "free Power pack" grant with no pack id
// silently grants checks that unlock nothing at all.
export const GRANT_PLANS = {
  single: { amount: 1, packId: 'small' },
  power: { amount: 40, packId: 'large' },
} as const

export type GrantPlan = keyof typeof GRANT_PLANS

export function resolveGrant(plan: string): { amount: number; packId: string } | null {
  return Object.prototype.hasOwnProperty.call(GRANT_PLANS, plan)
    ? GRANT_PLANS[plan as GrantPlan]
    : null
}
