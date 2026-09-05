// Metric values and period-over-period comparison.
//
// The governing rule: a metric that cannot be calculated accurately says so.
// It never renders as zero, and it never renders as a guess. A zero and an
// "unavailable" look identical on a dashboard but mean opposite things, and
// confusing them is how a founder concludes nothing happened when in fact
// nothing was measured.

export type Metric =
  | { available: true; value: number }
  | { available: false; reason: string }

export function available(value: number): Metric {
  return { available: true, value }
}

export function unavailable(reason: string): Metric {
  return { available: false, reason }
}

export interface Delta {
  absolute: number
  /**
   * Null when a percentage is not defined. Growth from zero is the common
   * case: 0 to 5 is not "infinite percent" and not "100%", it is simply not a
   * ratio, so the UI shows the absolute change alone.
   */
  percent: number | null
  direction: 'up' | 'down' | 'flat'
}

export function compare(current: Metric, previous: Metric | null): Delta | null {
  // A comparison is only meaningful when both sides were actually measured.
  if (!previous || !current.available || !previous.available) return null

  const absolute = current.value - previous.value
  const direction = absolute > 0 ? 'up' : absolute < 0 ? 'down' : 'flat'
  const percent = previous.value === 0 ? null : (absolute / previous.value) * 100

  return { absolute, percent, direction }
}

/**
 * A rate expressed as a percentage. Returns unavailable rather than zero when
 * the denominator is zero: "0% completion" and "no checks yet" are different
 * statements, and only one of them is true on a quiet day.
 */
export function rate(numerator: number, denominator: number, reasonWhenEmpty: string): Metric {
  if (denominator === 0) return unavailable(reasonWhenEmpty)
  return available((numerator / denominator) * 100)
}

/** Mean of a sample, unavailable when the sample is empty. */
export function mean(values: readonly number[], reasonWhenEmpty: string): Metric {
  if (values.length === 0) return unavailable(reasonWhenEmpty)
  return available(values.reduce((sum, v) => sum + v, 0) / values.length)
}

/**
 * Median, which is what to report for processing time: a single stuck job that
 * took four hours drags a mean far enough to misrepresent a normal day.
 */
export function median(values: readonly number[], reasonWhenEmpty: string): Metric {
  if (values.length === 0) return unavailable(reasonWhenEmpty)
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return available(
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
  )
}
