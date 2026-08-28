import { supabase } from '@/lib/supabase'

/**
 * Fire-and-forget trigger for the send-welcome-email edge function, called
 * right after email verification and opportunistically again on later
 * logins (see AuthCallbackPage.tsx and useAuth.tsx) so a first attempt
 * that didn't complete gets a silent retry. supabase-js automatically
 * attaches the current session's access token as the Authorization
 * header — no body is sent, since the function derives the user's
 * identity from that token server-side and never trusts a client-supplied
 * email or user id.
 *
 * Every failure mode (network error, non-2xx response, function down) is
 * swallowed here: the welcome email is a nice-to-have, never something
 * that should surface an error to the user or affect the auth flow.
 *
 * Deduped per user id for the lifetime of this module (i.e. per page
 * load) so React Strict Mode's deliberate double-invoke of effects, or
 * multiple components mounting around the same auth state change, can't
 * fire redundant network requests — this is a client-side courtesy only,
 * not the real duplicate-prevention, which is the edge function's own
 * atomic database claim on profiles.welcome_email_sent_at.
 */
const attemptedUserIds = new Set<string>()

export function triggerWelcomeEmailOnce(userId: string): void {
  if (attemptedUserIds.has(userId)) return
  attemptedUserIds.add(userId)

  void supabase.functions.invoke('send-welcome-email').catch(() => {
    // Intentionally silent — see module doc comment above.
  })
}
