import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { loadOverview } from '@/server/metrics/overview'
import { loadAlerts } from '@/server/metrics/alerts'
import { resolvePeriod } from '@/lib/time'
import { parseCustomRange, parsePeriod } from '@/lib/params'
import { formatDateTime, formatDuration, formatMoney, formatNumber, formatPercent } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { Alert, EmptyState } from '@/components/ui/States'
import { PeriodPicker } from './PeriodPicker'
import { RefreshButton } from './RefreshButton'
import Link from 'next/link'

// Always render fresh: a cached operations dashboard is worse than a slow one,
// because the operator cannot tell the difference between "quiet" and "stale".
export const dynamic = 'force-dynamic'

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const { admin, timezone } = await requireAdmin()
  const params = await searchParams

  const periodId = parsePeriod(params.period)
  const custom = parseCustomRange(params.from, params.to)
  const now = new Date()
  const period = resolvePeriod(periodId, timezone, now, custom ?? undefined)

  const db = serviceClient()
  const [data, alerts] = await Promise.all([
    loadOverview(db, period, now),
    loadAlerts(db, now),
  ])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-navy">Overview</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Everything measurable, in {timezone}. Last updated{' '}
            {formatDateTime(data.generatedAt, timezone)}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton />
        </div>
      </header>

      <PeriodPicker active={periodId} />

      {alerts.length > 0 ? (
        <section aria-labelledby="alerts-heading" className="flex flex-col gap-2">
          <h2 id="alerts-heading" className="text-sm font-semibold text-text-primary">
            System alerts
          </h2>
          {alerts.map((alert) => (
            <Alert
              key={alert.id}
              tone={alert.severity === 'critical' ? 'danger' : 'warning'}
              title={`${alert.service}: ${alert.title}`}
            >
              <p>{alert.detail}</p>
              {alert.href ? (
                <Link href={alert.href} className="mt-1 inline-block font-medium text-blue underline">
                  Investigate
                </Link>
              ) : null}
            </Alert>
          ))}
        </section>
      ) : (
        <Alert tone="info" title="No system alerts">
          No failed webhooks, stuck refunds, stalled checks or purge failures right now.
        </Alert>
      )}

      <section aria-labelledby="people-heading" className="flex flex-col gap-3">
        <h2 id="people-heading" className="text-sm font-semibold text-text-primary">
          People
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="New users"
            metric={data.newUsers.current}
            previous={data.newUsers.previous}
            hint="Accounts created in this period"
          />
          <MetricCard
            label="Active users"
            metric={data.activeUsers.current}
            previous={data.activeUsers.previous}
            hint="Signed in during this period"
          />
          <MetricCard
            label="Free to paid"
            metric={data.freeToPaidConversion.current}
            previous={data.freeToPaidConversion.previous}
            render={(v) => formatPercent(v)}
            hint="Of accounts created in this period, the share that has purchased"
          />
          <MetricCard
            label="Checks started"
            metric={data.checksStarted.current}
            previous={data.checksStarted.previous}
            hint="Checks created in this period"
          />
        </div>
      </section>

      <section aria-labelledby="checks-heading" className="flex flex-col gap-3">
        <h2 id="checks-heading" className="text-sm font-semibold text-text-primary">
          Checks
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Completed"
            metric={data.checksCompleted.current}
            previous={data.checksCompleted.previous}
            hint="Created in this period and since completed"
          />
          <MetricCard
            label="Failed"
            metric={data.checksFailed.current}
            previous={data.checksFailed.previous}
            higherIsWorse
            hint="Created in this period and failed"
          />
          <MetricCard
            label="Abandoned"
            metric={data.checksAbandoned.current}
            previous={data.checksAbandoned.previous}
            higherIsWorse
            hint="Drafts left over an hour without submitting"
          />
          <MetricCard
            label="Completion rate"
            metric={data.completionRate.current}
            previous={data.completionRate.previous}
            render={(v) => formatPercent(v)}
            hint="Completed as a share of everything that has finished"
          />
          <MetricCard
            label="Median processing time"
            metric={data.medianProcessingSeconds.current}
            previous={data.medianProcessingSeconds.previous}
            render={(v) => formatDuration(v)}
            higherIsWorse
            hint="Creation to analysis complete, median"
          />
          <MetricCard
            label="Processing now"
            metric={data.checksProcessingNow}
            hint="Live count, not scoped to the period"
          />
          <MetricCard
            label="Stuck over 12 minutes"
            metric={data.checksStuck}
            higherIsWorse
            hint="The sweeper should have failed these already"
          />
        </div>
      </section>

      <section aria-labelledby="money-heading" className="flex flex-col gap-3">
        <h2 id="money-heading" className="text-sm font-semibold text-text-primary">
          Money and credits
        </h2>

        <Card>
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
            <p className="text-xs text-text-caption">
              Verified purchases net of refunds, by currency. Stripe remains authoritative.
            </p>
          </CardHeader>
          <CardContent>
            {data.revenue.error ? (
              <p className="text-sm text-text-caption">Unavailable: {data.revenue.error}</p>
            ) : data.revenue.current.length === 0 ? (
              <p className="text-sm text-text-secondary">No purchases in this period.</p>
            ) : (
              <ul className="flex flex-wrap gap-6">
                {data.revenue.current.map((total) => {
                  const prior = data.revenue.previous.find((p) => p.currency === total.currency)
                  return (
                    <li key={total.currency}>
                      <p className="tabular text-3xl font-semibold text-text-primary">
                        {formatMoney(total.minorUnits, total.currency)}
                      </p>
                      <p className="text-xs text-text-caption">
                        {prior
                          ? `${formatMoney(prior.minorUnits, prior.currency)} in the previous period`
                          : 'No comparable previous period'}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Purchases"
            metric={data.purchases.current}
            previous={data.purchases.previous}
            hint="Verified paid checkouts"
          />
          <MetricCard
            label="Refunds"
            metric={data.refunds.current}
            previous={data.refunds.previous}
            higherIsWorse
            hint="Refunds that succeeded in this period"
          />
          <MetricCard
            label="Credits sold"
            metric={data.creditsSold.current}
            previous={data.creditsSold.previous}
            hint="Check credits granted by purchases"
          />
          <MetricCard
            label="Credits consumed"
            metric={data.creditsConsumed.current}
            previous={data.creditsConsumed.previous}
            hint="Ledger entries of type used"
          />
          <MetricCard
            label="Credits expired"
            metric={data.creditsExpired.current}
            previous={data.creditsExpired.previous}
            higherIsWorse
            hint="Credits that lapsed unused"
          />
        </div>
      </section>

      <section aria-labelledby="funnel-heading">
        <Card>
          <CardHeader>
            <CardTitle>
              <span id="funnel-heading">Conversion funnel</span>
            </CardTitle>
            <p className="text-xs text-text-caption">
              The cohort that signed up in this period, followed through to purchase. Built from
              account, check and purchase records rather than analytics events.
            </p>
          </CardHeader>
          <CardContent>
            {data.funnel ? (
              <ol className="flex flex-col gap-2">
                {data.funnel.map((stage) => {
                  const top = data.funnel?.[0]?.value ?? 0
                  const share = top === 0 ? 0 : (stage.value / top) * 100
                  return (
                    <li key={stage.label} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-4 text-sm">
                        <span className="text-text-primary">{stage.label}</span>
                        <span className="tabular text-text-secondary">
                          {formatNumber(stage.value)}
                          {top > 0 ? ` (${formatPercent(share)})` : ''}
                        </span>
                      </div>
                      {/* Drawn as SVG rather than a div with an inline width.
                          The Content-Security-Policy has no 'unsafe-inline' in
                          style-src, and a nonce does not cover a style
                          ATTRIBUTE, so `style={{width}}` is silently dropped and
                          every bar renders full width -- a chart that quietly
                          lies. An SVG width is a presentation attribute, not
                          CSS, so it is unaffected. */}
                      <svg
                        viewBox="0 0 100 4"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                        className="h-2 w-full overflow-hidden rounded-full bg-border-soft"
                      >
                        <rect
                          x="0"
                          y="0"
                          height="4"
                          width={Math.max(Math.min(share, 100), 0)}
                          className="fill-navy"
                        />
                      </svg>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <EmptyState
                title="No funnel for this period"
                description="No accounts were created in this window, so there is no cohort to follow."
              />
            )}
          </CardContent>
        </Card>
      </section>

      <p className="text-xs text-text-caption">
        Signed in as {admin.email}. Figures for the current day are still settling: checks created
        today may not have finished, so completion rate understates until they do.
      </p>
    </div>
  )
}
