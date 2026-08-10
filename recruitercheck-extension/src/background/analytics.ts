import { supabase } from '@/background/supabaseClient'
import type { SourceDomain } from '@/shared/types'

export type AnalyticsEventType =
  | 'extension_capture_started'
  | 'extension_capture_success'
  | 'extension_capture_failed'
  | 'extension_capture_confirmed'

// Writes to the same analytics_events table as the web app (src/lib/
// analytics.ts) — same RLS policy, same shape. Never sends job-description
// contents, CV contents, full URLs, or tokens; only the event type and a
// coarse source-domain bucket.
export function trackEvent(eventType: AnalyticsEventType, domainCategory?: SourceDomain): void {
  void supabase.from('analytics_events').insert({ event_type: eventType, domain_category: domainCategory ?? null })
}
