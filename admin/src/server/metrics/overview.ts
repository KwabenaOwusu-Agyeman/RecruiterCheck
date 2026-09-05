import 'server-only'
import { available, median, rate, unavailable, type Metric } from '@/lib/metric'
import type { ResolvedPeriod, Window } from '@/lib/time'
import type { Db } from '../supabase'
import { ISO, ROW_CAP, countOf, countRows, readRows, sumOf } from './primitives'

// Every dashboard figure is defined here, once, with its source.
//
// Definitions worth stating up front, because they are the ones that could
// reasonably have been chosen differently:
//
// COHORT BASIS. "Checks completed" counts checks CREATED in the window that
// have since completed, not checks that completed during it. This makes
// completion rate a coherent fraction of a single population rather than a
// ratio of two different ones. The cost is that today's figure understates,
// because checks created this morning may still be running; the UI says so.
//
// COMPLETION TIME comes from check_score_audits.calculated_at, which is written
// once when analysis finishes and never updated. checks.updated_at cannot be
// used: the 24 hour upload purge rewrites it, so for any check older than a day
// it records the purge, not the completion. That would have produced a
// processing-time figure that looked reasonable and was entirely wrong.
// check_score_audits begins on 2026-08-26, so timings before that do not exist.
//
// REVENUE is grouped by currency and never summed across currencies. Stripe
// remains authoritative; these are the application's own verified purchase
// records, and where the two disagree the Payments screen shows a
// reconciliation warning rather than silently preferring one.

/** How long a check may sit in 'processing' before it is considered stuck. */
export const STUCK_AFTER_MINUTES = 12
/** How long a draft may sit before it counts as abandoned rather than in progress. */
export const ABANDONED_AFTER_MINUTES = 60

export interface MetricPair {
  current: Metric
  previous: Metric | null
}

export interface CurrencyTotal {
  currency: string
  minorUnits: number
}

export interface FunnelStage {
  label: string
  value: number
}

export interface OverviewData {
  newUsers: MetricPair
  activeUsers: MetricPair
  checksStarted: MetricPair
  checksCompleted: MetricPair
  checksFailed: MetricPair
  checksAbandoned: MetricPair
  completionRate: MetricPair
  medianProcessingSeconds: MetricPair
  purchases: MetricPair
  refunds: MetricPair
  creditsSold: MetricPair
  creditsConsumed: MetricPair
  creditsExpired: MetricPair
  freeToPaidConversion: MetricPair
  revenue: { current: CurrencyTotal[]; previous: CurrencyTotal[]; error: string | null }
  checksProcessingNow: Metric
  checksStuck: Metric
  funnel: FunnelStage[] | null
  generatedAt: string
}

// --- individual metrics ------------------------------------------------------

/**
 * New users: rows in auth.users created within the window.
 * Source: admin_auth_user_summary.created_at (the signup instant).
 */
async function newUsers(db: Db, w: Window): Promise<Metric> {
  return countOf(
    db
      .from('admin_auth_user_summary')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', ISO(w.from))
      .lt('created_at', ISO(w.to)),
  )
}

/**
 * Active users: accounts whose LAST sign-in falls in the window.
 *
 * Only correct for a trailing window that ends now. auth.users stores a single
 * last_sign_in_at rather than a sign-in history, so for a window that ended in
 * the past this would count only users who have not signed in since, which is
 * not "active users" at all. Historical windows therefore report unavailable
 * instead of a wrong number.
 */
async function activeUsers(db: Db, w: Window, isTrailingWindow: boolean): Promise<Metric> {
  if (!isTrailingWindow) {
    return unavailable(
      'auth.users records only the most recent sign-in, so active users cannot be reconstructed for a past window. Logging sign-in events would fix this.',
    )
  }
  return countOf(
    db
      .from('admin_auth_user_summary')
      .select('*', { count: 'exact', head: true })
      .gte('last_sign_in_at', ISO(w.from))
      .lt('last_sign_in_at', ISO(w.to)),
  )
}

/** Checks started: rows in checks created within the window, any status. */
async function checksStarted(db: Db, w: Window): Promise<Metric> {
  return countOf(
    db
      .from('checks')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', ISO(w.from))
      .lt('created_at', ISO(w.to)),
  )
}

