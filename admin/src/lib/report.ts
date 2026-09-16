// Pure helpers for the read-only report view at /checks/[id]/report.
//
// That view is the one deliberate exception to "report contents never reach
// this dashboard", approved in the Decision Log entry "Control Centre:
// read-only access to check reports for quality review" (16 September 2026).
// The exception covers the screen only. The audit entry built here carries
// identifiers and never the report text, and redact() still drops these
// fields from every log and export.

import type { Json } from '@/types/db'

/**
 * Coerces one stored report section into a list of display strings.
 *
 * analyze-check writes each section as a JSON array of strings. Anything else
 * (an older shape, a null, a stray object) is tolerated rather than thrown on,
 * because a report that cannot be read should render as empty, not crash the
 * page an operator opened to investigate it.
 */
export function normaliseReportSection(value: Json | null | undefined): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      const trimmed = item.trim()
      if (trimmed) out.push(trimmed)
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      const text = (item as Record<string, Json | undefined>).text
      if (typeof text === 'string' && text.trim()) out.push(text.trim())
    }
  }
  return out
}

export const REPORT_VIEWED_ACTION = 'check.report_viewed'

/**
 * Only the owner role may read reports. The decision grants access to the
 * owner, and a second admin added later for operations work should not
 * inherit it silently.
 */
export function canViewReports(role: string | null | undefined): boolean {
  return role === 'owner'
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A malformed id is a missing check, not a database error. */
export function isCheckId(value: string): boolean {
  return UUID_PATTERN.test(value)
}

/**
 * The audit entry for opening a report. Identifiers only: the check id is
 * enough to find what was read, and recording the text would copy candidate
 * content into an append-only table that is meant never to hold it.
 */
export function reportViewAuditEntry(checkId: string) {
  return {
    action: REPORT_VIEWED_ACTION,
    targetType: 'check',
    targetId: checkId,
    reason: 'quality review',
  } as const
}
