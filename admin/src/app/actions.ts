'use server'

import { redirect } from 'next/navigation'
import { sessionClient } from '@/server/supabase'
import { serviceClient } from '@/server/supabase'
import { requestOrigin } from '@/server/requestOrigin'
import { safeErrorSummary } from '@/lib/redact'

// Rate limit bucket reused from the public app's existing RPC rather than
// inventing a second mechanism. Keyed on the user id once one exists.
const LOGIN_BUCKET = 'admin_login'
const LOGIN_LIMIT = 10
const LOGIN_WINDOW_SECONDS = 15 * 60

export interface LoginState {
  error: string | null
}

export async function signInAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return { error: 'Enter your email address and password.' }
  }

  const supabase = await sessionClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.user) {
    // Deliberately identical wording whether the address is unknown, the
    // password is wrong, or the account exists but is not an admin. Anything
    // more specific turns this form into an account enumeration oracle.
    return { error: 'Those details were not recognised.' }
  }

  // Rate limit after authentication, keyed on the account, so the counter
  // cannot be exhausted for someone else by guessing their address.
  try {
    const { data: allowed } = await serviceClient().rpc('check_and_record_rate_limit', {
      p_user_id: data.user.id,
      p_bucket: LOGIN_BUCKET,
      p_limit: LOGIN_LIMIT,
      p_window_seconds: LOGIN_WINDOW_SECONDS,
    })
    if (allowed === false) {
      await supabase.auth.signOut()
      return { error: 'Too many sign-in attempts. Try again shortly.' }
    }
  } catch (caught) {
    // A rate limiter that is itself broken must not lock the owner out of
    // their own dashboard, so this fails open and is logged.
    console.warn('[login] rate limit check failed:', safeErrorSummary(caught))
  }

  redirect('/')
}

// --- Continue with Google ----------------------------------------------------

export interface OAuthStartState {
  url: string | null
  error: string | null
}

/**
 * Starts the Google flow and RETURNS the provider URL. It must never redirect
 * to it itself.
 *
 * This is the whole reason the action is shaped this way, so do not "simplify"
 * it into a redirect. A Server Action is a form POST, and middleware.ts sets
 * `form-action 'self'` in the Content-Security-Policy. That directive governs
 * not only where a form submits but the redirects the submission then follows,
 * and Chrome enforces it, so redirecting from here to accounts.google.com can
 * be blocked outright. Handing the URL back and letting the browser navigate
 * with window.location.href is a plain navigation, which form-action does not
 * cover.
 *
 * It stays a Server Action rather than moving into the browser so that no
 * Supabase client is ever constructed client side. The PKCE verifier is still
 * written to a cookie here, which is what auth/callback then exchanges the code
 * against.
 *
 * actionContract.test.ts asserts both properties: that the action returns a URL
 * and that it contains no redirect call.
 */
export async function signInWithGoogleAction(): Promise<OAuthStartState> {
  const supabase = await sessionClient()
  const origin = await requestOrigin()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // skipBrowserRedirect keeps supabase-js from trying to navigate, which it
      // cannot do from the server anyway; it returns the URL instead.
      skipBrowserRedirect: true,
      redirectTo: `${origin}/auth/callback`,
    },
  })

  if (error || !data?.url) {
    // A provider that is not enabled on the project reports here. The wording
    // stays generic, but this one is safe to be slightly more helpful about,
    // since it describes the deployment rather than any account.
    console.warn('[login] google sign-in could not start:', safeErrorSummary(error))
    return { url: null, error: 'Google sign-in is unavailable right now.' }
  }

  return { url: data.url, error: null }
}

// --- Magic link --------------------------------------------------------------

export interface MagicLinkState {
  message: string | null
  error: string | null
}

/**
 * One fixed response, returned for every outcome.
 *
 * The address existing, not existing, or existing but not being an admin must
 * be indistinguishable from out here, or this form becomes a way to test
 * whether any given person has an account. The same string is returned when
 * Supabase itself errors, which is why it is a constant rather than something
 * assembled per branch.
 */
const MAGIC_LINK_RESPONSE = 'If that address can sign in here, a link is on its way.'

export async function sendMagicLinkAction(
  _previous: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const email = String(formData.get('magicEmail') ?? '').trim()

  // The only case that answers differently, and it says nothing about any
  // account: the field was left empty.
  if (!email) {
    return { message: null, error: 'Enter your email address.' }
  }

  try {
    const supabase = await sessionClient()
    const origin = await requestOrigin()

    await supabase.auth.signInWithOtp({
      email,
      options: {
        // Without this, typing any address into this box CREATES an account for
        // it. On a form that is reachable without signing in, that is an open
        // account-creation endpoint.
        shouldCreateUser: false,
        emailRedirectTo: `${origin}/auth/confirm?next=/`,
      },
    })
  } catch (caught) {
    // Deliberately swallowed. A thrown error here would otherwise be visible as
    // a different response for some addresses than others, which is the exact
    // distinction this action exists to hide.
    console.warn('[login] magic link request failed:', safeErrorSummary(caught))
  }

  // No rate-limit bucket keyed on the submitted address: an unauthenticated
  // counter keyed on an attacker-supplied value is itself a denial-of-service
  // tool, since anyone could exhaust the owner's allowance by submitting their
  // address. Supabase applies its own send limits per address and per project.
  return { message: MAGIC_LINK_RESPONSE, error: null }
}

export async function signOutAction(): Promise<void> {
  const supabase = await sessionClient()
  await supabase.auth.signOut()
  redirect('/login')
}