/** Checks created in the window now holding the given status (cohort basis). */
async function checksByStatus(
  db: Db,
  w: Window,
  status: 'completed' | 'failed' | 'draft' | 'processing',
): Promise<Metric> {
  return countOf(
    db
      .from('checks')
      .select('*', { count: 'exact', head: true })
      .eq('status', status)
      .gte('created_at', ISO(w.from))
      .lt('created_at', ISO(w.to)),
  )
}

/**
 * Abandoned: a draft that was created in the window and is old enough that the
 * user is not still filling it in. A draft from ten minutes ago is in progress,
 * not abandoned, so counting every draft would overstate abandonment badly on
 * the current day.
 */
async function checksAbandoned(db: Db, w: Window, now: Date): Promise<Metric> {
  const cutoff = new Date(now.getTime() - ABANDONED_AFTER_MINUTES * 60_000)
  return countOf(
    db
      .from('checks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'draft')
      .gte('created_at', ISO(w.from))
      .lt('created_at', ISO(w.to))
      .lt('created_at', ISO(cutoff)),
  )
}

/**
 * Median seconds from check creation to analysis completion.
 * Median rather than mean: one stuck job must not make a normal day look slow.
 */
async function medianProcessingSeconds(db: Db, w: Window): Promise<Metric> {
  const rows = await readRows<{ calculated_at: string; checks: { created_at: string } | null }>(
    db
      .from('check_score_audits')
      .select('calculated_at, checks!inner(created_at)')
      .gte('checks.created_at', ISO(w.from))
      .lt('checks.created_at', ISO(w.to))
      .limit(ROW_CAP),
  )
  if (!rows.ok) return unavailable(rows.reason)

  const durations = rows.rows
    .map((row) => {
      if (!row.checks?.created_at) return null
      const seconds =
        (new Date(row.calculated_at).getTime() - new Date(row.checks.created_at).getTime()) / 1000
      return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
    })
    .filter((v): v is number => v !== null)

  return median(
    durations,
    'no check completed in this period has a recorded completion time (audits begin 2026-08-26)',
  )
}

/** Verified purchases: credit_batches rows with source purchase, by paid_at. */
async function purchases(db: Db, w: Window): Promise<Metric> {
  return countOf(
    db
      .from('credit_batches')
      .select('*', { count: 'exact', head: true })
      .eq('source', 'purchase')
      .gte('paid_at', ISO(w.from))
      .lt('paid_at', ISO(w.to)),
  )
}

/** Succeeded refunds, by the instant they were finalised. */
async function refunds(db: Db, w: Window): Promise<Metric> {
  return countOf(
    db
      .from('refund_events')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'succeeded')
      .gte('finalized_at', ISO(w.from))
      .lt('finalized_at', ISO(w.to)),
  )
}

/** Check credits granted by purchases paid for in the window. */
async function creditsSold(db: Db, w: Window): Promise<Metric> {
  const rows = await readRows<{ checks_granted: number }>(
    db
      .from('credit_batches')
      .select('checks_granted')
      .eq('source', 'purchase')
      .gte('paid_at', ISO(w.from))
      .lt('paid_at', ISO(w.to))
      .limit(ROW_CAP),
  )
  return sumOf(rows, (r) => r.checks_granted)
}

/**
 * Ledger movement of check credits in the window.
 * Amounts are signed deltas, so consumption and expiry are negative; both are
 * reported as positive magnitudes.
 */
async function ledgerMagnitude(
  db: Db,
  w: Window,
  entryType: 'used' | 'expired',
): Promise<Metric> {
  const rows = await readRows<{ amount: number }>(
    db
      .from('check_ledger')
      .select('amount')
      .eq('entry_type', entryType)
      .eq('credit_type', 'check')
      .gte('created_at', ISO(w.from))
      .lt('created_at', ISO(w.to))
      .limit(ROW_CAP),
  )
  const total = sumOf(rows, (r) => r.amount)
  return total.available ? available(Math.abs(total.value)) : total
}

/**
 * Revenue, grouped by currency and never summed across them.
 * Gross purchase amounts minus refunds that succeeded in the same window.
 * Amounts stay in Stripe's minor units (cents) until formatted.
 */
