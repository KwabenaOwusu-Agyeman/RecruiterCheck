import 'server-only'
import { available, median, rate, unavailable, type Metric } from '@/lib/metric'
import type { Window } from '@/lib/time'
import type { Db } from '../supabase'
import { ISO, ROW_CAP, countOf, readRows } from './primitives'

// Marketing metrics.
//
// One rule shapes every figure here. Acquisition data exists only from the day
// the attribution migration shipped, so a channel breakdown covering an earlier
// period is not "zero", it is "not recorded". Every screen states the date the
// data begins rather than implying the whole history is covered.
//
// A second rule, carried over from overview.ts: nothing that cannot be
// calculated is rendered as a zero.
//
// `domain_category` is deliberately absent from this module. It is written only
// on the URL-extract FAILURE path (NewCheckPage.tsx:268, never on the success
// path at 264), and the browser extension writes a different, narrower
// vocabulary into the same column. Its distribution is therefore a distribution
// of extraction failures across two incompatible enums. Charting it would
// produce a confident, wrong answer to "which job boards do our users use".

export interface Breakdown {
  label: string
  count: number
  share: number
}

/** Groups rows by a field, largest first, with nulls collected as one bucket. */
function groupBy<T>(
  rows: readonly T[],
  pick: (row: T) => string | null,
  nullLabel: string,
): Breakdown[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = pick(row) ?? nullLabel
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const total = rows.length
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, share: total === 0 ? 0 : (count / total) * 100 }))
    .sort((a, b) => b.count - a.count)
}

// --- acquisition -------------------------------------------------------------

export interface AcquisitionData {
  /** When attribution began, so a sparse period can be read correctly. */
  attributionStartedAt: string | null
  signupsInPeriod: Metric
  attributedSignups: Metric
  attributionCoverage: Metric
  bySource: Breakdown[]
  byMedium: Breakdown[]
  byCampaign: Breakdown[]
  byReferrer: Breakdown[]
  byLandingPath: Breakdown[]
  error: string | null
}

interface ProfileAttributionRow {
  id: string
  created_at: string
  acquisition_source: string | null
  acquisition_medium: string | null
  acquisition_campaign: string | null
  acquisition_referrer_host: string | null
  acquisition_landing_path: string | null
  acquisition_captured_at: string | null
}

export async function loadAcquisition(db: Db, w: Window): Promise<AcquisitionData> {
  const empty = (error: string | null): AcquisitionData => ({
    attributionStartedAt: null,
    signupsInPeriod: unavailable(error ?? 'not loaded'),
    attributedSignups: unavailable(error ?? 'not loaded'),
    attributionCoverage: unavailable(error ?? 'not loaded'),
    bySource: [],
    byMedium: [],
    byCampaign: [],
    byReferrer: [],
    byLandingPath: [],
    error,
  })

  // The earliest attributed profile, which is when this data starts being
  // meaningful at all.
  const earliest = await db
    .from('profiles')
    .select('acquisition_captured_at')
    .not('acquisition_captured_at', 'is', null)
    .order('acquisition_captured_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const rows = await readRows<ProfileAttributionRow>(
    db
      .from('profiles')
      .select(
        'id, created_at, acquisition_source, acquisition_medium, acquisition_campaign, acquisition_referrer_host, acquisition_landing_path, acquisition_captured_at',
      )
      .gte('created_at', ISO(w.from))
      .lt('created_at', ISO(w.to))
      .limit(ROW_CAP),
  )
  if (!rows.ok) return empty(rows.reason)

  const signups = rows.rows
  const attributed = signups.filter((r) => r.acquisition_captured_at !== null)

  return {
    attributionStartedAt: earliest.data?.acquisition_captured_at ?? null,
    signupsInPeriod: available(signups.length),
    attributedSignups: available(attributed.length),
    attributionCoverage: rate(
      attributed.length,
      signups.length,
      'no accounts were created in this period',
    ),
    // Grouped over attributed rows only. Mixing in unattributed signups would
    // put a large "unknown" bar beside the real channels and make every share
    // meaningless; the coverage figure above reports that honestly instead.
    bySource: groupBy(attributed, (r) => r.acquisition_source, 'direct'),
    byMedium: groupBy(attributed, (r) => r.acquisition_medium, 'none'),
    byCampaign: groupBy(attributed, (r) => r.acquisition_campaign, 'none'),
    byReferrer: groupBy(attributed, (r) => r.acquisition_referrer_host, 'direct'),
    byLandingPath: groupBy(attributed, (r) => r.acquisition_landing_path, 'unknown'),
    error: null,
  }
}

