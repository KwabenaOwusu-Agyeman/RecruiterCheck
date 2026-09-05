import 'server-only'
import Stripe from 'stripe'
import { env } from './env'
import { safeErrorSummary } from '@/lib/redact'

// Stripe is authoritative for payment and refund status. This module only ever
// READS: there is no charge, no refund and no customer mutation anywhere in
// the admin app. Executing a refund is deliberately out of scope for this
// phase, and adding it should mean adding a new, separately reviewed module
// rather than extending this one.
//
// A restricted key with read-only permissions on Charges, Refunds, Payment
// Intents and Checkout Sessions is sufficient and is what should be used.

let client: Stripe | null = null

function stripe(): Stripe | null {
  const key = env.stripeSecretKey
  if (!key) return null
  // Pinned to the version this SDK release is built against, so a Stripe API
  // change cannot alter what this dashboard reports without a deliberate
  // dependency bump.
  if (!client) client = new Stripe(key, { apiVersion: '2026-08-26.dahlia' })
  return client
}

export type ReconciliationStatus =
  | 'matched'
  | 'mismatch'
  | 'missing_in_stripe'
  | 'not_checked'
  | 'lookup_failed'

export interface PaymentReconciliation {
  status: ReconciliationStatus
  /** Human-readable explanation, shown when the status is not 'matched'. */
  detail: string | null
  stripeAmount: number | null
  stripeCurrency: string | null
  stripeStatus: string | null
  stripeRefunded: boolean | null
}

export const NOT_CHECKED: PaymentReconciliation = {
  status: 'not_checked',
  detail:
    'STRIPE_SECRET_KEY is not configured, so these rows show the application record only and have not been compared against Stripe.',
  stripeAmount: null,
  stripeCurrency: null,
  stripeStatus: null,
  stripeRefunded: null,
}

export function isStripeConfigured(): boolean {
  return env.isStripeConfigured
}

/**
 * Compares one stored purchase against Stripe.
 *
 * Where the two disagree this reports a mismatch and says what differs. It
 * never rewrites the local record and never prefers one source silently:
 * surfacing the disagreement is the whole point, because a dashboard that
 * quietly picks a winner hides exactly the incident an operator needs to see.
 */
export async function reconcilePayment(
  paymentIntentId: string | null,
  expected: { amount: number | null; currency: string | null },
): Promise<PaymentReconciliation> {
  const client = stripe()
  if (!client) return NOT_CHECKED

  if (!paymentIntentId) {
    return {
      ...NOT_CHECKED,
      status: 'missing_in_stripe',
      detail: 'This purchase record has no Stripe payment intent id to compare against.',
    }
  }

  try {
    const intent = await client.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge'],
    })

    const charge =
      intent.latest_charge && typeof intent.latest_charge !== 'string'
        ? intent.latest_charge
        : null

    const stripeAmount = intent.amount_received || intent.amount
    const stripeCurrency = intent.currency?.toUpperCase() ?? null
    const refunded = charge?.refunded ?? false

    const differences: string[] = []
    if (expected.amount !== null && expected.amount !== stripeAmount) {
      differences.push(`amount recorded ${expected.amount}, Stripe reports ${stripeAmount}`)
    }
    if (
      expected.currency !== null &&
      stripeCurrency !== null &&
      expected.currency.toUpperCase() !== stripeCurrency
    ) {
      differences.push(`currency recorded ${expected.currency}, Stripe reports ${stripeCurrency}`)
    }
    if (intent.status !== 'succeeded') {
      differences.push(`Stripe status is ${intent.status}, not succeeded`)
    }

    return {
      status: differences.length > 0 ? 'mismatch' : 'matched',
      detail: differences.length > 0 ? differences.join('; ') : null,
      stripeAmount,
      stripeCurrency,
      stripeStatus: intent.status,
      stripeRefunded: refunded,
    }
  } catch (caught) {
    // A Stripe outage or a deleted object must not be presented as a
    // discrepancy in the data, so the failure is reported as its own state.
    const summary = safeErrorSummary(caught)
    if (summary.toLowerCase().includes('no such payment_intent')) {
      return {
        ...NOT_CHECKED,
        status: 'missing_in_stripe',
        detail: 'Stripe has no payment intent with this id.',
      }
    }
    return {
      ...NOT_CHECKED,
      status: 'lookup_failed',
      detail: `Could not reach Stripe to verify this row: ${summary}`,
    }
  }
}

export interface RefundReconciliation {
  status: ReconciliationStatus
  detail: string | null
  stripeStatus: string | null
}

export async function reconcileRefund(refundId: string | null): Promise<RefundReconciliation> {
  const client = stripe()
  if (!client) return { status: 'not_checked', detail: NOT_CHECKED.detail, stripeStatus: null }
  if (!refundId) {
    return {
      status: 'missing_in_stripe',
      detail: 'No Stripe refund id was recorded, so there is nothing to verify.',
      stripeStatus: null,
    }
  }

  try {
    const refund = await client.refunds.retrieve(refundId)
    return {
      status: refund.status === 'succeeded' ? 'matched' : 'mismatch',
      detail:
        refund.status === 'succeeded' ? null : `Stripe reports this refund as ${refund.status}.`,
      stripeStatus: refund.status ?? null,
    }
  } catch (caught) {
    return {
      status: 'lookup_failed',
      detail: `Could not reach Stripe to verify this refund: ${safeErrorSummary(caught)}`,
      stripeStatus: null,
    }
  }
}
