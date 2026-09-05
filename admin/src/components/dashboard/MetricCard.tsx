import type { ReactNode } from 'react'
import { compare, type Metric } from '@/lib/metric'
import { formatNumber, formatPercent } from '@/lib/format'
import { cn } from '@/lib/cn'
import { Unavailable } from '@/components/ui/States'

export interface MetricCardProps {
  label: string
  metric: Metric
  previous?: Metric | null
  /** Renders the value. Defaults to a plain formatted number. */
  render?: (value: number) => ReactNode
  /** One line saying what the number means. Shown under the value. */
  hint?: string
  /**
   * For metrics where a rise is bad (failures, refunds, abandoned checks), so
   * the delta is not coloured green when things get worse.
   */
  higherIsWorse?: boolean
}

export function MetricCard({
  label,
  metric,
  previous = null,
  render,
  hint,
  higherIsWorse = false,
}: MetricCardProps) {
  const delta = compare(metric, previous)

  return (
    <div className="flex flex-col gap-1 rounded-[20px] border border-border-soft bg-surface px-5 py-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-text-caption">{label}</p>

      {metric.available ? (
        <p className="tabular text-3xl font-semibold leading-tight text-text-primary">
          {render ? render(metric.value) : formatNumber(metric.value)}
        </p>
      ) : (
        <Unavailable reason={metric.reason} />
      )}

      {hint ? <p className="text-xs leading-snug text-text-caption">{hint}</p> : null}

      {delta ? <DeltaLabel delta={delta} higherIsWorse={higherIsWorse} /> : null}
    </div>
  )
}

function DeltaLabel({
  delta,
  higherIsWorse,
}: {
  delta: NonNullable<ReturnType<typeof compare>>
  higherIsWorse: boolean
}) {
  const improving =
    delta.direction === 'flat' ? null : higherIsWorse ? delta.direction === 'down' : delta.direction === 'up'

  const tone =
    improving === null
      ? 'text-text-caption'
      : improving
        ? 'text-success-deep'
        : 'text-error'

  const arrow = delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '■'
  const sign = delta.absolute > 0 ? '+' : ''

  return (
    <p className={cn('tabular text-xs font-medium', tone)}>
      <span aria-hidden="true">{arrow}</span>{' '}
      {sign}
      {formatNumber(Math.round(delta.absolute * 100) / 100)}
      {/* A percentage is omitted rather than faked when the previous period was
          zero: growth from nothing is not a ratio. */}
      {delta.percent === null ? '' : ` (${formatPercent(delta.percent)})`}
      <span className="font-normal text-text-caption"> vs previous</span>
    </p>
  )
}
