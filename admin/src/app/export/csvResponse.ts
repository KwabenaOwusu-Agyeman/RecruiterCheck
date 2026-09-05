import 'server-only'
import { exportFilename, toCsv, type CsvColumn } from '@/lib/csv'

/**
 * Builds the HTTP response for a CSV export.
 *
 * Exports carry the same redaction rules as the screen: callers select only
 * safe columns, so no CV field, job description or scoring internal can reach
 * a file that then leaves the machine.
 */
export function csvResponse<T>(
  baseName: string,
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
): Response {
  const body = toCsv(rows, columns)
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${exportFilename(baseName, new Date())}"`,
      // An export of customer data should never be cached by an intermediary.
      'cache-control': 'no-store, private',
    },
  })
}

/** Row ceiling for a single export, so one request cannot pull the whole table. */
export const EXPORT_LIMIT = 5000