async function revenueByCurrency(
  db: Db,
  w: Window,
): Promise<{ totals: CurrencyTotal[]; error: string | null }> {
  const paid = await readRows<{ amount_paid: number | null; currency: string | null; id: string }>(
    db
      .from('credit_batches')
      .select('id, amount_paid, currency')
      .eq('source', 'purchase')
      .gte('paid_at', ISO(w.from))
      .lt('paid_at', ISO(w.to))
      .limit(ROW_CAP),
  )
  if (!paid.ok) return { totals: [], error: paid.reason }

  const byCurrency = new Map<string, number>()
  for (const row of paid.rows) {
    if (typeof row.amount_paid !== 'number' || !row.currency) continue
    const key = row.currency.toUpperCase()
    byCurrency.set(key, (byCurrency.get(key) ?? 0) + row.amount_paid)
  }

  // Subtract refunds finalised in the same window, matched back to the batch
  // they reverse so the currency is the batch's own.
  const refunded = await readRows<{
    batch_id: string
    credit_batches: { amount_paid: number | null; currency: string | null } | null
  }>(
    db
      .from('refund_events')
      .select('batch_id, credit_batches!inner(amount_paid, currency)')
      .eq('status', 'succeeded')
      .gte('finalized_at', ISO(w.from))
      .lt('finalized_at', ISO(w.to))
      .limit(ROW_CAP),
  )
  if (!refunded.ok) return { totals: [], error: refunded.reason }

  for (const row of refunded.rows) {
    const batch = row.credit_batches
    if (!batch || typeof batch.amount_paid !== 'number' || !batch.currency) continue
    const key = batch.currency.toUpperCase()
    byCurrency.set(key, (byCurrency.get(key) ?? 0) - batch.amount_paid)
  }

  const totals = [...byCurrency.entries()]
    .map(([currency, minorUnits]) => ({ currency, minorUnits }))
    .sort((a, b) => b.minorUnits - a.minorUnits)

  return { totals, error: null }
}

/**
 * Free to paid conversion: of the accounts created in the window, the share
 * that has since made at least one verified purchase.
 *
 * Cohort basis, and deliberately built from profiles and credit_batches rather
 * than from analytics_events: purchase records are the source of truth for
 * whether money changed hands.
 */
async function freeToPaidConversion(
  db: Db,
  w: Window,
): Promise<{ metric: Metric; funnel: FunnelStage[] | null }> {
  // Postgres cannot prove NOT NULL through a view, so every column of
  // admin_auth_user_summary is typed nullable. Rows without an id are dropped
  // rather than coerced, since a null id cannot be matched to anything.
  const signups = await readRows<{ id: string | null }>(
    db
      .from('admin_auth_user_summary')
      .select('id')
      .gte('created_at', ISO(w.from))
      .lt('created_at', ISO(w.to))
      .limit(ROW_CAP),
  )
  if (!signups.ok) return { metric: unavailable(signups.reason), funnel: null }

  const ids = signups.rows.map((r) => r.id).filter((id): id is string => id !== null)
  if (ids.length === 0) {
    return {
      metric: unavailable('no accounts were created in this period'),
      funnel: null,
    }
  }

  const checkRows = await readRows<{ user_id: string; status: string }>(
    db.from('checks').select('user_id, status').in('user_id', ids).limit(ROW_CAP),
  )
  const purchaseRows = await readRows<{ user_id: string }>(
    db
      .from('credit_batches')
      .select('user_id')
      .eq('source', 'purchase')
      .in('user_id', ids)
      .limit(ROW_CAP),
  )
  if (!checkRows.ok) return { metric: unavailable(checkRows.reason), funnel: null }
  if (!purchaseRows.ok) return { metric: unavailable(purchaseRows.reason), funnel: null }

  const started = new Set(checkRows.rows.map((r) => r.user_id))
  const completed = new Set(
    checkRows.rows.filter((r) => r.status === 'completed').map((r) => r.user_id),
  )
  const paid = new Set(purchaseRows.rows.map((r) => r.user_id))

  return {
    metric: rate(paid.size, ids.length, 'no accounts were created in this period'),
    funnel: [
      { label: 'Signed up', value: ids.length },
      { label: 'Started a check', value: started.size },
      { label: 'Completed a check', value: completed.size },
      { label: 'Purchased', value: paid.size },
    ],
  }
}

