// Kicks off Instagram's "Business Login for Instagram" OAuth flow
// (instagram.com/oauth/authorize — no linked Facebook Page required). This
// site has exactly one admin (you) and no admin session/role system, so
// access is gated by a long random INSTAGRAM_ADMIN_TOKEN secret you keep in
// your password manager, passed as ?admin_token=... — never your Instagram
// password, and never checked into anything.
import { createSignedState } from '../_shared/signed-state.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Scopes for the Instagram API with Instagram Login product. Confirm these
// are still current at https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/#instagram-app-permissions
// before relying on this in production — permission names have changed
// before and Meta does not keep old names as aliases.
const SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_insights',
].join(',')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const providedToken = url.searchParams.get('admin_token') ?? ''
  const adminToken = Deno.env.get('INSTAGRAM_ADMIN_TOKEN')
  const appId = Deno.env.get('INSTAGRAM_APP_ID')
  const redirectUri = Deno.env.get('INSTAGRAM_OAUTH_REDIRECT_URI')
  const stateSecret = Deno.env.get('INSTAGRAM_STATE_SECRET')

  if (!adminToken || !appId || !redirectUri || !stateSecret) {
    console.error('instagram-oauth-start: missing required environment variables')
    return jsonResponse({ error: 'Instagram OAuth is not configured' }, 503)
  }

  if (!timingSafeEqual(providedToken, adminToken)) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const state = await createSignedState(stateSecret)

  const authorizeUrl = new URL('https://www.instagram.com/oauth/authorize')
  authorizeUrl.searchParams.set('client_id', appId)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('scope', SCOPES)
  authorizeUrl.searchParams.set('state', state)
  // Without this, Instagram defaults to a hybrid Facebook-login-backed
  // authorize flow, which mints a `code` that api.instagram.com/oauth/access_token
  // (the pure Instagram Login token exchange we use) rejects with a
  // misleading "redirect_uri" error. Forces the pure Instagram-only login
  // path this app is registered for.
  authorizeUrl.searchParams.set('enable_fb_login', 'false')

  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: authorizeUrl.toString() },
  })
})

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
