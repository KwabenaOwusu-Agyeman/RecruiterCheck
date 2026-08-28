import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  ENVIRONMENT_LABEL,
  PACK_PRICE_MAP,
  priceIdForPack,
} from './price-config.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

interface CheckoutRequest {
  packId: 'small' | 'medium' | 'large'
}

const PACK_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Item 28: fail closed if this environment's price config is missing/invalid.
    if (!PACK_PRICE_MAP) {
      console.error(
        'create-checkout-session: price configuration invalid for environment',
        ENVIRONMENT_LABEL,
      )
      return jsonResponse({ error: 'Billing is not configured' }, 503)
    }

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

    const { packId } = (await req.json()) as CheckoutRequest
    if (!packId || !['small', 'medium', 'large'].includes(packId)) {
      return jsonResponse({ error: 'Invalid pack' }, 400)
    }

    const priceId = priceIdForPack(packId)
    if (!priceId) {
      console.error(
        'create-checkout-session: no Price ID configured for pack',
        packId,
        ENVIRONMENT_LABEL,
      )
      return jsonResponse({ error: 'Billing is not configured' }, 503)
    }

    const expiresAt = new Date(Date.now() + PACK_EXPIRY_MS).toISOString()

    const params = new URLSearchParams()
    params.set('mode', 'payment')
    // F/9: card only -- eliminates the async-payment-status gap entirely.
    // No other payment_method_types are added anywhere in this request, so
    // no Stripe Dashboard default-enabled method (e.g. SEPA, iDEAL) can be
    // silently offered to the customer at Checkout.
    params.set('payment_method_types[0]', 'card')
    params.set('success_url', `${siteUrl}/account/billing?status=success`)
    params.set('cancel_url', `${siteUrl}/account/billing?status=cancelled`)
    params.set('client_reference_id', user.id)
    params.set('customer_email', user.email ?? '')
    params.set('managed_payments[enabled]', 'false')
    params.set('line_items[0][price]', priceId)
    params.set('line_items[0][quantity]', '1')
    params.set('metadata[pack_id]', packId) // advisory only -- the webhook
    // re-derives pack identity from the verified Price ID, never trusts
    // this metadata value alone
    params.set('metadata[user_id]', user.id)
    params.set('metadata[expires_at]', expiresAt)
    params.set('payment_intent_data[metadata][pack_id]', packId)
    params.set('payment_intent_data[metadata][user_id]', user.id)

    const stripeResponse = await fetch(
      'https://api.stripe.com/v1/checkout/sessions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
    )

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
