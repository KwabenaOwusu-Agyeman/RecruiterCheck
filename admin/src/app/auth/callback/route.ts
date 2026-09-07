import { redirect } from 'next/navigation'
import { sessionClient } from '@/server/supabase'
import { safeRedirectTarget } from '@/lib/redirectTarget'

// OAuth code-exchange endpoint, the return leg of "Continue with Google".
//
// Supabase sends the browser back here with a short-lived `code`, which is
// exchanged for a session using the PKCE verifier that signInWithGoogleAction
// stored in a cookie. The code alone is useless without it.
//
// It mirrors auth/confirm/route.ts deliberately, including what it does NOT do:
//
//  * It grants no admin access. Completing this proves control of a Google
//    account and nothing more; requireAdmin() still checks the allowlist on the
//    next request, so signing in with a non-admin Google account lands on the
//    "not an administrator" screen.
//  * It does not accept an arbitrary redirect target. `next` goes through
//    safeRedirectTarget, so the endpoint cannot be used as an open redirect to
//    bounce a freshly signed-in admin to an attacker's page.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeRedirectTarget(url.searchParams.get('next'))

  // Supabase reports a refused or cancelled consent screen as an error on the
  // query string rather than as a missing code.
  if (url.searchParams.get('error') || !code) {
    // No detail. Whether the user cancelled, the code expired or the provider
    // failed is not something to tell an unauthenticated caller.
    redirect('/login')
  }

  const supabase = await sessionClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    redirect('/login')
  }

  redirect(next)
}
