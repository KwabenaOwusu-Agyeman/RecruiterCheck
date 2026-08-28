import { supabase } from '@/lib/supabase'

export type AnalyticsEventType =
  | 'job_input_paste_selected'
  | 'job_input_url_selected'
  | 'job_input_upload_selected'
  | 'job_input_url_extract_succeeded'
  | 'job_input_url_extract_failed'
  | 'extension_opened_new_check'
  | 'landing_view'
  | 'signup_started'
  | 'signup_completed'
  | 'new_check_opened'
  | 'check_submitted'
  | 'feedback_viewed'
  | 'referral_shared'
  | 'recruiter_recommendation_accessed'
  | 'checkout_started'
  | 'purchase_completed'
  | 'refund_requested'
  | 'check_sentiment_positive'
  | 'check_sentiment_negative'
  | 'keyword_scan_completed'
  | 'trustpilot_footer_clicked'
  | 'trustpilot_results_clicked'
  | 'pricing_viewed'
  | 'testimonial_submitted'

export type DomainCategory = 'linkedin' | 'indeed' | 'greenhouse' | 'lever' | 'workday' | 'other'

const DOMAIN_PATTERNS: [RegExp, DomainCategory][] = [
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)indeed\.com$/, 'indeed'],
  [/(^|\.)greenhouse\.io$/, 'greenhouse'],
  [/(^|\.)lever\.co$/, 'lever'],
  [/(^|\.)myworkdayjobs\.com$/, 'workday'],
]

// Buckets a URL into a coarse category for measurement without ever
// persisting the URL itself.
export function categorizeUrlDomain(rawUrl: string): DomainCategory {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase()
    for (const [pattern, category] of DOMAIN_PATTERNS) {
      if (pattern.test(hostname)) return category
    }
  } catch {
    // fall through to 'other'
  }
  return 'other'
}

// myrecruitercheck.com / www.myrecruitercheck.com only — every other
// hostname (localhost, a Vercel preview alias, etc.) is treated as
// non-production for diagnostic purposes. Vite bakes import.meta.env.PROD
// as true for every `vite build`, including preview deployments, so it
// can't tell preview and production apart on its own; the hostname can.
const PRODUCTION_HOSTNAMES = new Set(['myrecruitercheck.com', 'www.myrecruitercheck.com'])

function diagnosticsEnabled(): boolean {
  if (import.meta.env.DEV) return true
  return typeof window !== 'undefined' && !PRODUCTION_HOSTNAMES.has(window.location.hostname)
}

// Fire-and-forget: never blocks or throws into the caller, since analytics
// must not affect the user-facing flow. The Postgrest query builder
// supabase-js returns is a lazy "thenable" — it does not perform any
// network request until something actually calls .then()/.catch() on it
// (via await or otherwise). A bare `void supabase.from(...).insert(...)`
// only constructs the builder and discards it, so it silently never sends
// the request. Chaining .then() here is what makes the insert actually
// fire, while still not awaiting or throwing into the caller.
export function trackEvent(eventType: AnalyticsEventType, domainCategory?: DomainCategory): void {
  supabase
    .from('analytics_events')
    .insert({ event_type: eventType, domain_category: domainCategory ?? null })
    .then(({ error }) => {
      if (error && diagnosticsEnabled()) {
        // Never the payload/row itself — only the event name and Postgrest's
        // own error message (a fixed constraint/policy description, never
        // user data), and only outside real production.
        console.warn(`[analytics] "${eventType}" insert failed:`, error.message)
      }
    })
}
