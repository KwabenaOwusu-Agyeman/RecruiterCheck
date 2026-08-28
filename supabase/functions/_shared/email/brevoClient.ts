// Thin, server-only Brevo transactional-email sender shared by every
// app-triggered email (welcome, password-changed). Never imported by
// client code — this file only runs inside Supabase edge functions, where
// BREVO_API_KEY lives as a function secret and is never bundled into the
// browser app. Mirrors the direct-fetch pattern already used by
// analyze-check/trustpilot-email.ts rather than pulling in a Brevo SDK,
// so there is exactly one way this codebase talks to Brevo.

export interface BrevoSendParams {
  toEmail: string
  toName?: string | null
  subject: string
  htmlContent: string
  textContent: string
}

export interface BrevoSendResult {
  sent: boolean
  /** Reason a send was skipped or failed, safe to log (never the API key or full link). */
  reason?: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value: string): boolean {
  return typeof value === 'string' && value.length <= 254 && EMAIL_PATTERN.test(value)
}

/**
 * Sends one transactional email via the Brevo API. Returns a result object
 * instead of throwing so a failed send never surfaces the API key or a
 * complete authentication link in an error that bubbles up to logs.
 */
export async function sendTransactionalEmail(params: BrevoSendParams): Promise<BrevoSendResult> {
  const apiKey = Deno.env.get('BREVO_API_KEY')
  if (!apiKey) {
    return { sent: false, reason: 'BREVO_API_KEY not set' }
  }

  if (!isValidEmail(params.toEmail)) {
    return { sent: false, reason: 'invalid recipient address' }
  }

  const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL') ?? 'notifications@myrecruitercheck.com'
  const senderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'MyRecruiterCheck'

  // Without this every reply goes back to the no-reply-ish notifications@
  // address. Driven by a secret rather than hardcoded so the address can be
  // set (or changed) without a redeploy, and omitted entirely when unset so
  // behaviour is unchanged until someone opts in with a real, monitored
  // mailbox. A Reply-To pointing at an unread inbox is worse than none.
  const replyToEmail = Deno.env.get('BREVO_REPLY_TO_EMAIL')

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: params.toEmail, name: params.toName ?? undefined }],
        ...(replyToEmail && isValidEmail(replyToEmail)
          ? { replyTo: { email: replyToEmail, name: senderName } }
          : {}),
        subject: params.subject,
        htmlContent: params.htmlContent,
        textContent: params.textContent,
      }),
    })

    if (!response.ok) {
      // Status only — Brevo error bodies can echo back request fields, and
      // this never includes params.htmlContent (which carries the link).
      return { sent: false, reason: `Brevo responded ${response.status}` }
    }

    return { sent: true }
  } catch (error) {
    return { sent: false, reason: `network error: ${error instanceof Error ? error.name : 'unknown'}` }
  }
}
