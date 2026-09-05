// Display formatting. Pure, so it is testable, and shared by the screens and
// the CSV exports so an export never disagrees with what was on screen.

/**
 * Money from Stripe minor units. Never sums across currencies: callers pass one
 * currency at a time, because adding euros to pounds produces a number that
 * means nothing.
 */
export function formatMoney(minorUnits: number, currency: string, locale = 'en-GB'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(minorUnits / 100)
}

export function formatNumber(value: number, locale = 'en-GB'): string {
  return new Intl.NumberFormat(locale).format(value)
}

export function formatPercent(value: number, locale = 'en-GB'): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}%`
}

/** Compact, human duration. Used for processing times and ages. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return 'unknown'
  if (seconds < 1) return 'under a second'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = seconds / 60
  if (minutes < 60) {
    const m = Math.floor(minutes)
    const s = Math.round(seconds - m * 60)
    return s === 0 ? `${m}m` : `${m}m ${s}s`
  }
  const hours = minutes / 60
  if (hours < 24) {
    const h = Math.floor(hours)
    const m = Math.round(minutes - h * 60)
    return m === 0 ? `${h}h` : `${h}h ${m}m`
  }
  const days = Math.floor(hours / 24)
  const h = Math.round(hours - days * 24)
  return h === 0 ? `${days}d` : `${days}d ${h}h`
}

/** Absolute timestamp in the admin's own zone, with the zone named. */
export function formatDateTime(iso: string | null, timeZone: string, locale = 'en-GB'): string {
  if (!iso) return 'never'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function formatDate(iso: string | null, timeZone: string, locale = 'en-GB'): string {
  if (!iso) return 'never'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: 'medium' }).format(date)
}

/** "3 minutes ago". Relative time is for recency, never for precision. */
export function formatRelative(iso: string | null, now: Date): string {
  if (!iso) return 'never'
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return 'unknown'
  const seconds = (now.getTime() - then.getTime()) / 1000
  if (seconds < 0) return 'in the future'
  if (seconds < 60) return 'just now'
  return `${formatDuration(seconds)} ago`
}

/** Shortens a UUID for display while keeping it recognisable. */
export function shortId(id: string | null): string {
  if (!id) return '-'
  return id.length <= 12 ? id : `${id.slice(0, 8)}...`
}
