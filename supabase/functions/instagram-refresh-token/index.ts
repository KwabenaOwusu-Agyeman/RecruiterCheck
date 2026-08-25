// Refreshes the stored long-lived Instagram token before it expires.
// Instagram long-lived tokens last ~60 days and can be refreshed any time
// after they're at least 24h old; this runs daily via pg_cron (see the
// companion migration), which is comfortably inside both bounds. Invoked
// with the service-role key as a bearer token, same as the existing
// purge-expired-uploads cron job.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { refreshLongLivedToken } from '../_shared/instagram-client.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('instagram-refresh-token: missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY')
    return jsonResponse({ error: 'Not configured' }, 503)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: connection, error: fetchError } = await adminClient
    .from('instagram_connection')
    .select('access_token, token_expires_at, connected_at, updated_at')
    .eq('id', true)
    .maybeSingle()

  if (fetchError) {
    console.error('instagram-refresh-token: failed to read connection', fetchError)
    return jsonResponse({ error: 'Failed to read connection' }, 500)
  }

  if (!connection) {
    // Nothing connected yet — not an error, just a no-op until the operator
    // completes instagram-oauth-start/callback once.
    return jsonResponse({ skipped: true, reason: 'no_connection' })
  }

  const tokenAgeMs = Date.now() - new Date(connection.updated_at).getTime()
  if (tokenAgeMs < 24 * 60 * 60 * 1000) {
    return jsonResponse({ skipped: true, reason: 'token_too_new' })
  }

  try {
    const refreshed = await refreshLongLivedToken({ accessToken: connection.access_token })
    const expiresAt = new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString()

    const { error: updateError } = await adminClient
      .from('instagram_connection')
      .update({
        access_token: refreshed.accessToken,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', true)

    if (updateError) {
      console.error('instagram-refresh-token: failed to store refreshed token', updateError)
      return jsonResponse({ error: 'Failed to store refreshed token' }, 500)
    }

    return jsonResponse({ refreshed: true, expiresAt })
  } catch (error) {
    console.error('instagram-refresh-token: refresh call failed', error)
    return jsonResponse({ error: 'Refresh call failed' }, 502)
  }
})

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
