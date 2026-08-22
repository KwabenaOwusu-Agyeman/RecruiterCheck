import { supabase } from '@/lib/supabase'
import type { Provider } from '@supabase/supabase-js'

/**
 * Maps raw Supabase auth errors to generic copy for sign-in/sign-up so a
 * failed attempt can't be used to enumerate which emails already have an
 * account (Supabase's own messages, e.g. "User already registered" or
 * "Invalid login credentials", would otherwise leak that directly).
 */
export function mapAuthError(_err: unknown, context: 'sign-in' | 'sign-up'): string {
  if (context === 'sign-up') {
    return 'Could not create your account. Please check your details and try again.'
  }
  return 'Could not sign in. Check your email and password and try again.'
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
  if (error) throw error
}

export async function signInWithLinkedIn() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'linkedin_oidc',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
  if (error) throw error
}

/** Returns true if the account needs email confirmation before it can sign in. */
export async function signUpWithPassword(email: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
  })
  if (error) throw error
  return !data.session
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function resetPasswordForEmail(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  })
  if (error) throw error
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data.user
}

export type AuthProvider = Extract<Provider, 'google' | 'linkedin_oidc'>
