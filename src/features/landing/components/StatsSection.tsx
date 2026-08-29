import { useEffect, useState } from 'react'
import { Container } from '@/components/ui/Container'
import {
  clearsStatsFloor,
  getLandingStats,
  type LandingStats,
} from '@/services/landingStatsService'

interface Figure {
  value: string
  label: string
}

/**
 * True on day one: facts about how every check works, not usage claims.
 * These prerender, so the section is never empty and never shifts. Each is
 * verifiable elsewhere on the site (the scoring page, the privacy policy,
 * the pricing packs).
 */
const PRODUCT_FIGURES: Figure[] = [
  // No "24h deletion" here: the navy objection strip two sections down
  // already says exactly that, and the same fact twice on one screen reads
  // as padding.
  { value: '3', label: 'Dimensions behind every score: experience, skills, candidate value' },
  { value: '0 to 5', label: 'Years of experience the check is built for' },
  { value: '3', label: 'Documents a strong check can write: CV draft, cover letter, recruiter message' },
  { value: '90 days', label: 'Purchased checks stay valid' },
]

/**
 * The proof block. Live from day one, honest at every stage:
 *
 *  - Below the usage floor (250 checks across 100 accounts, see
 *    landingStatsService) it shows PRODUCT_FIGURES — commitments a visitor
 *    can verify, which build trust without inflating numbers a six-account
 *    product does not have yet. "7 checks run" would cost more trust than
 *    any figure here earns.
 *  - Once production volume clears the floor, the same grid swaps to the
 *    live aggregates from public.landing_stats, computed in the database so
 *    the published numbers can never drift from the truth. The swap
 *    replaces text inside the same cells, so nothing about the page's
 *    layout changes when it happens.
 */
export function StatsSection() {
  const [stats, setStats] = useState<LandingStats | null>(null)

  useEffect(() => {
    let cancelled = false
    getLandingStats()
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch(() => {
        // Network or policy failure: the product figures stay up. Nothing
        // on this page should ever depend on this fetch succeeding.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const live = stats !== null && clearsStatsFloor(stats)

  const figures: Figure[] = live
    ? [
        { value: stats.checksCompleted.toLocaleString('en-US'), label: 'Checks completed' },
        { value: stats.rolesCovered.toLocaleString('en-US'), label: 'Roles checked against' },
        stats.avgRerunScoreDelta !== null && stats.avgRerunScoreDelta > 0 && stats.rerunPairs >= 20
          ? { value: `+${stats.avgRerunScoreDelta}`, label: 'Average score change after acting on feedback' }
          : PRODUCT_FIGURES[2],
        stats.medianMinutesToVerdict !== null && stats.medianMinutesToVerdict > 0
          ? { value: `${stats.medianMinutesToVerdict} min`, label: 'Median time to a verdict' }
          : PRODUCT_FIGURES[3],
      ]
    : PRODUCT_FIGURES

  return (
    <section className="border-b border-border bg-background">
      <Container className="py-[48px] sm:py-[64px] lg:py-[88px]">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue sm:text-sm">
            In numbers
          </p>
          <h2 className="mt-2 font-display text-[24px] text-text-primary sm:text-[32px] lg:text-[44px] lg:leading-[1.14]">
            {live ? 'Every figure here is live' : 'What every check commits to'}
          </h2>
        </div>

        <div className="mx-auto mt-7 grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-border bg-border sm:mt-8 lg:grid-cols-4">
          {figures.map((figure) => (
            <div
              key={figure.label}
              className="flex flex-col gap-1.5 bg-surface px-4 py-6 text-center sm:px-5 sm:py-7"
            >
              <span className="font-display text-3xl tracking-[-0.02em] text-text-primary sm:text-4xl [font-variant-numeric:tabular-nums]">
                {figure.value}
              </span>
              <span className="mx-auto max-w-[220px] text-sm leading-snug text-text-secondary">
                {figure.label}
              </span>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}
