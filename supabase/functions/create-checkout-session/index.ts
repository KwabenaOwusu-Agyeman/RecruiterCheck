import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CheckoutRequest {
  packId: 'small' | 'medium' | 'large'
}

// Kept in sync with CHECK_PACKS in src/lib/constants.ts and the PACKS mirror
// in stripe-webhook, per this codebase's existing convention of duplicating
// small constants across edge functions rather than sharing a module across
// separate deployables. priceId points at a named, one-time Price created
// for each pack's Product in the Stripe dashboard — Checkout references
// these by ID rather than building ad-hoc price_data on every request, so
// the dashboard shows real product/price names instead of untitled one-off
// line items.
const PACKS: Record<CheckoutRequest['packId'], { priceId: string; name: string; checks: number }> = {
  small: { priceId: 'price_1U8GqxPoeQ54WTPbSEbWZnkv', name: 'Small Check Pack', checks: 5 },
  medium: { priceId: 'price_1U8GqyPoeQ54WTPbdj2GIJ2O', name: 'Medium Check Pack', checks: 15 },
  large: { priceId: 'price_1U8GqzPoeQ54WTPbPQqYwP35', name: 'Large Check Pack', checks: 40 },
}

const PACK_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000

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

    const { packId } = (await req.json()) as CheckoutRequest
    if (!packId || !PACKS[packId]) {
      return jsonResponse({ error: 'Invalid pack' }, 400)
    }

    const pack = PACKS[packId]
    const expiresAt = new Date(Date.now() + PACK_EXPIRY_MS).toISOString()

    const params = new URLSearchParams()
    params.set('mode', 'payment')
    params.set('success_url', `${siteUrl}/account/billing?status=success`)
    params.set('cancel_url', `${siteUrl}/account/billing?status=cancelled`)
    params.set('client_reference_id', user.id)
    params.set('customer_email', user.email ?? '')
    // This Stripe account has Managed Payments on by default, which requires
    // a product tax_code unless disabled here — the Products created for
    // these packs don't have one set.
    params.set('managed_payments[enabled]', 'false')
    params.set('line_items[0][price]', pack.priceId)
    params.set('line_items[0][quantity]', '1')
    params.set('metadata[pack_id]', packId)
    params.set('metadata[user_id]', user.id)
    params.set('metadata[checks]', String(pack.checks))
    params.set('metadata[expires_at]', expiresAt)
    params.set('payment_intent_data[metadata][pack_id]', packId)
    params.set('payment_intent_data[metadata][user_id]', user.id)
    params.set('payment_intent_data[metadata][checks]', String(pack.checks))
    params.set('payment_intent_data[metadata][expires_at]', expiresAt)

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
