// Sends the "Your MyRecruiterCheck password was changed" security notice.
// Triggered by a Supabase Database Webhook on `auth.users` UPDATE (see
// BREVO_SETUP.md) — same non-JWT shared-secret auth as send-welcome-email.
//
// No persistent idempotency claim here: unlike the welcome email, a
// duplicate delivery of a "your password changed" notice is not harmful
// (it's a factual security notice, not a one-time onboarding moment), and
// each real password change is its own distinct row update, so Postgres
// only fires this webhook once per actual change in the normal case.

import { didPasswordChange, extractUser, type AuthUserWebhookPayload } from './logic.ts'
import { buildPasswordChangedEmail } from '../_shared/email/templates.ts'
import { sendTransactionalEmail } from '../_shared/email/brevoClient.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const expectedSecret = Deno.env.get('WEBHOOK_SECRET')
  const providedSecret = req.headers.get('x-webhook-secret')
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: AuthUserWebhookPayload
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  if (!didPasswordChange(payload)) {
    return new Response(JSON.stringify({ skipped: 'not a password change' }), { status: 200 })
  }

  const user = extractUser(payload)
  if (!user) {
    return new Response(JSON.stringify({ skipped: 'missing id or email' }), { status: 200 })
  }

  const email = buildPasswordChangedEmail()

  const result = await sendTransactionalEmail({
    toEmail: user.email,
    subject: email.subject,
    htmlContent: email.html,
    textContent: email.text,
    // This is a security notice, so it belongs on the security sender rather
    // than the product one. Every other security email already sits there by
    // virtue of going through Supabase Auth's SMTP; this is the only one that
    // does not, because the app sends it directly. Falls back to the default
    // sender when the secret is unset, so nothing breaks before the split is
    // configured.
    senderEmail: Deno.env.get('BREVO_SECURITY_SENDER_EMAIL'),
  })

  if (!result.sent) {
    console.error('send-password-changed-email: send failed', { userId: user.id, reason: result.reason })
    return new Response('Send failed', { status: 502 })
  }

  return new Response(JSON.stringify({ sent: true }), { status: 200 })
})
