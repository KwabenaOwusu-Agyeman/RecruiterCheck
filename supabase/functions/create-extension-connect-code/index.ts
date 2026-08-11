import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://recruitercheck.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Minted while the user is signed in on the web app, redeemed once by the
// extension via exchange-extension-connect-code. Short-lived, single-use.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

    const code = generateCode()

    const adminClient = createClient(supabaseUrl, supabaseServiceKey)
    const { error: insertError } = await adminClient
      .from('extension_connect_codes')
      .insert({ code, user_id: user.id })

    if (insertError) {
      console.error('create-extension-connect-code: insert failed', { message: insertError.message })
      return jsonResponse({ error: 'Could not start the connection. Try again.' }, 500)
    }

    return jsonResponse({ code })
  } catch (error) {
    console.error('create-extension-connect-code error:', error)
    return jsonResponse({ error: 'Could not start the connection. Try again.' }, 500)
  }
})

function generateCode(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
