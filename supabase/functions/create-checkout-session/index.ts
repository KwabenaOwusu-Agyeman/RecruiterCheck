import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CheckoutRequest {
  plan: 'premium_weekly' | 'premium_monthly'
}

const PLAN_PRICES: Record<CheckoutRequest['plan'], { amount: number; interval: string; name: string }> = {
  premium_weekly: { amount: 999, interval: 'week', name: 'Premium Weekly' },
  premium_monthly: { amount: 1999, interval: 'month', name: 'Premium Monthly' },
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

    const params = new URLSearchParams()
    params.set('mode', 'subscription')
    params.set('success_url', `${siteUrl}/account/billing?status=success`)
    params.set('cancel_url', `${siteUrl}/account/billing?status=cancelled`)
    params.set('client_reference_id', user.id)
    params.set('customer_email', user.email ?? '')
    // This Stripe account has Managed Payments on by default, which requires
    // a product tax_code on ad-hoc price_data line items unless disabled here.
    params.set('managed_payments[enabled]', 'false')
    params.set('line_items[0][price_data][currency]', 'eur')
    params.set('line_items[0][price_data][unit_amount]', String(planConfig.amount))
    params.set('line_items[0][price_data][recurring][interval]', planConfig.interval)
    params.set('line_items[0][price_data][product_data][name]', planConfig.name)
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
