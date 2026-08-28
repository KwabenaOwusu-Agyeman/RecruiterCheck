import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import Stripe from 'npm:stripe@17.5.0'
import { ENVIRONMENT_LABEL, PACK_PRICE_MAP } from './price-config.ts'

Deno.serve(async (req) => {
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!stripeSecretKey || !webhookSecret) {
    return new Response('Billing is not configured', { status: 503 })
  }

  if (!PACK_PRICE_MAP) {
    console.error(
      'stripe-webhook: price configuration missing or incomplete for environment',
      ENVIRONMENT_LABEL,
    )
    return new Response('Billing configuration invalid', { status: 503 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  const stripe = new Stripe(stripeSecretKey, {
    // Updated to match the pinned SDK -- see the identical note in
    // request-refund.ts and the V4.1 Item 3 report.
    apiVersion: '2024-12-18.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  })
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
    )
  } catch (error) {
    console.error('stripe-webhook: signature verification failed', error)
    return new Response('Invalid signature', { status: 400 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: claimRows, error: claimError } = await adminClient.rpc(
    'claim_stripe_webhook_event',
    {
      p_event_id: event.id,
      p_event_type: event.type,
    },
  )
  if (claimError) {
    console.error('stripe-webhook: claim RPC failed', claimError)
    return new Response('Could not process event', { status: 500 }) // retryable
  }
  const claim = claimRows?.[0] as {
    outcome: string
    claim_token: string | null
    attempt_count: number
  } | undefined

  if (claim?.outcome === 'already_completed') {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (claim?.outcome === 'contention') {
    // D/7: never 200 for an event we didn't finish. Non-2xx -> Stripe retries.
    return new Response(
      JSON.stringify({ received: false, status: 'processing_elsewhere' }),
      { status: 409 },
    )
  }
  const claimToken = claim?.claim_token
  if (!claimToken) {
    console.error(
      'stripe-webhook: unexpected claim outcome without a token',
      claim,
    )
    return new Response('Internal error', { status: 500 })
  }

  let outcomeCategory:
    | 'fulfilled'
    | 'ignored_by_design'
    | 'permanently_invalid'
    | 'retryable_failure' = 'ignored_by_design'

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        outcomeCategory = await handlePackCheckoutCompleted(
          stripe,
          adminClient,
          event.data.object as Stripe.Checkout.Session,
        )
        break
      }
      case 'charge.refunded': {
        await handleChargeRefunded(
          stripe,
          adminClient,
          event.data.object as Stripe.Charge,
        )
        outcomeCategory = 'fulfilled'
        break
      }
      default:
        outcomeCategory = 'ignored_by_design'
        break
    }

    if (
      outcomeCategory === 'fulfilled' || outcomeCategory === 'ignored_by_design'
    ) {
      const { data: completeRows } = await adminClient.rpc(
        'complete_stripe_webhook_event',
        {
          p_event_id: event.id,
          p_claim_token: claimToken,
        },
      )
      const completeOutcome = completeRows?.[0]?.outcome
      if (completeOutcome === 'stale_claim') {
        // D: our lease expired and another worker already reclaimed this
        // event -- we must not report success for work we can no longer
        // attest actually completed under our own claim.
        console.error(
          'stripe-webhook: stale claim on complete -- another worker reclaimed this event',
          event.id,
        )
        return new Response('Stale claim', { status: 409 })
      }
      return new Response(
        JSON.stringify({ received: true, outcome: outcomeCategory }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (outcomeCategory === 'permanently_invalid') {
      await adminClient.rpc('complete_stripe_webhook_event', {
        p_event_id: event.id,
        p_claim_token: claimToken,
      })
      console.error(
        'stripe-webhook: permanently invalid event, acked without fulfilment',
        event.id,
      )
      return new Response(
        JSON.stringify({ received: true, outcome: 'permanently_invalid' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    throw new Error(`unresolved_outcome_${outcomeCategory}`)
  } catch (error) {
    const category =
      error instanceof Error && error.message.includes('fulfilment_conflict')
        ? 'fulfilment_conflict'
        : 'internal_error'
    console.error(
      `stripe-webhook: ${event.type} (${event.id}) failed`,
      category,
    )
    const { data: failRows } = await adminClient.rpc(
      'fail_stripe_webhook_event',
      {
        p_event_id: event.id,
        p_claim_token: claimToken,
        p_error_category: category,
      },
    )
    if (failRows?.[0]?.outcome === 'stale_claim') {
      console.error(
        'stripe-webhook: stale claim on fail -- another worker reclaimed this event',
        event.id,
      )
    }
    return new Response('Webhook handler error', { status: 500 }) // retryable
  }
})

async function handlePackCheckoutCompleted(
  stripe: Stripe,
  adminClient: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<'fulfilled' | 'permanently_invalid'> {
  if (session.mode !== 'payment') return 'permanently_invalid'
  if (session.payment_status !== 'paid') {
    console.error(
      'stripe-webhook: unexpected non-paid session for card-only checkout',
      session.id,
    )
    return 'permanently_invalid'
  }

  const userId = session.client_reference_id
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id
  if (!userId || !paymentIntentId) return 'permanently_invalid'

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 5,
  })
  if (lineItems.data.length !== 1) return 'permanently_invalid'
  const priceId = lineItems.data[0].price?.id
  const quantity = lineItems.data[0].quantity ?? 0
  if (!priceId || !PACK_PRICE_MAP![priceId]) return 'permanently_invalid'
  const expected = PACK_PRICE_MAP![priceId]
  if (
    quantity !== 1 || session.amount_total !== expected.expectedAmount ||
    session.currency !== expected.expectedCurrency
  ) {
    console.error(
      'stripe-webhook: amount/currency/quantity mismatch',
      expected.packId,
    )
    return 'permanently_invalid'
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
  if (paymentIntent.status !== 'succeeded') return 'permanently_invalid'

  // F: verified successful-payment timestamp. NO fallback to
  // paymentIntent.created -- if the charge's own verified timestamp can't
  // be obtained, this is a retryable failure (the exception below causes
  // fail_stripe_webhook_event, and Stripe's own retry, or a manual
  // redelivery, tries again later rather than granting with an unverified
  // timestamp).
  const latestChargeId = typeof paymentIntent.latest_charge === 'string'
    ? paymentIntent.latest_charge
    : paymentIntent.latest_charge?.id
  if (!latestChargeId) {
    throw new Error(
      'no_verified_payment_timestamp: payment intent has no latest_charge',
    )
  }
  const charge = await stripe.charges.retrieve(latestChargeId)
  if (!charge.created || charge.status !== 'succeeded') {
    throw new Error(
      'no_verified_payment_timestamp: charge not in a succeeded state',
    )
  }
  const verifiedPaidAt = new Date(charge.created * 1000).toISOString()

  const { error } = await adminClient.rpc('grant_pack_credits', {
    p_user_id: userId,
    p_pack_id: expected.packId,
    p_stripe_payment_intent_id: paymentIntentId,
    p_stripe_checkout_session_id: session.id,
    p_stripe_price_id: priceId,
    p_amount_paid: session.amount_total,
    p_currency: session.currency,
    p_quantity: quantity,
    p_paid_at: verifiedPaidAt,
  })

  if (error) {
    if (error.message?.includes('fulfilment_conflict')) {
      throw new Error(`fulfilment_conflict: ${error.message}`)
    }
    throw error
  }
  return 'fulfilled'
}

async function handleChargeRefunded(
  stripe: Stripe,
  adminClient: SupabaseClient,
  charge: Stripe.Charge,
) {
  const paymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id
  if (!paymentIntentId) return

  // G: the actual Stripe Refund object id, never charge.id. A charge can
  // have multiple refunds (partial refunds) -- take the most recent
  // succeeded one for this recovery path.
  const refunds = charge.refunds?.data ??
    (await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 10 }))
      .data
  const succeededRefund = refunds.find((r) => r.status === 'succeeded')
  if (!succeededRefund) {
    console.error(
      'stripe-webhook: charge.refunded event but no succeeded Refund object found',
      charge.id,
    )
    return
  }

  await adminClient.rpc('recover_external_refund', {
    p_stripe_payment_intent_id: paymentIntentId,
    p_stripe_refund_id: succeededRefund.id, // re_..., not charge.id (ch_...)
  })
}
