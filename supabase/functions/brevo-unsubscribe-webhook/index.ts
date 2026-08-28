// Keeps public.newsletter_subscribers in step with Brevo.
//
// Brevo owns the sending list, so an unsubscribe (or a spam complaint, block,
// or hard bounce) happens there, not in our app. Without this, our table would
// still say `active` and the next export would mail someone who opted out —
// a silent failure with real legal weight. The reverse direction is already
// covered: our own /newsletter/unsubscribe page writes to the table directly.
//
// Auth: verify_jwt = false, because Brevo cannot present a Supabase JWT.
// The caller proves itself with the shared WEBHOOK_SECRET, accepted EITHER as
// the x-webhook-secret header (matching send-password-changed-email) OR as a
// ?secret= query parameter. The query form exists because Brevo's webhook
// configuration does not reliably allow custom request headers, and a webhook
// that cannot authenticate is a webhook that cannot be used.
//
// A secret in a URL is weaker than a header (it can surface in logs), which is
// why the handler is also deliberately narrow: it only ever flips an already
// active subscriber to unsubscribed. Worst case for a leaked URL is that
// someone unsubscribes an address they already know, never data disclosure.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { parseUnsubscribeEvent, type BrevoWebhookPayload } from './logic.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const expectedSecret = Deno.env.get('WEBHOOK_SECRET')
  const headerSecret = req.headers.get('x-webhook-secret')
  const querySecret = new URL(req.url).searchParams.get('secret')
  const providedSecret = headerSecret ?? querySecret
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: BrevoWebhookPayload
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const parsed = parseUnsubscribeEvent(payload)

  // Always 200 for events we simply do not act on — a non-2xx would make
  // Brevo retry an event that will never succeed.
  if (!parsed.shouldUnsubscribe || !parsed.email) {
    return new Response(JSON.stringify({ ok: true, skipped: parsed.reason }), { status: 200 })
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Only flips rows that are still active, so a repeated webhook cannot
  // overwrite the original unsubscribed_at timestamp.
  const { error } = await adminClient
    .from('newsletter_subscribers')
    .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
    .eq('email', parsed.email)
    .eq('status', 'active')

  if (error) {
    console.error('brevo-unsubscribe-webhook: update failed', { code: error.code, event: parsed.reason })
    return new Response('Update failed', { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true, event: parsed.reason }), { status: 200 })
})
