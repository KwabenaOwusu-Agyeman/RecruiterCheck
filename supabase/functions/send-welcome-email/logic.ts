// Pure, network-free logic for send-welcome-email (split out so it can be
// unit tested via `npx tsx` without the Deno runtime, matching the pattern
// used by analyze-check/logic.ts and trustpilot-email.ts).
//
// This function is invoked directly by the authenticated client app after
// email verification or on a later login (see src/services/welcomeEmailService.ts
// and src/hooks/useAuth.tsx) — not by a Database Webhook. Supabase's free
// plan project this app runs on is missing the `supabase_functions` schema
// the dashboard's Webhooks feature depends on, and recreating Supabase's
// own platform-managed schema ourselves was ruled out, so this is an
// application-triggered design instead: verify_jwt = true (see
// supabase/config.toml) means Supabase's own gateway rejects any request
// without a validly signed access token before this code ever runs.

export interface AuthenticatedUser {
  id: string
  email: string | null | undefined
  email_confirmed_at: string | null | undefined
}

/**
 * A user is eligible for the welcome email only if their email is
 * genuinely confirmed. Checked against the fresh user record from
 * `auth.getUser(token)` (a live call to GoTrue), never against JWT claims
 * decoded client-side, since a token minted before confirmation could
 * otherwise still read as "confirmed" if only the claims were trusted.
 */
export function isEmailConfirmed(user: AuthenticatedUser): boolean {
  return Boolean(user.email) && Boolean(user.email_confirmed_at)
}

/**
 * Rollout gate: only accounts created on or after WELCOME_EMAIL_ROLLOUT_AT
 * are eligible, so existing verified users never suddenly receive a
 * welcome email once this ships. Fails closed (not eligible) whenever the
 * configured cutoff is missing or unparseable — a misconfiguration must
 * never silently widen eligibility to everyone.
 */
export function isRolloutEligible(profileCreatedAt: string, rolloutAtEnv: string | null | undefined): boolean {
  if (!rolloutAtEnv) return false

  const rolloutAt = Date.parse(rolloutAtEnv)
  const createdAt = Date.parse(profileCreatedAt)
  if (Number.isNaN(rolloutAt) || Number.isNaN(createdAt)) return false

  return createdAt >= rolloutAt
}
