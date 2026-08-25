// OAuth redirect target for instagram-oauth-start. Meta redirects the
// browser here with ?code=...&state=...; this exchanges the code for a
// short-lived token, upgrades it to a 60-day long-lived token, fetches the
// connected account's id/username, and stores all of that in the
// single-row instagram_connection table (service-role only, see
// supabase/migrations/20260822120000_instagram_integration.sql). Renders a
// small HTML page since this is loaded directly in the operator's browser,
// not called by client code.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { exchangeCodeForShortLivedToken, exchangeForLongLivedToken, getAccountInfo } from '../_shared/instagram-client.ts'
import { verifySignedState } from '../_shared/signed-state.ts'

Deno.serve(async (req) => {
  const url = new URL(req.url)

  const oauthError = url.searchParams.get('error')
  if (oauthError) {
    return htmlResponse(`Instagram declined the connection: ${escapeHtml(url.searchParams.get('error_description') ?? oauthError)}`, 400)
  }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) {
    return htmlResponse('Missing code or state parameter.', 400)
  }

  const appId = Deno.env.get('INSTAGRAM_APP_ID')
  const appSecret = Deno.env.get('INSTAGRAM_APP_SECRET')
  const redirectUri = Deno.env.get('INSTAGRAM_OAUTH_REDIRECT_URI')
  const stateSecret = Deno.env.get('INSTAGRAM_STATE_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!appId || !appSecret || !redirectUri || !stateSecret || !supabaseUrl || !serviceRoleKey) {
    console.error('instagram-oauth-callback: missing required environment variables')
    return htmlResponse('Instagram OAuth is not configured on the server.', 503)
  }

  const stateCheck = await verifySignedState(stateSecret, state)
  if (!stateCheck.valid) {
    console.error('instagram-oauth-callback: state verification failed', { reason: stateCheck.reason })
    return htmlResponse('This connection link is invalid or has expired. Start the connection again.', 401)
  }

  try {
    console.log('instagram-oauth-callback: debug', {
      appId,
      appIdLength: appId.length,
      redirectUri,
      redirectUriLength: redirectUri.length,
      redirectUriJson: JSON.stringify(redirectUri),
      appSecretLength: appSecret.length,
      codeLength: code.length,
    })
    const shortLived = await exchangeCodeForShortLivedToken({ appId, appSecret, redirectUri, code })
    const longLived = await exchangeForLongLivedToken({ appSecret, shortLivedAccessToken: shortLived.accessToken })
    const account = await getAccountInfo({
      accessToken: longLived.accessToken,
      igUserId: shortLived.igUserId,
      graphApiVersion: mustGetGraphApiVersion(),
    })

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const expiresAt = new Date(Date.now() + longLived.expiresInSeconds * 1000).toISOString()

    const { error: upsertError } = await adminClient
      .from('instagram_connection')
      .upsert({
        id: true,
        ig_user_id: account.id,
        ig_username: account.username,
        access_token: longLived.accessToken,
        token_expires_at: expiresAt,
        scopes: shortLived.permissions.join(','),
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

    if (upsertError) {
      console.error('instagram-oauth-callback: failed to store connection', upsertError)
      return htmlResponse('Connected to Instagram, but saving the token failed. Check the function logs.', 500)
    }

    return htmlResponse(
      `Connected to Instagram as @${escapeHtml(account.username)}. You can close this tab. The token is valid for about 60 days and will auto-refresh.`,
      200,
    )
  } catch (error) {
    console.error('instagram-oauth-callback error:', error)
    return htmlResponse('Something went wrong connecting to Instagram. Check the function logs for details.', 500)
  }
})

function mustGetGraphApiVersion(): string {
  const version = Deno.env.get('GRAPH_API_VERSION')
  if (!version) {
    throw new Error(
      'GRAPH_API_VERSION is not set. Check https://developers.facebook.com/docs/graph-api/changelog for the current version before setting it.',
    )
  }
  return version
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function htmlResponse(message: string, status: number): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Instagram connection</title></head><body style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; line-height: 1.5;"><p>${message}</p></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}
