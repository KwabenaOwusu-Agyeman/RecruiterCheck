import { supabase } from '@/lib/supabase'

export type AnalyticsEventType =
  | 'job_input_paste_selected'
  | 'job_input_url_selected'
  | 'job_input_upload_selected'
  | 'job_input_url_extract_succeeded'
  | 'job_input_url_extract_failed'
  | 'extension_opened_new_check'

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

// Fire-and-forget: never blocks or throws into the caller, since analytics
// must not affect the user-facing flow.
export function trackEvent(eventType: AnalyticsEventType, domainCategory?: DomainCategory): void {
  void supabase
    .from('analytics_events')
    .insert({ event_type: eventType, domain_category: domainCategory ?? null })
}
