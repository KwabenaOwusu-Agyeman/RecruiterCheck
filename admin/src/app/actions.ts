'use server'

import { redirect } from 'next/navigation'
import { sessionClient } from '@/server/supabase'
import { serviceClient } from '@/server/supabase'
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

export async function signOutAction(): Promise<void> {
  const supabase = await sessionClient()
  await supabase.auth.signOut()
  redirect('/login')
}
