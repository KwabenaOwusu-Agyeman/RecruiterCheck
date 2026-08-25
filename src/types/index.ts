export type SubscriptionTier = 'free' | 'starter' | 'active' | 'power'
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'trialing'
export type CheckStatus = 'draft' | 'processing' | 'completed' | 'failed'
export type OutputLanguage = 'auto' | 'en' | 'nl'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  subscription_tier: SubscriptionTier
  subscription_status: SubscriptionStatus
  stripe_customer_id: string | null
  // Durable usage counters — the authoritative source of truth for
  // allowance checks, never derived by counting `checks` rows, and never
  // decremented by deleting a check. lifetime_checks_consumed tracks the
  // free tier's single lifetime check; period_checks_consumed/_limit track
  // the current weekly billing period's allotment for paid tiers, reset by
  // the Stripe webhook on every successful charge (see migration
  // switch_to_weekly_allotment_plans) rather than by a calendar date.
  lifetime_checks_consumed: number
  period_checks_consumed: number
  period_checks_limit: number
  created_at: string
  updated_at: string
}

export interface Check {
  id: string
  user_id: string
  job_title: string | null
  company_name: string | null
  job_description: string
  cv_storage_path: string
  cv_file_name: string
  status: CheckStatus
  interview_probability_score: number | null
  experience_score: number | null
  skills_score: number | null
  uvp_score: number | null
  error_message: string | null
  output_language: OutputLanguage
  detected_language: string | null
  created_at: string
  updated_at: string
}

export interface Feedback {
  id: string
  check_id: string
  strengths: string[]
  improvements: string[]
  prospects: string[]
  created_at: string
}

export interface CheckWithFeedback extends Check {
  feedback: Feedback | null
}

export interface Subscription {
  id: string
  user_id: string
  plan: 'starter' | 'active' | 'power'
  status: SubscriptionStatus
  current_period_end: string | null
  created_at: string
}


export interface PricingPlan {
  id: SubscriptionTier
  name: string
  price: string
  interval?: string
  description: string
  features: string[]
  badge?: string
  highlighted?: boolean
  /** e.g. "€1.50 / check" — shown under the price so the per-check value of
   *  upgrading is stated, not left for the buyer to work out themselves. */
  perCheckPrice?: string
  /** Must exactly match one entry in `features` — that line is bolded so the
   *  one thing this tier adds over the one below it is scannable at a glance. */
  highlightFeature?: string
}
