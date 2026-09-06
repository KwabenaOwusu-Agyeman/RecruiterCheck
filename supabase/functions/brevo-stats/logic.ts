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
 * Whether the caller presented a token SHAPED like a service-role JWT.
 *
 * This is a cheap pre-filter only, and is deliberately NOT the gate. It decodes
 * the payload without verifying the signature, so on its own it would accept a
 * forged unsigned token claiming role: service_role. It is safe here only
 * because callers must also pass matchesServiceRoleKey below.
 *
 * purge-expired-uploads relies on a decode like this alone, which is sound
 * today because verify_jwt defaults to true for a function not listed in
 * config.toml. Resting a gate on an implicit default is not something to repeat
 * in new code.
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

/**
 * Whether the presented bearer token IS the service-role key.
 *
 * This is the actual gate. Comparing against the key the function itself holds
 * proves the caller possesses it, rather than trusting an unverified claim
 * inside the token, so the check holds even if the gateway ever stopped
 * verifying signatures for this function.
 *
 * The comparison is constant time: a length-leaking or early-exit compare on a
 * secret lets an attacker recover it byte by byte from response timings.
 */
export function matchesServiceRoleKey(
  authorizationHeader: string | null,
  serviceRoleKey: string | undefined,
): boolean {
  if (!serviceRoleKey) return false

  const match = (authorizationHeader ?? '').match(/^Bearer (.+)$/)
  if (!match) return false

  const presented = match[1]
  if (presented.length !== serviceRoleKey.length) return false

  let difference = 0
  for (let i = 0; i < presented.length; i += 1) {
    difference |= presented.charCodeAt(i) ^ serviceRoleKey.charCodeAt(i)
  }
  return difference === 0
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
