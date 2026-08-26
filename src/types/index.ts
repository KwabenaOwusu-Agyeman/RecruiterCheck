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
  // Idempotency marker for the welcome email (send-welcome-email edge
  // function) — null until it has been sent once. Not read anywhere in the
  // frontend today; kept on this type only so it isn't silently dropped by
  // any future `select('*')`-based profile mapping.
  welcome_email_sent_at: string | null
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

// Private, internal identifiers only — never shown to a user. These are the
// literal values already threaded through Stripe metadata, credit_batches.pack_id,
// and checks.funding_pack_id; renaming them would require a data migration
// with no product benefit. Every user facing surface must go through
// PACK_DISPLAY_NAMES/getPackDisplayName in constants.ts (Starter/Active/Power),
// never compare against or render these strings directly.
export type PackId = 'small' | 'medium' | 'large'

// Which pack's credit batch funded this check (see complete_check_analysis,
// migration add_check_funding_pack_tier) — null means it was funded by the
// free lifetime check, which is NOT entitled to any generated document (score
// + feedback only). Every paid pack (small/medium/large — Starter/Active/Power)
// includes the Improved CV Draft; only large (Power) additionally includes the
// Cover Letter and Recruiter Message. See getDocumentEntitlement in
// supabase/functions/generate-documents/logic.ts for the authoritative rule,
// also layered with the check's score group.
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
