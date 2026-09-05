// Redaction applied to everything that reaches the audit log, an error
// message, a CSV export or the screen.
//
// The dashboard reads a database holding candidate CVs, job descriptions and
// payment records. Operating the business needs identifiers, statuses, amounts
// and timestamps; it never needs the document contents, and it never needs a
// secret. Anything in the deny list below is dropped rather than truncated,
// because a truncated CV is still a CV.

/** Field names whose values must never be logged, exported or displayed. */
const DENIED_KEYS = new Set([
  'job_description',
  'cv_storage_path',
  'cv_file_name',
  'access_token',
  'refresh_token',
  'password',
  'service_role_key',
  'anon_key',
  'api_key',
  'secret',
  'authorization',
  'cookie',
  'claim_token',
  'unsubscribe_token',
  'idempotency_key',
  // Proprietary scoring internals. Exposing these would put the rubric in an
  // export or a log, which is exactly what must not happen.
  'subcriteria',
  'category_totals',
  'evidence_references',
  'rubric_version',
  'prompt_version',
  'strengths',
  'improvements',
  'prospects',
  'result',
])

/** Substrings that mark a key as sensitive even when not named exactly. */
const DENIED_PATTERNS = [/secret/i, /token/i, /password/i, /api[_-]?key/i]

export const REDACTED = '[redacted]'

export function isDeniedKey(key: string): boolean {
  const lower = key.toLowerCase()
  if (DENIED_KEYS.has(lower)) return true
  return DENIED_PATTERNS.some((pattern) => pattern.test(lower))
}

/**
 * Deep-redacts a value for storage in admin_audit_log or display.
 * Denied keys are replaced with a marker rather than removed, so the audit
 * trail still records that a field was involved without recording its value.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}...` : value
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1))

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isDeniedKey(key) ? REDACTED : redact(inner, depth + 1)
    }
    return out
  }

  return REDACTED
}

/**
 * A short, safe description of a failure. Never a stack trace, never a raw
 * provider message: those carry connection strings, keys and row contents.
 */
export function safeErrorSummary(error: unknown): string {
  if (error === null || error === undefined) return 'unknown_error'

  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'unknown_error'

  // Strip anything that looks like a credential or a URL with one in it.
  const scrubbed = raw
    .replace(/(eyJ[A-Za-z0-9_-]{10,})/g, REDACTED)
    .replace(/(sk_(?:live|test)_[A-Za-z0-9]+)/g, REDACTED)
    .replace(/(rk_(?:live|test)_[A-Za-z0-9]+)/g, REDACTED)
    .replace(/(whsec_[A-Za-z0-9]+)/g, REDACTED)
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, REDACTED)
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, `Bearer ${REDACTED}`)

  return scrubbed.length > 200 ? `${scrubbed.slice(0, 200)}...` : scrubbed
}

/**
 * Partially masks an email for display in contexts where the full address is
 * not needed. The Users screen shows full addresses deliberately, since
 * answering "which customer is this" is the point; this is for logs and
 * anywhere an address would merely leak.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return REDACTED
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const head = local.slice(0, 1)
  return `${head}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`
}
