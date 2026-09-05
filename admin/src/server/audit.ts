import 'server-only'
import { randomUUID } from 'node:crypto'
import { redact, safeErrorSummary } from '@/lib/redact'
import type { Json } from '@/types/database'
import type { AdminActionResult, AdminUserRow, Database } from '@/types/db'
import { serviceClient } from './supabase'

export interface AuditEntry {
  action: string
  targetType?: string | null
  targetId?: string | null
  reason?: string | null
  before?: unknown
  after?: unknown
}

/**
 * Writes one row to admin_audit_log. Everything in before/after passes through
 * redact() first, so a caller cannot accidentally log a CV or a token by
 * handing over a whole database row.
 *
 * A failure to write the log is reported but never thrown: losing an audit row
 * is bad, and turning a completed action into an apparent error is worse,
 * because the operator would retry an action that already took effect.
 */
export async function writeAuditLog(
  admin: AdminUserRow,
  entry: AuditEntry,
  result: AdminActionResult,
  correlationId: string,
  errorSummary?: string | null,
): Promise<void> {
  try {
    // Built as an explicitly typed value rather than inline, so a schema
    // mismatch is reported against the field that is wrong instead of
    // collapsing the whole insert overload into an unhelpful error.
    const payload: Database['public']['Tables']['admin_audit_log']['Insert'] = {
      admin_user_id: admin.user_id,
      admin_email: admin.email,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      reason: entry.reason ?? null,
      // redact() returns unknown by design; the cast is to the Json type the
      // jsonb column accepts.
      before: entry.before === undefined ? null : (redact(entry.before) as Json),
      after: entry.after === undefined ? null : (redact(entry.after) as Json),
      result,
      error_summary: errorSummary ?? null,
      correlation_id: correlationId,
    }

    const { error } = await serviceClient().from('admin_audit_log').insert(payload)

    if (error) console.error('[audit] write failed:', safeErrorSummary(error))
  } catch (caught) {
    console.error('[audit] write threw:', safeErrorSummary(caught))
  }
}

export interface ActionOutcome<T> {
  ok: boolean
  data?: T
  error?: string
  correlationId: string
}

/**
 * Runs a privileged action and records it, whether it succeeds or fails.
 *
 * Both outcomes are logged deliberately: a failed refund attempt is exactly
 * the kind of event someone needs to find later, and a log that only records
 * successes is the one that is useless during an incident.
 */
export async function recordAdminAction<T>(
  admin: AdminUserRow,
  entry: AuditEntry,
  run: () => Promise<T>,
): Promise<ActionOutcome<T>> {
  const correlationId = randomUUID()
  try {
    const data = await run()
    await writeAuditLog(admin, { ...entry, after: entry.after ?? data }, 'success', correlationId)
    return { ok: true, data, correlationId }
  } catch (caught) {
    const summary = safeErrorSummary(caught)
    await writeAuditLog(admin, entry, 'failure', correlationId, summary)
    return { ok: false, error: summary, correlationId }
  }
}
