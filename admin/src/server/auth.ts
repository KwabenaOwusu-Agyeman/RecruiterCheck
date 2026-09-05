import 'server-only'
import { redirect } from 'next/navigation'
import { decideAdminAccess, type AuthorizationDecision, type VerifiedSession } from '@/lib/authorize'
import type { AdminUserRow } from '@/types/db'
import { serviceClient, sessionClient } from './supabase'

export interface AdminContext {
  admin: AdminUserRow
  /** The admin's own IANA timezone, already validated. */
  timezone: string
}

/**
 * Resolves the caller's admin status. Deny by default.
 *
 * Two deliberate choices:
 *
 * 1. Identity comes from auth.getUser(), never auth.getSession(). getSession
 *    returns whatever the cookie claims without contacting the auth server, so
 *    a forged or stale cookie would be believed. getUser revalidates the token
 *    server-side. This is the single most important line in the app.
 *
 * 2. The allowlist is read with the SERVICE client, not the caller's own.
 *    admin_users has RLS on with zero policies, so the caller's client sees
 *    nothing there. Reading it as the caller would make every admin look
 *    unauthorised; reading it as the service role is what makes the check work
 *    while keeping the table unreadable to customers.
 */
export async function getAdminAccess(): Promise<AuthorizationDecision> {
  const supabase = await sessionClient()

  const { data: userData, error } = await supabase.auth.getUser()
  if (error || !userData?.user) {
    return { allowed: false, reason: 'no_session' }
  }

  const userId = userData.user.id

  // Assurance level and enrolled factors drive the MFA rule in decideAdminAccess.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const hasEnrolledMfa = Boolean(factors?.totp?.length)

  const session: VerifiedSession = {
    userId,
    assuranceLevel: aal?.currentLevel === 'aal2' ? 'aal2' : 'aal1',
    hasEnrolledMfa,
  }

  const { data: adminRow } = await serviceClient()
    .from('admin_users')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  return decideAdminAccess(session, (adminRow as AdminUserRow | null) ?? null)
}

/**
 * Gate for every admin page and route handler. Redirects rather than
 * returning, so a caller cannot forget to check the result and render anyway.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const decision = await getAdminAccess()

  if (!decision.allowed) {
    // redirect() throws rather than returning, so control never reaches the
    // line after each call. Written as plain conditionals instead of a switch
    // so that neither a reader nor the linter has to know that to follow it.
    if (decision.reason === 'mfa_required') {
      redirect('/login/mfa')
    }
    // A signed-in customer who simply is not an admin is told so on the login
    // screen rather than being bounced around a redirect loop.
    if (decision.reason === 'not_on_allowlist' || decision.reason === 'account_disabled') {
      redirect(`/login?denied=${decision.reason}`)
    }
    redirect('/login')
  }

  return { admin: decision.admin, timezone: decision.admin.timezone }
}

/** Signs the caller out and clears the session cookies. */
export async function signOut(): Promise<void> {
  const supabase = await sessionClient()
  await supabase.auth.signOut()
}
