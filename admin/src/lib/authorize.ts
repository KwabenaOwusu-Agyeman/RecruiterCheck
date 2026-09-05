// The admin authorisation decision, isolated as a pure function so it can be
// tested exhaustively without a database, a session or a Next.js runtime.
//
// The rule is deny by default. Access requires a real server-verified session
// AND a matching, non-disabled row in admin_users. Nothing the browser sends
// participates in the decision: no email, no role field, no JWT claim.

import type { AdminUserRow } from '@/types/db'

export interface VerifiedSession {
  /** auth.users.id, taken from a server-side session check, never from a body. */
  userId: string
  /** Authenticator Assurance Level reported by Supabase: aal1 or aal2. */
  assuranceLevel: 'aal1' | 'aal2'
  /** Whether this user has at least one verified MFA factor enrolled. */
  hasEnrolledMfa: boolean
}

export type DenialReason =
  | 'no_session'
  | 'not_on_allowlist'
  | 'account_disabled'
  | 'mfa_required'

export type AuthorizationDecision =
  | { allowed: true; admin: AdminUserRow }
  | { allowed: false; reason: DenialReason }

export const DENIAL_MESSAGES: Record<DenialReason, string> = {
  no_session: 'Sign in to continue.',
  not_on_allowlist: 'This account does not have admin access.',
  account_disabled: 'This admin account has been disabled.',
  mfa_required: 'Complete two factor authentication to continue.',
}

/**
 * @param session  null when no valid server-side session exists
 * @param adminRow null when the user has no admin_users row at all
 */
export function decideAdminAccess(
  session: VerifiedSession | null,
  adminRow: AdminUserRow | null,
): AuthorizationDecision {
  if (!session) return { allowed: false, reason: 'no_session' }

  // Absence from the allowlist is the common denial: an ordinary customer
  // signing in with a perfectly valid session still gets nothing.
  if (!adminRow) return { allowed: false, reason: 'not_on_allowlist' }

  if (adminRow.disabled_at !== null) return { allowed: false, reason: 'account_disabled' }

  // A mismatch here would mean the row was looked up for a different user than
  // the session belongs to, which is a programming error rather than a denial
  // the UI should explain. Fail closed.
  if (adminRow.user_id !== session.userId) return { allowed: false, reason: 'not_on_allowlist' }

  // MFA is enforced once enrolled rather than mandated for everyone, so an
  // admin is never locked out by turning it on. Enrolling is a one-way ratchet:
  // once a factor exists, aal1 alone stops being sufficient.
  if (session.hasEnrolledMfa && session.assuranceLevel !== 'aal2') {
    return { allowed: false, reason: 'mfa_required' }
  }

  return { allowed: true, admin: adminRow }
}
