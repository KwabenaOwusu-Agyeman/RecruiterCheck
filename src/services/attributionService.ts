import { supabase } from '@/lib/supabase'
import { readFirstTouch } from '@/lib/attribution'

/**
 * Copies the visitor's stored first-touch attribution onto their own profile,
 * once, so a signup can later be credited to a channel.
 *
 * Deliberately written from the client through the existing "Users can update
 * own profile" policy rather than from the handle_new_user trigger. That
 * trigger runs on every single signup and is the highest blast radius function
 * in the system: a fault in it breaks registration outright. Here the worst
 * failure is a profile with no attribution, which costs a row in a report.
 *
 * Called opportunistically on every session start (see useAuth.tsx), which
 * covers all the ways a session can begin: immediate sign-up, sign-in after
 * confirming by email, and returning later. The `is null` filter means every
 * call after the first matches no rows.
 *
 * Three layers stop this being rewritable, which matters because the values
 * are client-supplied and attribution that can be changed at will is not
 * evidence of anything:
 *   1. the per-page-load Set below, which is only a courtesy against React
 *      Strict Mode double-invoking effects,
 *   2. the `acquisition_captured_at is null` filter on the update,
 *   3. the real guarantee: the profiles_protect_acquisition_fields trigger,
 *      which silently reverts any later change from a non-service-role caller.
 *
 * Every failure is swallowed. Attribution is a reporting nicety and must never
 * surface an error or affect the auth flow.
 */
const attemptedUserIds = new Set<string>()

export function recordAcquisitionOnce(userId: string): void {
  if (attemptedUserIds.has(userId)) return
  attemptedUserIds.add(userId)

  const firstTouch = readFirstTouch()
  // No stored attribution: a visitor whose storage was unavailable or cleared,
  // or who arrived before this shipped. Recorded as unattributed rather than
  // guessed at.
  if (!firstTouch) return

  void supabase
    .from('profiles')
    .update({
      acquisition_source: firstTouch.source,
      acquisition_medium: firstTouch.medium,
      acquisition_campaign: firstTouch.campaign,
      acquisition_landing_path: firstTouch.landingPath,
      acquisition_referrer_host: firstTouch.referrerHost,
      acquisition_captured_at: firstTouch.capturedAt,
    })
    .eq('id', userId)
    .is('acquisition_captured_at', null)
    .then(() => {
      // Intentionally silent, success or failure alike. See the doc comment.
    })
}
