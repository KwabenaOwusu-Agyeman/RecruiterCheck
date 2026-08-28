import { useEffect, useState } from 'react'
import { Container } from '@/components/ui/Container'
import {
  clearsStatsFloor,
  getLandingStats,
  type LandingStats,
} from '@/services/landingStatsService'

/**
 * The proof block — monday.com's statistics grid, sized honestly. Built now
 * so it switches itself on when the volume exists, dormant until then.
 *
 * Two gates, deliberately separate:
 *
 *  1. STATS_SECTION_READY, a build-time switch. While false (today) the
 *     component renders nothing and fetches nothing, so the page has no
 *     placeholder, no reserved gap, and no layout shift risk — the section
 *     simply does not exist. Flip it once production volume has cleared the
 *     floor for good.
 *  2. clearsStatsFloor, the data gate. Once READY, the section prerenders
 *     at its final height (the same first-paint discipline the reviews
 *     block follows) and fills in; if the live numbers have somehow fallen
 *     back below the floor it hides again rather than publishing "7 checks
 *     run", which would cost more trust than the empty space.
 */
export const STATS_SECTION_READY = false

export function StatsSection() {
  const [stats, setStats] = useState<LandingStats | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!STATS_SECTION_READY) return
    let cancelled = false
    getLandingStats()
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!STATS_SECTION_READY) return null
  if (failed) return null
  if (stats && !clearsStatsFloor(stats)) return null

  const loading = stats === null

  const figures: Array<{ value: string; label: string }> = loading
    ? []
    : [
        { value: stats.checksCompleted.toLocaleString('en-US'), label: 'Checks completed' },
        { value: stats.rolesCovered.toLocaleString('en-US'), label: 'Roles checked against' },
        ...(stats.avgRerunScoreDelta !== null && stats.avgRerunScoreDelta > 0 && stats.rerunPairs >= 20
          ? [
              {
                value: `+${stats.avgRerunScoreDelta}`,
                label: 'Average score change after acting on feedback',
              },
            ]
          : []),
        ...(stats.medianMinutesToVerdict !== null && stats.medianMinutesToVerdict > 0
          ? [{ value: `${stats.medianMinutesToVerdict} min`, label: 'Median time to a verdict' }]
          : []),
      ]

  return (
    <section className="border-b border-border bg-background">
      {/* min-h reserves the loaded height from first paint, so the numbers
          arriving after the fetch never shift the page under the reader. */}
      <Container className="min-h-[220px] py-[56px] sm:py-16 lg:py-[112px]">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue sm:text-sm">
            In numbers
          </p>
          <h2 className="mt-2 font-display text-[24px] text-text-primary sm:text-[32px] lg:text-[44px] lg:leading-[1.14]">
            Every figure here is live
          </h2>
        </div>

        <div className="mx-auto mt-7 grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-border bg-border sm:mt-8 lg:grid-cols-4">
          {figures.map((figure) => (
            <div key={figure.label} className="flex flex-col gap-1 bg-background px-4 py-5 text-center sm:px-5 sm:py-6">
              <span className="font-display text-3xl text-text-primary sm:text-4xl [font-variant-numeric:tabular-nums]">
                {figure.value}
              </span>
              <span className="text-sm text-text-secondary">{figure.label}</span>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}
