import 'server-only'
import { env } from './env'
import { safeErrorSummary } from '@/lib/redact'

// Brevo, read only.
//
// Structured like stripe.ts and for the same reasons. There is no send path of
// any kind here: no transactional email, no campaign, no contact write. Sending
// belongs to the Edge Functions that already do it, and adding a send here
// would put a second, less reviewed path to the customer's inbox behind an
// admin session.
//
// Failure is reported as its own state rather than as data. With no key
// configured the screens say plainly that Brevo is not connected, instead of
// rendering zeros that read as "no email was delivered".
//
// Responses are validated field by field rather than trusted, because an API
// shape change should degrade a card to "unavailable" and not throw a 500 on a
// page whose other half is fine.

const BASE = 'https://api.brevo.com/v3'
const TIMEOUT_MS = 8000

export type BrevoState = 'ok' | 'not_configured' | 'failed'

export interface BrevoResult<T> {
  state: BrevoState
  data: T | null
  detail: string | null
}

export const NOT_CONFIGURED_DETAIL =
  'BREVO_API_KEY is not set for this deployment, so email performance has not been read. Add it to enable this screen.'

export function isBrevoConfigured(): boolean {
  return Boolean(env.brevoApiKey)
}

async function brevoGet<T>(path: string): Promise<BrevoResult<T>> {
  const key = env.brevoApiKey
  if (!key) return { state: 'not_configured', data: null, detail: NOT_CONFIGURED_DETAIL }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(`${BASE}${path}`, {
      headers: { 'api-key': key, accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!response.ok) {
      // The status is safe to surface; the body is not, since Brevo echoes
      // request detail back and this is rendered on a page.
      return {
        state: 'failed',
        data: null,
        detail: `Brevo returned ${response.status} for this request.`,
      }
    }

    return { state: 'ok', data: (await response.json()) as T, detail: null }
  } catch (caught) {
    return {
      state: 'failed',
      data: null,
      detail: `Could not reach Brevo: ${safeErrorSummary(caught)}`,
    }
  } finally {
    clearTimeout(timer)
  }
}

/** Brevo's date parameters are plain calendar days. */
function asDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
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
 * Aggregate transactional email performance over a date range.
 *
 * The range is inclusive of both days in Brevo's API, so the caller's exclusive
 * upper bound is stepped back by one day.
 */
export async function getTransactionalStats(
  from: Date,
  toExclusive: Date,
): Promise<BrevoResult<TransactionalStats>> {
  const lastDay = new Date(toExclusive.getTime() - 24 * 60 * 60 * 1000)
  const result = await brevoGet<Record<string, unknown>>(
    `/smtp/statistics/aggregatedReport?startDate=${asDay(from)}&endDate=${asDay(lastDay)}`,
  )
  if (result.state !== 'ok' || !result.data) {
    return { state: result.state, data: null, detail: result.detail }
  }

  const raw = result.data
  return {
    state: 'ok',
    detail: null,
    data: {
      requests: asNumber(raw.requests),
      delivered: asNumber(raw.delivered),
      opens: asNumber(raw.opens),
      uniqueOpens: asNumber(raw.uniqueOpens),
      clicks: asNumber(raw.clicks),
      uniqueClicks: asNumber(raw.uniqueClicks),
      hardBounces: asNumber(raw.hardBounces),
      softBounces: asNumber(raw.softBounces),
      blocked: asNumber(raw.blocked),
      spamReports: asNumber(raw.spamReports),
      unsubscribed: asNumber(raw.unsubscribed),
    },
  }
}

export interface BrevoList {
  id: number | null
  name: string | null
  totalSubscribers: number | null
  totalBlacklisted: number | null
}

/** The newsletter list, for reconciliation against newsletter_subscribers. */
export async function getNewsletterList(): Promise<BrevoResult<BrevoList>> {
  const listId = env.brevoNewsletterListId
  if (!listId) {
    return {
      state: 'not_configured',
      data: null,
      detail:
        'BREVO_NEWSLETTER_LIST_ID is not set, so the Brevo list size cannot be compared against this database.',
    }
  }

  const result = await brevoGet<Record<string, unknown>>(`/contacts/lists/${listId}`)
  if (result.state !== 'ok' || !result.data) {
    return { state: result.state, data: null, detail: result.detail }
  }

  const raw = result.data
  return {
    state: 'ok',
    detail: null,
    data: {
      id: asNumber(raw.id),
      name: typeof raw.name === 'string' ? raw.name : null,
      totalSubscribers: asNumber(raw.totalSubscribers),
      totalBlacklisted: asNumber(raw.totalBlacklisted),
    },
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

/** Recent email campaigns with their global statistics. */
export async function getCampaigns(limit = 20): Promise<BrevoResult<BrevoCampaign[]>> {
  const result = await brevoGet<Record<string, unknown>>(
    `/emailCampaigns?statistics=globalStats&limit=${limit}&offset=0&sort=desc`,
  )
  if (result.state !== 'ok' || !result.data) {
    return { state: result.state, data: null, detail: result.detail }
  }

  const list = Array.isArray(result.data.campaigns) ? result.data.campaigns : []
  const campaigns: BrevoCampaign[] = list.map((entry) => {
    const c = (entry ?? {}) as Record<string, unknown>
    const stats = ((c.statistics as Record<string, unknown>)?.globalStats ?? {}) as Record<
      string,
      unknown
    >
    return {
      id: asNumber(c.id),
      name: typeof c.name === 'string' ? c.name : null,
      subject: typeof c.subject === 'string' ? c.subject : null,
      status: typeof c.status === 'string' ? c.status : null,
      sentDate: typeof c.sentDate === 'string' ? c.sentDate : null,
      sent: asNumber(stats.sent),
      delivered: asNumber(stats.delivered),
      uniqueOpens: asNumber(stats.uniqueViews),
      uniqueClicks: asNumber(stats.uniqueClicks),
      unsubscriptions: asNumber(stats.unsubscriptions),
    }
  })

  return { state: 'ok', data: campaigns, detail: null }
}
