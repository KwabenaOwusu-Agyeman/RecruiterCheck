import { formatNumber, formatPercent } from '@/lib/format'
import { EmptyState } from '@/components/ui/States'
import type { Breakdown } from '@/server/metrics/marketing'

/**
 * A ranked breakdown with proportional bars.
 *
 * The bars are SVG rects rather than divs with an inline width. style-src has
 * no 'unsafe-inline' and a nonce does not cover a style ATTRIBUTE, so
 * `style={{ width }}` is silently dropped and every bar renders full width: a
 * chart that quietly disagrees with the numbers printed beside it. An SVG width
 * is a presentation attribute, not CSS, so the policy does not touch it.
 */
export function BreakdownList({
  rows,
  emptyTitle,
  emptyDescription,
  limit = 12,
}: {
  rows: readonly Breakdown[]
  emptyTitle: string
  emptyDescription?: string
  limit?: number
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  const shown = rows.slice(0, limit)
  const top = shown[0]?.count ?? 0

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2">
        {shown.map((row) => {
          // Bars are scaled against the largest row so the smallest is still
          // visible; the percentage beside it is the true share of the whole.
          const relative = top === 0 ? 0 : (row.count / top) * 100
          return (
            <li key={row.label} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="min-w-0 truncate text-text-primary" title={row.label}>
                  {row.label}
                </span>
                <span className="tabular whitespace-nowrap text-text-secondary">
                  {formatNumber(row.count)} ({formatPercent(row.share)})
                </span>
              </div>
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
                  width={Math.max(Math.min(relative, 100), 0)}
                  className="fill-navy"
                />
              </svg>
            </li>
          )
        })}
      </ol>
      {rows.length > limit ? (
        <p className="text-xs text-text-caption">
          Showing the top {limit} of {formatNumber(rows.length)}.
        </p>
      ) : null}
    </div>
  )
}