// --- content -----------------------------------------------------------------

export interface ContentData {
  landingViews: Metric
  landingViewsWithPage: Metric
  byPage: Breakdown[]
  byEventType: Breakdown[]
  checksCompleted: Metric
  accountsWithCompletedCheck: Metric
  rolesCovered: Metric
  rerunPairs: Metric
  avgRerunScoreDelta: Metric
  medianMinutesToVerdict: Metric
  error: string | null
}

interface EventRow {
  event_type: string
  page_path: string | null
}

interface CompletedCheckRow {
  user_id: string
  job_title: string | null
  interview_probability_score: number | null
  created_at: string
  // A to-one relationship, not an array: check_score_audits.check_id is
  // unique, so one check has at most one audit row.
  check_score_audits: { calculated_at: string } | null
}

export async function loadContent(db: Db, w: Window): Promise<ContentData> {
  const events = await readRows<EventRow>(
    db
      .from('analytics_events')
      .select('event_type, page_path')
      .gte('created_at', ISO(w.from))
      .lt('created_at', ISO(w.to))
      .limit(ROW_CAP),
  )

  // Completed checks in the window, with their audit row for the true
  // completion time. checks.updated_at cannot be used: the 24 hour upload purge
  // rewrites it, so for any check older than a day it records the purge rather
  // than the completion. The original landing_stats function used updated_at
  // for exactly this figure, which is why that part is not reused verbatim.
  const checks = await readRows<CompletedCheckRow>(
    db
      .from('checks')
      .select('user_id, job_title, interview_probability_score, created_at, check_score_audits(calculated_at)')
      .eq('status', 'completed')
      .gte('created_at', ISO(w.from))
      .lt('created_at', ISO(w.to))
      .limit(ROW_CAP),
  )

  const base: ContentData = {
    landingViews: unavailable('not loaded'),
    landingViewsWithPage: unavailable('not loaded'),
    byPage: [],
    byEventType: [],
    checksCompleted: unavailable('not loaded'),
    accountsWithCompletedCheck: unavailable('not loaded'),
    rolesCovered: unavailable('not loaded'),
    rerunPairs: unavailable('not loaded'),
    avgRerunScoreDelta: unavailable('not loaded'),
    medianMinutesToVerdict: unavailable('not loaded'),
    error: null,
  }

  if (!events.ok) return { ...base, error: events.reason }
  if (!checks.ok) return { ...base, error: checks.reason }

  const landing = events.rows.filter((e) => e.event_type === 'landing_view')
  const landingWithPage = landing.filter((e) => e.page_path !== null)

  // Score movement between a user's first and latest completed check against
  // the same job title: the closest queryable proxy for "checked, fixed the CV,
  // checked again". Recovered from the removed get_landing_stats function.
  const byUserRole = new Map<string, { score: number; at: number }[]>()
  for (const row of checks.rows) {
    if (row.interview_probability_score === null || !row.job_title) continue
    const key = `${row.user_id}::${row.job_title.toLowerCase()}`
    const list = byUserRole.get(key) ?? []
    list.push({ score: row.interview_probability_score, at: new Date(row.created_at).getTime() })
    byUserRole.set(key, list)
  }

  const deltas: number[] = []
  for (const list of byUserRole.values()) {
    if (list.length < 2) continue
    const sorted = [...list].sort((a, b) => a.at - b.at)
    deltas.push(sorted[sorted.length - 1].score - sorted[0].score)
  }

  const durations = checks.rows
    .map((row) => {
      const calculated = row.check_score_audits?.calculated_at
      if (!calculated) return null
      const minutes =
        (new Date(calculated).getTime() - new Date(row.created_at).getTime()) / 60_000
      return Number.isFinite(minutes) && minutes >= 0 ? minutes : null
    })
    .filter((v): v is number => v !== null)

  return {
    landingViews: available(landing.length),
    landingViewsWithPage: available(landingWithPage.length),
    byPage: groupBy(landingWithPage, (e) => e.page_path, 'unknown'),
    byEventType: groupBy(events.rows, (e) => e.event_type, 'unknown'),
    checksCompleted: available(checks.rows.length),
    accountsWithCompletedCheck: available(new Set(checks.rows.map((r) => r.user_id)).size),
    rolesCovered: available(
      new Set(
        checks.rows
          .map((r) => r.job_title?.toLowerCase())
          .filter((t): t is string => Boolean(t)),
      ).size,
    ),
    rerunPairs: available(deltas.length),
    avgRerunScoreDelta:
      deltas.length === 0
        ? unavailable('no user has run two checks against the same role in this period')
        : available(deltas.reduce((sum, d) => sum + d, 0) / deltas.length),
    medianMinutesToVerdict: median(
      durations,
      'no completed check in this period has a recorded completion time (audits begin 2026-08-26)',
    ),
    error: null,
  }
}

