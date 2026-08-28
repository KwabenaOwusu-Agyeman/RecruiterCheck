import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import Stripe from 'npm:stripe@17.5.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const RATE_LIMIT_BUCKET = 'request-refund'
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_SECONDS = 3600

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401)
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) {
      return jsonResponse({ error: 'Billing is not configured' }, 503)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: rateLimitAllowed } = await adminClient.rpc(
      'check_and_record_rate_limit',
      {
        p_user_id: user.id,
        p_bucket: RATE_LIMIT_BUCKET,
        p_limit: RATE_LIMIT_MAX,
        p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      },
    )
    if (!rateLimitAllowed) {
      return jsonResponse({
        error: 'Too many refund requests. Please try again later.',
      }, 429)
    }

    const { batchId } = (await req.json()) as { batchId: string }
    if (!batchId) return jsonResponse({ error: 'batchId is required' }, 400)

    const { data: reserveRows, error: reserveError } = await userClient.rpc(
      'reserve_refund',
      { p_batch_id: batchId },
    )
    if (reserveError) {
      console.error('request-refund: reserve_refund failed', reserveError)
      return jsonResponse({
        error: 'Could not process this request. Please try again.',
      }, 500)
    }
    const reservation = reserveRows?.[0]

    switch (reservation?.outcome) {
      case 'batch_not_found':
        return jsonResponse({
          error: 'No eligible purchase found for this account',
        }, 404)
      case 'already_used':
        return jsonResponse({
          error: 'This pack has already been used and is no longer refundable',
        }, 403)
      case 'window_expired':
        return jsonResponse({
          error: 'The 7 day refund window for this pack has passed',
        }, 403)
      case 'active_reservation_exists':
        return jsonResponse({
          error:
            'A scan is currently in progress on this pack. Please try again shortly.',
        }, 409)
      case 'already_refund_pending':
        return jsonResponse({
          error: 'A refund for this pack is already being processed',
        }, 409)
      case 'already_refunded':
        return jsonResponse(
          { error: 'This pack has already been refunded' },
          409,
        )
      case 'reserved':
        break
      default:
        return jsonResponse({
          error: 'Could not process this request. Please try again.',
        }, 500)
    }

    const stripe = new Stripe(stripeSecretKey, {
      // Updated to match the pinned SDK (stripe@17.5.0's own
      // Stripe.LatestApiVersion) instead of the stale '2024-06-20' that
      // was six months behind the installed SDK -- see V4.1 Item 3 report.
      // Production (supabase/functions/request-refund/index.ts) still has
      // the stale value; this candidate file does not touch it.
      apiVersion: '2024-12-18.acacia',
      httpClient: Stripe.createFetchHttpClient(),
    })
    const idempotencyKey = `refund-${reservation.refund_event_id}`

    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(
        reservation.stripe_payment_intent_id,
      )
      if (paymentIntent.status !== 'succeeded') {
        // Definite: this payment intent genuinely never succeeded -- safe
        // to fail and restore eligibility.
        await adminClient.rpc('fail_refund', {
          p_refund_event_id: reservation.refund_event_id,
        })
        return jsonResponse({ error: 'This purchase cannot be refunded' }, 409)
      }

      const existingRefunds = await stripe.refunds.list({
        payment_intent: reservation.stripe_payment_intent_id,
        limit: 3,
      })
      const succeeded = existingRefunds.data.find((r) =>
        r.status === 'succeeded'
      )
      if (succeeded) {
        await adminClient.rpc('finalize_refund', {
          p_refund_event_id: reservation.refund_event_id,
          p_stripe_refund_id: succeeded.id,
        })
        return jsonResponse({ refunded: true })
      }
      const definitelyFailed = existingRefunds.data.length > 0 &&
        existingRefunds.data.every((r) =>
          r.status === 'failed' || r.status === 'canceled'
        )
      if (definitelyFailed) {
        await adminClient.rpc('fail_refund', {
          p_refund_event_id: reservation.refund_event_id,
        })
        return jsonResponse({ error: 'This purchase cannot be refunded' }, 409)
      }
      if (
        existingRefunds.data.some((r) =>
          r.status === 'pending' || r.status === 'requires_action'
        )
      ) {
        // G: uncertain -- leave refund_pending, let reconcile-ambiguous-refunds resolve it.
        return jsonResponse({ refunded: false, reconciling: true })
      }

      let refund: Stripe.Refund
      try {
        refund = await stripe.refunds.create(
          { payment_intent: reservation.stripe_payment_intent_id },
          { idempotencyKey },
        )
      } catch (stripeError) {
        // G: an error here (timeout, connection reset, 5xx) does NOT prove
        // the refund was never created on Stripe's side -- never call
        // fail_refund on ambiguous failure. Leave refund_pending; the
        // dedicated idempotency key means a retried stripe.refunds.create
        // call (from this same request being retried, or from
        // reconcile-ambiguous-refunds) can never create a second refund.
        console.error(
          'request-refund: stripe.refunds.create ambiguous failure',
          {
            category: stripeError instanceof Stripe.errors.StripeConnectionError
              ? 'network_timeout'
              : 'stripe_api_error',
          },
        )
        return jsonResponse({ refunded: false, reconciling: true })
      }

      if (refund.status === 'succeeded') {
        const { error: finalizeError } = await adminClient.rpc(
          'finalize_refund',
          {
            p_refund_event_id: reservation.refund_event_id,
            p_stripe_refund_id: refund.id,
          },
        )
        if (finalizeError) {
          console.error(
            'request-refund: finalize_refund DB call failed after successful Stripe refund',
          )
          return jsonResponse({ refunded: true, reconciling: true }) // reconcile-ambiguous-refunds / charge.refunded webhook recovers this
        }
        return jsonResponse({ refunded: true })
      }
      // Created but not yet 'succeeded' (e.g. 'pending') -- ambiguous, stay pending.
      return jsonResponse({ refunded: false, reconciling: true })
    } catch (error) {
      console.error(
        'request-refund: unexpected error during Stripe interaction',
        error,
      )
      // Genuinely unexpected (not a Stripe API/connection error caught
      // above) -- still do NOT fail_refund here; leave pending for
      // reconciliation rather than risk reopening credits on an ambiguous state.
      return jsonResponse({ refunded: false, reconciling: true })
    }
  } catch (error) {
    console.error('request-refund error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
