import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { loadContent } from '@/server/metrics/marketing'
import { resolvePeriod } from '@/lib/time'
import { parseCustomRange, parsePeriod } from '@/lib/params'
import { formatDuration, formatNumber } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { BreakdownList } from '@/components/dashboard/BreakdownList'
import { Alert, ErrorState } from '@/components/ui/States'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { PeriodPicker } from '../PeriodPicker'
import { RefreshButton } from '../RefreshButton'

export const dynamic = 'force-dynamic'

export default async function ContentPage({
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

  const data = await loadContent(serviceClient(), period)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Content"
        description="How the marketing pages perform and how much ground the product covers. Page level data begins when attribution shipped."
        actions={<RefreshButton />}
      />

      <PeriodPicker active={periodId} />

      {data.error ? <ErrorState title="Could not load content metrics" detail={data.error} /> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Landing views"
          metric={data.landingViews}
          hint="Every landing page view in this period"
        />
        <MetricCard
          label="Attributable to a page"
          metric={data.landingViewsWithPage}
          hint="Views recorded since page paths were added"
        />
        <MetricCard
          label="Roles covered"
          metric={data.rolesCovered}
          hint="Distinct job titles checked in this period"
        />
        <MetricCard
          label="Median time to verdict"
          metric={data.medianMinutesToVerdict}
          render={(v) => formatDuration(v * 60)}
          higherIsWorse
          hint="Creation to analysis complete"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Landing views by page</CardTitle>
          <p className="text-xs text-text-caption">
            Until recently every one of the 23 SEO pages recorded an identical view with no path,
            so only views since then can be attributed to a page.
          </p>
        </CardHeader>
        <CardContent>
          {data.landingViews.available &&
          data.landingViewsWithPage.available &&
          data.landingViews.value > 0 &&
          data.landingViewsWithPage.value === 0 ? (
            <Alert tone="info" title="No page level views in this period yet">
              This period contains {formatNumber(data.landingViews.value)} landing views recorded
              before page paths existed, so none of them can be attributed to a page. Later periods
              will fill in.
            </Alert>
          ) : (
            <BreakdownList
              rows={data.byPage}
              emptyTitle="No page level landing views in this period"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Product usage depth</CardTitle>
          <p className="text-xs text-text-caption">
            Recovered from the landing_stats function that was removed in August. It was cut for
            being served publicly at a volume that described individuals, not because the maths was
            wrong. Neither problem applies to an internal screen.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Checks completed"
              metric={data.checksCompleted}
              hint="Created and completed in this period"
            />
            <MetricCard
              label="Accounts checking"
              metric={data.accountsWithCompletedCheck}
              hint="Distinct accounts with a completed check"
            />
            <MetricCard
              label="Rerun pairs"
              metric={data.rerunPairs}
              hint="Users who checked the same role twice"
            />
            <MetricCard
              label="Average rerun gain"
              metric={data.avgRerunScoreDelta}
              render={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}`}
              hint="Score movement between first and latest check on the same role"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All events in this period</CardTitle>
          <p className="text-xs text-text-caption">
            The analytics_events table, read here for the first time. Note that the browser
            extension writes four event names of its own into the same table.
          </p>
        </CardHeader>
        <CardContent>
          <BreakdownList
            rows={data.byEventType}
            emptyTitle="No events recorded in this period"
            limit={30}
          />
        </CardContent>
      </Card>
    </div>
  )
}
