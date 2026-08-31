import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { assertStripeEnvironment } from '../_shared/stripe-environment.ts'
import Stripe from 'npm:stripe@17.5.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GUARANTEE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
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
      .select(
        'id, checks_granted, checks_remaining, keyword_scans_granted, keyword_scans_remaining, stripe_payment_intent_id, granted_at, refund_status',
      )
      .eq('user_id', user.id)
      .eq('source', 'purchase')
      .order('granted_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (batchError || !batch || !batch.stripe_payment_intent_id) {
      return jsonResponse({ error: 'No eligible purchase found for this account' }, 404)
    }

    if (batch.refund_status !== 'active') {
      return jsonResponse({ error: 'This pack has already been refunded' }, 409)
    }

    // A pack grants checks AND keyword scans (grant_pack_credits). Judging
    // "untouched" on checks alone let a customer spend every keyword scan and
    // still take a full refund.
    const checksUntouched = batch.checks_remaining === batch.checks_granted
    const scansUntouched = (batch.keyword_scans_remaining ?? 0) === (batch.keyword_scans_granted ?? 0)
    if (!checksUntouched || !scansUntouched) {
      return jsonResponse({ error: 'This pack has already been used and is no longer refundable' }, 403)
    }

    const purchaseAgeMs = Date.now() - new Date(batch.granted_at).getTime()
    if (purchaseAgeMs > GUARANTEE_WINDOW_MS) {
      return jsonResponse({ error: 'The 7 day refund window for this pack has passed' }, 403)
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-06-20',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const paymentIntent = await stripe.paymentIntents.retrieve(batch.stripe_payment_intent_id)
    if (paymentIntent.status !== 'succeeded') {
      return jsonResponse({ error: 'This purchase cannot be refunded' }, 409)
    }

    const existingRefunds = await stripe.refunds.list({ payment_intent: batch.stripe_payment_intent_id, limit: 1 })
    if (existingRefunds.data.length > 0) {
      return jsonResponse({ error: 'This pack has already been refunded' }, 409)
    }

    await stripe.refunds.create({ payment_intent: batch.stripe_payment_intent_id })

    // Written synchronously so the billing page reflects the refund
    // immediately — the charge.refunded webhook re-applies the same
    // claw-back when it lands, a harmless no-op against an already-zeroed
    // batch.
    const { data: profile } = await adminClient
      .from('profiles')
      .select('checks_balance')
      .eq('id', user.id)
      .single()

    const clawback = Math.min(batch.checks_remaining, profile?.checks_balance ?? 0)
    const scanClawback = batch.keyword_scans_remaining ?? 0

    // refund_status is what marks the batch refunded; leaving it 'active' made
    // a refunded pack indistinguishable from a live one. Keyword scans live on
    // the batch itself (there is no profile-level scan balance), so zeroing
    // them here is the whole claw-back for that credit type.
    await adminClient
      .from('credit_batches')
      .update({ checks_remaining: 0, keyword_scans_remaining: 0, refund_status: 'refunded' })
      .eq('id', batch.id)
    if (profile) {
      await adminClient
        .from('profiles')
        .update({ checks_balance: profile.checks_balance - clawback })
        .eq('id', user.id)
    }

    // Both legs, mirroring the two rows grant_pack_credits writes on purchase,
    // so the ledger balances per credit type instead of only for checks.
    const ledgerRows = [
      {
        user_id: user.id,
        batch_id: batch.id,
        entry_type: 'refunded',
        amount: -clawback,
        credit_type: 'check',
        related_stripe_payment_intent_id: batch.stripe_payment_intent_id,
        note: 'self-service request-refund',
      },
    ]
    if (scanClawback > 0) {
      ledgerRows.push({
        user_id: user.id,
        batch_id: batch.id,
        entry_type: 'refunded',
        amount: -scanClawback,
        credit_type: 'keyword_scan',
        related_stripe_payment_intent_id: batch.stripe_payment_intent_id,
        note: 'self-service request-refund',
      })
    }
    await adminClient.from('check_ledger').insert(ledgerRows)

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
