// Pure, network-free logic so it can be unit tested with `npx tsx`, matching
// the pattern used by the other edge functions in this project.

export interface BrevoWebhookPayload {
  event?: string
  email?: string
  [key: string]: unknown
}

/**
 * Brevo events that mean "stop sending to this address", compared after
 * lowercasing.
 *
 * Both spellings are listed on purpose: Brevo's MARKETING webhooks use
 * camelCase (`hardBounce`) while its transactional ones use snake_case
 * (`hard_bounce`). Lowercasing collapses the first to `hardbounce`, which
 * would not have matched a snake_case-only set — hard bounces would have been
 * silently ignored.
 */
const UNSUBSCRIBE_EVENTS = new Set([
  'unsubscribed',
  'unsubscribe',
  'spam',
  'blocked',
  'hard_bounce',
  'hardbounce',
])

export interface ParsedEvent {
  shouldUnsubscribe: boolean
  email: string | null
  reason: string
}

/**
 * Decides whether a Brevo webhook event should mark our subscriber row as
 * unsubscribed.
 *
 * Deliberately narrow: only events that unambiguously mean the recipient
 * should stop receiving mail. A soft bounce or an open is not one of them, and
 * treating them as unsubscribes would silently shrink the list.
 */
export function parseUnsubscribeEvent(payload: BrevoWebhookPayload): ParsedEvent {
  const event = typeof payload?.event === 'string' ? payload.event.toLowerCase().trim() : ''
  const rawEmail = typeof payload?.email === 'string' ? payload.email.trim().toLowerCase() : ''

  if (!event) return { shouldUnsubscribe: false, email: null, reason: 'missing event' }
  if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return { shouldUnsubscribe: false, email: null, reason: 'missing or invalid email' }
  }
  if (!UNSUBSCRIBE_EVENTS.has(event)) {
    return { shouldUnsubscribe: false, email: rawEmail, reason: `ignored event: ${event}` }
  }

  return { shouldUnsubscribe: true, email: rawEmail, reason: event }
}
