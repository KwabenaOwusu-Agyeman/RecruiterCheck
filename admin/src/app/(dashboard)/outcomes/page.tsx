import { requireAdmin } from '@/server/auth'
import { serviceClient } from '@/server/supabase'
import { loadOutcomes } from '@/server/metrics/outcomes'
import { MIN_GROUP_SIZE } from '@/lib/outcomes'
import { formatNumber, formatPercent } from '@/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { MetricCard } from '@/components/dashboard/MetricCard'
import { BreakdownList } from '@/components/dashboard/BreakdownList'
import { Alert, EmptyState, ErrorState } from '@/components/ui/States'
import { PageHeader } from '@/components/dashboard/PageHeader'
import { RefreshButton } from '../RefreshButton'

export const dynamic = 'force-dynamic'

const percent = (v: number) => formatPercent(v)

// Application outcome follow up results, lifetime. Aggregates only: no row,
// user or token is ever shown (Decision Log: "Data strategy: what we collect",
// 16 September 2026).
export default async function OutcomesPage() {
  await requireAdmin()
  const data = await loadOutcomes(serviceClient())

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Outcomes"
        description="What happened after a check, from users who opted in to the three week follow up. Lifetime figures, combined across users."
        actions={<RefreshButton />}
      />

      {!data.ok ? (
        <ErrorState title="Could not load outcomes" detail={data.reason} />
      ) : (
        <>
          <section aria-labelledby="funnel-heading" className="flex flex-col gap-3">
            <h2 id="funnel-heading" className="text-sm font-semibold text-text-primary">
              Follow up
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Opted in" metric={data.summary.optedIn} hint="Ticked the box on a result" />
              <MetricCard label="Emailed" metric={data.summary.emailed} hint="Follow up sent" />
              <MetricCard label="Answered" metric={data.summary.answered} />
              <MetricCard
                label="Response rate"
                metric={data.summary.responseRate}
                render={percent}
                hint="Answered, of those emailed"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Stopped"
                metric={data.summary.withdrawn}
                higherIsWorse
                hint="Chose stop asking me"
              />
            </div>
          </section>

          <section aria-labelledby="results-heading" className="flex flex-col gap-3">
            <h2 id="results-heading" className="text-sm font-semibold text-text-primary">
              Applications
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Applied"
                metric={data.summary.appliedRate}
                render={percent}
                hint="Of those who answered"
              />
              <MetricCard
                label="Reached interview"
                metric={data.summary.interviewRate}
                render={percent}
                hint="Interview or offer, of applications"
              />
              <MetricCard
                label="Ghosted"
                metric={data.summary.ghostRate}
                render={percent}
                higherIsWorse
                hint="No reply after three weeks"
              />
              <MetricCard
                label="Days to reply"
                metric={data.summary.medianDaysToReply}
                render={(v) => formatNumber(Math.round(v * 10) / 10)}
                hint="Median, where a reply came"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>How far applications got</CardTitle>
                </CardHeader>
                <CardContent>
                  <BreakdownList rows={data.summary.byStage} emptyTitle="No applications reported yet" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>How users applied</CardTitle>
                </CardHeader>
                <CardContent>
                  <BreakdownList rows={data.summary.byChannel} emptyTitle="No applications reported yet" />
                </CardContent>
              </Card>
            </div>
          </section>

          <section aria-labelledby="score-heading" className="flex flex-col gap-3">
            <h2 id="score-heading" className="text-sm font-semibold text-text-primary">
              Does the score predict interviews?
            </h2>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Interview rate by score band</caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-caption">
                    <th className="px-5 py-3 font-medium">Score</th>
                    <th className="px-5 py-3 font-medium">Applications</th>
                    <th className="px-5 py-3 font-medium">Reached interview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.summary.byScoreBand.map((row) => (
                    <tr key={row.band}>
                      <td className="px-5 py-3 font-medium">{row.band}</td>
                      <td className="tabular px-5 py-3">{formatNumber(row.applied)}</td>
                      <td className="tabular px-5 py-3">
                        {row.interviews.available ? (
                          formatPercent(row.interviews.value)
                        ) : (
                          <span className="text-text-caption">{row.interviews.reason}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Alert tone="info" title="Read with care">
              Only users who opted in and answered are counted, and a rate is shown only once a band
              has {MIN_GROUP_SIZE} or more applications.
            </Alert>
          </section>

          <section aria-labelledby="salary-heading" className="flex flex-col gap-3">
            <h2 id="salary-heading" className="text-sm font-semibold text-text-primary">
              Salary offered
            </h2>
            <Card className="overflow-x-auto">
              {data.summary.salaries.length === 0 ? (
                <EmptyState
                  title="Not enough offers yet"
                  description={`A role, country and currency appears once it has ${MIN_GROUP_SIZE} or more offers.`}
                />
              ) : (
                <table className="w-full text-sm">
                  <caption className="sr-only">Median salary offered by role and country</caption>
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-caption">
                      <th className="px-5 py-3 font-medium">Role</th>
                      <th className="px-5 py-3 font-medium">Country</th>
                      <th className="px-5 py-3 font-medium">Offers</th>
                      <th className="px-5 py-3 font-medium">Median per year</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.summary.salaries.map((group) => (
                      <tr key={`${group.role}|${group.country}|${group.currency}`}>
                        <td className="px-5 py-3 capitalize">{group.role}</td>
                        <td className="px-5 py-3">{group.country}</td>
                        <td className="tabular px-5 py-3">{formatNumber(group.offers)}</td>
                        <td className="tabular px-5 py-3">
                          {group.currency} {formatNumber(Math.round(group.median))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            {data.summary.salaryGroupsHidden > 0 ? (
              <p className="text-xs text-text-caption">
                {data.summary.salaryGroupsHidden} smaller group
                {data.summary.salaryGroupsHidden === 1 ? ' is' : 's are'} hidden until they reach{' '}
                {MIN_GROUP_SIZE} offers.
              </p>
            ) : null}
          </section>
        </>
      )}
    </div>
  )
}
