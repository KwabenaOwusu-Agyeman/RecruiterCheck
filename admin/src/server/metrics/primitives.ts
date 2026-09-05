import 'server-only'
import { available, unavailable, type Metric } from '@/lib/metric'

// Shared helpers for turning a Supabase query result into a Metric.
//
// These take an already-built, fully typed query rather than a table name, so
// call sites keep compile-time checking of columns against the generated
// schema. That matters more than brevity: a mistyped column name in a
// dashboard query produces a plausible wrong number, not an obvious crash.
//
// The recurring principle is refusing to guess. Where a query errors or
// returns a partial answer, the metric reports unavailable with the reason
// instead of a confident figure that happens to be wrong.

/** Rows read in one page when totalling client-side. */
export const PAGE_SIZE = 1000
/** Hard ceiling on rows read for a single metric. */
export const ROW_CAP = 50_000

export const ISO = (d: Date) => d.toISOString()

interface CountResult {
  count: number | null
  error: { message: string } | null
}

/** Turns an exact-count head query into a Metric. */
export async function countOf(query: PromiseLike<CountResult>): Promise<Metric> {
  const { count, error } = await query
  if (error) return unavailable(`query failed: ${error.message}`)
  return available(count ?? 0)
}

interface RowsResult<T> {
  data: T[] | null
  error: { message: string } | null
}

export type Rows<T> = { ok: true; rows: T[] } | { ok: false; reason: string }

/**
 * Reads rows, refusing to return a truncated set silently. Hitting the cap is
 * reported as a failure rather than answered with a partial result, because an
 * understated revenue or credit figure that looks plausible is the worst
 * outcome this dashboard can produce.
 */
export async function readRows<T>(query: PromiseLike<RowsResult<T>>): Promise<Rows<T>> {
  const { data, error } = await query
  if (error) return { ok: false, reason: `query failed: ${error.message}` }
  const rows = data ?? []
  if (rows.length >= ROW_CAP) {
    return {
      ok: false,
      reason: `too many rows to total accurately (${ROW_CAP.toLocaleString()}+ matched)`,
    }
  }
  return { ok: true, rows }
}

/** Totals a numeric field across rows, or explains why it could not. */
export function sumOf<T>(rows: Rows<T>, pick: (row: T) => number | null): Metric {
  if (!rows.ok) return unavailable(rows.reason)
  let total = 0
  for (const row of rows.rows) {
    const value = pick(row)
    if (typeof value === 'number' && Number.isFinite(value)) total += value
  }
  return available(total)
}

/** Counts rows already read, or explains why it could not. */
export function countRows<T>(rows: Rows<T>, keep?: (row: T) => boolean): Metric {
  if (!rows.ok) return unavailable(rows.reason)
  return available(keep ? rows.rows.filter(keep).length : rows.rows.length)
}
