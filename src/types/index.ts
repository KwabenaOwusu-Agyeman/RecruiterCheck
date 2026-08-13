export type SubscriptionTier = 'free' | 'premium_weekly' | 'premium_monthly'
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
  // Durable usage counters (see migration durable_usage_counters) — the
  // authoritative source of truth for allowance checks, never derived by
  // counting `checks` rows, and never decremented by deleting a check.
  lifetime_checks_consumed: number
  daily_checks_consumed: number
  daily_checks_reset_at: string | null
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
  plan: 'premium_weekly' | 'premium_monthly'
  status: SubscriptionStatus
  current_period_end: string | null
  created_at: string
}

export interface ProductFeedback {
  id: string
  user_id: string
  email: string
  check_id: string | null
  display_name: string | null
  target_role: string | null
  rating: number
  comment: string | null
  feature_consent: boolean
  feature_consent_at: string | null
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
}