// --- audience ----------------------------------------------------------------

export interface AudienceData {
  newsletterTotal: Metric
  newsletterActive: Metric
  newsletterUnsubscribed: Metric
  newsletterJoinedInPeriod: Metric
  byConsentSource: Breakdown[]
  testimonials: Metric
  averageRating: Metric
  ratingDistribution: Breakdown[]
  sentimentPositive: Metric
  sentimentNegative: Metric
  trustpilotInvites: Metric
  error: string | null
}

interface SubscriberRow {
  status: string
  consent_source: string
  consent_at: string
}

interface FeedbackRow {
  rating: number
  feature_consent: boolean
  created_at: string
}

export async function loadAudience(db: Db, w: Window): Promise<AudienceData> {
  const subscribers = await readRows<SubscriberRow>(
    db.from('newsletter_subscribers').select('status, consent_source, consent_at').limit(ROW_CAP),
  )
  const feedback = await readRows<FeedbackRow>(
    db
      .from('product_feedback')
      .select('rating, feature_consent, created_at')
      .gte('created_at', ISO(w.from))
      .lt('created_at', ISO(w.to))
      .limit(ROW_CAP),
  )

  const [positive, negative, invites] = await Promise.all([
    countOf(
      db
        .from('check_sentiment')
        .select('check_id', { count: 'exact', head: true })
        .eq('sentiment', 'positive')
        .gte('created_at', ISO(w.from))
        .lt('created_at', ISO(w.to)),
    ),
    countOf(
      db
        .from('check_sentiment')
        .select('check_id', { count: 'exact', head: true })
        .eq('sentiment', 'negative')
        .gte('created_at', ISO(w.from))
        .lt('created_at', ISO(w.to)),
    ),
    // Invitations SENT, not reviews received. Trustpilot owns whether anyone
    // actually left a review; nothing about that reaches this database.
    countOf(
      db
        .from('checks')
        .select('id', { count: 'exact', head: true })
        .not('trustpilot_notified_at', 'is', null)
        .gte('trustpilot_notified_at', ISO(w.from))
        .lt('trustpilot_notified_at', ISO(w.to)),
    ),
  ])

  const subsFailed = !subscribers.ok ? subscribers.reason : null
  const feedbackFailed = !feedback.ok ? feedback.reason : null

  const subs = subscribers.ok ? subscribers.rows : []
  const fb = feedback.ok ? feedback.rows : []
  const ratings = fb.map((f) => f.rating).filter((r) => typeof r === 'number')

  return {
    // The list is a lifetime total, not scoped to the period: it is a current
    // audience size, and scoping it to a window would answer a different
    // question than the one the card asks.
    newsletterTotal: subsFailed ? unavailable(subsFailed) : available(subs.length),
    newsletterActive: subsFailed
      ? unavailable(subsFailed)
      : available(subs.filter((s) => s.status === 'active').length),
    newsletterUnsubscribed: subsFailed
      ? unavailable(subsFailed)
      : available(subs.filter((s) => s.status === 'unsubscribed').length),
    newsletterJoinedInPeriod: subsFailed
      ? unavailable(subsFailed)
      : available(
          subs.filter((s) => {
            const at = new Date(s.consent_at).getTime()
            return at >= w.from.getTime() && at < w.to.getTime()
          }).length,
        ),
    byConsentSource: groupBy(subs, (s) => s.consent_source, 'unknown'),
    testimonials: feedbackFailed ? unavailable(feedbackFailed) : available(fb.length),
    averageRating:
      ratings.length === 0
        ? unavailable('no feedback was submitted in this period')
        : available(ratings.reduce((sum, r) => sum + r, 0) / ratings.length),
    ratingDistribution: groupBy(fb, (f) => `${f.rating} star`, 'unrated'),
    sentimentPositive: positive,
    sentimentNegative: negative,
    trustpilotInvites: invites,
    error: subsFailed ?? feedbackFailed,
  }
}
