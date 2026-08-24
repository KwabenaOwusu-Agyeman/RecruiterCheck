import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CheckoutRequest {
  plan: 'starter' | 'active' | 'power'
}

// Kept in sync with PRICING_PLANS in src/lib/constants.ts and the
// PLAN_CHECK_LIMITS mirror in stripe-webhook, per this codebase's existing
// convention of duplicating small constants across edge functions rather
// than sharing a module across separate deployables. priceId points at the
// named, recurring weekly Price created for each plan's Product in the
// Stripe dashboard (see stripe_api_write PostProducts) — Checkout and
// subscription updates reference these by ID rather than building ad-hoc
// price_data on every request, so the dashboard shows real product/price
// names instead of untitled one-off line items.
const PLAN_PRICES: Record<CheckoutRequest['plan'], { priceId: string; name: string; checks: number }> = {
  starter: { priceId: 'price_1U6PODPoeQ54WTPbYhgBXkLo', name: 'Starter', checks: 5 },
  active: { priceId: 'price_1U6POFPoeQ54WTPbq4XoQ5al', name: 'Active', checks: 10 },
  power: { priceId: 'price_1U6POGPoeQ54WTPbLjZPectM', name: 'Power', checks: 20 },
}

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
    const siteUrl = Deno.env.get('SITE_URL') ?? 'http://localhost:5173'

    if (!stripeSecretKey) {
      return jsonResponse({ error: 'Billing is not configured' }, 503)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

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

    const { plan } = (await req.json()) as CheckoutRequest
    if (!plan || !PLAN_PRICES[plan]) {
      return jsonResponse({ error: 'Invalid plan' }, 400)
    }

    const planConfig = PLAN_PRICES[plan]

    // A user switching plans while already subscribed must have their
    // EXISTING Stripe subscription modified, not a second one created
    // alongside it — a fresh Checkout Session always creates a brand new
    // subscription, which would leave both billing simultaneously, and
    // later cancelling just the old one would incorrectly reset the user to
    // Free even though the newer subscription is still active. "Users can
    // view own subscriptions" RLS lets this read happen on the user-scoped
    // client without needing the service role key here.
    const { data: existingSubscription } = await userClient
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .not('stripe_subscription_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingSubscription?.stripe_subscription_id) {
      return await changeExistingSubscription(
        stripeSecretKey,
        supabaseUrl,
        existingSubscription.stripe_subscription_id,
        user.id,
        plan,
        planConfig,
      )
    }

    const params = new URLSearchParams()
    params.set('mode', 'subscription')
    params.set('success_url', `${siteUrl}/account/billing?status=success`)
    params.set('cancel_url', `${siteUrl}/account/billing?status=cancelled`)
    params.set('client_reference_id', user.id)
    params.set('customer_email', user.email ?? '')
    // This Stripe account has Managed Payments on by default, which requires
    // a product tax_code unless disabled here — the Products created for
    // these plans don't have one set.
    params.set('managed_payments[enabled]', 'false')
    params.set('line_items[0][price]', planConfig.priceId)
    params.set('line_items[0][quantity]', '1')
    params.set('metadata[plan]', plan)
    params.set('metadata[user_id]', user.id)
    params.set('subscription_data[metadata][plan]', plan)
    params.set('subscription_data[metadata][user_id]', user.id)

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!stripeResponse.ok) {
      const errorText = await stripeResponse.text()
      console.error('Stripe error:', errorText)
      return jsonResponse({ error: 'Could not create checkout session' }, 500)
    }

    const session = await stripeResponse.json()

    return jsonResponse({ url: session.url })
  } catch (error) {
    console.error('create-checkout-session error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * Swaps the price on an already-active Stripe subscription in place
 * (proration invoiced on the next renewal) rather than creating a second
 * subscription via Checkout. Also writes profiles/subscriptions directly
 * with the service role, rather than waiting on the customer.subscription.updated
 * webhook, so the client's refreshProfile() right after this returns sees
 * the new plan immediately instead of racing the webhook's own delivery.
 * stripe-webhook's handler re-applies the same values when its event lands,
 * which is a harmless no-op.
 */
async function changeExistingSubscription(
  stripeSecretKey: string,
  supabaseUrl: string,
  subscriptionId: string,
  userId: string,
  plan: CheckoutRequest['plan'],
  planConfig: { priceId: string; name: string; checks: number },
): Promise<Response> {
  const getResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    headers: { Authorization: `Bearer ${stripeSecretKey}` },
  })

  if (!getResponse.ok) {
    console.error('changeExistingSubscription: could not fetch subscription', await getResponse.text())
    return jsonResponse({ error: 'Could not update your subscription' }, 500)
  }

  const subscription = await getResponse.json()
  const itemId = subscription.items?.data?.[0]?.id
  if (!itemId) {
    console.error('changeExistingSubscription: subscription has no item to update', subscriptionId)
    return jsonResponse({ error: 'Could not update your subscription' }, 500)
  }

  const updateParams = new URLSearchParams()
  updateParams.set('items[0][id]', itemId)
  updateParams.set('items[0][price]', planConfig.priceId)
  updateParams.set('proration_behavior', 'create_prorations')
  updateParams.set('metadata[plan]', plan)

  const updateResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: updateParams.toString(),
  })

  if (!updateResponse.ok) {
    console.error('changeExistingSubscription: Stripe update failed', await updateResponse.text())
    return jsonResponse({ error: 'Could not update your subscription' }, 500)
  }

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  await adminClient
    .from('profiles')
    .update({ subscription_tier: plan, period_checks_limit: planConfig.checks })
    .eq('id', userId)
  await adminClient
    .from('subscriptions')
    .update({ plan })
    .eq('stripe_subscription_id', subscriptionId)

  return jsonResponse({ updated: true })
}
