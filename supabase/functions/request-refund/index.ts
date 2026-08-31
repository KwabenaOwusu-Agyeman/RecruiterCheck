import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { assertStripeEnvironment } from '../_shared/stripe-environment.ts'
import Stripe from 'npm:stripe@17.5.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Refuse to issue a refund against the wrong Stripe mode.
    try {
      assertStripeEnvironment(stripeSecretKey)
    } catch (error) {
      console.error('request-refund: stripe environment guard failed', {
        message: error instanceof Error ? error.message : String(error),
      })
      return jsonResponse({ error: 'Billing is not configured' }, 503)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: rateLimitAllowed, error: rateLimitError } = await adminClient.rpc(
      'check_and_record_rate_limit',
      {
        p_user_id: user.id,
        p_bucket: RATE_LIMIT_BUCKET,
        p_limit: RATE_LIMIT_MAX,
        p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      },
    )

    if (rateLimitError) {
      console.error('request-refund: rate limit check failed', rateLimitError)
      return jsonResponse({ error: 'Could not process this request. Please try again.' }, 500)
    }
    if (!rateLimitAllowed) {
      return jsonResponse({ error: 'Too many refund requests. Please try again later.' }, 429)
    }

    // Refund policy for packs: the most recent purchased batch only, and
    // only if it's still 100% unused (checks_remaining === checks_granted)
    // and within 7 days of purchase. Because checks are always consumed
    // earliest-expiring-batch-first (see complete_check_analysis), "was this
    // specific batch touched" is well-defined even with several packs
    // stacked — a batch with checks_remaining < checks_granted was
    // definitely drawn from, a batch with no draws yet is untouched.
    const { data: batch, error: batchError } = await adminClient
      .from('credit_batches')
      .select('id')
      .eq('user_id', user.id)
      .eq('source', 'purchase')
      .order('granted_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (batchError || !batch) {
      return jsonResponse({ error: 'No eligible purchase found for this account' }, 404)
    }

    // Eligibility, the refund_pending reservation and the refund_events row are
    // all decided inside reserve_refund, under the global profile-then-batch
    // lock order. Doing those checks out here could not be atomic: two
    // concurrent requests could both read an eligible batch and both refund it.
    // reserve_refund is granted to `authenticated` and reads auth.uid(), so it
    // must be called with the caller's own client, never the service role.
    const { data: reservation, error: reserveError } = await userClient.rpc('reserve_refund', {
      p_batch_id: batch.id,
    })

    if (reserveError) {
      console.error('request-refund: reserve_refund failed', reserveError)
      return jsonResponse({ error: 'Could not start the refund. Please try again.' }, 500)
    }

    const reserved = Array.isArray(reservation) ? reservation[0] : reservation
    switch (reserved?.outcome) {
      case 'reserved':
        break
      case 'batch_not_found':
        return jsonResponse({ error: 'No eligible purchase found for this account' }, 404)
      case 'already_refunded':
      case 'already_refund_pending':
        return jsonResponse({ error: 'This pack has already been refunded' }, 409)
      case 'already_used':
        return jsonResponse({ error: 'This pack has already been used and is no longer refundable' }, 403)
      case 'window_expired':
        return jsonResponse({ error: 'The 7 day refund window for this pack has passed' }, 403)
      case 'active_reservation_exists':
        return jsonResponse(
          { error: 'A Keyword Scan is still running on this pack. Please try again shortly.' },
          409,
        )
      default:
        console.error('request-refund: unexpected reserve_refund outcome', reserved?.outcome)
        return jsonResponse({ error: 'Could not start the refund. Please try again.' }, 500)
    }

    const refundEventId = reserved.refund_event_id as string
    const paymentIntentId = reserved.stripe_payment_intent_id as string | null

    // From here the batch is held in refund_pending. Every exit must either
    // finalize it or fail it, or the pack is left un-refundable forever.
    const releaseReservation = async () => {
      const { error } = await adminClient.rpc('fail_refund', { p_refund_event_id: refundEventId })
      if (error) console.error('request-refund: fail_refund could not restore the batch', error)
    }

    if (!paymentIntentId) {
      await releaseReservation()
      return jsonResponse({ error: 'No eligible purchase found for this account' }, 404)
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-06-20',
      httpClient: Stripe.createFetchHttpClient(),
    })

    let stripeRefundId: string
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
      if (paymentIntent.status !== 'succeeded') {
        await releaseReservation()
        return jsonResponse({ error: 'This purchase cannot be refunded' }, 409)
      }

      const existingRefunds = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 1 })
      if (existingRefunds.data.length > 0) {
        // Already refunded in Stripe but not recorded here: finalize against
        // the existing refund rather than issuing a second one.
        stripeRefundId = existingRefunds.data[0].id
      } else {
        const refund = await stripe.refunds.create({ payment_intent: paymentIntentId })
        stripeRefundId = refund.id
      }
    } catch (stripeError) {
      console.error('request-refund: Stripe refund failed', stripeError)
      await releaseReservation()
      return jsonResponse({ error: 'Could not issue the refund. Please try again or contact support.' }, 502)
    }

    // finalize_refund does the whole claw-back transactionally: zeroes both
    // credit types, sets refund_status, adjusts the profile balance, writes a
    // ledger leg per credit type, and marks the refund_events row succeeded.
    const { error: finalizeError } = await adminClient.rpc('finalize_refund', {
      p_refund_event_id: refundEventId,
      p_stripe_refund_id: stripeRefundId,
    })

    if (finalizeError) {
      // The money has already left. Do NOT release the reservation here: that
      // would mark the batch active again while the customer has been refunded.
      // Leave it pending for reconciliation and report the failure loudly.
      console.error('request-refund: refund issued but finalize_refund failed', {
        refundEventId,
        stripeRefundId,
        message: finalizeError.message,
      })
      return jsonResponse(
        { error: 'Your refund was issued but your account is still updating. Please contact support.' },
        500,
      )
    }

    return jsonResponse({ refunded: true })
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
