import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { loadAcquisition } from '@/server/metrics/marketing'
import { resolvePeriod } from '@/lib/time'
import { parseCustomRange, parsePeriod } from '@/lib/params'
import { formatDateTime, formatPercent } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { BreakdownList } from '@/components/dashboard/BreakdownList'
import { Alert, ErrorState } from '@/components/ui/States'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { PeriodPicker } from '../PeriodPicker'
import { RefreshButton } from '../RefreshButton'

export const dynamic = 'force-dynamic'

export default async function AcquisitionPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const { timezone } = await requireAdmin()
  const params = await searchParams
  const periodId = parsePeriod(params.period)
  const now = new Date()
  const period = resolvePeriod(
    periodId,
    timezone,
    now,
    parseCustomRange(params.from, params.to) ?? undefined,
  )

  const data = await loadAcquisition(serviceClient(), period)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Acquisition"
        description="Where the people who signed up in this period came from. Built from first touch attribution recorded in the browser and copied onto the profile at signup."
        actions={<RefreshButton />}
      />

      <PeriodPicker active={periodId} />

      {/* The single most important caveat on this screen. Without it a sparse
          channel breakdown reads as "nobody came from anywhere" rather than
          "this was not being recorded yet". */}
      {data.attributionStartedAt ? (
        <Alert tone="info" title="Attribution starts partway through your history">
          Acquisition has only been recorded since{' '}
          {formatDateTime(data.attributionStartedAt, timezone)}. Accounts created before then are
          counted as signups but cannot be attributed to a channel, and never will be.
        </Alert>
      ) : (
        <Alert tone="warning" title="No attributed signups yet">
          Attribution shipped recently and no account has been created since. Signups will start
          appearing here as soon as someone arrives and registers. Nothing is wrong.
        </Alert>
      )}

      {data.error ? <ErrorState title="Could not load acquisition" detail={data.error} /> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard
          label="Signups in period"
          metric={data.signupsInPeriod}
          hint="Accounts created, attributed or not"
        />
        <MetricCard
          label="Attributed"
          metric={data.attributedSignups}
          hint="Signups carrying a first touch record"
        />
        <MetricCard
          label="Attribution coverage"
          metric={data.attributionCoverage}
          render={(v) => formatPercent(v)}
          hint="Share of signups that could be attributed"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By source</CardTitle>
            <p className="text-xs text-text-caption">utm_source, or direct where none was set</p>
          </CardHeader>
          <CardContent>
            <BreakdownList
              rows={data.bySource}
              emptyTitle="No attributed signups in this period"
              emptyDescription="Nothing to break down yet."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By medium</CardTitle>
            <p className="text-xs text-text-caption">utm_medium</p>
          </CardHeader>
          <CardContent>
            <BreakdownList rows={data.byMedium} emptyTitle="No attributed signups in this period" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By campaign</CardTitle>
            <p className="text-xs text-text-caption">utm_campaign</p>
          </CardHeader>
          <CardContent>
            <BreakdownList rows={data.byCampaign} emptyTitle="No attributed signups in this period" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By referrer</CardTitle>
            <p className="text-xs text-text-caption">
              Host only. The full referring URL is never stored.
            </p>
          </CardHeader>
          <CardContent>
            <BreakdownList rows={data.byReferrer} emptyTitle="No attributed signups in this period" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Landing page that produced the signup</CardTitle>
          <p className="text-xs text-text-caption">
            The first page each signed up visitor arrived on, which is the page that earned them.
          </p>
        </CardHeader>
        <CardContent>
          <BreakdownList
            rows={data.byLandingPath}
            emptyTitle="No attributed signups in this period"
          />
        </CardContent>
      </Card>
    </div>
  )
}
