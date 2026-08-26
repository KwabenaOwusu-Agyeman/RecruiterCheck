export const BRAND = {
  name: 'MyRecruiterCheck',
  tagline: 'Think like a recruiter before you apply.',
  canonicalUrl: 'https://myrecruitercheck.com',
  googleReviewUrl: 'https://g.page/r/CZyC6CS2RdhiEBM/review',
  trustpilotReviewUrl: 'https://www.trustpilot.com/review/myrecruitercheck.com',
} as const

export const FEATURE_FLAGS = {
  linkedInAuth: false,
} as const

import type { CheckPack, FundingPackId, PackId } from '@/types'

// Display names reuse Starter/Active/Power from the old weekly-subscription
// model (fully removed — see migration remove_subscription_system) purely
// as naming, not resurrected code: `id` stays 'small'|'medium'|'large',
// since that's the value already threaded through Stripe metadata,
// credit_batches.pack_id, and checks.funding_pack_id. Kept in sync with
// PACKS in create-checkout-session and stripe-webhook, and with the
// entitlement gate in generate-documents. Packs differ in both check count
// AND what a check from that pack unlocks — a check drawn from a Starter
// batch only ever gets score + feedback, regardless of which pack the user
// might buy later. Purchased checks expire 90 days after purchase.
export const CHECK_PACKS: CheckPack[] = [
  {
    id: 'small',
    name: 'Starter',
    price: '€10',
    checks: 5,
    description: 'For a focused job search.',
    features: [
      '5 Recruiter Checks',
      'Interview Score',
      'Recruiter Feedback',
      'Improved CV Draft',
      'Access to Check History',
    ],
  },
  {
    id: 'medium',
    name: 'Active',
    price: '€20',
    checks: 15,
    description: 'For an active job search.',
    features: [
      '15 Recruiter Checks',
      'Interview Score',
      'Recruiter Feedback',
      'Improved CV Draft',
      'Access to Check History',
    ],
    badge: 'Most Popular',
    highlighted: true,
  },
  {
    id: 'large',
    name: 'Power',
    price: '€40',
    checks: 40,
    description: 'For applying at volume.',
    features: [
      '40 Recruiter Checks',
      'Interview Score',
      'Recruiter Feedback',
      'Improved CV Draft',
      'Cover Letter with every check',
      'Recruiter Message with every check',
      'Access to Check History',
    ],
    badge: 'Best Value',
  },
]

// The one canonical id -> display name mapping in the app. Every user
// facing surface (error messages, UI copy, tests, reports) must go through
// this or getPackDisplayName below — never compare against or render
// 'small'/'medium'/'large' directly. Derived from CHECK_PACKS itself so
// there is exactly one place this mapping is defined, not a second literal
// copy that could drift from the pricing page.
export const PACK_DISPLAY_NAMES: Record<PackId, string> = Object.fromEntries(
  CHECK_PACKS.map((pack) => [pack.id, pack.name]),
) as Record<PackId, string>

export function getPackDisplayName(packId: FundingPackId): string {
  return packId ? PACK_DISPLAY_NAMES[packId] : 'Free'
}

export const ACCEPTED_CV_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const

export const MAX_CV_SIZE_BYTES = 10 * 1024 * 1024

export const ACCEPTED_JOB_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const

export const MAX_JOB_FILE_SIZE_BYTES = 10 * 1024 * 1024
