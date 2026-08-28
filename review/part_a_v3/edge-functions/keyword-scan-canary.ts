// Deployed to a SEPARATE slug ("keyword-scan-canary"), never the public
// "keyword-scan" slug, during cutover steps 5-9 (RUNBOOK.md). Shares the
// production scan implementation (handleKeywordScanRequest, imported from
// keyword-scan.ts) rather than duplicating business logic -- this file
// only adds the canary allowlist gate in front of it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { handleKeywordScanRequest } from './keyword-scan.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    // Fail closed if configuration is absent -- never fall through to
    // "no allowlist configured, allow everyone."
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      console.error('keyword-scan-canary: missing Supabase configuration')
      return jsonResponse({ error: 'unavailable' }, 503)
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Verify the JWT and derive the user FROM it -- never from any
    // client-supplied field.
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    // Server-side allowlist check. Fails closed on any query error, empty
    // result set treated identically to "not allowlisted" (no special
    // "config missing, allow anyway" branch), and a malformed/absent table
    // (query error) fails closed too.
    const { data: allowlistRow, error: allowlistError } = await adminClient
      .from('keyword_scan_canary_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (allowlistError) {
      console.error(
        'keyword-scan-canary: allowlist lookup failed, failing closed',
        { category: 'allowlist_query_error' },
      )
      return jsonResponse({ error: 'unavailable' }, 503)
    }

    if (!allowlistRow) {
      // Denied user: no credit consumed, no model call -- this return
      // happens before handleKeywordScanRequest (which contains all
      // reservation/model-call logic) is ever invoked.
      console.log('keyword-scan-canary: denied user attempted access', {
        category: 'canary_denied',
      })
      return jsonResponse({
        error: 'unavailable',
        message: 'This feature is not yet available for your account.',
      }, 503)
    }

    // Allowlisted: delegate to the exact same implementation the public
    // slug will run once cutover completes -- no duplicated business logic.
    return await handleKeywordScanRequest(req, {
      userClient,
      adminClient,
      user,
    })
  } catch (error) {
    console.error('keyword-scan-canary error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
