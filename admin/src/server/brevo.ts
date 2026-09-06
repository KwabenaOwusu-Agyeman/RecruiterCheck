import 'server-only'
import { serviceClient } from './supabase'
import { safeErrorSummary } from '@/lib/redact'

// Brevo, read only, via the brevo-stats Edge Function.
//
// This app deliberately holds NO Brevo credential. An earlier version called
// api.brevo.com directly, which would have meant a second copy of
// BREVO_API_KEY living in Vercel: two platforms, two rotation paths, and one
// more place for it to be pasted into a note or caught in a screenshot. The key
// stays in Supabase's secret store, where the Edge Functions already keep it,
// and this app authenticates with the service-role key it already has.
//
// The function can only read, and only from a fixed set of Brevo endpoints it
// builds itself, so nothing sent from here can steer it at another URL or at a
// send endpoint.

export type BrevoState = 'ok' | 'not_configured' | 'failed'

export interface BrevoResult<T> {
  state: BrevoState
  data: T | null
  detail: string | null
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

export interface BrevoList {
  id: number | null
  name: string | null
  totalSubscribers: number | null
  totalBlacklisted: number | null
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

interface FunctionEnvelope<T> {
  state?: string
  data?: T
  detail?: string
  error?: string
}

async function callBrevoStats<T>(body: Record<string, unknown>): Promise<BrevoResult<T>> {
  try {
    // supabase-js attaches this client's key as the Authorization header, so
    // the function sees a service-role JWT and its own role check passes.
    const { data, error } = await serviceClient().functions.invoke<FunctionEnvelope<T>>(
      'brevo-stats',
      { body },
    )

    if (error) {
      return {
        state: 'failed',
        data: null,
        detail: `Could not reach the brevo-stats function: ${safeErrorSummary(error)}`,
      }
    }

    if (!data) {
      return { state: 'failed', data: null, detail: 'brevo-stats returned no body.' }
    }

    if (data.state === 'not_configured') {
      return { state: 'not_configured', data: null, detail: data.detail ?? null }
    }

    if (data.state !== 'ok') {
      return {
        state: 'failed',
        data: null,
        detail: data.detail ?? data.error ?? 'brevo-stats reported a failure.',
      }
    }

    return { state: 'ok', data: (data.data ?? null) as T | null, detail: null }
  } catch (caught) {
    // A failure here is reported as its own state rather than as data, so a
    // Brevo or network outage never looks like "no email was delivered".
    return { state: 'failed', data: null, detail: safeErrorSummary(caught) }
  }
}

export async function getTransactionalStats(
  from: Date,
  toExclusive: Date,
): Promise<BrevoResult<TransactionalStats>> {
  return callBrevoStats<TransactionalStats>({
    action: 'transactional',
    from: from.toISOString(),
    to: toExclusive.toISOString(),
  })
}

/** The newsletter list, for reconciliation against newsletter_subscribers. */
export async function getNewsletterList(): Promise<BrevoResult<BrevoList>> {
  return callBrevoStats<BrevoList>({ action: 'list' })
}

/** Recent campaigns with their global statistics. */
export async function getCampaigns(): Promise<BrevoResult<BrevoCampaign[]>> {
  return callBrevoStats<BrevoCampaign[]>({ action: 'campaigns' })
}
