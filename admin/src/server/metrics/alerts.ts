import 'server-only'
import type { Db } from '../supabase'
import { ISO } from './primitives'

// Operational alerts, derived entirely from state the system already persists.
//
// No new logging pipeline is introduced: instrumenting every Edge Function
// would mean changing production code paths that currently work, which is a
// far larger risk than this dashboard is worth. What that costs is visibility
// into model-provider errors, which live only in Supabase's function logs; the
// System Health screen in a later phase is where that gap gets addressed.

export type AlertSeverity = 'critical' | 'warning' | 'info'

/**
 * A count that distinguishes "none" from "could not tell".
 *
 * `count ?? 0` on a failed query reports zero, which on an alerts panel reads
 * as "everything is fine" when the truth is "nothing was checked". That is the
 * single most dangerous way for this screen to be wrong, so a failure becomes
 * its own alert.
 */
async function countOrAlert(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  service: string,
): Promise<{ count: number } | { failure: SystemAlert }> {
  const { count, error } = await query
  if (error) {
    return {
      failure: {
        id: `check-failed-${service.toLowerCase().replace(/\s+/g, '-')}`,
        severity: 'warning',
        service,
        title: 'This check could not run',
        detail: `The dashboard could not query for this condition, so it is unknown rather than clear: ${error.message}`,
        count: 0,
      },
    }
  }
  return { count: count ?? 0 }
}

/** A Sunday job plus a day of slack, so a late run is not an alert. */
const NEWSLETTER_SILENT_DAYS = 9

export interface SystemAlert {
  id: string
  severity: AlertSeverity
  service: string
  title: string
  detail: string
  count: number
  /** Where the operator should go to act on it. */
  href?: string
}

/** Checks stuck in processing past the point the sweeper should have caught them. */
const STUCK_MINUTES = 12
/** How long a refund may sit pending before it is considered ambiguous. */
const AMBIGUOUS_REFUND_MINUTES = 2

