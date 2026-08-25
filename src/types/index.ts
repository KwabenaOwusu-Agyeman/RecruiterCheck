export type CheckStatus = 'draft' | 'processing' | 'completed' | 'failed'
export type OutputLanguage = 'auto' | 'en' | 'nl'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  // Durable usage counters — the authoritative source of truth for
  // allowance checks, never derived by counting `checks` rows, and never
  // decremented by deleting a check. lifetime_checks_consumed tracks the
  // free tier's single lifetime check; checks_balance tracks purchased
  // check-pack credits, drawn down earliest-expiring-batch-first (see
  // migration 20260825120000_check_pack_system.sql). Order of funding is
  // always: free lifetime check first, then checks_balance.
  lifetime_checks_consumed: number
  checks_balance: number
  keyword_scans_consumed: number
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
  funding_pack_id: FundingPackId
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

export type PackId = 'small' | 'medium' | 'large'

// Which pack's credit batch funded this check (see complete_check_analysis,
// migration add_check_funding_pack_tier) — null means it was funded by the
// free lifetime check, treated the same as 'small' for document
// entitlement (score + feedback only, no generated documents).
export type FundingPackId = PackId | null

export interface CheckPack {
  id: PackId
  name: string
  price: string
  checks: number
  description: string
  /** What a check from this pack unlocks — differs per pack (see
   *  generate-documents' entitlement gate, keyed on the same pack id). */
  features: string[]
  badge?: string
  highlighted?: boolean
}

export interface CreditBatch {
  id: string
  user_id: string
  source: 'purchase' | 'manual_grant'
  checks_granted: number
  checks_remaining: number
  stripe_payment_intent_id: string | null
  pack_id: PackId | null
  granted_at: string
  expires_at: string | null
}

export type LedgerEntryType = 'purchased' | 'used' | 'refunded' | 'expired' | 'manual_adjustment'

export interface CheckLedgerEntry {
  id: number
  user_id: string
  batch_id: string | null
  entry_type: LedgerEntryType
  amount: number
  related_check_id: string | null
  created_at: string
}

export interface KeywordScanResult {
  matchPercent: number
  matched: string[]
  missing: string[]
  matchedTotal: number
  missingTotal: number
}