/** Checks in 'processing' right now, and those past the stuck threshold. */
async function processingNow(db: Db, now: Date): Promise<{ all: Metric; stuck: Metric }> {
  const cutoff = new Date(now.getTime() - STUCK_AFTER_MINUTES * 60_000)
  const all = await countOf(
    db.from('checks').select('*', { count: 'exact', head: true }).eq('status', 'processing'),
  )
  // Past this point sweep_stale_processing_checks should already have failed
  // them, so anything here is a gap in that sweeper, not normal latency.
  const stuck = await countOf(
    db
      .from('checks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'processing')
      .lt('created_at', ISO(cutoff)),
  )
  return { all, stuck }
}

// --- assembly ----------------------------------------------------------------

async function forWindow(db: Db, w: Window, now: Date, isTrailing: boolean) {
  const [
    users,
    active,
    started,
    completed,
    failed,
    abandoned,
    processing,
    purchaseCount,
    refundCount,
    sold,
    consumed,
    expired,
    conversion,
    revenue,
  ] = await Promise.all([
    newUsers(db, w),
    activeUsers(db, w, isTrailing),
    checksStarted(db, w),
    checksByStatus(db, w, 'completed'),
    checksByStatus(db, w, 'failed'),
    checksAbandoned(db, w, now),
    medianProcessingSeconds(db, w),
    purchases(db, w),
    refunds(db, w),
    creditsSold(db, w),
    ledgerMagnitude(db, w, 'used'),
    ledgerMagnitude(db, w, 'expired'),
    freeToPaidConversion(db, w),
    revenueByCurrency(db, w),
  ])

  // Completion rate is a fraction of one settled population: the checks
  // created in this window that have reached a terminal state.
  const settled =
    completed.available && failed.available && abandoned.available
      ? completed.value + failed.value + abandoned.value
      : null

  const completionRate =
    settled === null
      ? unavailable('the underlying check counts could not be read')
      : rate(
          completed.available ? completed.value : 0,
          settled,
          'no check created in this period has finished yet',
        )

  return {
    users,
    active,
    started,
    completed,
    failed,
    abandoned,
    processing,
    purchaseCount,
    refundCount,
    sold,
    consumed,
    expired,
    conversion,
    revenue,
    completionRate,
  }
}

export async function loadOverview(
  db: Db,
  period: ResolvedPeriod,
  now: Date,
): Promise<OverviewData> {
  const current = await forWindow(db, period, now, true)
  // A previous window never ends at "now", so trailing-only metrics such as
  // active users correctly report unavailable there.
  const previous = period.previous
    ? await forWindow(db, period.previous, now, false)
    : null
  const live = await processingNow(db, now)

  const pair = (
    pick: (w: Awaited<ReturnType<typeof forWindow>>) => Metric,
  ): MetricPair => ({
    current: pick(current),
    previous: previous ? pick(previous) : null,
  })

  return {
    newUsers: pair((w) => w.users),
    activeUsers: pair((w) => w.active),
    checksStarted: pair((w) => w.started),
    checksCompleted: pair((w) => w.completed),
    checksFailed: pair((w) => w.failed),
    checksAbandoned: pair((w) => w.abandoned),
    completionRate: pair((w) => w.completionRate),
    medianProcessingSeconds: pair((w) => w.processing),
    purchases: pair((w) => w.purchaseCount),
    refunds: pair((w) => w.refundCount),
    creditsSold: pair((w) => w.sold),
    creditsConsumed: pair((w) => w.consumed),
    creditsExpired: pair((w) => w.expired),
    freeToPaidConversion: pair((w) => w.conversion.metric),
    revenue: {
      current: current.revenue.totals,
      previous: previous?.revenue.totals ?? [],
      error: current.revenue.error,
    },
    checksProcessingNow: live.all,
    checksStuck: live.stuck,
    funnel: current.conversion.funnel,
    generatedAt: now.toISOString(),
  }
}

export { countRows }
