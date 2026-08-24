import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.stripe_customer_id) {
      return jsonResponse({ error: 'No billing account found for this user' }, 404)
    }

    const params = new URLSearchParams()
    params.set('customer', profile.stripe_customer_id)
    params.set('return_url', `${siteUrl}/account/billing`)

    const stripeResponse = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
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
      return jsonResponse({ error: 'Could not open billing portal' }, 500)
    }

    const session = await stripeResponse.json()

    return jsonResponse({ url: session.url })
  } catch (error) {
    console.error('create-portal-session error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
