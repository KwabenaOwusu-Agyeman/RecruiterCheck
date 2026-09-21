import 'server-only'
import { randomUUID } from 'node:crypto'
import { exportFilename, toCsv, type CsvColumn } from '@/lib/csv'
import { safeErrorSummary } from '@/lib/redact'
import { writeAuditLog } from '@/server/audit'
import type { AdminUserRow } from '@/types/db'

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

/**
 * Every export is written to the audit log, like a report view: a bulk
 * download of customer emails or payments is exactly what someone needs to
 * be able to find later. The row carries the export name, the row count and
 * whether a filter was applied, never the filter text, which is often an
 * email address and would outlive the customer's account in this log.
 */
export async function recordExport(
  admin: AdminUserRow,
  name: string,
  outcome: { rows: number; filtered: boolean } | { error: unknown },
): Promise<void> {
  const entry = { action: `export.${name}`, targetType: 'export' }
  if ('error' in outcome) {
    await writeAuditLog(admin, entry, 'failure', randomUUID(), safeErrorSummary(outcome.error))
  } else {
    await writeAuditLog(admin, { ...entry, after: { rows: outcome.rows, filtered: outcome.filtered } }, 'success', randomUUID())
  }
}

/** The raw database error stays in the audit log, not in the browser. */
export function exportFailed(): Response {
  return new Response('Export failed. Please try again.', { status: 500 })
}
