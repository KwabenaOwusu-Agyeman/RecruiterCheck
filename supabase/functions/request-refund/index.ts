import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
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

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.stripe_customer_id) {
      return jsonResponse({ error: 'No billing history found for this account' }, 404)
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-06-20',
      httpClient: Stripe.createFetchHttpClient(),
    })

    // The guarantee applies to a customer's very first paid invoice only.
    // Listing up to 100 invoices and taking the last one is enough to find
    // it in practice — a customer would need 100+ weekly invoices (roughly
    // two years) before this stopped being the oldest one in a single page,
    // and by then the 7 day window below would already exclude them anyway.
    const invoices = await stripe.invoices.list({
      customer: profile.stripe_customer_id,
      status: 'paid',
      limit: 100,
    })

    const firstInvoice = invoices.data[invoices.data.length - 1]
    if (!firstInvoice) {
      return jsonResponse({ error: 'No paid invoice found for this account' }, 404)
    }

    const invoiceAgeMs = Date.now() - firstInvoice.created * 1000
    if (invoiceAgeMs > GUARANTEE_WINDOW_MS) {
      return jsonResponse(
        { error: 'The 7 day refund window for your first paid check has passed' },
        403,
      )
    }

    const chargeId =
      typeof firstInvoice.charge === 'string' ? firstInvoice.charge : firstInvoice.charge?.id
    if (!chargeId) {
      return jsonResponse({ error: 'No charge found for your first paid check' }, 404)
    }

    const charge = await stripe.charges.retrieve(chargeId)
    if (charge.refunded) {
      return jsonResponse({ error: 'Your first paid check has already been refunded' }, 409)
    }

    await stripe.refunds.create({ charge: chargeId })

    // Cancel whichever subscription is currently active, not necessarily the
    // plan the refunded invoice was for — the customer may have upgraded
    // since that first payment, and the guarantee ends paid access
    // entirely, not just reverts a plan change.
    const { data: activeSubscription } = await adminClient
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .not('stripe_subscription_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (activeSubscription?.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(activeSubscription.stripe_subscription_id)
      } catch (error) {
        // The refund itself already succeeded above — a subscription that's
        // already cancelled (e.g. the customer cancelled it themselves
        // first) isn't fatal to the refund having gone through.
        console.error('request-refund: could not cancel subscription', error)
      }
      await adminClient
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('stripe_subscription_id', activeSubscription.stripe_subscription_id)
    }

    // Written synchronously so the billing page reflects the downgrade
    // immediately, same convention as changeExistingSubscription in
    // create-checkout-session — the charge.refunded webhook re-applies the
    // same values when it lands, a harmless no-op.
    await adminClient
      .from('profiles')
      .update({
        subscription_tier: 'free',
        subscription_status: 'cancelled',
        period_checks_consumed: 0,
        period_checks_limit: 0,
      })
      .eq('id', user.id)

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
