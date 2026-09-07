import { redirect } from 'next/navigation'
import type { EmailOtpType } from '@supabase/supabase-js'
import { sessionClient } from '@/server/supabase'
import { safeRedirectTarget } from '@/lib/redirectTarget'

// Standard Supabase email-OTP confirmation endpoint.
//
// It exchanges a single-use token_hash for a session. Two things it
// deliberately does not do:
//
//  * It does not grant admin access. Completing this only proves control of the
//    mailbox; requireAdmin() still checks the allowlist on the next request, so
//    a link sent to a non-admin account signs that person in and shows them the
//    "not an administrator" screen.
//  * It does not accept an arbitrary redirect target. `next` goes through
//    safeRedirectTarget, so the endpoint cannot be used as an open redirect to
//    bounce someone to an attacker's page carrying the session in the referrer.
//    That rule is shared with auth/callback/route.ts rather than written twice,
//    because a redirect rule enforced in one route and forgotten in the other
//    is the usual way an open redirect comes back.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null

  const next = safeRedirectTarget(url.searchParams.get('next'))

  if (!tokenHash || !type) {
    redirect('/login?denied=not_on_allowlist')
  }

  const supabase = await sessionClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  if (error) {
    // No detail: whether the token was wrong, used or expired is not something
    // to tell an unauthenticated caller.
    redirect('/login')
  }

  redirect(next)
}