export async function loadAlerts(db: Db, now: Date): Promise<SystemAlert[]> {
  const alerts: SystemAlert[] = []
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000)
  const pendingCutoff = new Date(now.getTime() - AMBIGUOUS_REFUND_MINUTES * 60_000)
  const stuckCutoff = new Date(now.getTime() - STUCK_MINUTES * 60_000)

  const plural = (n: number) => (n === 1 ? '' : 's')

  // 1. Stripe webhook events that failed to process. A failed event can mean a
  //    paid purchase was never fulfilled, so this is the highest severity.
  const failedWebhooks = await countOrAlert(
    db
      .from('stripe_webhook_events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed'),
    'Stripe webhook',
  )
  if ('failure' in failedWebhooks) alerts.push(failedWebhooks.failure)
  else if (failedWebhooks.count > 0) {
    alerts.push({
      id: 'stripe-webhook-failed',
      severity: 'critical',
      service: 'Stripe webhook',
      title: `${failedWebhooks.count} webhook event${plural(failedWebhooks.count)} failed to process`,
      detail:
        'A failed event can mean a paid purchase was never fulfilled. Compare against Stripe before assuming credits were granted.',
      count: failedWebhooks.count,
      href: '/payments',
    })
  }

  // 2. Refunds stuck pending. reconcile-ambiguous-refunds is deployed but has
  //    no cron schedule and no CRON_INVOKE_SECRET, so nothing resolves these:
  //    they sit pending indefinitely with the customer's batch held at
  //    refund_pending. Surfacing them is one of the clearest reasons this
  //    dashboard earns its place.
  const stuckRefunds = await countOrAlert(
    db
      .from('refund_events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('created_at', ISO(pendingCutoff)),
    'Refunds',
  )
  if ('failure' in stuckRefunds) alerts.push(stuckRefunds.failure)
  else if (stuckRefunds.count > 0) {
    alerts.push({
      id: 'refunds-pending',
      severity: 'critical',
      service: 'Refunds',
      title: `${stuckRefunds.count} refund${plural(stuckRefunds.count)} stuck pending`,
      detail:
        'The reconciler that would resolve these is deployed but not scheduled and has no CRON_INVOKE_SECRET set, so nothing is currently clearing them. Check Stripe for the true status.',
      count: stuckRefunds.count,
      href: '/refunds',
    })
  }

  // 3. Checks stuck in processing. sweep_stale_processing_checks should fail
  //    these after 12 minutes, so anything older is a gap in that sweeper.
  const stuckChecks = await countOrAlert(
    db
      .from('checks')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'processing')
      .lt('created_at', ISO(stuckCutoff)),
    'Analysis',
  )
  if ('failure' in stuckChecks) alerts.push(stuckChecks.failure)
  else if (stuckChecks.count > 0) {
    alerts.push({
      id: 'checks-stuck',
      severity: 'warning',
      service: 'Analysis',
      title: `${stuckChecks.count} check${plural(stuckChecks.count)} processing for over ${STUCK_MINUTES} minutes`,
      detail:
        'sweep_stale_processing_checks should have failed these already. A customer is waiting on a result that is not coming.',
      count: stuckChecks.count,
      href: '/checks?status=processing',
    })
  }

  // 4. Upload purge failures in the last day. A CV that failed to delete is
  //    still in storage past its retention window, which is a data retention
  //    problem rather than merely an operational one.
  const purgeFailures = await countOrAlert(
    db
      .from('upload_purge_log')
      .select('id', { count: 'exact', head: true })
      .eq('success', false)
      .gte('attempted_at', ISO(dayAgo)),
    'Storage',
  )
  if ('failure' in purgeFailures) alerts.push(purgeFailures.failure)
  else if (purgeFailures.count > 0) {
    alerts.push({
      id: 'purge-failed',
      severity: 'warning',
      service: 'Storage',
      title: `${purgeFailures.count} upload purge attempt${plural(purgeFailures.count)} failed in the last 24 hours`,
      detail:
        'A CV that failed to delete is still in storage past its retention window. This is a data retention issue, not just an operational one.',
      count: purgeFailures.count,
    })
  }

  // 5. Checks that failed in the last day.
  const recentFailures = await countOrAlert(
    db
      .from('checks')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('created_at', ISO(dayAgo)),
    'Analysis failures',
  )
  if ('failure' in recentFailures) alerts.push(recentFailures.failure)
  else if (recentFailures.count > 0) {
    alerts.push({
      id: 'checks-failed',
      severity: 'warning',
      service: 'Analysis',
      title: `${recentFailures.count} check${plural(recentFailures.count)} failed in the last 24 hours`,
      detail: 'Open the check to see its recorded error before contacting the customer.',
      count: recentFailures.count,
      href: '/checks?status=failed',
    })
  }

  // 5. The weekly newsletter. publish-weekly-newsletter runs unattended every
  //    Sunday and fails closed, so a week that produced nothing is silent by
  //    design: no campaign, no email, no error anywhere a person would look.
  //    This is the only place that silence becomes visible. Two conditions,
  //    reported separately because they need different responses: a recorded
  //    failure says the run happened and refused to send, while nothing at all
  //    in nine days says the cron job itself is not firing.
  const { data: lastIssue, error: issueError } = await db
    .from('newsletter_issues')
    .select('status, year, week, error, campaign_id, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (issueError) {
    alerts.push({
      id: 'check-failed-newsletter',
      severity: 'warning',
      service: 'Newsletter',
      title: 'This check could not run',
      detail: `The dashboard could not query for this condition, so it is unknown rather than clear: ${issueError.message}`,
      count: 0,
    })
  } else if (!lastIssue || new Date(lastIssue.created_at).getTime() < now.getTime() - NEWSLETTER_SILENT_DAYS * 86_400_000) {
    alerts.push({
      id: 'newsletter-silent',
      severity: 'warning',
      service: 'Newsletter',
      title: lastIssue ? 'No newsletter issue in over a week' : 'No newsletter issue has ever been built',
      detail:
        'The weekly job schedules a campaign every Sunday. Nothing recorded means it is not running at all, rather than running and declining to send. Check the publish-weekly-newsletter cron job and the function logs.',
      count: 0,
    })
  } else if (lastIssue.status === 'scheduled' && lastIssue.campaign_id === null) {
    // The function reserves the week before calling Brevo, so that a lost write
    // cannot become a second campaign. The cost of that ordering is this state:
    // a reserved row whose campaign id never came back. Either Brevo was never
    // reached, in which case nothing sends and the week is silently skipped, or
    // it was reached and the id was lost, in which case an email IS going out
    // and there is no id to cancel it by. Both need a person, and neither is
    // visible anywhere else.
    alerts.push({
      id: 'newsletter-no-campaign-id',
      severity: 'critical',
      service: 'Newsletter',
      title: `Week ${lastIssue.week} of ${lastIssue.year} is reserved with no campaign id`,
      detail:
        'The issue was built and the week reserved, but Brevo never returned a campaign id. Check the Brevo campaign list: if a campaign for this week exists it will send on schedule and can only be cancelled there, and if none exists nothing will go out. The reservation deliberately blocks an automatic retry, because retrying is how a duplicate reaches the whole list.',
      count: 1,
      href: '/email',
    })
  } else if (lastIssue.status === 'failed') {
    alerts.push({
      id: 'newsletter-failed',
      severity: 'warning',
      service: 'Newsletter',
      title: `Week ${lastIssue.week} of ${lastIssue.year} did not go out`,
      detail: `The run aborted and created no campaign, which is the intended behaviour rather than a half sent issue: ${lastIssue.error ?? 'no reason recorded'}`,
      count: 1,
    })
  }

  const order: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }
  return alerts.sort((a, b) => order[a.severity] - order[b.severity])
}
