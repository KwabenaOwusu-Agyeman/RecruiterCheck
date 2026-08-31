import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import Stripe from 'npm:stripe@17.5.0'
import { assertStripeEnvironment } from '../_shared/stripe-environment.ts'

// Kept in sync with CHECK_PACKS in src/lib/constants.ts and PACKS in
// create-checkout-session, per this codebase's existing convention of
// duplicating small constants across edge functions.
/**
 * Whether a handler actually did the work the event represents. Only
 * 'fulfilled' may mark the event completed; a 'skipped' event stays
 * reprocessable, because a handler returning without acting is not the same as
 * the event having been handled.
 */
type HandlerOutcome = 'fulfilled' | 'skipped'

const PACKS: Record<'small' | 'medium' | 'large', number> = {
  small: 5,
  medium: 15,
  large: 40,
}

Deno.serve(async (req) => {
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

  if (!stripeSecretKey || !webhookSecret) {
    return new Response('Billing is not configured', { status: 503 })
  }

  // Refuse to process events with a key from the wrong Stripe mode.
  try {
    assertStripeEnvironment(stripeSecretKey)
  } catch (error) {
    console.error('stripe-webhook: stripe environment guard failed', {
      message: error instanceof Error ? error.message : String(error),
    })
    return new Response('Billing is not configured', { status: 503 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  })

  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret)
  } catch (error) {
    console.error('stripe-webhook: signature verification failed', error)
    return new Response('Invalid signature', { status: 400 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // Stripe retries delivery at-least-once on any non-2xx response or
  // timeout, so the same event.id can arrive more than once. Recording it
  // first (unique constraint) lets a replayed delivery be skipped instead of
  // reapplying the same profile update twice.
  // event_type is NOT NULL with no default (added by the Part A migration,
  // 20260828064817 Section D). Omitting it raises 23502, which is not the
  // 23505 the dedupe branch below expects, so every delivery failed with 500.
  const { error: dedupeError } = await adminClient
    .from('stripe_webhook_events')
    .insert({ id: event.id, event_type: event.type })

  if (dedupeError) {
    if (dedupeError.code !== '23505') {
      console.error(`stripe-webhook: could not record event ${event.id}`, dedupeError)
      return new Response('Could not record event', { status: 500 })
    }

    // Already recorded. The row is written BEFORE fulfilment runs, so its
    // existence alone does not mean the event was handled: an attempt that
    // recorded the event and then failed leaves the row behind. Treating that
    // as a duplicate makes the event permanently unprocessable — a fixed
    // function can never reprocess it, because every redelivery short
    // circuits here. Only a completed event is a true duplicate.
    const { data: existing, error: lookupError } = await adminClient
      .from('stripe_webhook_events')
      .select('status, attempt_count')
      .eq('id', event.id)
      .maybeSingle()

    if (lookupError) {
      console.error(`stripe-webhook: could not read recorded event ${event.id}`, lookupError)
      return new Response('Could not record event', { status: 500 })
    }

    if (existing?.status === 'completed') {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Reprocess. Every handler below is safe to re-run: grant_pack_credits is
    // idempotent on stripe_payment_intent_id, and the refund clawback returns
    // early once checks_remaining reaches zero.
    console.log('stripe-webhook: reprocessing an event that never completed', {
      eventId: event.id,
      previousStatus: existing?.status ?? null,
      attempt: (existing?.attempt_count ?? 1) + 1,
    })
    await adminClient
      .from('stripe_webhook_events')
      .update({
        status: 'processing',
        attempt_count: (existing?.attempt_count ?? 1) + 1,
        last_attempted_at: new Date().toISOString(),
      })
      .eq('id', event.id)
  }

  let outcome: HandlerOutcome = 'skipped'

  try {
    switch (event.type) {
      // A session that completes with an unsettled payment method fires
      // 'completed' unpaid, then 'async_payment_succeeded' once it settles.
      // Both must fulfil, and the handler decides from the live session state.
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        outcome = await handlePackCheckoutCompleted(
          adminClient,
          stripe,
          event.data.object as Stripe.Checkout.Session,
        )
        break
      }
      case 'charge.refunded': {
        outcome = await handleChargeRefunded(adminClient, stripe, event.data.object as Stripe.Charge)
        break
      }
      default:
        // An event type this function does not act on is genuinely finished:
        // there is nothing to do now and nothing a retry could do later.
        outcome = 'fulfilled'
        break
    }
  } catch (error) {
    console.error(`stripe-webhook: failed to handle ${event.type} (${event.id})`, error)
    // Sanitised category only, never the raw error — see the column comment
    // on stripe_webhook_events.error_category. Left non-completed so a
    // redelivery reprocesses it.
    await markEvent(adminClient, event.id, 'failed', 'fulfilment_error')
    return new Response('Webhook handler error', { status: 500 })
  }

  // Only real work closes the event. A skip stays in 'processing' so a later
  // redelivery — or a manual resend once the underlying condition changes —
  // reprocesses it instead of being turned away as a duplicate.
  if (outcome === 'fulfilled') {
    await markEvent(adminClient, event.id, 'completed')
  } else {
    console.log('stripe-webhook: event handled without action, left reprocessable', {
      eventId: event.id,
      type: event.type,
    })
  }

  return new Response(JSON.stringify({ received: true, duplicate: false, outcome }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

/**
 * Advances the recorded event out of 'processing'. Only 'completed' makes a
 * later redelivery a true duplicate; every other state stays reprocessable.
 * A failure to write this is logged but never changes the response — the
 * fulfilment outcome has already been decided by this point.
 */
async function markEvent(
  adminClient: ReturnType<typeof createClient>,
  eventId: string,
  status: 'completed' | 'failed',
  errorCategory?: string,
) {
  const { error } = await adminClient
    .from('stripe_webhook_events')
    .update({
      status,
      ...(status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
      ...(errorCategory ? { error_category: errorCategory } : {}),
    })
    .eq('id', eventId)

  if (error) {
    console.error(`stripe-webhook: could not mark event ${eventId} as ${status}`, error)
  }
}

/**
 * A one-time pack purchase. Grants credits via grant_pack_credits, which is
 * itself idempotent on stripe_payment_intent_id — so even though the
 * stripe_webhook_events dedupe above already blocks a replayed *event*, this
 * is a second, independent layer of protection against ever double-granting
 * the same payment.
 *
 * credit_batches carries two constraints added by the Part A migration
 * (20260828064817): a purchase row must have expires_at, and must carry the
 * verified Stripe facts it was fulfilled from — stripe_price_id, amount_paid,
 * currency, quantity, paid_at. The webhook event payload does not include the
 * price id, the quantity, or a payment timestamp, so the session is retrieved
 * with those expanded rather than inferred. grant_pack_credits refuses null
 * facts outright and derives expires_at itself.
 *
 * Every fact below must be STABLE across redeliveries: grant_pack_credits
 * compares all of them on replay and raises fulfilment_conflict if any
 * differs. That is why paid_at comes from the charge's own created timestamp
 * and is never substituted with "now" or a fallback.
 */
async function handlePackCheckoutCompleted(
  adminClient: ReturnType<typeof createClient>,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<HandlerOutcome> {
  const userId = session.client_reference_id ?? session.metadata?.user_id
  const packId = session.metadata?.pack_id as 'small' | 'medium' | 'large' | undefined

  if (!userId || !packId || !(packId in PACKS)) {
    console.error('stripe-webhook: checkout session missing required metadata', {
      userId,
      packId,
    })
    return 'skipped'
  }

  // The payload's payment_status is frozen at event time, and a session can
  // complete unpaid and settle minutes or hours later. Fulfilment must be
  // decided against the LIVE session, never the delivered snapshot. line_items
  // and the charge are not in the payload either, so this retrieve is required
  // regardless.
  const full = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ['line_items', 'payment_intent.latest_charge'],
  })

  if (full.payment_status !== 'paid') {
    console.log('stripe-webhook: checkout session not paid, nothing granted', {
      sessionId: session.id,
      payloadPaymentStatus: session.payment_status,
      livePaymentStatus: full.payment_status,
    })
    return 'skipped'
  }

  const lineItem = full.line_items?.data?.[0]
  const priceId = lineItem?.price?.id ?? null
  const quantity = lineItem?.quantity ?? null

  const paymentIntent =
    full.payment_intent && typeof full.payment_intent !== 'string' ? full.payment_intent : null
  const paymentIntentId = paymentIntent?.id ??
    (typeof full.payment_intent === 'string' ? full.payment_intent : null)

  const charge =
    paymentIntent?.latest_charge && typeof paymentIntent.latest_charge !== 'string'
      ? paymentIntent.latest_charge
      : null

  // Stable across redeliveries, and tied to the actual successful charge
  // rather than to when this delivery happened to be processed.
  const paidAt = charge?.created ? new Date(charge.created * 1000).toISOString() : null

  const missing = Object.entries({
    paymentIntentId,
    priceId,
    quantity,
    amountPaid: full.amount_total,
    currency: full.currency,
    paidAt,
  })
    .filter(([, value]) => value === null || value === undefined)
    .map(([key]) => key)

  if (missing.length > 0) {
    // Throw rather than return: these facts exist for a paid session, so a
    // gap here is transient or a Stripe-side surprise. A 500 lets Stripe
    // retry instead of silently dropping a paid order.
    console.error('stripe-webhook: cannot fulfil, verified purchase facts missing', {
      sessionId: session.id,
      missing,
    })
    throw new Error(`missing_verified_purchase_facts: ${missing.join(', ')}`)
  }

  const { data, error } = await adminClient.rpc('grant_pack_credits', {
    p_user_id: userId,
    p_pack_id: packId,
    p_stripe_payment_intent_id: paymentIntentId,
    p_stripe_checkout_session_id: session.id,
    p_stripe_price_id: priceId,
    p_amount_paid: full.amount_total,
    p_currency: full.currency,
    p_quantity: quantity,
    p_paid_at: paidAt,
  })

  if (error) {
    console.error('stripe-webhook: grant_pack_credits failed', error)
    throw error
  }

  const result = Array.isArray(data) ? data[0] : data
  console.log('stripe-webhook: pack fulfilled', {
    sessionId: session.id,
    packId,
    alreadyGranted: result?.already_granted ?? null,
    batchId: result?.batch_id ?? null,
  })
  return 'fulfilled'
}

/**
 * Safety net for a refund issued outside the self-service request-refund
 * function (a manual Stripe Dashboard refund, or a dispute) — claws back
 * whatever's still unused on the batch that payment_intent funded.
 */
async function handleChargeRefunded(
  adminClient: ReturnType<typeof createClient>,
  stripe: Stripe,
  charge: Stripe.Charge,
): Promise<HandlerOutcome> {
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id

  if (!paymentIntentId) {
    console.error('stripe-webhook: charge.refunded missing payment_intent')
    // Nothing identifies the batch and never will: terminal, not retryable.
    return 'fulfilled'
  }

  // refund_events records the Stripe Refund id (prefix re_), never the charge
  // id. The charge payload may not carry an expanded refunds list, so read it
  // from the API rather than guessing.
  const refunds = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 1 })
  const stripeRefundId = refunds.data[0]?.id
  if (!stripeRefundId) {
    console.error('stripe-webhook: charge.refunded but no refund found for', paymentIntentId)
    return 'skipped'
  }

  // recover_external_refund exists for exactly this path: a refund issued
  // outside the self-service flow (a Stripe Dashboard refund, or a dispute).
  // It opens a refund_events row if one is not already pending and delegates
  // to finalize_refund, so the dashboard path and the self-service path end in
  // identical state. Doing the claw-back by hand here is what left refunds
  // with no audit trail, an 'active' refund_status and un-reversed keyword
  // scans.
  const { data, error } = await adminClient.rpc('recover_external_refund', {
    p_stripe_payment_intent_id: paymentIntentId,
    p_stripe_refund_id: stripeRefundId,
  })

  if (error) {
    console.error('stripe-webhook: recover_external_refund failed', error)
    throw error
  }

  const outcome = (Array.isArray(data) ? data[0] : data)?.outcome
  console.log('stripe-webhook: external refund reconciled', { paymentIntentId, outcome })

  switch (outcome) {
    case 'finalized':
    case 'already_finalized':
    case 'already_refunded':
      return 'fulfilled'
    case 'batch_not_found':
      // The purchase may not be fulfilled yet; a later attempt could find it.
      return 'skipped'
    default:
      console.error('stripe-webhook: unexpected recover_external_refund outcome', outcome)
      return 'skipped'
  }
}

