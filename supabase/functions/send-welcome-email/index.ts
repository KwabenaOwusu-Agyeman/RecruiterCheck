// Sends the "Your account is ready" welcome email exactly once, to a
// verified, sufficiently-new account. Invoked directly by the authenticated
// client app (see src/services/welcomeEmailService.ts) right after email
// verification, and opportunistically again on later logins so a first
// attempt that didn't complete gets a silent retry — never by a Database
// Webhook (see logic.ts for why).
//
// Auth: verify_jwt = true (supabase/config.toml) means Supabase's gateway
// rejects any request without a validly signed access token before this
// code runs at all. Inside the function, the token is exchanged for a
// fresh user record via auth.getUser(token) — a live GoTrue call, not a
// client-side claims decode — so a token minted before the user actually
// confirmed their email can't be mistaken for a confirmed one. The caller
// can only ever act on their own token's identity: no email address or
// user id is ever read from the request body.
//
// Every outcome — already sent, not yet verified, not rollout-eligible, or
// a genuine send — returns the same generic 200 response shape, so this
// endpoint can't be used to probe another account's verification or
// rollout state (not that it could target another account at all, since
// the identity always comes from the caller's own token).
//
// Duplicate prevention: profiles.welcome_email_sent_at is claimed
// atomically (UPDATE ... WHERE welcome_email_sent_at IS NULL) before
// sending, mirroring the trustpilot_notified_at claim in
// analyze-check/index.ts. If two concurrent invocations race (e.g. two
// tabs, or Strict Mode's double-mount before the client-side dedupe guard
// lands), only one wins the claim and only one email goes out.
//
// If the Brevo send itself then fails (network error, Brevo outage, bad
// API key), the claim is rolled back to null so the user is not
// permanently locked out of ever receiving the welcome email — the next
// login opportunistically retries. This does trade away a strict
// at-most-once guarantee for the rare failure case, but a duplicate
// welcome email is far less harmful than a user who never gets one after
// a transient Brevo error.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { isEmailConfirmed, isRolloutEligible, type AuthenticatedUser } from './logic.ts'
import { buildWelcomeEmail } from '../_shared/email/templates.ts'
import { sendTransactionalEmail } from '../_shared/email/brevoClient.ts'

// Same allow-list as analyze-check. Without these, the browser's CORS
// preflight was answered by the `req.method !== 'POST'` guard below with a
// bare 405 and no CORS headers, so the browser blocked the real POST and
// this function was never actually asked to send anything: it booted on the
// OPTIONS, logged nothing, and welcome_email_sent_at stayed null for every
// account. The preflight must be answered before the method guard.
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Built per call rather than shared at module scope: a Response body can
// only be consumed once, so handing the same instance to two requests fails
// on the second.
const genericOk = () =>
  new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!)

  // A live call to GoTrue's /auth/v1/user, not a local decode of the JWT's
  // own claims — this is what guarantees email_confirmed_at reflects the
  // account's current state rather than whatever it was when the token
  // was minted.
  const { data: userData, error: userError } = await anonClient.auth.getUser(token)
  if (userError || !userData?.user) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders })
  }

  const user: AuthenticatedUser = {
    id: userData.user.id,
    email: userData.user.email,
    email_confirmed_at: userData.user.email_confirmed_at,
  }

  if (!isEmailConfirmed(user)) {
    return genericOk()
  }

  const adminClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('created_at, welcome_email_sent_at')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile) {
    console.error('send-welcome-email: profile lookup failed', { userId: user.id })
    return genericOk()
  }

  if (profile.welcome_email_sent_at) {
    return genericOk()
  }

  if (!isRolloutEligible(profile.created_at, Deno.env.get('WELCOME_EMAIL_ROLLOUT_AT'))) {
    return genericOk()
  }

  const claimTimestamp = new Date().toISOString()

  const { data: claimed, error: claimError } = await adminClient
    .from('profiles')
    .update({ welcome_email_sent_at: claimTimestamp })
    .eq('id', user.id)
    .is('welcome_email_sent_at', null)
    .select('id')

  if (claimError) {
    console.error('send-welcome-email: claim failed', { userId: user.id, message: claimError.message })
    return genericOk()
  }

  if (!claimed || claimed.length === 0) {
    // Already claimed by an earlier concurrent invocation — not an error.
    return genericOk()
  }

  const siteUrl = Deno.env.get('SITE_URL') ?? 'https://myrecruitercheck.com'
  const email = buildWelcomeEmail(`${siteUrl}/checks/new`)

  const result = await sendTransactionalEmail({
    toEmail: user.email!,
    subject: email.subject,
    htmlContent: email.html,
    textContent: email.text,
  })

  if (!result.sent) {
    console.error('send-welcome-email: send failed, reverting claim', {
      userId: user.id,
      reason: result.reason,
    })

    // Roll back the claim so this is retryable on the user's next login
    // rather than permanently skipped. Guarded by the same claimed
    // timestamp so this can't clobber a legitimate newer claim if
    // something else raced in between.
    const { error: revertError } = await adminClient
      .from('profiles')
      .update({ welcome_email_sent_at: null })
      .eq('id', user.id)
      .eq('welcome_email_sent_at', claimTimestamp)

    if (revertError) {
      console.error('send-welcome-email: claim revert failed', {
        userId: user.id,
        message: revertError.message,
      })
    }

    return genericOk()
  }

  return genericOk()
})
