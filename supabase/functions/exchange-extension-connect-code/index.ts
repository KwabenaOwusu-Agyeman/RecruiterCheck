import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GENERIC_ERROR = 'This connection link is invalid or expired. Try connecting again.'

interface ExchangeRequest {
  code: string
}

// Called by the extension BEFORE it has any session of its own — there is no
// Authorization header to check here (verify_jwt is off for this function).
// The one-time `code` itself is the credential: it was minted only for a
// signed-in web user and is single-use + short-lived. On success this hands
// back a magic-link token_hash, not a session — the extension must still
// redeem it itself via supabase.auth.verifyOtp() using its own anon-key
// client. No service-role key and no ready-made access token ever leaves
// this function.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { code } = (await req.json()) as ExchangeRequest
    if (!code || typeof code !== 'string' || code.length > 128) {
      return jsonResponse({ error: GENERIC_ERROR }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Atomic single-use claim: only the first caller to redeem a given code
    // gets a row back, closing the replay window between check and use.
    const { data: claimed, error: claimError } = await adminClient
      .from('extension_connect_codes')
      .update({ used: true })
      .eq('code', code)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .select('user_id')
      .maybeSingle()

    if (claimError || !claimed) {
      return jsonResponse({ error: GENERIC_ERROR }, 401)
    }

    const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(
      claimed.user_id,
    )

    if (userError || !userData?.user?.email) {
      console.error('exchange-extension-connect-code: user lookup failed', {
        message: userError?.message,
      })
      return jsonResponse({ error: GENERIC_ERROR }, 500)
    }

    const email = userData.user.email

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('exchange-extension-connect-code: generateLink failed', {
        message: linkError?.message,
      })
      return jsonResponse({ error: GENERIC_ERROR }, 500)
    }

    return jsonResponse({ email, tokenHash: linkData.properties.hashed_token })
  } catch (error) {
    console.error('exchange-extension-connect-code error:', error)
    return jsonResponse({ error: GENERIC_ERROR }, 500)
  }
})

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
