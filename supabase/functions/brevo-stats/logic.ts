// Pure logic for the brevo-stats function.
//
// Everything here is free of Deno and network APIs so it can be run under tsx
// by the repo's test runner, matching analyze-check/logic.ts and
// trustpilot-email.ts.
//
// This function exists so the admin dashboard can read Brevo WITHOUT a second
// copy of BREVO_API_KEY. The key already lives here as a Supabase function
// secret; putting it in Vercel as well would mean two platforms, two rotation
// paths, and one more place for it to be pasted or screenshotted. The dashboard
// calls this with its service-role key instead and never sees the Brevo key.

/** The read-only operations this function is willing to perform. */
export type BrevoAction = 'transactional' | 'list' | 'campaigns'

const ACTIONS: readonly BrevoAction[] = ['transactional', 'list', 'campaigns']

/**
 * Whether the caller presented a service-role JWT.
 *
 * The signature is verified by the gateway, which config.toml pins explicitly
 * to verify_jwt = true for this function rather than leaving it to the CLI
 * default. That is what makes decoding the claim here sufficient: a token that
 * reaches this code has already been proven to be signed by the project.
 *
 * The check still has work to do, because an ordinary signed-in CUSTOMER also
 * presents a validly signed JWT and must not be able to read the company's
 * email performance. Same approach as purge-expired-uploads.
 *
 * An earlier version of this also compared the bearer token against
 * SUPABASE_SERVICE_ROLE_KEY, on the theory that proving possession beat
 * trusting a claim. It rejected the legitimate caller: the value injected into
 * the function is not byte-identical to the key the dashboard authenticates
 * with. Comparing against a value whose format this code cannot verify would
 * have kept breaking on any key rotation, so the gate is the signature plus the
 * claim, and the signature is pinned in config.
 */
export function isServiceRoleToken(authorizationHeader: string | null): boolean {
  const match = (authorizationHeader ?? '').match(/^Bearer (.+)$/)
  if (!match) return false

  const parts = match[1].split('.')
  if (parts.length !== 3) return false

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded))
    return payload?.role === 'service_role'
  } catch {
    return false
  }
}

export function parseAction(value: unknown): BrevoAction | null {
  return ACTIONS.includes(value as BrevoAction) ? (value as BrevoAction) : null
}

/**
 * Brevo's report endpoints take inclusive calendar days. Callers pass an
 * exclusive upper bound (the convention used everywhere else in this codebase),
 * so the last day is stepped back by one.
 */
export function toReportRange(
  fromIso: unknown,
  toExclusiveIso: unknown,
): { startDate: string; endDate: string } | null {
  if (typeof fromIso !== 'string' || typeof toExclusiveIso !== 'string') return null

  const from = new Date(fromIso)
  const toExclusive = new Date(toExclusiveIso)
  if (Number.isNaN(from.getTime()) || Number.isNaN(toExclusive.getTime())) return null
  if (toExclusive <= from) return null

  const lastDay = new Date(toExclusive.getTime() - 24 * 60 * 60 * 1000)
  return {
    startDate: from.toISOString().slice(0, 10),
    endDate: lastDay.toISOString().slice(0, 10),
  }
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export interface TransactionalStats {
  requests: number | null
  delivered: number | null
  opens: number | null
  uniqueOpens: number | null
  clicks: number | null
  uniqueClicks: number | null
  hardBounces: number | null
  softBounces: number | null
  blocked: number | null
  spamReports: number | null
  unsubscribed: number | null
}

/**
 * Narrows Brevo's aggregate report to the fields the dashboard shows.
 *
 * Field by field rather than passed through, so a shape change degrades one
 * card to "unavailable" instead of putting an unexpected payload on screen.
 */
export function shapeTransactional(raw: unknown): TransactionalStats {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    requests: asNumber(r.requests),
    delivered: asNumber(r.delivered),
    opens: asNumber(r.opens),
    uniqueOpens: asNumber(r.uniqueOpens),
    clicks: asNumber(r.clicks),
    uniqueClicks: asNumber(r.uniqueClicks),
    hardBounces: asNumber(r.hardBounces),
    softBounces: asNumber(r.softBounces),
    blocked: asNumber(r.blocked),
    spamReports: asNumber(r.spamReports),
    unsubscribed: asNumber(r.unsubscribed),
  }
}

export interface BrevoList {
  id: number | null
  name: string | null
  totalSubscribers: number | null
  totalBlacklisted: number | null
}

export function shapeList(raw: unknown): BrevoList {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    id: asNumber(r.id),
    name: asString(r.name),
    totalSubscribers: asNumber(r.totalSubscribers),
    totalBlacklisted: asNumber(r.totalBlacklisted),
  }
}

export interface BrevoCampaign {
  id: number | null
  name: string | null
  subject: string | null
  status: string | null
  sentDate: string | null
  sent: number | null
  delivered: number | null
  uniqueOpens: number | null
  uniqueClicks: number | null
  unsubscriptions: number | null
}

export function shapeCampaigns(raw: unknown): BrevoCampaign[] {
  const r = (raw ?? {}) as Record<string, unknown>
  const list = Array.isArray(r.campaigns) ? r.campaigns : []

  return list.map((entry) => {
    const c = (entry ?? {}) as Record<string, unknown>
    const statistics = (c.statistics ?? {}) as Record<string, unknown>
    const stats = (statistics.globalStats ?? {}) as Record<string, unknown>
    return {
      id: asNumber(c.id),
      name: asString(c.name),
      subject: asString(c.subject),
      status: asString(c.status),
      sentDate: asString(c.sentDate),
      sent: asNumber(stats.sent),
      delivered: asNumber(stats.delivered),
      uniqueOpens: asNumber(stats.uniqueViews),
      uniqueClicks: asNumber(stats.uniqueClicks),
      unsubscriptions: asNumber(stats.unsubscriptions),
    }
  })
}

/**
 * The Brevo path for an action. Built here rather than at the call site so the
 * set of endpoints this function can reach is fixed, auditable, and cannot be
 * influenced by the request body.
 */
export function brevoPathFor(
  action: BrevoAction,
  options: { range?: { startDate: string; endDate: string }; listId?: string },
): string | null {
  switch (action) {
    case 'transactional':
      if (!options.range) return null
      return `/smtp/statistics/aggregatedReport?startDate=${options.range.startDate}&endDate=${options.range.endDate}`
    case 'list': {
      // Digits only. The id reaches this from configuration, but constraining
      // it means no value can ever steer the request to another path.
      if (!options.listId || !/^\d+$/.test(options.listId)) return null
      return `/contacts/lists/${options.listId}`
    }
    case 'campaigns':
      return '/emailCampaigns?statistics=globalStats&limit=20&offset=0&sort=desc'
  }
}
